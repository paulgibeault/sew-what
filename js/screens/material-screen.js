/* ============================================================
   Thread & Template — Material Layout Screen (Stage II)
   Drag pattern pieces onto a fabric bolt, validate placement
   ============================================================ */

import { SCREEN, STAGE, DRAFTING } from '../constants.js';
import { INPUT } from '../input.js';
import { getState, updateState } from '../state.js';
import { showToast } from '../ui.js';
import { navigateTo } from '../navigation.js';
import { deepClone } from '../utils.js';
import { FabricCanvas } from '../material/fabric-canvas.js';
import { validateLayout } from '../material/layout-validator.js';
import { getOutlinePath, getPieceBounds } from '../drafting/pattern.js';

const PPI = DRAFTING.PX_PER_INCH;
const BOLT_WIDTH = 45;   // inches
const BOLT_HEIGHT = 72;  // inches
const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];
const SNAP_DEG = 8;

let _container = null;
let _el = null;
let _fabricCanvas = null;
let _pattern = null;
let _placedPieces = [];
// Interaction state — only one active at a time
let _mode = 'idle'; // 'idle' | 'dragging' | 'rotating' | 'panning' | 'tray-drag'
let _drag = null;    // { pieceId, offsetX, offsetY }
let _rotate = null;  // { pieceId, cx, cy, startAngle, startRot }
let _trayDrag = null; // { pieceId, x, y }
let _panLast = null;
let _dirty = true;
let _validated = false;

export function mount(container) {
  _container = container;

  const state = getState();
  const ap = state.activeProject;
  _pattern = ap ? ap.pattern : null;

  if (!_pattern) {
    _renderPlaceholder(container);
    return;
  }

  if (ap.materialLayout && ap.materialLayout.placedPieces) {
    _placedPieces = deepClone(ap.materialLayout.placedPieces);
  } else {
    _placedPieces = _pattern.pieces.map(p => ({
      pieceId: p.id, x: 0, y: 0, rotation: 0, placed: false,
    }));
  }

  _mode = 'idle';
  _el = document.createElement('div');
  _el.className = 'screen material-screen';
  _el.innerHTML = `
    <div class="material-layout">
      <div class="fabric-bolt-area" id="fabric-bolt-area">
        <svg id="fabric-svg" xmlns="http://www.w3.org/2000/svg"><defs></defs></svg>
      </div>
      <div class="material-sidebar" id="material-sidebar">
        <div class="sidebar-title">Pattern Pieces</div>
        <div class="sidebar-hint">Click to auto-place, or drag onto the bolt.</div>
        <div class="piece-tray" id="piece-tray"></div>
        <div class="sidebar-divider"></div>
        <div class="layout-info" id="layout-info"></div>
        <button class="btn btn-primary" id="validate-layout-btn" style="width:100%; margin-top:8px;">Validate Layout</button>
        <div id="proceed-material-area"></div>
      </div>
    </div>
  `;
  container.appendChild(_el);

  const svgEl = document.getElementById('fabric-svg');
  const boltArea = document.getElementById('fabric-bolt-area');
  _fabricCanvas = new FabricCanvas(svgEl, boltArea);
  _fabricCanvas.setBoltSize(BOLT_WIDTH, BOLT_HEIGHT);

  _renderPieceTray();
  document.getElementById('validate-layout-btn').addEventListener('click', _onValidate);

  _validated = false;
  _dirty = true;
}

export function unmount() {
  _container = null;
  _el = null;
  _fabricCanvas = null;
  _mode = 'idle';
  _drag = null;
  _rotate = null;
  _trayDrag = null;
}

export function update(dt) {
  if (_dirty && _fabricCanvas && _pattern) {
    const ghost = _trayDrag || (_drag ? { pieceId: _drag.pieceId, x: _drag.x, y: _drag.y, rotation: _drag.rotation } : null);
    _fabricCanvas.render(_pattern, _placedPieces, ghost);
    _renderLayoutInfo();
    _dirty = false;
  }
}

export function onInput(event) {
  switch (event.type) {
    case INPUT.TAP:        _onTap(event); break;
    case INPUT.DRAG_START: _onDragStart(event); break;
    case INPUT.DRAG:       _onDrag(event); break;
    case INPUT.DRAG_END:   _onDragEnd(event); break;
    case INPUT.PINCH:      _onPinch(event); break;
  }
}

export function onResize() {
  if (_fabricCanvas) { _fabricCanvas.resize(); _dirty = true; }
}

// --- Coordinate helpers ---

function _vp(event) {
  const c = document.getElementById('screen-container');
  if (!c) return { vx: event.x, vy: event.y };
  const r = c.getBoundingClientRect();
  return { vx: event.x + r.left, vy: event.y + r.top };
}

function _inEl(el, vx, vy) {
  const r = el.getBoundingClientRect();
  return vx >= r.left && vx <= r.right && vy >= r.top && vy <= r.bottom;
}

function _svgPt(event) {
  const { vx, vy } = _vp(event);
  return _fabricCanvas.screenToSVG(vx, vy);
}

function _snap(deg) {
  deg = ((deg % 360) + 360) % 360;
  for (const s of SNAP_ANGLES) {
    if (Math.abs(deg - s) < SNAP_DEG) return s % 360;
  }
  return Math.round(deg);
}

function _grid(v) { return Math.round(v / 10) * 10; }

function _pieceBounds(pieceId) {
  const piece = _pattern.pieces.find(p => p.id === pieceId);
  if (!piece) return { w: 0, h: 0 };
  const b = getPieceBounds(piece);
  return { w: b.width, h: b.height };
}

/**
 * Get the rotated bounding box edges of a placed piece in world space.
 * Returns { left, right, top, bottom } representing the axis-aligned
 * bounding box of the rotated piece.
 */
function _getPlacedEdges(pp) {
  const { w, h } = _pieceBounds(pp.pieceId);
  const cx = pp.x + w / 2;
  const cy = pp.y + h / 2;
  const rot = (pp.rotation || 0) * Math.PI / 180;
  // Compute the 4 corners rotated around center
  const corners = [
    { x: -w/2, y: -h/2 }, { x: w/2, y: -h/2 },
    { x: w/2, y: h/2 },   { x: -w/2, y: h/2 },
  ].map(c => ({
    x: cx + c.x * Math.cos(rot) - c.y * Math.sin(rot),
    y: cy + c.x * Math.sin(rot) + c.y * Math.cos(rot),
  }));
  return {
    left:   Math.min(...corners.map(c => c.x)),
    right:  Math.max(...corners.map(c => c.x)),
    top:    Math.min(...corners.map(c => c.y)),
    bottom: Math.max(...corners.map(c => c.y)),
  };
}

const EDGE_SNAP_DIST = 8; // pixels

/**
 * Snap a piece position so its edges align with bolt edges and other piece edges.
 * Takes the raw (x, y) and returns snapped (x, y).
 */
function _snapToEdges(pieceId, rawX, rawY, rotation) {
  const { w, h } = _pieceBounds(pieceId);
  const rot = (rotation || 0) * Math.PI / 180;

  // Get the AABB of this piece at rawX, rawY
  const cx = rawX + w / 2;
  const cy = rawY + h / 2;
  const corners = [
    { x: -w/2, y: -h/2 }, { x: w/2, y: -h/2 },
    { x: w/2, y: h/2 },   { x: -w/2, y: h/2 },
  ].map(c => ({
    x: cx + c.x * Math.cos(rot) - c.y * Math.sin(rot),
    y: cy + c.x * Math.sin(rot) + c.y * Math.cos(rot),
  }));
  const myLeft   = Math.min(...corners.map(c => c.x));
  const myRight  = Math.max(...corners.map(c => c.x));
  const myTop    = Math.min(...corners.map(c => c.y));
  const myBottom = Math.max(...corners.map(c => c.y));

  // Collect snap targets (X edges and Y edges)
  const boltW = BOLT_WIDTH * PPI;
  const boltH = BOLT_HEIGHT * PPI;
  const xTargets = [0, boltW]; // bolt left and right
  const yTargets = [0, boltH]; // bolt top and bottom

  for (const pp of _placedPieces) {
    if (pp.pieceId === pieceId || !pp.placed) continue;
    const edges = _getPlacedEdges(pp);
    xTargets.push(edges.left, edges.right);
    yTargets.push(edges.top, edges.bottom);
  }

  // Find best X snap
  let bestDx = Infinity;
  let snapX = rawX;
  for (const tx of xTargets) {
    // Snap my left edge to target
    const dLeft = tx - myLeft;
    if (Math.abs(dLeft) < Math.abs(bestDx)) { bestDx = dLeft; }
    // Snap my right edge to target
    const dRight = tx - myRight;
    if (Math.abs(dRight) < Math.abs(bestDx)) { bestDx = dRight; }
  }
  if (Math.abs(bestDx) <= EDGE_SNAP_DIST) {
    snapX = rawX + bestDx;
  } else {
    snapX = _grid(rawX);
  }

  // Find best Y snap
  let bestDy = Infinity;
  let snapY = rawY;
  for (const ty of yTargets) {
    const dTop = ty - myTop;
    if (Math.abs(dTop) < Math.abs(bestDy)) { bestDy = dTop; }
    const dBottom = ty - myBottom;
    if (Math.abs(dBottom) < Math.abs(bestDy)) { bestDy = dBottom; }
  }
  if (Math.abs(bestDy) <= EDGE_SNAP_DIST) {
    snapY = rawY + bestDy;
  } else {
    snapY = _grid(rawY);
  }

  return { x: snapX, y: snapY };
}

// --- Tap: select placed piece on bolt (sidebar clicks handled by DOM) ---

function _onTap(event) {
  if (!_fabricCanvas || !_pattern) return;
  const { vx, vy } = _vp(event);
  const sidebar = document.getElementById('material-sidebar');
  if (sidebar && _inEl(sidebar, vx, vy)) return;

  const svgPos = _fabricCanvas.screenToSVG(vx, vy);
  const hitId = _fabricCanvas.hitTestPiece(svgPos.x, svgPos.y, _pattern, _placedPieces);
  _fabricCanvas.setSelectedPiece(hitId);
  _dirty = true;
}

// --- Drag start ---

function _onDragStart(event) {
  if (!_fabricCanvas || !_pattern) return;
  const { vx, vy } = _vp(event);

  // Started in sidebar? → tray drag
  const sidebar = document.getElementById('material-sidebar');
  if (sidebar && _inEl(sidebar, vx, vy)) {
    // Find which unplaced tray piece
    const trayEls = sidebar.querySelectorAll('.tray-piece:not(.placed)');
    for (const el of trayEls) {
      if (_inEl(el, vx, vy)) {
        const pieceId = el.getAttribute('data-piece-id');
        const piece = _pattern.pieces.find(p => p.id === pieceId);
        if (!piece) return;
        const b = getPieceBounds(piece);
        const svgPos = _fabricCanvas.screenToSVG(vx, vy);
        _mode = 'tray-drag';
        const rawX = svgPos.x - b.width / 2;
        const rawY = svgPos.y - b.height / 2;
        const snapped = _snapToEdges(pieceId, rawX, rawY, 0);
        _trayDrag = {
          pieceId,
          x: snapped.x, y: snapped.y,
          rotation: 0,
        };
        _dirty = true;
        return;
      }
    }
    return;
  }

  const svgPos = _fabricCanvas.screenToSVG(vx, vy);

  // Check if near edge of selected piece → rotate
  const selId = _fabricCanvas.selectedPieceId;
  if (selId) {
    const pp = _placedPieces.find(p => p.pieceId === selId && p.placed);
    if (pp) {
      // Use un-rotated dimensions — center is always pp.x + w/2, pp.y + h/2
      const { w, h } = _pieceBounds(selId);
      const cx = pp.x + w / 2;
      const cy = pp.y + h / 2;
      const dx = svgPos.x - cx;
      const dy = svgPos.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diag = Math.sqrt(w * w + h * h) / 2;
      if (dist > diag * 0.45) {
        _mode = 'rotating';
        _rotate = {
          pieceId: selId, cx, cy,
          startAngle: Math.atan2(dy, dx) * 180 / Math.PI,
          startRot: pp.rotation,
        };
        return;
      }
    }
  }

  // Hit a placed piece → drag it
  const hitId = _fabricCanvas.hitTestPiece(svgPos.x, svgPos.y, _pattern, _placedPieces);
  if (hitId) {
    const pp = _placedPieces.find(p => p.pieceId === hitId);
    if (pp) {
      _mode = 'dragging';
      _drag = {
        pieceId: hitId,
        x: pp.x, y: pp.y,
        rotation: pp.rotation,
        offsetX: svgPos.x - pp.x,
        offsetY: svgPos.y - pp.y,
      };
      _fabricCanvas.setSelectedPiece(hitId);
      _dirty = true;
      return;
    }
  }

  // Nothing hit → pan
  _mode = 'panning';
  _panLast = { x: event.x, y: event.y };
}

// --- Drag move ---

function _onDrag(event) {
  if (!_fabricCanvas) return;

  if (_mode === 'panning') {
    const dx = event.x - _panLast.x;
    const dy = event.y - _panLast.y;
    _fabricCanvas.pan(dx, dy);
    _panLast = { x: event.x, y: event.y };
    _dirty = true;
    return;
  }

  const svgPos = _svgPt(event);

  if (_mode === 'tray-drag' && _trayDrag) {
    const piece = _pattern.pieces.find(p => p.id === _trayDrag.pieceId);
    if (piece) {
      const b = getPieceBounds(piece);
      const rawX = svgPos.x - b.width / 2;
      const rawY = svgPos.y - b.height / 2;
      const snapped = _snapToEdges(_trayDrag.pieceId, rawX, rawY, _trayDrag.rotation);
      _trayDrag.x = snapped.x;
      _trayDrag.y = snapped.y;
    }
    _dirty = true;
    return;
  }

  if (_mode === 'rotating' && _rotate) {
    const dx = svgPos.x - _rotate.cx;
    const dy = svgPos.y - _rotate.cy;
    const cur = Math.atan2(dy, dx) * 180 / Math.PI;
    const delta = cur - _rotate.startAngle;
    const newRot = _snap(_rotate.startRot + delta);
    const idx = _placedPieces.findIndex(p => p.pieceId === _rotate.pieceId);
    if (idx >= 0) _placedPieces[idx] = { ..._placedPieces[idx], rotation: newRot };
    _validated = false;
    _dirty = true;
    return;
  }

  if (_mode === 'dragging' && _drag) {
    const rawX = svgPos.x - _drag.offsetX;
    const rawY = svgPos.y - _drag.offsetY;
    const snapped = _snapToEdges(_drag.pieceId, rawX, rawY, _drag.rotation);
    _drag.x = snapped.x;
    _drag.y = snapped.y;
    // Live-update the placed piece position so the canvas renders it
    const idx = _placedPieces.findIndex(p => p.pieceId === _drag.pieceId);
    if (idx >= 0) {
      _placedPieces[idx] = { ..._placedPieces[idx], x: _drag.x, y: _drag.y };
    }
    _validated = false;
    _dirty = true;
  }
}

// --- Drag end ---

function _onDragEnd(event) {
  if (_mode === 'tray-drag' && _trayDrag) {
    // Place the piece wherever it was dropped
    const idx = _placedPieces.findIndex(p => p.pieceId === _trayDrag.pieceId);
    if (idx >= 0) {
      _placedPieces[idx] = {
        ..._placedPieces[idx],
        x: _trayDrag.x, y: _trayDrag.y,
        rotation: 0, placed: true,
      };
      _fabricCanvas.setSelectedPiece(_trayDrag.pieceId);
      _renderPieceTray();
    }
    _trayDrag = null;
    _validated = false;
    _dirty = true;
  }

  _mode = 'idle';
  _drag = null;
  _rotate = null;
  _panLast = null;
}

function _onPinch(event) {
  if (!_fabricCanvas) return;
  const { vx, vy } = _vp(event.center || event);
  _fabricCanvas.applyZoom(event.scale, vx, vy);
  _dirty = true;
}

// --- Tray: click to auto-place centered on bolt ---

function _onTrayClick(e) {
  const el = e.currentTarget;
  const pieceId = el.getAttribute('data-piece-id');
  const pp = _placedPieces.find(p => p.pieceId === pieceId);
  if (pp && pp.placed) return;

  const piece = _pattern.pieces.find(p => p.id === pieceId);
  if (!piece) return;

  const b = getPieceBounds(piece);
  const boltW = BOLT_WIDTH * PPI;
  const boltH = BOLT_HEIGHT * PPI;

  // Center on bolt
  const cx = _grid((boltW - b.width) / 2);
  const cy = _grid((boltH - b.height) / 2);

  const idx = _placedPieces.findIndex(p => p.pieceId === pieceId);
  if (idx >= 0) {
    _placedPieces[idx] = { ..._placedPieces[idx], x: cx, y: cy, placed: true };
  }
  _fabricCanvas.setSelectedPiece(pieceId);
  _renderPieceTray();
  _validated = false;
  _dirty = true;
}

// --- Validation ---

function _onValidate() {
  if (!_pattern) return;
  const layout = { boltWidth: BOLT_WIDTH, boltLength: BOLT_HEIGHT, placedPieces: _placedPieces };
  const result = validateLayout(layout, _pattern);

  if (result.valid) {
    _validated = true;
    showToast(`Layout valid! ${result.yardageUsed} yd used, ${Math.round(result.efficiency * 100)}% efficient`, 'success');
    _showProceedButton(result);
  } else {
    _validated = false;
    showToast(result.errors[0], 'error');
    _hideProceedButton();
  }
  _renderLayoutInfo();
}

function _showProceedButton(result) {
  const area = document.getElementById('proceed-material-area');
  if (!area) return;
  area.innerHTML = `<button class="btn btn-primary" id="proceed-assembly-btn" style="width:100%; margin-top:8px;">Proceed to Assembly \u2192</button>`;
  document.getElementById('proceed-assembly-btn').addEventListener('click', () => _proceedToAssembly(result));
}

function _hideProceedButton() {
  const area = document.getElementById('proceed-material-area');
  if (area) area.innerHTML = '';
}

function _proceedToAssembly(result) {
  const state = getState();
  if (!state.activeProject) return;
  updateState({
    activeProject: {
      ...state.activeProject,
      materialLayout: {
        boltWidth: BOLT_WIDTH, boltLength: BOLT_HEIGHT,
        placedPieces: deepClone(_placedPieces),
        yardageUsed: result.yardageUsed, efficiency: result.efficiency,
      },
      stage: STAGE.ASSEMBLY,
      score: { ...state.activeProject.score, efficiency: result.efficiency },
    },
  });
  navigateTo(SCREEN.ASSEMBLY);
}

// --- Rendering ---

function _renderPlaceholder(container) {
  const el = document.createElement('div');
  el.className = 'screen material-screen';
  el.innerHTML = `<div class="fabric-bolt-area"><div class="screen-placeholder">
    <span class="placeholder-icon">&#9634;</span>
    <span class="placeholder-label">Fabric Layout</span>
    <span class="placeholder-hint">Validate a pattern in the Drafting stage first</span>
  </div></div>`;
  container.appendChild(el);
}

function _renderPieceTray() {
  const tray = document.getElementById('piece-tray');
  if (!tray || !_pattern) return;

  tray.innerHTML = _pattern.pieces.map(piece => {
    const bounds = getPieceBounds(piece);
    const pp = _placedPieces.find(p => p.pieceId === piece.id);
    const isPlaced = pp && pp.placed;
    const maxDim = Math.max(bounds.width, bounds.height);
    const sc = 50 / maxDim;

    return `
      <div class="tray-piece ${isPlaced ? 'placed' : ''}" data-piece-id="${piece.id}">
        <svg width="${bounds.width * sc + 4}" height="${bounds.height * sc + 4}"
             viewBox="${bounds.x - 2} ${bounds.y - 2} ${bounds.width + 4} ${bounds.height + 4}">
          <path d="${getOutlinePath(piece)}"
                fill="${isPlaced ? 'rgba(92,184,92,0.15)' : 'rgba(196,168,130,0.2)'}"
                stroke="${isPlaced ? '#5cb85c' : '#c4a882'}"
                stroke-width="${2 / sc}" />
        </svg>
        <span class="tray-piece-name">${piece.name}</span>
        ${isPlaced ? '<span class="tray-placed-check">\u2713</span>' : ''}
      </div>`;
  }).join('');

  // Bind click-to-place on unplaced pieces
  tray.querySelectorAll('.tray-piece:not(.placed)').forEach(el => {
    el.addEventListener('click', _onTrayClick);
  });
}

function _renderLayoutInfo() {
  const info = document.getElementById('layout-info');
  if (!info) return;

  const placed = _placedPieces.filter(p => p.placed).length;
  const total = _placedPieces.length;
  const selId = _fabricCanvas && _fabricCanvas.selectedPieceId;
  const selPP = selId && _placedPieces.find(p => p.pieceId === selId && p.placed);

  let html = `
    <div class="info-row"><span>Placed:</span><span>${placed} / ${total}</span></div>
    <div class="info-row"><span>Bolt:</span><span>${BOLT_WIDTH}" x ${BOLT_HEIGHT}"</span></div>`;

  if (selPP) {
    html += `<div class="info-row"><span>Rotation:</span><span>${selPP.rotation}\u00B0</span></div>`;
    html += `<div class="sidebar-hint" style="margin-top:4px;">Drag center to move. Drag edge to rotate (snaps to 45\u00B0).</div>`;
  }
  if (_validated) {
    html += `<div class="info-row valid"><span>Status:</span><span>\u2713 Valid</span></div>`;
  }
  info.innerHTML = html;
}
