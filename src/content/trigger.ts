import { parseQuizDOM } from './parser';
import { applyChoiceOverlays, clearOverlays, applyInputTooltips } from './overlay';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';
import { SuggestedAnswer } from '../shared/types';
import { logger } from '../shared/utils';

let triggerKey = DEFAULT_SETTINGS.TRIGGER_KEY;
let isPressed = false;

// load settings
chrome.storage.local.get([STORAGE_KEYS.TRIGGER_KEY], (res) => {
  const val = res[STORAGE_KEYS.TRIGGER_KEY];
  if (typeof val === 'string') {
    triggerKey = val.toLowerCase();
  }
});

// watch settings update
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.TRIGGER_KEY]) {
    const val = changes[STORAGE_KEYS.TRIGGER_KEY].newValue;
    if (typeof val === 'string') {
      triggerKey = val.toLowerCase();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key?.toLowerCase() === triggerKey) {
    isPressed = true;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key?.toLowerCase() === triggerKey) {
    isPressed = false;
  }
});

// intercept left clicks when key is pressed
document.addEventListener('click', (e) => {
  if (isPressed) {
    e.preventDefault();
    e.stopPropagation();
    startSolvingFlow();
  }
}, true);

async function startSolvingFlow() {
  logger.log('Triggered! Initializing solver flow.');

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    showError('Extension updated. Please refresh the page to continue.');
    return;
  }

  clearOverlays();

  try {
    const quiz = parseQuizDOM();
    logger.log('Extracted Quiz JSON:', quiz);

    chrome.runtime.sendMessage({ action: 'solveQuiz', quiz }, (response) => {
      if (chrome.runtime.lastError) {
        showError(`Extension communication failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!response) {
        showError('No response received from background solver.');
        return;
      }

      if (response.error) {
        showError(`Solver Error: ${response.error}`);
        return;
      }

      const answers: SuggestedAnswer[] = response.answers || [];
      logger.log('Received solved answers:', answers);

      if (answers.length === 0) {
        showError('No answers could be resolved.');
        return;
      }

      answers.forEach((ans) => {
        const questionObj = quiz.questions.find(q => q.id === ans.questionId);
        if (!questionObj) return;

        if (questionObj.kind === 'choice') {
          applyChoiceOverlays(ans.questionId, ans.answers);
        } else if (questionObj.kind === 'input' && questionObj.fields) {
          const fieldAnswers = questionObj.fields.map((f, idx) => ({
            fieldId: f.id,
            answer: ans.answers[idx] || ''
          }));
          applyInputTooltips(ans.questionId, fieldAnswers);
        }
      });
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    showError(`Failed to parse or solve quiz: ${errMsg}`);
  }
}

function showError(message: string) {
  logger.error(message);
  const p = document.createElement('p');
  p.textContent = message;
  p.style.position = 'fixed';
  p.style.bottom = '0px';
  p.style.left = '0px';
  p.style.backgroundColor = '#000';
  p.style.color = '#fff';
  p.style.padding = '8px';
  p.style.borderRadius = '4px';
  p.style.zIndex = '2147483647';
  p.style.opacity = '0.25';
  document.body.appendChild(p);
  setTimeout(() => {
    p.remove();
  }, 500);
}
// showError("Hello!! This is a super duper cool secret message omgggggggggggg !!!!!!!");
