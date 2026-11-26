/**
 * P10e-e R32: gulp's engine (`docs/prototypes/gulp.html`). Her flow is planned per beat by hash (R3: never the rng), from her style's row of
 * the prototype's `STYLES` (`TUNING.physics.gulpFlow.styles`): her base in mouths a second with the prototype's slow wander, her pauses, her
 * surges every `surgeEvery` seconds (the first `firstMs` in) after a warning of `warn` ms (none for cruel; ritual announces it, the cue
 * `surge`; playful feints: a warning with no surge after it). Her volume (`volumeMs`) is the flow's length: the segments cover it, the last
 * one cut short. Gulp is read by field: a timing physics on a fill gauge. Nothing here draws.
 */
import type { Entry, Registries } from '../../content/types';
import { fnv1a } from '../hub';
import { sceneSettingsOf } from '../moments/settings';
import type { CampaignState } from '../state/types';
import { TUNING, type GulpRow } from '../tuning';
import type { PhysicsRun, PlannedBeat } from './state';

const P = TUNING.physics;
const GF = P.gulpFlow;
export type Flow = NonNullable<PlannedBeat['flow']>;

/** Gulp by field: a timing physics whose gauge is a fill (the mouth keeps up with her flow). */
export const isGulpPhysics = (p: Entry | undefined): boolean => p?.interaction === 'timing' && (p.gauge as { kind?: string } | undefined)?.kind === 'fill';
export const isGulpRun = (run: Pick<PhysicsRun, 'physicsId'>, reg: Registries): boolean => isGulpPhysics(reg.contactPhysics.get(run.physicsId));

/** Her row of gulp.html's `STYLES` by her lead style; a style it has no row of reads neutral's (Ruling R's rule). */
export function gulpRowOf(key: string): GulpRow {
  return GF.styles[key] ?? GF.styles.neutral!;
}

/** How many beats her flow lasts (her volume, on the beat grid). */
export const flowBeats = (): number => Math.ceil(GF.volumeMs / P.beatMs);

/** The cleaning's start: `100 × spilled` (mouthfuls), clamped to the dirt gauge (0–100). */
export const floorStart = (spilled: number): number => Math.min(100, Math.max(0, Math.round(100 * spilled * 100) / 100));

/**
 * Her flow over `count` beats of a run (beat 0 is the run's first), by hash (`fnv1a(<salt>|<runId>|gulp|<beat>|<key>)`). As gulp.html's
 * `planFlow` on the beat grid: her level at the beat's middle is `base × (1 + vary × sin(t / 1300) × sin(t / 3700 + 1))`; a pause starts on a
 * beat at the prototype's chance (`pause × dt / 9000`), one beat long (inside its 0.7–1.8 s), 0 flow; a surge waits for no pause, its warning
 * on the beat before it (none for cruel: the surge lands at once), one beat at `surge` times her level (inside its 1.2–2.2 s); a feint
 * (`feint`) is the warning alone; the next warning comes `surgeEvery` seconds after this one began.
 */
export function flowOf(salt: number, runId: string, row: GulpRow, count: number): Flow[] {
  const B = P.beatMs;
  const h = (g: number, key: string): number => fnv1a(`${salt}|${runId}|gulp|${g}|${key}`);
  const unit = (g: number, key: string): number => (h(g, key) % 10000) / 10000;
  const out: Flow[] = [];
  for (let g = 0; g < count; g++) {
    const t = g * B + B / 2;
    const level = row.base * (1 + row.vary * Math.sin(t / 1300) * Math.sin(t / 3700 + 1));
    out.push(unit(g, 'pause') < (row.pause * B) / 9000 ? { level: 0, pause: true } : { level: round(level) });
  }
  let next = GF.firstMs;
  let busy = -1;
  for (let g = 0; g < count; g++) {
    const f = out[g]!;
    if (g * B < next || f.pause || g <= busy) continue;
    const feint = row.feint !== undefined && unit(g, 'feint') < row.feint;
    const lands = row.warn > 0 ? g + 1 : g;
    if (row.warn > 0) f.warn = true;
    const at = out[lands];
    if (!feint && at !== undefined && !at.pause) {
      at.surge = true;
      at.level = round(at.level * row.surge);
    }
    busy = lands;
    const [lo, hi] = row.surgeEvery;
    next = g * B + (lo * 1000 + (h(g, 'every') % ((hi - lo) * 1000 + 1)));
  }
  return out;
}
const round = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * Lays her flow on a segment's beats (in real time, a gulp run): the run's beats so far are `done` segments of `full` beats; a segment that
 * reaches her volume is cut short there (the beats past it are dropped, after every draw of the plan). Her ritual warning carries the `surge`
 * cue (it replaces the beat's own). Returns the beats (the same array, maybe shorter).
 */
export function layFlow(beats: PlannedBeat[], state: CampaignState, run: PhysicsRun, row: GulpRow, full: number): PlannedBeat[] {
  const total = flowBeats();
  const g0 = run.segment.n * full;
  if (g0 >= total) return beats;
  const flow = flowOf(state.life?.salt ?? 0, run.id, row, total);
  const n = Math.min(beats.length, total - g0);
  beats.length = n;
  for (let b = 0; b < n; b++) {
    const f = flow[g0 + b]!;
    beats[b] = { ...beats[b]!, flow: { ...f } };
    if (f.warn && row.announce === true) beats[b]!.cue = 'surge';
  }
  return beats;
}

/** Whether her flow ended with the segment just resolved (its last beat reached her volume): real time only. */
export function flowEnded(state: CampaignState, run: PhysicsRun, full: number): boolean {
  return sceneSettingsOf(state).physicsRealtime && run.segment.n * full >= flowBeats();
}
