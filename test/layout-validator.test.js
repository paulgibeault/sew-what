/* ============================================================
   Tests — js/material/layout-validator.js
   ============================================================ */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateLayout } from '../js/material/layout-validator.js';

// DRAFTING.PX_PER_INCH = 20; bolt is 45"×72" in inches

const BOLT_W  = 45;  // inches
const BOLT_L  = 72;  // inches
const PPI     = 20;  // px per inch

// A minimal pattern piece helper
// getBounds is called by layout-validator via getPieceBounds → returns {width, height}
// We supply pieces whose anchors produce known bounding boxes
function makePiece(id, name, widthIn, heightIn) {
  const w = widthIn  * PPI;
  const h = heightIn * PPI;
  return {
    id,
    name,
    anchors: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: w, y: 0 },
      { id: 'c', x: w, y: h },
      { id: 'd', x: 0, y: h },
    ],
    segments: [],
    grainlineAngle: 0,
    seamAllowance: 0.625,
  };
}

// A valid placed piece helper (placed at top-left origin, 0° rotation)
function placed(pieceId, x = 0, y = 0, rotation = 0) {
  return { pieceId, x, y, rotation, placed: true };
}

// Build a minimal but valid layout + pattern for one apron body (10"×20")
function oneBodyLayout() {
  const piece = makePiece('body', 'Apron Body', 10, 20);
  const layout = {
    boltWidth:  BOLT_W,
    boltLength: BOLT_L,
    placedPieces: [ placed('body', 0, 0, 0) ],
  };
  const pattern = { pieces: [piece] };
  return { layout, pattern };
}

// -------- valid layouts --------

describe('validateLayout — valid placements', () => {
  test('single piece within bolt, 0° rotation → valid', () => {
    const { layout, pattern } = oneBodyLayout();
    const result = validateLayout(layout, pattern);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test('two non-overlapping pieces, 0° rotation → valid', () => {
    const p1 = makePiece('body', 'Apron Body', 10, 20);
    const p2 = makePiece('bib',  'Bib',         8, 10);
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [
        placed('body', 0,   0,   0),
        placed('bib',  220, 0,   0),  // 220px = 11" to the right, no overlap with 10" wide piece
      ],
    };
    const result = validateLayout(layout, { pieces: [p1, p2] });
    assert.equal(result.valid, true);
  });

  test('accepts 90° rotation (crossgrain is valid)', () => {
    const piece = makePiece('body', 'Apron Body', 10, 20);
    // When rotated 90°, the AABB extends in both directions from the piece center.
    // A 10"×20" piece has center (100,200)px; at 90° the AABB left edge = center.x - h/2 = 100-200 = -100
    // Place it 200px in from the left so left edge = 0 after rotation.
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [ placed('body', 200, 0, 90) ],
    };
    const result = validateLayout(layout, { pieces: [piece] });
    assert.equal(result.valid, true, `errors: ${result.errors.join('; ')}`);
  });

  test('accepts 180° rotation', () => {
    // 180° rotation: AABB is same size as 0°, so no offset needed
    const { layout, pattern } = oneBodyLayout();
    layout.placedPieces[0].rotation = 180;
    assert.equal(validateLayout(layout, pattern).valid, true);
  });
});

// -------- unplaced pieces --------

describe('validateLayout — unplaced pieces', () => {
  test('unplaced piece triggers error', () => {
    const piece = makePiece('body', 'Apron Body', 10, 20);
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [{ pieceId: 'body', x: 0, y: 0, rotation: 0, placed: false }],
    };
    const result = validateLayout(layout, { pieces: [piece] });
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('not yet placed')));
  });
});

// -------- out-of-bounds --------

describe('validateLayout — out of bounds', () => {
  test('piece extending past right bolt edge triggers error', () => {
    const piece = makePiece('body', 'Apron Body', 10, 20);
    // Place piece at 44" from left — 44+10=54" > 45"
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [ placed('body', 44 * PPI, 0, 0) ],
    };
    const result = validateLayout(layout, { pieces: [piece] });
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('beyond fabric bolt')));
  });

  test('piece extending past bottom bolt edge triggers error', () => {
    const piece = makePiece('body', 'Apron Body', 10, 20);
    // Place at 70" from top — 70+20=90" > 72"
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [ placed('body', 0, 70 * PPI, 0) ],
    };
    const result = validateLayout(layout, { pieces: [piece] });
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('beyond fabric bolt')));
  });
});

// -------- overlaps --------

describe('validateLayout — overlapping pieces', () => {
  test('overlapping pieces trigger error', () => {
    const p1 = makePiece('body', 'Apron Body', 10, 20);
    const p2 = makePiece('bib',  'Bib',        8,  10);
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [
        placed('body', 0, 0, 0),
        placed('bib',  0, 0, 0),  // exact same position = total overlap
      ],
    };
    const result = validateLayout(layout, { pieces: [p1, p2] });
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('overlaps with')));
  });

  test('pieces with tiny gap do not trigger overlap error', () => {
    const p1 = makePiece('body', 'Apron Body', 10, 20);
    const p2 = makePiece('bib',  'Bib',         8, 10);
    // p1 ends at x=200px (10"), p2 starts at x=205px — 5px gap > OVERLAP_TOLERANCE
    const layout = {
      boltWidth: BOLT_W, boltLength: BOLT_L,
      placedPieces: [
        placed('body', 0,   0, 0),
        placed('bib',  205, 0, 0),
      ],
    };
    const result = validateLayout(layout, { pieces: [p1, p2] });
    assert.equal(result.valid, true);
  });
});

// -------- off-grain --------

describe('validateLayout — grainline alignment', () => {
  test('45° rotation triggers off-grain error', () => {
    const { layout, pattern } = oneBodyLayout();
    layout.placedPieces[0].rotation = 45;
    const result = validateLayout(layout, pattern);
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('off-grain')));
  });

  test('135° rotation triggers off-grain error', () => {
    const { layout, pattern } = oneBodyLayout();
    layout.placedPieces[0].rotation = 135;
    const result = validateLayout(layout, pattern);
    assert.equal(result.valid, false);
    assert(result.errors.some(e => e.includes('off-grain')));
  });
});

// -------- yardage and efficiency --------

describe('validateLayout — yardage and efficiency', () => {
  test('yardage is calculated and returned', () => {
    const { layout, pattern } = oneBodyLayout();
    const result = validateLayout(layout, pattern);
    // piece is 20" tall → 20/36 ≈ 0.56 yards
    assert.ok(result.yardageUsed > 0, 'yardageUsed should be positive');
    assert.ok(typeof result.yardageUsed === 'number');
  });

  test('efficiency is between 0 and 1', () => {
    const { layout, pattern } = oneBodyLayout();
    const result = validateLayout(layout, pattern);
    assert.ok(result.efficiency >= 0 && result.efficiency <= 1,
      `efficiency ${result.efficiency} out of range`);
  });

  test('result always contains valid, errors, yardageUsed, efficiency keys', () => {
    const { layout, pattern } = oneBodyLayout();
    const result = validateLayout(layout, pattern);
    assert.ok('valid'        in result);
    assert.ok('errors'       in result);
    assert.ok('yardageUsed'  in result);
    assert.ok('efficiency'   in result);
  });
});
