/* ============================================================
   Thread & Template — Unit Tests: drafting/validator.js
   ============================================================ */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validatePattern } from '../js/drafting/validator.js';
import { VALIDATION, DRAFTING } from '../js/constants.js';

// --- Helpers ---

/**
 * Build a simple square pattern piece with 4 anchors.
 * @param {object} overrides - partial piece properties to override
 */
function makeSquarePiece(overrides = {}) {
  return {
    id: 'piece-1',
    name: 'Test Piece',
    seamAllowance: DRAFTING.DEFAULT_SEAM_ALLOW,
    grainlineAngle: 0,
    anchors: [
      { id: 'a1', x: 0,   y: 0   },
      { id: 'a2', x: 100, y: 0   },
      { id: 'a3', x: 100, y: 100 },
      { id: 'a4', x: 0,   y: 100 },
    ],
    segments: [
      { from: 'a1', to: 'a2' },
      { from: 'a2', to: 'a3' },
      { from: 'a3', to: 'a4' },
      { from: 'a4', to: 'a1' },
    ],
    ...overrides,
  };
}

function makePattern(pieces) {
  return { pieces };
}

// --- Tests ---

describe('validatePattern — valid piece', () => {
  it('passes a well-formed square piece', () => {
    const result = validatePattern(makePattern([makeSquarePiece()]));
    assert.ok(result.valid, `expected valid, errors: ${JSON.stringify(result.errors)}`);
    assert.equal(result.errors.length, 0);
  });

  it('passes an empty pattern (no pieces)', () => {
    const result = validatePattern(makePattern([]));
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });
});

describe('validatePattern — PIECE_NOT_CLOSED', () => {
  it('fails when segments do not form a closed loop', () => {
    const piece = makeSquarePiece({
      segments: [
        { from: 'a1', to: 'a2' },
        { from: 'a2', to: 'a3' },
        { from: 'a3', to: 'a4' },
        // Missing: a4 → a1 (loop not closed)
      ],
    });
    const result = validatePattern(makePattern([piece]));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.type === VALIDATION.PIECE_NOT_CLOSED);
    assert.ok(err, 'expected PIECE_NOT_CLOSED error');
    assert.equal(err.pieceId, 'piece-1');
  });

  it('fails when piece has fewer than 3 anchors', () => {
    const piece = makeSquarePiece({
      anchors: [{ id: 'a1', x: 0, y: 0 }, { id: 'a2', x: 10, y: 0 }],
      segments: [{ from: 'a1', to: 'a2' }, { from: 'a2', to: 'a1' }],
    });
    const result = validatePattern(makePattern([piece]));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.type === VALIDATION.PIECE_NOT_CLOSED);
    assert.ok(err, 'expected PIECE_NOT_CLOSED error for < 3 anchors');
  });
});

describe('validatePattern — SEAM_ALLOW_TOO_SMALL', () => {
  it('fails when seam allowance is below minimum', () => {
    const piece = makeSquarePiece({ seamAllowance: 0.1 }); // below 0.25"
    const result = validatePattern(makePattern([piece]));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.type === VALIDATION.SEAM_ALLOW_TOO_SMALL);
    assert.ok(err, 'expected SEAM_ALLOW_TOO_SMALL error');
    assert.equal(err.pieceId, 'piece-1');
  });

  it('passes when seam allowance equals minimum exactly', () => {
    const piece = makeSquarePiece({ seamAllowance: DRAFTING.MIN_SEAM_ALLOW }); // 0.25"
    const result = validatePattern(makePattern([piece]));
    const err = result.errors.find(e => e.type === VALIDATION.SEAM_ALLOW_TOO_SMALL);
    assert.ok(!err, 'should not error at exact minimum');
  });

  it('passes with standard 5/8" seam allowance', () => {
    const piece = makeSquarePiece({ seamAllowance: 0.625 });
    const result = validatePattern(makePattern([piece]));
    const err = result.errors.find(e => e.type === VALIDATION.SEAM_ALLOW_TOO_SMALL);
    assert.ok(!err, 'standard 5/8" should be fine');
  });
});

describe('validatePattern — NO_GRAINLINE', () => {
  it('fails when grainlineAngle is undefined', () => {
    const piece = makeSquarePiece({ grainlineAngle: undefined });
    const result = validatePattern(makePattern([piece]));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.type === VALIDATION.NO_GRAINLINE);
    assert.ok(err, 'expected NO_GRAINLINE error');
  });

  it('fails when grainlineAngle is null', () => {
    const piece = makeSquarePiece({ grainlineAngle: null });
    const result = validatePattern(makePattern([piece]));
    assert.ok(!result.valid);
    const err = result.errors.find(e => e.type === VALIDATION.NO_GRAINLINE);
    assert.ok(err, 'expected NO_GRAINLINE error for null');
  });

  it('passes when grainlineAngle is 0 (valid)', () => {
    const piece = makeSquarePiece({ grainlineAngle: 0 });
    const result = validatePattern(makePattern([piece]));
    const err = result.errors.find(e => e.type === VALIDATION.NO_GRAINLINE);
    assert.ok(!err, 'grainlineAngle=0 should be valid');
  });

  it('passes when grainlineAngle is a non-zero angle', () => {
    const piece = makeSquarePiece({ grainlineAngle: 45 });
    const result = validatePattern(makePattern([piece]));
    const err = result.errors.find(e => e.type === VALIDATION.NO_GRAINLINE);
    assert.ok(!err, 'grainlineAngle=45 should be valid');
  });
});

describe('validatePattern — SELF_INTERSECTION', () => {
  it('passes a simple non-self-intersecting polygon', () => {
    const result = validatePattern(makePattern([makeSquarePiece()]));
    const err = result.errors.find(e => e.type === VALIDATION.SELF_INTERSECTION);
    assert.ok(!err, 'square should not self-intersect');
  });

  it('detects a self-intersecting (bowtie) polygon', () => {
    // A bowtie: anchors form an X when connected in order
    const piece = makeSquarePiece({
      anchors: [
        { id: 'a1', x: 0,   y: 0   },
        { id: 'a2', x: 100, y: 100 },
        { id: 'a3', x: 100, y: 0   },
        { id: 'a4', x: 0,   y: 100 },
      ],
      segments: [
        { from: 'a1', to: 'a2' },
        { from: 'a2', to: 'a3' },
        { from: 'a3', to: 'a4' },
        { from: 'a4', to: 'a1' },
      ],
    });
    const result = validatePattern(makePattern([piece]));
    const err = result.errors.find(e => e.type === VALIDATION.SELF_INTERSECTION);
    assert.ok(err, 'bowtie polygon should trigger self-intersection error');
  });
});

describe('validatePattern — multiple pieces', () => {
  it('validates each piece independently', () => {
    const goodPiece = makeSquarePiece({ id: 'good', name: 'Good' });
    const badPiece = makeSquarePiece({
      id: 'bad', name: 'Bad',
      seamAllowance: 0.0, // too small
      grainlineAngle: undefined, // no grainline
    });
    const result = validatePattern(makePattern([goodPiece, badPiece]));
    assert.ok(!result.valid);
    // Should have errors only for the bad piece
    const pieceIds = result.errors.map(e => e.pieceId);
    assert.ok(!pieceIds.includes('good'), 'no errors for good piece');
    assert.ok(pieceIds.includes('bad'), 'errors for bad piece');
  });

  it('passes when all pieces are valid', () => {
    const p1 = makeSquarePiece({ id: 'p1', name: 'Front' });
    const p2 = makeSquarePiece({ id: 'p2', name: 'Back', grainlineAngle: 90 });
    const result = validatePattern(makePattern([p1, p2]));
    assert.ok(result.valid, `errors: ${JSON.stringify(result.errors)}`);
  });
});

describe('validatePattern — result shape', () => {
  it('returns { valid, errors } on success', () => {
    const result = validatePattern(makePattern([makeSquarePiece()]));
    assert.ok('valid' in result);
    assert.ok('errors' in result);
    assert.ok(Array.isArray(result.errors));
  });

  it('errors include type, pieceId, message', () => {
    const piece = makeSquarePiece({ grainlineAngle: undefined });
    const result = validatePattern(makePattern([piece]));
    const err = result.errors[0];
    assert.ok(err.type, 'error should have type');
    assert.ok(err.pieceId, 'error should have pieceId');
    assert.ok(typeof err.message === 'string', 'error should have message string');
  });
});
