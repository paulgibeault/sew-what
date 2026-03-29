/* ============================================================
   Thread & Template — Central Game State
   ============================================================ */

import { TIER, SCREEN } from './constants.js';
import { deepClone } from './utils.js';

/**
 * Create a fresh initial game state.
 */
export function createInitialState() {
  return {
    // Player progression
    player: {
      skillTree: {},       // { skillId: { level: 0, xp: 0 } }
      unlockedProjects: ['apron'],  // Start with Apron unlocked
      completedProjects: {},  // { projectId: { score, grade, timestamp } }
      currentTier: TIER.BEGINNER,
    },

    // Sewing Queue (Kanban)
    queue: {
      toSew: [],
      inProgress: [],
      finished: [],
    },

    // Active project being worked on
    activeProject: null,
    /* When active:
    {
      projectId: string,
      stage: STAGE.DRAFTING | STAGE.MATERIAL | STAGE.ASSEMBLY,
      pattern: null,          // PatternData after Stage I
      materialLayout: null,   // LayoutData after Stage II
      assemblyState: null,    // AssemblyData during Stage III
      score: { accuracy: 0, efficiency: 0, craftsmanship: 0 },
    }
    */

    // Inspiration board items
    inspirationBoard: {
      items: [],
      /* Each item:
      {
        id: string,
        type: 'swatch' | 'note' | 'image',
        x: number,
        y: number,
        data: { ... }  // type-specific
      }
      */
    },

    // Current screen
    currentScreen: SCREEN.QUEUE,

    // Settings
    settings: {
      snapToGrid: true,
      showSeamAllowances: true,
      measurementMode: 'rtw',
      units: 'imperial',  // 'imperial' | 'metric'
    },
  };
}

// --- Singleton State ---
let _state = createInitialState();
const _listeners = new Set();

/** Get the current game state (read-only reference) */
export function getState() {
  return _state;
}

/** Replace the entire state and notify listeners */
export function setState(newState) {
  _state = newState;
  _notifyListeners();
}

/** Merge a partial update into the state and notify listeners */
export function updateState(partial) {
  _state = { ..._state, ...partial };
  _notifyListeners();
}

/** Update a nested path in state. Example: updateNested('player.currentTier', TIER.INTERMEDIATE) */
export function updateNested(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let obj = _state;

  // Walk to the parent, creating shallow copies along the way
  const root = { ..._state };
  let current = root;
  for (let i = 0; i < keys.length; i++) {
    current[keys[i]] = { ...current[keys[i]] };
    current = current[keys[i]];
  }
  current[last] = value;

  _state = root;
  _notifyListeners();
}

/** Subscribe to state changes. Returns unsubscribe function. */
export function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** Snapshot the current state (deep clone for undo/save) */
export function snapshotState() {
  return deepClone(_state);
}

/** Restore from a snapshot */
export function restoreState(snapshot) {
  _state = deepClone(snapshot);
  _notifyListeners();
}

function _notifyListeners() {
  for (const listener of _listeners) {
    try {
      listener(_state);
    } catch (err) {
      console.error('State listener error:', err);
    }
  }
}
