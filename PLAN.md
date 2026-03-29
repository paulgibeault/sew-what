# Plan: Fully Playable Apron (First Level)

## Context

The game has a solid Phase 1 (Drafting) but the remaining screens are stubs. The goal is to make the Apron (Beginner tier) playable end-to-end through all three stages: Draft → Material → Assembly → Scored Completion. The Inspiration Board remains a stub (optional flavor, not needed for gameplay).

---

## Phase 1: Queue Screen + Navigation

**Wire up project lifecycle and screen routing.**

- [x] **New file: `js/navigation.js`**
  - Export `navigateTo(screenId)` with stage guards
  - Guards: can't reach Material without validated pattern, can't reach Assembly without completed layout
  - Shows toast on blocked navigation

- [x] **Rewrite: `js/screens/queue-screen.js`**
  - "+ New Project" button → inline picker (just "Classic Apron" for now)
  - Creates project object, pushes to `queue.toSew`
  - Render cards in each kanban column from state
  - "Start" button on toSew cards → moves to inProgress, sets `activeProject`, navigates to Drafting
  - Resume: tapping inProgress cards navigates to current `activeProject.stage`
  - Finished cards show grade badge
  - Column counts update on state changes

- [x] **Modify: `js/main.js`**
  - Import and wire `navigateTo` for screen switching
  - State-driven screen transitions

- [x] **Modify: `js/ui.js`**
  - Add `.nav-tab.locked` visual state for tabs gated by stage progression

---

## Phase 2: Drafting → Material Gate

- [x] **Modify: `js/screens/drafting-screen.js`**
  - After validation succeeds, show "Proceed to Fabric →" button
  - On click: save pattern to `activeProject.pattern`, set stage to MATERIAL, navigate
  - Guard: if no activeProject, show toast "Start a project from the Queue first"

---

## Phase 3: Material Screen — Fabric Layout

**Largest new feature. Player drags pattern pieces onto a fabric bolt.**

- [x] **New file: `js/material/fabric-canvas.js`**
  - SVG-based fabric bolt (45" × 72", using existing PX_PER_INCH = 20)
  - Pan/zoom (reuse patterns from `svg-canvas.js`)
  - Render bolt as textured rect, placed pieces as SVG paths
  - Grainline indicators on each placed piece

- [x] **New file: `js/material/layout-validator.js`**
  - All pieces placed on bolt
  - No bounding-box overlaps
  - Grainlines aligned with bolt grain (rotation 0° or 180°)
  - Calculate yardage consumed and efficiency score

- [x] **Rewrite: `js/screens/material-screen.js`**
  - Layout: 70% bolt canvas + 30% piece tray sidebar
  - Piece tray: small SVG thumbnails of each pattern piece (uses `getOutlinePath()`)
  - Drag piece from tray → place on bolt
  - Tap placed piece → select; rotate button (90° increments)
  - Visual warnings: red outline for overlaps, yellow for grainline mismatch
  - "Validate Layout" button → runs checks → shows "Proceed to Assembly →" on success
  - Stores `activeProject.materialLayout` with positions and efficiency

- [x] **Modify: `css/ui-screens.css`**
  - Fabric bolt texture (CSS pattern)
  - Piece tray styles
  - Placed-piece highlight/selection states

---

## Phase 4: Assembly Screen — Sewing Mini-Games

**Player completes 6 simplified sewing steps to build the apron.**

- [x] **New file: `js/assembly/step-engine.js`**
  - Drives sequential steps, tracks completion and scores
  - Each step has: id, name, instruction, type, targetPieces, completed, score

- [x] **New file: `js/assembly/steps-apron.js`**
  - Defines 6 beginner-appropriate steps:
    1. Hem apron body edges (straight-seam)
    2. Attach bib to body (align + straight-seam)
    3. Hem bib edges (straight-seam)
    4. Fold and sew waistband (fold + attach)
    5. Fold and sew neck strap (fold + attach)
    6. Attach neck strap to bib (align + attach)

- [x] **New file: `js/assembly/mini-games.js`**
  - **Straight Seam:** Player drags along a guide line. Score = avg distance from target (0-1). Stitches render as dashes, color shifts green→yellow→red. Retry if score < 0.5.
  - **Align and Attach:** Drag piece to target zone, snap within 10px. Then auto-triggers straight-seam on the join edge.

- [x] **Rewrite: `js/screens/assembly-screen.js`**
  - Top: step name + instruction + progress bar (step N/6)
  - Center: SVG canvas showing pieces and active mini-game
  - Bottom: action button ("Start Sewing" / "Retry" / "Next Step")
  - After final step → completion flow (Phase 5)

- [x] **Modify: `css/ui-screens.css`**
  - Mini-game canvas styles, stitch path rendering, progress bar

---

## Phase 5: Scoring and Completion

- [x] **New file: `js/scoring.js`**
  - Three sub-scores (0.0–1.0):
    - **Accuracy** (drafting): 1.0 if validated (MVP)
    - **Efficiency** (material): fabric utilization ratio
    - **Craftsmanship** (assembly): avg of step scores
  - Final = Accuracy×0.3 + Efficiency×0.2 + Craftsmanship×0.5
  - Grade: ≥0.9=A, ≥0.7=B, ≥0.5=C, <0.5=F

- [x] **Modify: `js/screens/assembly-screen.js`**
  - Results overlay after last step: sub-score bars, final grade letter, "Return to Queue" button
  - Moves project from inProgress → finished in queue state
  - Updates `player.completedProjects`

- [x] **Modify: `js/screens/queue-screen.js`**
  - Finished cards show grade badge

---

## File Summary

| New Files | Purpose |
|-----------|---------|
| `js/navigation.js` | Screen routing with stage guards |
| `js/material/fabric-canvas.js` | SVG fabric bolt rendering |
| `js/material/layout-validator.js` | Layout validation + yardage calc |
| `js/assembly/step-engine.js` | Assembly step sequencer |
| `js/assembly/steps-apron.js` | Apron step definitions |
| `js/assembly/mini-games.js` | Straight-seam + align-attach mechanics |
| `js/scoring.js` | Grade calculation |

| Modified Files | Changes |
|----------------|---------|
| `js/screens/queue-screen.js` | Full implementation |
| `js/screens/material-screen.js` | Full implementation |
| `js/screens/assembly-screen.js` | Full implementation |
| `js/screens/drafting-screen.js` | Add "Proceed" button + activeProject integration |
| `js/main.js` | Wire navigateTo |
| `js/ui.js` | Tab locking visuals |
| `css/ui-screens.css` | Material + assembly styles |

---

## Verification

1. Start server with `./go.sh`
2. Open http://localhost:8764
3. **Queue:** Create apron project → card appears in "To Sew" → tap "Start"
4. **Drafting:** Pattern loads → manipulate anchors → validate → "Proceed to Fabric" appears → click it
5. **Material:** Pieces in tray → drag all onto bolt → rotate to align grainlines → validate → proceed
6. **Assembly:** Complete 6 steps by tracing seam lines → scores shown per step
7. **Completion:** Results overlay shows sub-scores + grade → "Return to Queue" → card in "Finished" with grade
8. **Guards:** Try clicking Material tab before drafting validates → blocked with toast
9. **Persistence:** Refresh browser mid-project → state restored, can resume
