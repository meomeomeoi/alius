import type { Registries } from '../../content/types';
import { addChronicle } from '../memory/chronicle';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { EngineEvent } from '../dispatch';

export const FIRST_SCENE_STARTED = 'The first scene has started.';

/** Why the recap's texts can no longer be replaced: a scene is open or has ended, or the day moved on. `null` while the window is open. */
export function recapCommitted(state: CampaignState): string | null {
  return state.scene !== undefined || (state.memory.scenes ?? []).length > 0 || state.day !== 1 ? FIRST_SCENE_STARTED : null;
}

/** Every `(unit, moment kind)` the recap has to give a text for, in squad and moment order. The kind is the `headStartMoments` id. */
export function recapPairs(state: CampaignState): Array<{ unitId: string; kind: string }> {
  return (state.headStart?.units ?? []).flatMap((u) => u.moments.map((kind) => ({ unitId: u.unitId, kind })));
}

export interface RecapPayload {
  units: Array<{ unitId: string; moments: Array<{ kind: string; text: string }> }>;
  chronicle: string;
  source: 'model' | 'fallback';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates the answer against the stored pairs and returns it as a map `unitId|kind → text`; throws on any problem (a rejected action changes nothing). */
function parse(draft: CampaignState, payload: unknown): { texts: Map<string, string>; chronicle: string; source: 'model' | 'fallback' } {
  if (!isObj(payload) || !Array.isArray(payload.units) || typeof payload.chronicle !== 'string') throw new Error('head_start/recap needs { units, chronicle, source }');
  if (payload.source !== 'model' && payload.source !== 'fallback') throw new Error('head_start/recap: source is model or fallback');
  const { textMax, chronicleMax } = TUNING.headStart;
  const chronicle = payload.chronicle.trim();
  if (chronicle === '' || chronicle.length > chronicleMax) throw new Error(`head_start/recap: the chronicle must be 1 to ${chronicleMax} characters`);
  const texts = new Map<string, string>();
  for (const u of payload.units as unknown[]) {
    if (!isObj(u) || typeof u.unitId !== 'string' || !Array.isArray(u.moments)) throw new Error('head_start/recap: every unit needs { unitId, moments }');
    for (const m of u.moments as unknown[]) {
      if (!isObj(m) || typeof m.kind !== 'string' || typeof m.text !== 'string') throw new Error('head_start/recap: every moment needs { kind, text }');
      const key = `${u.unitId}|${m.kind}`;
      const text = m.text.trim();
      if (texts.has(key)) throw new Error(`head_start/recap: "${m.kind}" of ${u.unitId} is given twice`);
      if (text === '' || text.length > textMax) throw new Error(`head_start/recap: a moment text must be 1 to ${textMax} characters`);
      texts.set(key, text);
    }
  }
  const pairs = recapPairs(draft);
  const want = new Set(pairs.map((p) => `${p.unitId}|${p.kind}`));
  if (texts.size !== want.size || [...texts.keys()].some((k) => !want.has(k))) throw new Error('head_start/recap must give a text for every stored moment, and for no other');
  return { texts, chronicle, source: payload.source };
}

/**
 * The recap of the first weeks (P11b §4). The first application writes one chronicle entry (audience: the known soldiers) and emits
 * `head_start_applied` plus one `head_start_moment` per moment, which the memory rules turn into facts. A later one (a reroll, or a retry
 * after the fallback) replaces the texts in place while `recapCommitted` is null: the chronicle entry by id, and each soldier's facts
 * tagged `head_start` in creation order (a fact the player edited keeps its text). It draws nothing.
 */
export function applyRecap(draft: CampaignState, reg: Registries, payload: unknown): EngineEvent[] {
  const hs = draft.headStart;
  if (!hs) throw new Error('This campaign has no head start.');
  const { texts, chronicle, source } = parse(draft, payload);
  const factMax = TUNING.memory.factTextMax;
  if (hs.recap === undefined) {
    const entry = addChronicle(draft, { kind: 'day', day: draft.day, text: chronicle, audience: hs.units.map((u) => u.unitId) });
    hs.recap = { source, chronicleId: entry.id };
    const events: EngineEvent[] = [{ type: 'head_start_applied', days: hs.days, units: hs.units.map((u) => u.unitId) }];
    for (const p of recapPairs(draft)) {
      events.push({
        type: 'head_start_moment', unitId: p.unitId, kind: p.kind, text: texts.get(`${p.unitId}|${p.kind}`)!,
        importance: Number(reg.headStartMoments.get(p.kind)?.importance ?? 2),
      });
    }
    return events;
  }
  const reason = recapCommitted(draft);
  if (reason !== null) throw new Error(reason);
  const entry = draft.memory.chronicle.find((c) => c.id === hs.recap!.chronicleId);
  if (entry) entry.text = chronicle;
  hs.recap.source = source;
  for (const u of hs.units) {
    const facts = draft.memory.facts.filter((f) => f.tags.includes('head_start') && f.about.length === 1 && f.about[0] === u.unitId);
    u.moments.forEach((kind, i) => {
      const fact = facts[i];
      if (fact && fact.edited !== true) fact.text = texts.get(`${u.unitId}|${kind}`)!.slice(0, factMax).trim();
    });
  }
  return [];
}
