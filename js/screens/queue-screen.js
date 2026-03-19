/* ============================================================
   Thread & Template — Sewing Queue Screen (Kanban)
   Placeholder — will be expanded in Phase 2
   ============================================================ */

let _container = null;

export function mount(container) {
  _container = container;

  const el = document.createElement('div');
  el.className = 'screen queue-screen';
  el.innerHTML = `
    <div class="queue-header">
      <span style="font-size:14px; font-weight:500;">Sewing Queue</span>
      <button class="btn btn-sm btn-primary" id="new-project-btn">+ New Project</button>
    </div>
    <div class="queue-columns">
      <div class="queue-column">
        <div class="queue-column-header">
          To Sew
          <span class="queue-column-count" id="count-to-sew">0</span>
        </div>
        <div class="queue-card-list" id="col-to-sew" data-column="toSew">
          <div class="screen-placeholder" style="padding:24px 0;">
            <span class="placeholder-hint">No projects yet</span>
          </div>
        </div>
      </div>
      <div class="queue-column">
        <div class="queue-column-header">
          In Progress
          <span class="queue-column-count" id="count-in-progress">0</span>
        </div>
        <div class="queue-card-list" id="col-in-progress" data-column="inProgress">
          <div class="screen-placeholder" style="padding:24px 0;">
            <span class="placeholder-hint">Start a project</span>
          </div>
        </div>
      </div>
      <div class="queue-column">
        <div class="queue-column-header">
          Finished
          <span class="queue-column-count" id="count-finished">0</span>
        </div>
        <div class="queue-card-list" id="col-finished" data-column="finished">
          <div class="screen-placeholder" style="padding:24px 0;">
            <span class="placeholder-hint">Complete projects to see them here</span>
          </div>
        </div>
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
