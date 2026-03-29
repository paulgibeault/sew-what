/* ============================================================
   Thread & Template — Assembly Puzzles Screen (Stage III)
   Step-by-step construction using actual pattern piece shapes
   ============================================================ */

import { SCREEN, STAGE, DRAFTING, COLORS } from '../constants.js';
import { INPUT } from '../input.js';
import { getState, updateState } from '../state.js';
import { showToast } from '../ui.js';
import { navigateTo } from '../navigation.js';
import { deepClone } from '../utils.js';
import { APRON_STEPS } from '../assembly/steps-apron.js';
import { createAssemblyState, getCurrentStep, completeStep, isAssemblyComplete, getAverageScore } from '../assembly/step-engine.js';
import { StraightSeamGame, AlignAndSewGame } from '../assembly/mini-games.js';
import { getPieceBounds, getOutlinePath } from '../drafting/pattern.js';
import { calculateFinalScore, getGrade } from '../scoring.js';

const PPI = DRAFTING.PX_PER_INCH;

let _container = null;
let _el = null;
let _assemblyState = null;
let _currentGame = null;
let _pattern = null;
let _dirty = true;
let _showResults = false;

// Layout: map piece IDs to positions in the SVG viewBox
let _layout = null;  // { pieceId: { x, y, w, h, scale } }

export function mount(container) {
  _container = container;

  const state = getState();
  const ap = state.activeProject;
  _pattern = ap ? ap.pattern : null;

  if (!_pattern || !ap.materialLayout) {
    _renderPlaceholder(container);
    return;
  }

  // Compute layout from actual pattern pieces
  _layout = _computeLayout(_pattern);

  if (ap.assemblyState) {
    _assemblyState = deepClone(ap.assemblyState);
  } else {
    _assemblyState = createAssemblyState(APRON_STEPS);
  }

  _showResults = false;
  _el = document.createElement('div');
  _el.className = 'screen assembly-screen';
  _el.innerHTML = `
    <div class="assembly-header" id="assembly-header"></div>
    <div class="assembly-canvas-area" id="assembly-canvas-area">
      <svg id="assembly-svg" xmlns="http://www.w3.org/2000/svg"><defs></defs></svg>
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
  if (_currentGame) { _currentGame.destroy(); _currentGame = null; }
  _container = null;
  _el = null;
  _showResults = false;
}

export function update(dt) { if (_dirty) _dirty = false; }

export function onInput(event) {
  if (_showResults || !_currentGame) return;
  const svgPt = _eventToSVG(event);
  if (!svgPt) return;

  switch (event.type) {
    case INPUT.DRAG_START:
      if (_currentGame.startSewing) _currentGame.startSewing(svgPt.x, svgPt.y);
      if (_currentGame.startDrag) _currentGame.startDrag(svgPt.x, svgPt.y);
      break;
    case INPUT.DRAG:
      if (_currentGame.continueSewing) _currentGame.continueSewing(svgPt.x, svgPt.y);
      if (_currentGame.drag) _currentGame.drag(svgPt.x, svgPt.y);
      break;
    case INPUT.DRAG_END:
      if (_currentGame.stopSewing) _currentGame.stopSewing();
      if (_currentGame.endDrag) _currentGame.endDrag();
      break;
  }
}

export function onResize() { _setupSVG(); _dirty = true; }

// --- Coordinate conversion ---

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

// --- Layout computation from actual pattern ---

function _computeLayout(pattern) {
  const layout = {};
  const VIEW_W = 500;
  const VIEW_H = 420;
  const PADDING = 20;

  // Get bounds for each piece
  const pieces = {};
  for (const piece of pattern.pieces) {
    const b = getPieceBounds(piece);
    pieces[piece.id] = { w: b.width, h: b.height, name: piece.name };
  }

  // Find the body piece — it's the largest and anchors the layout
  const body = pieces['apron-body'] || { w: 200, h: 200 };
  const bib = pieces['apron-bib'] || { w: 80, h: 80 };
  const waistband = pieces['apron-waistband'] || { w: 200, h: 20 };
  const strap = pieces['apron-neck-strap'] || { w: 150, h: 15 };

  // Scale everything to fit the viewBox with the body as the dominant piece
  // Body + bib stacked vertically should fill most of the view
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

  // Position: bib on top, body below, centered
  const centerX = VIEW_W / 2;
  const bodyX = centerX - bW / 2;
  const bodyY = VIEW_H / 2 - (bH + bibH) / 2 + bibH;
  const bibX = centerX - bibW / 2;
  const bibY = bodyY - bibH + 2; // slight overlap for seam

  layout['apron-body'] = { x: bodyX, y: bodyY, w: bW, h: bH, scale };
  layout['apron-bib'] = { x: bibX, y: bibY, w: bibW, h: bibH, scale };
  layout['apron-waistband'] = { x: centerX - wbW / 2, y: bodyY - wbH / 2, w: wbW, h: wbH, scale };
  layout['apron-neck-strap'] = { x: centerX - stW / 2, y: bibY - stH - 4, w: stW, h: stH, scale };

  return layout;
}

// --- SVG setup ---

function _setupSVG() {
  const svg = document.getElementById('assembly-svg');
  const area = document.getElementById('assembly-canvas-area');
  if (!svg || !area) return;
  const rect = area.getBoundingClientRect();
  svg.setAttribute('viewBox', '0 0 500 420');
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
}

// --- Step management ---

function _startCurrentStep() {
  if (_currentGame) { _currentGame.destroy(); _currentGame = null; }

  if (isAssemblyComplete(_assemblyState)) {
    _showCompletionResults();
    return;
  }

  const step = getCurrentStep(_assemblyState);
  if (!step) return;

  const svg = document.getElementById('assembly-svg');
  if (!svg) return;

  const existing = svg.querySelector('#mini-game-layer');
  if (existing) existing.remove();

  // Render the apron pieces as background
  _renderAssemblyPieces(svg, step);

  // Create the mini-game based on step type
  if (step.type === 'straight-seam') {
    const seamLine = _getSeamLine(step);
    _currentGame = new StraightSeamGame(svg, seamLine, {
      onComplete: (score) => _onStepComplete(score),
    });
  } else if (step.type === 'align-and-sew') {
    const { targetZone, pieceSize } = _getAlignData(step);
    _currentGame = new AlignAndSewGame(svg, targetZone, pieceSize, {
      onComplete: (score) => _onStepComplete(score),
    });
  }

  _renderStepUI();
}

function _onStepComplete(score) {
  _assemblyState = completeStep(_assemblyState, score);
  _saveAssemblyState();

  const pct = Math.round(score * 100);
  if (score >= 0.7) showToast(`Nice work! ${pct}%`, 'success');
  else if (score >= 0.5) showToast(`Passable: ${pct}%`, 'warning');
  else showToast(`Needs practice: ${pct}%`, 'error');

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

// --- Seam line calculation using actual layout ---

function _getSeamLine(step) {
  const L = _layout[step.piece];
  if (!L) return { x1: 100, y1: 200, x2: 400, y2: 200 };

  const inset = 8; // visual inset for hem fold line

  switch (step.edge) {
    case 'bottom':
      return { x1: L.x + inset, y1: L.y + L.h - inset, x2: L.x + L.w - inset, y2: L.y + L.h - inset };
    case 'top':
      return { x1: L.x + inset, y1: L.y + inset, x2: L.x + L.w - inset, y2: L.y + inset };
    case 'left':
      return { x1: L.x + inset, y1: L.y + inset, x2: L.x + inset, y2: L.y + L.h - inset };
    case 'right':
      return { x1: L.x + L.w - inset, y1: L.y + inset, x2: L.x + L.w - inset, y2: L.y + L.h - inset };
    default:
      return { x1: L.x, y1: L.y + L.h / 2, x2: L.x + L.w, y2: L.y + L.h / 2 };
  }
}

function _getAlignData(step) {
  const bodyL = _layout[step.piece];
  const attachL = _layout[step.attachPiece];
  if (!bodyL || !attachL) {
    return { targetZone: { x: 150, y: 150, width: 200, height: 30 }, pieceSize: { width: 200, height: 30 } };
  }

  switch (step.attachEdge) {
    case 'top-center':
      // Bib attaches to top center of body
      return {
        targetZone: {
          x: bodyL.x + (bodyL.w - attachL.w) / 2,
          y: bodyL.y - attachL.h + 2,
          width: attachL.w,
          height: attachL.h,
        },
        pieceSize: { width: attachL.w, height: attachL.h },
      };
    case 'waist':
      // Waistband sits across the body top edge
      return {
        targetZone: {
          x: bodyL.x + (bodyL.w - attachL.w) / 2,
          y: bodyL.y - attachL.h / 2,
          width: attachL.w,
          height: attachL.h,
        },
        pieceSize: { width: attachL.w, height: attachL.h },
      };
    case 'top-corners':
      // Strap goes across the top of the bib
      return {
        targetZone: {
          x: bodyL.x + (bodyL.w - attachL.w) / 2,
          y: bodyL.y - attachL.h - 4,
          width: attachL.w,
          height: attachL.h,
        },
        pieceSize: { width: attachL.w, height: attachL.h },
      };
    default:
      return {
        targetZone: { x: bodyL.x, y: bodyL.y, width: attachL.w, height: attachL.h },
        pieceSize: { width: attachL.w, height: attachL.h },
      };
  }
}

// --- Render pattern pieces as background ---

function _renderAssemblyPieces(svg, step) {
  let bg = svg.querySelector('#assembly-bg');
  if (bg) bg.remove();

  bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  bg.setAttribute('id', 'assembly-bg');

  // Draw each piece using its actual outline, scaled and positioned
  for (const piece of _pattern.pieces) {
    const L = _layout[piece.id];
    if (!L) continue;

    const bounds = getPieceBounds(piece);
    const isActive = step.piece === piece.id || step.attachPiece === piece.id;
    const isCompleted = _isStepDoneForPiece(piece.id);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // Transform: scale the piece outline to fit the layout position
    const sx = L.w / bounds.width;
    const sy = L.h / bounds.height;
    g.setAttribute('transform', `translate(${L.x - bounds.x * sx}, ${L.y - bounds.y * sy}) scale(${sx}, ${sy})`);

    // Piece fill
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', getOutlinePath(piece));
    path.setAttribute('fill', isActive ? 'rgba(196, 168, 130, 0.18)' : 'rgba(196, 168, 130, 0.10)');
    path.setAttribute('stroke', isActive ? 'rgba(196, 168, 130, 0.5)' : 'rgba(196, 168, 130, 0.2)');
    path.setAttribute('stroke-width', String(1.5 / sx));
    g.appendChild(path);

    // Completed seams indicator
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

    // Label (outside the scaled group)
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

  // Draw fold indicators for hem steps
  if (step.type === 'straight-seam' && step.edge) {
    _renderFoldIndicator(bg, step);
  }

  const gameLayer = svg.querySelector('#mini-game-layer') || svg.lastChild;
  svg.insertBefore(bg, gameLayer);
}

function _renderFoldIndicator(group, step) {
  const L = _layout[step.piece];
  if (!L) return;

  const foldW = 8;

  // Draw the fold zone — a lighter strip along the edge being hemmed
  let fx, fy, fw, fh;
  switch (step.edge) {
    case 'bottom':
      fx = L.x; fy = L.y + L.h - foldW; fw = L.w; fh = foldW;
      break;
    case 'top':
      fx = L.x; fy = L.y; fw = L.w; fh = foldW;
      break;
    case 'left':
      fx = L.x; fy = L.y; fw = foldW; fh = L.h;
      break;
    case 'right':
      fx = L.x + L.w - foldW; fy = L.y; fw = foldW; fh = L.h;
      break;
    default: return;
  }

  // Fold zone background
  const foldRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  _setAttrs(foldRect, {
    x: fx, y: fy, width: fw, height: fh,
    fill: 'rgba(196, 168, 130, 0.12)',
    stroke: 'rgba(196, 168, 130, 0.3)',
    'stroke-width': 0.5,
    'stroke-dasharray': '3 2',
  });
  group.appendChild(foldRect);

  // Fold arrow symbols showing the fold direction
  const arrowSize = 5;
  const arrowCount = step.edge === 'left' || step.edge === 'right' ? 3 : 4;

  for (let i = 0; i < arrowCount; i++) {
    let ax, ay, dir;
    const t = (i + 0.5) / arrowCount;

    switch (step.edge) {
      case 'bottom':
        ax = fx + t * fw; ay = fy + fh / 2; dir = '\u2191'; break; // ↑
      case 'top':
        ax = fx + t * fw; ay = fy + fh / 2; dir = '\u2193'; break; // ↓
      case 'left':
        ax = fx + fw / 2; ay = fy + t * fh; dir = '\u2192'; break; // →
      case 'right':
        ax = fx + fw / 2; ay = fy + t * fh; dir = '\u2190'; break; // ←
    }

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    _setAttrs(arrow, {
      x: ax, y: ay + 3,
      'text-anchor': 'middle',
      fill: 'rgba(196, 168, 130, 0.5)',
      'font-size': 8,
      'pointer-events': 'none',
    });
    arrow.textContent = dir;
    group.appendChild(arrow);
  }

  // "FOLD" label
  const labelX = step.edge === 'left' || step.edge === 'right' ? fx + fw / 2 : fx + fw / 2;
  const labelY = step.edge === 'bottom' ? fy - 4 : step.edge === 'top' ? fy + fh + 10 : fy + fh / 2;
  const foldLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  _setAttrs(foldLabel, {
    x: labelX, y: labelY,
    'text-anchor': 'middle',
    fill: 'rgba(196, 168, 130, 0.4)',
    'font-size': 7,
    'font-family': 'monospace',
    'letter-spacing': '1px',
    'pointer-events': 'none',
  });
  foldLabel.textContent = 'FOLD';
  group.appendChild(foldLabel);
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

// --- Placeholder ---

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
