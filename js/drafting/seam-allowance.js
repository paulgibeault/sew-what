/* ============================================================
   Thread & Template — Seam Allowance Calculator
   Computes offset outlines for pattern pieces
   ============================================================ */

import { DRAFTING, SEGMENT } from '../constants.js';
import { vecSub, vecAdd, vecScale, vecNormalize, vecDist, sampleBezier } from '../utils.js';

const PPI = DRAFTING.PX_PER_INCH;

/**
 * Calculate the seam allowance offset path for a pattern piece.
 * Returns an array of { x, y } points forming the offset outline.
 *
 * @param {object} piece - Pattern piece with anchors and segments
 * @param {number} [overrideWidth] - Override seam allowance width in inches
 * @returns {Array<{x: number, y: number}>}
 */
export function calculateSeamAllowancePoints(piece, overrideWidth) {
  const sa = (overrideWidth || piece.seamAllowance || DRAFTING.DEFAULT_SEAM_ALLOW) * PPI;

  // Sample the piece outline into dense points
  const outline = _sampleOutline(piece);
  if (outline.length < 3) return [];

  // Compute offset polygon
  return _offsetOutline(outline, sa);
}

/**
 * Get an SVG path `d` string for the seam allowance.
 */
export function getSeamAllowanceSVGPath(piece, overrideWidth) {
  const points = calculateSeamAllowancePoints(piece, overrideWidth);
  if (points.length < 3) return '';

  const parts = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Calculate total fabric area including seam allowance (in square inches).
 */
export function calculatePieceArea(piece) {
  const points = calculateSeamAllowancePoints(piece);
  if (points.length < 3) return 0;

  // Shoelace formula
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area / 2) / (PPI * PPI);
}

// --- Internal ---

/**
 * Sample the piece outline (anchors + curve interpolation) into a
 * dense array of points for offset calculation.
 */
function _sampleOutline(piece) {
  const points = [];
  const { anchors, segments } = piece;

  for (const seg of segments) {
    const fromAnchor = anchors.find(a => a.id === seg.from);
    if (!fromAnchor) continue;

    // Add the start point
    points.push({ x: fromAnchor.x, y: fromAnchor.y });

    if (seg.type === SEGMENT.CURVE && seg.controlPoints && seg.controlPoints.length === 2) {
      const toAnchor = anchors.find(a => a.id === seg.to);
      if (!toAnchor) continue;

      // Sample the bezier curve (skip first and last — they're the anchors)
      const bezierPts = sampleBezier(fromAnchor, seg.controlPoints[0], seg.controlPoints[1], toAnchor, 16);
      for (let i = 1; i < bezierPts.length - 1; i++) {
        points.push(bezierPts[i]);
      }
    }
  }

  return points;
}

/**
 * Offset a closed polygon outline by distance.
 * Positive distance = outward (for CCW winding).
 */
function _offsetOutline(points, distance) {
  const n = points.length;
  const result = [];

  // Determine winding direction
  let signedArea = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    signedArea += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  // If CW (signedArea > 0 in screen coords where Y is down), negate distance
  const dir = signedArea > 0 ? -1 : 1;
  const d = distance * dir;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    // Edge normals
    const n1 = _normal(prev, curr);
    const n2 = _normal(curr, next);

    // Miter direction
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const mLen = Math.sqrt(mx * mx + my * my);

    if (mLen < 0.001) {
      // Parallel edges — use edge normal
      result.push({ x: curr.x + n1.x * d, y: curr.y + n1.y * d });
    } else {
      mx /= mLen;
      my /= mLen;

      const dot = mx * n1.x + my * n1.y;
      const scale = dot !== 0 ? d / dot : d;

      // Limit miter to prevent spikes at acute angles
      const maxMiter = d * 2;
      const clampedScale = Math.min(Math.abs(scale), maxMiter) * Math.sign(scale);

      result.push({
        x: curr.x + mx * clampedScale,
        y: curr.y + my * clampedScale,
      });
    }
  }

  return result;
}

function _normal(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}
