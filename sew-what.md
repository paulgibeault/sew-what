Game Design Document: Thread & Template

1. Game Overview and Core Loop

Thread & Template is a high-fidelity systems-driven garment design and assembly puzzle game. Players function as Senior Material Architects, managing the end-to-end lifecycle of couture construction. The experience prioritizes technical precision and geometric logic, mirroring the highest level of craftsmanship described by Alison Smith.

The Architectural Loop

The gameplay is governed by a strict three-stage validated loop:

1. Stage I: Parametric Design (Drafting): Players manipulate geometric primitives and measurement data to generate a technical pattern. The engine must "Validate" the pattern’s geometry and seam allowances before the next stage unlocks.
2. Stage II: Material Architecture (Pre-Assembly Logic): Players map validated patterns onto fabric grainlines, calculate yardage, and apply structural reinforcements (interfacings/stabilizers).
3. Stage III: Construction Puzzles (Assembly): Players execute 3D spatial puzzles and precision mini-games to transform 2D panels into a finished couture garment.

Tone and Style

The aesthetic is "Clinical Couture"—a synthesis of architectural drafting and high-end atelier sophistication. Visual feedback emphasizes technical accuracy over surface-level beauty, rewarding the player for "Turn of Cloth" precision and edge integrity.


--------------------------------------------------------------------------------


2. Tablet-First User Interface (UI) Design

The UI utilizes a professional-grade creative suite metaphor optimized for touch and stylus interaction.

* Inspiration Boards: A freeform "Mood Board" interface (inspired by Milanote) where players drag-and-drop reference imagery and fabric swatches.
* The Sewing Queue: A Kanban-style task management system (inspired by Trello) for tracking projects through To-Sew, In-Progress, and Finished states. Each project card dynamically displays "Material Requirements," including exact yardage calculated by the drafting engine.
* Drafting Canvas: A precision workspace utilizing Direct Point Manipulation (inspired by Garment Designer). Players use a stylus for "Click-and-Drag" adjustments to modify curves and lines with mathematical accuracy.


--------------------------------------------------------------------------------


3. Parametric Drafting Mechanics

The engine translates 2D drafting logic into a real-time 3D Silhouette Preview, allowing players to visualize how flat pattern changes affect the final drape.

Input and Manipulation

* Measurement Datasets: Players toggle between "Ready-to-Wear" industry standards and custom "Bespoke" measurement inputs to generate base blocks.
* Geometric Point Control: Users grab and move specific anchor points to alter necklines, armholes, and hemlines.

Rectangular Mode: Shape Strategy

To create non-garment items, players use the "Rectangular Mode" logic:

* System Logic: Select "Drop Shoulder" (Sleeve Style) + "Straight" (Shoulder) + "Boat > Standard" (Neck Group).
* Output: This specific style combination flattens the garment body into a perfect rectangle for items like totes, aprons, or tool caddies.


--------------------------------------------------------------------------------


4. The Assembly Puzzles: Construction Logic

Construction is a series of spatial logic challenges where failure to follow sequence or precision results in "Visual Artifact" penalties.

Puzzle: "Bagging a Lining" (Grainline Method)

A high-level spatial challenge requiring the shell and lining to be sealed "Right Sides Together."

* Step 5 (Precision Mini-Game): Understitching. Players must stitch the facing to the seam allowance. Critical Mechanic: The player must roll the seam to the inside of the garment, observing the "Breakpoint" where lapels turn. Failure results in a "Seam Peek" penalty.
* Step 6 (Alignment): Aligning hems to create the functional pleat.
* Step 9 (Spatial Slit): The player must re-open a 10" section of the underarm sleeve seam to create the "Turning Hole."
* Step 10 (The Turn): A physics-based sequence where the garment is pulled through the sleeve hole to reveal the exterior.

Puzzle: "The Bound Buttonhole"

A multi-layered precision challenge based on Cashmerette logic.

* Drafting Requirements: Width = Button + 3/8"; Height = 3/8".
* Spatial Logic (The Triangle): When cutting the center line (Step 9), players must cut a precise "Triangle" at the short edges.
* The "Triangle Secure" Move: Players must fold the front piece out of the way and sew across the folds and the triangle simultaneously. Failure to secure the triangle results in a "Structural Collapse" fail-state.
* Stealth Stitch Mini-Game: Use a Ladder Stitch to attach the facing window to the outer fabric. The player must maintain a "Zero Visibility" thread path to succeed.

Closure Mini-Games

* Invisible Zippers: Requires drafting a dedicated placket and executing a "Parallel Stitch" mini-game.
* Rouleau Loops: A dexterity-based task using bias strips and cording for "Classy Closures."


--------------------------------------------------------------------------------


5. Couture Upgrades and Material Science

Materials function as system modifiers that alter fabric physics and durability.

Silk Organza: The Technical Workhorse

Application	Special Ability	Advanced Mechanic
Underlining Linen	Wrinkle Suppression: Decreases the "Wrinkle" physics property by 40%.	Turn of Cloth Logic: Player must roll the seam edge toward the organza side to account for layer thickness.
Stay Taping	Mechanical Stretch Lock: Prevents V-necks and diagonal slash pockets from stretching.	Steam Shaping: A high-level mini-game: stretching one edge of a bias strip while shrinking the other to match a curve.
Press Cloth	Thermal Protection: See-through barrier that prevents burning.	Cardstock Template Pressing: Use an unlockable "File Folder" tool to press narrow edges without finger-burn penalties.

Mastery Stitches & Materials

* Horsehair Braid: Adds "Hem Rigidity" for special-occasion silhouettes.
* Zig-Zag Seam Finish: Required for "Silk Chiffon" to prevent "Edge Degradation."
* Mastery Tier: Herringbone, Catchstitch, Blind Hem, and Flat-Fell.


--------------------------------------------------------------------------------


6. Progression and Customization

Players progress through the "Technical Skill Tree," unlocking projects as they master specific geometric manipulations.

* Bespoke Projects: Mastery of the "Edging" feature in the "Extras" menu unlocks the Beret Hat (composed of two circles and a rectangle with a gathered band).
* Advanced Unlocks: Couture Totes, Clam-Style Potholders (Full/Partial Oval), and Upholstered Tool Caddies.
* Complexity Tier: Beginner (Apron) -> Intermediate (Lined Skirt) -> Advanced (Lined Jacket) -> Couture Master (Tailored Blazer).


--------------------------------------------------------------------------------


7. Technical Implementation Requirements

Drafting Engine & Pattern Logic

The engine must output patterns that automatically include seam allowances. It must also calculate the "Turn of Cloth"—the physical displacement required when a fabric is folded over another. If the player fails to "roll the seam" appropriately, the 3D Silhouette Preview will display a distorted "pulling" artifact.

Physics Simulation: Fail States

* Raveling Simulation: Based on Marla Kazell's "Edge Degradation" logic, if the player skips "Temporary Binding" (wrapping organza strips around raw edges), the fabric will lose structural integrity during assembly, causing the puzzle to fail.
* Drape vs. Weight: The engine must distinguish the high-density physics of Wool Tweed from the low-tension, high-drape physics of Silk Chiffon. Improper stitching on chiffon without "Zig-Zag" finishes will trigger a raveling animation.
