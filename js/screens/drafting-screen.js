/* ============================================================
   Thread & Template — Drafting Screen (Stage I)
   Placeholder — will be expanded in Phase 1
   ============================================================ */

let _container = null;

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen drafting-screen';
  el.innerHTML = `
    <div class="drafting-toolbar">
      <div class="toolbar-group">
        <button class="tool-btn active" data-tool="select" title="Select">&#9654;</button>
        <button class="tool-btn" data-tool="move" title="Move Point">&#10010;</button>
        <button class="tool-btn" data-tool="add-point" title="Add Point">&#10011;</button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="tool-btn" data-tool="pan" title="Pan">&#9995;</button>
        <button class="tool-btn" data-tool="zoom-in" title="Zoom In">&#43;</button>
        <button class="tool-btn" data-tool="zoom-out" title="Zoom Out">&#8722;</button>
      </div>
      <div class="toolbar-separator"></div>
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
          <!-- Grid layer -->
          <g id="grid-layer"></g>
          <!-- Pattern pieces layer -->
          <g id="pattern-layer"></g>
          <!-- Seam allowance layer -->
          <g id="seam-layer"></g>
          <!-- Annotations layer -->
          <g id="annotation-layer"></g>
          <!-- Anchors layer (on top for hit testing) -->
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
            Ready to draft
          </div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(el);

  _initGrid();
}

export function unmount() {
  _container = null;
}

export function update(dt) {
  // Will be implemented in Phase 1
}

export function onInput(event) {
  // Will be implemented in Phase 1
}

export function onResize() {
  _initGrid();
}

function _initGrid() {
  const svg = document.getElementById('drafting-svg');
  const gridLayer = document.getElementById('grid-layer');
  if (!svg || !gridLayer) return;

  const area = document.getElementById('drafting-svg-area');
  if (!area) return;

  const w = area.clientWidth;
  const h = area.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  gridLayer.innerHTML = '';

  const spacing = 20;
  const majorEvery = 5;

  // Vertical lines
  for (let x = 0; x <= w; x += spacing) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', h);
    line.setAttribute('class', (x / spacing) % majorEvery === 0 ? 'grid-line major' : 'grid-line');
    gridLayer.appendChild(line);
  }

  // Horizontal lines
  for (let y = 0; y <= h; y += spacing) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', y);
    line.setAttribute('x2', w);
    line.setAttribute('y2', y);
    line.setAttribute('class', (y / spacing) % majorEvery === 0 ? 'grid-line major' : 'grid-line');
    gridLayer.appendChild(line);
  }
}
