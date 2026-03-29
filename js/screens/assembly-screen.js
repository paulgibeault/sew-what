/* ============================================================
   Thread & Template — Assembly Puzzles Screen (Stage III)
   Step-by-step construction with mini-game interactions
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

export function mount(container) {
  _container = container;

  const state = getState();
  const ap = state.activeProject;
  _pattern = ap ? ap.pattern : null;

  if (!_pattern || !ap.materialLayout) {
    _renderPlaceholder(container);
    return;
  }

  // Initialize or restore assembly state
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
      <svg id="assembly-svg" xmlns="http://www.w3.org/2000/svg">
        <defs></defs>
      </svg>
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
  if (_currentGame) {
    _currentGame.destroy();
    _currentGame = null;
  }
  _container = null;
  _el = null;
  _showResults = false;
}

export function update(dt) {
  if (_dirty) {
    _dirty = false;
  }
}

export function onInput(event) {
  if (_showResults) return;
  if (!_currentGame) return;

  const svg = document.getElementById('assembly-svg');
  if (!svg) return;

  const pt = svg.createSVGPoint();
  pt.x = event.x;
  pt.y = event.y;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const svgPt = pt.matrixTransform(ctm.inverse());

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

export function onResize() {
  _setupSVG();
  _dirty = true;
}

// --- SVG Setup ---

function _setupSVG() {
  const svg = document.getElementById('assembly-svg');
  const area = document.getElementById('assembly-canvas-area');
  if (!svg || !area) return;

  const rect = area.getBoundingClientRect();
  const viewW = 500;
  const viewH = 400;
  svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
}

// --- Step Management ---

function _startCurrentStep() {
  if (_currentGame) {
    _currentGame.destroy();
    _currentGame = null;
  }

  if (isAssemblyComplete(_assemblyState)) {
    _showCompletionResults();
    return;
  }

  const step = getCurrentStep(_assemblyState);
  if (!step) return;

  const svg = document.getElementById('assembly-svg');
  if (!svg) return;

  // Clear any existing game layers
  const existing = svg.querySelector('#mini-game-layer');
  if (existing) existing.remove();

  // Render background pieces
  _renderAssemblyPieces(svg);

  // Create the appropriate mini-game
  if (step.type === 'straight-seam') {
    const seamLine = _getSeamLineForStep(step);
    _currentGame = new StraightSeamGame(svg, seamLine, {
      onComplete: (score) => _onStepComplete(score),
    });
  } else if (step.type === 'align-and-sew') {
    const { targetZone, pieceSize } = _getAlignDataForStep(step);
    _currentGame = new AlignAndSewGame(svg, targetZone, pieceSize, {
      onComplete: (score) => _onStepComplete(score),
    });
  }

  _renderStepUI();
}

function _onStepComplete(score) {
  _assemblyState = completeStep(_assemblyState, score);
  _saveAssemblyState();

  const friendlyScore = Math.round(score * 100);
  if (score >= 0.7) {
    showToast(`Nice work! ${friendlyScore}%`, 'success');
  } else if (score >= 0.5) {
    showToast(`Passable: ${friendlyScore}%`, 'warning');
  } else {
    showToast(`Needs practice: ${friendlyScore}%`, 'error');
  }

  // Show next step button
  _renderStepUI();

  if (isAssemblyComplete(_assemblyState)) {
    setTimeout(() => _showCompletionResults(), 800);
  } else {
    // Add "Next Step" button
    const instructions = document.getElementById('assembly-instructions');
    if (instructions) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-primary';
      nextBtn.style.cssText = 'margin-top:8px;';
      nextBtn.textContent = 'Next Step \u2192';
      nextBtn.addEventListener('click', () => _startCurrentStep());
      instructions.appendChild(nextBtn);
    }
  }
}

function _saveAssemblyState() {
  const state = getState();
  if (!state.activeProject) return;

  updateState({
    activeProject: {
      ...state.activeProject,
      assemblyState: deepClone(_assemblyState),
    },
  });
}

// --- Seam Line Calculation ---

function _getSeamLineForStep(step) {
  // Generate seam lines based on step configuration
  // These are in SVG viewBox coordinates (500x400)
  const centerX = 250;
  const centerY = 200;

  switch (step.seamEdge) {
    case 'bottom':
      return { x1: 120, y1: 300, x2: 380, y2: 300 };
    case 'top':
      return { x1: 170, y1: 80, x2: 330, y2: 80 };
    case 'full-outline':
      // Simplified: horizontal line across the middle
      return { x1: 100, y1: 200, x2: 400, y2: 200 };
    default:
      return { x1: 150, y1: centerY, x2: 350, y2: centerY };
  }
}

function _getAlignDataForStep(step) {
  const centerX = 250;

  switch (step.attachEdge) {
    case 'top-center':
      return {
        targetZone: { x: 180, y: 70, width: 140, height: 60 },
        pieceSize: { width: 140, height: 60 },
      };
    case 'waist':
      return {
        targetZone: { x: 120, y: 180, width: 260, height: 20 },
        pieceSize: { width: 260, height: 20 },
      };
    case 'top-corners':
      return {
        targetZone: { x: 190, y: 50, width: 120, height: 12 },
        pieceSize: { width: 120, height: 12 },
      };
    default:
      return {
        targetZone: { x: 150, y: 150, width: 200, height: 40 },
        pieceSize: { width: 200, height: 40 },
      };
  }
}

// --- Assembly Piece Rendering ---

function _renderAssemblyPieces(svg) {
  // Remove old background
  let bg = svg.querySelector('#assembly-bg');
  if (bg) bg.remove();

  bg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  bg.setAttribute('id', 'assembly-bg');

  // Draw a simplified apron shape as context
  // Apron body
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  _setAttrs(body, {
    x: 120, y: 130, width: 260, height: 230,
    fill: 'rgba(196, 168, 130, 0.12)',
    stroke: 'rgba(196, 168, 130, 0.25)',
    'stroke-width': 1,
    rx: 3,
  });
  bg.appendChild(body);

  // Bib
  const bib = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  _setAttrs(bib, {
    x: 180, y: 70, width: 140, height: 65,
    fill: 'rgba(196, 168, 130, 0.08)',
    stroke: 'rgba(196, 168, 130, 0.2)',
    'stroke-width': 1,
    rx: 2,
  });
  bg.appendChild(bib);

  // Labels
  const bodyLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  _setAttrs(bodyLabel, {
    x: 250, y: 255,
    'text-anchor': 'middle',
    fill: 'rgba(152, 152, 176, 0.5)',
    'font-size': 10,
    'font-family': 'monospace',
  });
  bodyLabel.textContent = 'APRON BODY';
  bg.appendChild(bodyLabel);

  const bibLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  _setAttrs(bibLabel, {
    x: 250, y: 105,
    'text-anchor': 'middle',
    fill: 'rgba(152, 152, 176, 0.4)',
    'font-size': 8,
    'font-family': 'monospace',
  });
  bibLabel.textContent = 'BIB';
  bg.appendChild(bibLabel);

  // Insert before any game layers
  const firstChild = svg.querySelector('#mini-game-layer') || svg.lastChild;
  svg.insertBefore(bg, firstChild);
}

// --- UI Rendering ---

function _renderStepUI() {
  if (!_el || !_assemblyState) return;

  const step = getCurrentStep(_assemblyState);
  const stepIndex = _assemblyState.currentStepIndex;
  const totalSteps = _assemblyState.steps.length;
  const progress = stepIndex / totalSteps * 100;

  // Header
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

  // Instructions
  const instructions = _el.querySelector('#assembly-instructions');
  if (instructions && step) {
    instructions.innerHTML = `
      <div class="assembly-step-name">${step.name}</div>
      <div class="assembly-step-text">${step.instruction}</div>
    `;
  } else if (instructions && isAssemblyComplete(_assemblyState)) {
    instructions.innerHTML = `
      <div class="assembly-step-name">Assembly Complete!</div>
      <div class="assembly-step-text">All steps finished. Calculating your score...</div>
    `;
  }
}

// --- Completion / Results ---

function _showCompletionResults() {
  _showResults = true;
  const state = getState();
  const ap = state.activeProject;
  if (!ap) return;

  const craftsmanship = getAverageScore(_assemblyState);

  // Update score
  const scores = {
    accuracy: ap.score.accuracy || 1.0,
    efficiency: ap.score.efficiency || 0.5,
    craftsmanship,
  };

  const finalScore = calculateFinalScore(scores);
  const grade = getGrade(finalScore);

  // Update state
  updateState({
    activeProject: {
      ...ap,
      assemblyState: deepClone(_assemblyState),
      score: scores,
    },
  });

  // Render results overlay
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
          <span class="score-label">Craftsmanship (Sewing)</span>
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${craftsmanship * 100}%"></div></div>
          <span class="score-value">${Math.round(craftsmanship * 100)}%</span>
        </div>
      </div>
      <div class="results-final">
        Final Score: ${Math.round(finalScore * 100)}%
      </div>
      <button class="btn btn-primary" id="return-queue-btn" style="margin-top:16px; width:100%;">
        Return to Queue
      </button>
    </div>
  `;

  document.getElementById('return-queue-btn').addEventListener('click', () => {
    _finishProject(scores, grade);
  });
}

function _finishProject(scores, grade) {
  const state = getState();
  const ap = state.activeProject;
  if (!ap) return;

  // Move from inProgress to finished
  const inProgress = (state.queue.inProgress || []).filter(p => p.id !== ap.id);
  const finishedItem = {
    id: ap.id,
    projectId: ap.projectId,
    name: ap.name,
    tier: ap.tier,
    grade,
    score: calculateFinalScore(scores),
    completedAt: Date.now(),
  };
  const finished = [...(state.queue.finished || []), finishedItem];

  // Update completed projects in player profile
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
  el.innerHTML = `
    <div class="assembly-canvas-area">
      <div class="screen-placeholder">
        <span class="placeholder-icon">&#9881;</span>
        <span class="placeholder-label">Construction Puzzles</span>
        <span class="placeholder-hint">Complete Material Layout to unlock assembly</span>
      </div>
    </div>
  `;
  container.appendChild(el);
}

// --- Helpers ---

function _setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
}
