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
    this._viewBox = { x: -20, y: -20, w: 0, h: 0 };
    this._selectedPieceId = null;
    this._hoveredPieceId = null;

    // Create layers
    this._boltLayer = this._createGroup('bolt-layer');
    this._pieceLayer = this._createGroup('piece-layer');
    this._uiLayer = this._createGroup('ui-layer');

    this.resize();
  }

  resize() {
    const rect = this._container.getBoundingClientRect();
    const padding = 40;
    // Fit bolt width into container with padding
    const scale = (rect.width - padding * 2) / this._boltWidth;
    const viewH = rect.height / scale;
    this._viewBox = {
      x: -padding / scale,
      y: -padding / scale,
      w: rect.width / scale,
      h: viewH,
    };
    this._svg.setAttribute('viewBox',
      `${this._viewBox.x} ${this._viewBox.y} ${this._viewBox.w} ${this._viewBox.h}`);
    this._svg.setAttribute('width', rect.width);
    this._svg.setAttribute('height', rect.height);
  }

  setBoltSize(widthInches, heightInches) {
    this._boltWidth = widthInches * PPI;
    this._boltHeight = heightInches * PPI;
    this.resize();
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
   * @param {object} [dragState] - { pieceId, x, y, rotation } for piece being dragged
   */
  render(pattern, placedPieces, dragState) {
    this._renderBolt();
    this._renderPieces(pattern, placedPieces, dragState);
  }

  _renderBolt() {
    this._boltLayer.innerHTML = '';

    // Bolt background
    const rect = this._createSVGElement('rect', {
      x: 0, y: 0,
      width: this._boltWidth,
      height: this._boltHeight,
      fill: '#2a2820',
      stroke: COLORS.ACCENT_DIM,
      'stroke-width': 1,
      rx: 2,
    });
    this._boltLayer.appendChild(rect);

    // Fabric texture lines (subtle woven pattern)
    for (let y = 0; y < this._boltHeight; y += 8) {
      const line = this._createSVGElement('line', {
        x1: 0, y1: y, x2: this._boltWidth, y2: y,
        stroke: 'rgba(196, 168, 130, 0.04)',
        'stroke-width': 0.5,
      });
      this._boltLayer.appendChild(line);
    }
    for (let x = 0; x < this._boltWidth; x += 8) {
      const line = this._createSVGElement('line', {
        x1: x, y1: 0, x2: x, y2: this._boltHeight,
        stroke: 'rgba(196, 168, 130, 0.04)',
        'stroke-width': 0.5,
      });
      this._boltLayer.appendChild(line);
    }

    // Grainline arrow (bolt grain direction — vertical)
    const cx = this._boltWidth / 2;
    const arrowLen = 60;
    const arrow = this._createSVGElement('line', {
      x1: cx, y1: 10,
      x2: cx, y2: 10 + arrowLen,
      stroke: 'rgba(196, 168, 130, 0.2)',
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
      'marker-end': 'url(#fabric-arrow)',
    });
    this._boltLayer.appendChild(arrow);

    // Arrow marker def
    if (!this._svg.querySelector('#fabric-arrow')) {
      const defs = this._svg.querySelector('defs') || this._svg.insertBefore(
        document.createElementNS('http://www.w3.org/2000/svg', 'defs'), this._svg.firstChild);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'fabric-arrow');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '6');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '0 0, 6 2, 0 4');
      poly.setAttribute('fill', 'rgba(196, 168, 130, 0.3)');
      marker.appendChild(poly);
      defs.appendChild(marker);
    }

    // Dimension labels
    const widthLabel = this._createSVGElement('text', {
      x: this._boltWidth / 2,
      y: this._boltHeight + 16,
      'text-anchor': 'middle',
      fill: COLORS.TEXT_MUTED,
      'font-size': 10,
      'font-family': 'monospace',
    });
    widthLabel.textContent = `${this._boltWidth / PPI}"`;
    this._boltLayer.appendChild(widthLabel);
  }

  _renderPieces(pattern, placedPieces, dragState) {
    this._pieceLayer.innerHTML = '';
    this._uiLayer.innerHTML = '';

    for (const pp of placedPieces) {
      if (!pp.placed) continue;

      const piece = pattern.pieces.find(p => p.id === pp.pieceId);
      if (!piece) continue;

      const isDragging = dragState && dragState.pieceId === pp.pieceId;
      const x = isDragging ? dragState.x : pp.x;
      const y = isDragging ? dragState.y : pp.y;
      const rotation = isDragging ? dragState.rotation : pp.rotation;

      this._renderPlacedPiece(piece, x, y, rotation, pp.pieceId);
    }

    // Render drag ghost if dragging an unplaced piece
    if (dragState && !placedPieces.find(p => p.pieceId === dragState.pieceId && p.placed)) {
      const piece = pattern.pieces.find(p => p.id === dragState.pieceId);
      if (piece) {
        this._renderPlacedPiece(piece, dragState.x, dragState.y, dragState.rotation, dragState.pieceId, true);
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
      fill: COLORS.TEXT_MUTED,
      'font-size': 9,
      'font-family': 'monospace',
      'pointer-events': 'none',
    });
    label.textContent = piece.name;
    g.appendChild(label);

    // Grainline mismatch warning
    const rot = ((rotation % 360) + 360) % 360;
    if (rot !== 0 && rot !== 180) {
      const warn = this._createSVGElement('text', {
        x: bounds.x + cx,
        y: bounds.y + cy + 14,
        'text-anchor': 'middle',
        fill: COLORS.WARNING,
        'font-size': 8,
        'font-family': 'monospace',
        'pointer-events': 'none',
      });
      warn.textContent = 'OFF GRAIN';
      g.appendChild(warn);
    }

    this._pieceLayer.appendChild(g);

    // Rotate button for selected piece
    if (isSelected && !isGhost) {
      const btnX = x + bounds.width + 8;
      const btnY = y;
      const rotBtn = this._createSVGElement('text', {
        x: btnX, y: btnY + 12,
        fill: COLORS.ACCENT,
        'font-size': 16,
        cursor: 'pointer',
        'data-action': 'rotate',
        'data-piece-id': pieceId,
      });
      rotBtn.textContent = '\u21BB'; // ↻
      this._uiLayer.appendChild(rotBtn);
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
   */
  hitTestPiece(svgX, svgY, pattern, placedPieces) {
    // Check placed pieces in reverse order (top-most first)
    for (let i = placedPieces.length - 1; i >= 0; i--) {
      const pp = placedPieces[i];
      if (!pp.placed) continue;

      const piece = pattern.pieces.find(p => p.id === pp.pieceId);
      if (!piece) continue;

      const bounds = getPieceBounds(piece);
      const rot = ((pp.rotation % 360) + 360) % 360;
      const isRotated90 = rot === 90 || rot === 270;
      const w = isRotated90 ? bounds.height : bounds.width;
      const h = isRotated90 ? bounds.width : bounds.height;

      if (svgX >= pp.x && svgX <= pp.x + w &&
          svgY >= pp.y && svgY <= pp.y + h) {
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
