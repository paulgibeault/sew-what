/* ============================================================
   Thread & Template — SVG Canvas Manager
   Pan/zoom, grid rendering, pattern piece display, anchor hit-testing
   ============================================================ */

import { DRAFTING, ANCHOR } from '../constants.js';
import { clamp, snapTo } from '../utils.js';
import { getOutlinePath, getGrainline, getPieceBounds } from './pattern.js';
import { getSeamAllowanceSVGPath } from './seam-allowance.js';
import { getAnchorVisuals } from './anchors.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVGCanvas — manages the drafting SVG surface.
 */
export class SVGCanvas {
  constructor(svgElement, containerElement) {
    this._svg = svgElement;
    this._container = containerElement;

    // Layers
    this._gridLayer = svgElement.querySelector('#grid-layer');
    this._patternLayer = svgElement.querySelector('#pattern-layer');
    this._seamLayer = svgElement.querySelector('#seam-layer');
    this._annotationLayer = svgElement.querySelector('#annotation-layer');
    this._anchorLayer = svgElement.querySelector('#anchor-layer');

    // View state
    this._viewBox = { x: 0, y: 0, w: 800, h: 600 };
    this._zoom = 1;
    this._panOffset = { x: 0, y: 0 };

    // Interaction state
    this._selectedAnchorId = null;
    this._hoveredAnchorId = null;

    this._initViewBox();
  }

  /** Update the view to fit the container size */
  resize() {
    this._initViewBox();
    this.renderGrid();
  }

  /** Get the SVG coordinate for a screen coordinate */
  screenToSVG(screenX, screenY) {
    const rect = this._container.getBoundingClientRect();
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;

    return {
      x: this._viewBox.x + (relX / rect.width) * this._viewBox.w,
      y: this._viewBox.y + (relY / rect.height) * this._viewBox.h,
    };
  }

  /** Apply a zoom change centered on a screen point */
  applyZoom(scaleFactor, centerX, centerY) {
    const svgCenter = this.screenToSVG(centerX, centerY);

    this._zoom = clamp(this._zoom * scaleFactor, DRAFTING.ZOOM_MIN, DRAFTING.ZOOM_MAX);

    const rect = this._container.getBoundingClientRect();
    const newW = rect.width / this._zoom;
    const newH = rect.height / this._zoom;

    // Keep the SVG point under the cursor stationary
    const ratioX = (centerX - rect.left) / rect.width;
    const ratioY = (centerY - rect.top) / rect.height;

    this._viewBox.x = svgCenter.x - ratioX * newW;
    this._viewBox.y = svgCenter.y - ratioY * newH;
    this._viewBox.w = newW;
    this._viewBox.h = newH;

    this._applyViewBox();
    this.renderGrid();
  }

  /** Pan the view by screen-space delta */
  pan(dx, dy) {
    const rect = this._container.getBoundingClientRect();
    this._viewBox.x -= (dx / rect.width) * this._viewBox.w;
    this._viewBox.y -= (dy / rect.height) * this._viewBox.h;
    this._applyViewBox();
    this.renderGrid();
  }

  /** Fit the view to show all pattern pieces with padding */
  fitToPattern(pattern) {
    if (!pattern || !pattern.pieces.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const piece of pattern.pieces) {
      const b = getPieceBounds(piece);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y + b.height);
    }

    const padding = 60;
    this._viewBox.x = minX - padding;
    this._viewBox.y = minY - padding;
    this._viewBox.w = (maxX - minX) + padding * 2;
    this._viewBox.h = (maxY - minY) + padding * 2;

    const rect = this._container.getBoundingClientRect();
    this._zoom = Math.min(rect.width / this._viewBox.w, rect.height / this._viewBox.h);

    this._applyViewBox();
    this.renderGrid();
  }

  // --- Rendering ---

  /** Render the background grid */
  renderGrid() {
    this._gridLayer.innerHTML = '';

    const { x, y, w, h } = this._viewBox;
    const spacing = DRAFTING.GRID_SPACING;
    const majorEvery = DRAFTING.GRID_MAJOR_EVERY;

    // Adaptive grid: hide minor lines when zoomed out far
    const showMinor = this._zoom > 0.4;

    const startX = Math.floor(x / spacing) * spacing;
    const startY = Math.floor(y / spacing) * spacing;
    const endX = x + w;
    const endY = y + h;

    const frag = document.createDocumentFragment();

    for (let gx = startX; gx <= endX; gx += spacing) {
      const isMajor = Math.round(gx / spacing) % majorEvery === 0;
      if (!showMinor && !isMajor) continue;

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', gx);
      line.setAttribute('y1', y);
      line.setAttribute('x2', gx);
      line.setAttribute('y2', y + h);
      line.setAttribute('class', isMajor ? 'grid-line major' : 'grid-line');
      frag.appendChild(line);
    }

    for (let gy = startY; gy <= endY; gy += spacing) {
      const isMajor = Math.round(gy / spacing) % majorEvery === 0;
      if (!showMinor && !isMajor) continue;

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', gy);
      line.setAttribute('x2', x + w);
      line.setAttribute('y2', gy);
      line.setAttribute('class', isMajor ? 'grid-line major' : 'grid-line');
      frag.appendChild(line);
    }

    this._gridLayer.appendChild(frag);
  }

  /** Render all pattern pieces, seam allowances, and annotations */
  renderPattern(pattern, options = {}) {
    this._patternLayer.innerHTML = '';
    this._seamLayer.innerHTML = '';
    this._annotationLayer.innerHTML = '';
    this._anchorLayer.innerHTML = '';

    if (!pattern) return;

    for (const piece of pattern.pieces) {
      this._renderPiece(piece, options);
    }
  }

  /** Set the selected anchor (visual highlight) */
  setSelectedAnchor(anchorId) {
    this._selectedAnchorId = anchorId;
  }

  /** Get the currently selected anchor ID, or null */
  getSelectedAnchorId() {
    return this._selectedAnchorId;
  }

  /** Set the hovered anchor (visual highlight) */
  setHoveredAnchor(anchorId) {
    this._hoveredAnchorId = anchorId;
  }

  // --- Internal Rendering ---

  _renderPiece(piece, options) {
    // Pattern outline
    const outlinePath = getOutlinePath(piece);
    if (outlinePath) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', outlinePath);
      path.setAttribute('class', 'pattern-piece');
      path.setAttribute('data-piece-id', piece.id);
      this._patternLayer.appendChild(path);
    }

    // Seam allowance
    if (options.showSeamAllowances !== false) {
      const saPath = getSeamAllowanceSVGPath(piece);
      if (saPath) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', saPath);
        path.setAttribute('class', 'seam-allowance-path');
        path.setAttribute('data-piece-id', piece.id);
        this._seamLayer.appendChild(path);
      }
    }

    // Grainline arrow
    const gl = getGrainline(piece);
    if (gl) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', gl.x1);
      line.setAttribute('y1', gl.y1);
      line.setAttribute('x2', gl.x2);
      line.setAttribute('y2', gl.y2);
      line.setAttribute('class', 'grainline-arrow');
      this._annotationLayer.appendChild(line);
    }

    // Piece name label
    const bounds = getPieceBounds(piece);
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', bounds.x + bounds.width / 2);
    label.setAttribute('y', bounds.y + bounds.height / 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('class', 'measurement-annotation');
    label.textContent = piece.name;
    this._annotationLayer.appendChild(label);

    // Dimension annotations (width and height)
    this._renderDimensions(piece, bounds);

    // Anchor points
    for (const anchor of piece.anchors) {
      const isSelected = anchor.id === this._selectedAnchorId;
      const isHovered = anchor.id === this._hoveredAnchorId;
      const { radius, className } = getAnchorVisuals(anchor, isSelected, isHovered);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', anchor.x);
      circle.setAttribute('cy', anchor.y);
      circle.setAttribute('r', radius);
      circle.setAttribute('class', className);
      circle.setAttribute('data-anchor-id', anchor.id);
      circle.setAttribute('data-piece-id', piece.id);
      this._anchorLayer.appendChild(circle);
    }
  }

  _renderDimensions(piece, bounds) {
    const PPI = DRAFTING.PX_PER_INCH;
    const widthIn = (bounds.width / PPI).toFixed(1);
    const heightIn = (bounds.height / PPI).toFixed(1);
    const offset = 15;

    // Width dimension (bottom)
    const wLabel = document.createElementNS(SVG_NS, 'text');
    wLabel.setAttribute('x', bounds.x + bounds.width / 2);
    wLabel.setAttribute('y', bounds.y + bounds.height + offset + 12);
    wLabel.setAttribute('text-anchor', 'middle');
    wLabel.setAttribute('class', 'measurement-annotation');
    wLabel.textContent = `${widthIn}"`;
    this._annotationLayer.appendChild(wLabel);

    // Height dimension (right)
    const hLabel = document.createElementNS(SVG_NS, 'text');
    hLabel.setAttribute('x', bounds.x + bounds.width + offset + 4);
    hLabel.setAttribute('y', bounds.y + bounds.height / 2);
    hLabel.setAttribute('text-anchor', 'start');
    hLabel.setAttribute('dominant-baseline', 'middle');
    hLabel.setAttribute('class', 'measurement-annotation');
    hLabel.textContent = `${heightIn}"`;
    this._annotationLayer.appendChild(hLabel);
  }

  // --- ViewBox ---

  _initViewBox() {
    const rect = this._container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this._viewBox.w = rect.width / this._zoom;
    this._viewBox.h = rect.height / this._zoom;
    this._applyViewBox();
  }

  _applyViewBox() {
    const { x, y, w, h } = this._viewBox;
    this._svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }
}
