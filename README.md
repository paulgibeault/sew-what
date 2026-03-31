# 🧵 Sew What — Thread & Template

> A high-fidelity garment design and assembly puzzle game. You're not just playing — you're engineering couture.

<p align="center">
  <a href="https://paulgibeault.github.io/sew-what/">
    <img src="https://img.shields.io/badge/Start_Sewing-Play_Now-E91E63?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTcgMTdMMTcgN00xNyA3SDdNMTcgN1YxNyIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+&logoColor=white" alt="Start Sewing" height="50">
  </a>
</p>

## What Is It?

**Thread & Template** is a systems-driven puzzle game where players take on the role of a Senior Material Architect, managing the full lifecycle of couture garment construction — from parametric pattern drafting to fabric physics to precision assembly challenges.

Think: the elegance of a fashion atelier meets the logic of an engineering simulation.

## Core Gameplay Loop

### Stage I — Parametric Design (Drafting)
Manipulate geometric primitives and measurement data to generate a technical pattern. The engine validates geometry and seam allowances before Stage II unlocks.

### Stage II — Material Architecture
Map validated patterns onto fabric grainlines, calculate yardage, and apply structural reinforcements (interfacings, stabilizers).

### Stage III — Construction Puzzles (Assembly)
Execute 3D spatial puzzles and precision mini-games to transform 2D panels into finished garments.

## Key Features

- **Drafting Canvas** — Precision workspace with Direct Point Manipulation (stylus-friendly)
- **Fabric Physics Engine** — Verlet cloth sim; Wool Tweed vs. Silk Chiffon behave completely differently
- **Sewing Machine Mechanic** — Feed fabric, control speed, maintain seam allowance
- **Sewing Queue** — Kanban-style project tracker (To-Sew → In-Progress → Finished)
- **Inspiration Board** — Freeform mood board for fabric swatches and notes (drag-to-position, persisted)
- **Enhanced Pattern Metadata** — Notches, fold lines, grainline vectors, fabric types
- **Rectangular Mode** — Flatten garment bodies into totes, aprons, and tool caddies

## Assembly Puzzles (Highlights)

| Puzzle | Challenge |
|--------|-----------|
| Bagging a Lining | Seal shell + lining right-sides-together; understitching mini-game; physics-based "turning" sequence |
| Bound Buttonhole | Multi-layer precision drafting; triangle-cut spatial logic; invisible ladder stitch |
| Invisible Zippers | Parallel stitch mini-game with dedicated placket |
| Rouleau Loops | Dexterity challenge using bias strips and cording |

## Progression

```
Beginner (Apron) → Intermediate (Lined Skirt) → Advanced (Lined Jacket) → Couture Master (Tailored Blazer)
```

Unlock advanced projects by mastering geometric manipulations. Couture upgrades (Horsehair Braid, Silk Organza underlining, bias stay tape) act as system modifiers that alter physics and durability.

## Aesthetic

**Clinical Couture** — architectural drafting meets high-end atelier. Visual feedback rewards technical accuracy: seam integrity, turn-of-cloth precision, edge quality.

Fail states include:
- 🧵 **Seam Peek** — seam not rolled to inside at breakpoint
- 🧨 **Structural Collapse** — triangle not secured in bound buttonhole
- 🪡 **Edge Degradation** — skipped temporary binding on raw edges

## Tech Stack

- JavaScript (ES Modules)
- CSS (tablet-first, stylus-optimized)
- No framework dependencies

## Status

✅ **MVP complete** — all five screens implemented, 144 tests passing.

| Screen | Status |
|--------|--------|
| Inspiration Board | ✅ Mood board with swatches + notes |
| Sewing Queue | ✅ Kanban (To-Sew / In-Progress / Finished) |
| Drafting | ✅ Pattern canvas with validation |
| Material | ✅ Fabric layout + yardage |
| Assembly | ✅ Sewing machine mechanic + step engine |

**Upcoming (Phase 2):** SVG/PDF pattern import, multi-phase construction steps, fabric interaction (fold, cut, pin).

## Design Document

See [`sew-what.md`](./sew-what.md) for the full Game Design Document and [`/.claude/plans/realistic-sewing-simulator.md`](./.claude/plans/realistic-sewing-simulator.md) for the Phase 2 roadmap.

---

*Built by Paul Gibeault — because sewing is basically engineering, and engineering deserves a game.*
