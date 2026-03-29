/* ============================================================
   Thread & Template — Assembly Mini-Games
   Straight-seam tracing and align-and-attach mechanics
   ============================================================ */

import { COLORS } from '../constants.js';
import { vecDist, clamp } from '../utils.js';

/**
 * StraightSeamGame — player traces a guide line.
 * Score based on average distance from the target path.
 */
export class StraightSeamGame {
  constructor(svgEl, seamLine, options = {}) {
    this._svg = svgEl;
    this._seamLine = seamLine; // { x1, y1, x2, y2 }
    this._playerPath = [];
    this._sewing = false;
    this._completed = false;
    this._score = 0;
    this._onComplete = options.onComplete || (() => {});

    // Tolerance: within this distance (px) = perfect
    this._perfectRadius = options.perfectRadius || 6;
    // Beyond this = fail territory
    this._failRadius = options.failRadius || 30;

    this._gameLayer = null;
    this._init();
  }

  _init() {
    this._gameLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this._gameLayer.setAttribute('id', 'mini-game-layer');
    this._svg.appendChild(this._gameLayer);
    this._render();
  }

  destroy() {
    if (this._gameLayer) {
      this._gameLayer.remove();
      this._gameLayer = null;
    }
  }

  get completed() { return this._completed; }
  get score() { return this._score; }

  /**
   * Start the sewing interaction.
   */
  startSewing(x, y) {
    if (this._completed) return;
    this._sewing = true;
    this._playerPath = [{ x, y }];
    this._render();
  }

  /**
   * Continue sewing — add a point to the player's path.
   */
  continueSewing(x, y) {
    if (!this._sewing || this._completed) return;
    this._playerPath.push({ x, y });

    // Check if we've reached the end of the seam
    const end = { x: this._seamLine.x2, y: this._seamLine.y2 };
    if (vecDist({ x, y }, end) < this._perfectRadius * 2) {
      this._finishSewing();
      return;
    }

    // Also complete if path is long enough relative to seam length
    const seamLen = vecDist(
      { x: this._seamLine.x1, y: this._seamLine.y1 },
      { x: this._seamLine.x2, y: this._seamLine.y2 }
    );
    const pathLen = this._getPathLength();
    if (pathLen >= seamLen * 0.9) {
      this._finishSewing();
      return;
    }

    this._render();
  }

  /**
   * End sewing prematurely (drag end before reaching target).
   */
  stopSewing() {
    if (!this._sewing || this._completed) return;

    // Only count as complete if path is at least 60% of seam length
    const seamLen = vecDist(
      { x: this._seamLine.x1, y: this._seamLine.y1 },
      { x: this._seamLine.x2, y: this._seamLine.y2 }
    );
    const pathLen = this._getPathLength();

    if (pathLen >= seamLen * 0.6) {
      this._finishSewing();
    } else {
      // Reset — too short
      this._sewing = false;
      this._playerPath = [];
      this._render();
    }
  }

  _finishSewing() {
    this._sewing = false;
    this._completed = true;
    this._score = this._calculateScore();
    this._render();
    this._onComplete(this._score);
  }

  _calculateScore() {
    if (this._playerPath.length < 2) return 0;

    const { x1, y1, x2, y2 } = this._seamLine;
    let totalDist = 0;

    for (const pt of this._playerPath) {
      // Distance from point to the seam line segment
      const dist = _pointToSegDist(pt, { x: x1, y: y1 }, { x: x2, y: y2 });
      totalDist += dist;
    }

    const avgDist = totalDist / this._playerPath.length;

    // Score: 1.0 if avgDist <= perfectRadius, 0.0 if avgDist >= failRadius
    const score = 1 - clamp((avgDist - this._perfectRadius) / (this._failRadius - this._perfectRadius), 0, 1);
    return Math.round(score * 100) / 100;
  }

  _getPathLength() {
    let len = 0;
    for (let i = 1; i < this._playerPath.length; i++) {
      len += vecDist(this._playerPath[i - 1], this._playerPath[i]);
    }
    return len;
  }

  _render() {
    this._gameLayer.innerHTML = '';

    const { x1, y1, x2, y2 } = this._seamLine;

    // Guide line (dashed)
    const guide = _svgEl('line', {
      x1, y1, x2, y2,
      stroke: 'rgba(196, 168, 130, 0.5)',
      'stroke-width': 2,
      'stroke-dasharray': '8 4',
    });
    this._gameLayer.appendChild(guide);

    // Start indicator
    const startCircle = _svgEl('circle', {
      cx: x1, cy: y1, r: 6,
      fill: 'none',
      stroke: COLORS.SUCCESS,
      'stroke-width': 1.5,
    });
    this._gameLayer.appendChild(startCircle);

    // End indicator
    const endCircle = _svgEl('circle', {
      cx: x2, cy: y2, r: 6,
      fill: 'none',
      stroke: COLORS.ACCENT,
      'stroke-width': 1.5,
    });
    this._gameLayer.appendChild(endCircle);

    // Player's stitch path
    if (this._playerPath.length > 1) {
      for (let i = 1; i < this._playerPath.length; i++) {
        const p1 = this._playerPath[i - 1];
        const p2 = this._playerPath[i];
        const dist = _pointToSegDist(p2, { x: x1, y: y1 }, { x: x2, y: y2 });

        // Color based on accuracy
        let color;
        if (dist <= this._perfectRadius) {
          color = COLORS.SUCCESS;
        } else if (dist <= this._failRadius * 0.5) {
          color = COLORS.WARNING;
        } else {
          color = COLORS.ERROR;
        }

        // Render as dash segments
        const seg = _svgEl('line', {
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          stroke: color,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        this._gameLayer.appendChild(seg);
      }

      // Needle position
      const last = this._playerPath[this._playerPath.length - 1];
      if (!this._completed) {
        const needle = _svgEl('circle', {
          cx: last.x, cy: last.y, r: 3,
          fill: COLORS.ACCENT_LIGHT,
        });
        this._gameLayer.appendChild(needle);
      }
    }

    // Score display when completed
    if (this._completed) {
      const cx = (x1 + x2) / 2;
      const cy = Math.min(y1, y2) - 20;
      const label = _svgEl('text', {
        x: cx, y: cy,
        'text-anchor': 'middle',
        fill: this._score >= 0.7 ? COLORS.SUCCESS : (this._score >= 0.5 ? COLORS.WARNING : COLORS.ERROR),
        'font-size': 14,
        'font-family': 'monospace',
        'font-weight': 'bold',
      });
      label.textContent = `${Math.round(this._score * 100)}%`;
      this._gameLayer.appendChild(label);
    }
  }
}

/**
 * AlignAndSewGame — player drags a piece to a target zone, then sews.
 */
export class AlignAndSewGame {
  constructor(svgEl, targetZone, pieceSize, options = {}) {
    this._svg = svgEl;
    this._targetZone = targetZone; // { x, y, width, height }
    this._pieceSize = pieceSize;   // { width, height }
    this._piecePos = { x: targetZone.x + 100, y: targetZone.y - 80 }; // start offset
    this._aligned = false;
    this._completed = false;
    this._alignScore = 0;
    this._seamScore = 0;
    this._score = 0;
    this._dragging = false;
    this._seamGame = null;
    this._onComplete = options.onComplete || (() => {});
    this._snapRadius = options.snapRadius || 15;

    this._gameLayer = null;
    this._init();
  }

  _init() {
    this._gameLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this._gameLayer.setAttribute('id', 'mini-game-layer');
    this._svg.appendChild(this._gameLayer);
    this._render();
  }

  destroy() {
    if (this._seamGame) this._seamGame.destroy();
    if (this._gameLayer) {
      this._gameLayer.remove();
      this._gameLayer = null;
    }
  }

  get completed() { return this._completed; }
  get score() { return this._score; }

  startDrag(x, y) {
    if (this._aligned || this._completed) return;
    // Check if within piece
    if (x >= this._piecePos.x && x <= this._piecePos.x + this._pieceSize.width &&
        y >= this._piecePos.y && y <= this._piecePos.y + this._pieceSize.height) {
      this._dragging = true;
    }
  }

  drag(x, y) {
    if (!this._dragging) return;
    this._piecePos.x = x - this._pieceSize.width / 2;
    this._piecePos.y = y - this._pieceSize.height / 2;
    this._render();
  }

  endDrag() {
    if (!this._dragging) return;
    this._dragging = false;

    // Check alignment
    const dx = Math.abs(this._piecePos.x - this._targetZone.x);
    const dy = Math.abs(this._piecePos.y - this._targetZone.y);

    if (dx <= this._snapRadius && dy <= this._snapRadius) {
      // Snap to target
      this._piecePos.x = this._targetZone.x;
      this._piecePos.y = this._targetZone.y;
      this._aligned = true;

      // Score alignment based on how close the initial drop was
      const dist = Math.sqrt(dx * dx + dy * dy);
      this._alignScore = clamp(1 - dist / this._snapRadius, 0.5, 1);

      // Now start the sewing phase
      this._startSewingPhase();
    }

    this._render();
  }

  // Forward sewing events to the seam game
  startSewing(x, y) {
    if (this._seamGame) this._seamGame.startSewing(x, y);
  }

  continueSewing(x, y) {
    if (this._seamGame) this._seamGame.continueSewing(x, y);
  }

  stopSewing() {
    if (this._seamGame) this._seamGame.stopSewing();
  }

  _startSewingPhase() {
    // Create a seam along the join edge
    const tz = this._targetZone;
    const seamLine = {
      x1: tz.x,
      y1: tz.y,
      x2: tz.x + tz.width,
      y2: tz.y,
    };

    this._seamGame = new StraightSeamGame(this._svg, seamLine, {
      onComplete: (seamScore) => {
        this._seamScore = seamScore;
        this._score = this._alignScore * 0.3 + this._seamScore * 0.7;
        this._score = Math.round(this._score * 100) / 100;
        this._completed = true;
        this._render();
        this._onComplete(this._score);
      },
    });
  }

  _render() {
    this._gameLayer.innerHTML = '';

    const tz = this._targetZone;

    // Target zone (dashed outline)
    const target = _svgEl('rect', {
      x: tz.x, y: tz.y, width: tz.width, height: tz.height,
      fill: 'rgba(92, 184, 92, 0.1)',
      stroke: COLORS.SUCCESS,
      'stroke-width': 1,
      'stroke-dasharray': '6 3',
    });
    this._gameLayer.appendChild(target);

    // Target label
    const label = _svgEl('text', {
      x: tz.x + tz.width / 2,
      y: tz.y + tz.height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'rgba(92, 184, 92, 0.5)',
      'font-size': 9,
      'font-family': 'monospace',
    });
    label.textContent = 'DROP HERE';
    if (!this._aligned) this._gameLayer.appendChild(label);

    // Draggable piece
    if (!this._aligned) {
      const piece = _svgEl('rect', {
        x: this._piecePos.x, y: this._piecePos.y,
        width: this._pieceSize.width, height: this._pieceSize.height,
        fill: 'rgba(196, 168, 130, 0.3)',
        stroke: COLORS.ACCENT,
        'stroke-width': 1.5,
        cursor: 'grab',
        rx: 2,
      });
      this._gameLayer.appendChild(piece);
    } else {
      // Aligned piece (solid)
      const piece = _svgEl('rect', {
        x: tz.x, y: tz.y,
        width: tz.width, height: tz.height,
        fill: 'rgba(92, 184, 92, 0.2)',
        stroke: COLORS.SUCCESS,
        'stroke-width': 1.5,
        rx: 2,
      });
      this._gameLayer.appendChild(piece);
    }
  }
}

// --- Helpers ---

function _pointToSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return vecDist(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);

  return vecDist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function _svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}
