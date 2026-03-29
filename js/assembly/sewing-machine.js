/* ============================================================
   Thread & Template — Sewing Machine Mechanic
   C1: Virtual sewing machine simulation

   Replaces the boring "trace a line" StraightSeamGame with a
   realistic sewing machine operation:

   - Player holds/taps a "pedal" to drive the needle
   - Fabric feeds top-to-bottom through the machine
   - Player guides fabric laterally to maintain seam allowance
   - Scoring based on: SA consistency, speed control, backstitching

   Coordinate system:
   - Machine view is a fixed viewport (throat plate area)
   - Fabric piece moves through the viewport as stitches advance
   - Origin (0,0) = needle position (center-left of viewport)

   Usage:
     const machine = new SewingMachine(canvas, options);
     machine.loadSeam(seamDef);
     machine.update(deltaMs);
     machine.pressPedal(speed);   // 0-1
     machine.releasePedal();
     machine.guideFabric(offsetX); // lateral offset in px

   Events (call options.onEvent):
     { type: 'stitch', x, y, quality }
     { type: 'complete', score }
     { type: 'backstitch-start' }
     { type: 'backstitch-end' }
   ============================================================ */

import { clamp, lerp, mapRange } from '../utils.js';
import { COLORS, SCORING, DRAFTING } from '../constants.js';

// --- Constants ---

const PX_PER_INCH = DRAFTING.PX_PER_INCH;

/** Common seam allowance guide positions (inches from left edge of throat plate) */
const SEAM_ALLOWANCE_GUIDES = Object.freeze([
  { label: '3/8"', value: 0.375, color: 'rgba(180,160,100,0.5)' },
  { label: '1/2"', value: 0.500, color: 'rgba(180,160,100,0.5)' },
  { label: '5/8"', value: 0.625, color: 'rgba(200,80,80,0.7)' },  // highlighted
  { label: '1"',   value: 1.000, color: 'rgba(180,160,100,0.5)' },
]);

const DEFAULT_SA = 0.625;             // 5/8" standard seam allowance (inches)
const STITCH_LENGTH_MM = 2.5;         // Standard stitch length (mm)
const STITCH_LENGTH_PX = STITCH_LENGTH_MM * PX_PER_INCH / 25.4;

const NEEDLE_BOUNCE_FRAMES = 6;       // Frames per up/down cycle at full speed
const MAX_SPEED = 1.0;                // Pedal speed range 0-1
const FEED_RATE_PX_PER_STITCH = STITCH_LENGTH_PX;

const CURVE_SPEED_PENALTY = 0.4;     // Max speed near tight curves before penalty
const BACKSTITCH_LENGTH = 3;          // Stitches back at start/end

// --- Seam Definition ---

/**
 * @typedef {object} SeamDef
 * @property {Array<{x, y}>} path  - Seam path in fabric-local coordinates
 * @property {number} seamAllowance - SA in inches
 * @property {string} label         - Human-readable label
 */

// --- SewingMachine ---

export class SewingMachine {
  /**
   * @param {HTMLCanvasElement} canvas - Machine viewport canvas
   * @param {object} options
   * @param {number}   [options.width=400]         - Viewport width
   * @param {number}   [options.height=300]         - Viewport height
   * @param {number}   [options.activeGuide=0.625]  - Active SA guide in inches
   * @param {Function} [options.onEvent]             - Event callback
   */
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._width = options.width || canvas.width || 400;
    this._height = options.height || canvas.height || 300;
    this._onEvent = options.onEvent || (() => {});

    // Needle position — fixed in viewport (center-left area)
    this._needleX = this._width * 0.35;
    this._needleY = this._height * 0.45;

    // Active seam allowance guide
    this._activeGuide = options.activeGuide || DEFAULT_SA;

    // Presser foot
    this._presserFootDown = false;

    // Pedal state
    this._pedalSpeed = 0;    // 0-1
    this._pedalPressed = false;

    // Fabric state
    this._fabricOffsetX = 0;  // Lateral guidance offset (px)
    this._fabricFeedY = 0;    // How far fabric has advanced (px, increases as we sew)

    // Seam data
    this._seam = null;
    this._stitchIndex = 0;    // Which point along seam path we're at
    this._stitchProgress = 0; // Sub-step progress (0-1)
    this._stitches = [];      // Placed stitch positions { x, y, quality }

    // Backstitch state
    this._backstitchPhase = 'none'; // 'none' | 'start' | 'end' | 'done'
    this._backstitchCount = 0;

    // Scoring accumulators
    this._saErrors = [];      // SA deviation per stitch (px)
    this._speedPenalties = 0; // Count of over-speed events
    this._backstitched = { start: false, end: false };

    // Needle animation
    this._needlePhase = 0;    // 0-1, drives up/down animation

    // Running state
    this._running = false;
    this._complete = false;
    this._score = 0;
  }

  // --- Public API ---

  /**
   * Load a seam definition. Resets machine state.
   * @param {SeamDef} seamDef
   */
  loadSeam(seamDef) {
    this._seam = seamDef;
    this._stitchIndex = 0;
    this._stitchProgress = 0;
    this._stitches = [];
    this._saErrors = [];
    this._speedPenalties = 0;
    this._backstitched = { start: false, end: false };
    this._backstitchPhase = 'none';
    this._backstitchCount = 0;
    this._fabricFeedY = 0;
    this._fabricOffsetX = 0;
    this._presserFootDown = false;
    this._running = false;
    this._complete = false;
    this._score = 0;
    this._activeGuide = seamDef.seamAllowance || DEFAULT_SA;
  }

  /**
   * Lower the presser foot (required before sewing).
   */
  lowerPresserFoot() {
    this._presserFootDown = true;
    this._running = true;
  }

  /**
   * Raise the presser foot (end sewing or reposition).
   */
  raisePresserFoot() {
    this._presserFootDown = false;
    this._pedalSpeed = 0;
    this._pedalPressed = false;
  }

  /**
   * Press the pedal to sew. Speed 0-1.
   */
  pressPedal(speed = 0.5) {
    if (!this._presserFootDown) return;
    this._pedalPressed = true;
    this._pedalSpeed = clamp(speed, 0, 1);
  }

  /**
   * Release the pedal (stop feeding).
   */
  releasePedal() {
    this._pedalPressed = false;
    this._pedalSpeed = 0;
  }

  /**
   * Guide fabric laterally. offsetX is pixels of displacement from ideal.
   * Negative = toward needle (reducing SA), positive = away (increasing SA).
   */
  guideFabric(offsetX) {
    this._fabricOffsetX = offsetX;
  }

  /**
   * Start a backstitch at the current position.
   * Should be called at start and end of seam.
   */
  startBackstitch() {
    if (this._backstitchPhase === 'none' && this._stitchIndex === 0) {
      this._backstitchPhase = 'start';
      this._backstitchCount = 0;
      this._onEvent({ type: 'backstitch-start' });
    } else if (this._seam && this._stitchIndex >= this._seam.path.length - 2) {
      this._backstitchPhase = 'end';
      this._backstitchCount = 0;
      this._onEvent({ type: 'backstitch-end' });
    }
  }

  /**
   * Get current machine state snapshot.
   */
  getState() {
    return {
      presserFootDown: this._presserFootDown,
      pedalSpeed: this._pedalSpeed,
      fabricOffsetX: this._fabricOffsetX,
      stitchCount: this._stitches.length,
      complete: this._complete,
      score: this._score,
      backstitchPhase: this._backstitchPhase,
      progress: this._seam ? this._stitchIndex / Math.max(1, this._seam.path.length) : 0,
    };
  }

  /**
   * Get the current score (0-1).
   */
  get score() { return this._score; }
  get complete() { return this._complete; }

  /**
   * Update simulation by deltaTime seconds.
   * Call this in your game loop (60fps = dt ≈ 0.0167).
   */
  update(dt) {
    if (this._complete || !this._seam) return;

    // Animate needle
    if (this._pedalPressed && this._presserFootDown) {
      this._needlePhase = (this._needlePhase + this._pedalSpeed / NEEDLE_BOUNCE_FRAMES) % 1;
    }

    // Feed fabric
    if (this._presserFootDown && this._pedalPressed && this._pedalSpeed > 0) {
      this._advanceFabric(dt);
    }
  }

  /**
   * Render the machine view to the canvas.
   */
  draw() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._width, this._height);

    this._drawThroatPlate(ctx);
    this._drawSAGuides(ctx);
    this._drawFabric(ctx);
    this._drawStitches(ctx);
    this._drawPresserFoot(ctx);
    this._drawNeedle(ctx);
  }

  // --- Private: Simulation ---

  _advanceFabric(dt) {
    if (!this._seam || this._seam.path.length < 2) return;

    const path = this._seam.path;
    const feedPx = FEED_RATE_PX_PER_STITCH * this._pedalSpeed;

    this._stitchProgress += feedPx;
    this._fabricFeedY += feedPx;

    // Place stitches when progress advances past a stitch interval
    while (this._stitchProgress >= STITCH_LENGTH_PX) {
      this._stitchProgress -= STITCH_LENGTH_PX;

      if (this._stitchIndex < path.length - 1) {
        this._placeStitch();
        this._stitchIndex++;
      } else {
        // Reached end of seam
        this._finishSeam();
        return;
      }
    }
  }

  _placeStitch() {
    if (!this._seam) return;
    const path = this._seam.path;
    const idx = Math.min(this._stitchIndex, path.length - 1);
    const pt = path[idx];

    // SA error: how far is the fabric edge from the guide line?
    // Positive = too far (large SA), Negative = too close (small SA)
    const guidePx = this._activeGuide * PX_PER_INCH;
    const saError = this._fabricOffsetX; // Player-controlled offset = SA error
    this._saErrors.push(Math.abs(saError));

    // Speed penalty: going too fast around curves
    let curvature = 0;
    if (idx > 0 && idx < path.length - 1) {
      curvature = this._estimateCurvature(path, idx);
    }
    const maxSafeSpeed = lerp(MAX_SPEED, CURVE_SPEED_PENALTY, curvature);
    if (this._pedalSpeed > maxSafeSpeed) {
      this._speedPenalties++;
    }

    // Quality: 1.0 = perfect, degrades with SA error and speed excess
    const saQuality = Math.max(0, 1 - Math.abs(saError) / guidePx);
    const speedQuality = this._pedalSpeed > maxSafeSpeed
      ? Math.max(0, 1 - (this._pedalSpeed - maxSafeSpeed) / MAX_SPEED)
      : 1.0;
    const quality = saQuality * speedQuality;

    // Viewport position: stitch appears near needle, fabric feeds down
    const stitchViewX = this._needleX + saError;
    const stitchViewY = this._needleY;

    this._stitches.push({ x: stitchViewX, y: stitchViewY, quality });

    this._onEvent({ type: 'stitch', x: pt.x, y: pt.y, quality });
  }

  _estimateCurvature(path, idx) {
    const prev = path[idx - 1];
    const curr = path[idx];
    const next = path[idx + 1];

    // Angle change between segments — higher = tighter curve
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
    const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
    if (len1 < 0.01 || len2 < 0.01) return 0;

    const cos = (dx1*dx2 + dy1*dy2) / (len1 * len2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    return clamp(angle / Math.PI, 0, 1); // Normalize to 0-1
  }

  _finishSeam() {
    // Check backstitching at end
    if (this._backstitchPhase === 'end') {
      this._backstitched.end = true;
    }

    this._complete = true;
    this._score = this._computeScore();

    this._onEvent({ type: 'complete', score: this._score });
  }

  _computeScore() {
    if (this._stitches.length === 0) return 0;

    // 1. Seam allowance consistency (60% weight)
    const guidePx = this._activeGuide * PX_PER_INCH;
    const avgSaError = this._saErrors.reduce((a, b) => a + b, 0) / this._saErrors.length;
    const saScore = Math.max(0, 1 - avgSaError / guidePx);

    // 2. Speed control (20% weight)
    const totalStitches = this._stitches.length;
    const speedScore = Math.max(0, 1 - this._speedPenalties / Math.max(1, totalStitches));

    // 3. Backstitching (20% weight)
    const backstitch = (
      (this._backstitched.start ? 0.5 : 0) +
      (this._backstitched.end   ? 0.5 : 0)
    );

    const score = saScore * 0.6 + speedScore * 0.2 + backstitch * 0.2;
    return clamp(score, 0, 1);
  }

  // --- Private: Rendering ---

  _drawThroatPlate(ctx) {
    // Background (machine table)
    ctx.fillStyle = '#2a2020';
    ctx.fillRect(0, 0, this._width, this._height);

    // Throat plate (metal area around needle)
    const plateW = this._width * 0.7;
    const plateH = this._height * 0.85;
    const plateX = (this._width - plateW) / 2;
    const plateY = (this._height - plateH) / 2;

    ctx.fillStyle = '#a8a8b8';
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, plateW, plateH, 8);
    ctx.fill();

    // Feed dog grooves (decorative lines)
    ctx.strokeStyle = '#888898';
    ctx.lineWidth = 1;
    const grooveX = this._needleX;
    for (let gy = plateY + 10; gy < plateY + plateH - 10; gy += 8) {
      ctx.beginPath();
      ctx.moveTo(grooveX - 12, gy);
      ctx.lineTo(grooveX + 12, gy);
      ctx.stroke();
    }

    // Needle hole
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(this._needleX, this._needleY, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawSAGuides(ctx) {
    const plateX = (this._width - this._width * 0.7) / 2;
    const guideTop = this._height * 0.1;
    const guideBot = this._height * 0.9;

    for (const guide of SEAM_ALLOWANCE_GUIDES) {
      const guideX = this._needleX + guide.value * PX_PER_INCH;
      const isActive = Math.abs(guide.value - this._activeGuide) < 0.01;

      ctx.strokeStyle = isActive ? 'rgba(200,100,100,0.9)' : guide.color;
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.setLineDash(isActive ? [] : [4, 4]);

      ctx.beginPath();
      ctx.moveTo(guideX, guideTop);
      ctx.lineTo(guideX, guideBot);
      ctx.stroke();

      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = isActive ? '#ff8080' : 'rgba(200,180,130,0.7)';
      ctx.font = `${isActive ? 'bold ' : ''}10px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(guide.label, guideX, guideTop - 4);
    }

    ctx.textAlign = 'left';
  }

  _drawFabric(ctx) {
    if (!this._seam) return;

    // Draw a simplified fabric strip feeding through
    const fabricWidth = this._width * 0.5;
    const fabricLeft = this._needleX - 5;  // Left of needle
    const fabricRight = fabricLeft + fabricWidth + this._fabricOffsetX;

    ctx.save();
    ctx.fillStyle = 'rgba(210, 190, 160, 0.85)';
    ctx.fillRect(0, 0, fabricRight, this._height);

    // Fabric edge (right edge = the seam allowance edge)
    ctx.strokeStyle = '#8a6030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fabricRight, 0);
    ctx.lineTo(fabricRight, this._height);
    ctx.stroke();

    // Seam line (where needle actually tracks)
    const seamLineX = fabricRight - this._activeGuide * PX_PER_INCH;
    ctx.strokeStyle = 'rgba(100,60,20,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(seamLineX, 0);
    ctx.lineTo(seamLineX, this._height);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  _drawStitches(ctx) {
    if (this._stitches.length < 2) return;

    ctx.save();

    // Draw stitch line
    ctx.beginPath();
    ctx.moveTo(this._stitches[0].x, this._stitches[0].y);

    for (let i = 1; i < this._stitches.length; i++) {
      const s = this._stitches[i];
      const prev = this._stitches[i - 1];

      // Draw thread segment (quality affects color)
      const quality = s.quality;
      const r = Math.round(lerp(180, 60, quality));
      const g = Math.round(lerp(60, 60, quality));
      const b = Math.round(lerp(60, 180, quality));

      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1.5;

      // Dashed for poor quality, solid for good
      ctx.setLineDash(quality < 0.5 ? [2, 3] : []);

      // Feed the stitch trail up the viewport
      const offset = this._stitches.length - i;
      const displayY = this._needleY - offset * STITCH_LENGTH_PX;

      ctx.beginPath();
      ctx.moveTo(prev.x, displayY + STITCH_LENGTH_PX);
      ctx.lineTo(s.x, displayY);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawPresserFoot(ctx) {
    const nx = this._needleX;
    const ny = this._needleY;
    const footY = this._presserFootDown ? ny - 8 : ny - 18;

    ctx.save();
    ctx.fillStyle = this._presserFootDown ? '#888' : '#aaa';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;

    // Presser foot body
    ctx.beginPath();
    ctx.roundRect(nx - 14, footY - 10, 28, 12, 3);
    ctx.fill();
    ctx.stroke();

    // Two toes
    ctx.beginPath();
    ctx.roundRect(nx - 13, footY + 2, 10, 14, 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(nx + 3, footY + 2, 10, 14, 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  _drawNeedle(ctx) {
    const nx = this._needleX;
    const baseY = this._needleY - 30;
    // Needle bounces up/down based on phase
    const bounce = Math.sin(this._needlePhase * Math.PI * 2);
    const needleBot = this._needleY + (this._presserFootDown ? 6 : 0) + bounce * 8;

    ctx.save();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(nx, baseY);
    ctx.lineTo(nx, needleBot);
    ctx.stroke();

    // Needle tip
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nx, needleBot - 4);
    ctx.lineTo(nx, needleBot);
    ctx.stroke();

    // Thread eye (small loop near tip)
    ctx.strokeStyle = 'rgba(180,160,100,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(nx, needleBot - 5, 2, 3, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// --- SeamDef helpers ---

/**
 * Create a simple straight seam definition.
 * @param {number} length - Seam length in pixels
 * @param {number} seamAllowance - SA in inches
 * @param {string} label
 * @returns {SeamDef}
 */
export function createStraightSeam(length, seamAllowance = DEFAULT_SA, label = 'Seam') {
  const steps = Math.max(2, Math.round(length / STITCH_LENGTH_PX));
  const path = [];
  for (let i = 0; i < steps; i++) {
    path.push({ x: 0, y: i * STITCH_LENGTH_PX });
  }
  return { path, seamAllowance, label };
}

/**
 * Create a curved seam definition from a series of control points.
 * Points are in fabric-local coordinates.
 * @param {Array<{x, y}>} controlPoints
 * @param {number} seamAllowance
 * @param {string} label
 * @returns {SeamDef}
 */
export function createCurvedSeam(controlPoints, seamAllowance = DEFAULT_SA, label = 'Curved Seam') {
  if (controlPoints.length < 2) {
    return createStraightSeam(100, seamAllowance, label);
  }

  // Interpolate points along the path
  const path = [];
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const a = controlPoints[i];
    const b = controlPoints[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.max(1, Math.round(dist / STITCH_LENGTH_PX));

    for (let t = 0; t < steps; t++) {
      const frac = t / steps;
      path.push({
        x: a.x + dx * frac,
        y: a.y + dy * frac,
      });
    }
  }
  // Add last point
  path.push({ ...controlPoints[controlPoints.length - 1] });

  return { path, seamAllowance, label };
}
