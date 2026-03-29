# Plan: Realistic Sewing Simulator Upgrade

## Context

Thread & Template has a complete MVP (apron project, three stages, scoring). This plan upgrades it from a puzzle game into a **realistic sewing simulator and tutorial** that can import industry-standard patterns, simulate fabric physics, and teach real construction techniques through engaging mechanics.

Research sources: pattern-projector (reference app under `/reference/`), Verlet cloth simulation literature, polygon clipping libraries, displacement map techniques.

---

## Track A: Pattern Interoperability & Standards

### A1. SVG Pattern Import

**Goal:** Import real sewing patterns from FreeSewing, Valentina, Seamwork, and other SVG-based tools.

**Current state:** Patterns are created internally via formula-based templates in `measurements-rtw.json`. Pieces are defined as anchors + segments.

**Changes:**
- New module `js/drafting/svg-import.js`:
  - Parse SVG files via `DOMParser`
  - Extract `<path>`, `<line>`, `<polyline>` elements as pattern pieces
  - Detect Inkscape layers (`inkscape:groupmode="layer"`) for multi-size patterns
  - Extract piece metadata from element IDs/classes (e.g., `id="front-bodice"`, `class="grainline"`)
  - Convert SVG coordinates to internal coordinate system
  - Recognize common sewing SVG conventions:
    - Dashed lines = fold lines
    - Arrows = grainlines
    - Small perpendicular marks = notches
    - Drill holes (small circles) = dart points, button placement
- Layer toggle UI in drafting screen for multi-size patterns
- File picker in queue screen: "Import Pattern" alongside "New Project"

**Pattern-projector reference:** See `/reference/pattern-projector/app/_lib/layers.ts` for layer extraction, `/reference/pattern-projector/app/_components/svg-viewer.tsx` for SVG rendering approach.

### A2. PDF Pattern Import

**Goal:** Support the dominant commercial pattern format (tiled PDFs).

**Changes:**
- Add `pdf.js` (Mozilla's PDF renderer) as a dependency
- New module `js/drafting/pdf-import.js`:
  - Render PDF pages to canvas
  - Page stitching: tile layout with configurable edge insets (overlap margins)
  - Page range selection UI
  - Extract Optional Content Groups (layers) for size selection
- Potential game mechanic: "Tape the Pages" mini-game where players arrange tiled pages correctly before cutting

**Pattern-projector reference:** See `/reference/pattern-projector/app/_lib/pdfstitcher.ts` for the full stitching algorithm, `/reference/pattern-projector/app/_lib/interfaces/stitch-settings.ts` for tile config.

### A3. Standard Unit System

**Goal:** Support true-scale measurements for real pattern compatibility.

**Current state:** `PX_PER_INCH = 20` is game-scale.

**Changes:**
- Add `PX_PER_INCH_REAL = 96` constant (standard screen PPI)
- Scale factor in `constants.js`: `DISPLAY_SCALE = PX_PER_INCH / PX_PER_INCH_REAL`
- Unit toggle in settings: inches / centimeters / game-scale
- Ruler overlay that shows real measurements (like pattern-projector's grid overlay)
- Update `seam-allowance.js`, `layout-validator.js`, and `measurements.js` to work in real units internally, converting to display pixels only for rendering

### A4. Enhanced Pattern Piece Metadata

**Goal:** Model all the markings found on real sewing patterns.

**Current state:** Pieces have anchors, segments, seamAllowance (number), grainlineAngle (0/90/180/270).

**New fields on `PatternPiece`:**
```javascript
{
  // Existing
  seamAllowance: 0.625,

  // New
  grainline: { x1, y1, x2, y2, angle },  // Full vector, not just enum
  foldLine: { x1, y1, x2, y2 } | null,    // Cut-on-fold edge
  mirrorPiece: boolean,                     // Whether to cut a mirror copy
  cutCount: 2,                              // "Cut 2" / "Cut 1 on fold"
  notches: [{ x, y, type: 'single'|'double'|'triangle', matchId }],
  drillHoles: [{ x, y, label }],            // Dart points, button marks
  seamLabels: [{ segmentId, label }],        // "Stitch to Front #3"
  fabric: 'self'|'lining'|'interfacing',     // Which fabric to cut from
}
```

**Validation additions in `validator.js`:**
- Seam length matching: joined edges must be within 1/8" tolerance
- Notch pairing: each notch must have a matching notch on its joining piece
- Grainline specified as vector (allow bias cuts at 45deg)
- Cut-on-fold pieces must have fold edge on straight grain

---

## Track B: Fabric Simulation & Physics

### B1. Verlet Cloth Simulation Engine

**Goal:** Fabric that moves, drapes, and responds to interaction realistically.

**New module `js/fabric/cloth-sim.js`:**

**Core algorithm — Verlet integration:**
```
position_new = 2 * position_current - position_previous + acceleration * dt^2
velocity is implicit (position_current - position_previous)
```

**Mesh structure:**
- Grid of point masses (particles) at configurable spacing (e.g., 8px)
- Constraints between neighbors:
  - **Structural** (horizontal + vertical) — resist stretching
  - **Shear** (diagonal) — resist diagonal deformation
  - **Bend** (skip-one neighbor) — resist folding
- Each constraint has a rest length = initial spacing
- Constraint satisfaction: 3-5 iterations per frame

**Particle properties:**
```javascript
{
  x, y,              // Current position
  prevX, prevY,      // Previous position (velocity is implicit)
  pinned: boolean,   // Fixed in place (anchored/pinned)
  mass: number,      // Affects gravity response
}
```

**Material presets** (per fabric type):
| Fabric   | Stiffness | Weight | Damping | Bend Resist | Shear Resist |
|----------|-----------|--------|---------|-------------|--------------|
| Cotton   | Medium    | Medium | 0.98    | Medium      | Medium       |
| Denim    | High      | High   | 0.96    | High        | High         |
| Silk     | Low       | Low    | 0.99    | Low         | Low          |
| Knit     | Low       | Medium | 0.97    | Low         | Low          |
| Canvas   | High      | High   | 0.95    | High        | High         |
| Chiffon  | Very Low  | Very Low| 0.995  | Very Low    | Low          |

Implementation:
- `stiffness` = number of constraint solver iterations (2-8)
- `weight` = gravity multiplier on particle mass
- `damping` = velocity retention factor per frame (0.95-0.995)
- `bendResist` = spring constant for skip-one constraints
- `shearResist` = spring constant for diagonal constraints

### B2. Fabric Rendering

**New module `js/fabric/cloth-renderer.js`:**

**Canvas 2D rendering pipeline:**
1. Triangulate mesh (each quad → 2 triangles)
2. For each triangle, clip canvas and draw fabric texture via `ctx.drawImage()` with affine transform
3. Apply displacement-based shading:
   - Compute per-particle pseudo-normal from neighbor positions
   - Light direction from top-left
   - Shade factor: `dot(normal, lightDir)` → darken valleys, brighten peaks
4. Draw fold creases as subtle dark lines where bend angle exceeds threshold
5. Optional: displacement map from fabric photo for wrinkle texture

**Layer rendering for folded fabric:**
- When fabric is folded, render as two layers with:
  - Drop shadow between layers (`ctx.shadowOffsetX/Y = 2, shadowBlur = 4`)
  - Visible fold edge (2-3px dark stroke)
  - Slightly offset position to suggest thickness
- Z-order: bottom layer renders first, fold layer on top

**Texture system:**
- Fabric texture images (tileable) per material type
- Grain direction shown via texture orientation
- Selvedge edge markings on bolt edges

### B3. Fabric Interaction

**Integrated into existing `input.js` event system:**

**Drag interaction:**
- Click/touch applies force to nearby particles within influence radius
- Force proportional to distance from touch point (falloff)
- Dragging moves the closest particle directly; neighbors follow via constraints
- Release: fabric settles gradually (no instant snap)

**Fold mechanic:**
- Player draws a fold line across fabric
- Particles on one side of the line mirror across it
- Folded region renders as second layer (see B2)
- Fold states: unfolded → folded once → folded twice (for hems)
- Can unfold by reversing

**Cut mechanic:**
- Player draws cut line along marked cutting line (or freehand)
- Use polygon clipping (Martinez-Rueda algorithm via `polygon-clipping` or `polygon-splitter` library, or implement simplified version)
- Constraints crossing the cut line are removed
- Mesh separates into independent pieces
- Each piece becomes its own cloth simulation object
- Score based on accuracy of cut vs. marked line

**Pin mechanic:**
- Tap to place a pin at a point on the fabric
- Pin = particle.pinned = true (doesn't move during simulation)
- Visual: pin icon rendered at location
- Pins hold fabric in place during other operations
- Required before certain assembly steps (realistic sewing workflow)

### B4. Fabric in Each Game Stage

**Stage II (Material Layout):**
- Fabric bolt rendered as cloth sim (simplified — flat, minimal physics)
- Pattern pieces laid on top with grain alignment
- When piece is placed, show fabric weight/drape preview
- Cutting: trace along pattern outline to cut piece from bolt
- Cut pieces separate and can be picked up individually

**Stage III (Assembly):**
- Each cut piece is its own cloth sim object
- Pieces must be pinned, folded, aligned, and sewn
- Fabric responds to manipulation (drapes over table edge, bunches when pushed)
- Sewing joins particles between two pieces (see Track C)

---

## Track C: Assembly Mechanic Overhaul

### C1. Replace Straight-Seam Trace

**Problem:** Current `StraightSeamGame` is a horizontal line trace — not fun or realistic. It's just "drag along a line."

**New mechanic: Sewing Machine Simulation**

The player operates a virtual sewing machine. The fabric feeds through and the player controls:
1. **Stitch speed** — hold/press to sew (like a foot pedal). Tap for single stitches, hold for continuous.
2. **Fabric guidance** — drag/tilt the fabric to keep the seam allowance aligned with the guide mark. The fabric moves *toward* you (top to bottom), not left to right.
3. **Seam allowance accuracy** — a guide line on the machine throat plate shows the target distance from the needle. Player keeps the fabric edge aligned to this guide.

**Implementation — `js/assembly/sewing-machine.js`:**
```javascript
SewingMachine = {
  needlePos: { x, y },          // Fixed position on screen
  throatPlate: {                 // Visual guide area
    guidelines: [3/8", 1/2", 5/8", 1"],  // Common seam allowance marks
    activeGuide: 5/8",
  },
  presserFoot: { down: boolean },
  feedRate: number,              // px per stitch
  stitchLength: 2.5,            // mm (adjustable)

  // Player controls
  pedal: { pressed: boolean, speed: 0-1 },
  fabricOffset: { x: 0 },       // Player's lateral guidance
}
```

**Scoring:**
- **Seam allowance consistency**: how well the fabric edge tracks the guide line (replaces "distance from line")
- **Speed control**: penalty for going too fast around curves (fabric bunches)
- **Start/stop**: bonus for backstitching at seam start and end (lock stitches)
- **Stitch length consistency**: maintain even stitches

**Visual:**
- Top-down view of sewing machine throat plate area
- Fabric feeds from top to bottom
- Needle animated (up/down cycle)
- Thread appears behind the needle as stitches form
- Presser foot visible holding fabric down
- Seam allowance guide lines on throat plate

### C2. Replace Align-and-Sew with Multi-Step Construction

**Problem:** Current `AlignAndSewGame` is drag-to-zone → trace-line. Doesn't teach real construction order.

**New mechanic: Construction Workbench**

Each assembly step is a multi-phase operation on the workbench:

**Phase 1 — Prepare:**
- Select correct pieces from the piece tray
- Orient pieces correctly (right side vs. wrong side — indicated by fabric pattern/color difference)
- "Right sides together" = flip piece so the patterned side faces down

**Phase 2 — Align:**
- Match notches between pieces (drag notch to notch, they snap)
- Align edges (pieces snap when edges are within tolerance)
- Pin pieces together (tap to place pins along the edge at ~2" intervals)
- Pins must be perpendicular to seam line (score for pin angle)

**Phase 3 — Sew:**
- Transfer pinned assembly to sewing machine view (Track C1)
- Remove pins as you approach them (can't sew over pins!)
- Sew the seam using machine mechanic
- Backstitch at start and end

**Phase 4 — Finish:**
- Press seam open or to one side (iron mini-game: drag iron along seam)
- Trim excess seam allowance if needed
- Grade seam (trim one layer shorter than other for bulk reduction)
- Turn right-side-out for enclosed seams

**Implementation — update `js/assembly/step-engine.js`:**
- Each step definition includes `phases: ['prepare', 'align', 'sew', 'finish']`
- Phase-specific mini-games loaded dynamically
- Score is weighted average across phases

### C3. New Mini-Games

**`js/assembly/mini-games/` (split from single file):**

| Mini-Game | Used For | Mechanic |
|-----------|----------|----------|
| `sewing-machine.js` | All seam stitching | Feed fabric, control speed, maintain SA (C1) |
| `pin-placement.js` | Pre-sewing alignment | Tap to place pins perpendicular to edge |
| `notch-matching.js` | Piece alignment | Drag notch points to matching notch targets |
| `pressing.js` | Seam finishing | Drag iron along seam, hold for duration |
| `fold-hem.js` | Hemming | Fold fabric edge once/twice using fold mechanic (B3) |
| `cutting.js` | Cutting from bolt | Trace scissors along pattern line on fabric (B3 cut) |
| `turning.js` | Enclosed seams | Drag fabric through opening to turn right-side-out |
| `basting.js` | Temporary stitching | Long running stitches to hold pieces before final sew |

### C4. Updated Apron Steps

Replace current `APRON_STEPS` with realistic multi-phase construction:

```javascript
APRON_STEPS = [
  {
    id: 'cut-pieces',
    name: 'Cut Pattern Pieces',
    phases: ['cutting'],
    instruction: 'Pin pattern to fabric following grainline. Cut around each piece.',
    pieces: ['apron-body', 'apron-bib', 'apron-waistband', 'apron-neck-strap'],
    technique: 'cutting',
  },
  {
    id: 'hem-body-bottom',
    name: 'Hem the Bottom Edge',
    phases: ['fold-hem', 'pressing', 'sewing-machine'],
    instruction: 'Double-fold hem: fold 1/2" then 1/2" again. Press. Stitch.',
    foldAmount: [0.5, 0.5],  // inches, two folds
    piece: 'apron-body',
    edge: 'bottom',
    technique: 'double-fold-hem',
  },
  {
    id: 'hem-body-sides',
    name: 'Hem the Side Edges',
    phases: ['fold-hem', 'pressing', 'sewing-machine'],
    instruction: 'Double-fold hem each side: 1/2" twice. Press and stitch.',
    foldAmount: [0.5, 0.5],
    piece: 'apron-body',
    edge: 'sides',
    technique: 'double-fold-hem',
  },
  {
    id: 'attach-bib',
    name: 'Attach the Bib to Body',
    phases: ['prepare', 'notch-matching', 'pin-placement', 'sewing-machine', 'pressing'],
    instruction: 'Right sides together, center bib on body top edge. Match notches, pin, stitch 5/8" SA. Press seam toward body.',
    piece: 'apron-body',
    attachPiece: 'apron-bib',
    technique: 'right-sides-together',
    seamAllowance: 0.625,
  },
  {
    id: 'hem-bib',
    name: 'Hem the Bib',
    phases: ['fold-hem', 'pressing', 'sewing-machine'],
    instruction: 'Narrow hem: fold 1/4" twice on sides and top. Press and stitch.',
    foldAmount: [0.25, 0.25],
    piece: 'apron-bib',
    edge: 'sides-and-top',
    technique: 'narrow-hem',
  },
  {
    id: 'make-waistband',
    name: 'Prepare the Waistband',
    phases: ['fold-hem', 'pressing', 'sewing-machine'],
    instruction: 'Fold waistband lengthwise, wrong sides together. Press. Stitch long edge closed.',
    piece: 'apron-waistband',
    technique: 'fold-and-stitch',
  },
  {
    id: 'attach-waistband',
    name: 'Attach Waistband to Body',
    phases: ['prepare', 'notch-matching', 'pin-placement', 'sewing-machine'],
    instruction: 'Center waistband on body top edge (over bib seam). Pin. Stitch through all layers.',
    piece: 'apron-body',
    attachPiece: 'apron-waistband',
    technique: 'sandwich-attach',
  },
  {
    id: 'make-strap',
    name: 'Make the Neck Strap',
    phases: ['fold-hem', 'sewing-machine', 'turning'],
    instruction: 'Fold strap lengthwise, right sides together. Stitch long edge. Turn right-side-out. Press.',
    piece: 'apron-neck-strap',
    technique: 'tube-turn',
  },
  {
    id: 'attach-strap',
    name: 'Attach Neck Strap to Bib',
    phases: ['pin-placement', 'sewing-machine'],
    instruction: 'Pin each strap end to a top corner of the bib. Stitch a reinforced square (box stitch).',
    piece: 'apron-bib',
    attachPiece: 'apron-neck-strap',
    technique: 'box-stitch',
  },
];
```

---

## Track D: Tutorial & Learning System

### D1. Technique Library

**New module `js/tutorial/techniques.js`:**

Each sewing technique has:
```javascript
{
  id: 'double-fold-hem',
  name: 'Double-Fold Hem',
  difficulty: 'beginner',
  description: 'Encloses raw edge in two folds to prevent fraying.',
  steps: ['Fold edge to wrong side by specified amount', 'Fold again by same amount', 'Press flat', 'Stitch close to inner fold'],
  tips: ['Press each fold before stitching', 'Use a seam gauge for consistent width'],
  commonMistakes: ['Uneven fold width', 'Stitching too far from fold edge'],
  videoRef: null,  // Future: short animation
}
```

Techniques referenced by assembly steps. Player can tap "?" during any step to see the technique card.

### D2. Contextual Hints

- First time encountering a technique: auto-show technique card before starting
- On poor score: show relevant tip from `commonMistakes`
- Progressive disclosure: beginners see all hints, advanced players can disable

### D3. Measurement & Inspection Tools

Inspired by pattern-projector's measurement tool:
- **Ruler tool**: click-drag to measure any distance on the workbench (shows inches/cm)
- **Seam gauge overlay**: semi-transparent guide at configurable width (1/4", 3/8", 1/2", 5/8")
- **Zoom/magnify**: pinch or button to zoom into detail areas (notches, dart points)
- **Grid overlay**: toggleable grid with real-unit markings

### D4. Skill Progression

Expand the existing `player.skillTree` stub:
```javascript
skills: {
  'straight-stitch': { level: 0, xp: 0 },
  'hemming': { level: 0, xp: 0 },
  'seam-joining': { level: 0, xp: 0 },
  'pinning': { level: 0, xp: 0 },
  'pressing': { level: 0, xp: 0 },
  'cutting': { level: 0, xp: 0 },
  'pattern-reading': { level: 0, xp: 0 },
}
```

- XP earned per mini-game based on score
- Level unlocks reduce hint frequency and unlock harder projects
- Technique mastery shown on player profile

---

## Track E: UI & Visual Polish

### E1. Workbench View

Replace the flat SVG canvas with a styled workbench:
- Wooden table texture background
- Cutting mat (green grid) as the primary work surface
- Tool tray (scissors, pins, iron, seam ripper) along one edge
- Piece tray showing available fabric pieces
- Sewing machine in corner (switches to machine view for sewing steps)

### E2. Fabric Appearance

- Each fabric type has a tileable texture (solid, printed, striped, plaid)
- Wrong side vs. right side visually distinct (lighter/muted vs. full pattern)
- Selvedge edges marked on bolt
- Cut edges shown as slightly rough/frayed until hemmed
- Pressed creases shown as subtle lines

### E3. Tool Animations

- Scissors: opening/closing animation along cut path
- Iron: steam puff particles when pressing
- Sewing machine: needle bobbing, thread appearing, fabric feeding
- Pins: subtle wobble when placed, removal animation

### E4. Responsive Layout

- Tablet-first (existing) with improved touch targets
- Sewing machine view: landscape orientation preferred
- Workbench view: flexible layout based on orientation
- Pattern import/viewing: support pinch-zoom for detail inspection

---

## Implementation Priority

### Phase 1: Foundation (do first)
1. **B1** — Verlet cloth sim engine (core dependency for everything)
2. **B2** — Cloth renderer (needed to see results)
3. **A4** — Enhanced pattern piece metadata (notches, fold lines, grainline vectors)
4. **C1** — Sewing machine mechanic (replaces boring trace)

### Phase 2: Interactivity
5. **B3** — Fabric interaction (fold, cut, pin)
6. **C2** — Multi-phase construction steps
7. **C3** — New mini-games (pin, press, fold, cut)
8. **C4** — Updated apron steps with phases

### Phase 3: Import & Standards
9. **A1** — SVG pattern import
10. **A3** — Standard unit system
11. **A2** — PDF pattern import (larger effort, depends on A3)

### Phase 4: Polish & Learning
12. **D1-D4** — Tutorial system, techniques, skill progression
13. **E1-E4** — Visual polish, workbench, animations
14. **B4** — Full fabric sim integration across all stages

---

## Technical Dependencies

| Library | Purpose | Size | Notes |
|---------|---------|------|-------|
| `polygon-clipping` | Boolean ops for fabric cutting | ~15kb | Martinez-Rueda algorithm |
| `earcut` | Triangulation for textured cloth rendering | ~7kb | Mapbox, fast & reliable |
| `pdf.js` | PDF pattern rendering (Track A2 only) | ~400kb | Mozilla, only if PDF import pursued |

All other features are implementable in vanilla JS + Canvas 2D with no additional deps.

---

## Open Questions

- Should the cloth sim run on a Web Worker for performance (separate thread)?
- How detailed should fabric cutting be? (Follow exact pattern line vs. simplified click-to-cut)
- Should we support pattern export (save modified patterns back to SVG)?
- Multiplayer/social features? (Share patterns, compare scores)
- Should fabric type affect gameplay difficulty? (Silk is harder to sew than cotton)
