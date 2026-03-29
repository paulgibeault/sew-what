/* ============================================================
   Thread & Template — Cloth Renderer
   B2: Canvas 2D rendering pipeline for cloth simulation

   Renders a ClothSim to a 2D canvas context using:
   - Quad triangulation (each grid cell → 2 triangles)
   - Affine texture mapping per triangle
   - Displacement-based shading (pseudo-normals → light/dark)
   - Fold crease rendering (dark lines where bend angle exceeds threshold)
   - Selvedge edge markings

   Usage:
     const renderer = new ClothRenderer(canvas, { textureSrc: 'img/cotton.png' });
     renderer.draw(clothSim);
   ============================================================ */

import { COLORS } from '../constants.js';

// --- Shading constants ---
const LIGHT_DIR = { x: -0.6, y: -0.8 }; // normalized, top-left light
const SHADE_STRENGTH = 0.35;              // 0 = no shading, 1 = full
const FOLD_ANGLE_THRESHOLD = 0.3;         // radians — creases above this angle
const FOLD_CREASE_ALPHA = 0.25;

// --- ClothRenderer ---

export class ClothRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} options
   * @param {string}  [options.textureSrc]    - URL of fabric texture image
   * @param {string}  [options.fabricColor]   - Fallback solid color (CSS string)
   * @param {boolean} [options.showGrid]      - Debug: show particle grid
   * @param {boolean} [options.showNormals]   - Debug: show per-particle normals
   * @param {boolean} [options.drawCreases]   - Draw fold crease lines (default true)
   * @param {boolean} [options.drawSelvedge]  - Draw selvedge edge on top/bottom rows
   */
  constructor(canvas, options = {}) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._texture = null;
    this._textureReady = false;
    this._fabricColor = options.fabricColor || COLORS.ACCENT_LIGHT;
    this._showGrid = options.showGrid || false;
    this._showNormals = options.showNormals || false;
    this._drawCreases = options.drawCreases !== false;
    this._drawSelvedge = options.drawSelvedge || false;

    if (options.textureSrc) {
      this._loadTexture(options.textureSrc);
    }
  }

  /**
   * Preload a texture image.
   * @param {string} src - URL of the image
   * @returns {Promise}
   */
  loadTexture(src) {
    return this._loadTexture(src);
  }

  /**
   * Set a solid fallback color for when no texture is loaded.
   * @param {string} cssColor
   */
  setFabricColor(cssColor) {
    this._fabricColor = cssColor;
  }

  /**
   * Render the cloth simulation to the canvas.
   * @param {import('./cloth-sim.js').ClothSim} sim
   */
  draw(sim) {
    const ctx = this._ctx;
    const cols = sim.cols;
    const rows = sim.rows;

    // Compute per-particle pseudo-normals for shading
    const normals = this._computeNormals(sim);

    // Draw quads (triangulated)
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const p00 = sim.getParticle(c,     r);
        const p10 = sim.getParticle(c + 1, r);
        const p01 = sim.getParticle(c,     r + 1);
        const p11 = sim.getParticle(c + 1, r + 1);

        if (!p00 || !p10 || !p01 || !p11) continue;

        // Compute shade for each vertex
        const shade00 = this._shadeAtParticle(normals, c,   r,   cols, rows);
        const shade10 = this._shadeAtParticle(normals, c+1, r,   cols, rows);
        const shade01 = this._shadeAtParticle(normals, c,   r+1, cols, rows);
        const shade11 = this._shadeAtParticle(normals, c+1, r+1, cols, rows);

        // Triangle 1: p00, p10, p01
        this._drawTriangle(
          ctx, sim,
          p00, p10, p01,
          c, r,         // texture UV (grid coords) for p00
          c+1, r,       // for p10
          c, r+1,       // for p01
          (shade00 + shade10 + shade01) / 3,
          cols, rows,
        );

        // Triangle 2: p10, p11, p01
        this._drawTriangle(
          ctx, sim,
          p10, p11, p01,
          c+1, r,
          c+1, r+1,
          c, r+1,
          (shade10 + shade11 + shade01) / 3,
          cols, rows,
        );
      }
    }

    // Draw fold creases
    if (this._drawCreases) {
      this._drawFoldCreases(ctx, sim, normals, cols, rows);
    }

    // Draw selvedge edges
    if (this._drawSelvedge) {
      this._drawSelvedgeEdges(ctx, sim, cols, rows);
    }

    // Debug overlays
    if (this._showGrid) {
      this._drawGrid(ctx, sim);
    }
    if (this._showNormals) {
      this._drawNormals(ctx, sim, normals, cols, rows);
    }
  }

  // --- Private ---

  _loadTexture(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this._texture = img;
        this._textureReady = true;
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Compute pseudo-normals for all particles based on neighbor positions.
   * Returns flat array of { x, y, z } indexed by [row * cols + col].
   */
  _computeNormals(sim) {
    const cols = sim.cols;
    const rows = sim.rows;
    const normals = new Array(cols * rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = sim.getParticle(c, r);
        const idx = r * cols + c;

        // Accumulate normal from neighbor cross products
        let nx = 0, ny = 0, nz = 0;
        let count = 0;

        // Left-right neighbors
        const left  = c > 0          ? sim.getParticle(c-1, r) : null;
        const right = c < cols-1     ? sim.getParticle(c+1, r) : null;
        const up    = r > 0          ? sim.getParticle(c, r-1) : null;
        const down  = r < rows-1     ? sim.getParticle(c, r+1) : null;

        if (left && right) {
          // Horizontal tangent
          const tx = right.x - left.x;
          const ty = right.y - left.y;
          if (up && down) {
            // Vertical tangent
            const bx = down.x - up.x;
            const by = down.y - up.y;
            // Cross product for 2.5D normal (z = 1 is "out of screen")
            // Normal ≈ horizontal × vertical
            nx += ty * 1 - 1 * by;
            ny += 1 * bx - tx * 1;
            nz += tx * by - ty * bx;
            count++;
          }
        }

        if (count === 0) {
          normals[idx] = { x: 0, y: 0, z: 1 };
        } else {
          const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
          normals[idx] = { x: nx/len, y: ny/len, z: nz/len };
        }
      }
    }

    return normals;
  }

  /**
   * Get shade factor [0, 1] for a particle based on its normal.
   * 1.0 = full brightness, < 1 = darker (in shadow)
   */
  _shadeAtParticle(normals, c, r, cols, rows) {
    const idx = r * cols + c;
    const n = normals[idx];
    if (!n) return 1.0;

    // dot product of normal with light direction (z-component matters for depth)
    const dot = -(n.x * LIGHT_DIR.x + n.y * LIGHT_DIR.y) + n.z * 0.5;
    const normalized = (dot + 1) / 2; // map -1..1 → 0..1
    return 1.0 - SHADE_STRENGTH + SHADE_STRENGTH * normalized;
  }

  /**
   * Draw a single triangle with texture/color + shade overlay.
   */
  _drawTriangle(ctx, sim, p0, p1, p2, u0, v0, u1, v1, u2, v2, shade, cols, rows) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();

    if (this._textureReady && this._texture) {
      // Affine texture mapping using canvas transform
      this._drawTexturedTriangle(ctx, p0, p1, p2, u0, v0, u1, v1, u2, v2, cols, rows);
    } else {
      ctx.fillStyle = this._fabricColor;
      ctx.fill();
    }

    // Apply shading overlay
    if (shade < 1.0) {
      const alpha = (1.0 - shade) * 0.6;
      ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Approximate affine texture mapping for a triangle.
   * Maps texture coordinates to screen coordinates using canvas transform.
   */
  _drawTexturedTriangle(ctx, p0, p1, p2, u0, v0, u1, v1, u2, v2, cols, rows) {
    const img = this._texture;
    const tw = img.naturalWidth;
    const th = img.naturalHeight;

    // Map grid coordinates to texture pixels (tiled)
    const tileU = tw / (cols - 1);
    const tileV = th / (rows - 1);

    const sx0 = u0 * tileU;
    const sy0 = v0 * tileV;
    const sx1 = u1 * tileU;
    const sy1 = v1 * tileV;
    const sx2 = u2 * tileU;
    const sy2 = v2 * tileV;

    // Build affine transform: texture space → screen space
    // Solve: [p0, p1, p2] in screen = M * [s0, s1, s2] in texture
    const denom = (sy1 - sy2) * (sx0 - sx2) + (sx2 - sx1) * (sy0 - sy2);
    if (Math.abs(denom) < 0.001) return;

    const a = ((p1.x - p2.x) * (sy0 - sy2) - (p0.x - p2.x) * (sy1 - sy2)) / denom;
    const b = ((p1.x - p2.x) * (sx2 - sx0) + (p0.x - p2.x) * (sx1 - sx2)) / denom; // fixed sign
    const c = p0.x - a * sx0 - b * sy0;
    const d = ((p1.y - p2.y) * (sy0 - sy2) - (p0.y - p2.y) * (sy1 - sy2)) / denom;
    const e = ((p1.y - p2.y) * (sx2 - sx0) + (p0.y - p2.y) * (sx1 - sx2)) / denom; // fixed sign
    const f = p0.y - d * sx0 - e * sy0;

    ctx.clip();
    ctx.transform(a, d, b, e, c, f);
    ctx.drawImage(img, 0, 0, tw, th);
  }

  /**
   * Draw fold crease lines where the bend angle is sharp.
   */
  _drawFoldCreases(ctx, sim, normals, cols, rows) {
    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${FOLD_CREASE_ALPHA})`;
    ctx.lineWidth = 1.5;

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const p = sim.getParticle(c, r);
        const right = sim.getParticle(c+1, r);
        const down = sim.getParticle(c, r+1);
        if (!p || !right || !down) continue;

        const nIdx = r * cols + c;
        const nRight = normals[nIdx + 1];
        const nDown = normals[nIdx + cols];
        const n = normals[nIdx];

        if (nRight) {
          const dot = n.x*nRight.x + n.y*nRight.y + n.z*nRight.z;
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (angle > FOLD_ANGLE_THRESHOLD) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(right.x, right.y);
            ctx.stroke();
          }
        }

        if (nDown) {
          const dot = n.x*nDown.x + n.y*nDown.y + n.z*nDown.z;
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (angle > FOLD_ANGLE_THRESHOLD) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(down.x, down.y);
            ctx.stroke();
          }
        }
      }
    }

    ctx.restore();
  }

  /**
   * Draw selvedge edge markings on the top and bottom rows.
   */
  _drawSelvedgeEdges(ctx, sim, cols, rows) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 60, 40, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    // Top edge
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const p = sim.getParticle(c, 0);
      if (!p) continue;
      c === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Bottom edge
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const p = sim.getParticle(c, rows - 1);
      if (!p) continue;
      c === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    ctx.restore();
  }

  /** Debug: draw particle grid */
  _drawGrid(ctx, sim) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.3)';
    ctx.lineWidth = 0.5;

    const cols = sim.cols;
    const rows = sim.rows;

    for (let r = 0; r < rows; r++) {
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const p = sim.getParticle(c, r);
        if (!p) continue;
        c === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    for (let c = 0; c < cols; c++) {
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        const p = sim.getParticle(c, r);
        if (!p) continue;
        r === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Draw pinned particles
    ctx.fillStyle = 'rgba(0, 200, 255, 0.8)';
    for (const p of sim.particles) {
      if (p.pinned) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /** Debug: draw per-particle normals */
  _drawNormals(ctx, sim, normals, cols, rows) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = sim.getParticle(c, r);
        const n = normals[r * cols + c];
        if (!p || !n) continue;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + n.x * 15, p.y + n.y * 15);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
