/* ============================================================
   Thread & Template — LocalStorage Persistence
   ============================================================ */

import { STORAGE } from './constants.js';
import { getState, setState } from './state.js';
import { debounce } from './utils.js';

/**
 * Save the current game state to localStorage.
 */
export function saveGame() {
  try {
    const state = getState();
    localStorage.setItem(STORAGE.GAME_STATE, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save game state:', err);
  }
}

/**
 * Load game state from localStorage. Returns true if state was restored.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE.GAME_STATE);
    if (!raw) return false;

    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      setState(saved);
      return true;
    }
  } catch (err) {
    console.warn('Failed to load game state:', err);
  }
  return false;
}

/**
 * Clear saved game state.
 */
export function clearGame() {
  try {
    localStorage.removeItem(STORAGE.GAME_STATE);
  } catch (err) {
    console.warn('Failed to clear game state:', err);
  }
}

/**
 * Save settings separately (for quick access).
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

/**
 * Load settings from localStorage.
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE.SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
  return null;
}

/**
 * Debounced auto-save — call after every state change.
 * Waits 500ms after the last change before writing.
 */
export const autoSave = debounce(saveGame, 500);
