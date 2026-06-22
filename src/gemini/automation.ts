import { logger, sleep } from '../shared/utils';

logger.log('Gemini client script loaded on', window.location.href);

// listen for solve message from background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ status: 'pong' });
    return;
  }
  if (message.action === 'inputPrompt') {
    handlePromptAutomation(message.promptText, message.files)
      .catch((err) => {
        logger.error('Error running prompt automation:', err);
      });
    sendResponse({ status: 'started' });
    return;
  }
});

interface PromptFile {
  questionId: string;
  name: string;
  type: string;
  base64: string;
}

async function handlePromptAutomation(promptText: string, files: PromptFile[]) {
  logger.log('Initializing Gemini automation. Loading elements...');

  // wait for input textbox to be available (up to 15 seconds)
  const textbox = await waitForElement<HTMLDivElement>('div[role="textbox"]', 15000);
  logger.log('Found textbox:', textbox);

  // upload files if any (via paste simulation or native input)
  if (files && files.length > 0) {
    textbox.focus();
    await sleep(500);

    for (const fileData of files) {
      try {
        logger.log(`Processing asset: ${fileData.name}`);
        const byteCharacters = atob(fileData.base64);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const decodedName = decodeURIComponent(fileData.name);
        const file = new File([byteNumbers], decodedName, { type: fileData.type });

        // strategy 1: find hidden file input and set files directly
        const fileInput = querySelectorDeep('input[type="file"]') as HTMLInputElement;
        if (fileInput) {
          const dt = new DataTransfer();
          dt.items.add(file);
          const nativeFileInput = fileInput;
          Object.defineProperty(nativeFileInput, 'files', {
            value: dt.files,
            writable: false,
            configurable: true
          });
          nativeFileInput.dispatchEvent(new Event('change', { bubbles: true }));
          logger.log(`Attached via file input: ${decodedName}`);
          await sleep(3000);
        } else {
          // strategy 2: simulate paste event
          const dt = new DataTransfer();
          dt.items.add(file);
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: dt
          });
          textbox.dispatchEvent(pasteEvent);
          logger.log(`Attached via paste event: ${decodedName}`);
          await sleep(3000);
        }
      } catch (err) {
        logger.error(`Failed to process asset ${fileData.name}:`, err);
      }
    }
  }

  // focus textbox and input prompt text
  textbox.focus();

  // set innerText and trigger input events to ensure page registers text
  textbox.innerText = promptText;
  textbox.dispatchEvent(new Event('input', { bubbles: true }));
  textbox.dispatchEvent(new Event('change', { bubbles: true }));

  await sleep(800);

  // count current response elements before sending
  const responseEls = querySelectorAllDeep('message-content, .model-response, .conversation-reply');
  const initialCount = responseEls.length;
  logger.log('Initial response count:', initialCount);

  // click send button
  const sendButton = await findSendButton();
  if (!sendButton) {
    throw new Error('Send/Submit button could not be resolved in the Gemini page.');
  }

  logger.log('Clicking Send button:', sendButton);
  sendButton.click();

  // wait for the new response card to appear in the DOM
  logger.log('Waiting for new response card to appear...');
  let lastResponse: HTMLElement | null = null;
  const timeoutMs = 20000;
  let elapsed = 0;
  const pollInterval = 500;

  while (elapsed < timeoutMs) {
    const currentResponseEls = querySelectorAllDeep('message-content, .model-response, .conversation-reply');
    if (currentResponseEls.length > initialCount) {
      lastResponse = currentResponseEls[currentResponseEls.length - 1] as HTMLElement;
      break;
    }
    await sleep(pollInterval);
    elapsed += pollInterval;
  }

  if (!lastResponse) {
    logger.warn('New response card not detected via query. Using last available card.');
    const finalCheckEls = querySelectorAllDeep('message-content, .model-response, .conversation-reply');
    if (finalCheckEls.length > 0) {
      lastResponse = finalCheckEls[finalCheckEls.length - 1] as HTMLElement;
    }
  }

  logger.log('New response card resolved:', lastResponse);
  logger.log('Sent prompt. Waiting for response to stream and complete...');
  await monitorResponseComplete(lastResponse);
}

/**
 * polls DOM until the response streaming is completed
 * by verifying that progress indicators are gone and the text length has stabilized
 */
async function monitorResponseComplete(lastResponse: HTMLElement | null) {
  let prevTextLength = 0;
  let consecutiveSameLength = 0;
  let hasStartedGenerating = false;

  const maxWaitTime = 90000;
  let elapsed = 0;
  const checkInterval = 1000;

  while (elapsed < maxWaitTime) {
    await sleep(checkInterval);
    elapsed += checkInterval;

    // check generating indicators
    const hasStopBtn = !!querySelectorDeep('button[aria-label*="Stop" i]') || !!querySelectorDeep('button[aria-label*="Cancel" i]');
    const hasProgress = !!querySelectorDeep('mat-progress-bar') ||
      !!querySelectorDeep('.generating') ||
      !!querySelectorDeep('.typing') ||
      !!querySelectorDeep('.loading-spinner');
    const isGenerating = hasStopBtn || hasProgress;

    if (isGenerating) {
      hasStartedGenerating = true;
    }

    // check text length changes
    const currentText = lastResponse ? (lastResponse.textContent || '').trim() : '';
    const currentTextLength = currentText.length;

    logger.log(`Monitoring response: length=${currentTextLength}, generating=${isGenerating}, started=${hasStartedGenerating}, stableSeconds=${consecutiveSameLength}`);

    if (currentTextLength > 0) {
      if (currentTextLength === prevTextLength) {
        consecutiveSameLength++;
      } else {
        consecutiveSameLength = 0;
      }
    }

    prevTextLength = currentTextLength;

    // completion condition:
    // 1. generation has started (or text exists), isGenerating is false, and text length remains identical
    if (hasStartedGenerating || currentTextLength > 50) {
      if (!isGenerating && consecutiveSameLength >= 2) {
        logger.log('Response stream completed successfully.');
        break;
      }
    } else {
      // fallback if no generation indicators were detected, but text has stabilized
      if (elapsed > 15000 && !isGenerating && consecutiveSameLength >= 3) {
        logger.log('Generation indicators absent, but text length stabilized.');
        break;
      }
    }
  }

  await sleep(1000);

  const finalResponseEls = querySelectorAllDeep('message-content, .model-response, .conversation-reply');
  const finalCard = finalResponseEls.length > 0
    ? (finalResponseEls[finalResponseEls.length - 1] as HTMLElement)
    : lastResponse;

  const text = finalCard ? finalCard.textContent || '' : '';
  sendSolution(text);
}

function sendSolution(text: string) {
  logger.log('Successfully read solution text. Sending to background service worker.');
  chrome.runtime.sendMessage({
    action: 'solutionReady',
    responseText: text
  });
}

async function findSendButton(): Promise<HTMLButtonElement | null> {
  const selectors = [
    'button[aria-label="Send message"]',
    'button[aria-label*="Send" i]',
    '.send-button'
  ];

  for (const sel of selectors) {
    const el = querySelectorDeep(sel) as HTMLButtonElement;
    if (el) return el;
  }

  // fallback: look for button with send icon or label text
  const buttons = querySelectorAllDeep('button') as HTMLButtonElement[];
  for (const b of buttons) {
    const aria = b.getAttribute('aria-label') || '';
    if (aria.toLowerCase().includes('send')) return b;
  }

  return null;
}

function waitForElement<T extends Element>(selector: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const existing = querySelectorDeep(selector) as unknown as T;
    if (existing) return resolve(existing);

    let elapsed = 0;
    const interval = 250;
    const timer = setInterval(() => {
      const el = querySelectorDeep(selector) as unknown as T;
      if (el) {
        clearInterval(timer);
        resolve(el);
      }
      elapsed += interval;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }
    }, interval);
  });
}

function querySelectorAllDeep(selector: string, root: Document | Element | ShadowRoot = document): Element[] {
  const elements: Element[] = [];

  const matches = root.querySelectorAll(selector);
  elements.push(...Array.from(matches));

  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      elements.push(...querySelectorAllDeep(selector, el.shadowRoot));
    }
  }

  return elements;
}

function querySelectorDeep(selector: string, root: Document | Element | ShadowRoot = document): HTMLElement | null {
  const matched = root.querySelector(selector);
  if (matched) return matched as HTMLElement;

  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      const found = querySelectorDeep(selector, el.shadowRoot);
      if (found) return found;
    }
  }

  return null;
}
