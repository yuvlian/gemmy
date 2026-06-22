import { Quiz, SuggestedAnswer } from '../shared/types';
import { buildPrompt } from '../gemini/prompt';
import { parseResponse } from '../gemini/parser';
import { GEMINI_URLS, STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';
import { logger, sleep } from '../shared/utils';

interface SessionResponse {
  answers?: SuggestedAnswer[];
  error?: string;
}

interface SolverSession {
  quizTabId: number;
  geminiTabId?: number;
  sendResponse: (response: SessionResponse) => void;
  timer: ReturnType<typeof setTimeout> | number;
  accumulatedAnswers: SuggestedAnswer[];
  currentChunk: number;
}

const activeSessions = new Map<string, SolverSession>();
const pendingSolutions = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'solveQuiz') {
    const quizTabId = sender.tab?.id;
    if (!quizTabId) {
      sendResponse({ error: 'Solve request must originate from a browser tab.' });
      return;
    }
    startSolvingSession(message.quiz, quizTabId, sender.tab?.url, sendResponse);
    return true; // keep message channel open
  }

  if (message.action === 'solutionReady') {
    const geminiTabId = sender.tab?.id;
    if (geminiTabId && pendingSolutions.has(geminiTabId)) {
      const { resolve } = pendingSolutions.get(geminiTabId)!;
      pendingSolutions.delete(geminiTabId);
      resolve(message.responseText);
    }
    return;
  }
});

function waitForSolution(geminiTabId: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingSolutions.set(geminiTabId, { resolve, reject });
    setTimeout(() => {
      if (pendingSolutions.has(geminiTabId)) {
        pendingSolutions.delete(geminiTabId);
        reject(new Error('Timeout waiting for Gemini response.'));
      }
    }, timeoutMs);
  });
}

async function fetchImageAsBase64(url: string): Promise<{ type: string; base64: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // conv arrayBuffer to binary string chunk by chunk cuz stack overflow
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return {
      type: blob.type || 'image/png',
      base64
    };
  } catch (err) {
    logger.warn('Failed to fetch image directly in background service worker:', url, err);
    return null;
  }
}

interface Base64File {
  questionId: string;
  name: string;
  type: string;
  base64: string;
}

async function loadChunkMedia(quiz: Quiz, quizTabUrl: string | undefined): Promise<{ base64Files: Base64File[]; fileUploadSuccess: Record<string, boolean> }> {
  const base64Files: Base64File[] = [];
  const fileUploadSuccess: Record<string, boolean> = {};

  async function loadMedia(questionId: string, mediaItems: { type: string; url: string; loaded?: boolean }[]) {
    for (const media of mediaItems) {
      if (media.type !== 'image') continue;
      try {
        let resolvedUrl = media.url;
        if (quizTabUrl && !media.url.startsWith('http://') && !media.url.startsWith('https://')) {
          resolvedUrl = new URL(media.url, quizTabUrl).href;
        }

        if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
          logger.log(`Fetching image asset: ${resolvedUrl}`);
          const res = await fetchImageAsBase64(resolvedUrl);
          if (res) {
            const fileName = decodeURIComponent(media.url.split(/[/\\]/).pop() || 'image.png');
            base64Files.push({ questionId, name: fileName, type: res.type, base64: res.base64 });
            media.loaded = true;
            fileUploadSuccess[`${questionId}-${fileName}`] = true;
          } else {
            media.loaded = false;
          }
        } else {
          media.loaded = false;
        }
      } catch (err) {
        logger.warn(`Failed to resolve/load media asset ${media.url}:`, err);
        media.loaded = false;
      }
    }
  }

  for (const question of quiz.questions) {
    await loadMedia(question.id, question.content.media || []);
    if (question.choices) {
      for (const choice of question.choices) {
        await loadMedia(question.id, choice.content.media || []);
      }
    }
  }

  return { base64Files, fileUploadSuccess };
}

async function startSolvingSession(quiz: Quiz, quizTabId: number, quizTabUrl: string | undefined, sendResponse: (res: SessionResponse) => void) {
  const sessionId = `session-${quizTabId}-${Date.now()}`;
  logger.log(`Starting solver session ${sessionId}`);

  // load settings
  const storage = await chrome.storage.local.get([STORAGE_KEYS.CHUNK_SIZE]);
  const rawChunkSize = storage[STORAGE_KEYS.CHUNK_SIZE];
  const chunkSize = typeof rawChunkSize === 'number' ? rawChunkSize : (parseInt(String(rawChunkSize), 10) || DEFAULT_SETTINGS.CHUNK_SIZE);

  const chunks: Quiz['questions'][] = [];
  for (let i = 0; i < quiz.questions.length; i += chunkSize) {
    chunks.push(quiz.questions.slice(i, i + chunkSize));
  }

  const totalChunks = chunks.length;
  logger.log(`Split ${quiz.questions.length} questions into ${totalChunks} chunks (chunkSize=${chunkSize})`);

  const totalTimeout = totalChunks * 120000;
  const timer = setTimeout(() => {
    const session = activeSessions.get(sessionId);
    if (session) {
      cleanupSession(sessionId);
      session.sendResponse({ error: 'Solving session timed out.' });
    }
  }, totalTimeout);

  const session: SolverSession = { quizTabId, sendResponse, timer, accumulatedAnswers: [], currentChunk: 0 };
  activeSessions.set(sessionId, session);

  try {
    const geminiTabId = await openGeminiTab();
    session.geminiTabId = geminiTabId;
    activeSessions.set(sessionId, session);

    await ensureContentScriptReady(geminiTabId);

    for (let ci = 0; ci < totalChunks; ci++) {
      const chunkQs = chunks[ci];
      session.currentChunk = ci;
      logger.log(`Processing chunk ${ci + 1}/${totalChunks} (${chunkQs.length} questions)`);

      const chunkQuiz: Quiz = { ...quiz, questions: chunkQs };

      // fetch online media
      const { base64Files, fileUploadSuccess } = await loadChunkMedia(chunkQuiz, quizTabUrl);

      const promptText = buildPrompt(chunkQuiz, fileUploadSuccess);

      logger.log(`Sending chunk ${ci + 1} to Gemini tab.`);
      chrome.tabs.sendMessage(geminiTabId, {
        action: 'inputPrompt',
        promptText,
        files: base64Files
      }).catch((err) => {
        logger.error('Error sending message to Gemini content script:', err);
      });

      const responseText = await waitForSolution(geminiTabId, 120000);
      const chunkAnswers = parseResponse(responseText);
      session.accumulatedAnswers.push(...chunkAnswers);
      logger.log(`Chunk ${ci + 1} done: ${chunkAnswers.length} answers parsed.`);
    }

    logger.log(`All ${totalChunks} chunks completed. Total answers: ${session.accumulatedAnswers.length}`);
    cleanupSession(sessionId);
    sendResponse({ answers: session.accumulatedAnswers });

  } catch (err: unknown) {
    cleanupSession(sessionId);
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Solving session failed:', err);
    sendResponse({ error: errMsg || 'Background processing failed.' });
  }
}

async function openGeminiTab(): Promise<number> {
  const existingTabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
  if (existingTabs.length > 0 && existingTabs[0].id) {
    const tabId = existingTabs[0].id;
    logger.log(`Reusing existing Gemini tab ID: ${tabId}`);
    await chrome.tabs.reload(tabId);
    await waitForTabComplete(tabId);
    return tabId;
  }

  logger.log('Creating new background Gemini tab.');
  const newTab = await chrome.tabs.create({ url: GEMINI_URLS.APP, active: false });
  if (!newTab.id) throw new Error('Failed to create Gemini tab.');
  await waitForTabComplete(newTab.id);
  return newTab.id;
}

function cleanupSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    clearTimeout(session.timer);
    activeSessions.delete(sessionId);
  }
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete') { resolve(); return; }
      const listener = (tid: number, changeInfo: { status?: string }) => {
        if (tid === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function ensureContentScriptReady(tabId: number, maxRetries = 20): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(res);
        });
      });
      if (response && (response as { status?: string }).status === 'pong') {
        logger.log(`Handshake successful on tab ${tabId}`);
        return;
      }
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error('Content script failed to initialize on the Gemini page.');
}
