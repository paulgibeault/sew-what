/* ============================================================
   Thread & Template — Assembly Step Engine
   Drives the assembly step sequence, tracks completion/scores
   ============================================================ */

import { deepClone } from '../utils.js';

/**
 * Create a fresh assembly state from step definitions.
 * @param {Array} stepDefs - Array of step definition objects
 * @returns {object} assemblyState
 */
export function createAssemblyState(stepDefs) {
  return {
    steps: stepDefs.map(def => ({
      ...deepClone(def),
      completed: false,
      score: 0,
    })),
    currentStepIndex: 0,
  };
}

/**
 * Get the current step.
 */
export function getCurrentStep(assemblyState) {
  if (!assemblyState) return null;
  return assemblyState.steps[assemblyState.currentStepIndex] || null;
}

/**
 * Complete the current step with a score and advance.
 * @returns {object} updated assemblyState
 */
export function completeStep(assemblyState, score) {
  const state = deepClone(assemblyState);
  const step = state.steps[state.currentStepIndex];
  if (step) {
    step.completed = true;
    step.score = score;
  }
  state.currentStepIndex = Math.min(state.currentStepIndex + 1, state.steps.length);
  return state;
}

/**
 * Check if all steps are done.
 */
export function isAssemblyComplete(assemblyState) {
  return assemblyState.currentStepIndex >= assemblyState.steps.length;
}

/**
 * Get average score across completed steps.
 */
export function getAverageScore(assemblyState) {
  const completed = assemblyState.steps.filter(s => s.completed);
  if (completed.length === 0) return 0;
  return completed.reduce((sum, s) => sum + s.score, 0) / completed.length;
}
