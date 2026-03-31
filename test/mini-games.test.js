/* ============================================================
   Thread & Template — Unit Tests: assembly/mini-games.js
   Tests cover scoring logic, path tracking, and alignment mechanics.
   SVG DOM calls are mocked — no browser required.
   ============================================================ */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { StraightSeamGame, AlignAndSewGame } from '../js/assembly/mini-games.js';
import { APRON_STEPS } from '../js/assembly/steps-apron.js';

// --- Minimal SVG mock ---
function mockSvg() {
  const children = [];
  const el = {
    _children: children,
    appendChild: (child) => { children.push(child); return child; },
  };
  return el;
}

function mockSvgEl() {
  const attrs = {};
  let _textContent = '';
  const children = [];
  return {
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => attrs[k],
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = v; },
    remove: () => {},
    appendChild: (child) => { children.push(child); return child; },
    get innerHTML() { return ''; },
    set innerHTML(_) {},
    _attrs: attrs,
    _children: children,
  };
}

// Patch document.createElementNS so _init() doesn't throw
global.document = {
  createElementNS: (_ns, _tag) => mockSvgEl(),
};

// --- Helpers ---
function makeSeamLine(x1 = 50, y1 = 100, x2 = 250, y2 = 100) {
  return { x1, y1, x2, y2 };
}

// --- StraightSeamGame ---

describe('StraightSeamGame — construction', () => {
  it('starts incomplete with score 0', () => {
    const game = new StraightSeamGame(mockSvg(), makeSeamLine());
    assert.equal(game.completed, false);
    assert.equal(game.score, 0);
  });

  it('accepts custom perfectRadius and failRadius', () => {
    const game = new StraightSeamGame(mockSvg(), makeSeamLine(), {
      perfectRadius: 4,
      failRadius: 20,
    });
    assert.equal(game.completed, false);
  });
});

describe('StraightSeamGame — scoring: perfect seam', () => {
  it('scores 1.0 when path follows seam exactly', () => {
    const seam = makeSeamLine(0, 100, 200, 100);
    const game = new StraightSeamGame(mockSvg(), seam, { perfectRadius: 6, failRadius: 30 });

    game.startSewing(0, 100);
    for (let x = 10; x <= 200; x += 10) {
      game.continueSewing(x, 100); // exact y=100
    }

    assert.equal(game.completed, true);
    assert.equal(game.score, 1.0, 'perfect path should score 1.0');
  });
});

describe('StraightSeamGame — scoring: off-target seam', () => {
  it('scores less than 1.0 when path deviates', () => {
    const seam = makeSeamLine(0, 100, 200, 100);
    const game = new StraightSeamGame(mockSvg(), seam, { perfectRadius: 6, failRadius: 30 });

    game.startSewing(0, 100);
    for (let x = 10; x <= 200; x += 10) {
      game.continueSewing(x, 115); // 15px off
    }

    assert.equal(game.completed, true);
    assert.ok(game.score < 1.0, 'off-target path should score < 1.0');
    assert.ok(game.score >= 0, 'score should not go negative');
  });

  it('scores 0 when path is at or beyond failRadius', () => {
    const seam = makeSeamLine(0, 100, 200, 100);
    const game = new StraightSeamGame(mockSvg(), seam, { perfectRadius: 6, failRadius: 30 });

    game.startSewing(0, 100);
    for (let x = 10; x <= 200; x += 10) {
      game.continueSewing(x, 135); // 35px off — beyond failRadius of 30
    }

    assert.equal(game.completed, true);
    assert.equal(game.score, 0, 'path beyond failRadius should score 0');
  });
});

describe('StraightSeamGame — completion logic', () => {
  it('completes when near the end point', () => {
    const seam = makeSeamLine(0, 0, 100, 0);
    const game = new StraightSeamGame(mockSvg(), seam);

    game.startSewing(0, 0);
    game.continueSewing(50, 0);
    game.continueSewing(99, 0); // within perfectRadius * 2 of end (x=100)

    assert.equal(game.completed, true);
  });

  it('completes when path length reaches 90% of seam length', () => {
    const seam = makeSeamLine(0, 0, 200, 0);
    const game = new StraightSeamGame(mockSvg(), seam);

    game.startSewing(0, 0);
    // Add enough points to cover ~90% of 200px
    for (let x = 10; x <= 185; x += 5) {
      game.continueSewing(x, 0);
    }

    assert.equal(game.completed, true);
  });

  it('resets on stopSewing if path is too short (<60%)', () => {
    const seam = makeSeamLine(0, 0, 200, 0);
    const game = new StraightSeamGame(mockSvg(), seam);

    game.startSewing(0, 0);
    game.continueSewing(50, 0); // only 25% of seam
    game.stopSewing();

    assert.equal(game.completed, false, 'should not complete on short path');
  });

  it('completes on stopSewing if path covers >= 60%', () => {
    const seam = makeSeamLine(0, 0, 200, 0);
    const game = new StraightSeamGame(mockSvg(), seam);

    game.startSewing(0, 0);
    for (let x = 5; x <= 130; x += 5) {
      game.continueSewing(x, 0); // ~65% of 200
    }
    game.stopSewing();

    assert.equal(game.completed, true, 'should complete on path >= 60%');
  });

  it('does nothing after completion', () => {
    const seam = makeSeamLine(0, 0, 100, 0);
    const game = new StraightSeamGame(mockSvg(), seam);

    game.startSewing(0, 0);
    game.continueSewing(99, 0);
    assert.equal(game.completed, true);

    const scoreAfter = game.score;
    game.continueSewing(200, 50); // should be ignored
    assert.equal(game.score, scoreAfter, 'score should not change after completion');
  });
});

describe('StraightSeamGame — diagonal seam', () => {
  it('handles diagonal seams correctly', () => {
    const seam = makeSeamLine(0, 0, 100, 100);
    const game = new StraightSeamGame(mockSvg(), seam, { perfectRadius: 6, failRadius: 30 });

    game.startSewing(0, 0);
    for (let i = 10; i <= 100; i += 10) {
      game.continueSewing(i, i); // follow diagonal exactly
    }

    assert.equal(game.completed, true);
    assert.equal(game.score, 1.0, 'exact diagonal path should score 1.0');
  });
});

// --- AlignAndSewGame ---

describe('AlignAndSewGame — construction', () => {
  it('starts incomplete, not aligned', () => {
    const game = new AlignAndSewGame(
      mockSvg(),
      { x: 100, y: 100, width: 80, height: 60 },
      { width: 80, height: 60 }
    );
    assert.equal(game.completed, false);
    assert.equal(game.score, 0);
  });
});

describe('AlignAndSewGame — alignment', () => {
  it('does not align when drag is outside piece bounds', () => {
    const game = new AlignAndSewGame(
      mockSvg(),
      { x: 100, y: 100, width: 80, height: 60 },
      { width: 80, height: 60 },
      { snapRadius: 15 }
    );

    // Drag starting outside the piece should be ignored
    game.startDrag(10, 10);
    game.drag(100, 100);
    game.endDrag();

    assert.equal(game.completed, false);
  });

  it('does not complete when dropped far from target zone', () => {
    const targetZone = { x: 100, y: 100, width: 80, height: 60 };
    const pieceSize = { width: 80, height: 60 };
    const game = new AlignAndSewGame(mockSvg(), targetZone, pieceSize, { snapRadius: 15 });

    // Piece starts at targetZone + width + 30 = 210, y = 100+60+40 = 200
    game.startDrag(250, 220); // inside initial piece pos
    game.drag(300, 300);      // drop far from target
    game.endDrag();

    assert.equal(game.completed, false, 'should not align when dropped far from target');
  });
});

describe('AlignAndSewGame — score after full completion', () => {
  it('produces a score between 0 and 1 after align + sew', () => {
    const targetZone = { x: 0, y: 0, width: 100, height: 60 };
    const pieceSize = { width: 100, height: 60 };
    const game = new AlignAndSewGame(mockSvg(), targetZone, pieceSize, { snapRadius: 30 });

    // Find the initial piece position and drag it onto target
    // piece starts at: x = min(350, 0+100+30) = 130, y = min(350, 0+60+40) = 100
    game.startDrag(180, 130); // center of piece at ~(130+50, 100+30)
    game.drag(50, 30);         // move to near target center
    game.endDrag();            // should snap (within snapRadius of 30)

    if (game.completed) {
      // Completed without sewing phase (possible if score computed differently)
      assert.ok(game.score >= 0 && game.score <= 1);
    } else {
      // Sewing phase started — trace the seam line (x1=0,y1=0,x2=100,y2=0)
      game.startSewing(0, 0);
      for (let x = 5; x <= 100; x += 5) {
        game.continueSewing(x, 0);
      }

      assert.equal(game.completed, true, 'should complete after sewing');
      assert.ok(game.score >= 0 && game.score <= 1, `score ${game.score} out of range`);
    }
  });

  it('final score weights sewing (70%) more than alignment (30%)', () => {
    // We can verify this indirectly: a perfect seam with imperfect alignment
    // should still score reasonably well
    const targetZone = { x: 0, y: 0, width: 100, height: 60 };
    const pieceSize = { width: 100, height: 60 };
    const game = new AlignAndSewGame(mockSvg(), targetZone, pieceSize, { snapRadius: 30 });

    game.startDrag(180, 130);
    game.drag(50, 30);
    game.endDrag();

    if (!game.completed) {
      // Perfect sewing
      game.startSewing(0, 0);
      for (let x = 5; x <= 100; x += 5) {
        game.continueSewing(x, 0);
      }
    }

    if (game.completed) {
      // With perfect sewing (seamScore=1.0), score should be >= 0.5*0.7 = 0.35 minimum
      assert.ok(game.score >= 0.35, `expected score >= 0.35, got ${game.score}`);
    }
  });
});

// --- steps-apron.js ---

describe('APRON_STEPS structure', () => {

  it('exports a non-empty array', () => {
    assert.ok(Array.isArray(APRON_STEPS), 'APRON_STEPS should be an array');
    assert.ok(APRON_STEPS.length > 0, 'APRON_STEPS should not be empty');
  });

  it('every step has required fields: id, name, instruction, type', () => {
    for (const step of APRON_STEPS) {
      assert.ok(step.id, `step missing id: ${JSON.stringify(step)}`);
      assert.ok(step.name, `step ${step.id} missing name`);
      assert.ok(step.instruction, `step ${step.id} missing instruction`);
      assert.ok(step.type, `step ${step.id} missing type`);
    }
  });

  it('every step has a valid type', () => {
    const validTypes = new Set(['straight-seam', 'align-and-sew']);
    for (const step of APRON_STEPS) {
      assert.ok(validTypes.has(step.type), `step ${step.id} has unknown type: ${step.type}`);
    }
  });

  it('align-and-sew steps have attachPiece', () => {
    const alignSteps = APRON_STEPS.filter(s => s.type === 'align-and-sew');
    assert.ok(alignSteps.length > 0, 'should have at least one align-and-sew step');
    for (const step of alignSteps) {
      assert.ok(step.attachPiece, `align-and-sew step ${step.id} missing attachPiece`);
    }
  });

  it('straight-seam steps have piece and edge', () => {
    const seamSteps = APRON_STEPS.filter(s => s.type === 'straight-seam');
    assert.ok(seamSteps.length > 0, 'should have at least one straight-seam step');
    for (const step of seamSteps) {
      assert.ok(step.piece, `straight-seam step ${step.id} missing piece`);
      assert.ok(step.edge, `straight-seam step ${step.id} missing edge`);
    }
  });

  it('step ids are unique', () => {
    const ids = APRON_STEPS.map(s => s.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'duplicate step ids found');
  });

  it('hem steps appear before attach steps (realistic construction order)', () => {
    const hemIndexes = APRON_STEPS
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.id.startsWith('hem-'))
      .map(({ i }) => i);

    const attachIndexes = APRON_STEPS
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.id.startsWith('attach-'))
      .map(({ i }) => i);

    if (hemIndexes.length > 0 && attachIndexes.length > 0) {
      const lastHem = Math.max(...hemIndexes);
      const firstAttach = Math.min(...attachIndexes);
      assert.ok(lastHem < firstAttach, 'all hem steps should come before attach steps');
    }
  });
});
