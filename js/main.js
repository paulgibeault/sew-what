/* ============================================================
   Thread & Template — Main Entry Point
   Game loop, initialization, and screen routing
   ============================================================ */

import { SCREEN } from './constants.js';
import { getState, updateState, subscribe } from './state.js';
import { loadGame, autoSave } from './storage.js';
import { updateTweens, hasTweens } from './tween.js';
import { InputManager } from './input.js';
import { ScreenManager } from './screens/screen-manager.js';
import { initUI, onScreenChanged } from './ui.js';

// Screen modules
import * as inspirationScreen from './screens/inspiration-screen.js';
import * as queueScreen from './screens/queue-screen.js';
import * as draftingScreen from './screens/drafting-screen.js';
import * as materialScreen from './screens/material-screen.js';
import * as assemblyScreen from './screens/assembly-screen.js';

// --- Module-level State ---
let screenManager = null;
let inputManager = null;
let _dirty = true;
let _rafId = null;
let _lastTime = 0;

// --- Public: Mark frame as dirty (triggers re-render) ---
export function markDirty() {
  _dirty = true;
  _scheduleFrame();
}

// --- Initialization ---

function init() {
  // Try to load saved state
  loadGame();

  // Initialize screen manager
  const container = document.getElementById('screen-container');
  screenManager = new ScreenManager(container);

  // Register all screens
  screenManager.register(SCREEN.INSPIRATION, inspirationScreen);
  screenManager.register(SCREEN.QUEUE, queueScreen);
  screenManager.register(SCREEN.DRAFTING, draftingScreen);
  screenManager.register(SCREEN.MATERIAL, materialScreen);
  screenManager.register(SCREEN.ASSEMBLY, assemblyScreen);

  // Initialize UI (nav tabs)
  initUI({
    onScreenChange: switchScreen,
  });

  // Initialize input on the screen container
  inputManager = new InputManager(container);
  inputManager.on((event) => {
    screenManager.onInput(event);
    markDirty();
  });

  // Auto-save on state changes
  subscribe(() => {
    autoSave();
    markDirty();
  });

  // Handle window resize
  window.addEventListener('resize', _onResize);
  document.addEventListener('visibilitychange', _onVisibilityChange);

  // Switch to initial screen
  const state = getState();
  switchScreen(state.currentScreen || SCREEN.DRAFTING);

  // Start game loop
  _scheduleFrame();

  console.log('Thread & Template initialized');
}

// --- Screen Switching ---

function switchScreen(screenId) {
  screenManager.switchTo(screenId);
  updateState({ currentScreen: screenId });
  onScreenChanged(screenId);
  markDirty();
}

// --- Game Loop ---

function _scheduleFrame() {
  if (_rafId !== null) return;
  _rafId = requestAnimationFrame(_loop);
}

function _loop(timestamp) {
  _rafId = null;

  const dt = _lastTime > 0 ? timestamp - _lastTime : 16;
  _lastTime = timestamp;

  // Update tweens
  const tweensActive = updateTweens(timestamp);

  // Update active screen
  screenManager.update(dt);

  // Reset dirty flag
  _dirty = false;

  // Continue loop if anything is animating
  if (tweensActive || _dirty) {
    _scheduleFrame();
  }
}

// --- Event Handlers ---

function _onResize() {
  screenManager.onResize();
  markDirty();
}

function _onVisibilityChange() {
  if (document.hidden) {
    // Pause: reset lastTime so we don't get a huge dt spike
    _lastTime = 0;
  } else {
    markDirty();
  }
}

// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', init);
