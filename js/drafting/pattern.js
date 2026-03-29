/* ============================================================
   Thread & Template — Pattern Data Model
   Core data structure flowing through all three stages
   ============================================================ */

import { ANCHOR, SEGMENT, DRAFTING, NOTCH_TYPE, FABRIC_TYPE } from '../constants.js';
import { uid, vecDist, vecSub, vecNormalize, vecAdd, vecScale } from '../utils.js';

const PPI = DRAFTING.PX_PER_INCH;

/**
 * Create a pattern from a project template and measurement set.
 * @param {object} template - Project template from measurements-rtw.json
 * @param {object} measurements - Measurement values { bust, waist, hip, ... }
 * @returns {object} PatternData
 */
export function createPattern(template, measurements) {
  const pieces = template.pieces.map(pieceDef => _createPiece(pieceDef, measurements));

  return {
    id: uid('pat'),
    name: template.name,
    type: template.pieces.every(p => p.type === 'rectangular') ? 'rectangular' : 'garment',
    measurements: { ...measurements },
    pieces,
    validated: false,
    validationErrors: [],
  };
}

/**
 * Move an anchor point within a pattern, respecting constraints.
 * Returns a new pattern with the anchor moved.
 */
export function moveAnchor(pattern, pieceId, anchorId, newX, newY) {
  const pieces = pattern.pieces.map(piece => {
    if (piece.id !== pieceId) return piece;

    const anchors = piece.anchors.map(a => {
      if (a.id !== anchorId) return a;
      return _constrainAnchor(a, newX, newY, piece);
    });

    const segments = _recalcSegments(anchors, piece.segments);

    return { ...piece, anchors, segments };
  });

  return { ...pattern, pieces, validated: false, validationErrors: [] };
}

/**
 * Get an SVG path `d` attribute string for a pattern piece outline.
 */
export function getOutlinePath(piece) {
  if (piece.anchors.length < 2) return '';

  const parts = [];
  const firstAnchor = piece.anchors[0];
  parts.push(`M ${firstAnchor.x} ${firstAnchor.y}`);

  for (const seg of piece.segments) {
    const to = piece.anchors.find(a => a.id === seg.to);
    if (!to) continue;

    if (seg.type === SEGMENT.CURVE && seg.controlPoints && seg.controlPoints.length === 2) {
      const [cp1, cp2] = seg.controlPoints;
      parts.push(`C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`);
    } else {
      parts.push(`L ${to.x} ${to.y}`);
    }
  }

  parts.push('Z');
  return parts.join(' ');
}

/**
 * Get an SVG path for the seam allowance outline (offset path).
 */
export function getSeamAllowancePath(piece) {
  const sa = piece.seamAllowance * PPI;
  const points = piece.anchors.map(a => ({ x: a.x, y: a.y }));

  if (points.length < 3) return '';

  const offset = _offsetPolygonPoints(points, sa);

  const parts = [`M ${offset[0].x} ${offset[0].y}`];
  for (let i = 1; i < offset.length; i++) {
    parts.push(`L ${offset[i].x} ${offset[i].y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Get the grainline as an SVG line definition { x1, y1, x2, y2, angle }.
 * Prefers piece.grainline (A4 vector) over legacy piece.grainlineAngle.
 */
export function getGrainline(piece) {
  if (piece.anchors.length < 2) return null;

  // A4: Use explicit grainline vector if present
  if (piece.grainline) {
    const { x1, y1, x2, y2 } = piece.grainline;
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return { x1, y1, x2, y2, angle };
  }

  // Legacy: derive from grainlineAngle (degrees)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const a of piece.anchors) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const height = maxY - minY;
  const lineLen = height * 0.6;

  const angle = (piece.grainlineAngle || 0) * Math.PI / 180;
  const dx = Math.sin(angle) * lineLen / 2;
  const dy = -Math.cos(angle) * lineLen / 2;

  return {
    x1: cx - dx, y1: cy - dy,
    x2: cx + dx, y2: cy + dy,
    angle: piece.grainlineAngle || 0,
  };
}

/**
 * Get the fold line for a piece, or null if none.
 * @returns {{ x1, y1, x2, y2 } | null}
 */
export function getFoldLine(piece) {
  return piece.foldLine || null;
}

/**
 * Get all notches for a piece.
 * @returns {Array<{ x, y, type, matchId }>}
 */
export function getNotches(piece) {
  return piece.notches || [];
}

/**
 * Add a notch to a piece at the given position.
 * @param {object} piece - Pattern piece
 * @param {number} x
 * @param {number} y
 * @param {string} type - NOTCH_TYPE value
 * @param {string|null} matchId - ID of matching notch on another piece
 * @returns {object} Updated piece
 */
export function addNotch(piece, x, y, type = NOTCH_TYPE.SINGLE, matchId = null) {
  const notch = { id: uid('notch'), x, y, type, matchId };
  return { ...piece, notches: [...(piece.notches || []), notch] };
}

/**
 * Set the fold line for a piece (cut-on-fold edge).
 * @param {object} piece
 * @param {{ x1, y1, x2, y2 }|null} foldLine
 * @returns {object} Updated piece
 */
export function setFoldLine(piece, foldLine) {
  return { ...piece, foldLine };
}

/**
 * Set the grainline vector for a piece.
 * @param {object} piece
 * @param {{ x1, y1, x2, y2 }} grainline
 * @returns {object} Updated piece
 */
export function setGrainlineVector(piece, grainline) {
  const angle = Math.atan2(grainline.y2 - grainline.y1, grainline.x2 - grainline.x1) * 180 / Math.PI;
  return { ...piece, grainline, grainlineAngle: angle };
}

/**
 * Get bounding box of a piece.
 */
export function getPieceBounds(piece) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const a of piece.anchors) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// --- Internal ---

function _createPiece(def, measurements) {
  const id = def.id;
  const sa = def.seamAllowance || DRAFTING.DEFAULT_SEAM_ALLOW;

  // Evaluate dimension formulas
  const w = _evalFormula(def.widthFormula, measurements) * PPI;
  const h = _evalFormula(def.heightFormula, measurements) * PPI;

  let anchors, segments;

  if (def.type === 'rectangular') {
    anchors = _createRectAnchors(id, w, h);
    segments = _createRectSegments(anchors);
  } else {
    anchors = _createShapedAnchors(id, def, w, h, measurements);
    segments = _createShapedSegments(anchors);
  }

  return {
    id,
    name: def.name,
    type: def.type,
    anchors,
    segments,
    seamAllowance: sa,
    grainlineAngle: def.grainlineAngle || 0,

    // A4: Enhanced pattern piece metadata
    // Full grainline vector (derived from grainlineAngle if not specified explicitly)
    grainline: def.grainline || null,

    // Fold line — { x1, y1, x2, y2 } or null
    // A null fold line means no cut-on-fold edge
    foldLine: def.foldLine || null,

    // Whether to cut a mirror copy of this piece
    mirrorPiece: def.mirrorPiece || false,

    // How many times to cut this piece from fabric
    cutCount: def.cutCount || 2,

    // Notches: [{ x, y, type: 'single'|'double'|'triangle', matchId }]
    notches: def.notches || [],

    // Drill holes for dart points, button placement: [{ x, y, label }]
    drillHoles: def.drillHoles || [],

    // Seam labels: [{ segmentId, label }]
    seamLabels: def.seamLabels || [],

    // Which fabric layer this piece is cut from
    fabric: def.fabric || FABRIC_TYPE.SELF,
  };
}

function _createRectAnchors(pieceId, w, h) {
  // Start from top-left, clockwise
  return [
    { id: `${pieceId}_tl`, x: 0, y: 0, type: ANCHOR.CORNER, constraints: { lockX: false, lockY: false } },
    { id: `${pieceId}_tr`, x: w, y: 0, type: ANCHOR.CORNER, constraints: { lockX: false, lockY: false } },
    { id: `${pieceId}_br`, x: w, y: h, type: ANCHOR.CORNER, constraints: { lockX: false, lockY: false } },
    { id: `${pieceId}_bl`, x: 0, y: h, type: ANCHOR.CORNER, constraints: { lockX: false, lockY: false } },
  ];
}

function _createRectSegments(anchors) {
  const segs = [];
  for (let i = 0; i < anchors.length; i++) {
    const next = (i + 1) % anchors.length;
    segs.push({
      id: uid('seg'),
      from: anchors[i].id,
      to: anchors[next].id,
      type: SEGMENT.LINE,
      controlPoints: [],
    });
  }
  return segs;
}

function _createShapedAnchors(pieceId, def, w, h, measurements) {
  // For shaped pieces like a bib: trapezoid narrowing at top
  const topInset = w * 0.15; // Narrow the top by 15% on each side

  return [
    { id: `${pieceId}_tl`, x: topInset, y: 0, type: ANCHOR.CORNER, constraints: {} },
    { id: `${pieceId}_tr`, x: w - topInset, y: 0, type: ANCHOR.CORNER, constraints: {} },
    { id: `${pieceId}_br`, x: w, y: h, type: ANCHOR.CORNER, constraints: {} },
    { id: `${pieceId}_bl`, x: 0, y: h, type: ANCHOR.CORNER, constraints: {} },
  ];
}

function _createShapedSegments(anchors) {
  // Same as rect for now — curves added when the user manipulates
  return _createRectSegments(anchors);
}

function _constrainAnchor(anchor, newX, newY, piece) {
  let x = newX;
  let y = newY;

  if (anchor.constraints) {
    if (anchor.constraints.lockX) x = anchor.x;
    if (anchor.constraints.lockY) y = anchor.y;
    if (anchor.constraints.minX !== undefined) x = Math.max(x, anchor.constraints.minX);
    if (anchor.constraints.maxX !== undefined) x = Math.min(x, anchor.constraints.maxX);
    if (anchor.constraints.minY !== undefined) y = Math.max(y, anchor.constraints.minY);
    if (anchor.constraints.maxY !== undefined) y = Math.min(y, anchor.constraints.maxY);
  }

  return { ...anchor, x, y };
}

function _recalcSegments(anchors, existingSegments) {
  // Rebuild segment endpoints but preserve type and control points
  return existingSegments.map(seg => {
    if (seg.type === SEGMENT.CURVE && seg.controlPoints && seg.controlPoints.length > 0) {
      // Keep curve control points (could be smarter with proportional adjustment later)
      return { ...seg };
    }
    return { ...seg };
  });
}

function _evalFormula(formula, measurements) {
  if (typeof formula === 'number') return formula;
  if (!formula) return 0;

  // Simple formula evaluator: "waist + 8", "bust / 4 + 2"
  let expr = formula;
  for (const [key, val] of Object.entries(measurements)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
  }

  try {
    // Safe eval for simple arithmetic
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    console.warn(`Failed to evaluate formula: ${formula}`);
    return 0;
  }
}

function _offsetPolygonPoints(points, distance) {
  const n = points.length;
  if (n < 3) return [...points];

  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    // Edge normals (outward)
    const n1 = _edgeNormal(prev, curr);
    const n2 = _edgeNormal(curr, next);

    // Average and scale
    let avg = { x: n1.x + n2.x, y: n1.y + n2.y };
    const len = Math.sqrt(avg.x * avg.x + avg.y * avg.y);
    if (len > 0) {
      avg = { x: avg.x / len, y: avg.y / len };
    }

    const dot = avg.x * n1.x + avg.y * n1.y;
    const scale = dot !== 0 ? distance / dot : distance;

    result.push({
      x: curr.x + avg.x * scale,
      y: curr.y + avg.y * scale,
    });
  }
  return result;
}

function _edgeNormal(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}
