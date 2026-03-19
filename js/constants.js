/* ============================================================
   Thread & Template — Constants & Configuration
   ============================================================ */

// --- Complexity Tiers ---
export const TIER = Object.freeze({
  BEGINNER:     'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED:     'advanced',
  COUTURE:      'couture',
});

// --- Game Stages ---
export const STAGE = Object.freeze({
  DRAFTING:  'drafting',
  MATERIAL:  'material',
  ASSEMBLY:  'assembly',
});

// --- Screen IDs ---
export const SCREEN = Object.freeze({
  INSPIRATION: 'inspiration',
  QUEUE:       'queue',
  DRAFTING:    'drafting',
  MATERIAL:    'material',
  ASSEMBLY:    'assembly',
});

// --- Anchor Types ---
export const ANCHOR = Object.freeze({
  CORNER:         'corner',
  CURVE_CONTROL:  'curve-control',
  NOTCH:          'notch',
  GRAINLINE:      'grainline',
});

// --- Segment Types ---
export const SEGMENT = Object.freeze({
  LINE:  'line',
  CURVE: 'curve',
});

// --- Measurement Modes ---
export const MEASURE_MODE = Object.freeze({
  RTW:     'rtw',
  BESPOKE: 'bespoke',
});

// --- Drafting Tools ---
export const TOOL = Object.freeze({
  SELECT:    'select',
  MOVE:      'move',
  ADD_POINT: 'add-point',
  PAN:       'pan',
  ZOOM:      'zoom',
});

// --- Validation Error Types ---
export const VALIDATION = Object.freeze({
  PIECE_NOT_CLOSED:      'piece-not-closed',
  SEAM_LENGTH_MISMATCH:  'seam-length-mismatch',
  SEAM_ALLOW_TOO_SMALL:  'seam-allow-too-small',
  NO_GRAINLINE:          'no-grainline',
  SELF_INTERSECTION:     'self-intersection',
});

// --- Assembly Fail States ---
export const FAIL_STATE = Object.freeze({
  SEAM_PEEK:           'seam-peek',
  STRUCTURAL_COLLAPSE: 'structural-collapse',
  EDGE_DEGRADATION:    'edge-degradation',
  PULLING_ARTIFACT:    'pulling-artifact',
});

// --- Puzzle Grades ---
export const GRADE = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
  F: 'F',
});

// --- Colors (matching CSS custom properties) ---
export const COLORS = Object.freeze({
  BG:             '#1a1a2e',
  BG_SURFACE:     '#222240',
  BG_ELEVATED:    '#2a2a4a',
  BG_INSET:       '#141428',
  ACCENT:         '#c4a882',
  ACCENT_LIGHT:   '#e8d5b7',
  ACCENT_DIM:     '#8a7560',
  TEXT:           '#e8e8f0',
  TEXT_MUTED:     '#9898b0',
  SUCCESS:        '#5cb85c',
  WARNING:        '#d4a843',
  ERROR:          '#c45050',
  GRID:           '#2a2a4a',
  GRID_MAJOR:     '#3a3a5a',
});

// --- Drafting Canvas Defaults ---
export const DRAFTING = Object.freeze({
  GRID_SPACING:         10,    // px per grid unit
  GRID_MAJOR_EVERY:     10,    // major gridline every N units
  DEFAULT_SEAM_ALLOW:   0.625, // inches (5/8")
  MIN_SEAM_ALLOW:       0.25,  // inches (1/4")
  ANCHOR_RADIUS:        4,     // SVG units
  ANCHOR_HIT_RADIUS:    12,    // touch target radius
  SNAP_THRESHOLD:        5,    // snap-to-grid threshold in px
  ZOOM_MIN:             0.25,
  ZOOM_MAX:             4.0,
  ZOOM_STEP:            0.1,
  PX_PER_INCH:          20,    // scale: 1 inch = 20px on canvas
});

// --- Animation ---
export const ANIM = Object.freeze({
  TWEEN_DEFAULT_MS:  300,
  TWEEN_FAST_MS:     150,
  TWEEN_SLOW_MS:     600,
});

// --- Storage Keys ---
export const STORAGE = Object.freeze({
  GAME_STATE: 'thread-template-state',
  SETTINGS:   'thread-template-settings',
});

// --- Mini-Game Scoring ---
export const SCORING = Object.freeze({
  GRADE_A_THRESHOLD: 0.9,
  GRADE_B_THRESHOLD: 0.7,
  GRADE_C_THRESHOLD: 0.5,
  MAX_FAIL_PENALTIES: 3,
});
