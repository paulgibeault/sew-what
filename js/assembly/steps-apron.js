/* ============================================================
   Thread & Template — Apron Assembly Steps
   Defines the 6 beginner-appropriate construction steps
   ============================================================ */

export const APRON_STEPS = [
  {
    id: 'hem-body',
    name: 'Hem the Apron Body',
    instruction: 'Sew a straight hem along the bottom edge of the apron body. Trace the guide line as accurately as you can.',
    type: 'straight-seam',
    targetPiece: 'apron-body',
    seamEdge: 'bottom',
  },
  {
    id: 'attach-bib',
    name: 'Attach the Bib',
    instruction: 'Drag the bib piece to align with the top center of the apron body, then sew the joining seam.',
    type: 'align-and-sew',
    targetPiece: 'apron-body',
    attachPiece: 'apron-bib',
    attachEdge: 'top-center',
  },
  {
    id: 'hem-bib',
    name: 'Hem the Bib',
    instruction: 'Sew a neat hem along the top edge of the bib.',
    type: 'straight-seam',
    targetPiece: 'apron-bib',
    seamEdge: 'top',
  },
  {
    id: 'attach-waistband',
    name: 'Attach the Waistband',
    instruction: 'Drag the waistband to the waist position on the apron body, then sew it in place.',
    type: 'align-and-sew',
    targetPiece: 'apron-body',
    attachPiece: 'apron-waistband',
    attachEdge: 'waist',
  },
  {
    id: 'attach-strap',
    name: 'Attach the Neck Strap',
    instruction: 'Drag the neck strap to connect to the top corners of the bib, then sew the attachment points.',
    type: 'align-and-sew',
    targetPiece: 'apron-bib',
    attachPiece: 'apron-neck-strap',
    attachEdge: 'top-corners',
  },
  {
    id: 'final-press',
    name: 'Final Press & Inspection',
    instruction: 'Run the iron along the completed apron to set all seams. Trace the full outline carefully.',
    type: 'straight-seam',
    targetPiece: 'apron-body',
    seamEdge: 'full-outline',
  },
];
