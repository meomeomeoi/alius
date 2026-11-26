import type { ArtSidecar } from '../../scene/art';
import type { SlotKey } from '../slots';

/**
 * P10e-f: a prototype's panel, ported for the slot editor. Each panel module copies its prototype's panel code (JS → TS: types only):
 * the controls (`<input type="range">` / `<select>` of the prototype's HTML, rows checked by `src/ui/stage/fidelity.json`'s `controls`),
 * the prototype's own binding code (`bind`, run over the editor's elements) and its "copy the fit" (`copy`). The editor owns the rest.
 */
export type FitControl =
  | { label: string; type: 'range'; min: number; max: number; step: number; value: number }
  | { label: string; type: 'select'; options: ReadonlyArray<readonly [string, string]>; value: string };

/** The prototype's `$`: an element by its prototype id (`#overH`), in the editor (`[data-proto="overH"]`) or a detached stand-in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Lookup = (selector: string) => any;

export interface FitPanel {
  /** The prototype's file. */
  prototype: string;
  /** The controls of a slot in the panel's order (prototype ids); none = the prototype loads the picture and fits nothing. */
  ids(key: SlotKey): string[];
  controls: Readonly<Record<string, FitControl>>;
  /** The sidecar paths each control writes (`fit.height`, `feet`, …). */
  writes: Readonly<Record<string, readonly string[]>>;
  /** A note under the controls (a slot whose fit lives elsewhere), or null. */
  note(key: SlotKey): string | null;
  /** The slot's sidecar into the panel's state, as the slot's instrument reads it. */
  load(key: SlotKey, sidecar: ArtSidecar): void;
  /** A control's value in the panel's state now. */
  value(id: string): number | string;
  /** The prototype's binding code, over `$`. */
  bind($: Lookup): void;
  /** "copy the fit": the slot's sidecar as the prototype writes it (unknown keys such as `slot` are dropped by `sidecarSchema`). */
  copy(key: SlotKey): unknown;
}
