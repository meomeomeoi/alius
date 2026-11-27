/**
 * The craft's intents (P16b, plan Task 16; ruling 22): what the mechanic model may report about the craft, and what the engine does with it. Three types, each offered only while its
 * subject exists (an empty offer leaves the prompt byte-identical):
 *
 * - `care_noticed`: a woman toward whom care is open has a care she did not notice within the week (the model may report that she saw it, in a scene or a DM): it lands as if she had.
 * - `foot_signal_answered`: a craft-live holder has named a signal of her foot and a foot contact is live (scene only); the model says which motion the commander answered. Only named signals
 *   are ever offered, never her unnamed ones.
 * - `praise_given`: a craft-live holder who takes praise is present (Task 20 registers the reader and the writer). The commander's own words of the exchange (`said`, at most `SAID_MAX`) go to
 *   the writer and to nothing else: no prompt, no event.
 *
 * Reads only (the offer), draws nothing.
 */
import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { COMMANDER } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { signalsOf } from '../physics/service';
import type { EventIntent } from '../relations/intents';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { careKinds, landCares } from './care';
import { careOpen, craftLive } from './gate';
import { noteFootSignal } from './feet';

/** The longest stretch of the commander's own words the praise reads. */
export const SAID_MAX = 400;

export interface CraftOffer {
  /** The types that have a subject right now. */
  types: string[];
  /** Units the commander may praise (a reader says so). */
  praise: string[];
  /** Her named foot signals while a foot contact is live: the unit, the motion and the words for it (never what it means). */
  signals: Array<{ unitId: string; motion: string; words: string }>;
  /** Units who may have seen what the commander did for them unasked: the oldest such care, in the words of its row. */
  cares: Array<{ unitId: string; what: string }>;
}

/** The craft's intent types carry no row of their own: their effect is `applyCraftIntent`'s (the relation event of a care is applied when it lands). */
export const CRAFT_ROW_IS_CONDITIONAL: readonly string[] = ['praise_given', 'foot_signal_answered', 'care_noticed'];

type PraiseReader = (state: CampaignState, reg: Registries, unitId: string) => boolean;
type PraiseWriter = (draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, said: string) => EngineEvent[];
const praiseReaders = new Map<string, PraiseReader>();
const praiseWriters = new Map<string, PraiseWriter>();
/** Task 20 plugs in here: does she take praise now (she sets the rule at frame `role`)? Kept by `key`; the first reader that says yes wins. */
export function registerPraiseOpen(fn: PraiseReader, key = 'default'): void { praiseReaders.set(key, fn); }
/** Task 20 plugs in here: what praise in the commander's own words does (a similarity check against the log, Regard). Gets the cleaned words. */
export function registerPraiseGiven(fn: PraiseWriter, key = 'default'): void { praiseWriters.set(key, fn); }
/** Tests: forget the praise hooks. */
export function resetPraiseHooks(): void { praiseReaders.clear(); praiseWriters.clear(); }

/** Is a foot contact between the commander and her live in the open scene (a contact row with `foot: true`, on either record)? */
export function footContactLive(state: CampaignState, reg: Registries, unitId: string): boolean {
  const b = state.scene?.blocking;
  if (b === undefined) return false;
  const contacts = [b[COMMANDER]?.contact?.with === unitId ? b[COMMANDER]?.contact : undefined, b[unitId]?.contact?.with === COMMANDER ? b[unitId]?.contact : undefined];
  return contacts.some((c) => c !== undefined && reg.blockingContacts.get(c.id)?.foot === true);
}

/** The words of a motion for the model (`craftLines` `signal.<motion>`, the draft marker stripped); the motion itself when there is no row. */
function motionWords(reg: Registries, motion: string): string {
  for (const row of reg.craftLines.values()) if (row.kind === `signal.${motion}`) return String(plainDraft(String(row.text))).replace(/\s+/g, ' ').trim();
  return motion;
}

/** The offer for the units in `participants`: `{}` when nothing has a subject. */
export function craftIntentInput(state: CampaignState, reg: Registries, participants: readonly string[], channel: 'scene' | 'dm'): { craft?: CraftOffer } {
  const named = participants.filter((id) => {
    const u = state.squad.find((x) => x.id === id);
    return u !== undefined && u.kind === 'named' && isLiving(u);
  });
  if (named.length === 0) return {};
  const praise = named.filter((id) => craftLive(state, reg, id) && [...praiseReaders.values()].some((read) => read(state, reg, id)));
  const signals: CraftOffer['signals'] = [];
  if (channel === 'scene') {
    for (const id of named) {
      if (!craftLive(state, reg, id) || !footContactLive(state, reg, id)) continue;
      const have = state.relations[id]?.craft?.signals ?? {};
      for (const s of signalsOf(state, id)) if (have[s.motion]?.named === true) signals.push({ unitId: id, motion: s.motion, words: motionWords(reg, s.motion) });
    }
  }
  const cares: CraftOffer['cares'] = [];
  for (const id of named) {
    if (!careOpen(state, reg, id)) continue;
    const unseen = (state.relations[id]?.craft?.cares ?? []).filter((c) => !c.noticed && c.voiced !== true && state.day - c.day <= TUNING.craft.care.nameDays).sort((a, b) => a.day - b.day)[0];
    const what = unseen === undefined ? undefined : careKinds(reg).find((r) => r.id === unseen.careId)?.promptHint;
    if (what !== undefined) cares.push({ unitId: id, what });
  }
  const types = [...(praise.length > 0 ? ['praise_given'] : []), ...(signals.length > 0 ? ['foot_signal_answered'] : []), ...(cares.length > 0 ? ['care_noticed'] : [])];
  return types.length === 0 ? {} : { craft: { types, praise, signals, cares } };
}

/** The commander's own words as the praise reads them: one line, at most `SAID_MAX` characters. */
const cleanSaid = (said: string | undefined): string => (typeof said === 'string' ? said.replace(/\s+/g, ' ').trim().slice(0, SAID_MAX).trim() : '');

/**
 * Routes one validated event of the craft to its effect on the unit it is about. The offer was built from the same state (a care she shows that has since gone, or a motion she has not named,
 * does nothing). `care_noticed`: the oldest care she did not notice counts as noticed and lands (`landCares`). `foot_signal_answered`: an answered bout of that motion. `praise_given`: the
 * writer gets the commander's own words (`said`); without words, or without a writer, nothing happens. Draws nothing.
 */
export function applyCraftIntent(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, ev: EventIntent, extra: { said?: string; sceneId?: string }): EngineEvent[] {
  const reg = ctx.registries;
  switch (ev.type) {
    case 'care_noticed': {
      if (!careOpen(draft, reg, unitId)) return [];
      const oldest = (draft.relations[unitId]?.craft?.cares ?? []).filter((c) => !c.noticed && c.voiced !== true && draft.day - c.day <= TUNING.craft.care.nameDays).sort((a, b) => a.day - b.day)[0];
      if (oldest === undefined) return [];
      oldest.noticed = true;
      return landCares(draft, ctx, unitId, extra.sceneId ?? 'dm');
    }
    case 'foot_signal_answered': {
      if (ev.motion === undefined || draft.relations[unitId]?.craft?.signals?.[ev.motion]?.named !== true || !craftLive(draft, reg, unitId)) return [];
      return noteFootSignal(draft, reg, unitId, ev.motion, true);
    }
    case 'praise_given': {
      const said = cleanSaid(extra.said);
      if (said === '' || !craftLive(draft, reg, unitId)) return [];
      return [...praiseWriters.values()].flatMap((write) => write(draft, ctx, unitId, said));
    }
    default:
      return [];
  }
}
