/* ============================================================
   Thread & Template — Scoring & Grading
   Final score calculation from three sub-scores
   ============================================================ */

import { SCORING } from './constants.js';

/**
 * Calculate the final weighted score.
 * @param {{ accuracy: number, efficiency: number, craftsmanship: number }} scores - each 0.0–1.0
 * @returns {number} 0.0–1.0
 */
export function calculateFinalScore(scores) {
  const raw = scores.accuracy * 0.3 + scores.efficiency * 0.2 + scores.craftsmanship * 0.5;
  return Math.round(raw * 100) / 100;
}

/**
 * Map a final score to a letter grade.
 * @param {number} score - 0.0–1.0
 * @returns {string} 'A' | 'B' | 'C' | 'F'
 */
export function getGrade(score) {
  if (score >= SCORING.GRADE_A_THRESHOLD) return 'A';
  if (score >= SCORING.GRADE_B_THRESHOLD) return 'B';
  if (score >= SCORING.GRADE_C_THRESHOLD) return 'C';
  return 'F';
}
