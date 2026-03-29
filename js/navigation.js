/* ============================================================
   Thread & Template — Navigation
   Screen routing with stage-based guards
   ============================================================ */

import { SCREEN, STAGE } from './constants.js';
import { getState, updateState } from './state.js';
import { showToast } from './ui.js';

let _switchFn = null;

/**
 * Wire up the internal switchScreen function from main.js.
 */
export function initNavigation(switchScreenFn) {
  _switchFn = switchScreenFn;
}

/**
 * Navigate to a screen, enforcing stage gates.
 * Any module can import and call this.
 */
export function navigateTo(screenId) {
  const state = getState();
  const ap = state.activeProject;

  // Stage gates
  if (screenId === SCREEN.MATERIAL) {
    if (!ap || !ap.pattern || !ap.pattern.validated) {
      showToast('Validate your pattern in Drafting first', 'warning');
      return;
    }
  }

  if (screenId === SCREEN.ASSEMBLY) {
    if (!ap || !ap.materialLayout) {
      showToast('Complete the fabric layout first', 'warning');
      return;
    }
  }

  if (_switchFn) {
    _switchFn(screenId);
  }
}
