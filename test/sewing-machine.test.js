/* ============================================================
   Thread & Template — Unit Tests: assembly/sewing-machine.js
   ============================================================ */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SewingMachine,
  createStraightSeam,
  createCurvedSeam,
} from '../js/assembly/sewing-machine.js';

// --- Minimal canvas mock for headless testing ---
function mockCanvas(w = 400, h = 300) {
  return {
    width: w,
    height: h,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      roundRect: () => {},
      ellipse: () => {},
      arc: () => {},
      setLineDash: () => {},
      fillText: () => {},
      save: () => {},
      restore: () => {},
      get font() { return ''; },
      set font(_) {},
      get strokeStyle() { return ''; },
      set strokeStyle(_) {},
      get fillStyle() { return ''; },
      set fillStyle(_) {},
      get lineWidth() { return 1; },
      set lineWidth(_) {},
      get lineCap() { return 'butt'; },
      set lineCap(_) {},
      get textAlign() { return 'left'; },
      set textAlign(_) {},
      get shadowOffsetX() { return 0; },
      set shadowOffsetX(_) {},
      get shadowOffsetY() { return 0; },
      set shadowOffsetY(_) {},
      get shadowBlur() { return 0; },
      set shadowBlur(_) {},
    }),
  };
}

// --- Seam helpers ---

describe('createStraightSeam', () => {
  it('creates a path with at least 2 points', () => {
    const seam = createStraightSeam(100);
    assert.ok(seam.path.length >= 2, 'path should have at least 2 points');
  });

  it('uses provided seam allowance', () => {
    const seam = createStraightSeam(100, 0.375, 'Test');
    assert.equal(seam.seamAllowance, 0.375);
  });

  it('uses provided label', () => {
    const seam = createStraightSeam(100, 0.625, 'Side Seam');
    assert.equal(seam.label, 'Side Seam');
  });

  it('path points increase in Y (top to bottom feed)', () => {
    const seam = createStraightSeam(60);
    for (let i = 1; i < seam.path.length; i++) {
      assert.ok(seam.path[i].y >= seam.path[i-1].y, 'Y should be non-decreasing');
    }
  });
});

describe('createCurvedSeam', () => {
  it('handles two control points', () => {
    const seam = createCurvedSeam([{ x: 0, y: 0 }, { x: 50, y: 100 }], 0.625);
    assert.ok(seam.path.length >= 2);
    assert.equal(seam.seamAllowance, 0.625);
  });

  it('handles multiple control points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 30, y: 50 }, { x: 0, y: 100 }];
    const seam = createCurvedSeam(pts, 0.5, 'Armhole');
    assert.ok(seam.path.length >= 3);
    assert.equal(seam.label, 'Armhole');
  });

  it('falls back gracefully with < 2 control points', () => {
    const seam = createCurvedSeam([{ x: 0, y: 0 }]);
    assert.ok(seam.path.length >= 2, 'should fall back to straight seam');
  });
});

// --- SewingMachine ---

describe('SewingMachine — construction', () => {
  it('creates without error', () => {
    const machine = new SewingMachine(mockCanvas());
    assert.ok(machine);
  });

  it('starts not complete', () => {
    const machine = new SewingMachine(mockCanvas());
    assert.equal(machine.complete, false);
  });

  it('starts with score 0', () => {
    const machine = new SewingMachine(mockCanvas());
    assert.equal(machine.score, 0);
  });
});

describe('SewingMachine — presser foot', () => {
  it('initially not down', () => {
    const machine = new SewingMachine(mockCanvas());
    assert.equal(machine.getState().presserFootDown, false);
  });

  it('lowerPresserFoot sets presserFootDown', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.lowerPresserFoot();
    assert.equal(machine.getState().presserFootDown, true);
  });

  it('raisePresserFoot clears presserFootDown', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.lowerPresserFoot();
    machine.raisePresserFoot();
    assert.equal(machine.getState().presserFootDown, false);
  });

  it('pedal has no effect without presser foot down', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.pressPedal(1.0);
    assert.equal(machine.getState().pedalSpeed, 0);
  });
});

describe('SewingMachine — loadSeam', () => {
  it('resets state on loadSeam', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.loadSeam(createStraightSeam(100));
    machine.lowerPresserFoot();
    machine.pressPedal(0.8);

    // Simulate some updates
    for (let i = 0; i < 10; i++) machine.update(1/60);

    // Reload seam
    machine.loadSeam(createStraightSeam(80));
    const state = machine.getState();
    assert.equal(state.stitchCount, 0, 'stitch count should reset');
    assert.equal(state.complete, false);
    assert.equal(state.presserFootDown, false);
  });
});

describe('SewingMachine — sewing mechanics', () => {
  function sewFull(seam) {
    const events = [];
    const machine = new SewingMachine(mockCanvas(), {
      onEvent: (e) => events.push(e),
    });
    machine.loadSeam(seam);
    machine.lowerPresserFoot();
    machine.pressPedal(0.7);

    // Run many frames to complete the seam
    for (let i = 0; i < 500; i++) {
      machine.update(1/60);
      if (machine.complete) break;
    }
    return { machine, events };
  }

  it('places stitches when pedal is pressed', () => {
    const seam = createStraightSeam(80);
    const { machine } = sewFull(seam);
    const state = machine.getState();
    assert.ok(state.stitchCount > 0, 'should place at least one stitch');
  });

  it('fires stitch events', () => {
    const seam = createStraightSeam(80);
    const { events } = sewFull(seam);
    const stitchEvents = events.filter(e => e.type === 'stitch');
    assert.ok(stitchEvents.length > 0, 'should fire stitch events');
  });

  it('fires complete event at end of seam', () => {
    const seam = createStraightSeam(80);
    const { events } = sewFull(seam);
    const completeEvent = events.find(e => e.type === 'complete');
    assert.ok(completeEvent, 'should fire complete event');
  });

  it('complete event includes a score in [0,1]', () => {
    const seam = createStraightSeam(80);
    const { events } = sewFull(seam);
    const completeEvent = events.find(e => e.type === 'complete');
    assert.ok(completeEvent.score >= 0 && completeEvent.score <= 1,
      `score should be in [0,1], got ${completeEvent.score}`);
  });

  it('machine marks complete after seam finishes', () => {
    const seam = createStraightSeam(80);
    const { machine } = sewFull(seam);
    assert.equal(machine.complete, true);
  });
});

describe('SewingMachine — progress tracking', () => {
  it('progress starts at 0', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.loadSeam(createStraightSeam(80));
    assert.equal(machine.getState().progress, 0);
  });

  it('progress increases as stitches are placed', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.loadSeam(createStraightSeam(80));
    machine.lowerPresserFoot();
    machine.pressPedal(0.8);

    let prevProgress = 0;
    let progressIncreased = false;
    for (let i = 0; i < 100; i++) {
      machine.update(1/60);
      const p = machine.getState().progress;
      if (p > prevProgress) {
        progressIncreased = true;
        break;
      }
      prevProgress = p;
    }
    assert.ok(progressIncreased, 'progress should increase during sewing');
  });
});

describe('SewingMachine — fabric guidance', () => {
  it('guideFabric sets fabricOffsetX', () => {
    const machine = new SewingMachine(mockCanvas());
    machine.guideFabric(15);
    assert.equal(machine.getState().fabricOffsetX, 15);
  });
});

describe('SewingMachine — getState', () => {
  it('returns expected shape', () => {
    const machine = new SewingMachine(mockCanvas());
    const state = machine.getState();
    assert.ok('presserFootDown' in state);
    assert.ok('pedalSpeed' in state);
    assert.ok('fabricOffsetX' in state);
    assert.ok('stitchCount' in state);
    assert.ok('complete' in state);
    assert.ok('score' in state);
    assert.ok('progress' in state);
  });
});
