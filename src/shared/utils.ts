import { STORAGE_KEYS } from './constants';

let isDebug = false;

chrome.storage.local.get([STORAGE_KEYS.DEBUG_MODE], (res) => {
  isDebug = !!res[STORAGE_KEYS.DEBUG_MODE];
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.DEBUG_MODE]) {
    isDebug = !!changes[STORAGE_KEYS.DEBUG_MODE].newValue;
  }
});

export const logger = {
  log(...args: unknown[]) {
    if (isDebug) {
      console.log('[gemmy]', ...args);
    }
  },
  error(...args: unknown[]) {
    if (isDebug) {
      console.error('[gemmy]', ...args);
    }
  },
  warn(...args: unknown[]) {
    if (isDebug) {
      console.warn('[gemmy]', ...args);
    }
  }
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
