/* ============================================================
   Thread & Template — Pattern Validator
   Validates geometry, seam allowances, and structural integrity
   ============================================================ */

import { VALIDATION, DRAFTING, SEGMENT, NOTCH_TYPE } from '../constants.js';
import { vecDist, vecNormalize, vecSub } from '../utils.js';

/**
 * Validate an entire pattern.
 * @param {object} pattern - PatternData
 * @returns {{ valid: boolean, errors: Array<{ type, pieceId, message }> }}
 */
export function validatePattern(pattern) {
  const errors = [];

  for (const piece of pattern.pieces) {
    errors.push(..._validatePiece(piece));
  }

  // Check seam length matching between pieces that connect
  errors.push(..._validateSeamMatches(pattern));

  const valid = errors.length === 0;
  return { valid, errors };
}

/**
 * Validate a single pattern piece.
 */
function _validatePiece(piece) {
  const errors = [];

  // Check: piece must be closed (all segments form a loop)
  if (!_isPieceClosed(piece)) {
    errors.push({
      type: VALIDATION.PIECE_NOT_CLOSED,
      pieceId: piece.id,
      message: `"${piece.name}" is not a closed shape — check for gaps between points.`,
    });
  }

  // Check: minimum seam allowance
  if (piece.seamAllowance < DRAFTING.MIN_SEAM_ALLOW) {
    errors.push({
      type: VALIDATION.SEAM_ALLOW_TOO_SMALL,
      pieceId: piece.id,
      message: `"${piece.name}" seam allowance (${piece.seamAllowance}") is below minimum (${DRAFTING.MIN_SEAM_ALLOW}").`,
    });
  }

  // Check: grainline is specified
  if (piece.grainlineAngle === undefined || piece.grainlineAngle === null) {
    errors.push({
      type: VALIDATION.NO_GRAINLINE,
      pieceId: piece.id,
      message: `"${piece.name}" has no grainline specified.`,
    });
  }

  // Check: self-intersection (simplified check — no edges cross)
  if (_hasSelfIntersection(piece)) {
    errors.push({
      type: VALIDATION.SELF_INTERSECTION,
      pieceId: piece.id,
      message: `"${piece.name}" has edges that cross each other.`,
    });
  }

  // Check: piece has minimum area (not degenerate)
  if (_pieceArea(piece) < 1) {
    errors.push({
      type: VALIDATION.PIECE_NOT_CLOSED,
      pieceId: piece.id,
      message: `"${piece.name}" is too small or degenerate.`,
    });
  }

  // A4: Validate notch types
  errors.push(..._validateNotches(piece));

  // A4: Validate fold line is on straight grain (if present)
  errors.push(..._validateFoldLine(piece));

  // A4: Validate seam labels reference valid segments
  errors.push(..._validateSeamLabels(piece));

  return errors;
}

/**
 * Check if a piece forms a closed loop.
 */
function _isPieceClosed(piece) {
  const { anchors, segments } = piece;
  if (anchors.length < 3 || segments.length < 3) return false;

  // Build adjacency: each anchor should appear as both 'from' and 'to'
  const fromSet = new Set(segments.map(s => s.from));
  const toSet = new Set(segments.map(s => s.to));

  for (const anchor of anchors) {
    if (!fromSet.has(anchor.id) || !toSet.has(anchor.id)) {
      return false;
    }
  }

  // The last segment's 'to' should connect back to the first segment's 'from'
  const first = segments[0];
  const last = segments[segments.length - 1];
  return last.to === first.from;
}

/**
 * Check for self-intersecting edges (simplified: non-adjacent line segments).
 */
function _hasSelfIntersection(piece) {
  const edges = _getEdgesAsLines(piece);

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 2; j < edges.length; j++) {
      // Skip adjacent edges (they share a vertex)
      if (j === (i + edges.length - 1) % edges.length) continue;

      if (_segmentsIntersect(edges[i], edges[j])) {
        return true;
      }
    }
  }
  return false;
}

function _getEdgesAsLines(piece) {
  const edges = [];
  for (const seg of piece.segments) {
    const from = piece.anchors.find(a => a.id === seg.from);
    const to = piece.anchors.find(a => a.id === seg.to);
    if (from && to) {
      edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
  }
  return edges;
}

function _segmentsIntersect(a, b) {
  const d1 = _cross(a, b.x1, b.y1);
  const d2 = _cross(a, b.x2, b.y2);
  const d3 = _cross(b, a.x1, a.y1);
  const d4 = _cross(b, a.x2, a.y2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function _cross(seg, px, py) {
  return (seg.x2 - seg.x1) * (py - seg.y1) - (seg.y2 - seg.y1) * (px - seg.x1);
}

/**
 * Check seam length matching between pieces.
 * For now, just a structural check — detailed matching comes with assembly rules.
 */
function _validateSeamMatches(pattern) {
  // Will be expanded when we have seam connection metadata.
  // For Phase 1, we just validate individual pieces.
  return [];
}

// --- A4: Enhanced Metadata Validators ---

/**
 * Validate notch types and structure.
 */
function _validateNotches(piece) {
  const errors = [];
  const notches = piece.notches || [];
  const validTypes = Object.values(NOTCH_TYPE);

  for (const notch of notches) {
    if (!validTypes.includes(notch.type)) {
      errors.push({
        type: VALIDATION.INVALID_NOTCH_TYPE,
        pieceId: piece.id,
        message: `"${piece.name}" has a notch with invalid type "${notch.type}". Valid types: ${validTypes.join(', ')}.`,
      });
    }
  }

  return errors;
}

/**
 * Validate notch pairing across a complete pattern.
 * Each notch with a matchId must have a corresponding notch on another piece.
 */
export function validateNotchPairing(pattern) {
  const errors = [];

  // Build a map of all notch IDs → piece
  const notchMap = new Map();
  for (const piece of pattern.pieces) {
    for (const notch of (piece.notches || [])) {
      notchMap.set(notch.id, { piece, notch });
    }
  }

  // Check that each notch's matchId references an existing notch
  for (const piece of pattern.pieces) {
    for (const notch of (piece.notches || [])) {
      if (notch.matchId && !notchMap.has(notch.matchId)) {
        errors.push({
          type: VALIDATION.NOTCH_UNPAIRED,
          pieceId: piece.id,
          message: `"${piece.name}" has a notch referencing missing matchId "${notch.matchId}".`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate seam length matching between connected pieces.
 * Checks that pieces with shared seam labels have matching edge lengths.
 * Tolerance: 1/8" (DRAFTING.PX_PER_INCH / 8)
 */
export function validateSeamLengths(pattern) {
  const errors = [];
  const TOLERANCE = DRAFTING.PX_PER_INCH / 8; // 1/8 inch in pixels

  // Build seam label → piece + segment mapping
  const seamMap = new Map();
  for (const piece of pattern.pieces) {
    for (const label of (piece.seamLabels || [])) {
      const key = label.label;
      if (!seamMap.has(key)) seamMap.set(key, []);
      seamMap.get(key).push({ piece, segmentId: label.segmentId });
    }
  }

  // For each label that appears on exactly 2 pieces, check length match
  for (const [label, entries] of seamMap.entries()) {
    if (entries.length !== 2) continue;

    const [a, b] = entries;
    const lenA = _getSegmentLength(a.piece, a.segmentId);
    const lenB = _getSegmentLength(b.piece, b.segmentId);

    if (lenA !== null && lenB !== null && Math.abs(lenA - lenB) > TOLERANCE) {
      errors.push({
        type: VALIDATION.SEAM_LENGTH_MISMATCH,
        pieceId: a.piece.id,
        message: `Seam "${label}" length mismatch: "${a.piece.name}" (${lenA.toFixed(1)}px) vs "${b.piece.name}" (${lenB.toFixed(1)}px). Tolerance: ${TOLERANCE.toFixed(1)}px.`,
      });
    }
  }

  return errors;
}

/**
 * Validate that fold lines are on straight grain (horizontal or vertical).
 * Tolerance: 5 degrees from true H/V.
 */
function _validateFoldLine(piece) {
  const errors = [];
  if (!piece.foldLine) return errors;

  const { x1, y1, x2, y2 } = piece.foldLine;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return errors; // degenerate fold line, skip

  const angle = Math.abs(Math.atan2(dy, dx)) * 180 / Math.PI;

  // Check if near horizontal (0°) or vertical (90°)
  const TOLERANCE_DEG = 5;
  const nearHorizontal = angle <= TOLERANCE_DEG || angle >= (180 - TOLERANCE_DEG);
  const nearVertical = Math.abs(angle - 90) <= TOLERANCE_DEG;

  if (!nearHorizontal && !nearVertical) {
    errors.push({
      type: VALIDATION.FOLD_NOT_ON_GRAIN,
      pieceId: piece.id,
      message: `"${piece.name}" fold line is at ${angle.toFixed(1)}° — fold lines should be on straight grain (horizontal or vertical, ±5°).`,
    });
  }

  return errors;
}

/**
 * Validate that seam labels reference actual segments.
 */
function _validateSeamLabels(piece) {
  const errors = [];
  const segIds = new Set((piece.segments || []).map(s => s.id));

  for (const label of (piece.seamLabels || [])) {
    if (label.segmentId && !segIds.has(label.segmentId)) {
      errors.push({
        type: VALIDATION.SEAM_LABEL_ORPHAN,
        pieceId: piece.id,
        message: `"${piece.name}" has seam label "${label.label}" referencing missing segment "${label.segmentId}".`,
      });
    }
  }

  return errors;
}

/**
 * Compute the length of a segment by its ID.
 */
function _getSegmentLength(piece, segmentId) {
  const seg = piece.segments.find(s => s.id === segmentId);
  if (!seg) return null;

  const from = piece.anchors.find(a => a.id === seg.from);
  const to = piece.anchors.find(a => a.id === seg.to);
  if (!from || !to) return null;

  return vecDist(from, to);
}

/**
 * Compute signed area of a piece (using anchors as polygon).
 */
function _pieceArea(piece) {
  const pts = piece.anchors;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(area / 2);
}
