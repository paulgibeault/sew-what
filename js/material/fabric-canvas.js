/* ============================================================
   Thread & Template — Fabric Canvas
   SVG-based fabric bolt rendering with piece placement
   ============================================================ */

import { DRAFTING, COLORS } from '../constants.js';
import { getOutlinePath, getPieceBounds } from '../drafting/pattern.js';

const PPI = DRAFTING.PX_PER_INCH;

export class FabricCanvas {
  constructor(svgEl, containerEl) {
    this._svg = svgEl;
    this._container = containerEl;
    this._boltWidth = 45 * PPI;   // px
    this._boltHeight = 72 * PPI;  // px
    this._viewBox = { x: 0, y: 0, w: 0, h: 0 };
    this._selectedPieceId = null;
    this._hoveredPieceId = null;

    // Create layers
    this._boltLayer = this._createGroup('bolt-layer');
    this._pieceLayer = this._createGroup('piece-layer');
    this._uiLayer = this._createGroup('ui-layer');

    this.resize();
    this.fitToView();
  }

  resize() {
    const rect = this._container.getBoundingClientRect();
    this._svg.setAttribute('width', rect.width);
    this._svg.setAttribute('height', rect.height);
    this._applyViewBox();
  }

  fitToView() {
    const rect = this._container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const padding = 30;
    const boltW = this._boltWidth + padding * 2;
    const boltH = this._boltHeight + padding * 2;

    // Fit the entire bolt into the view
    const scaleX = rect.width / boltW;
    const scaleY = rect.height / boltH;
    const scale = Math.min(scaleX, scaleY);

    const viewW = rect.width / scale;
    const viewH = rect.height / scale;

    // Center the bolt in the view
    this._viewBox = {
      x: -padding + (this._boltWidth - viewW + padding * 2) / 2,
      y: -padding,
      w: viewW,
      h: viewH,
    };
    this._applyViewBox();
  }

  /**
   * Pan the view by screen-space pixel deltas.
   */
  pan(dxScreen, dyScreen) {
    const rect = this._container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = this._viewBox.w / rect.width;
    const scaleY = this._viewBox.h / rect.height;
    this._viewBox.x -= dxScreen * scaleX;
    this._viewBox.y -= dyScreen * scaleY;
    this._applyViewBox();
  }

  /**
   * Zoom centered on a viewport point.
   */
  applyZoom(factor, viewportX, viewportY) {
    const rect = this._container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Convert viewport point to SVG coords before zoom
    const relX = (viewportX - rect.left) / rect.width;
    const relY = (viewportY - rect.top) / rect.height;
    const svgX = this._viewBox.x + relX * this._viewBox.w;
    const svgY = this._viewBox.y + relY * this._viewBox.h;

    // Clamp zoom
    const minW = this._boltWidth * 0.3;
    const maxW = this._boltWidth * 3;
    const newW = Math.max(minW, Math.min(maxW, this._viewBox.w / factor));
    const newH = newW * (rect.height / rect.width);

    // Keep the point under the cursor fixed
    this._viewBox.x = svgX - relX * newW;
    this._viewBox.y = svgY - relY * newH;
    this._viewBox.w = newW;
    this._viewBox.h = newH;
    this._applyViewBox();
  }

  setBoltSize(widthInches, heightInches) {
    this._boltWidth = widthInches * PPI;
    this._boltHeight = heightInches * PPI;
    this.resize();
    this.fitToView();
  }

  _applyViewBox() {
    this._svg.setAttribute('viewBox',
      `${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}`);
  }

  setSelectedPiece(pieceId) {
    this._selectedPieceId = pieceId;
  }

  setHoveredPiece(pieceId) {
    this._hoveredPieceId = pieceId;
  }

  get selectedPieceId() {
    return this._selectedPieceId;
  }

  /**
   * Convert screen coordinates to SVG coordinates.
   */
  screenToSVG(screenX, screenY) {
    const pt = this._svg.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    const ctm = this._svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  /**
   * Render the full fabric layout.
   * @param {object} pattern - PatternData
   * @param {Array} placedPieces - array of { pieceId, x, y, rotation, placed }
   * @param {object} [ghost] - { pieceId, x, y, rotation } ghost piece being dragged
   */
  render(pattern, placedPieces, ghost) {
    this._renderBolt();
    this._renderPieces(pattern, placedPieces, ghost);
  }

  _renderBolt() {
    this._boltLayer.innerHTML = '';

    // Ensure arrow marker defs exist
    if (!this._svg.querySelector('#grain-arrow')) {
      const defs = this._svg.querySelector('defs') || this._svg.insertBefore(
        document.createElementNS('http://www.w3.org/2000/svg', 'defs'), this._svg.firstChild);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'grain-arrow');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '0 0, 8 3, 0 6');
      poly.setAttribute('fill', 'rgba(140, 160, 120, 0.6)');
      marker.appendChild(poly);
      defs.appendChild(marker);
    }

    // Bolt background
    const rect = this._createSVGElement('rect', {
      x: 0, y: 0,
      width: this._boltWidth,
      height: this._boltHeight,
      fill: '#2a2820',
      stroke: COLORS.ACCENT_DIM,
      'stroke-width': 1.5,
      rx: 2,
    });
    this._boltLayer.appendChild(rect);

    // Subtle woven texture
    for (let y = 0; y < this._boltHeight; y += 12) {
      this._boltLayer.appendChild(this._createSVGElement('line', {
        x1: 0, y1: y, x2: this._boltWidth, y2: y,
        stroke: 'rgba(160, 140, 110, 0.05)', 'stroke-width': 0.5,
      }));
    }
    for (let x = 0; x < this._boltWidth; x += 6) {
      this._boltLayer.appendChild(this._createSVGElement('line', {
        x1: x, y1: 0, x2: x, y2: this._boltHeight,
        stroke: 'rgba(160, 140, 110, 0.07)', 'stroke-width': 0.75,
      }));
    }

    // Selvage edges — thicker lines on left & right
    for (const sx of [0, this._boltWidth]) {
      this._boltLayer.appendChild(this._createSVGElement('line', {
        x1: sx, y1: 0, x2: sx, y2: this._boltHeight,
        stroke: 'rgba(140, 160, 120, 0.4)', 'stroke-width': 4,
      }));
    }

    // Large blurry background chevron showing grain direction
    const cx = this._boltWidth / 2;
    const arrowW = this._boltWidth * 0.4;
    const arrowTop = this._boltHeight * 0.25;
    const arrowTip = this._boltHeight * 0.6;

    // Blur filter
    if (!this._svg.querySelector('#grain-blur')) {
      const defs = this._svg.querySelector('defs');
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', 'grain-blur');
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '8');
      filter.appendChild(blur);
      defs.appendChild(filter);
    }

    const chevron = this._createSVGElement('path', {
      d: `M ${cx - arrowW} ${arrowTop} L ${cx} ${arrowTip} L ${cx + arrowW} ${arrowTop}`,
      fill: 'none',
      stroke: 'rgba(140, 160, 120, 0.18)',
      'stroke-width': 28,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'pointer-events': 'none',
      'filter': 'url(#grain-blur)',
    });
    this._boltLayer.appendChild(chevron);
  }

  _renderPieces(pattern, placedPieces, ghost) {
    this._pieceLayer.innerHTML = '';
    this._uiLayer.innerHTML = '';

    for (const pp of placedPieces) {
      if (!pp.placed) continue;
      const piece = pattern.pieces.find(p => p.id === pp.pieceId);
      if (!piece) continue;
      this._renderPlacedPiece(piece, pp.x, pp.y, pp.rotation, pp.pieceId);
    }

    // Render ghost for tray-drag
    if (ghost) {
      const alreadyPlaced = placedPieces.find(p => p.pieceId === ghost.pieceId && p.placed);
      if (!alreadyPlaced) {
        const piece = pattern.pieces.find(p => p.id === ghost.pieceId);
        if (piece) {
          this._renderPlacedPiece(piece, ghost.x, ghost.y, ghost.rotation || 0, ghost.pieceId, true);
        }
      }
    }
  }

  _renderPlacedPiece(piece, x, y, rotation, pieceId, isGhost = false) {
    const bounds = getPieceBounds(piece);
    const isSelected = pieceId === this._selectedPieceId;
    const isHovered = pieceId === this._hoveredPieceId;

    // Build transform: translate to placed position, then rotate around piece center
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-piece-id', pieceId);

    // We need to translate from piece's local origin to placed position
    // Piece anchors are in their local coordinate space; we shift them
    let transform = `translate(${x - bounds.x}, ${y - bounds.y})`;
    if (rotation) {
      transform += ` rotate(${rotation}, ${bounds.x + cx}, ${bounds.y + cy})`;
    }
    g.setAttribute('transform', transform);

    // Piece outline
    const path = this._createSVGElement('path', {
      d: getOutlinePath(piece),
      fill: isGhost ? 'rgba(196, 168, 130, 0.15)' : 'rgba(196, 168, 130, 0.25)',
      stroke: isSelected ? COLORS.ACCENT_LIGHT : (isHovered ? COLORS.ACCENT : COLORS.ACCENT_DIM),
      'stroke-width': isSelected ? 2 : 1,
      opacity: isGhost ? 0.6 : 1,
    });
    g.appendChild(path);

    // Grainline indicator on piece
    const gl = this._renderPieceGrainline(piece);
    if (gl) g.appendChild(gl);

    // Label
    const label = this._createSVGElement('text', {
      x: bounds.x + cx,
      y: bounds.y + cy,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: COLORS.TEXT,
      'font-size': 12,
      'font-family': 'monospace',
      'pointer-events': 'none',
    });
    label.textContent = piece.name;
    g.appendChild(label);

    // Grainline mismatch warning — only for truly off-grain angles
    const rot = ((rotation % 360) + 360) % 360;
    const isAligned = rot === 0 || rot === 90 || rot === 180 || rot === 270;
    if (!isAligned) {
      const warn = this._createSVGElement('text', {
        x: bounds.x + cx,
        y: bounds.y + cy + 16,
        'text-anchor': 'middle',
        fill: COLORS.WARNING,
        'font-size': 11,
        'font-family': 'monospace',
        'font-weight': 'bold',
        'pointer-events': 'none',
      });
      warn.textContent = '\u26A0 OFF GRAIN';
      g.appendChild(warn);
    }

    this._pieceLayer.appendChild(g);

    // Rotation ring for selected piece — centered on the same point as the SVG rotate transform
    if (isSelected && !isGhost) {
      // This matches the rotate() center used in the transform above
      const rcx = x + cx;  // cx = bounds.width / 2
      const rcy = y + cy;  // cy = bounds.height / 2
      const radius = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height) / 2 + 6;

      const ring = this._createSVGElement('circle', {
        cx: rcx, cy: rcy, r: radius,
        fill: 'none',
        stroke: 'rgba(196, 168, 130, 0.25)',
        'stroke-width': 8,
        'stroke-dasharray': '4 4',
        cursor: 'grab',
      });
      this._uiLayer.appendChild(ring);

      // Rotation indicator line
      const indicatorLen = radius + 10;
      const angleRad = rotation * Math.PI / 180;
      const ix = rcx + Math.cos(angleRad) * indicatorLen;
      const iy = rcy + Math.sin(angleRad) * indicatorLen;
      const indicator = this._createSVGElement('line', {
        x1: rcx, y1: rcy, x2: ix, y2: iy,
        stroke: COLORS.ACCENT,
        'stroke-width': 1.5,
        'stroke-dasharray': '3 2',
        'pointer-events': 'none',
      });
      this._uiLayer.appendChild(indicator);

      const angleLabel = this._createSVGElement('text', {
        x: rcx, y: rcy - radius - 10,
        'text-anchor': 'middle',
        fill: COLORS.ACCENT_LIGHT,
        'font-size': 14,
        'font-family': 'monospace',
        'font-weight': 'bold',
        'pointer-events': 'none',
      });
      angleLabel.textContent = `${rotation}\u00B0`;
      this._uiLayer.appendChild(angleLabel);
    }
  }

  _renderPieceGrainline(piece) {
    const bounds = getPieceBounds(piece);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const len = bounds.height * 0.4;

    const line = this._createSVGElement('line', {
      x1: cx, y1: cy - len / 2,
      x2: cx, y2: cy + len / 2,
      stroke: 'rgba(196, 168, 130, 0.3)',
      'stroke-width': 0.5,
      'stroke-dasharray': '3 2',
      'pointer-events': 'none',
    });
    return line;
  }

  /**
   * Hit test: find which placed piece (if any) is at the given SVG coordinate.
   * Uses the piece center + un-rotates the test point to check in local space.
   */
  hitTestPiece(svgX, svgY, pattern, placedPieces) {
    for (let i = placedPieces.length - 1; i >= 0; i--) {
      const pp = placedPieces[i];
      if (!pp.placed) continue;

      const piece = pattern.pieces.find(p => p.id === pp.pieceId);
      if (!piece) continue;

      const bounds = getPieceBounds(piece);
      const w = bounds.width;
      const h = bounds.height;

      // Piece center in world space (matches the SVG rotate center)
      const cx = pp.x + w / 2;
      const cy = pp.y + h / 2;

      // Un-rotate the test point back into local piece space
      const rot = -(pp.rotation || 0) * Math.PI / 180;
      const dx = svgX - cx;
      const dy = svgY - cy;
      const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
      const localY = dx * Math.sin(rot) + dy * Math.cos(rot);

      // Check if inside the un-rotated bounding box (centered at origin)
      const pad = 5; // small tolerance
      if (Math.abs(localX) <= w / 2 + pad && Math.abs(localY) <= h / 2 + pad) {
        return pp.pieceId;
      }
    }
    return null;
  }

  // --- SVG Helpers ---

  _createGroup(id) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    this._svg.appendChild(g);
    return g;
  }

  _createSVGElement(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }
}
