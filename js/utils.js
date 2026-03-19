/* ============================================================
   Thread & Template — Math & Geometry Utilities
   ============================================================ */

// --- Vector Math ---

export function vec2(x = 0, y = 0) {
  return { x, y };
}

export function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(v, s) {
  return { x: v.x * s, y: v.y * s };
}

export function vecLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecNormalize(v) {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vecDot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function vecCross(a, b) {
  return a.x * b.y - a.y * b.x;
}

export function vecDist(a, b) {
  return vecLength(vecSub(a, b));
}

export function vecLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** Normal perpendicular to the segment from a to b (left-hand side) */
export function vecNormal(a, b) {
  const d = vecNormalize(vecSub(b, a));
  return { x: -d.y, y: d.x };
}

/** Rotate a vector by angle (radians) */
export function vecRotate(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  };
}

// --- Geometry ---

/** Distance from point p to line segment ab */
export function pointToSegmentDist(p, a, b) {
  const ab = vecSub(b, a);
  const ap = vecSub(p, a);
  const t = Math.max(0, Math.min(1, vecDot(ap, ab) / vecDot(ab, ab)));
  const proj = vecAdd(a, vecScale(ab, t));
  return vecDist(p, proj);
}

/** Check if point is inside a polygon (array of {x,y}) */
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Check if point is within radius of target */
export function hitTest(point, target, radius) {
  return vecDist(point, target) <= radius;
}

/** Compute area of a polygon (signed — positive if CCW) */
export function polygonArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return area / 2;
}

/** Compute perimeter of a polygon */
export function polygonPerimeter(points) {
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perimeter += vecDist(points[i], points[j]);
  }
  return perimeter;
}

/** Offset a polygon by distance (positive = outward for CCW polygon) */
export function offsetPolygon(points, distance) {
  const n = points.length;
  if (n < 3) return [...points];

  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const n1 = vecNormal(prev, curr);
    const n2 = vecNormal(curr, next);

    // Average the normals for a miter-style offset
    const avg = vecNormalize(vecAdd(n1, n2));
    // Adjust length to maintain distance at corners
    const dot = vecDot(avg, n1);
    const scale = dot !== 0 ? distance / dot : distance;

    result.push(vecAdd(curr, vecScale(avg, scale)));
  }
  return result;
}

// --- Cubic Bezier ---

/** Evaluate cubic bezier at t */
export function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/** Sample a cubic bezier into N line segments */
export function sampleBezier(p0, p1, p2, p3, numSamples = 20) {
  const points = [];
  for (let i = 0; i <= numSamples; i++) {
    points.push(cubicBezier(p0, p1, p2, p3, i / numSamples));
  }
  return points;
}

/** Approximate arc length of a cubic bezier */
export function bezierLength(p0, p1, p2, p3, samples = 20) {
  const pts = sampleBezier(p0, p1, p2, p3, samples);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += vecDist(pts[i - 1], pts[i]);
  }
  return len;
}

// --- General Utilities ---

/** Clamp a value between min and max */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Map a value from one range to another */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

/** Degrees to radians */
export function degToRad(deg) {
  return deg * Math.PI / 180;
}

/** Radians to degrees */
export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

/** Snap a value to the nearest multiple of step */
export function snapTo(value, step) {
  return Math.round(value / step) * step;
}

/** Generate a simple unique ID */
let _idCounter = 0;
export function uid(prefix = 'id') {
  return `${prefix}_${++_idCounter}_${Date.now().toString(36)}`;
}

/** Deep clone a plain object (no functions, no circular refs) */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Debounce a function */
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
