# 🧵 Sew What — Thread & Template

> A high-fidelity garment design and assembly puzzle game. You're not just playing — you're engineering couture.

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
- **Real-Time 3D Silhouette Preview** — See how flat pattern changes affect final drape
- **Fabric Physics Engine** — Wool Tweed vs. Silk Chiffon behave completely differently
- **Sewing Queue** — Kanban-style project tracker (To-Sew → In-Progress → Finished)
- **Inspiration Boards** — Drag-and-drop mood board for fabric swatches and references
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
- No framework dependencies (yet)

## Status

🚧 **Early development** — game design document complete, implementation in progress.

## Design Document

See [`sew-what.md`](./sew-what.md) for the full Game Design Document.

---

*Built by Paul Gibeault — because sewing is basically engineering, and engineering deserves a game.*
