/* ============================================================
   Thread & Template — 2D-to-3D Silhouette Preview
   Projects pattern pieces onto a body form (Canvas 2D)
   ============================================================ */

import { COLORS, DRAFTING } from '../constants.js';
import { getPieceBounds } from './pattern.js';

const PPI = DRAFTING.PX_PER_INCH;

/**
 * SilhouettePreview — renders a stylized garment silhouette on a body form.
 */
export class SilhouettePreview {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._bodyForm = null;
  }

  /** Resize the canvas to fill its container */
  resize() {
    const parent = this._canvas.parentElement;
    if (!parent) return;
    this._canvas.width = parent.clientWidth * (window.devicePixelRatio || 1);
    this._canvas.height = parent.clientHeight * (window.devicePixelRatio || 1);
    this._canvas.style.width = parent.clientWidth + 'px';
    this._canvas.style.height = parent.clientHeight + 'px';
  }

  /** Render the silhouette for a given pattern */
  render(pattern) {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = COLORS.BG_INSET;
    ctx.fillRect(0, 0, w, h);

    if (!pattern || !pattern.pieces.length) {
      this._renderEmptyState(ctx, w, h, dpr);
      return;
    }

    // Draw body form
    this._renderBodyForm(ctx, w, h, dpr);

    // Overlay pattern pieces onto the body
    this._renderGarmentSilhouette(ctx, w, h, dpr, pattern);

    // Labels
    this._renderLabels(ctx, w, h, dpr, pattern);
  }

  _renderEmptyState(ctx, w, h, dpr) {
    ctx.fillStyle = COLORS.TEXT_MUTED;
    ctx.font = `${11 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('No pattern loaded', w / 2, h / 2);
  }

  _renderBodyForm(ctx, w, h, dpr) {
    const cx = w / 2;
    const scale = Math.min(w, h) / 500;

    ctx.save();
    ctx.strokeStyle = COLORS.BG_ELEVATED;
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);

    // Simplified front-view body form
    ctx.beginPath();

    // Head
    const headY = 40 * scale;
    const headR = 18 * scale;
    ctx.ellipse(cx, headY, headR, headR * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Neck
    ctx.beginPath();
    ctx.moveTo(cx - 8 * scale, headY + headR * 1.1);
    ctx.lineTo(cx - 8 * scale, headY + headR * 1.1 + 12 * scale);
    ctx.moveTo(cx + 8 * scale, headY + headR * 1.1);
    ctx.lineTo(cx + 8 * scale, headY + headR * 1.1 + 12 * scale);
    ctx.stroke();

    // Shoulders
    const shoulderY = headY + headR + 25 * scale;
    const shoulderW = 75 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW, shoulderY);
    ctx.lineTo(cx + shoulderW, shoulderY);
    ctx.stroke();

    // Torso outline
    const waistY = shoulderY + 100 * scale;
    const hipY = waistY + 50 * scale;
    const torsoW = 55 * scale;
    const waistW = 45 * scale;
    const hipW = 60 * scale;

    ctx.beginPath();
    // Left side
    ctx.moveTo(cx - shoulderW, shoulderY);
    ctx.quadraticCurveTo(cx - torsoW, shoulderY + 40 * scale, cx - waistW, waistY);
    ctx.quadraticCurveTo(cx - hipW * 0.9, waistY + 20 * scale, cx - hipW, hipY);
    // Legs hint
    ctx.lineTo(cx - hipW * 0.8, hipY + 120 * scale);
    ctx.moveTo(cx + hipW * 0.8, hipY + 120 * scale);
    // Right side
    ctx.lineTo(cx + hipW, hipY);
    ctx.quadraticCurveTo(cx + hipW * 0.9, waistY + 20 * scale, cx + waistW, waistY);
    ctx.quadraticCurveTo(cx + torsoW, shoulderY + 40 * scale, cx + shoulderW, shoulderY);
    ctx.stroke();

    // Waist line
    ctx.beginPath();
    ctx.setLineDash([2 * dpr, 6 * dpr]);
    ctx.moveTo(cx - waistW - 10 * scale, waistY);
    ctx.lineTo(cx + waistW + 10 * scale, waistY);
    ctx.stroke();

    // Hip line
    ctx.beginPath();
    ctx.moveTo(cx - hipW - 10 * scale, hipY);
    ctx.lineTo(cx + hipW + 10 * scale, hipY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();

    // Store body landmarks for garment mapping
    this._bodyForm = { cx, shoulderY, shoulderW, waistY, waistW, hipY, hipW, scale };
  }

  _renderGarmentSilhouette(ctx, w, h, dpr, pattern) {
    if (!this._bodyForm) return;
    const { cx, shoulderY, shoulderW, waistY, waistW, hipY, hipW, scale } = this._bodyForm;

    ctx.save();
    ctx.fillStyle = 'rgba(196, 168, 130, 0.15)';
    ctx.strokeStyle = COLORS.ACCENT;
    ctx.lineWidth = 2 * dpr;

    for (const piece of pattern.pieces) {
      const bounds = getPieceBounds(piece);
      const pieceWidthIn = bounds.width / PPI;
      const pieceHeightIn = bounds.height / PPI;

      // Map piece to body based on name heuristics
      const name = piece.name.toLowerCase();
      let mapX, mapY, mapW, mapH;

      if (name.includes('body') || name.includes('front') || name.includes('back')) {
        // Main body piece — center on torso
        mapW = Math.min(pieceWidthIn * 3 * scale, shoulderW * 2);
        mapH = pieceHeightIn * 3 * scale;
        mapX = cx - mapW / 2;
        mapY = waistY - mapH * 0.3;
      } else if (name.includes('bib')) {
        // Bib — upper torso
        mapW = pieceWidthIn * 3 * scale;
        mapH = pieceHeightIn * 3 * scale;
        mapX = cx - mapW / 2;
        mapY = shoulderY + 10 * scale;
      } else if (name.includes('waistband') || name.includes('band')) {
        // Waistband — at waist
        mapW = waistW * 2 + 20 * scale;
        mapH = 10 * scale;
        mapX = cx - mapW / 2;
        mapY = waistY - mapH / 2;
      } else if (name.includes('strap') || name.includes('neck')) {
        // Neck strap — skip in silhouette (too small)
        continue;
      } else {
        // Default: center on torso
        mapW = pieceWidthIn * 3 * scale;
        mapH = pieceHeightIn * 3 * scale;
        mapX = cx - mapW / 2;
        mapY = shoulderY + 30 * scale;
      }

      // Draw the piece silhouette
      ctx.beginPath();
      ctx.rect(mapX, mapY, mapW, mapH);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderLabels(ctx, w, h, dpr, pattern) {
    ctx.fillStyle = COLORS.TEXT_MUTED;
    ctx.font = `${9 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('FRONT VIEW', w / 2, h - 10 * dpr);

    // Pattern name
    ctx.fillStyle = COLORS.ACCENT_LIGHT;
    ctx.font = `600 ${11 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillText(pattern.name, w / 2, 14 * dpr);
  }
}
