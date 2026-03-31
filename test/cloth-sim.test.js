/* ============================================================
   Thread & Template — Unit Tests: fabric/cloth-sim.js
   Tests cover construction, material presets, pin/unpin, physics,
   force application, nearest particle, bounds, reset, and
   serialize/deserialize.
   ============================================================ */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { ClothSim, FABRIC_PRESETS } from '../js/fabric/cloth-sim.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a small 3×3-grid cloth (spacing=8, covers 16×16 px) */
function smallCloth(opts = {}) {
  return new ClothSim({ width: 16, height: 16, spacing: 8, ...opts });
}

function approxEqual(a, b, tolerance = 0.0001) {
  return Math.abs(a - b) <= tolerance;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('ClothSim — construction', () => {
  it('creates the correct number of particles (3×3 = 9)', () => {
    const cloth = smallCloth();
    assert.equal(cloth.particles.length, 9);
  });

  it('exposes correct cols/rows', () => {
    const cloth = smallCloth();
    assert.equal(cloth.cols, 3);
    assert.equal(cloth.rows, 3);
  });

  it('particles start at grid positions based on spacing and origin', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 10, originY: 20 });
    const p00 = cloth.getParticle(0, 0);
    const p10 = cloth.getParticle(1, 0);
    const p01 = cloth.getParticle(0, 1);
    assert.equal(p00.x, 10);
    assert.equal(p00.y, 20);
    assert.equal(p10.x, 18);
    assert.equal(p01.y, 28);
  });

  it('prevX/prevY equal x/y at construction (zero velocity)', () => {
    const cloth = smallCloth();
    for (const p of cloth.particles) {
      assert.equal(p.prevX, p.x);
      assert.equal(p.prevY, p.y);
    }
  });

  it('all particles start unpinned', () => {
    const cloth = smallCloth();
    assert.ok(cloth.particles.every(p => p.pinned === false));
  });

  it('defaults material to cotton', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8 });
    assert.equal(cloth.material, 'cotton');
  });

  it('creates constraints (structural + shear + bend)', () => {
    const cloth = smallCloth();
    assert.ok(cloth.constraints.length > 0);
  });

  it('getParticle returns null for out-of-bounds indices', () => {
    const cloth = smallCloth();
    assert.equal(cloth.getParticle(-1, 0), null);
    assert.equal(cloth.getParticle(0, -1), null);
    assert.equal(cloth.getParticle(99, 0), null);
    assert.equal(cloth.getParticle(0, 99), null);
  });

  it('enforces minimum 2 cols and 2 rows', () => {
    const cloth = new ClothSim({ width: 1, height: 1, spacing: 100 });
    assert.ok(cloth.cols >= 2);
    assert.ok(cloth.rows >= 2);
  });
});

// ---------------------------------------------------------------------------
// FABRIC_PRESETS
// ---------------------------------------------------------------------------

describe('FABRIC_PRESETS — all 6 presets', () => {
  const required = ['stiffness', 'weight', 'damping', 'bendResist', 'shearResist', 'stretchLimit'];
  const presets = ['cotton', 'denim', 'silk', 'knit', 'canvas', 'chiffon'];

  it('all 6 preset names exist', () => {
    for (const name of presets) {
      assert.ok(FABRIC_PRESETS[name], `Missing preset: ${name}`);
    }
  });

  it('every preset has all required fields', () => {
    for (const name of presets) {
      for (const field of required) {
        assert.notEqual(
          FABRIC_PRESETS[name][field],
          undefined,
          `${name} missing field ${field}`
        );
      }
    }
  });

  it('damping values are between 0.9 and 1.0 (physically plausible)', () => {
    for (const name of presets) {
      const d = FABRIC_PRESETS[name].damping;
      assert.ok(d > 0.9, `${name} damping ${d} should be > 0.9`);
      assert.ok(d <= 1.0, `${name} damping ${d} should be <= 1.0`);
    }
  });

  it('stretchLimit is >= 1.0 for all presets', () => {
    for (const name of presets) {
      const sl = FABRIC_PRESETS[name].stretchLimit;
      assert.ok(sl >= 1.0, `${name} stretchLimit ${sl} should be >= 1.0`);
    }
  });

  it('knit has the highest stretchLimit (most elastic)', () => {
    const limits = presets.map(n => FABRIC_PRESETS[n].stretchLimit);
    assert.equal(FABRIC_PRESETS.knit.stretchLimit, Math.max(...limits));
  });

  it('canvas has the highest weight (heaviest)', () => {
    const weights = presets.map(n => FABRIC_PRESETS[n].weight);
    assert.equal(FABRIC_PRESETS.canvas.weight, Math.max(...weights));
  });

  it('chiffon has the lowest weight (lightest)', () => {
    const weights = presets.map(n => FABRIC_PRESETS[n].weight);
    assert.equal(FABRIC_PRESETS.chiffon.weight, Math.min(...weights));
  });

  it('FABRIC_PRESETS is frozen (immutable)', () => {
    assert.throws(() => {
      FABRIC_PRESETS.cotton = null;
    });
  });
});

// ---------------------------------------------------------------------------
// setMaterial
// ---------------------------------------------------------------------------

describe('ClothSim — setMaterial', () => {
  it('material getter returns the set material name', () => {
    const cloth = smallCloth();
    cloth.setMaterial('denim');
    assert.equal(cloth.material, 'denim');
  });

  it('does not throw for unknown material name', () => {
    const cloth = smallCloth();
    assert.doesNotThrow(() => cloth.setMaterial('burlap-sack'));
    assert.doesNotThrow(() => cloth.update(1 / 60));
  });

  it('updates shear constraint stiffness when switching to denim', () => {
    const cloth = smallCloth({ material: 'silk' });
    cloth.setMaterial('denim');
    const shearConstraints = cloth.constraints.filter(c => c._type === 'shear');
    assert.ok(shearConstraints.length > 0);
    // Denim shearResist = 0.80
    assert.ok(shearConstraints.every(c => approxEqual(c.stiffness, 0.80)));
  });

  it('updates bend constraint stiffness for silk (low bendResist)', () => {
    const cloth = smallCloth();
    cloth.setMaterial('silk');
    const bendConstraints = cloth.constraints.filter(c => c._type === 'bend');
    assert.ok(bendConstraints.length > 0);
    // Silk bendResist = 0.1
    assert.ok(bendConstraints.every(c => approxEqual(c.stiffness, 0.1)));
  });

  it('structural constraints always have stiffness 1.0 regardless of material', () => {
    const cloth = smallCloth();
    for (const mat of ['cotton', 'denim', 'silk', 'knit', 'canvas', 'chiffon']) {
      cloth.setMaterial(mat);
      const structural = cloth.constraints.filter(c => c._type === 'structural');
      assert.ok(
        structural.every(c => c.stiffness === 1.0),
        `structural stiffness should be 1.0 for ${mat}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Pin / Unpin
// ---------------------------------------------------------------------------

describe('ClothSim — pin / unpin', () => {
  it('pin sets particle.pinned = true', () => {
    const cloth = smallCloth();
    cloth.pin(1, 1);
    assert.equal(cloth.getParticle(1, 1).pinned, true);
  });

  it('unpin sets particle.pinned = false', () => {
    const cloth = smallCloth();
    cloth.pin(0, 0);
    cloth.unpin(0, 0);
    assert.equal(cloth.getParticle(0, 0).pinned, false);
  });

  it('pinTop pins all particles in row 0', () => {
    const cloth = smallCloth();
    cloth.pinTop();
    for (let c = 0; c < cloth.cols; c++) {
      assert.equal(cloth.getParticle(c, 0).pinned, true, `col ${c} row 0 should be pinned`);
    }
  });

  it('pinTop does not pin row 1', () => {
    const cloth = smallCloth();
    cloth.pinTop();
    for (let c = 0; c < cloth.cols; c++) {
      assert.equal(cloth.getParticle(c, 1).pinned, false, `col ${c} row 1 should not be pinned`);
    }
  });

  it('pin with out-of-bounds coords does not throw', () => {
    const cloth = smallCloth();
    assert.doesNotThrow(() => cloth.pin(99, 99));
    assert.doesNotThrow(() => cloth.unpin(-1, -1));
  });

  it('pinned particle does not move during update', () => {
    const cloth = smallCloth();
    cloth.pin(1, 1);
    const p = cloth.getParticle(1, 1);
    const startX = p.x;
    const startY = p.y;
    for (let i = 0; i < 60; i++) cloth.update(1 / 60);
    assert.equal(p.x, startX);
    assert.equal(p.y, startY);
  });
});

// ---------------------------------------------------------------------------
// Physics: gravity
// ---------------------------------------------------------------------------

describe('ClothSim — physics', () => {
  it('unpinned particle falls downward under gravity', () => {
    const cloth = smallCloth({ material: 'cotton' });
    const p = cloth.getParticle(1, 1);
    const startY = p.y;
    for (let i = 0; i < 10; i++) cloth.update(1 / 60);
    assert.ok(p.y > startY, `particle should have fallen: startY=${startY} endY=${p.y}`);
  });

  it('pinned-top cloth: top row stays, bottom row falls', () => {
    const cloth = smallCloth({ material: 'cotton' });
    cloth.pinTop();
    const topP = cloth.getParticle(1, 0);
    const bottomP = cloth.getParticle(1, 2);
    const topStartY = topP.y;
    const bottomStartY = bottomP.y;
    for (let i = 0; i < 30; i++) cloth.update(1 / 60);
    assert.equal(topP.y, topStartY);
    assert.ok(bottomP.y > bottomStartY);
  });

  it('heavier material (canvas) falls further than lighter (chiffon)', () => {
    const runDrop = (mat) => {
      const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, material: mat });
      const p = cloth.getParticle(1, 2);
      const startY = p.y;
      for (let i = 0; i < 10; i++) cloth.update(1 / 60);
      return p.y - startY;
    };
    assert.ok(runDrop('canvas') > runDrop('chiffon'));
  });

  it('update does not throw for any material preset', () => {
    for (const mat of Object.keys(FABRIC_PRESETS)) {
      const cloth = smallCloth({ material: mat });
      assert.doesNotThrow(() => {
        for (let i = 0; i < 5; i++) cloth.update(1 / 60);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// applyForceAt
// ---------------------------------------------------------------------------

describe('ClothSim — applyForceAt', () => {
  it('applies upward force to center particle', () => {
    const cloth = smallCloth({ material: 'cotton' });
    const p = cloth.getParticle(1, 1);
    const startY = p.y;
    cloth.applyForceAt(p.x, p.y, 100, 0, -1e6);
    cloth.update(1 / 60);
    assert.ok(p.y < startY, `expected upward movement, but y went from ${startY} to ${p.y}`);
  });

  it('does not throw with zero radius', () => {
    const cloth = smallCloth();
    assert.doesNotThrow(() => cloth.applyForceAt(0, 0, 0, 0, 100));
  });
});

// ---------------------------------------------------------------------------
// nearestParticle
// ---------------------------------------------------------------------------

describe('ClothSim — nearestParticle', () => {
  it('returns the closest particle to a world point', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    const result = cloth.nearestParticle(9, 0);
    const expected = cloth.getParticle(1, 0); // at x=8
    assert.equal(result, expected);
  });

  it('returns null when point is beyond maxDist', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    const result = cloth.nearestParticle(1000, 1000, 5);
    assert.equal(result, null);
  });

  it('returns a particle when within maxDist', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    const result = cloth.nearestParticle(0, 0, 100);
    assert.notEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// moveParticle
// ---------------------------------------------------------------------------

describe('ClothSim — moveParticle', () => {
  it('moves a particle to the specified position', () => {
    const cloth = smallCloth();
    const p = cloth.getParticle(0, 0);
    cloth.moveParticle(p, 42, 99);
    assert.equal(p.x, 42);
    assert.equal(p.y, 99);
  });

  it('sets prevX/prevY to the old position (captures velocity)', () => {
    const cloth = smallCloth();
    const p = cloth.getParticle(0, 0);
    const oldX = p.x;
    const oldY = p.y;
    cloth.moveParticle(p, 42, 99);
    assert.equal(p.prevX, oldX);
    assert.equal(p.prevY, oldY);
  });
});

// ---------------------------------------------------------------------------
// getBounds
// ---------------------------------------------------------------------------

describe('ClothSim — getBounds', () => {
  it('returns correct initial bounds for a cloth at origin', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    const bounds = cloth.getBounds();
    assert.equal(bounds.minX, 0);
    assert.equal(bounds.minY, 0);
    assert.equal(bounds.maxX, 16);
    assert.equal(bounds.maxY, 16);
  });

  it('bounds expand after gravity simulation', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    const before = cloth.getBounds();
    for (let i = 0; i < 30; i++) cloth.update(1 / 60);
    const after = cloth.getBounds();
    assert.ok(after.maxY > before.maxY);
  });

  it('bounds respect origin offset', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 100, originY: 200 });
    const bounds = cloth.getBounds();
    assert.equal(bounds.minX, 100);
    assert.equal(bounds.minY, 200);
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('ClothSim — reset', () => {
  it('returns all particles to initial grid positions after simulation', () => {
    const cloth = new ClothSim({ width: 16, height: 16, spacing: 8, originX: 0, originY: 0 });
    for (let i = 0; i < 60; i++) cloth.update(1 / 60);
    cloth.reset();
    for (let r = 0; r < cloth.rows; r++) {
      for (let c = 0; c < cloth.cols; c++) {
        const p = cloth.getParticle(c, r);
        assert.ok(approxEqual(p.x, c * 8), `p(${c},${r}).x expected ${c*8}, got ${p.x}`);
        assert.ok(approxEqual(p.y, r * 8), `p(${c},${r}).y expected ${r*8}, got ${p.y}`);
        assert.ok(approxEqual(p.prevX, c * 8));
        assert.ok(approxEqual(p.prevY, r * 8));
      }
    }
  });

  it('after reset, cloth falls the same distance as a fresh cloth', () => {
    const cloth = smallCloth({ material: 'cotton' });
    for (let i = 0; i < 60; i++) cloth.update(1 / 60);
    const dropped1 = cloth.getParticle(1, 2).y;

    cloth.reset();
    for (let i = 0; i < 60; i++) cloth.update(1 / 60);
    const dropped2 = cloth.getParticle(1, 2).y;

    // Should produce the same trajectory from rest (within small float tolerance)
    assert.ok(
      approxEqual(dropped1, dropped2, 0.1),
      `expected ~same drop: first=${dropped1.toFixed(2)} second=${dropped2.toFixed(2)}`
    );
  });
});

// ---------------------------------------------------------------------------
// serialize / deserialize
// ---------------------------------------------------------------------------

describe('ClothSim — serialize / deserialize', () => {
  it('serialize returns an object with expected shape', () => {
    const cloth = smallCloth({ material: 'denim' });
    const s = cloth.serialize();
    assert.equal(s.material, 'denim');
    assert.equal(s.colCount, cloth.cols);
    assert.equal(s.rowCount, cloth.rows);
    assert.equal(s.spacing, 8);
    assert.ok(Array.isArray(s.particles));
    assert.equal(s.particles.length, cloth.particles.length);
  });

  it('each serialized particle has required fields', () => {
    const cloth = smallCloth();
    const s = cloth.serialize();
    for (const p of s.particles) {
      for (const field of ['x', 'y', 'prevX', 'prevY', 'pinned', 'mass']) {
        assert.notEqual(p[field], undefined, `particle missing field: ${field}`);
      }
    }
  });

  it('deserialize restores particle positions after simulation', () => {
    const cloth = smallCloth({ material: 'cotton' });
    cloth.pinTop();
    for (let i = 0; i < 30; i++) cloth.update(1 / 60);

    const snapshot = cloth.serialize();
    const cloth2 = smallCloth({ material: 'cotton' });
    cloth2.deserialize(snapshot);

    for (let i = 0; i < cloth.particles.length; i++) {
      assert.ok(approxEqual(cloth2.particles[i].x, cloth.particles[i].x));
      assert.ok(approxEqual(cloth2.particles[i].y, cloth.particles[i].y));
      assert.equal(cloth2.particles[i].pinned, cloth.particles[i].pinned);
    }
  });

  it('deserialize restores material', () => {
    const cloth = smallCloth({ material: 'silk' });
    const snapshot = cloth.serialize();
    const cloth2 = smallCloth();
    cloth2.deserialize(snapshot);
    assert.equal(cloth2.material, 'silk');
  });

  it('deserialize with mismatched particle count throws', () => {
    const cloth = smallCloth();
    const snapshot = cloth.serialize();
    snapshot.particles.pop();
    const cloth2 = smallCloth();
    assert.throws(() => cloth2.deserialize(snapshot), /particle count mismatch/i);
  });
});
