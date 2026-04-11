/* ============================================================
   Thread & Template — Inspiration Board Screen (Mood Board)
   A freeform canvas for fabric swatches, notes, and images.
   Items are persisted in state.inspirationBoard.items.
   ============================================================ */

import { COLORS, SCREEN } from '../constants.js';
import { INPUT } from '../input.js';
import { getState, updateNested, subscribe } from '../state.js';
import { uid } from '../utils.js';

let _container = null;
let _el = null;
let _canvas = null;
let _unsubscribe = null;

// Drag state
let _dragging = null;  // { id, offsetX, offsetY }
let _selectedItemId = null;  // keyboard-selected item

// Palette of fabric swatch colors
const SWATCH_PALETTE = [
  '#c4a882', '#e8d5b7', '#8a7560', // warm neutrals
  '#5c3d2e', '#2c1810', '#f5e6cc', // browns / cream
  '#4a6fa5', '#2d4e8a', '#7ba3d9', // blues
  '#6b8f6b', '#3d5c3d', '#a8c5a8', // greens
  '#8b4a6e', '#5c2a4a', '#c47aa0', // roses
  '#c45050', '#8b2020', '#e87070', // reds
  '#1a1a2e', '#222240', '#e8e8f0', // darks / light
];

// Note background colors
const NOTE_COLORS = [
  '#c4a882', '#e8d5b7', '#a8c5a8', '#7ba3d9', '#c47aa0',
];

export function mount(container) {
  _container = container;

  _el = document.createElement('div');
  _el.className = 'screen inspiration-screen';
  _el.style.cssText = 'position:relative; overflow:hidden; background:#141428; user-select:none;';

  _el.innerHTML = `
    <div class="inspiration-toolbar" style="
      position:absolute; top:0; left:0; right:0; z-index:20;
      display:flex; gap:8px; padding:8px 12px;
      background:rgba(20,20,40,0.92); border-bottom:1px solid #2a2a4a;
    ">
      <span style="font-size:13px; font-weight:600; color:#c4a882; margin-right:4px; align-self:center;">
        Inspiration Board
      </span>
      <button class="insp-btn" data-action="add-swatch" title="Add fabric swatch">
        🎨 Swatch
      </button>
      <button class="insp-btn" data-action="add-note" title="Add note">
        📝 Note
      </button>
      <div style="flex:1;"></div>
      <button class="insp-btn insp-btn-danger" data-action="clear-all" title="Clear board">
        🗑 Clear
      </button>
    </div>
    <div id="insp-board" style="
      position:absolute; top:41px; left:0; right:0; bottom:0;
      overflow:hidden;
    "></div>
    <div id="insp-palette" style="display:none;
      position:absolute; z-index:30;
      background:#1a1a2e; border:1px solid #3a3a5a; border-radius:8px;
      padding:10px; box-shadow:0 4px 16px rgba(0,0,0,0.5);
    "></div>
    <div id="insp-note-editor" style="display:none;
      position:absolute; z-index:30;
      background:#1a1a2e; border:1px solid #3a3a5a; border-radius:8px;
      padding:12px; box-shadow:0 4px 16px rgba(0,0,0,0.5); width:220px;
    "></div>
  `;

  container.appendChild(_el);

  _injectStyles();
  _renderBoard();

  _el.addEventListener('click', _onToolbarClick);
  _el.addEventListener('mousedown', _onBoardMouseDown);
  _el.addEventListener('touchstart', _onBoardTouchStart, { passive: false });
  document.addEventListener('mousemove', _onMouseMove);
  document.addEventListener('mouseup', _onMouseUp);
  document.addEventListener('touchmove', _onTouchMove, { passive: false });
  document.addEventListener('touchend', _onTouchEnd);

  _unsubscribe = subscribe(_onStateChange);
}

export function unmount() {
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = null;
  document.removeEventListener('mousemove', _onMouseMove);
  document.removeEventListener('mouseup', _onMouseUp);
  document.removeEventListener('touchmove', _onTouchMove);
  document.removeEventListener('touchend', _onTouchEnd);
  _container = null;
  _el = null;
  _dragging = null;
  _selectedItemId = null;
}

export function update(dt) {}

export function onInput(event) {
  if (event.type !== INPUT.KEY) return;
  const { key, shiftKey } = event;
  const items = _getItems();
  if (items.length === 0) return;

  // Tab / Shift+Tab: cycle through items
  if (key === 'Tab') {
    const ids = items.map(i => i.id);
    const idx = _selectedItemId ? ids.indexOf(_selectedItemId) : -1;
    const next = shiftKey
      ? (idx <= 0 ? ids.length - 1 : idx - 1)
      : (idx >= ids.length - 1 ? 0 : idx + 1);
    _selectedItemId = ids[next];
    _highlightSelected();
    return;
  }

  if (!_selectedItemId) return;

  // Arrow keys: reposition selected item
  const NUDGE = shiftKey ? 20 : 6;
  if (key === 'ArrowUp')    { _nudgeItem(_selectedItemId, 0, -NUDGE); return; }
  if (key === 'ArrowDown')  { _nudgeItem(_selectedItemId, 0, NUDGE);  return; }
  if (key === 'ArrowLeft')  { _nudgeItem(_selectedItemId, -NUDGE, 0); return; }
  if (key === 'ArrowRight') { _nudgeItem(_selectedItemId, NUDGE, 0);  return; }

  // Delete / Backspace: remove selected item
  if (key === 'Delete' || key === 'Backspace') {
    _removeItem(_selectedItemId);
    _selectedItemId = null;
    return;
  }
}

// --- State ---

function _getItems() {
  return getState().inspirationBoard?.items || [];
}

function _saveItems(items) {
  updateNested('inspirationBoard.items', items);
}

function _addItem(item) {
  const items = _getItems();
  _saveItems([...items, item]);
}

function _removeItem(id) {
  _saveItems(_getItems().filter(i => i.id !== id));
}

function _updateItem(id, patch) {
  _saveItems(_getItems().map(i => i.id === id ? { ...i, ...patch } : i));
}

function _nudgeItem(id, dx, dy) {
  const item = _getItems().find(i => i.id === id);
  if (!item) return;
  _updateItem(id, {
    x: Math.max(0, (item.x || 0) + dx),
    y: Math.max(0, (item.y || 0) + dy),
  });
}

function _highlightSelected() {
  if (!_el) return;
  const board = _el.querySelector('#insp-board');
  if (!board) return;
  // Remove previous highlight
  board.querySelectorAll('[data-item-id]').forEach(el => {
    el.style.outline = '';
  });
  // Add highlight to selected
  if (_selectedItemId) {
    const sel = board.querySelector(`[data-item-id="${_selectedItemId}"]`);
    if (sel) sel.style.outline = '2px solid var(--color-accent, #c4a882)';
  }
}

function _onStateChange(state) {
  _renderBoard();
  // Re-apply keyboard selection highlight after re-render
  _highlightSelected();
}

// --- Rendering ---

function _renderBoard() {
  if (!_el) return;
  const board = _el.querySelector('#insp-board');
  if (!board) return;

  const items = _getItems();
  const existingIds = new Set([...board.querySelectorAll('[data-item-id]')].map(el => el.dataset.itemId));
  const newIds = new Set(items.map(i => i.id));

  // Remove stale items
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      const el = board.querySelector(`[data-item-id="${id}"]`);
      if (el) el.remove();
    }
  }

  // Add or update items
  for (const item of items) {
    let el = board.querySelector(`[data-item-id="${item.id}"]`);
    if (!el) {
      el = _createItemEl(item);
      board.appendChild(el);
    }
    _positionItemEl(el, item);
    _updateItemContent(el, item);
  }

  // Empty state
  let emptyEl = board.querySelector('.insp-empty');
  if (items.length === 0) {
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'insp-empty';
      emptyEl.style.cssText = `
        position:absolute; top:50%; left:50%; transform:translate(-50%,-60%);
        text-align:center; color:#3a3a5a; pointer-events:none;
      `;
      emptyEl.innerHTML = `
        <div style="font-size:48px; margin-bottom:12px;">✂️</div>
        <div style="font-size:14px; font-weight:500; color:#4a4a6a;">Your Inspiration Board</div>
        <div style="font-size:12px; margin-top:6px; color:#3a3a5a;">
          Add swatches and notes to plan your project
        </div>
      `;
      board.appendChild(emptyEl);
    }
  } else {
    if (emptyEl) emptyEl.remove();
  }
}

function _createItemEl(item) {
  const el = document.createElement('div');
  el.dataset.itemId = item.id;
  el.style.cssText = `
    position:absolute; cursor:grab; touch-action:none;
    transition: box-shadow 0.15s ease;
  `;
  el.addEventListener('click', (e) => {
    if (_dragging) return;
    e.stopPropagation();
  });
  // Delete button
  const del = document.createElement('button');
  del.className = 'insp-del-btn';
  del.textContent = '×';
  del.title = 'Remove';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    _removeItem(item.id);
  });
  el.appendChild(del);
  return el;
}

function _positionItemEl(el, item) {
  el.style.left = (item.x || 20) + 'px';
  el.style.top = (item.y || 20) + 'px';
}

function _updateItemContent(el, item) {
  if (item.type === 'swatch') {
    _updateSwatchEl(el, item);
  } else if (item.type === 'note') {
    _updateNoteEl(el, item);
  }
}

function _updateSwatchEl(el, item) {
  el.style.cssText += `
    width:72px; height:72px; border-radius:6px;
    border:2px solid rgba(255,255,255,0.12);
    box-shadow:2px 2px 8px rgba(0,0,0,0.4);
    background:${item.data.color || '#c4a882'};
    display:flex; flex-direction:column; align-items:center; justify-content:flex-end;
    padding-bottom:4px;
  `;
  // Label inside swatch
  let label = el.querySelector('.swatch-label');
  if (!label) {
    label = document.createElement('div');
    label.className = 'swatch-label';
    label.style.cssText = `
      font-size:9px; color:rgba(255,255,255,0.75); text-shadow:0 1px 2px rgba(0,0,0,0.7);
      max-width:60px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      text-align:center; pointer-events:none;
    `;
    el.appendChild(label);
  }
  label.textContent = item.data.name || 'Fabric';
}

function _updateNoteEl(el, item) {
  const bg = item.data.color || '#c4a882';
  el.style.cssText += `
    width:140px; min-height:80px; border-radius:4px;
    background:${bg};
    box-shadow:2px 3px 8px rgba(0,0,0,0.4);
    padding:8px 8px 6px 8px;
    display:flex; flex-direction:column;
  `;
  let content = el.querySelector('.note-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'note-content';
    content.style.cssText = `
      font-size:11px; color:#1a1a2e; line-height:1.4;
      flex:1; word-break:break-word; pointer-events:none;
      font-family: 'Segoe UI', sans-serif;
    `;
    el.appendChild(content);
  }
  content.textContent = item.data.text || '';
}

// --- Toolbar & Actions ---

function _onToolbarClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  _closePalette();
  _closeNoteEditor();

  const action = btn.dataset.action;

  if (action === 'add-swatch') {
    _showSwatchPalette(btn);
  } else if (action === 'add-note') {
    _showNoteEditor(btn);
  } else if (action === 'clear-all') {
    if (_getItems().length === 0) return;
    if (confirm('Clear the inspiration board?')) {
      _saveItems([]);
    }
  }
}

function _showSwatchPalette(anchorEl) {
  const palette = _el.querySelector('#insp-palette');
  const rect = anchorEl.getBoundingClientRect();
  const elRect = _el.getBoundingClientRect();

  let html = '<div style="margin-bottom:8px; font-size:11px; color:#9898b0;">Choose fabric color</div>';
  html += '<div style="display:flex; flex-wrap:wrap; gap:6px; width:192px;">';
  for (const color of SWATCH_PALETTE) {
    html += `<div class="palette-swatch" data-color="${color}" style="
      width:24px; height:24px; border-radius:4px; background:${color};
      border:2px solid transparent; cursor:pointer;
    "></div>`;
  }
  html += '</div>';
  html += '<div style="margin-top:8px;">';
  html += '<input type="color" id="insp-custom-color" value="#c4a882" style="width:100%;height:28px;border:none;border-radius:4px;cursor:pointer;background:none;">';
  html += '<div style="font-size:10px; color:#6a6a8a; margin-top:3px;">Custom color</div>';
  html += '</div>';

  palette.innerHTML = html;
  palette.style.left = (rect.left - elRect.left) + 'px';
  palette.style.top = (rect.bottom - elRect.top + 4) + 'px';
  palette.style.display = 'block';

  palette.querySelectorAll('.palette-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      _addSwatchFromColor(sw.dataset.color);
      _closePalette();
    });
  });
  const customPicker = palette.querySelector('#insp-custom-color');
  customPicker.addEventListener('change', () => {
    _addSwatchFromColor(customPicker.value);
    _closePalette();
  });

  setTimeout(() => {
    document.addEventListener('click', _closePaletteOnOutside, { once: true });
  }, 0);
}

function _closePaletteOnOutside(e) {
  if (!_el) return;
  const palette = _el.querySelector('#insp-palette');
  if (palette && !palette.contains(e.target)) {
    _closePalette();
  }
}

function _closePalette() {
  if (!_el) return;
  const palette = _el.querySelector('#insp-palette');
  if (palette) palette.style.display = 'none';
}

function _addSwatchFromColor(color) {
  const board = _el.querySelector('#insp-board');
  const bRect = board.getBoundingClientRect();
  const x = 20 + Math.random() * Math.max(20, bRect.width - 120);
  const y = 20 + Math.random() * Math.max(20, bRect.height - 120);
  _addItem({
    id: uid(),
    type: 'swatch',
    x: Math.round(x),
    y: Math.round(y),
    data: { color, name: _colorName(color) },
  });
}

function _showNoteEditor(anchorEl) {
  const editor = _el.querySelector('#insp-note-editor');
  const rect = anchorEl.getBoundingClientRect();
  const elRect = _el.getBoundingClientRect();

  let html = '<div style="margin-bottom:8px; font-size:11px; color:#9898b0;">Add a note</div>';
  html += `<textarea id="insp-note-text" placeholder="Your note..." style="
    width:100%; height:72px; background:#0d0d1e; border:1px solid #3a3a5a;
    color:#e8e8f0; border-radius:4px; padding:6px; font-size:12px; resize:none;
    font-family:inherit; box-sizing:border-box;
  "></textarea>`;
  html += '<div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">';
  for (const c of NOTE_COLORS) {
    html += `<div class="note-color-opt" data-color="${c}" style="
      width:20px; height:20px; border-radius:3px; background:${c};
      border:2px solid transparent; cursor:pointer;
    "></div>`;
  }
  html += '</div>';
  html += `<div style="display:flex; gap:6px; margin-top:10px; justify-content:flex-end;">
    <button class="insp-btn" id="insp-note-cancel">Cancel</button>
    <button class="insp-btn insp-btn-primary" id="insp-note-add">Add Note</button>
  </div>`;

  editor.innerHTML = html;
  editor.style.left = (rect.left - elRect.left) + 'px';
  editor.style.top = (rect.bottom - elRect.top + 4) + 'px';
  editor.style.display = 'block';

  let selectedColor = NOTE_COLORS[0];

  editor.querySelectorAll('.note-color-opt').forEach(opt => {
    if (opt.dataset.color === selectedColor) {
      opt.style.borderColor = '#e8e8f0';
    }
    opt.addEventListener('click', () => {
      editor.querySelectorAll('.note-color-opt').forEach(o => o.style.borderColor = 'transparent');
      opt.style.borderColor = '#e8e8f0';
      selectedColor = opt.dataset.color;
    });
  });

  editor.querySelector('#insp-note-cancel').addEventListener('click', _closeNoteEditor);
  editor.querySelector('#insp-note-add').addEventListener('click', () => {
    const text = editor.querySelector('#insp-note-text').value.trim();
    if (!text) return;
    const board = _el.querySelector('#insp-board');
    const bRect = board.getBoundingClientRect();
    const x = 20 + Math.random() * Math.max(20, bRect.width - 180);
    const y = 20 + Math.random() * Math.max(20, bRect.height - 120);
    _addItem({
      id: uid(),
      type: 'note',
      x: Math.round(x),
      y: Math.round(y),
      data: { text, color: selectedColor },
    });
    _closeNoteEditor();
  });

  editor.querySelector('#insp-note-text').focus();
}

function _closeNoteEditor() {
  if (!_el) return;
  const editor = _el.querySelector('#insp-note-editor');
  if (editor) editor.style.display = 'none';
}

// --- Drag Handling ---

function _getItemElAt(e) {
  const target = e.target.closest('[data-item-id]');
  return target || null;
}

function _startDrag(itemEl, clientX, clientY) {
  const board = _el.querySelector('#insp-board');
  const bRect = board.getBoundingClientRect();
  const x = parseFloat(itemEl.style.left) || 0;
  const y = parseFloat(itemEl.style.top) || 0;
  _dragging = {
    id: itemEl.dataset.itemId,
    offsetX: clientX - bRect.left - x,
    offsetY: clientY - bRect.top - y,
  };
  itemEl.style.cursor = 'grabbing';
  itemEl.style.zIndex = '10';
  itemEl.style.boxShadow = '4px 6px 20px rgba(0,0,0,0.6)';
}

function _moveDrag(clientX, clientY) {
  if (!_dragging || !_el) return;
  const board = _el.querySelector('#insp-board');
  const bRect = board.getBoundingClientRect();
  const itemEl = board.querySelector(`[data-item-id="${_dragging.id}"]`);
  if (!itemEl) return;

  const x = Math.max(0, Math.min(clientX - bRect.left - _dragging.offsetX, bRect.width - 20));
  const y = Math.max(0, Math.min(clientY - bRect.top - _dragging.offsetY, bRect.height - 20));
  itemEl.style.left = x + 'px';
  itemEl.style.top = y + 'px';
}

function _endDrag() {
  if (!_dragging || !_el) return;
  const board = _el.querySelector('#insp-board');
  const itemEl = board.querySelector(`[data-item-id="${_dragging.id}"]`);
  if (itemEl) {
    const x = parseFloat(itemEl.style.left) || 0;
    const y = parseFloat(itemEl.style.top) || 0;
    itemEl.style.cursor = 'grab';
    itemEl.style.zIndex = '';
    itemEl.style.boxShadow = '';
    _updateItem(_dragging.id, { x: Math.round(x), y: Math.round(y) });
  }
  _dragging = null;
}

function _onBoardMouseDown(e) {
  const itemEl = _getItemElAt(e);
  if (!itemEl) return;
  if (e.target.closest('.insp-del-btn')) return;
  e.preventDefault();
  _closePalette();
  _closeNoteEditor();
  _startDrag(itemEl, e.clientX, e.clientY);
}

function _onMouseMove(e) {
  if (!_dragging) return;
  _moveDrag(e.clientX, e.clientY);
}

function _onMouseUp(e) {
  _endDrag();
}

function _onBoardTouchStart(e) {
  const itemEl = _getItemElAt(e);
  if (!itemEl) return;
  if (e.target.closest('.insp-del-btn')) return;
  e.preventDefault();
  const t = e.touches[0];
  _startDrag(itemEl, t.clientX, t.clientY);
}

function _onTouchMove(e) {
  if (!_dragging) return;
  e.preventDefault();
  const t = e.touches[0];
  _moveDrag(t.clientX, t.clientY);
}

function _onTouchEnd(e) {
  _endDrag();
}

// --- Helpers ---

function _colorName(hex) {
  // Very simple color labeling for swatch names
  const h = hex.toLowerCase();
  if (h === '#c4a882' || h === '#e8d5b7' || h === '#8a7560') return 'Neutral';
  if (h === '#5c3d2e' || h === '#2c1810') return 'Brown';
  if (h === '#f5e6cc') return 'Cream';
  if (h.startsWith('#4a6') || h.startsWith('#2d4') || h.startsWith('#7ba')) return 'Blue';
  if (h.startsWith('#6b8') || h.startsWith('#3d5') || h.startsWith('#a8c')) return 'Green';
  if (h.startsWith('#8b4') || h.startsWith('#5c2') || h.startsWith('#c47')) return 'Rose';
  if (h.startsWith('#c45') || h.startsWith('#8b2') || h.startsWith('#e87')) return 'Red';
  if (h === '#1a1a2e' || h === '#222240') return 'Dark';
  return 'Fabric';
}

function _injectStyles() {
  if (document.getElementById('inspiration-styles')) return;
  const style = document.createElement('style');
  style.id = 'inspiration-styles';
  style.textContent = `
    .insp-btn {
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid #3a3a5a;
      border-radius: 4px;
      background: #222240;
      color: #e8e8f0;
      cursor: pointer;
      white-space: nowrap;
    }
    .insp-btn:hover { background: #2a2a4a; }
    .insp-btn-primary { background: #4a6fa5; border-color: #5a7fb5; }
    .insp-btn-primary:hover { background: #5a7fb5; }
    .insp-btn-danger:hover { background: #3a1a1a; border-color: #c45050; color: #e87070; }
    .insp-del-btn {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #c45050;
      color: #fff;
      border: none;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 5;
      padding: 0;
    }
    [data-item-id]:hover .insp-del-btn { opacity: 1; }
  `;
  document.head.appendChild(style);
}
