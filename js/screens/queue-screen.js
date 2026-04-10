/* ============================================================
   Thread & Template — Sewing Queue Screen (Kanban)
   Project lifecycle: create, start, resume, view finished
   ============================================================ */

import { STAGE, TIER, SCREEN } from '../constants.js';
import { getState, updateState, subscribe } from '../state.js';
import { navigateTo } from '../navigation.js';
import { showToast } from '../ui.js';
import { uid, deepClone } from '../utils.js';
import { getProjectTemplate } from '../drafting/measurements.js';

let _container = null;
let _el = null;
let _unsubscribe = null;
let _pickerOpen = false;

// Single source of truth for all project template display metadata.
// Both _togglePicker() and _createProject() reference this map so that
// adding a new template only requires one edit here.
const PROJECT_TEMPLATES = Object.freeze({
  'apron':       { name: 'Classic Apron', tier: TIER.BEGINNER },
  'lined-skirt': { name: 'Lined Skirt',   tier: TIER.INTERMEDIATE },
});

export function mount(container) {
  _container = container;

  _el = document.createElement('div');
  _el.className = 'screen queue-screen';
  _el.innerHTML = `
    <div class="queue-header">
      <span style="font-size:14px; font-weight:500;">Sewing Queue</span>
      <button class="btn btn-sm btn-primary" id="new-project-btn">+ New Project</button>
    </div>
    <div id="project-picker" class="project-picker" style="display:none;"></div>
    <div class="queue-columns">
      <div class="queue-column">
        <div class="queue-column-header">
          To Sew
          <span class="queue-column-count" id="count-to-sew">0</span>
        </div>
        <div class="queue-card-list" id="col-to-sew"></div>
      </div>
      <div class="queue-column">
        <div class="queue-column-header">
          In Progress
          <span class="queue-column-count" id="count-in-progress">0</span>
        </div>
        <div class="queue-card-list" id="col-in-progress"></div>
      </div>
      <div class="queue-column">
        <div class="queue-column-header">
          Finished
          <span class="queue-column-count" id="count-finished">0</span>
        </div>
        <div class="queue-card-list" id="col-finished"></div>
      </div>
    </div>
  `;
  container.appendChild(_el);

  // Bind new project button
  const newBtn = _el.querySelector('#new-project-btn');
  newBtn.addEventListener('click', _togglePicker);

  // Bind card clicks via delegation
  _el.addEventListener('click', _onCardClick);

  // Subscribe to state changes for re-render
  _unsubscribe = subscribe(_renderCards);

  _renderCards();
}

export function unmount() {
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = null;
  _container = null;
  _el = null;
  _pickerOpen = false;
}

export function update(dt) {}

export function onInput(event) {}

// --- Project Picker ---

function _togglePicker() {
  _pickerOpen = !_pickerOpen;
  const picker = _el.querySelector('#project-picker');
  if (!_pickerOpen) {
    picker.style.display = 'none';
    return;
  }

  const state = getState();
  const unlocked = state.player.unlockedProjects || ['apron'];

  let html = '<div class="picker-title">Choose a Project</div><div class="picker-options">';
  for (const pid of unlocked) {
    const info = PROJECT_TEMPLATES[pid] || { name: pid, tier: TIER.BEGINNER };
    html += `
      <button class="picker-option" data-project="${pid}">
        <span class="project-card-name">${info.name}</span>
        <span class="tier-badge ${info.tier}">${info.tier}</span>
      </button>
    `;
  }
  html += '</div>';
  picker.innerHTML = html;
  picker.style.display = 'block';

  // Bind picker options
  picker.querySelectorAll('.picker-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const projectId = btn.getAttribute('data-project');
      _createProject(projectId);
      _pickerOpen = false;
      picker.style.display = 'none';
    });
  });
}

function _createProject(projectId) {
  const state = getState();
  const tmpl = PROJECT_TEMPLATES[projectId] || { name: projectId, tier: TIER.BEGINNER };

  const project = {
    id: uid('proj'),
    projectId,
    name: tmpl.name,
    tier: tmpl.tier,
    createdAt: Date.now(),
  };

  const toSew = [...(state.queue.toSew || []), project];
  updateState({
    queue: { ...state.queue, toSew },
  });

  showToast(`"${project.name}" added to queue`, 'success');
}

// --- Start / Resume ---

function _startProject(queueItem) {
  const state = getState();

  // Move from toSew to inProgress
  const toSew = state.queue.toSew.filter(p => p.id !== queueItem.id);
  const inProgress = [...(state.queue.inProgress || []), queueItem];

  // Set active project
  const activeProject = {
    id: queueItem.id,
    projectId: queueItem.projectId,
    name: queueItem.name,
    tier: queueItem.tier,
    stage: STAGE.DRAFTING,
    pattern: null,
    materialLayout: null,
    assemblyState: null,
    score: { accuracy: 0, efficiency: 0, craftsmanship: 0 },
  };

  updateState({
    queue: { ...state.queue, toSew, inProgress },
    activeProject,
  });

  navigateTo(SCREEN.DRAFTING);
}

function _resumeProject(queueItem) {
  const state = getState();
  const ap = state.activeProject;

  // If this project is already active, just navigate
  if (ap && ap.id === queueItem.id) {
    const screenMap = {
      [STAGE.DRAFTING]: SCREEN.DRAFTING,
      [STAGE.MATERIAL]: SCREEN.MATERIAL,
      [STAGE.ASSEMBLY]: SCREEN.ASSEMBLY,
    };
    navigateTo(screenMap[ap.stage] || SCREEN.DRAFTING);
    return;
  }

  // Otherwise set it as active and go to its stage
  // (For MVP, only one project can be in progress at a time)
  showToast('Resume this project from where you left off', 'info');
}

// --- Card Click Handler ---

function _onCardClick(e) {
  // Check for scrap button first
  const scrapBtn = e.target.closest('[data-action="scrap"]');
  if (scrapBtn) {
    e.stopPropagation();
    const itemId = scrapBtn.getAttribute('data-id');
    if (itemId) _scrapProject(itemId);
    return;
  }

  const card = e.target.closest('.project-card');
  if (!card) return;

  const column = card.getAttribute('data-column');
  const itemId = card.getAttribute('data-id');

  if (!itemId) return;

  const state = getState();

  if (column === 'toSew') {
    const item = state.queue.toSew.find(p => p.id === itemId);
    if (item) _startProject(item);
  } else if (column === 'inProgress') {
    const item = state.queue.inProgress.find(p => p.id === itemId);
    if (item) _resumeProject(item);
  }
}

function _scrapProject(itemId) {
  const state = getState();

  // Remove from inProgress
  const inProgress = (state.queue.inProgress || []).filter(p => p.id !== itemId);

  // Clear activeProject if it's the one being scrapped
  const ap = state.activeProject;
  const clearActive = ap && ap.id === itemId;

  updateState({
    queue: { ...state.queue, inProgress },
    activeProject: clearActive ? null : ap,
  });

  showToast('Project scrapped', 'info');
}

// --- Rendering ---

function _renderCards() {
  if (!_el) return;

  const state = getState();
  const { toSew = [], inProgress = [], finished = [] } = state.queue;

  // Update counts
  const countToSew = _el.querySelector('#count-to-sew');
  const countInProg = _el.querySelector('#count-in-progress');
  const countFinished = _el.querySelector('#count-finished');
  if (countToSew) countToSew.textContent = toSew.length;
  if (countInProg) countInProg.textContent = inProgress.length;
  if (countFinished) countFinished.textContent = finished.length;

  // Render each column
  _renderColumn('col-to-sew', toSew, 'toSew');
  _renderColumn('col-in-progress', inProgress, 'inProgress');
  _renderColumn('col-finished', finished, 'finished');
}

function _renderColumn(containerId, items, column) {
  const container = _el.querySelector(`#${containerId}`);
  if (!container) return;

  if (items.length === 0) {
    const hints = {
      toSew: 'No projects yet — tap + New Project',
      inProgress: 'Start a project to begin',
      finished: 'Complete projects to see them here',
    };
    container.innerHTML = `
      <div class="screen-placeholder" style="padding:24px 0;">
        <span class="placeholder-hint">${hints[column]}</span>
      </div>
    `;
    return;
  }

  const state = getState();
  container.innerHTML = items.map(item => {
    let meta = `<span class="tier-badge ${item.tier || 'beginner'}">${item.tier || 'beginner'}</span>`;

    if (column === 'toSew') {
      meta += `<span class="card-action">Tap to Start</span>`;
    } else if (column === 'inProgress') {
      const ap = state.activeProject;
      const stage = (ap && ap.id === item.id) ? ap.stage : 'drafting';
      meta += `<span class="card-stage">${stage}</span>`;
      meta += `<span class="card-action">Tap to Resume</span>`;
      meta += `<button class="btn-scrap" data-action="scrap" data-id="${item.id}" title="Scrap project">\u2715</button>`;
    } else if (column === 'finished') {
      const grade = item.grade || '?';
      meta += `<span class="card-grade grade-${grade.toLowerCase()}">${grade}</span>`;
    }

    return `
      <div class="project-card" data-id="${item.id}" data-column="${column}">
        <div class="project-card-name">${item.name || item.projectId}</div>
        <div class="project-card-meta">${meta}</div>
      </div>
    `;
  }).join('');
}
