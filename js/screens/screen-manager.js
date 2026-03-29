/* ============================================================
   Thread & Template — Screen Manager
   Manages screen lifecycle: mount, unmount, update
   ============================================================ */

/**
 * ScreenManager — routes between screens, manages lifecycle.
 *
 * Each screen module must export:
 *   mount(container)  — Create DOM/SVG/Canvas elements inside container
 *   unmount()         — Clean up (remove listeners, etc.)
 *   update(dt)        — Called each frame if dirty (optional)
 *   onInput(event)    — Receive input events (optional)
 *   onResize()        — Handle window resize (optional)
 */
export class ScreenManager {
  constructor(containerEl) {
    this._container = containerEl;
    this._screens = new Map();    // screenId -> screen module
    this._activeId = null;
    this._activeScreen = null;
  }

  /**
   * Register a screen module by ID.
   * @param {string} id - Screen identifier (matches SCREEN constants)
   * @param {object} screenModule - Module with mount/unmount/update/onInput
   */
  register(id, screenModule) {
    this._screens.set(id, screenModule);
  }

  /**
   * Switch to a screen by ID.
   * Unmounts the current screen and mounts the new one.
   * @param {string} id - Screen ID to switch to
   */
  async switchTo(id) {
    if (id === this._activeId) return;

    const screen = this._screens.get(id);
    if (!screen) {
      console.warn(`Screen not found: ${id}`);
      return;
    }

    // Unmount current
    if (this._activeScreen) {
      try {
        this._activeScreen.unmount();
      } catch (err) {
        console.error(`Error unmounting screen ${this._activeId}:`, err);
      }
    }

    // Clear container
    this._container.innerHTML = '';

    // Mount new screen (supports async mount)
    this._activeId = id;
    this._activeScreen = screen;

    try {
      await screen.mount(this._container);
    } catch (err) {
      console.error(`Error mounting screen ${id}:`, err);
    }
  }

  /** Get the currently active screen ID */
  get activeId() {
    return this._activeId;
  }

  /** Get the currently active screen module */
  get activeScreen() {
    return this._activeScreen;
  }

  /** Forward an update tick to the active screen. Returns true if screen needs continuous frames. */
  update(dt) {
    if (this._activeScreen && this._activeScreen.update) {
      return this._activeScreen.update(dt);
    }
    return false;
  }

  /** Forward an input event to the active screen */
  onInput(event) {
    if (this._activeScreen && this._activeScreen.onInput) {
      this._activeScreen.onInput(event);
    }
  }

  /** Forward a resize event to the active screen */
  onResize() {
    if (this._activeScreen && this._activeScreen.onResize) {
      this._activeScreen.onResize();
    }
  }
}
