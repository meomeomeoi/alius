/**
 * P15b: `bendRow`, the one helper that bends an instrument's style row by her manner. Each instrument wraps its row lookup in it once (at its `ST()`,
 * `st()` or equivalent), with a table of its row's fields by kind next to the wiring, and declares that wrapper in its `fidelity.json`. The helper itself
 * is the engine's (`src/engine/bend.ts`, a leaf), because the physics layer bends its own copies of the same rows (gulp's flow, the service's pace) the
 * same way, so the plan and the instrument agree. With no manner or every axis at 0 it returns the row itself, so the approved prototypes hold.
 */
export { bendRow } from '../../../../engine/bend';
export type { FieldKind, RowAxes, RowKinds } from '../../../../engine/bend';
