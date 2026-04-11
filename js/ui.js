/* ============================================================
   Thread & Template — UI Layer
   Manages header, navigation tabs, and modal overlays
   ============================================================ */

import { SCREEN, STAGE } from './constants.js';
import { getState } from './state.js';

let _onScreenChange = null;

/**
 * Initialize the UI layer.
 * @param {object} options
 * @param {function} options.onScreenChange - Called with screen ID when nav tab is tapped
 */
export function initUI({ onScreenChange }) {
  _onScreenChange = onScreenChange;
  _bindNavTabs();
}

/**
 * Set the active nav tab visually.
 * @param {string} screenId - The screen ID to mark as active
 */
export function setActiveTab(screenId) {
  const tabs = document.querySelectorAll('.nav-tab');
  for (const tab of tabs) {
    const id = tab.getAttribute('data-screen');
    const isActive = id === screenId;
    tab.classList.toggle('active', isActive);
    // Communicate current page to screen readers
    if (isActive) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
}

/**
 * Update the header subtitle text.
 * @param {string} text
 */
export function setSubtitle(text) {
  const el = document.querySelector('.app-subtitle');
  if (el) el.textContent = text;
}

/**
 * Show a brief notification toast.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} durationMs
 */
export function showToast(message, type = 'info', durationMs = 2500) {
  // Remove any existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: var(--border-radius);
    font-size: 13px;
    font-family: var(--font-main);
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease-out;
    background: var(--color-bg-elevated);
    color: var(--color-text);
    border: 1px solid var(--color-${type === 'info' ? 'info' : type});
  `;

  document.body.appendChild(toast);

  // Announce to screen readers via the aria-live region
  const announcer = document.getElementById('a11y-announcer');
  if (announcer) {
    // Clear first so repeated identical messages still re-announce
    announcer.textContent = '';
    // Use rAF to ensure the DOM change is observed by the AT
    requestAnimationFrame(() => { announcer.textContent = message; });
  }

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}

// --- Screen subtitles ---
const SCREEN_SUBTITLES = {
  [SCREEN.INSPIRATION]: 'Inspiration Board',
  [SCREEN.QUEUE]:       'Sewing Queue',
  [SCREEN.DRAFTING]:    'Parametric Drafting',
  [SCREEN.MATERIAL]:    'Material Architecture',
  [SCREEN.ASSEMBLY]:    'Construction Puzzles',
};

/**
 * Update UI to reflect screen change.
 */
export function onScreenChanged(screenId) {
  setActiveTab(screenId);
  setSubtitle(SCREEN_SUBTITLES[screenId] || 'Parametric Couture Studio');
  updateTabLocks();
}

/**
 * Update nav tab locked/unlocked visual state based on active project stage.
 * Exported so screens can refresh lock state after in-screen validation changes.
 */
export function updateTabLocks() {
  const state = getState();
  const ap = state.activeProject;

  const tabs = document.querySelectorAll('.nav-tab');
  for (const tab of tabs) {
    const screenId = tab.getAttribute('data-screen');
    let locked = false;

    if (screenId === SCREEN.MATERIAL) {
      // Material unlocks once pattern is validated — works with or without activeProject
      locked = !ap || !ap.pattern || !ap.pattern.validated;
    } else if (screenId === SCREEN.ASSEMBLY) {
      locked = !ap || !ap.materialLayout;
    }

    tab.classList.toggle('locked', locked);
  }
}

// --- Internal ---

function _bindNavTabs() {
  const nav = document.getElementById('app-nav');
  if (!nav) return;

  nav.addEventListener('pointerup', (e) => {
    const tab = e.target.closest('.nav-tab');
    if (!tab) return;

    const screenId = tab.getAttribute('data-screen');
    if (screenId && _onScreenChange) {
      _onScreenChange(screenId);
    }
  });
}
