/* ============================================================
   Thread & Template — Material Layout Validator
   Checks piece placement, overlaps, grainlines, yardage
   ============================================================ */

import { DRAFTING } from '../constants.js';

const PPI = DRAFTING.PX_PER_INCH;

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

  // Get bounds for each placed piece
  const pieceBounds = placed.map(pp => {
    const piece = pattern.pieces.find(p => p.id === pp.pieceId);
    if (!piece) return null;
    return _getPlacedBounds(pp, piece);
  }).filter(Boolean);

  // Check within bolt bounds
  for (const pb of pieceBounds) {
    if (pb.x < 0 || pb.y < 0 || pb.x + pb.width > boltW || pb.y + pb.height > boltH) {
      errors.push(`"${pb.name}" extends beyond fabric bolt`);
    }
  }

  // Check overlaps (bounding box)
  for (let i = 0; i < pieceBounds.length; i++) {
    for (let j = i + 1; j < pieceBounds.length; j++) {
      if (_boundsOverlap(pieceBounds[i], pieceBounds[j])) {
        errors.push(`"${pieceBounds[i].name}" overlaps with "${pieceBounds[j].name}"`);
      }
    }
  }

  // Check grainlines
  for (const pp of placed) {
    const piece = pattern.pieces.find(p => p.id === pp.pieceId);
    if (!piece) continue;
    const rot = ((pp.rotation % 360) + 360) % 360;
    // On-grain: piece grainline (0°) + rotation should result in vertical grain
    // Valid rotations are 0° and 180° for pieces with 0° grainline
    if (rot !== 0 && rot !== 180) {
      errors.push(`"${piece.name}" is off-grain (rotate to 0° or 180°)`);
    }
  }

  // Calculate yardage
  let maxY = 0;
  for (const pb of pieceBounds) {
    maxY = Math.max(maxY, pb.y + pb.height);
  }
  const yardageUsed = maxY / PPI / 36; // convert px -> inches -> yards

  // Calculate efficiency
  let totalPieceArea = 0;
  for (const pb of pieceBounds) {
    totalPieceArea += pb.width * pb.height;
  }
  const usedBoltArea = boltW * maxY;
  const efficiency = usedBoltArea > 0 ? totalPieceArea / usedBoltArea : 0;

  return {
    valid: errors.length === 0,
    errors,
    yardageUsed: Math.round(yardageUsed * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
  };
}

function _getPlacedBounds(placedPiece, patternPiece) {
  // Get piece bounding box in its local space
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const a of patternPiece.anchors) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  const localW = maxX - minX;
  const localH = maxY - minY;

  const rot = ((placedPiece.rotation % 360) + 360) % 360;
  const isRotated90 = rot === 90 || rot === 270;
  const w = isRotated90 ? localH : localW;
  const h = isRotated90 ? localW : localH;

  return {
    x: placedPiece.x,
    y: placedPiece.y,
    width: w,
    height: h,
    name: patternPiece.name,
    pieceId: patternPiece.id,
  };
}

function _boundsOverlap(a, b) {
  const pad = 2; // small tolerance
  return !(a.x + a.width - pad <= b.x ||
           b.x + b.width - pad <= a.x ||
           a.y + a.height - pad <= b.y ||
           b.y + b.height - pad <= a.y);
}
