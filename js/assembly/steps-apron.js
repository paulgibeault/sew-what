/* ============================================================
   Thread & Template — Apron Assembly Steps
   Realistic construction steps with sewing technique instruction
   ============================================================ */

export const APRON_STEPS = [
  {
    id: 'hem-bib',
    name: 'Hem the Bib Edges',
    instruction: 'Fold the bib side and top edges in 1/4" twice to create a narrow double-fold hem. Sew along the folded edge to secure.',
    detail: 'Hem individual pieces before joining them. The bib gets a narrower 1/4" hem since it sits against the chest. Press each fold with an iron before stitching.',
    type: 'straight-seam',
    piece: 'apron-bib',
    edge: 'top',
  },
  {
    id: 'hem-body-bottom',
    name: 'Hem the Bottom Edge',
    instruction: 'Fold the bottom edge up 1/2", then fold again 1/2" to enclose the raw edge. Sew the stitch line to secure the hem.',
    detail: 'A double-fold hem hides the raw fabric edge inside the fold, preventing fraying. Stitch close to the inner folded edge.',
    type: 'straight-seam',
    piece: 'apron-body',
    edge: 'bottom',
  },
  {
    id: 'hem-body-sides',
    name: 'Hem the Side Edges',
    instruction: 'Fold each side edge in 1/2" twice (double-fold hem). Sew the stitch line down the left side.',
    detail: 'Side hems use the same double-fold technique. Press each fold before stitching for clean results.',
    type: 'straight-seam',
    piece: 'apron-body',
    edge: 'left',
  },
  {
    id: 'attach-bib',
    name: 'Attach the Bib',
    instruction: 'Place the bib right-sides-together on the body top edge, centered. Drag it into position, then stitch the seam.',
    detail: 'Right-sides-together means the "pretty" sides face each other. After stitching, flip the bib up and press the seam down.',
    type: 'align-and-sew',
    piece: 'apron-body',
    attachPiece: 'apron-bib',
    attachEdge: 'top-center',
  },
  {
    id: 'attach-waistband',
    name: 'Attach the Waistband',
    instruction: 'Fold the waistband in half lengthwise, wrong sides together. Align its center with the body waist edge and stitch.',
    detail: 'The waistband wraps around the body top edge. The extra length on each side becomes the ties.',
    type: 'align-and-sew',
    piece: 'apron-body',
    attachPiece: 'apron-waistband',
    attachEdge: 'waist',
  },
  {
    id: 'attach-strap',
    name: 'Attach the Neck Strap',
    instruction: 'Fold the strap in half lengthwise, stitch the long edge, turn right-side-out. Attach each end to a top corner of the bib.',
    detail: 'Sewing then turning creates a clean tube. Pin each end to the bib corners before stitching for even placement.',
    type: 'align-and-sew',
    piece: 'apron-bib',
    attachPiece: 'apron-neck-strap',
    attachEdge: 'top-corners',
  },
];
