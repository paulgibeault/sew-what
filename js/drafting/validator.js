/* ============================================================
   Thread & Template — Pattern Validator
   Validates geometry, seam allowances, and structural integrity
   ============================================================ */

import { VALIDATION, DRAFTING, SEGMENT } from '../constants.js';
import { vecDist } from '../utils.js';

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
