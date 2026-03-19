/* ============================================================
   Thread & Template — Inspiration Board Screen (Mood Board)
   Placeholder — will be expanded in Phase 2
   ============================================================ */

let _container = null;

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen inspiration-screen';
  el.innerHTML = `
    <div class="inspiration-canvas" id="inspiration-canvas">
      <div class="screen-placeholder">
        <span class="placeholder-icon">&#9733;</span>
        <span class="placeholder-label">Inspiration Board</span>
        <span class="placeholder-hint">Drag fabric swatches and reference images here</span>
      </div>
    </div>
  `;
  container.appendChild(el);
}

export function unmount() {
  _container = null;
}

export function update(dt) {
  // Will be implemented in Phase 2
}

export function onInput(event) {
  // Will be implemented in Phase 2
}
