/* ============================================================
   Thread & Template — Material Layout Screen (Stage II)
   Placeholder — will be expanded in Phase 3
   ============================================================ */

let _container = null;

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen material-screen';
  el.style.flexDirection = 'row';
  el.innerHTML = `
    <div class="fabric-bolt-area" id="fabric-bolt-area">
      <div class="screen-placeholder">
        <span class="placeholder-icon">&#9634;</span>
        <span class="placeholder-label">Fabric Layout</span>
        <span class="placeholder-hint">Validate a pattern in the Drafting stage first</span>
      </div>
    </div>
  `;
  container.appendChild(el);
}

export function unmount() {
  _container = null;
}

export function update(dt) {
  // Will be implemented in Phase 3
}

export function onInput(event) {
  // Will be implemented in Phase 3
}
