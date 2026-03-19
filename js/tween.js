/* ============================================================
   Thread & Template — Tween Animation System
   ============================================================ */

import { ANIM } from './constants.js';

// --- Easing Functions ---
export const ease = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => t * (2 - t),
  easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutBack: t => {
    const s = 1.70158;
    return (t -= 1) * t * ((s + 1) * t + s) + 1;
  },
};

// Active tweens
const activeTweens = new Set();

/**
 * Create a new tween.
 * @param {object} target - Object whose properties will be animated
 * @param {object} to - Target property values
 * @param {object} [options]
 * @param {number} [options.duration] - Duration in ms
 * @param {function} [options.easing] - Easing function
 * @param {number} [options.delay] - Delay before start in ms
 * @param {function} [options.onUpdate] - Called each frame with progress 0-1
 * @param {function} [options.onComplete] - Called when tween finishes
 * @returns {object} Tween handle with cancel() method
 */
export function tween(target, to, options = {}) {
  const {
    duration = ANIM.TWEEN_DEFAULT_MS,
    easing = ease.easeOut,
    delay = 0,
    onUpdate = null,
    onComplete = null,
  } = options;

  const from = {};
  for (const key in to) {
    from[key] = target[key];
  }

  const tw = {
    target,
    from,
    to,
    duration,
    easing,
    delay,
    onUpdate,
    onComplete,
    startTime: -1,
    cancelled: false,
  };

  const handle = {
    cancel() {
      tw.cancelled = true;
      activeTweens.delete(tw);
    },
    get done() {
      return tw.cancelled || !activeTweens.has(tw);
    },
  };

  activeTweens.add(tw);
  return handle;
}

/**
 * Update all active tweens. Call once per frame.
 * @param {number} now - Current timestamp in ms
 * @returns {boolean} True if any tweens are still active
 */
export function updateTweens(now) {
  for (const tw of activeTweens) {
    if (tw.cancelled) {
      activeTweens.delete(tw);
      continue;
    }

    // Initialize start time on first update
    if (tw.startTime < 0) {
      tw.startTime = now + tw.delay;
    }

    // Still in delay period
    if (now < tw.startTime) continue;

    const elapsed = now - tw.startTime;
    const rawProgress = Math.min(elapsed / tw.duration, 1);
    const progress = tw.easing(rawProgress);

    // Interpolate properties
    for (const key in tw.to) {
      tw.target[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * progress;
    }

    if (tw.onUpdate) tw.onUpdate(rawProgress);

    if (rawProgress >= 1) {
      activeTweens.delete(tw);
      if (tw.onComplete) tw.onComplete();
    }
  }

  return activeTweens.size > 0;
}

/** Check if any tweens are running */
export function hasTweens() {
  return activeTweens.size > 0;
}

/** Cancel all active tweens */
export function cancelAllTweens() {
  activeTweens.clear();
}
