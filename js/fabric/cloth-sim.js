/* ============================================================
   Thread & Template — Verlet Cloth Simulation Engine
   B1: Physics simulation for fabric pieces

   Algorithm: Position-based Verlet integration
   - Particles store current + previous position (velocity is implicit)
   - Structural, shear, and bend constraints between particles
   - Constraint solver iterates to satisfy all constraints

   Usage:
     const cloth = new ClothSim({ width: 200, height: 300, spacing: 8 });
     cloth.setMaterial('cotton');
     cloth.pin(0, 0); // pin top-left corner
     cloth.update(deltaTime);
   ============================================================ */

import { clamp } from '../utils.js';

// --- Material Presets ---

export const FABRIC_PRESETS = Object.freeze({
  cotton: {
    stiffness:    5,      // constraint solver iterations
    weight:       1.0,    // gravity multiplier
    damping:      0.98,   // velocity retention per frame
    bendResist:   0.5,    // bend spring constant
    shearResist:  0.5,    // shear spring constant
    stretchLimit: 1.05,   // max stretch before hard clamp
  },
  denim: {
    stiffness:    8,
    weight:       1.8,
    damping:      0.96,
    bendResist:   0.85,
    shearResist:  0.80,
    stretchLimit: 1.02,
  },
  silk: {
    stiffness:    2,
    weight:       0.4,
    damping:      0.99,
    bendResist:   0.1,
    shearResist:  0.15,
    stretchLimit: 1.08,
  },
  knit: {
    stiffness:    2,
    weight:       0.9,
    damping:      0.97,
    bendResist:   0.08,
    shearResist:  0.12,
    stretchLimit: 1.20,  // knits stretch more
  },
  canvas: {
    stiffness:    8,
    weight:       2.0,
    damping:      0.95,
    bendResist:   0.90,
    shearResist:  0.85,
    stretchLimit: 1.01,
  },
  chiffon: {
    stiffness:    1,
    weight:       0.15,
    damping:      0.995,
    bendResist:   0.02,
    shearResist:  0.05,
    stretchLimit: 1.12,
  },
});

// --- Gravity ---
const GRAVITY = 980; // px/s² (scaled to game units)

// --- ClothParticle ---

class ClothParticle {
  constructor(x, y, mass = 1.0) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.mass = mass;
    this.pinned = false;
    // Accumulated forces (applied each frame, then cleared)
    this._forceX = 0;
    this._forceY = 0;
  }

  /** Apply an impulse force vector to this particle */
  applyForce(fx, fy) {
    if (this.pinned) return;
    this._forceX += fx;
    this._forceY += fy;
  }

  /** Integrate position using Verlet: x_new = 2x - x_prev + a*dt² */
  integrate(dt, gravity, damping) {
    if (this.pinned) return;

    const dt2 = dt * dt;
    const vx = (this.x - this.prevX) * damping;
    const vy = (this.y - this.prevY) * damping;

    const ax = (this._forceX / this.mass);
    const ay = (this._forceY / this.mass) + gravity * this.mass;

    const nextX = this.x + vx + ax * dt2;
    const nextY = this.y + vy + ay * dt2;

    this.prevX = this.x;
    this.prevY = this.y;
    this.x = nextX;
    this.y = nextY;

    this._forceX = 0;
    this._forceY = 0;
  }
}

// --- ClothConstraint ---

class ClothConstraint {
  constructor(p1, p2, restLength, stiffness = 1.0) {
    this.p1 = p1;
    this.p2 = p2;
    this.restLength = restLength;
    this.stiffness = stiffness; // 0-1, how strongly to satisfy
    this.active = true;
  }

  /** Satisfy constraint: push particles toward rest length */
  satisfy(stretchLimit = 1.1) {
    if (!this.active) return;

    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return;

    // Hard clamp at stretch limit to prevent fabric explosion
    const maxLen = this.restLength * stretchLimit;
    const effectiveDist = Math.min(dist, maxLen);

    const diff = (effectiveDist - this.restLength) / effectiveDist * this.stiffness;
    const offsetX = dx * diff * 0.5;
    const offsetY = dy * diff * 0.5;

    if (!this.p1.pinned) {
      this.p1.x += offsetX;
      this.p1.y += offsetY;
    }
    if (!this.p2.pinned) {
      this.p2.x -= offsetX;
      this.p2.y -= offsetY;
    }
  }
}

// --- ClothSim ---

export class ClothSim {
  /**
   * Create a cloth simulation.
   * @param {object} options
   * @param {number} options.width  - Cloth width in pixels
   * @param {number} options.height - Cloth height in pixels
   * @param {number} options.spacing - Particle spacing in pixels (default 8)
   * @param {string} options.material - Material preset name (default 'cotton')
   * @param {number} options.originX - World-space origin X (default 0)
   * @param {number} options.originY - World-space origin Y (default 0)
   */
  constructor(options = {}) {
    const {
      width = 160,
      height = 200,
      spacing = 8,
      material = 'cotton',
      originX = 0,
      originY = 0,
    } = options;

    this._spacing = spacing;
    this._colCount = Math.max(2, Math.floor(width / spacing) + 1);
    this._rowCount = Math.max(2, Math.floor(height / spacing) + 1);
    this._originX = originX;
    this._originY = originY;
    this._material = null;
    this._preset = null;

    /** @type {ClothParticle[]} flat array: row-major [row * colCount + col] */
    this.particles = [];
    /** @type {ClothConstraint[]} */
    this.constraints = [];

    this._buildMesh();
    this.setMaterial(material);
  }

  // --- Public API ---

  /**
   * Set the fabric material (affects physics properties).
   * @param {string} name - Material name from FABRIC_PRESETS
   */
  setMaterial(name) {
    const preset = FABRIC_PRESETS[name] || FABRIC_PRESETS.cotton;
    this._material = name;
    this._preset = { ...preset };
    // Update constraint stiffness for shear/bend constraints
    this._updateConstraintStiffness();
  }

  /**
   * Get the current material name.
   */
  get material() { return this._material; }

  /**
   * Get grid dimensions.
   */
  get cols() { return this._colCount; }
  get rows() { return this._rowCount; }

  /**
   * Get particle at grid position (col, row).
   */
  getParticle(col, row) {
    if (col < 0 || col >= this._colCount || row < 0 || row >= this._rowCount) return null;
    return this.particles[row * this._colCount + col];
  }

  /**
   * Pin a particle at grid position (col, row) — it won't move.
   */
  pin(col, row) {
    const p = this.getParticle(col, row);
    if (p) p.pinned = true;
  }

  /**
   * Unpin a particle at grid position (col, row).
   */
  unpin(col, row) {
    const p = this.getParticle(col, row);
    if (p) p.pinned = false;
  }

  /**
   * Pin all particles along the top row.
   */
  pinTop() {
    for (let c = 0; c < this._colCount; c++) {
      this.pin(c, 0);
    }
  }

  /**
   * Move a particle (e.g., from drag interaction).
   * @param {ClothParticle} particle
   * @param {number} x - New world X
   * @param {number} y - New world Y
   */
  moveParticle(particle, x, y) {
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.x = x;
    particle.y = y;
  }

  /**
   * Apply a force to all particles within a radius of a world point.
   * @param {number} wx - World X
   * @param {number} wy - World Y
   * @param {number} radius - Influence radius in pixels
   * @param {number} fx - Force X
   * @param {number} fy - Force Y
   */
  applyForceAt(wx, wy, radius, fx, fy) {
    for (const p of this.particles) {
      const dx = p.x - wx;
      const dy = p.y - wy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= radius * radius) {
        const falloff = 1 - Math.sqrt(dist2) / radius;
        p.applyForce(fx * falloff, fy * falloff);
      }
    }
  }

  /**
   * Find the nearest particle to a world point.
   * @returns {ClothParticle|null}
   */
  nearestParticle(wx, wy, maxDist = Infinity) {
    let best = null;
    let bestDist2 = maxDist * maxDist;
    for (const p of this.particles) {
      const dx = p.x - wx;
      const dy = p.y - wy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestDist2) {
        bestDist2 = dist2;
        best = p;
      }
    }
    return best;
  }

  /**
   * Advance the simulation by deltaTime seconds.
   * @param {number} dt - Delta time in seconds (typically 1/60)
   */
  update(dt) {
    if (!this._preset) return;

    const { weight, damping, stiffness, stretchLimit } = this._preset;
    const gravity = GRAVITY * weight;
    const iters = Math.max(1, stiffness);

    // Substep to prevent Verlet instability on large dt (GC pauses, thermal
    // throttling, tab resumes). Cap per-substep dt at 33ms (1/30s) and allow
    // up to 4 substeps — handling up to a ~133ms frame gap safely.
    const MAX_DT = 1 / 30;
    const MAX_SUBSTEPS = 4;
    const totalDt = Math.min(dt, MAX_DT * MAX_SUBSTEPS);
    const steps = Math.ceil(totalDt / MAX_DT);
    const stepDt = totalDt / steps;

    for (let s = 0; s < steps; s++) {
      // Integrate positions
      for (const p of this.particles) {
        p.integrate(stepDt, gravity, damping);
      }

      // Satisfy constraints (multiple iterations for stiffness)
      for (let i = 0; i < iters; i++) {
        for (const c of this.constraints) {
          c.satisfy(stretchLimit);
        }
      }
    }

    // Optional: simple floor constraint
    // Uncomment if you want fabric to rest on a surface
    // this._applyFloor(600);
  }

  /**
   * Get the bounding box of all particles.
   * @returns {{ minX, minY, maxX, maxY }}
   */
  getBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.particles) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Reset the cloth to its initial flat state.
   */
  reset() {
    for (let r = 0; r < this._rowCount; r++) {
      for (let c = 0; c < this._colCount; c++) {
        const p = this.getParticle(c, r);
        const nx = this._originX + c * this._spacing;
        const ny = this._originY + r * this._spacing;
        p.x = nx;
        p.y = ny;
        p.prevX = nx;
        p.prevY = ny;
        p._forceX = 0;
        p._forceY = 0;
      }
    }
  }

  /**
   * Serialize simulation state for saving.
   */
  serialize() {
    return {
      material: this._material,
      colCount: this._colCount,
      rowCount: this._rowCount,
      spacing: this._spacing,
      originX: this._originX,
      originY: this._originY,
      particles: this.particles.map(p => ({
        x: p.x, y: p.y, prevX: p.prevX, prevY: p.prevY,
        pinned: p.pinned, mass: p.mass,
      })),
    };
  }

  /**
   * Restore simulation from serialized state.
   */
  deserialize(data) {
    if (data.particles.length !== this.particles.length) {
      throw new Error('ClothSim: particle count mismatch in deserialize');
    }
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const d = data.particles[i];
      p.x = d.x; p.y = d.y;
      p.prevX = d.prevX; p.prevY = d.prevY;
      p.pinned = d.pinned; p.mass = d.mass;
    }
    this.setMaterial(data.material);
  }

  // --- Private ---

  _buildMesh() {
    const cols = this._colCount;
    const rows = this._rowCount;
    const s = this._spacing;
    const ox = this._originX;
    const oy = this._originY;

    // Build particles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.particles.push(new ClothParticle(ox + c * s, oy + r * s));
      }
    }

    // Build constraints
    const DIAGONAL = Math.SQRT2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = this.getParticle(c, r);

        // Structural: right neighbor
        if (c + 1 < cols) {
          const right = this.getParticle(c + 1, r);
          this.constraints.push(new ClothConstraint(p, right, s, 1.0));
        }

        // Structural: below neighbor
        if (r + 1 < rows) {
          const below = this.getParticle(c, r + 1);
          this.constraints.push(new ClothConstraint(p, below, s, 1.0));
        }

        // Shear: diagonal right-down
        if (c + 1 < cols && r + 1 < rows) {
          const diagRD = this.getParticle(c + 1, r + 1);
          this.constraints.push(
            new ClothConstraint(p, diagRD, s * DIAGONAL, 0.5) // stiffness updated by setMaterial
          );
        }

        // Shear: diagonal left-down
        if (c - 1 >= 0 && r + 1 < rows) {
          const diagLD = this.getParticle(c - 1, r + 1);
          this.constraints.push(
            new ClothConstraint(p, diagLD, s * DIAGONAL, 0.5)
          );
        }

        // Bend: skip-one horizontal
        if (c + 2 < cols) {
          const skipH = this.getParticle(c + 2, r);
          this.constraints.push(
            new ClothConstraint(p, skipH, s * 2, 0.3) // stiffness updated by setMaterial
          );
        }

        // Bend: skip-one vertical
        if (r + 2 < rows) {
          const skipV = this.getParticle(c, r + 2);
          this.constraints.push(
            new ClothConstraint(p, skipV, s * 2, 0.3)
          );
        }
      }
    }

    // Tag constraints by type for stiffness updates
    this._tagConstraints();
  }

  _tagConstraints() {
    // Re-classify constraints by rest length
    const s = this._spacing;
    const DIAGONAL = Math.SQRT2;

    for (const c of this.constraints) {
      const ratio = c.restLength / s;
      if (Math.abs(ratio - 1.0) < 0.01) {
        c._type = 'structural';
      } else if (Math.abs(ratio - DIAGONAL) < 0.01) {
        c._type = 'shear';
      } else if (Math.abs(ratio - 2.0) < 0.01) {
        c._type = 'bend';
      } else {
        c._type = 'structural';
      }
    }
  }

  _updateConstraintStiffness() {
    if (!this._preset) return;
    const { shearResist, bendResist } = this._preset;

    for (const c of this.constraints) {
      if (c._type === 'structural') {
        c.stiffness = 1.0;
      } else if (c._type === 'shear') {
        c.stiffness = shearResist;
      } else if (c._type === 'bend') {
        c.stiffness = bendResist;
      }
    }
  }

  _applyFloor(floorY) {
    for (const p of this.particles) {
      if (p.y > floorY) {
        p.y = floorY;
        if (p.prevY > floorY) p.prevY = floorY;
      }
    }
  }
}
