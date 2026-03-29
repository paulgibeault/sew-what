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

let _container = null;
let _el = null;
let _fabricCanvas = null;
let _pattern = null;
let _placedPieces = [];   // { pieceId, x, y, rotation, placed }
let _dragState = null;    // { pieceId, x, y, rotation, offsetX, offsetY, fromTray }
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

  // Initialize placed pieces from saved state or fresh
  if (ap.materialLayout && ap.materialLayout.placedPieces) {
    _placedPieces = deepClone(ap.materialLayout.placedPieces);
  } else {
    _placedPieces = _pattern.pieces.map(p => ({
      pieceId: p.id,
      x: 0,
      y: 0,
      rotation: 0,
      placed: false,
    }));
  }

  _el = document.createElement('div');
  _el.className = 'screen material-screen';
  _el.innerHTML = `
    <div class="material-layout">
      <div class="fabric-bolt-area" id="fabric-bolt-area">
        <svg id="fabric-svg" xmlns="http://www.w3.org/2000/svg">
          <defs></defs>
        </svg>
      </div>
      <div class="material-sidebar" id="material-sidebar">
        <div class="sidebar-title">Pattern Pieces</div>
        <div class="piece-tray" id="piece-tray"></div>
        <div class="sidebar-divider"></div>
        <div class="layout-info" id="layout-info"></div>
        <button class="btn btn-primary" id="validate-layout-btn" style="width:100%; margin-top:8px;">Validate Layout</button>
        <div id="proceed-material-area"></div>
      </div>
    </div>
  `;
  container.appendChild(_el);

  // Init fabric canvas
  const svgEl = document.getElementById('fabric-svg');
  const boltArea = document.getElementById('fabric-bolt-area');
  _fabricCanvas = new FabricCanvas(svgEl, boltArea);
  _fabricCanvas.setBoltSize(BOLT_WIDTH, BOLT_HEIGHT);

  // Render piece tray
  _renderPieceTray();

  // Bind validate button
  document.getElementById('validate-layout-btn').addEventListener('click', _onValidate);

  _validated = false;
  _dirty = true;
}

export function unmount() {
  _container = null;
  _el = null;
  _fabricCanvas = null;
  _dragState = null;
}

export function update(dt) {
  if (_dirty && _fabricCanvas && _pattern) {
    _fabricCanvas.render(_pattern, _placedPieces, _dragState);
    _renderLayoutInfo();
    _dirty = false;
  }
}

export function onInput(event) {
  switch (event.type) {
    case INPUT.TAP:         _onTap(event); break;
    case INPUT.DRAG_START:  _onDragStart(event); break;
    case INPUT.DRAG:        _onDrag(event); break;
    case INPUT.DRAG_END:    _onDragEnd(event); break;
  }
}

export function onResize() {
  if (_fabricCanvas) {
    _fabricCanvas.resize();
    _dirty = true;
  }
}

// --- Input Helpers ---

/**
 * Convert InputManager coords (container-relative) to viewport coords
 * so we can compare against getBoundingClientRect().
 */
function _toViewport(event) {
  const container = document.getElementById('screen-container');
  if (!container) return { vx: event.x, vy: event.y };
  const cr = container.getBoundingClientRect();
  return { vx: event.x + cr.left, vy: event.y + cr.top };
}

function _isInElement(el, vx, vy) {
  const r = el.getBoundingClientRect();
  return vx >= r.left && vx <= r.right && vy >= r.top && vy <= r.bottom;
}

// --- Input Handlers ---

function _onTap(event) {
  if (!_fabricCanvas || !_pattern) return;

  const { vx, vy } = _toViewport(event);

  // Check if tapping in the sidebar area (piece tray)
  const sidebar = document.getElementById('material-sidebar');
  if (sidebar && _isInElement(sidebar, vx, vy)) {
    return; // Let DOM handle sidebar taps
  }

  // Select/deselect piece on bolt
  const svgPos = _fabricCanvas.screenToSVG(vx, vy);
  const hitId = _fabricCanvas.hitTestPiece(svgPos.x, svgPos.y, _pattern, _placedPieces);

  if (hitId && hitId === _fabricCanvas.selectedPieceId) {
    // Tap selected piece again → rotate it
    _rotatePiece(hitId);
    return;
  }

  _fabricCanvas.setSelectedPiece(hitId);
  _dirty = true;
}

function _onDragStart(event) {
  if (!_fabricCanvas || !_pattern) return;

  const { vx, vy } = _toViewport(event);

  // Check if drag started in the sidebar (piece tray) area
  const sidebar = document.getElementById('material-sidebar');
  if (sidebar && _isInElement(sidebar, vx, vy)) {
    // Find which tray piece was dragged based on DOM position
    const trayPieces = sidebar.querySelectorAll('.tray-piece:not(.placed)');
    for (const trayEl of trayPieces) {
      if (_isInElement(trayEl, vx, vy)) {
        const pieceId = trayEl.getAttribute('data-piece-id');
        const piece = _pattern.pieces.find(p => p.id === pieceId);
        if (!piece) return;

        const svgPos = _fabricCanvas.screenToSVG(vx, vy);
        const bounds = getPieceBounds(piece);
        _dragState = {
          pieceId,
          x: svgPos.x - bounds.width / 2,
          y: svgPos.y - bounds.height / 2,
          rotation: 0,
          offsetX: bounds.width / 2,
          offsetY: bounds.height / 2,
          fromTray: true,
        };
        _fabricCanvas.setSelectedPiece(pieceId);
        _dirty = true;
        return;
      }
    }
    return;
  }

  // Check if dragging a placed piece on the bolt
  const svgPos = _fabricCanvas.screenToSVG(vx, vy);
  const hitId = _fabricCanvas.hitTestPiece(svgPos.x, svgPos.y, _pattern, _placedPieces);
  if (hitId) {
    const pp = _placedPieces.find(p => p.pieceId === hitId);
    if (pp) {
      _dragState = {
        pieceId: hitId,
        x: pp.x,
        y: pp.y,
        rotation: pp.rotation,
        offsetX: svgPos.x - pp.x,
        offsetY: svgPos.y - pp.y,
        fromTray: false,
      };
      _fabricCanvas.setSelectedPiece(hitId);
      _dirty = true;
    }
  }
}

function _onDrag(event) {
  if (!_dragState || !_fabricCanvas) return;

  const { vx, vy } = _toViewport(event);
  const svgPos = _fabricCanvas.screenToSVG(vx, vy);
  _dragState.x = svgPos.x - _dragState.offsetX;
  _dragState.y = svgPos.y - _dragState.offsetY;

  // Snap to grid (10px)
  _dragState.x = Math.round(_dragState.x / 10) * 10;
  _dragState.y = Math.round(_dragState.y / 10) * 10;

  _dirty = true;
}

function _onDragEnd(event) {
  if (!_dragState) return;

  const { pieceId, x, y, rotation } = _dragState;

  // Check if dropped within bolt bounds
  const boltW = BOLT_WIDTH * PPI;
  const boltH = BOLT_HEIGHT * PPI;
  const onBolt = x >= -20 && y >= -20 && x < boltW + 20 && y < boltH + 20;

  if (onBolt) {
    // Clamp to bolt
    const clampedX = Math.max(0, Math.min(x, boltW - 20));
    const clampedY = Math.max(0, Math.min(y, boltH - 20));

    // Update or place the piece
    const idx = _placedPieces.findIndex(p => p.pieceId === pieceId);
    if (idx >= 0) {
      _placedPieces[idx] = {
        ..._placedPieces[idx],
        x: clampedX,
        y: clampedY,
        rotation: _dragState.rotation,
        placed: true,
      };
    }
    _renderPieceTray(); // Update tray to gray out placed piece
  }

  _dragState = null;
  _validated = false;
  _dirty = true;
}

function _rotatePiece(pieceId) {
  const idx = _placedPieces.findIndex(p => p.pieceId === pieceId);
  if (idx < 0) return;

  _placedPieces[idx] = {
    ..._placedPieces[idx],
    rotation: (_placedPieces[idx].rotation + 90) % 360,
  };
  _validated = false;
  _dirty = true;
}

// --- Validation ---

function _onValidate() {
  if (!_pattern) return;

  const layout = {
    boltWidth: BOLT_WIDTH,
    boltLength: BOLT_HEIGHT,
    placedPieces: _placedPieces,
  };

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

  area.innerHTML = `
    <button class="btn btn-primary" id="proceed-assembly-btn" style="width:100%; margin-top:8px;">
      Proceed to Assembly \u2192
    </button>
  `;

  document.getElementById('proceed-assembly-btn').addEventListener('click', () => {
    _proceedToAssembly(result);
  });
}

function _hideProceedButton() {
  const area = document.getElementById('proceed-material-area');
  if (area) area.innerHTML = '';
}

function _proceedToAssembly(result) {
  const state = getState();
  if (!state.activeProject) return;

  const materialLayout = {
    boltWidth: BOLT_WIDTH,
    boltLength: BOLT_HEIGHT,
    placedPieces: deepClone(_placedPieces),
    yardageUsed: result.yardageUsed,
    efficiency: result.efficiency,
  };

  updateState({
    activeProject: {
      ...state.activeProject,
      materialLayout,
      stage: STAGE.ASSEMBLY,
      score: {
        ...state.activeProject.score,
        efficiency: result.efficiency,
      },
    },
  });

  navigateTo(SCREEN.ASSEMBLY);
}

// --- Rendering ---

function _renderPlaceholder(container) {
  const el = document.createElement('div');
  el.className = 'screen material-screen';
  el.innerHTML = `
    <div class="fabric-bolt-area">
      <div class="screen-placeholder">
        <span class="placeholder-icon">&#9634;</span>
        <span class="placeholder-label">Fabric Layout</span>
        <span class="placeholder-hint">Validate a pattern in the Drafting stage first</span>
      </div>
    </div>
  `;
  container.appendChild(el);
}

function _renderPieceTray() {
  const tray = document.getElementById('piece-tray');
  if (!tray || !_pattern) return;

  tray.innerHTML = _pattern.pieces.map(piece => {
    const bounds = getPieceBounds(piece);
    const pp = _placedPieces.find(p => p.pieceId === piece.id);
    const isPlaced = pp && pp.placed;

    // Scale piece to fit in 60px thumbnail
    const maxDim = Math.max(bounds.width, bounds.height);
    const thumbScale = 50 / maxDim;
    const thumbW = bounds.width * thumbScale;
    const thumbH = bounds.height * thumbScale;

    return `
      <div class="tray-piece ${isPlaced ? 'placed' : ''}" data-piece-id="${piece.id}">
        <svg width="${thumbW + 4}" height="${thumbH + 4}" viewBox="${bounds.x - 2} ${bounds.y - 2} ${bounds.width + 4} ${bounds.height + 4}" xmlns="http://www.w3.org/2000/svg">
          <path d="${getOutlinePath(piece)}"
                fill="${isPlaced ? 'rgba(92, 184, 92, 0.15)' : 'rgba(196, 168, 130, 0.2)'}"
                stroke="${isPlaced ? '#5cb85c' : '#c4a882'}"
                stroke-width="${2 / thumbScale}" />
        </svg>
        <span class="tray-piece-name">${piece.name}</span>
        ${isPlaced ? '<span class="tray-placed-check">\u2713</span>' : ''}
      </div>
    `;
  }).join('');
}

function _renderLayoutInfo() {
  const info = document.getElementById('layout-info');
  if (!info) return;

  const placed = _placedPieces.filter(p => p.placed).length;
  const total = _placedPieces.length;

  let html = `
    <div class="info-row">
      <span>Placed:</span>
      <span>${placed} / ${total}</span>
    </div>
    <div class="info-row">
      <span>Bolt:</span>
      <span>${BOLT_WIDTH}" x ${BOLT_HEIGHT}"</span>
    </div>
  `;

  if (_validated) {
    html += `<div class="info-row valid"><span>Status:</span><span>\u2713 Valid</span></div>`;
  }

  info.innerHTML = html;
}
