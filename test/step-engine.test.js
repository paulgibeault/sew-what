/* ============================================================
   Tests — js/assembly/step-engine.js
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssemblyState,
  getCurrentStep,
  completeStep,
  isAssemblyComplete,
  getAverageScore,
} from '../js/assembly/step-engine.js';

// Minimal step definition fixture
const STEPS_FIXTURE = [
  { id: 'hem-body',   name: 'Hem body edges',   type: 'straight-seam' },
  { id: 'attach-bib', name: 'Attach bib',        type: 'align-attach'  },
  { id: 'waistband',  name: 'Sew waistband',     type: 'fold-attach'   },
];

// -------- createAssemblyState --------

describe('createAssemblyState', () => {
  test('creates state with correct step count', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    assert.equal(state.steps.length, 3);
  });

  test('initial currentStepIndex is 0', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    assert.equal(state.currentStepIndex, 0);
  });

  test('all steps start with completed=false and score=0', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    for (const step of state.steps) {
      assert.equal(step.completed, false);
      assert.equal(step.score, 0);
    }
  });

  test('step definitions are deep-cloned (mutation safe)', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    state.steps[0].name = 'mutated';
    // Original fixture should be unchanged
    assert.equal(STEPS_FIXTURE[0].name, 'Hem body edges');
  });

  test('step properties from definition are preserved', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    assert.equal(state.steps[0].id, 'hem-body');
    assert.equal(state.steps[1].type, 'align-attach');
  });

  test('empty step array produces valid state', () => {
    const state = createAssemblyState([]);
    assert.equal(state.steps.length, 0);
    assert.equal(state.currentStepIndex, 0);
  });
});

// -------- getCurrentStep --------

describe('getCurrentStep', () => {
  test('returns first step at start', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    const step = getCurrentStep(state);
    assert.equal(step.id, 'hem-body');
  });

  test('returns null for null state', () => {
    assert.equal(getCurrentStep(null), null);
  });

  test('returns null when past last step', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    // advance past all steps
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    assert.equal(getCurrentStep(state), null);
  });
});

// -------- completeStep --------

describe('completeStep', () => {
  test('marks current step as completed with given score', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    const next = completeStep(state, 0.85);
    assert.equal(next.steps[0].completed, true);
    assert.equal(next.steps[0].score, 0.85);
  });

  test('advances currentStepIndex by 1', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    const next = completeStep(state, 1);
    assert.equal(next.currentStepIndex, 1);
  });

  test('does not mutate the original state', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    const next = completeStep(state, 1);
    // original should still be at index 0, step uncompleted
    assert.equal(state.currentStepIndex, 0);
    assert.equal(state.steps[0].completed, false);
  });

  test('step index does not exceed steps.length', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    // Complete all 3 steps + one extra call
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    state = completeStep(state, 1); // 4th call on 3-step assembly
    assert.equal(state.currentStepIndex, STEPS_FIXTURE.length);
  });

  test('subsequent steps remain incomplete until completed', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    const next = completeStep(state, 0.9);
    assert.equal(next.steps[1].completed, false);
    assert.equal(next.steps[2].completed, false);
  });
});

// -------- isAssemblyComplete --------

describe('isAssemblyComplete', () => {
  test('returns false when not all steps done', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    assert.equal(isAssemblyComplete(state), false);
  });

  test('returns false mid-assembly', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 1);
    assert.equal(isAssemblyComplete(state), false);
  });

  test('returns true when all steps completed', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    assert.equal(isAssemblyComplete(state), true);
  });

  test('returns true for empty step array (vacuously complete)', () => {
    const state = createAssemblyState([]);
    assert.equal(isAssemblyComplete(state), true);
  });
});

// -------- getAverageScore --------

describe('getAverageScore', () => {
  test('returns 0 when no steps completed', () => {
    const state = createAssemblyState(STEPS_FIXTURE);
    assert.equal(getAverageScore(state), 0);
  });

  test('returns score of single completed step', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 0.75);
    assert.equal(getAverageScore(state), 0.75);
  });

  test('averages multiple completed step scores', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 0.8);
    state = completeStep(state, 0.6);
    // (0.8 + 0.6) / 2 = 0.7
    assert.equal(getAverageScore(state), 0.7);
  });

  test('averages all three completed steps', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 1.0);
    state = completeStep(state, 0.8);
    state = completeStep(state, 0.6);
    // (1.0 + 0.8 + 0.6) / 3 ≈ 0.8 (floating point — use approximate comparison)
    const avg = getAverageScore(state);
    assert.ok(Math.abs(avg - 0.8) < 1e-10, `expected ~0.8, got ${avg}`);
  });

  test('perfect scores average to 1.0', () => {
    let state = createAssemblyState(STEPS_FIXTURE);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    state = completeStep(state, 1);
    assert.equal(getAverageScore(state), 1.0);
  });
});
