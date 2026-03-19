/* ============================================================
   Thread & Template — Unified Input Handler
   Handles mouse, touch, and stylus via Pointer Events API
   ============================================================ */

// --- Input Event Types ---
export const INPUT = Object.freeze({
  DOWN:       'down',
  MOVE:       'move',
  UP:         'up',
  TAP:        'tap',
  DOUBLE_TAP: 'double-tap',
  DRAG_START: 'drag-start',
  DRAG:       'drag',
  DRAG_END:   'drag-end',
  PINCH:      'pinch',
  PAN:        'pan',
});

// --- Pointer Types ---
export const POINTER = Object.freeze({
  MOUSE:  'mouse',
  TOUCH:  'touch',
  PEN:    'pen',
});

const DOUBLE_TAP_MS = 300;
const DRAG_THRESHOLD = 5; // px before drag starts

/**
 * InputManager — attaches to a DOM element and emits unified input events.
 */
export class InputManager {
  constructor(element) {
    this._el = element;
    this._listeners = new Set();
    this._pointers = new Map(); // pointerId -> { x, y, startX, startY, startTime, dragging }
    this._lastTapTime = 0;
    this._lastTapPos = { x: 0, y: 0 };
    this._bound = {};

    this._bind();
  }

  /** Subscribe to input events. Returns unsubscribe function. */
  on(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Remove all listeners and event handlers */
  destroy() {
    const el = this._el;
    el.removeEventListener('pointerdown', this._bound.down);
    el.removeEventListener('pointermove', this._bound.move);
    el.removeEventListener('pointerup', this._bound.up);
    el.removeEventListener('pointercancel', this._bound.up);
    el.removeEventListener('wheel', this._bound.wheel);
    el.removeEventListener('contextmenu', this._bound.context);
    this._listeners.clear();
    this._pointers.clear();
  }

  _bind() {
    const el = this._el;

    this._bound.down = this._onPointerDown.bind(this);
    this._bound.move = this._onPointerMove.bind(this);
    this._bound.up = this._onPointerUp.bind(this);
    this._bound.wheel = this._onWheel.bind(this);
    this._bound.context = e => e.preventDefault();

    el.addEventListener('pointerdown', this._bound.down);
    el.addEventListener('pointermove', this._bound.move);
    el.addEventListener('pointerup', this._bound.up);
    el.addEventListener('pointercancel', this._bound.up);
    el.addEventListener('wheel', this._bound.wheel, { passive: false });
    el.addEventListener('contextmenu', this._bound.context);
  }

  _getPos(e) {
    const rect = this._el.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  _emit(type, data) {
    const event = { type, ...data };
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Input listener error:', err);
      }
    }
  }

  _onPointerDown(e) {
    this._el.setPointerCapture(e.pointerId);
    const pos = this._getPos(e);

    this._pointers.set(e.pointerId, {
      x: pos.x,
      y: pos.y,
      startX: pos.x,
      startY: pos.y,
      startTime: performance.now(),
      dragging: false,
      pointerType: e.pointerType,
      pressure: e.pressure,
    });

    this._emit(INPUT.DOWN, {
      x: pos.x,
      y: pos.y,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      pressure: e.pressure,
      button: e.button,
    });

    // Handle pinch with 2 pointers
    if (this._pointers.size === 2) {
      this._pinchStart = this._getPinchDist();
    }
  }

  _onPointerMove(e) {
    const ptr = this._pointers.get(e.pointerId);
    if (!ptr) return;

    const pos = this._getPos(e);
    const dx = pos.x - ptr.startX;
    const dy = pos.y - ptr.startY;

    ptr.x = pos.x;
    ptr.y = pos.y;
    ptr.pressure = e.pressure;

    // Two-pointer pinch/pan
    if (this._pointers.size === 2) {
      const dist = this._getPinchDist();
      if (this._pinchStart) {
        this._emit(INPUT.PINCH, {
          scale: dist / this._pinchStart,
          center: this._getPinchCenter(),
        });
      }
      return;
    }

    // Single pointer drag detection
    if (!ptr.dragging) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= DRAG_THRESHOLD) {
        ptr.dragging = true;
        this._emit(INPUT.DRAG_START, {
          x: ptr.startX,
          y: ptr.startY,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
        });
      }
    }

    if (ptr.dragging) {
      this._emit(INPUT.DRAG, {
        x: pos.x,
        y: pos.y,
        dx: pos.x - ptr.x,
        dy: pos.y - ptr.y,
        startX: ptr.startX,
        startY: ptr.startY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        pressure: e.pressure,
      });
    } else {
      this._emit(INPUT.MOVE, {
        x: pos.x,
        y: pos.y,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        pressure: e.pressure,
      });
    }
  }

  _onPointerUp(e) {
    const ptr = this._pointers.get(e.pointerId);
    if (!ptr) return;

    const pos = this._getPos(e);

    if (ptr.dragging) {
      this._emit(INPUT.DRAG_END, {
        x: pos.x,
        y: pos.y,
        startX: ptr.startX,
        startY: ptr.startY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
      });
    } else {
      // It was a tap
      const now = performance.now();
      const timeSinceLast = now - this._lastTapTime;
      const distFromLast = Math.sqrt(
        (pos.x - this._lastTapPos.x) ** 2 +
        (pos.y - this._lastTapPos.y) ** 2
      );

      if (timeSinceLast < DOUBLE_TAP_MS && distFromLast < 30) {
        this._emit(INPUT.DOUBLE_TAP, {
          x: pos.x,
          y: pos.y,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
        });
        this._lastTapTime = 0;
      } else {
        this._emit(INPUT.TAP, {
          x: pos.x,
          y: pos.y,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
        });
        this._lastTapTime = now;
        this._lastTapPos = { x: pos.x, y: pos.y };
      }
    }

    this._pointers.delete(e.pointerId);
    this._el.releasePointerCapture(e.pointerId);

    if (this._pointers.size < 2) {
      this._pinchStart = null;
    }

    this._emit(INPUT.UP, {
      x: pos.x,
      y: pos.y,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    });
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._getPos(e);
    // Treat wheel as a pinch zoom
    const scale = e.deltaY > 0 ? 0.95 : 1.05;
    this._emit(INPUT.PINCH, {
      scale,
      center: pos,
      deltaY: e.deltaY,
    });
  }

  _getPinchDist() {
    const ptrs = Array.from(this._pointers.values());
    if (ptrs.length < 2) return 1;
    const dx = ptrs[1].x - ptrs[0].x;
    const dy = ptrs[1].y - ptrs[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getPinchCenter() {
    const ptrs = Array.from(this._pointers.values());
    if (ptrs.length < 2) return { x: 0, y: 0 };
    return {
      x: (ptrs[0].x + ptrs[1].x) / 2,
      y: (ptrs[0].y + ptrs[1].y) / 2,
    };
  }
}
