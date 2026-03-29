/* ============================================================
   Thread & Template — Drafting Screen (Stage I)
   SVG pattern editor with anchor manipulation, seam allowances,
   validation, and 3D silhouette preview
   ============================================================ */

import { TOOL, SCREEN, STAGE, DRAFTING } from '../constants.js';
import { INPUT } from '../input.js';
import { getState, updateState, updateNested } from '../state.js';
import { SVGCanvas } from '../drafting/svg-canvas.js';
import { SilhouettePreview } from '../drafting/preview-3d.js';
import { createPattern, moveAnchor } from '../drafting/pattern.js';
import { findAnchorAt, constrainPosition } from '../drafting/anchors.js';
import { validatePattern } from '../drafting/validator.js';
import { loadMeasurements, getMeasurementSet, getProjectTemplate, getAvailableSizes } from '../drafting/measurements.js';
import { showToast } from '../ui.js';
import { navigateTo } from '../navigation.js';
import { deepClone } from '../utils.js';

// --- Module State ---
let _container = null;
let _svgCanvas = null;
let _preview = null;
let _currentPattern = null;
let _activeTool = TOOL.SELECT;
let _draggingAnchor = null;  // { pieceId, anchorId }
let _isPanning = false;
let _lastPanPos = null;
let _dirty = true;
let _selectedSize = 'M';

// --- Lifecycle ---

export async function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.innerHTML = `
    <div class="drafting-toolbar">
      <div class="toolbar-group">
        <label style="font-size:11px; color:var(--color-text-muted); display:flex; align-items:center; gap:6px;">
          Size:
          <select id="size-select" style="background:var(--color-bg-elevated); color:var(--color-text); border:1px solid var(--color-bg-elevated); border-radius:4px; padding:4px 8px; font-size:12px;">
          </select>
        </label>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <label style="font-size:11px; color:var(--color-text-muted); display:flex; align-items:center; gap:4px;">
          <input type="checkbox" id="snap-toggle" checked>
          Snap
        </label>
        <label style="font-size:11px; color:var(--color-text-muted); display:flex; align-items:center; gap:4px;">
          <input type="checkbox" id="seam-toggle" checked>
          Seams
        </label>
      </div>
      <div class="toolbar-separator"></div>
      <button class="btn btn-sm" id="fit-btn">Fit View</button>
      <button class="btn btn-sm btn-primary" id="validate-btn">Validate</button>
    </div>
    <div style="display:flex; flex:1; overflow:hidden;">
      <div class="drafting-canvas-area" id="drafting-svg-area">
        <svg id="drafting-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--color-text-muted)"/>
            </marker>
          </defs>
          <g id="grid-layer"></g>
          <g id="pattern-layer"></g>
          <g id="seam-layer"></g>
          <g id="annotation-layer"></g>
          <g id="anchor-layer"></g>
        </svg>
      </div>
      <div class="drafting-preview-panel">
        <div class="preview-header">Silhouette Preview</div>
        <div class="preview-canvas-wrapper">
          <canvas id="preview-canvas"></canvas>
        </div>
        <div class="validation-panel" id="validation-panel">
          <div class="validation-status" id="validation-status">
            Loading...
          </div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(el);

  // Initialize SVG canvas
  const svgEl = document.getElementById('drafting-svg');
  const svgArea = document.getElementById('drafting-svg-area');
  _svgCanvas = new SVGCanvas(svgEl, svgArea);

  // Initialize preview
  const previewCanvas = document.getElementById('preview-canvas');
  _preview = new SilhouettePreview(previewCanvas);
  _preview.resize();

  // Bind toolbar
  _bindToolbar();

  // Load measurements and create default pattern
  await loadMeasurements();
  _populateSizeSelect();
  _createDefaultPattern();

  // Initial render
  _render();
}

export function unmount() {
  _container = null;
  _svgCanvas = null;
  _preview = null;
  _currentPattern = null;
  _draggingAnchor = null;
}

export function update(dt) {
  if (_dirty) {
    _render();
    _dirty = false;
  }
}

export function onInput(event) {
  switch (event.type) {
    case INPUT.TAP:
      _onTap(event);
      break;
    case INPUT.DRAG_START:
      _onDragStart(event);
      break;
    case INPUT.DRAG:
      _onDrag(event);
      break;
    case INPUT.DRAG_END:
      _onDragEnd(event);
      break;
    case INPUT.PINCH:
      _onPinch(event);
      break;
    case INPUT.MOVE:
      _onHover(event);
      break;
  }
}

export function onResize() {
  if (_svgCanvas) {
    _svgCanvas.resize();
    _dirty = true;
  }
  if (_preview) {
    _preview.resize();
    _preview.render(_currentPattern);
  }
}

// --- Coordinate helper ---

function _toViewport(event) {
  const c = document.getElementById('screen-container');
  if (!c) return { x: event.x, y: event.y };
  const r = c.getBoundingClientRect();
  return { x: event.x + r.left, y: event.y + r.top };
}

// --- Input Handlers ---

function _onTap(event) {
  if (_activeTool === TOOL.SELECT && _currentPattern) {
    const vp = _toViewport(event);
    const svgPos = _svgCanvas.screenToSVG(vp.x, vp.y);
    const anchor = _findAnchorInPattern(svgPos.x, svgPos.y);
    _svgCanvas.setSelectedAnchor(anchor ? anchor.anchorId : null);
    _dirty = true;
  }
}

function _onDragStart(event) {
  if (event.button === 1) {
    _isPanning = true;
    _lastPanPos = { x: event.x, y: event.y };
    return;
  }

  if (_activeTool === TOOL.SELECT && _currentPattern) {
    const vp = _toViewport(event);
    const svgPos = _svgCanvas.screenToSVG(vp.x, vp.y);
    const anchor = _findAnchorInPattern(svgPos.x, svgPos.y);
    if (anchor) {
      _draggingAnchor = anchor;
      _svgCanvas.setSelectedAnchor(anchor.anchorId);
      _dirty = true;
    } else {
      // No anchor hit — pan instead
      _isPanning = true;
      _lastPanPos = { x: event.x, y: event.y };
    }
  }
}

function _onDrag(event) {
  if (_isPanning) {
    const dx = event.x - _lastPanPos.x;
    const dy = event.y - _lastPanPos.y;
    _svgCanvas.pan(dx, dy);
    _lastPanPos = { x: event.x, y: event.y };
    _dirty = true;
    return;
  }

  if (_draggingAnchor && _currentPattern) {
    const vp = _toViewport(event);
    const svgPos = _svgCanvas.screenToSVG(vp.x, vp.y);
    const piece = _currentPattern.pieces.find(p => p.id === _draggingAnchor.pieceId);
    const anchor = piece ? piece.anchors.find(a => a.id === _draggingAnchor.anchorId) : null;

    if (anchor) {
      const state = getState();
      const constrained = constrainPosition(anchor, svgPos.x, svgPos.y, {
        snapToGrid: state.settings.snapToGrid,
        gridSpacing: DRAFTING.GRID_SPACING,
      });

      _currentPattern = moveAnchor(
        _currentPattern,
        _draggingAnchor.pieceId,
        _draggingAnchor.anchorId,
        constrained.x,
        constrained.y
      );
      _dirty = true;
    }
  }
}

function _onDragEnd(event) {
  _draggingAnchor = null;
  _isPanning = false;
  _lastPanPos = null;

  // Update preview after drag
  if (_preview && _currentPattern) {
    _preview.render(_currentPattern);
  }
}

function _onPinch(event) {
  const vp = event.center ? _toViewport({ x: event.center.x, y: event.center.y }) : _toViewport(event);
  _svgCanvas.applyZoom(event.scale, vp.x, vp.y);
  _dirty = true;
}

function _onHover(event) {
  if (!_currentPattern) return;
  const vp = _toViewport(event);
  const svgPos = _svgCanvas.screenToSVG(vp.x, vp.y);
  const anchor = _findAnchorInPattern(svgPos.x, svgPos.y);
  _svgCanvas.setHoveredAnchor(anchor ? anchor.anchorId : null);
  _dirty = true;
}

// --- Pattern Operations ---

function _findAnchorInPattern(svgX, svgY) {
  if (!_currentPattern) return null;

  for (const piece of _currentPattern.pieces) {
    const anchor = findAnchorAt(piece.anchors, svgX, svgY);
    if (anchor) {
      return { pieceId: piece.id, anchorId: anchor.id };
    }
  }
  return null;
}

function _createDefaultPattern() {
  const state = getState();
  const projectId = (state.activeProject && state.activeProject.projectId) || 'apron';
  const template = getProjectTemplate(projectId);
  const measurements = getMeasurementSet(_selectedSize);

  if (!template || !measurements) {
    _setValidationStatus('Failed to load project data', false);
    return;
  }

  _currentPattern = createPattern(template, measurements);

  // Layout pieces with spacing
  _layoutPieces(_currentPattern);

  // Fit view to pattern
  if (_svgCanvas) {
    _svgCanvas.fitToPattern(_currentPattern);
  }

  _setValidationStatus('Drag the corner points (\u25CF) to reshape pieces, then click Validate', null);
  _dirty = true;
}

function _layoutPieces(pattern) {
  // Arrange pieces side by side with padding
  const padding = 40;
  let offsetX = padding;

  for (const piece of pattern.pieces) {
    // Find current bounds
    let minX = Infinity, minY = Infinity;
    for (const a of piece.anchors) {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
    }

    // Shift piece to offset position
    const dx = offsetX - minX;
    const dy = padding - minY;
    for (const a of piece.anchors) {
      a.x += dx;
      a.y += dy;
    }

    // Advance offset for next piece
    let maxX = -Infinity;
    for (const a of piece.anchors) {
      maxX = Math.max(maxX, a.x);
    }
    offsetX = maxX + padding;
  }
}

function _validateCurrentPattern() {
  if (!_currentPattern) return;

  const result = validatePattern(_currentPattern);
  _currentPattern = { ..._currentPattern, validated: result.valid, validationErrors: result.errors };

  if (result.valid) {
    _setValidationStatus('Pattern Valid', true);
    showToast('Pattern validated successfully!', 'success');

    // Save validated pattern to active project state immediately
    const state = getState();
    if (state.activeProject) {
      updateState({
        activeProject: {
          ...state.activeProject,
          pattern: deepClone(_currentPattern),
        },
      });
    }

    _showProceedButton();
  } else {
    _setValidationStatus('Validation Failed', false, result.errors);
    showToast(`${result.errors.length} issue(s) found`, 'error');
    _hideProceedButton();
  }

  _dirty = true;
}

// --- Rendering ---

function _render() {
  if (!_svgCanvas || !_currentPattern) return;

  const state = getState();
  _svgCanvas.renderPattern(_currentPattern, {
    showSeamAllowances: state.settings.showSeamAllowances,
  });

  if (_preview) {
    _preview.render(_currentPattern);
  }
}

// --- UI Helpers ---

function _setValidationStatus(text, isValid, errors) {
  const el = document.getElementById('validation-status');
  const panel = document.getElementById('validation-panel');
  if (!el || !panel) return;

  let html = '';
  if (isValid === true) {
    html = `<div class="validation-status valid">&#10003; ${text}</div>`;
  } else if (isValid === false) {
    html = `<div class="validation-status invalid">&#10007; ${text}</div>`;
    if (errors && errors.length) {
      html += '<ul class="validation-error-list">';
      for (const err of errors) {
        html += `<li>${err.message}</li>`;
      }
      html += '</ul>';
    }
  } else {
    html = `<div class="validation-status">${text}</div>`;
  }
  panel.innerHTML = html;
}

function _populateSizeSelect() {
  const select = document.getElementById('size-select');
  if (!select) return;

  const sizes = getAvailableSizes();
  select.innerHTML = '';
  for (const size of sizes) {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size;
    if (size === _selectedSize) opt.selected = true;
    select.appendChild(opt);
  }
}

function _bindToolbar() {
  // Validate button
  const validateBtn = document.getElementById('validate-btn');
  if (validateBtn) {
    validateBtn.addEventListener('click', () => _validateCurrentPattern());
  }

  // Fit view button
  const fitBtn = document.getElementById('fit-btn');
  if (fitBtn) {
    fitBtn.addEventListener('click', () => {
      if (_svgCanvas && _currentPattern) {
        _svgCanvas.fitToPattern(_currentPattern);
        _dirty = true;
      }
    });
  }

  // Size select
  const sizeSelect = document.getElementById('size-select');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', (e) => {
      _selectedSize = e.target.value;
      _createDefaultPattern();
    });
  }

  // Snap toggle
  const snapToggle = document.getElementById('snap-toggle');
  if (snapToggle) {
    snapToggle.addEventListener('change', (e) => {
      updateNested('settings.snapToGrid', e.target.checked);
    });
  }

  // Seam allowance toggle
  const seamToggle = document.getElementById('seam-toggle');
  if (seamToggle) {
    seamToggle.addEventListener('change', (e) => {
      updateNested('settings.showSeamAllowances', e.target.checked);
      _dirty = true;
    });
  }
}

// --- Proceed to Fabric ---

function _showProceedButton() {
  const panel = document.getElementById('validation-panel');
  if (!panel || panel.querySelector('#proceed-btn')) return;

  const state = getState();
  if (!state.activeProject) {
    // Show hint if no active project
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px; color:var(--color-text-muted); margin-top:8px;';
    hint.textContent = 'Start a project from the Queue to proceed.';
    panel.appendChild(hint);
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'proceed-btn';
  btn.className = 'btn btn-primary';
  btn.style.cssText = 'margin-top:10px; width:100%;';
  btn.textContent = 'Proceed to Fabric \u2192';
  btn.addEventListener('click', _proceedToMaterial);
  panel.appendChild(btn);
}

function _hideProceedButton() {
  const btn = document.getElementById('proceed-btn');
  if (btn) btn.remove();
}

function _proceedToMaterial() {
  const state = getState();
  if (!state.activeProject) {
    showToast('Start a project from the Queue first', 'warning');
    return;
  }

  // Save pattern to active project and advance stage
  const pattern = deepClone(_currentPattern);
  updateState({
    activeProject: {
      ...state.activeProject,
      pattern,
      stage: STAGE.MATERIAL,
      score: { ...state.activeProject.score, accuracy: 1.0 },
    },
  });

  navigateTo(SCREEN.MATERIAL);
}
