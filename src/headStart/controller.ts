import { isLiving } from '../engine/economy';
import { commanderLine } from '../engine/commander/profile';
import { recapCommitted } from '../engine/headStart/recap';
import { factTextMax } from '../engine/memory/config';
import { joinNames } from '../engine/memory/resolvers';
import type { CampaignState } from '../engine/state/types';
import { DRAFT_MARK, fallbackRecap, sanitizeRecap, type HeadStartRecapInput, type HeadStartRecapValue } from '../llm/calls/headStartRecap';
import type { HeadStartDeps } from './deps';

export type { HeadStartDeps } from './deps';

/** The directive of the first scene of a head start (`head_start:`-prefixed, away from `prologue:`). */
export const OPENING_DIRECTIVE = 'head_start:known';
const SITE = 'setup.head_start_recap';
const KEY = 'recap';
const CARD_MAX = 600;

export interface HeadStartController {
  /** After a (re)load or a deployment: asks for the recap once per chat while there is none. */
  onLoaded(): void;
  /** A scene opened: the first one of a head start's day 1 gets the opening directive. */
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** P14: REROLL of the recap (before the first scene) and why it is not allowed. */
  rerollRecap(): Promise<void>;
  rerollState(): { enabled: boolean; reason?: string };
}

/**
 * The opening line of the first scene (AUTHOR TO WRITE): how long the squad has known the commander and who arrives today. The commander
 * is only "the commander" (lore §0).
 */
export function headStartOpening(state: CampaignState): string {
  const hs = state.headStart;
  if (!hs) return '';
  const known = new Set(hs.units.map((u) => u.unitId));
  const arrivals = state.squad.filter((u) => u.kind === 'named' && !known.has(u.id) && isLiving(u)).map((u) => u.displayName);
  const first = `The squad has known the commander for ${hs.days} days: no introductions, no first meeting.`;
  if (arrivals.length === 0) return first;
  return `${first} ${joinNames(arrivals)} arrived today and ${arrivals.length === 1 ? 'meets' : 'meet'} the commander for the first time.`;
}

/**
 * The model-facing half of the head start (P11b): it asks for the recap of the first weeks once and dispatches `head_start/recap` with the
 * answer or the template fallback; it also sets the opening directive of the first scene. The engine validates every id and kind and never
 * reads the texts for numbers; an answer for another chat is dropped.
 */
export function createHeadStart(deps: HeadStartDeps): HeadStartController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  /** Recap requests already made, by chat: a reload before an answer asks again (a new session), a second `onLoaded` does not. */
  const asked = new Set<string>();

  /** The request, rebuilt from the state (the state is the truth, never a cache). */
  function recapInput(s: CampaignState): HeadStartRecapInput | null {
    const hs = s.headStart;
    if (!hs) return null;
    const reg = deps.registries();
    const start = reg.starts.get(s.world.startId ?? '');
    const crime = s.commander.crimeId ? reg.crimes.get(s.commander.crimeId) : undefined;
    const units: HeadStartRecapInput['units'] = [];
    for (const u of hs.units) {
      const unit = s.squad.find((x) => x.id === u.unitId);
      if (!unit) continue;
      const card = unit.cardRef === undefined ? null : deps.st.getCharacterCard(unit.cardRef);
      units.push({
        unitId: unit.id, name: unit.displayName,
        card: [card?.description, card?.personality].filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' ').slice(0, CARD_MAX),
        impression: u.impression, knowsCrime: s.relations[unit.id]?.flags.includes('knows_crime') === true,
        moments: u.moments.map((kind) => ({ kind, description: String(reg.headStartMoments.get(kind)?.description ?? kind).replace(DRAFT_MARK, '') })),
      });
    }
    return {
      days: hs.days, premise: start ? String(start.summary) : 'A penal unit.', crime: crime ? `${String(crime.name)}: ${String(crime.summary)}` : 'unknown',
      commander: commanderLine(s), units, textMax: factTextMax(s),
    };
  }

  function dispatchRecap(value: HeadStartRecapValue, source: 'model' | 'fallback') {
    return deps.app.dispatch({ type: 'head_start/recap', payload: { ...value, source } }, { expectChatId: chatId() });
  }

  // the `setup.head_start_recap` site (key `recap`): the first application writes the facts and the paragraph; a RETRY after the fallback or a
  // REROLL replaces them in place while no scene has started. A failure is a full record and the template texts stand.
  deps.generations.bind<HeadStartRecapInput, HeadStartRecapValue>(SITE, {
    build(key) {
      const s = state();
      if (!s || !s.headStart || key !== KEY) return { expired: 'This campaign has no head start.' };
      if (s.headStart.recap !== undefined) {
        const why = recapCommitted(s);
        if (why !== null) return { expired: why };
      }
      return recapInput(s) ?? { expired: 'This campaign has no head start.' };
    },
    parse: (raw, input) => sanitizeRecap(raw, input),
    apply(_key, value) {
      const err = dispatchRecap(value, 'model').find((e) => e.type === 'error');
      if (!err) return 'ok';
      return err.code === 'chat_changed' ? { stale: true } : { rejected: String(err.message ?? 'The recap was refused.') };
    },
    fallback(_key, input) {
      const s = state();
      const i = input ?? (s ? recapInput(s) : null);
      if (!i) return false;
      return !dispatchRecap(fallbackRecap(i, deps.registries()), 'fallback').some((e) => e.type === 'error');
    },
    committed(key) {
      const s = state();
      if (!s || !s.headStart || key !== KEY) return 'This campaign has no head start.';
      return s.headStart.recap === undefined ? null : recapCommitted(s);
    },
  });

  async function ask(): Promise<void> {
    const s = state();
    if (!s || !s.headStart || s.headStart.recap !== undefined) return;
    const key = `${chatId() ?? ''}:${KEY}`;
    if (asked.has(key)) return;
    asked.add(key);
    const out = await deps.generations.generate(SITE, KEY);
    // an answer dropped for a chat switch (or a moment that passed) left no recap: the next load of this chat asks again
    if (out.kind === 'stale' || out.kind === 'expired' || state()?.headStart?.recap === undefined) asked.delete(key);
  }

  const clear = (): void => deps.context.clearMatching((d) => d.id === OPENING_DIRECTIVE);

  return {
    onLoaded() {
      void ask().catch(() => {});
    },
    onSceneOpened() {
      const s = state();
      if (!s?.headStart || !s.scene || s.day !== 1 || (s.memory.scenes ?? []).length > 0) return;
      deps.context.setDirective({ id: OPENING_DIRECTIVE, text: headStartOpening(s), expiresAfter: 'scene' });
      deps.refreshContext();
    },
    onSceneClosed() {
      clear();
      deps.refreshContext();
    },
    rerollRecap: async () => { await deps.generations.reroll(SITE, KEY); },
    rerollState: () => deps.generations.rerollState(SITE, KEY),
  };
}
