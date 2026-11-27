/**
 * Regard (P15, plan R18, spec §16.3): how much she thinks of the commander as a person, apart from Trust (the commander as commander), Affinity and
 * her hold. `Relation.regard`, 0 to 100, for every named living unit; HIDDEN (a number nobody is shown; only a tone word reaches a prompt). It starts
 * from where the first impression and a crime she knows put it (`regardStart`, worked out the first time anything reads or writes it), falls with the
 * depth of what she takes part in or sees (`regardFall`: the humiliation of the act times her style's factor and speed, down to the style's floor) and
 * rises with what it cost, a record, composure and value outside the dynamic (`regardRise`). It never changes hold or a frame: this module does not import `hold.ts`.
 *
 * Nothing is written while the dynamic is off. No rng. A fall tells the watchers (`registerRegardWatcher`: disappointment, Task 37) once it has been written.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { matchedTastes, presenceOf } from '../commander/presence';
import { valuesOf } from '../development/profile';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { drawnFavour } from './drawn';
import { dynamicOn } from './gate';
import { mannerOf } from './manner';
import { styleOf } from './profile';
import { dynamicOf } from './state';
import type { PracticeStyleEntry, RegardBandEntry, RegardSpeed } from './types';

const R = TUNING.regard;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export type RegardRiseKind = 'cost' | 'record' | 'pleased_high' | 'dignity' | 'value';

/** A named living unit with a relation: the only kind that has Regard. */
function holderOf(state: Pick<CampaignState, 'squad' | 'relations'>, unitId: string): Unit | undefined {
  const unit = state.squad.find((u) => u.id === unitId);
  return unit !== undefined && unit.kind === 'named' && isLiving(unit) && state.relations[unitId] !== undefined ? unit : undefined;
}

// ---------------------------------------------------------------------------------------------
// Bands and the tone

/** The bands, highest first (read from the registry; a band is read by its `min`). */
const bandsOf = (reg: Registries): RegardBandEntry[] => ([...reg.regardBands.values()] as unknown as RegardBandEntry[]).sort((a, b) => b.min - a.min);

/** The id of the `regardBands` row a value falls in (the lowest row for anything under every `min`); `''` when the registry has none. */
export function regardBandOf(reg: Registries, n: number): string {
  const bands = bandsOf(reg);
  return (bands.find((b) => n >= b.min) ?? bands[bands.length - 1])?.id ?? '';
}

/** How far down the band is (0 is the highest row): bands are compared by this, never by id. */
export function regardBandRank(reg: Registries, n: number): number {
  const bands = bandsOf(reg);
  const i = bands.findIndex((b) => n >= b.min);
  return i < 0 ? Math.max(0, bands.length - 1) : i;
}

/** The lowest two rows of the registry: where the style's form of low Regard shows (read by position, not by id). */
function isLow(reg: Registries, n: number): boolean {
  const bands = bandsOf(reg);
  return bands.length >= 2 && regardBandRank(reg, n) >= bands.length - 2;
}

// ---------------------------------------------------------------------------------------------
// Her style's row

interface StyleRow { factor: number; speed: number; floor: number; form: string | undefined; key: string | undefined }

/** Her own primary style's Regard row; a unit with no practice section reads factor 1, speed normal, floor 0 (R18). */
function styleRow(state: CampaignState, reg: Registries, unit: Unit): StyleRow {
  const key = styleOf(unit)?.primary;
  const row = key === undefined ? undefined : (reg.practiceStyles.get(key) as unknown as PracticeStyleEntry | undefined);
  if (row === undefined) return { factor: 1, speed: R.speed.normal, floor: 0, form: undefined, key };
  return { factor: row.regardFactor, speed: R.speed[row.regardSpeed as RegardSpeed] ?? R.speed.normal, floor: row.regardFloor, form: row.regardForm, key };
}

// ---------------------------------------------------------------------------------------------
// The value

/**
 * Where her Regard begins (R18): 50, plus the Presence times her tastes' multipliers times `impression` (at most `impressionMax` either way), minus `crime`
 * when she knows the commander's crime and its value reactions are bad for her (those of her values it touches sum below 0). Pure; writes nothing.
 */
export function regardStart(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined) return R.start;
  const mult = matchedTastes(state, reg, unit).reduce((m, t) => m * (typeof t.presenceMult === 'number' ? t.presenceMult : 1), 1);
  let n = R.start + clamp(presenceOf(state, reg) * mult * R.impression, -R.impressionMax, R.impressionMax);
  if (state.relations[unitId]?.flags.includes('knows_crime') === true && state.commander.crimeId !== null) {
    const reactions = (reg.crimes.get(state.commander.crimeId)?.valueReactions as Array<{ axis: keyof Unit['values']; sign: '+' | '-'; weight: number }> | undefined) ?? [];
    const values = valuesOf(unit);
    const felt = reactions.filter((r) => (r.sign === '+' ? values[r.axis] > 0 : values[r.axis] < 0)).reduce((sum, r) => sum + r.weight, 0);
    if (felt < 0) n -= R.crime;
  }
  return round4(clamp(n, 0, 100));
}

/** Her Regard now: what is stored, else the start (nothing is written). */
export function regardOf(state: CampaignState, reg: Registries, unitId: string): number {
  return state.relations[unitId]?.regard ?? regardStart(state, reg, unitId);
}

/** Writes the start value the first time it is needed, while the dynamic is on and she is a named unit in service; returns her Regard either way. */
export function ensureRegard(draft: CampaignState, reg: Registries, unitId: string): number {
  const stored = draft.relations[unitId]?.regard;
  if (stored !== undefined) return stored;
  const start = regardStart(draft, reg, unitId);
  if (dynamicOn(draft, reg) && holderOf(draft, unitId) !== undefined) draft.relations[unitId].regard = start;
  return start;
}

/** The squad's average Regard over the named units in service (0 units: `null`; the dynamic off: `null`). */
export function squadRegardAverage(state: CampaignState, reg: Registries): number | null {
  if (!dynamicOn(state, reg)) return null;
  const ids = state.squad.filter((u) => u.kind === 'named' && isLiving(u) && state.relations[u.id] !== undefined).map((u) => u.id);
  return ids.length === 0 ? null : ids.reduce((sum, id) => sum + regardOf(state, reg, id), 0) / ids.length;
}

/** The tone of the nickname the squad gives (P9 `reputations[].tone`, R19b): by the squad's average Regard, `respectful` from 60, `pitying` from 30, else `mocking`; `null` while there is no Regard. */
export function nicknameTone(state: CampaignState, reg: Registries): 'respectful' | 'pitying' | 'mocking' | null {
  const avg = squadRegardAverage(state, reg);
  return avg === null ? null : avg >= R.tone.respectful ? 'respectful' : avg >= R.tone.pitying ? 'pitying' : 'mocking';
}

/** What she calls the commander in her tone while her Regard is low or none: her style's form; nothing above that and nothing for a unit with no style. */
export function regardTone(state: CampaignState, reg: Registries, unitId: string): string | null {
  if (!dynamicOn(state, reg)) return null;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named') return null;
  const form = styleRow(state, reg, unit).form;
  return form !== undefined && isLow(reg, regardOf(state, reg, unitId)) ? form : null;
}

/** The form of low Regard for a woman whose card has no practice section (no style row to read): a plain coolness. AUTHOR TO WRITE. */
export const NEUTRAL_REGARD_FORM = 'coolness';

/**
 * The tone word of low or no Regard for any named woman, a holder or not (review I5, R18: "in every named unit's block"): her style's form, or the neutral one
 * when she has no practice section; nothing above low and nothing while the dynamic is off. A word, never a number.
 */
export function regardToneFor(state: CampaignState, reg: Registries, unitId: string): string | null {
  if (!dynamicOn(state, reg)) return null;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named') return null;
  return isLow(reg, regardOf(state, reg, unitId)) ? (styleRow(state, reg, unit).form ?? NEUTRAL_REGARD_FORM) : null;
}

// ---------------------------------------------------------------------------------------------
// The watchers and the writer

type Watcher = (draft: CampaignState, reg: Registries, unitId: string, from: number, to: number) => EngineEvent[];
const watchers: Watcher[] = [];
/** A reader of a fall that has been written (disappointment, Task 37). Registered once from `installDynamicHooks`; the same function twice is one. */
export function registerRegardWatcher(fn: Watcher): void {
  if (!watchers.includes(fn)) watchers.push(fn);
}

/** Writes a new value (clamped, four decimals) and says what changed; a fall is shown to the watchers. */
function write(draft: CampaignState, reg: Registries, unitId: string, next: number, cause: string): EngineEvent[] {
  const from = ensureRegard(draft, reg, unitId);
  const to = round4(clamp(next, 0, 100));
  if (to === from) return [];
  draft.relations[unitId].regard = to;
  const events: EngineEvent[] = [{ type: 'regard_changed', unitId, from, to, cause }];
  const was = regardBandOf(reg, from);
  const now = regardBandOf(reg, to);
  if (was !== now) events.push({ type: 'regard_band_changed', unitId, from: was, to: now });
  if (to < from) for (const watch of watchers) events.push(...watch(draft, reg, unitId, from, to));
  return events;
}

/**
 * A fall (R18): `humiliation` (0 to 5) times 1.5 times her style's factor and speed, times 0.7 when she only saw the act (`witness`), down to her style's floor
 * (a value already under the floor stays where it is). Nothing while the dynamic is off, for a unit who is not a named unit in service, or for 0.
 */
export function regardFall(draft: CampaignState, reg: Registries, unitId: string, humiliation: number, opts: { witness: boolean; cause?: string }): EngineEvent[] {
  const unit = dynamicOn(draft, reg) ? holderOf(draft, unitId) : undefined;
  if (unit === undefined || !(humiliation > 0)) return [];
  const row = styleRow(draft, reg, unit);
  const fall = humiliation * R.fall * row.factor * row.speed * (opts.witness ? R.witness : 1);
  const now = ensureRegard(draft, reg, unitId);
  return write(draft, reg, unitId, Math.min(now, Math.max(row.floor, now - fall)), opts.cause ?? 'act');
}

/**
 * A rise (R18): `cost` +3, only when her reading's readiness is 0 or less (the act came after resistance; a woman with no reading of the commander has none to
 * be 0), `record` +2, `pleased_high` +1, `dignity` +2, `value` 1 to 4 (`amount`). A style of `TUNING.regard.drill` doubles `record` and `pleased_high`. `amount` replaces the
 * base of any kind (a `value` one is held to 1 to 4). Nothing while the dynamic is off.
 */
export function regardRise(draft: CampaignState, reg: Registries, unitId: string, kind: RegardRiseKind, amount?: number): EngineEvent[] {
  const unit = dynamicOn(draft, reg) ? holderOf(draft, unitId) : undefined;
  if (unit === undefined) return [];
  if (kind === 'cost') {
    const r = dynamicOf(draft, unitId)?.readOf.r;
    if (r === undefined || r > 0) return [];
  }
  const V = R.value;
  let gain = kind === 'value' ? clamp(amount ?? V.min, V.min, V.max) : amount ?? R.rise[kind];
  const key = styleRow(draft, reg, unit).key;
  if ((R.mastery as readonly string[]).includes(kind) && key !== undefined && R.drill.styles.includes(key)) gain *= R.drill.mult;
  if (!(gain > 0)) return [];
  return write(draft, reg, unitId, ensureRegard(draft, reg, unitId) + gain, kind);
}

// ---------------------------------------------------------------------------------------------
// The days she has served

/** A slip or a caught cheat of the commander's starts her count of slip-free days over (`vindictive` reads it). Nothing for a unit with no count. */
export function resetServed(draft: CampaignState, unitId: string): void {
  const dyn = dynamicOf(draft, unitId);
  if (dyn?.served !== undefined) dyn.served = { since: draft.day };
}

/**
 * Day step 11 (R18): a holder whose style counts served days (`TUNING.regard.vindictive.styles`) gets `rise` for each `days` she has gone without a slip, from the first
 * day this step saw her at `play` or beyond. Draws nothing.
 */
export function regardDayStep(draft: CampaignState, reg: Registries, holders: readonly string[]): EngineEvent[] {
  const T = R.vindictive;
  const events: EngineEvent[] = [];
  for (const id of holders) {
    const dyn = dynamicOf(draft, id);
    const unit = holderOf(draft, id);
    if (dyn === undefined || unit === undefined) continue;
    const key = styleRow(draft, reg, unit).key;
    if (key === undefined || !T.styles.includes(key) || frameRank(dyn.frame) < frameRank('play')) continue;
    if (dyn.served === undefined) { dyn.served = { since: draft.day }; continue; }
    const served = draft.day - dyn.served.since;
    if (served > 0 && served % T.days === 0) events.push(...regardRise(draft, reg, id, 'dignity', T.rise));
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// What feeds it (R18): read from the events of an action and from the relation events that land

/** The named units in service, in squad order (a feat or a won run is something everyone saw). */
const namedInService = (state: CampaignState): string[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);
const idOf = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The holder of a physics run: the live run's, else the first event of the batch that names both the run and its holder. */
function holderOfRun(draft: CampaignState, events: readonly EngineEvent[], runId: string): string | undefined {
  if (draft.scene?.physics?.id === runId) return draft.scene.physics.holderId;
  return events.map((x) => (x.runId === runId ? idOf(x.holderId) : undefined)).find((id) => id !== undefined);
}

/**
 * The events of one action, read for Regard (an after-action hook, nothing while the dynamic is off): a caught cheat (`acts.caught`) and a slip (`acts.slip`)
 * fall for the one who held the commander and start her count of served days over; a record in fiction time (`marathon_done`, not one the stop word ended) rises
 * `record`; a hold that ended `released` or `checked` with no slip and no caught cheat in it rises `dignity`; a feat outsiders saw (`outside_feat`) and a run
 * the squad won (`expedition_ended`, success, for its party) rise `value` for everyone it touched. Draws nothing.
 */
export function regardFromEvents(draft: CampaignState, reg: Registries, events: readonly EngineEvent[]): EngineEvent[] {
  if (!dynamicOn(draft, reg)) return [];
  const V = R.value;
  const out: EngineEvent[] = [];
  const noted = (): NonNullable<NonNullable<CampaignState['dynamic']>['noted']> => (draft.dynamic!.noted ??= {});
  for (const e of events) {
    const holder = idOf(e.holderId);
    const runId = idOf(e.runId);
    switch (e.type) {
      case 'physics_started':
        if (e.chained !== true && draft.dynamic!.noted?.dirtyRun !== undefined) delete draft.dynamic!.noted.dirtyRun;
        if (e.chained !== true && draft.dynamic!.noted?.warnedRun !== undefined) delete draft.dynamic!.noted.warnedRun;
        break;
      case 'physics_segment': {
        // P15b: a segment that ended in a warning, for a holder whom `pain` draws (the only one who notes it): a clean end after it is what she rewards
        if (e.phase !== 'end' || e.warning !== true || runId === undefined) break;
        const who = holderOfRun(draft, events, runId);
        if (who !== undefined && mannerOf(draft, reg, who)?.drawnBy.includes('pain') === true) noted().warnedRun = runId;
        break;
      }
      case 'physics_caught':
      case 'physics_slip':
        if (runId !== undefined) noted().dirtyRun = runId;
        if (holder !== undefined) {
          out.push(...regardFall(draft, reg, holder, e.type === 'physics_caught' ? R.acts.caught : R.acts.slip, { witness: false, cause: e.type }));
          resetServed(draft, holder);
          if (e.type === 'physics_slip') drawnFavour(draft, reg, holder, 'reaction'); // P15b: what slips out of the commander (a caught cheat is not that)
        }
        break;
      case 'physics_outcome': {
        const clean = (e.result === 'released' || e.result === 'checked') && !(runId !== undefined && draft.dynamic!.noted?.dirtyRun === runId);
        if (clean && holder !== undefined) out.push(...regardRise(draft, reg, holder, 'dignity'));
        if (clean && holder !== undefined) {
          // P15b: a clean end is what `discipline` rewards, and one after a warning what `pain` rewards (a run no one noted a warning for has none)
          drawnFavour(draft, reg, holder, 'discipline');
          if (runId !== undefined && draft.dynamic!.noted?.warnedRun === runId) drawnFavour(draft, reg, holder, 'pain');
        }
        if (draft.dynamic!.noted?.dirtyRun === runId) delete draft.dynamic!.noted!.dirtyRun;
        if (runId !== undefined && draft.dynamic!.noted?.warnedRun === runId) delete draft.dynamic!.noted.warnedRun;
        break;
      }
      case 'marathon_done': {
        const unit = idOf(e.unitId);
        if (e.result !== 'stopped' && unit !== undefined) out.push(...regardRise(draft, reg, unit, 'record'));
        break;
      }
      case 'outside_feat':
        for (const id of namedInService(draft)) out.push(...regardRise(draft, reg, id, 'value', V.feat));
        break;
      case 'expedition_ended': {
        const report = draft.lastExpedition;
        if (e.outcome !== 'success' || report === undefined || report.id !== e.reportId) break;
        for (const id of report.party) out.push(...regardRise(draft, reg, id, 'value', V.run));
        break;
      }
    }
  }
  return out;
}

/** A relation event that landed on her (an engine hook, `registerEventLanded`): a kept promise and a finished quiet meeting are value outside the dynamic. */
export function regardFeed(draft: CampaignState, reg: Registries, unitId: string, event: { type: string; actor: string }): EngineEvent[] {
  if (event.actor !== 'commander') return [];
  if (event.type === 'kept_promise') return regardRise(draft, reg, unitId, 'value', R.value.promise);
  if (event.type === 'time_together') return regardRise(draft, reg, unitId, 'value', R.value.meeting);
  return [];
}
