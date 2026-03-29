/* ============================================================
   Thread & Template — Sewing Queue Screen (Kanban)
   Fully wired to game state — Phase 2
   ============================================================ */

import { getState, updateNested, subscribe } from '../state.js';
import { autoSave } from '../storage.js';
import { TIER } from '../constants.js';

// --- Project catalogue: display names and tier labels ---
const PROJECT_META = {
  apron:          { name: 'Apron',               tier: TIER.BEGINNER },
  tote:           { name: 'Couture Tote',         tier: TIER.BEGINNER },
  lined_skirt:    { name: 'Lined Skirt',          tier: TIER.INTERMEDIATE },
  lined_jacket:   { name: 'Lined Jacket',         tier: TIER.ADVANCED },
  tailored_blazer:{ name: 'Tailored Blazer',      tier: TIER.COUTURE },
};

function getProjectLabel(projectId) {
  return PROJECT_META[projectId]?.name ?? projectId;
}

function getProjectTier(projectId) {
  return PROJECT_META[projectId]?.tier ?? TIER.BEGINNER;
}

let _container = null;
let _unsubscribe = null;
let _dragSrc = null;   // { projectId, fromColumn }

// --------------------------------------------------------
// Lifecycle
// --------------------------------------------------------

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen queue-screen';
  el.id = 'queue-screen-root';
  container.appendChild(el);

  _render();
  _unsubscribe = subscribe(() => _render());
}

export function unmount() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _container = null;
}

export function update(_dt) { /* event-driven — no frame loop needed */ }
export function onInput(_event) {}

// --------------------------------------------------------
// Render
// --------------------------------------------------------

function _render() {
  const root = document.getElementById('queue-screen-root');
  if (!root) return;

  const state = getState();
  const { queue, player } = state;

  root.innerHTML = `
    <div class="queue-header">
      <span style="font-size:14px; font-weight:500;">Sewing Queue</span>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="btn btn-sm" id="queue-new-project-select" title="Choose project to add">
          <option value="">+ Add project…</option>
          ${_unlockedOptions(player.unlockedProjects, queue)}
        </select>
      </div>
    </div>

    <div class="queue-columns">
      ${_columnHTML('To Sew',      'toSew',      queue.toSew)}
      ${_columnHTML('In Progress', 'inProgress', queue.inProgress)}
      ${_columnHTML('Finished',    'finished',   queue.finished)}
    </div>
  `;

  // Wire up "Add project" select
  const sel = root.querySelector('#queue-new-project-select');
  if (sel) sel.addEventListener('change', _onAddProject);

  // Wire up drag-and-drop and card events
  root.querySelectorAll('.queue-card-list').forEach(list => {
    list.addEventListener('dragover', _onDragOver);
    list.addEventListener('drop',     _onDrop);
    list.addEventListener('dragleave', e => {
      e.currentTarget.classList.remove('drag-over');
    });
  });

  root.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('dragstart', _onDragStart);
    card.addEventListener('dragend',   _onDragEnd);
    card.querySelector('.card-remove-btn')?.addEventListener('click', _onRemoveCard);
  });
}

function _columnHTML(label, columnKey, items) {
  const cards = items.length
    ? items.map(id => _cardHTML(id, columnKey)).join('')
    : `<div class="screen-placeholder" style="padding:24px 0;">
         <span class="placeholder-hint">${_columnEmptyHint(columnKey)}</span>
       </div>`;

  return `
    <div class="queue-column">
      <div class="queue-column-header">
        ${label}
        <span class="queue-column-count" id="count-${columnKey}">${items.length}</span>
      </div>
      <div class="queue-card-list" id="col-${columnKey}" data-column="${columnKey}">
        ${cards}
      </div>
    </div>
  `;
}

function _cardHTML(projectId, columnKey) {
  const tier = getProjectTier(projectId);
  return `
    <div class="project-card"
         draggable="true"
         data-project-id="${projectId}"
         data-column="${columnKey}">
      <div class="project-card-name">${getProjectLabel(projectId)}</div>
      <div class="project-card-meta">
        <span class="tier-badge ${tier}">${tier}</span>
        ${columnKey === 'finished' ? '<span>✓ Complete</span>' : ''}
      </div>
      <button class="card-remove-btn"
              data-project-id="${projectId}"
              data-column="${columnKey}"
              style="position:absolute; top:6px; right:8px; background:none; border:none;
                     color:var(--color-text-muted); cursor:pointer; font-size:14px; line-height:1;"
              title="Remove">×</button>
    </div>
  `;
}

function _columnEmptyHint(col) {
  if (col === 'toSew')      return 'Add a project above';
  if (col === 'inProgress') return 'Drag a card here to start';
  return 'Finished projects appear here';
}

function _unlockedOptions(unlockedProjects, queue) {
  const allQueued = new Set([
    ...queue.toSew, ...queue.inProgress, ...queue.finished,
  ]);
  return unlockedProjects
    .filter(id => !allQueued.has(id))
    .map(id => `<option value="${id}">${getProjectLabel(id)}</option>`)
    .join('');
}

// --------------------------------------------------------
// Event Handlers
// --------------------------------------------------------

function _onAddProject(e) {
  const projectId = e.target.value;
  if (!projectId) return;
  e.target.value = '';

  const state = getState();
  const toSew = [...state.queue.toSew, projectId];
  updateNested('queue.toSew', toSew);
  autoSave();
}

function _onRemoveCard(e) {
  e.stopPropagation();
  const { projectId, column } = e.currentTarget.dataset;
  _removeFromColumn(column, projectId);
}

function _removeFromColumn(column, projectId) {
  const state = getState();
  const updated = state.queue[column].filter(id => id !== projectId);
  updateNested(`queue.${column}`, updated);
  autoSave();
}

function _moveCard(projectId, fromColumn, toColumn) {
  if (fromColumn === toColumn) return;
  const state = getState();
  const from = state.queue[fromColumn].filter(id => id !== projectId);
  const to   = [...state.queue[toColumn], projectId];
  // Shallow-clone queue to avoid mutation
  const queue = { ...state.queue, [fromColumn]: from, [toColumn]: to };
  updateNested('queue', queue);
  autoSave();
}

// --- Drag-and-Drop ---

function _onDragStart(e) {
  const card = e.currentTarget;
  _dragSrc = {
    projectId:  card.dataset.projectId,
    fromColumn: card.dataset.column,
  };
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function _onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  _dragSrc = null;
}

function _onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function _onDrop(e) {
  e.preventDefault();
  const list = e.currentTarget;
  list.classList.remove('drag-over');

  if (!_dragSrc) return;
  const toColumn = list.dataset.column;
  _moveCard(_dragSrc.projectId, _dragSrc.fromColumn, toColumn);
}
