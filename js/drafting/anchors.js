/* ============================================================
   Thread & Template — Anchor Point System
   Types, constraints, and hit testing for pattern control points
   ============================================================ */

import { ANCHOR, DRAFTING } from '../constants.js';
import { hitTest, snapTo } from '../utils.js';

/**
 * Find the anchor at a given point (within touch hit radius).
 * @param {Array} anchors - Array of anchor objects
 * @param {number} x - Test x coordinate
 * @param {number} y - Test y coordinate
 * @param {number} [radius] - Hit test radius (default: ANCHOR_HIT_RADIUS)
 * @returns {object|null} The nearest anchor within radius, or null
 */
export function findAnchorAt(anchors, x, y, radius = DRAFTING.ANCHOR_HIT_RADIUS) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const anchor of anchors) {
    const dist = Math.sqrt((anchor.x - x) ** 2 + (anchor.y - y) ** 2);
    if (dist <= radius && dist < nearestDist) {
      nearest = anchor;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * Apply constraints to a proposed anchor position.
 * @param {object} anchor - The anchor being moved
 * @param {number} newX - Proposed X
 * @param {number} newY - Proposed Y
 * @param {object} options - { snapToGrid, gridSpacing }
 * @returns {{ x: number, y: number }} Constrained position
 */
export function constrainPosition(anchor, newX, newY, options = {}) {
  let x = newX;
  let y = newY;

  const c = anchor.constraints || {};

  // Axis locks
  if (c.lockX) x = anchor.x;
  if (c.lockY) y = anchor.y;

  // Bounds
  if (c.minX !== undefined) x = Math.max(x, c.minX);
  if (c.maxX !== undefined) x = Math.min(x, c.maxX);
  if (c.minY !== undefined) y = Math.max(y, c.minY);
  if (c.maxY !== undefined) y = Math.min(y, c.maxY);

  // Snap to grid
  if (options.snapToGrid) {
    const spacing = options.gridSpacing || DRAFTING.GRID_SPACING;
    x = snapTo(x, spacing);
    y = snapTo(y, spacing);
  }

  return { x, y };
}

/**
 * Get the visual properties for rendering an anchor.
 * @param {object} anchor
 * @param {boolean} isSelected
 * @param {boolean} isHovered
 * @returns {object} { radius, className }
 */
export function getAnchorVisuals(anchor, isSelected, isHovered) {
  let radius = DRAFTING.ANCHOR_RADIUS;
  let className = 'anchor-point';

  if (anchor.type === ANCHOR.CURVE_CONTROL) {
    radius = 3;
    className += ' curve-control';
  } else if (anchor.type === ANCHOR.NOTCH) {
    radius = 3;
    className += ' notch';
  }

  if (isSelected) {
    radius += 2;
    className += ' selected';
  }
  if (isHovered) {
    radius += 1;
    className += ' hovered';
  }

  return { radius, className };
}

/**
 * Get linked anchors that should move when the given anchor moves.
 * (e.g., symmetric shoulder points)
 * @param {object} anchor - The anchor being moved
 * @param {Array} allAnchors - All anchors in the piece
 * @returns {Array} Array of { anchorId, dx, dy } offsets to apply
 */
export function getLinkedAnchors(anchor, allAnchors) {
  const links = [];
  const c = anchor.constraints || {};

  if (c.symmetryPair) {
    const paired = allAnchors.find(a => a.id === c.symmetryPair);
    if (paired && c.symmetryAxis !== undefined) {
      links.push({
        anchorId: paired.id,
        mirror: true,
        axis: c.symmetryAxis,
      });
    }
  }

  return links;
}
