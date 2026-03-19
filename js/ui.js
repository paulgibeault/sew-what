/* ============================================================
   Thread & Template — UI Layer
   Manages header, navigation tabs, and modal overlays
   ============================================================ */

import { SCREEN } from './constants.js';

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
    tab.classList.toggle('active', id === screenId);
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
