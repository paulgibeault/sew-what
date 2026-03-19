/* ============================================================
   Thread & Template — Assembly Puzzles Screen (Stage III)
   Placeholder — will be expanded in Phase 4
   ============================================================ */

let _container = null;

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen assembly-screen';
  el.innerHTML = `
    <div class="assembly-canvas-area" id="assembly-canvas-area">
      <div class="screen-placeholder">
        <span class="placeholder-icon">&#9881;</span>
        <span class="placeholder-label">Construction Puzzles</span>
        <span class="placeholder-hint">Complete Material Layout to unlock assembly</span>
      </div>
    </div>
  `;
  container.appendChild(el);
}

export function unmount() {
  _container = null;
}

export function update(dt) {
  // Will be implemented in Phase 4
}

export function onInput(event) {
  // Will be implemented in Phase 4
}
