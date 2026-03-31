/* ============================================================
   Tests — js/scoring.js
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// scoring.js has no DOM/state deps — import directly
import { calculateFinalScore, getGrade } from '../js/scoring.js';

// -------- calculateFinalScore --------

describe('calculateFinalScore', () => {
  test('perfect score on all three sub-scores returns 1.00', () => {
    const result = calculateFinalScore({ accuracy: 1, efficiency: 1, craftsmanship: 1 });
    assert.equal(result, 1.00);
  });

  test('zero on all sub-scores returns 0.00', () => {
    const result = calculateFinalScore({ accuracy: 0, efficiency: 0, craftsmanship: 0 });
    assert.equal(result, 0.00);
  });

  test('applies correct weights: accuracy=0.3, efficiency=0.2, craftsmanship=0.5', () => {
    // All accuracy, nothing else: should be 0.30
    assert.equal(calculateFinalScore({ accuracy: 1, efficiency: 0, craftsmanship: 0 }), 0.30);
    // All efficiency: 0.20
    assert.equal(calculateFinalScore({ accuracy: 0, efficiency: 1, craftsmanship: 0 }), 0.20);
    // All craftsmanship: 0.50
    assert.equal(calculateFinalScore({ accuracy: 0, efficiency: 0, craftsmanship: 1 }), 0.50);
  });

  test('mixed scores are weighted and rounded to 2dp', () => {
    // 0.3*0.8 + 0.2*0.6 + 0.5*0.7 = 0.24 + 0.12 + 0.35 = 0.71
    const result = calculateFinalScore({ accuracy: 0.8, efficiency: 0.6, craftsmanship: 0.7 });
    assert.equal(result, 0.71);
  });

  test('result is rounded to 2 decimal places', () => {
    // 0.3*(1/3) + 0.2*(1/3) + 0.5*(1/3) = 1/3 ≈ 0.333... → rounds to 0.33
    const result = calculateFinalScore({ accuracy: 1/3, efficiency: 1/3, craftsmanship: 1/3 });
    assert.equal(result, 0.33);
  });

  test('boundary: exactly at grade A threshold (0.9)', () => {
    // craftsmanship drives it: 0.5*1 + 0.3*0.8 + 0.2*1 = 0.5+0.24+0.2 = 0.94... need exact 0.90
    // accuracy=1 (0.3), efficiency=0.5 (0.1), craftsmanship=1 (0.5) → 0.9
    const result = calculateFinalScore({ accuracy: 1, efficiency: 0.5, craftsmanship: 1 });
    assert.equal(result, 0.90);
  });
});

// -------- getGrade --------

describe('getGrade', () => {
  test('score >= 0.9 returns A', () => {
    assert.equal(getGrade(1.00), 'A');
    assert.equal(getGrade(0.90), 'A');
    assert.equal(getGrade(0.95), 'A');
  });

  test('score >= 0.7 but < 0.9 returns B', () => {
    assert.equal(getGrade(0.70), 'B');
    assert.equal(getGrade(0.80), 'B');
    assert.equal(getGrade(0.89), 'B');
  });

  test('score >= 0.5 but < 0.7 returns C', () => {
    assert.equal(getGrade(0.50), 'C');
    assert.equal(getGrade(0.60), 'C');
    assert.equal(getGrade(0.69), 'C');
  });

  test('score < 0.5 returns F', () => {
    assert.equal(getGrade(0.00), 'F');
    assert.equal(getGrade(0.25), 'F');
    assert.equal(getGrade(0.49), 'F');
  });

  test('thresholds are inclusive', () => {
    // Exactly at each boundary
    assert.equal(getGrade(0.9), 'A');
    assert.equal(getGrade(0.7), 'B');
    assert.equal(getGrade(0.5), 'C');
  });
});
