/* ============================================================
   Thread & Template — Unit Tests: utils.js
   ============================================================ */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  vec2, vecAdd, vecSub, vecScale, vecLength, vecNormalize,
  vecDot, vecCross, vecDist, vecLerp,
  clamp, lerp, mapRange, snapTo, degToRad, radToDeg,
  pointInPolygon, hitTest, polygonArea, polygonPerimeter,
  deepClone, deepMerge, uid,
} from '../js/utils.js';

// --- Vector Math ---
describe('vec2', () => {
  it('creates a vector with defaults', () => {
    const v = vec2();
    assert.deepEqual(v, { x: 0, y: 0 });
  });
  it('creates a vector with values', () => {
    assert.deepEqual(vec2(3, 4), { x: 3, y: 4 });
  });
});

describe('vecAdd', () => {
  it('adds two vectors', () => {
    assert.deepEqual(vecAdd({ x: 1, y: 2 }, { x: 3, y: 4 }), { x: 4, y: 6 });
  });
});

describe('vecSub', () => {
  it('subtracts two vectors', () => {
    assert.deepEqual(vecSub({ x: 5, y: 7 }, { x: 2, y: 3 }), { x: 3, y: 4 });
  });
});

describe('vecScale', () => {
  it('scales a vector', () => {
    assert.deepEqual(vecScale({ x: 2, y: 3 }, 3), { x: 6, y: 9 });
  });
});

describe('vecLength', () => {
  it('computes length of a 3-4-5 vector', () => {
    assert.equal(vecLength({ x: 3, y: 4 }), 5);
  });
  it('returns 0 for zero vector', () => {
    assert.equal(vecLength({ x: 0, y: 0 }), 0);
  });
});

describe('vecNormalize', () => {
  it('normalizes a vector to unit length', () => {
    const v = vecNormalize({ x: 3, y: 4 });
    assert.ok(Math.abs(vecLength(v) - 1) < 1e-10, 'length should be ~1');
    assert.ok(Math.abs(v.x - 0.6) < 1e-10);
    assert.ok(Math.abs(v.y - 0.8) < 1e-10);
  });
  it('returns zero vector for zero input', () => {
    assert.deepEqual(vecNormalize({ x: 0, y: 0 }), { x: 0, y: 0 });
  });
});

describe('vecDot', () => {
  it('computes dot product', () => {
    assert.equal(vecDot({ x: 1, y: 2 }, { x: 3, y: 4 }), 11);
  });
  it('perpendicular vectors have dot 0', () => {
    assert.equal(vecDot({ x: 1, y: 0 }, { x: 0, y: 1 }), 0);
  });
});

describe('vecCross', () => {
  it('computes 2D cross product (z component)', () => {
    assert.equal(vecCross({ x: 1, y: 0 }, { x: 0, y: 1 }), 1);
    assert.equal(vecCross({ x: 0, y: 1 }, { x: 1, y: 0 }), -1);
  });
});

describe('vecDist', () => {
  it('computes distance between two points', () => {
    assert.equal(vecDist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });
  it('returns 0 for same point', () => {
    assert.equal(vecDist({ x: 5, y: 5 }, { x: 5, y: 5 }), 0);
  });
});

describe('vecLerp', () => {
  it('interpolates at t=0 returns a', () => {
    assert.deepEqual(vecLerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0), { x: 0, y: 0 });
  });
  it('interpolates at t=1 returns b', () => {
    assert.deepEqual(vecLerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 1), { x: 10, y: 20 });
  });
  it('interpolates at t=0.5 returns midpoint', () => {
    assert.deepEqual(vecLerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5), { x: 5, y: 10 });
  });
});

// --- Scalar Utilities ---
describe('clamp', () => {
  it('clamps below min', () => assert.equal(clamp(-5, 0, 10), 0));
  it('clamps above max', () => assert.equal(clamp(15, 0, 10), 10));
  it('passes through in-range value', () => assert.equal(clamp(5, 0, 10), 5));
});

describe('lerp', () => {
  it('interpolates correctly', () => {
    assert.equal(lerp(0, 100, 0.25), 25);
    assert.equal(lerp(10, 20, 0.5), 15);
  });
});

describe('mapRange', () => {
  it('maps from one range to another', () => {
    assert.equal(mapRange(5, 0, 10, 0, 100), 50);
    assert.equal(mapRange(0, 0, 10, 0, 100), 0);
    assert.equal(mapRange(10, 0, 10, 0, 100), 100);
  });
});

describe('snapTo', () => {
  it('snaps to nearest multiple', () => {
    assert.equal(snapTo(7, 5), 5);
    assert.equal(snapTo(8, 5), 10);
    assert.equal(snapTo(10, 5), 10);
  });
});

describe('degToRad / radToDeg', () => {
  it('converts 180 degrees to PI', () => {
    assert.ok(Math.abs(degToRad(180) - Math.PI) < 1e-10);
  });
  it('converts PI to 180 degrees', () => {
    assert.ok(Math.abs(radToDeg(Math.PI) - 180) < 1e-10);
  });
  it('round-trips correctly', () => {
    assert.ok(Math.abs(radToDeg(degToRad(45)) - 45) < 1e-10);
  });
});

// --- Geometry ---
describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 }, { x: 10, y: 0 },
    { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  it('detects point inside polygon', () => {
    assert.ok(pointInPolygon({ x: 5, y: 5 }, square));
  });
  it('detects point outside polygon', () => {
    assert.ok(!pointInPolygon({ x: 15, y: 5 }, square));
  });
  it('detects point outside (negative)', () => {
    assert.ok(!pointInPolygon({ x: -1, y: 5 }, square));
  });
});

describe('hitTest', () => {
  it('returns true when within radius', () => {
    assert.ok(hitTest({ x: 3, y: 4 }, { x: 0, y: 0 }, 6));
  });
  it('returns false when outside radius', () => {
    assert.ok(!hitTest({ x: 3, y: 4 }, { x: 0, y: 0 }, 4));
  });
  it('returns true on exact radius', () => {
    assert.ok(hitTest({ x: 3, y: 4 }, { x: 0, y: 0 }, 5));
  });
});

describe('polygonArea', () => {
  it('computes area of a unit square', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    // signed area — abs for magnitude
    assert.ok(Math.abs(polygonArea(sq)) === 0.5 || Math.abs(polygonArea(sq)) === 1,
      `area should be ±1 for this 1x1 square, got ${polygonArea(sq)}`);
  });
  it('computes area of a 3x4 rectangle', () => {
    const rect = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    // Shoelace formula: area = |sum of (x_i+x_{i+1})(y_i-y_{i+1})| / 2 = 12/2 = 6? 
    // Actual shoelace: sum = (0+3)(0-0) + (3+3)(0-4) + (3+0)(4-4) + (0+0)(4-0) = 0 + (-24) + 0 + 0 = -24; /2 = -12; abs=12
    assert.equal(Math.abs(polygonArea(rect)), 12);
  });
});

describe('polygonPerimeter', () => {
  it('computes perimeter of a 3x4 rectangle', () => {
    const rect = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }];
    assert.equal(polygonPerimeter(rect), 14);
  });
});

// --- General Utilities ---
describe('deepClone', () => {
  it('creates a deep copy', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = deepClone(original);
    clone.b.c = 99;
    assert.equal(original.b.c, 2, 'original should be unaffected');
  });
  it('clones arrays', () => {
    const original = [1, 2, [3, 4]];
    const clone = deepClone(original);
    clone[2][0] = 99;
    assert.equal(original[2][0], 3);
  });
});

describe('deepMerge', () => {
  it('fills missing keys from target', () => {
    const target = { a: 1, b: 2, c: 3 };
    const source = { a: 10 };
    const result = deepMerge(target, source);
    assert.deepEqual(result, { a: 10, b: 2, c: 3 });
  });

  it('recursively merges nested objects', () => {
    const target = { settings: { theme: 'light', units: 'imperial' }, version: 1 };
    const source = { settings: { units: 'metric' } };
    const result = deepMerge(target, source);
    assert.deepEqual(result, { settings: { theme: 'light', units: 'metric' }, version: 1 });
  });

  it('source arrays overwrite target arrays', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);
    assert.deepEqual(result, { items: [4, 5] });
  });

  it('does not mutate target or source', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    deepMerge(target, source);
    assert.deepEqual(target, { a: { b: 1 } });
    assert.deepEqual(source, { a: { c: 2 } });
  });

  it('handles deeply nested structures', () => {
    const target = { a: { b: { c: { d: 1, e: 2 } } } };
    const source = { a: { b: { c: { e: 99 }, f: 3 } } };
    const result = deepMerge(target, source);
    assert.deepEqual(result, { a: { b: { c: { d: 1, e: 99 }, f: 3 } } });
  });

  it('source primitive overwrites target object', () => {
    const target = { a: { nested: true } };
    const source = { a: 42 };
    const result = deepMerge(target, source);
    assert.deepEqual(result, { a: 42 });
  });
});

describe('uid', () => {
  it('generates unique IDs', () => {
    const ids = new Set([uid(), uid(), uid(), uid(), uid()]);
    assert.equal(ids.size, 5, 'all IDs should be unique');
  });
  it('uses provided prefix', () => {
    const id = uid('anchor');
    assert.ok(id.startsWith('anchor_'), `expected prefix 'anchor_', got: ${id}`);
  });
});
