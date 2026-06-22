import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants';

const triggerKeyInput = document.getElementById('trigger-key-input') as HTMLInputElement;
const chunkSizeInput = document.getElementById('chunk-size-input') as HTMLInputElement;
const debugModeCheckbox = document.getElementById('debug-mode-checkbox') as HTMLInputElement;

async function loadSettings() {
  chrome.storage.local.get([
    STORAGE_KEYS.TRIGGER_KEY,
    STORAGE_KEYS.CHUNK_SIZE,
    STORAGE_KEYS.DEBUG_MODE
  ], (res) => {
    const triggerVal = res[STORAGE_KEYS.TRIGGER_KEY];
    triggerKeyInput.value = (typeof triggerVal === 'string' ? triggerVal : DEFAULT_SETTINGS.TRIGGER_KEY).toUpperCase();
    chunkSizeInput.value = String(res[STORAGE_KEYS.CHUNK_SIZE] ?? DEFAULT_SETTINGS.CHUNK_SIZE);
    debugModeCheckbox.checked = !!res[STORAGE_KEYS.DEBUG_MODE];
  });
}

function autoSaveSettings() {
  const triggerVal = triggerKeyInput.value.trim().toLowerCase() || DEFAULT_SETTINGS.TRIGGER_KEY;
  const chunkVal = Math.max(1, parseInt(chunkSizeInput.value, 10) || DEFAULT_SETTINGS.CHUNK_SIZE);
  const debugVal = debugModeCheckbox.checked;

  chrome.storage.local.set({
    [STORAGE_KEYS.TRIGGER_KEY]: triggerVal,
    [STORAGE_KEYS.CHUNK_SIZE]: chunkVal,
    [STORAGE_KEYS.DEBUG_MODE]: debugVal
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
debugModeCheckbox.addEventListener('change', autoSaveSettings);
chunkSizeInput.addEventListener('input', autoSaveSettings);
triggerKeyInput.addEventListener('input', () => {
  if (triggerKeyInput.value.length > 1) {
    triggerKeyInput.value = triggerKeyInput.value.charAt(0);
  }
  triggerKeyInput.value = triggerKeyInput.value.toUpperCase();
  autoSaveSettings();
});
