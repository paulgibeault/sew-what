/* ============================================================
   Thread & Template — Material Layout Validator
   Checks piece placement, overlaps, grainlines, yardage
   ============================================================ */

import { DRAFTING } from '../constants.js';
import { getPieceBounds } from '../drafting/pattern.js';

const PPI = DRAFTING.PX_PER_INCH;
const BOUNDS_TOLERANCE = 5;  // px tolerance for bolt edge checks
const OVERLAP_TOLERANCE = 4; // px tolerance for overlap checks

/**
 * Validate a fabric layout.
 * @param {object} layout - { boltWidth, boltLength, placedPieces }
 * @param {object} pattern - PatternData with pieces
 * @returns {{ valid: boolean, errors: string[], yardageUsed: number, efficiency: number }}
 */
export function validateLayout(layout, pattern) {
  const errors = [];
  const { boltWidth, boltLength, placedPieces } = layout;

  const boltW = boltWidth * PPI;
  const boltH = boltLength * PPI;

  // Check all pieces are placed
  const unplaced = placedPieces.filter(p => !p.placed);
  if (unplaced.length > 0) {
    errors.push(`${unplaced.length} piece(s) not yet placed on fabric`);
  }

  const placed = placedPieces.filter(p => p.placed);

  // Get rotated AABB for each placed piece
  const pieceBounds = placed.map(pp => {
    const piece = pattern.pieces.find(p => p.id === pp.pieceId);
    if (!piece) return null;
    return _getRotatedAABB(pp, piece);
  }).filter(Boolean);

  // Check within bolt bounds (with tolerance)
  for (const pb of pieceBounds) {
    if (pb.left < -BOUNDS_TOLERANCE || pb.top < -BOUNDS_TOLERANCE ||
        pb.right > boltW + BOUNDS_TOLERANCE || pb.bottom > boltH + BOUNDS_TOLERANCE) {
      errors.push(`"${pb.name}" extends beyond fabric bolt`);
    }
  }

  // Check overlaps (with tolerance)
  for (let i = 0; i < pieceBounds.length; i++) {
    for (let j = i + 1; j < pieceBounds.length; j++) {
      if (_boundsOverlap(pieceBounds[i], pieceBounds[j])) {
        errors.push(`"${pieceBounds[i].name}" overlaps with "${pieceBounds[j].name}"`);
      }
    }
  }

  // Check grainlines — 0° and 180° are on-grain, 90° and 270° are crossgrain (acceptable)
  // Only flag truly off-grain angles (45°, 135°, etc.)
  for (const pp of placed) {
    const piece = pattern.pieces.find(p => p.id === pp.pieceId);
    if (!piece) continue;
    const rot = ((pp.rotation % 360) + 360) % 360;
    const isAligned = rot === 0 || rot === 90 || rot === 180 || rot === 270;
    if (!isAligned) {
      errors.push(`"${piece.name}" is off-grain (rotate to 0°, 90°, 180°, or 270°)`);
    }
  }

  // Calculate yardage from the lowest point of any piece
  let maxY = 0;
  for (const pb of pieceBounds) {
    maxY = Math.max(maxY, pb.bottom);
  }
  const yardageUsed = maxY / PPI / 36;

  // Calculate efficiency
  let totalPieceArea = 0;
  for (const pb of pieceBounds) {
    totalPieceArea += pb.w * pb.h; // un-rotated area (rotation doesn't change area)
  }
  const usedBoltArea = boltW * Math.max(maxY, 1);
  const efficiency = usedBoltArea > 0 ? totalPieceArea / usedBoltArea : 0;

  return {
    valid: errors.length === 0,
    errors,
    yardageUsed: Math.round(yardageUsed * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
  };
}

/**
 * Compute the axis-aligned bounding box of a placed+rotated piece.
 * Uses the same coordinate model as the SVG rendering and hit-testing:
 *   center = (pp.x + w/2, pp.y + h/2)  where w,h are un-rotated dimensions
 *   corners are rotated around this center
 */
function _getRotatedAABB(placedPiece, patternPiece) {
  const bounds = getPieceBounds(patternPiece);
  const w = bounds.width;
  const h = bounds.height;
  const cx = placedPiece.x + w / 2;
  const cy = placedPiece.y + h / 2;
  const rot = (placedPiece.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const corners = [
    { x: -w/2, y: -h/2 }, { x: w/2, y: -h/2 },
    { x: w/2, y: h/2 },   { x: -w/2, y: h/2 },
  ].map(c => ({
    x: cx + c.x * cos - c.y * sin,
    y: cy + c.x * sin + c.y * cos,
  }));

  const left   = Math.min(...corners.map(c => c.x));
  const right  = Math.max(...corners.map(c => c.x));
  const top    = Math.min(...corners.map(c => c.y));
  const bottom = Math.max(...corners.map(c => c.y));

  return {
    left, right, top, bottom,
    w, h, // un-rotated dimensions for area calc
    name: patternPiece.name,
    pieceId: patternPiece.id,
  };
}

function _boundsOverlap(a, b) {
  return !(a.right - OVERLAP_TOLERANCE <= b.left ||
           b.right - OVERLAP_TOLERANCE <= a.left ||
           a.bottom - OVERLAP_TOLERANCE <= b.top ||
           b.bottom - OVERLAP_TOLERANCE <= a.top);
}
