/* ============================================================
   Thread & Template — Assembly Puzzles Screen (Stage III)
   Fold-then-sew construction using cloth physics simulation
   ============================================================ */

import { SCREEN, STAGE, DRAFTING, COLORS } from '../constants.js';
import { INPUT } from '../input.js';
import { getState, updateState } from '../state.js';
import { showToast } from '../ui.js';
import { navigateTo } from '../navigation.js';
import { deepClone, clamp } from '../utils.js';
import { APRON_STEPS } from '../assembly/steps-apron.js';
import { createAssemblyState, getCurrentStep, completeStep, isAssemblyComplete, getAverageScore } from '../assembly/step-engine.js';
import { SewingMachine, createStraightSeam } from '../assembly/sewing-machine.js';
import { ClothSim } from '../fabric/cloth-sim.js';
import { ClothRenderer } from '../fabric/cloth-renderer.js';
import { getPieceBounds, getOutlinePath } from '../drafting/pattern.js';
import { calculateFinalScore, getGrade } from '../scoring.js';

const PPI = DRAFTING.PX_PER_INCH;

let _container = null;
let _el = null;
let _assemblyState = null;
let _pattern = null;
let _dirty = true;
let _showResults = false;

// Layout: map piece IDs to positions in the SVG viewBox
let _layout = null;

// Step phase: each step has fold phase then sew phase
let _stepPhase = 'idle'; // 'idle' | 'fold' | 'sew'

// Cloth simulation (fold phase)
let _clothSim = null;
let _clothRenderer = null;
let _clothCanvas = null;
let _foldState = null; // { edge, foldTargetY/X, grabbedParticles, folded }

// Sewing machine (sew phase)
let _sewingMachine = null;
let _sewingCanvas = null;

// Align-and-sew drag state (fold phase for attach steps)
let _alignState = null; // { pieceId, x, y, targetX, targetY, w, h, aligned }

// Keyboard sewing state
let _kbSewing = false;    // Space held down — pedal active
let _kbGuideOffset = 0;   // lateral guidance from A/D keys

/** Check if saved assembly state step IDs match current step definitions */
function _stepsMatch(savedSteps, currentSteps) {
  if (!savedSteps || savedSteps.length !== currentSteps.length) return false;
  return savedSteps.every((s, i) => s.id === currentSteps[i].id);
}

export function mount(container) {
  _container = container;

  const state = getState();
  const ap = state.activeProject;
  _pattern = ap ? ap.pattern : null;

  if (!_pattern || !ap.materialLayout) {
    _renderPlaceholder(container);
    return;
  }

  _layout = _computeLayout(_pattern);

  if (ap.assemblyState && _stepsMatch(ap.assemblyState.steps, APRON_STEPS)) {
    _assemblyState = deepClone(ap.assemblyState);
  } else {
    _assemblyState = createAssemblyState(APRON_STEPS);
  }

  _showResults = false;
  _stepPhase = 'idle';
  _el = document.createElement('div');
  _el.className = 'screen assembly-screen';
  _el.innerHTML = `
    <div class="assembly-header" id="assembly-header"></div>
    <div class="assembly-canvas-area" id="assembly-canvas-area">
      <canvas id="cloth-sim-canvas"></canvas>
      <svg id="assembly-svg" xmlns="http://www.w3.org/2000/svg"><defs></defs></svg>
      <canvas id="sewing-machine-canvas"></canvas>
    </div>
    <div class="assembly-instructions" id="assembly-instructions"></div>
    <div class="assembly-results-overlay" id="results-overlay" style="display:none;"></div>
  `;
  container.appendChild(_el);

  _setupSVG();
  _renderStepUI();
  _startCurrentStep();
  _dirty = true;
}

export function unmount() {
  _saveAssemblyState();
  _cleanupPhase();
  _container = null;
  _el = null;
  _showResults = false;
  _stepPhase = 'idle';
}

function _cleanupPhase() {
  _clothSim = null;
  _clothRenderer = null;
  _clothCanvas = null;
  _foldState = null;
  _alignState = null;
  _sewingMachine = null;
  _sewingCanvas = null;
  _kbSewing = false;
  _kbGuideOffset = 0;
}

export function update(dt) {
  if (_stepPhase === 'fold' && _clothSim && _clothRenderer) {
    _clothSim.update(dt / 1000);
    _clothRenderer.draw(_clothSim);
    // Draw align overlay on top of cloth sim if in align mode
    if (_alignState) _drawAlignOverlay();
    return true;
  }
  if (_stepPhase === 'sew' && _sewingMachine) {
    _sewingMachine.update(dt / 1000);
    _sewingMachine.draw();
    return true;
  }
  if (_dirty) _dirty = false;
  return false;
}

export function onInput(event) {
  if (_showResults) return;

  // Keyboard input — route to phase-specific handler
  if (event.type === INPUT.KEY || event.type === INPUT.KEY_UP) {
    _handleKeyboard(event);
    return;
  }

  if (_stepPhase === 'sew' && _sewingMachine) {
    _handleMachineInput(event);
    return;
  }
  if (_stepPhase === 'fold') {
    if (_foldState) _handleFoldInput(event);
    if (_alignState) _handleAlignInput(event);
    return;
  }
}

export function onResize() {
  _setupSVG();
  if (_clothCanvas && _stepPhase === 'fold') {
    const area = document.getElementById('assembly-canvas-area');
    if (area) {
      const rect = area.getBoundingClientRect();
      _clothCanvas.width = rect.width;
      _clothCanvas.height = rect.height;
    }
  }
  if (_sewingCanvas && _stepPhase === 'sew') {
    const area = document.getElementById('assembly-canvas-area');
    if (area) {
      const rect = area.getBoundingClientRect();
      _sewingCanvas.width = rect.width;
      _sewingCanvas.height = rect.height;
    }
  }
  _dirty = true;
}

// --- Coordinate helpers ---

function _eventToCanvas(event) {
  const area = document.getElementById('assembly-canvas-area');
  if (!area) return { x: event.x, y: event.y };
  const r = area.getBoundingClientRect();
  return { x: event.x - r.left, y: event.y - r.top };
}

function _eventToSVG(event) {
  const svg = document.getElementById('assembly-svg');
  if (!svg) return null;
  const c = document.getElementById('screen-container');
  const cr = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
  const pt = svg.createSVGPoint();
  pt.x = event.x + cr.left;
  pt.y = event.y + cr.top;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return pt.matrixTransform(ctm.inverse());
}

// --- Step management ---

function _startCurrentStep() {
  _cleanupPhase();

  if (isAssemblyComplete(_assemblyState)) {
    _showCompletionResults();
    return;
  }

  const step = getCurrentStep(_assemblyState);
  if (!step) return;

  // Hide all canvases, show SVG for background
  _hideAllCanvases();

  const svg = document.getElementById('assembly-svg');
  if (svg) {
    svg.style.display = 'block';
    const existing = svg.querySelector('#mini-game-layer');
    if (existing) existing.remove();
    _renderAssemblyPieces(svg, step);
  }

  // Start fold phase based on step type
  if (step.type === 'straight-seam') {
    _startFoldPhase(step);
  } else if (step.type === 'align-and-sew') {
    _startAlignPhase(step);
  }

  _renderStepUI();
}

function _hideAllCanvases() {
  const cloth = document.getElementById('cloth-sim-canvas');
  const sew = document.getElementById('sewing-machine-canvas');
  const svg = document.getElementById('assembly-svg');
  if (cloth) cloth.style.display = 'none';
  if (sew) sew.style.display = 'none';
  if (svg) svg.style.display = 'block';
}

// =============================================
// FOLD PHASE — Hem steps (straight-seam)
// =============================================

function _startFoldPhase(step) {
  const area = document.getElementById('assembly-canvas-area');
  _clothCanvas = document.getElementById('cloth-sim-canvas');
  if (!area || !_clothCanvas) return;

  const rect = area.getBoundingClientRect();
  _clothCanvas.width = rect.width;
  _clothCanvas.height = rect.height;
  _clothCanvas.style.display = 'block';
  // Hide SVG during fold phase — cloth canvas takes over
  const svg = document.getElementById('assembly-svg');
  if (svg) svg.style.display = 'none';

  // Get piece dimensions
  const piece = _pattern.pieces.find(p => p.id === step.piece);
  if (!piece) return;
  const bounds = getPieceBounds(piece);

  // Scale piece to fit canvas with padding
  const padding = 40;
  const scaleX = (rect.width - padding * 2) / bounds.width;
  const scaleY = (rect.height - padding * 2) / bounds.height;
  const scale = Math.min(scaleX, scaleY, 3.0);
  const clothW = bounds.width * scale;
  const clothH = bounds.height * scale;
  const originX = (rect.width - clothW) / 2;
  const originY = (rect.height - clothH) / 2;

  // Create cloth sim — use chiffon preset for low gravity and high responsiveness
  _clothSim = new ClothSim({
    width: clothW,
    height: clothH,
    spacing: 10,
    material: 'chiffon',
    originX,
    originY,
  });

  // Pin the edge opposite to the fold edge (the fabric lies flat, fold edge is free)
  const edge = step.edge || 'bottom';
  _pinOppositeEdge(edge);

  // Hem is a small margin — 3 rows of particles (~30px at spacing 10)
  const hemRows = 3;
  _pinMiddleFlat(edge, hemRows);

  _clothRenderer = new ClothRenderer(_clothCanvas, {
    fabricColor: COLORS.ACCENT_DIM,
    drawCreases: true,
    drawSelvedge: false,
  });

  _foldState = {
    edge,
    hemRows,
    dragging: false,
    folded: false,
    scale,
    originX,
    originY,
    clothW,
    clothH,
  };

  _stepPhase = 'fold';
}

function _pinOppositeEdge(edge) {
  switch (edge) {
    case 'bottom': _clothSim.pinTop(); break;
    case 'top':
      for (let c = 0; c < _clothSim.cols; c++) _clothSim.pin(c, _clothSim.rows - 1);
      break;
    case 'left':
      for (let r = 0; r < _clothSim.rows; r++) _clothSim.pin(_clothSim.cols - 1, r);
      break;
    case 'right':
      for (let r = 0; r < _clothSim.rows; r++) _clothSim.pin(0, r);
      break;
  }
}

function _pinMiddleFlat(edge, hemRows) {
  // Pin everything except the fold margin to keep the fabric flat
  switch (edge) {
    case 'bottom':
      for (let r = 0; r < _clothSim.rows - hemRows; r++)
        for (let c = 0; c < _clothSim.cols; c++) _clothSim.pin(c, r);
      break;
    case 'top':
      for (let r = hemRows; r < _clothSim.rows; r++)
        for (let c = 0; c < _clothSim.cols; c++) _clothSim.pin(c, r);
      break;
    case 'left':
      for (let r = 0; r < _clothSim.rows; r++)
        for (let c = hemRows; c < _clothSim.cols; c++) _clothSim.pin(c, r);
      break;
    case 'right':
      for (let r = 0; r < _clothSim.rows; r++)
        for (let c = 0; c < _clothSim.cols - hemRows; c++) _clothSim.pin(c, r);
      break;
  }
}

function _handleFoldInput(event) {
  const pos = _eventToCanvas(event);
  if (!_clothSim || !_foldState || _foldState.folded) return;

  switch (event.type) {
    case INPUT.DRAG_START: {
      // Accept grab anywhere on the canvas — forgiving for touch
      _foldState.dragging = true;
      break;
    }
    case INPUT.DRAG: {
      if (!_foldState.dragging) return;
      // Directly move all hem-edge particles to follow the cursor
      _moveFoldEdge(pos);
      break;
    }
    case INPUT.DRAG_END: {
      if (!_foldState.dragging) return;
      _foldState.dragging = false;
      if (_checkFoldComplete()) {
        _foldState.folded = true;
        showToast('Fold complete! Now sew the hem.', 'success');
        setTimeout(() => _transitionToSew(), 600);
      } else {
        showToast('Drag the edge further to complete the fold', 'warning');
      }
      break;
    }
  }
}

function _moveFoldEdge(pos) {
  const edge = _foldState.edge;
  const sim = _clothSim;

  // Move unpinned particles toward the cursor position
  switch (edge) {
    case 'bottom':
      for (let r = sim.rows - _foldState.hemRows; r < sim.rows; r++) {
        for (let c = 0; c < sim.cols; c++) {
          const p = sim.getParticle(c, r);
          if (!p || p.pinned) continue;
          // Map the particle's X stays the same, Y tracks the cursor
          const frac = (r - (sim.rows - _foldState.hemRows)) / _foldState.hemRows;
          const targetY = pos.y + frac * 8; // small spread
          sim.moveParticle(p, p.x, targetY);
        }
      }
      break;
    case 'top':
      for (let r = 0; r < _foldState.hemRows; r++) {
        for (let c = 0; c < sim.cols; c++) {
          const p = sim.getParticle(c, r);
          if (!p || p.pinned) continue;
          const frac = (_foldState.hemRows - 1 - r) / _foldState.hemRows;
          const targetY = pos.y - frac * 8;
          sim.moveParticle(p, p.x, targetY);
        }
      }
      break;
    case 'left':
      for (let r = 0; r < sim.rows; r++) {
        for (let c = 0; c < _foldState.hemRows; c++) {
          const p = sim.getParticle(c, r);
          if (!p || p.pinned) continue;
          const frac = (_foldState.hemRows - 1 - c) / _foldState.hemRows;
          const targetX = pos.x - frac * 8;
          sim.moveParticle(p, targetX, p.y);
        }
      }
      break;
    case 'right':
      for (let r = 0; r < sim.rows; r++) {
        for (let c = sim.cols - _foldState.hemRows; c < sim.cols; c++) {
          const p = sim.getParticle(c, r);
          if (!p || p.pinned) continue;
          const frac = (c - (sim.cols - _foldState.hemRows)) / _foldState.hemRows;
          const targetX = pos.x + frac * 8;
          sim.moveParticle(p, targetX, p.y);
        }
      }
      break;
  }
}

function _checkFoldComplete() {
  const sim = _clothSim;
  const fs = _foldState;
  const edge = fs.edge;

  // Check if the outermost fold-edge particles have crossed the fold hinge
  // The hinge is the first pinned row/col adjacent to the hem margin
  switch (edge) {
    case 'bottom': {
      const hingeRow = sim.rows - fs.hemRows - 1;
      const hingeP = sim.getParticle(0, hingeRow);
      if (!hingeP) return false;
      const hingeY = hingeP.y;
      // Check that most edge particles are above the hinge
      let crossed = 0;
      for (let c = 0; c < sim.cols; c++) {
        const p = sim.getParticle(c, sim.rows - 1);
        if (p && p.y < hingeY + 5) crossed++;
      }
      return crossed >= sim.cols * 0.6;
    }
    case 'top': {
      const hingeP = sim.getParticle(0, fs.hemRows);
      if (!hingeP) return false;
      const hingeY = hingeP.y;
      let crossed = 0;
      for (let c = 0; c < sim.cols; c++) {
        const p = sim.getParticle(c, 0);
        if (p && p.y > hingeY - 5) crossed++;
      }
      return crossed >= sim.cols * 0.6;
    }
    case 'left': {
      const hingeP = sim.getParticle(fs.hemRows, 0);
      if (!hingeP) return false;
      const hingeX = hingeP.x;
      let crossed = 0;
      for (let r = 0; r < sim.rows; r++) {
        const p = sim.getParticle(0, r);
        if (p && p.x > hingeX - 5) crossed++;
      }
      return crossed >= sim.rows * 0.6;
    }
    case 'right': {
      const hingeP = sim.getParticle(sim.cols - fs.hemRows - 1, 0);
      if (!hingeP) return false;
      const hingeX = hingeP.x;
      let crossed = 0;
      for (let r = 0; r < sim.rows; r++) {
        const p = sim.getParticle(sim.cols - 1, r);
        if (p && p.x < hingeX + 5) crossed++;
      }
      return crossed >= sim.rows * 0.6;
    }
    default:
      return false;
  }
}

// =============================================
// ALIGN PHASE — Attach steps (align-and-sew)
// =============================================

function _startAlignPhase(step) {
  const area = document.getElementById('assembly-canvas-area');
  _clothCanvas = document.getElementById('cloth-sim-canvas');
  if (!area || !_clothCanvas) return;

  const rect = area.getBoundingClientRect();
  _clothCanvas.width = rect.width;
  _clothCanvas.height = rect.height;
  _clothCanvas.style.display = 'block';

  const svg = document.getElementById('assembly-svg');
  if (svg) svg.style.display = 'none';

  // Create cloth sim for the main piece
  const mainPiece = _pattern.pieces.find(p => p.id === step.piece);
  const attachPiece = _pattern.pieces.find(p => p.id === step.attachPiece);
  if (!mainPiece) return;

  const mainBounds = getPieceBounds(mainPiece);
  const attachBounds = attachPiece ? getPieceBounds(attachPiece) : { width: 100, height: 30 };

  // Scale to fit canvas
  const padding = 40;
  const totalH = mainBounds.height + attachBounds.height + 20;
  const scaleX = (rect.width - padding * 2) / Math.max(mainBounds.width, attachBounds.width);
  const scaleY = (rect.height - padding * 2) / totalH;
  const scale = Math.min(scaleX, scaleY, 3.0);

  const clothW = mainBounds.width * scale;
  const clothH = mainBounds.height * scale;
  const originX = (rect.width - clothW) / 2;
  const originY = rect.height / 2 - clothH / 2 + attachBounds.height * scale / 2;

  _clothSim = new ClothSim({
    width: clothW,
    height: clothH,
    spacing: 8,
    material: 'cotton',
    originX,
    originY,
  });
  // Pin entire main piece flat (it's the stationary target)
  for (let r = 0; r < _clothSim.rows; r++)
    for (let c = 0; c < _clothSim.cols; c++)
      _clothSim.pin(c, r);

  _clothRenderer = new ClothRenderer(_clothCanvas, {
    fabricColor: COLORS.ACCENT_DIM,
    drawCreases: true,
    drawSelvedge: false,
  });

  // Set up the draggable attach piece
  const attachW = attachBounds.width * scale;
  const attachH = attachBounds.height * scale;
  const { targetZone } = _getAlignDataScaled(step, scale, originX, originY, mainBounds, attachBounds);

  _alignState = {
    pieceId: step.attachPiece,
    x: rect.width - attachW - 30,
    y: 30,
    w: attachW,
    h: attachH,
    targetX: targetZone.x,
    targetY: targetZone.y,
    snapRadius: 20,
    aligned: false,
    dragging: false,
    outlinePath: attachPiece ? getOutlinePath(attachPiece) : null,
    pieceBounds: attachBounds,
    scale,
  };

  _stepPhase = 'fold';
}

function _getAlignDataScaled(step, scale, originX, originY, mainBounds, attachBounds) {
  const mw = mainBounds.width * scale;
  const mh = mainBounds.height * scale;
  const aw = attachBounds.width * scale;
  const ah = attachBounds.height * scale;

  switch (step.attachEdge) {
    case 'top-center':
      return { targetZone: { x: originX + (mw - aw) / 2, y: originY - ah + 4 } };
    case 'waist':
      return { targetZone: { x: originX + (mw - aw) / 2, y: originY - ah / 2 } };
    case 'top-corners':
      return { targetZone: { x: originX + (mw - aw) / 2, y: originY - ah - 4 } };
    default:
      return { targetZone: { x: originX, y: originY } };
  }
}

function _handleAlignInput(event) {
  const pos = _eventToCanvas(event);
  if (!_alignState || _alignState.aligned) return;

  switch (event.type) {
    case INPUT.DRAG_START: {
      const a = _alignState;
      if (pos.x >= a.x && pos.x <= a.x + a.w && pos.y >= a.y && pos.y <= a.y + a.h) {
        a.dragging = true;
        a.offsetX = pos.x - a.x;
        a.offsetY = pos.y - a.y;
      }
      break;
    }
    case INPUT.DRAG: {
      if (!_alignState.dragging) return;
      _alignState.x = pos.x - _alignState.offsetX;
      _alignState.y = pos.y - _alignState.offsetY;
      break;
    }
    case INPUT.DRAG_END: {
      if (!_alignState.dragging) return;
      _alignState.dragging = false;
      const dx = Math.abs(_alignState.x - _alignState.targetX);
      const dy = Math.abs(_alignState.y - _alignState.targetY);
      if (dx <= _alignState.snapRadius && dy <= _alignState.snapRadius) {
        _alignState.x = _alignState.targetX;
        _alignState.y = _alignState.targetY;
        _alignState.aligned = true;
        showToast('Aligned! Now sew the seam.', 'success');
        setTimeout(() => _transitionToSew(), 600);
      }
      break;
    }
  }
}

// Override cloth renderer draw to also show the align piece
const _originalClothRendererDraw = ClothRenderer.prototype.draw;

export function _drawAlignOverlay() {
  if (!_alignState || !_clothCanvas) return;
  const ctx = _clothCanvas.getContext('2d');
  const a = _alignState;

  ctx.save();
  if (a.outlinePath && a.pieceBounds) {
    // Draw the attach piece using its shape
    const b = a.pieceBounds;
    const sx = a.w / b.width;
    const sy = a.h / b.height;
    ctx.translate(a.x - b.x * sx, a.y - b.y * sy);
    ctx.scale(sx, sy);
    const path2d = new Path2D(a.outlinePath);
    ctx.fillStyle = a.aligned ? 'rgba(92, 184, 92, 0.3)' : 'rgba(196, 168, 130, 0.4)';
    ctx.fill(path2d);
    ctx.strokeStyle = a.aligned ? COLORS.SUCCESS : COLORS.ACCENT;
    ctx.lineWidth = 2 / sx;
    ctx.stroke(path2d);
  } else {
    // Rectangle fallback
    ctx.fillStyle = a.aligned ? 'rgba(92, 184, 92, 0.3)' : 'rgba(196, 168, 130, 0.4)';
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = a.aligned ? COLORS.SUCCESS : COLORS.ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
  }
  ctx.restore();

  // Draw target zone indicator if not aligned
  if (!a.aligned) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COLORS.SUCCESS;
    ctx.lineWidth = 1;
    ctx.strokeRect(a.targetX, a.targetY, a.w, a.h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(92, 184, 92, 0.15)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DROP HERE', a.targetX + a.w / 2, a.targetY + a.h / 2 + 4);
    ctx.restore();
  }
}

// =============================================
// TRANSITION: fold → sew
// =============================================

function _transitionToSew() {
  const step = getCurrentStep(_assemblyState);
  if (!step) return;

  // Hide cloth canvas, show sewing machine
  if (_clothCanvas) _clothCanvas.style.display = 'none';
  _clothSim = null;
  _clothRenderer = null;
  _foldState = null;
  _alignState = null;

  const area = document.getElementById('assembly-canvas-area');
  _sewingCanvas = document.getElementById('sewing-machine-canvas');
  if (!area || !_sewingCanvas) return;

  const rect = area.getBoundingClientRect();
  _sewingCanvas.width = rect.width;
  _sewingCanvas.height = rect.height;
  _sewingCanvas.style.display = 'block';

  // Get seam length
  const seamLine = _getSeamLine(step);
  const dx = seamLine.x2 - seamLine.x1;
  const dy = seamLine.y2 - seamLine.y1;
  const lengthPx = Math.sqrt(dx * dx + dy * dy);
  const seamDef = createStraightSeam(lengthPx, DRAFTING.DEFAULT_SEAM_ALLOW, step.name);

  _sewingMachine = new SewingMachine(_sewingCanvas, {
    width: rect.width,
    height: rect.height,
    onEvent: (evt) => {
      if (evt.type === 'complete') {
        _sewingCanvas.style.display = 'none';
        _sewingMachine = null;
        _stepPhase = 'idle';
        _onStepComplete(evt.score);
      }
    },
  });
  _sewingMachine.loadSeam(seamDef);
  _stepPhase = 'sew';

  // Update instruction text
  const instr = document.getElementById('assembly-instructions');
  if (instr) {
    const stepUI = getCurrentStep(_assemblyState);
    instr.innerHTML = `
      <div class="assembly-step-name">${stepUI.name} — Sew the Seam</div>
      <div class="assembly-step-text"><strong>Touch and hold</strong> to start sewing. <strong>Drag down</strong> to go faster. <strong>Drag left/right</strong> to keep fabric aligned with the red 5/8" guide line.</div>
      <div class="assembly-step-detail">Keep the edge steady along the seam allowance guide. A green stitch trail means you're on track.</div>
    `;
  }
}

// =============================================
// SEWING MACHINE INPUT
// =============================================

function _handleMachineInput(event) {
  if (!_sewingCanvas || !_sewingMachine) return;

  // Convert to canvas-local coordinates
  const canvasRect = _sewingCanvas.getBoundingClientRect();
  const localX = event.x - canvasRect.left;
  const localY = event.y - canvasRect.top;

  switch (event.type) {
    case INPUT.DRAG_START:
      _sewingMachine.lowerPresserFoot();
      _sewingMachine.pressPedal(0.5);
      break;
    case INPUT.DRAG: {
      const centerX = _sewingCanvas.width / 2;
      const offsetX = (localX - centerX) * 0.3;
      _sewingMachine.guideFabric(offsetX);
      if (event.startY !== undefined) {
        const dy = localY - (event.startY - canvasRect.top);
        const speed = clamp(0.3 + dy * 0.004, 0.1, 1.0);
        _sewingMachine.pressPedal(speed);
      }
      break;
    }
    case INPUT.DRAG_END:
      _sewingMachine.releasePedal();
      break;
  }
}

// =============================================
// KEYBOARD INPUT
// =============================================

function _handleKeyboard(event) {
  const { key } = event;
  const isDown = event.type === INPUT.KEY;

  // --- Sew phase: Space = pedal hold, A/D = lateral guidance ---
  if (_stepPhase === 'sew' && _sewingMachine) {
    if (key === ' ') {
      if (isDown && !_kbSewing) {
        _kbSewing = true;
        _sewingMachine.lowerPresserFoot();
        _sewingMachine.pressPedal(0.5);
      } else if (!isDown && _kbSewing) {
        _kbSewing = false;
        _sewingMachine.releasePedal();
      }
      return;
    }
    if (isDown) {
      if (key === 'a' || key === 'A' || key === 'ArrowLeft') {
        _kbGuideOffset = clamp(_kbGuideOffset - 8, -60, 60);
        _sewingMachine.guideFabric(_kbGuideOffset);
        return;
      }
      if (key === 'd' || key === 'D' || key === 'ArrowRight') {
        _kbGuideOffset = clamp(_kbGuideOffset + 8, -60, 60);
        _sewingMachine.guideFabric(_kbGuideOffset);
        return;
      }
      // Up/Down arrow: adjust speed while sewing
      if (_kbSewing) {
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          _sewingMachine.pressPedal(0.8);
          return;
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          _sewingMachine.pressPedal(0.3);
          return;
        }
      }
    }
    return;
  }

  // Only handle keydown for fold/align phases
  if (!isDown) return;

  // --- Fold phase: arrow keys nudge the fold edge ---
  if (_stepPhase === 'fold' && _foldState && !_foldState.folded) {
    const NUDGE = 12;
    const area = document.getElementById('assembly-canvas-area');
    if (!area) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      // Synthesise a fold-edge movement
      const rect = area.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Track cumulative position for keyboard folding
      if (!_foldState._kbPos) {
        // Start from the fold edge's natural position
        const edge = _foldState.edge;
        _foldState._kbPos = {
          x: centerX,
          y: edge === 'bottom' ? rect.height - 20 : edge === 'top' ? 20 : centerY,
        };
        if (edge === 'left') _foldState._kbPos.x = 20;
        if (edge === 'right') _foldState._kbPos.x = rect.width - 20;
      }

      if (key === 'ArrowUp')    _foldState._kbPos.y -= NUDGE;
      if (key === 'ArrowDown')  _foldState._kbPos.y += NUDGE;
      if (key === 'ArrowLeft')  _foldState._kbPos.x -= NUDGE;
      if (key === 'ArrowRight') _foldState._kbPos.x += NUDGE;

      _foldState.dragging = true;
      _moveFoldEdge(_foldState._kbPos);
      return;
    }

    // Enter: confirm fold
    if (key === 'Enter') {
      if (_foldState.dragging || _foldState._kbPos) {
        _foldState.dragging = false;
        if (_checkFoldComplete()) {
          _foldState.folded = true;
          showToast('Fold complete! Now sew the hem.', 'success');
          setTimeout(() => _transitionToSew(), 600);
        } else {
          showToast('Drag the edge further to complete the fold', 'warning');
        }
      }
      return;
    }
  }

  // --- Align phase: arrow keys move the attach piece ---
  if (_stepPhase === 'fold' && _alignState && !_alignState.aligned) {
    const NUDGE = 6;
    if (key === 'ArrowUp')    { _alignState.y -= NUDGE; return; }
    if (key === 'ArrowDown')  { _alignState.y += NUDGE; return; }
    if (key === 'ArrowLeft')  { _alignState.x -= NUDGE; return; }
    if (key === 'ArrowRight') { _alignState.x += NUDGE; return; }

    // Enter: try to snap-align
    if (key === 'Enter') {
      const dx = Math.abs(_alignState.x - _alignState.targetX);
      const dy = Math.abs(_alignState.y - _alignState.targetY);
      if (dx <= _alignState.snapRadius && dy <= _alignState.snapRadius) {
        _alignState.x = _alignState.targetX;
        _alignState.y = _alignState.targetY;
        _alignState.aligned = true;
        showToast('Aligned! Now sew the seam.', 'success');
        setTimeout(() => _transitionToSew(), 600);
      } else {
        showToast('Move the piece closer to the target zone', 'warning');
      }
      return;
    }
  }
}

// =============================================
// STEP COMPLETION
// =============================================

function _onStepComplete(score) {
  const pct = Math.round(score * 100);
  const instr = document.getElementById('assembly-instructions');

  if (score < 0.5) {
    // Low score — offer retry before recording
    showToast(`Needs practice: ${pct}%. Try again!`, 'error');
    if (instr) {
      instr.innerHTML = `
        <div class="assembly-step-name">Score: ${pct}%</div>
        <div class="assembly-step-text">Your seam needs more practice. Keep the fabric aligned with the seam allowance guide and maintain steady speed.</div>
      `;
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-primary';
      retryBtn.style.cssText = 'margin-top:8px; margin-right:8px;';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => _transitionToSew());
      instr.appendChild(retryBtn);

      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn';
      acceptBtn.style.cssText = 'margin-top:8px; opacity:0.7;';
      acceptBtn.textContent = `Accept ${pct}%`;
      acceptBtn.addEventListener('click', () => _acceptScore(score));
      instr.appendChild(acceptBtn);
    }
    return;
  }

  _acceptScore(score);
}

function _acceptScore(score) {
  _assemblyState = completeStep(_assemblyState, score);
  _saveAssemblyState();

  const pct = Math.round(score * 100);
  if (score >= 0.7) showToast(`Nice work! ${pct}%`, 'success');
  else showToast(`Passable: ${pct}%`, 'warning');

  _renderStepUI();

  if (isAssemblyComplete(_assemblyState)) {
    setTimeout(() => _showCompletionResults(), 800);
  } else {
    const instr = document.getElementById('assembly-instructions');
    if (instr) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.style.cssText = 'margin-top:8px;';
      btn.textContent = 'Next Step \u2192';
      btn.addEventListener('click', () => _startCurrentStep());
      instr.appendChild(btn);
    }
  }
}

function _saveAssemblyState() {
  const state = getState();
  if (!state.activeProject) return;
  updateState({
    activeProject: { ...state.activeProject, assemblyState: deepClone(_assemblyState) },
  });
}

// --- Layout ---

function _computeLayout(pattern) {
  const layout = {};
  const VIEW_W = 500;
  const VIEW_H = 420;
  const PADDING = 20;

  const pieces = {};
  for (const piece of pattern.pieces) {
    const b = getPieceBounds(piece);
    pieces[piece.id] = { w: b.width, h: b.height, name: piece.name };
  }

  const body = pieces['apron-body'] || { w: 200, h: 200 };
  const bib = pieces['apron-bib'] || { w: 80, h: 80 };
  const waistband = pieces['apron-waistband'] || { w: 200, h: 20 };
  const strap = pieces['apron-neck-strap'] || { w: 150, h: 15 };

  const totalH = body.h + bib.h + strap.h + PADDING * 2;
  const maxW = Math.max(body.w, waistband.w);
  const scaleH = (VIEW_H - PADDING * 2) / totalH;
  const scaleW = (VIEW_W - PADDING * 2) / maxW;
  const scale = Math.min(scaleH, scaleW, 1.0);

  const bW = body.w * scale;
  const bH = body.h * scale;
  const bibW = bib.w * scale;
  const bibH = bib.h * scale;
  const wbW = waistband.w * scale;
  const wbH = Math.max(waistband.h * scale, 8);
  const stW = strap.w * scale;
  const stH = Math.max(strap.h * scale, 6);

  const centerX = VIEW_W / 2;
  const bodyX = centerX - bW / 2;
  const bodyY = VIEW_H / 2 - (bH + bibH) / 2 + bibH;
  const bibX = centerX - bibW / 2;
  const bibY = bodyY - bibH + 2;

  layout['apron-body'] = { x: bodyX, y: bodyY, w: bW, h: bH, scale };
  layout['apron-bib'] = { x: bibX, y: bibY, w: bibW, h: bibH, scale };
  layout['apron-waistband'] = { x: centerX - wbW / 2, y: bodyY - wbH / 2, w: wbW, h: wbH, scale };
  layout['apron-neck-strap'] = { x: centerX - stW / 2, y: bibY - stH - 4, w: stW, h: stH, scale };

  return layout;
}

function _setupSVG() {
  const svg = document.getElementById('assembly-svg');
  const area = document.getElementById('assembly-canvas-area');
  if (!svg || !area) return;
  const rect = area.getBoundingClientRect();
  svg.setAttribute('viewBox', '0 0 500 420');
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
}

function _getSeamLine(step) {
  const L = _layout[step.piece];
  if (!L) return { x1: 100, y1: 200, x2: 400, y2: 200 };
  const inset = 8;
  switch (step.edge) {
    case 'bottom': return { x1: L.x + inset, y1: L.y + L.h - inset, x2: L.x + L.w - inset, y2: L.y + L.h - inset };
    case 'top':    return { x1: L.x + inset, y1: L.y + inset, x2: L.x + L.w - inset, y2: L.y + inset };
    case 'left':   return { x1: L.x + inset, y1: L.y + inset, x2: L.x + inset, y2: L.y + L.h - inset };
    case 'right':  return { x1: L.x + L.w - inset, y1: L.y + inset, x2: L.x + L.w - inset, y2: L.y + L.h - inset };
    default:       return { x1: L.x, y1: L.y + L.h / 2, x2: L.x + L.w, y2: L.y + L.h / 2 };
  }
}

// --- Render assembly pieces as SVG background ---

function _renderAssemblyPieces(svg, step) {
  let bg = svg.querySelector('#assembly-bg');
  if (bg) bg.remove();

  bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  bg.setAttribute('id', 'assembly-bg');

  for (const piece of _pattern.pieces) {
    const L = _layout[piece.id];
    if (!L) continue;

    const bounds = getPieceBounds(piece);
    const isActive = step.piece === piece.id || step.attachPiece === piece.id;
    const isCompleted = _isStepDoneForPiece(piece.id);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const sx = L.w / bounds.width;
    const sy = L.h / bounds.height;
    g.setAttribute('transform', `translate(${L.x - bounds.x * sx}, ${L.y - bounds.y * sy}) scale(${sx}, ${sy})`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', getOutlinePath(piece));
    path.setAttribute('fill', isActive ? 'rgba(196, 168, 130, 0.18)' : 'rgba(196, 168, 130, 0.10)');
    path.setAttribute('stroke', isActive ? 'rgba(196, 168, 130, 0.5)' : 'rgba(196, 168, 130, 0.2)');
    path.setAttribute('stroke-width', String(1.5 / sx));
    g.appendChild(path);

    if (isCompleted) {
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      check.setAttribute('d', getOutlinePath(piece));
      check.setAttribute('fill', 'none');
      check.setAttribute('stroke', 'rgba(92, 184, 92, 0.3)');
      check.setAttribute('stroke-width', String(2 / sx));
      check.setAttribute('stroke-dasharray', `${4 / sx} ${3 / sx}`);
      g.appendChild(check);
    }

    bg.appendChild(g);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    _setAttrs(label, {
      x: L.x + L.w / 2,
      y: L.y + L.h / 2 + 4,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: isActive ? 'rgba(196, 168, 130, 0.6)' : 'rgba(152, 152, 176, 0.35)',
      'font-size': 11,
      'font-family': 'monospace',
      'pointer-events': 'none',
    });
    label.textContent = piece.name.toUpperCase();
    bg.appendChild(label);
  }

  svg.appendChild(bg);
}

function _isStepDoneForPiece(pieceId) {
  if (!_assemblyState) return false;
  return _assemblyState.steps.some(s =>
    s.completed && (s.piece === pieceId || s.attachPiece === pieceId)
  );
}

// --- UI ---

function _renderStepUI() {
  if (!_el || !_assemblyState) return;

  const step = getCurrentStep(_assemblyState);
  const stepIndex = _assemblyState.currentStepIndex;
  const totalSteps = _assemblyState.steps.length;
  const progress = stepIndex / totalSteps * 100;

  const header = _el.querySelector('#assembly-header');
  if (header) {
    header.innerHTML = `
      <div class="assembly-progress">
        <span class="assembly-step-label">Step ${Math.min(stepIndex + 1, totalSteps)} of ${totalSteps}</span>
        <div class="assembly-progress-bar">
          <div class="assembly-progress-fill" style="width:${progress}%"></div>
        </div>
        <span class="assembly-score">${Math.round(getAverageScore(_assemblyState) * 100)}%</span>
      </div>
    `;
  }

  const instr = _el.querySelector('#assembly-instructions');
  if (instr && step) {
    instr.innerHTML = `
      <div class="assembly-step-name">${step.name}</div>
      <div class="assembly-step-text">${step.instruction}</div>
      ${step.detail ? `<div class="assembly-step-detail">${step.detail}</div>` : ''}
    `;
  } else if (instr && isAssemblyComplete(_assemblyState)) {
    instr.innerHTML = `
      <div class="assembly-step-name">Assembly Complete!</div>
      <div class="assembly-step-text">All steps finished. Calculating your score...</div>
    `;
  }
}

// --- Completion ---

function _showCompletionResults() {
  _showResults = true;
  _stepPhase = 'idle';
  const state = getState();
  const ap = state.activeProject;
  if (!ap) return;

  const craftsmanship = getAverageScore(_assemblyState);
  const scores = {
    accuracy: ap.score.accuracy || 1.0,
    efficiency: ap.score.efficiency || 0.5,
    craftsmanship,
  };
  const finalScore = calculateFinalScore(scores);
  const grade = getGrade(finalScore);

  updateState({
    activeProject: { ...ap, assemblyState: deepClone(_assemblyState), score: scores },
  });

  const overlay = _el.querySelector('#results-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="results-content">
      <div class="results-title">Project Complete!</div>
      <div class="results-project-name">${ap.name}</div>
      <div class="results-grade grade-${grade.toLowerCase()}">${grade}</div>
      <div class="results-scores">
        <div class="score-row">
          <span class="score-label">Accuracy (Drafting)</span>
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${scores.accuracy * 100}%"></div></div>
          <span class="score-value">${Math.round(scores.accuracy * 100)}%</span>
        </div>
        <div class="score-row">
          <span class="score-label">Efficiency (Layout)</span>
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${scores.efficiency * 100}%"></div></div>
          <span class="score-value">${Math.round(scores.efficiency * 100)}%</span>
        </div>
        <div class="score-row">
          <span class="score-label">Craftsmanship</span>
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${craftsmanship * 100}%"></div></div>
          <span class="score-value">${Math.round(craftsmanship * 100)}%</span>
        </div>
      </div>
      <div class="results-final">Final Score: ${Math.round(finalScore * 100)}%</div>
      <button class="btn btn-primary" id="return-queue-btn" style="margin-top:16px; width:100%;">Return to Queue</button>
    </div>
  `;
  document.getElementById('return-queue-btn').addEventListener('click', () => _finishProject(scores, grade));
}

function _finishProject(scores, grade) {
  const state = getState();
  const ap = state.activeProject;
  if (!ap) return;

  const inProgress = (state.queue.inProgress || []).filter(p => p.id !== ap.id);
  const finishedItem = {
    id: ap.id, projectId: ap.projectId, name: ap.name, tier: ap.tier,
    grade, score: calculateFinalScore(scores), completedAt: Date.now(),
  };
  const finished = [...(state.queue.finished || []), finishedItem];
  const completedProjects = {
    ...state.player.completedProjects,
    [ap.projectId]: { score: calculateFinalScore(scores), grade, timestamp: Date.now() },
  };

  updateState({
    queue: { ...state.queue, inProgress, finished },
    activeProject: null,
    player: { ...state.player, completedProjects },
  });
  navigateTo(SCREEN.QUEUE);
}

function _renderPlaceholder(container) {
  const el = document.createElement('div');
  el.className = 'screen assembly-screen';
  el.innerHTML = `<div class="assembly-canvas-area"><div class="screen-placeholder">
    <span class="placeholder-icon">&#9881;</span>
    <span class="placeholder-label">Construction Puzzles</span>
    <span class="placeholder-hint">Complete Material Layout to unlock assembly</span>
  </div></div>`;
  container.appendChild(el);
}

function _setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
}
