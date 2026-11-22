import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { clearDynamicDirectives, dynamicDirectives, refreshDynamicDirectives } from '../../src/dynamic/directives';
import { dynamicIntentInput } from '../../src/engine/dynamic/intents';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { getCallType } from '../../src/llm/callTypes';
import type { IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
// the order of the day-end steps follows the order the action modules are evaluated, so `world` loads first, as it did when the golden was made
import { loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';
import { campaign, errors, run, setRelation } from '../helpers/loyalty';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';

/**
 * P15, Review Focus 1: a campaign that never turns the dynamic on is the campaign as it was. The week of `helpers/unaffectedWeek.ts` is run with every P15 module
 * loaded; its event log, final rng and a hash of its final state are the golden file `fixtures/unaffected-week.json` (made before P13; read here, never written: a
 * change that moves it draws or writes state in a campaign that never asked for the dynamic, so STOP and find which hook did, do not regenerate it).
 */
const GOLDEN = new URL('../fixtures/unaffected-week.json', import.meta.url);
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const sha = (s: unknown): string => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const summarize = (r: ReturnType<typeof runWeek>) => ({ log: r.log, rng: r.rng, stateSha: sha(r.state) });
const golden = (): ReturnType<typeof summarize> => JSON.parse(readFileSync(GOLDEN, 'utf8')) as ReturnType<typeof summarize>;

/** Every optional key P15 adds to the state (spec: old saves have none of them). */
function newKeys(s: CampaignState): string[] {
  const found: string[] = [];
  if (s.dynamic !== undefined) found.push('dynamic');
  for (const [id, r] of Object.entries(s.relations)) {
    for (const k of ['dynamic', 'regard', 'mastery'] as const) if (r[k] !== undefined) found.push(`relations.${id}.${k}`);
  }
  for (const u of s.squad) {
    for (const k of ['expectations', 'expectationLocks', 'practiceLocks'] as const) if (u[k] !== undefined) found.push(`${u.id}.${k}`);
    if (u.bond?.practice !== undefined) found.push(`${u.id}.bond.practice`);
  }
  if (s.settings.dynamicHidden !== undefined) found.push('settings.dynamicHidden');
  return found;
}
/** The event types the dynamic writes (a log line is `type: event,event`). */
const events = (log: string[]): boolean => log.some((l) => /dynamic_|hold_|frame_changed|probe_|domain_|aftermath_|regard_|milestone_offered|sworn|offer_made|zone_revealed|mastery_gained|position_shifted|leash_blocked|leash_bypassed|oversight_inquiry|disappointed/.test(l));

describe('the unaffected week (Review Focus 1)', () => {
  it('unaffected week: matches the week as it played before P13 (the golden): same events, same rng, same final state, none of the new keys', () => {
    const now = summarize(runWeek(reg));
    const was = golden();
    expect(now.log).toEqual(was.log);
    expect(now.rng).toEqual(was.rng);
    expect(now.stateSha).toBe(was.stateSha);
    const week = runWeek(reg);
    expect(newKeys(week.state)).toEqual([]);
    expect(events(week.log)).toBe(false);
  });

  /** Every category on, a dynamic block with the given setup, and no soldier with a practice profile on her card (so nobody could hold). */
  const withDynamic = (setup: { holders: 0 | 1 | 'any' }, extra: (s: CampaignState) => void = () => {}) => (s: CampaignState): void => {
    s.content = { enabled: [...reg.contentCategories.keys()] };
    s.dynamic = newDynamicCampaign(7, { ...setup, pace: 'normal', frequency: 'normal', units: {} });
    extra(s);
  };
  const bare = (s: CampaignState): string => { const c = structuredClone(s) as unknown as Record<string, unknown>; delete c.content; delete c.dynamic; return sha(c); };

  it('categories on but holders 0: the same rng and log, no new relation keys', () => {
    const plain = runWeek(reg);
    const all = runWeek(reg, { tweak: withDynamic({ holders: 0 }) });
    expect(all.state.content!.enabled.length).toBeGreaterThan(13);
    expect(all.state.dynamic!.setup.holders).toBe(0);
    expect(all.log).toEqual(plain.log);
    expect(all.rng).toEqual(plain.rng);
    expect(bare(all.state)).toBe(bare(plain.state));
    expect(newKeys(all.state)).toEqual(['dynamic']); // only the block the tweak wrote itself: nothing grew
    expect(events(all.log)).toBe(false);
    expect(all.state.dynamic).toEqual(newDynamicCampaign(7, { holders: 0, pace: 'normal', frequency: 'normal', units: {} }));
  });

  it('a holder in the squad, but nobody eligible present and no probe due: the same rng, and no probe, claim, milestone or aftermath', () => {
    const plain = runWeek(reg);
    const holder = runWeek(reg, {
      tweak: withDynamic({ holders: 'any' }, (s) => {
        s.relations[s.squad[0].id].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 25 }; // she holds at play, but her card says nothing of a practice and nothing is due (no domain, no step: her hold is under every band they need)
      }),
    });
    expect(holder.rng).toEqual(plain.rng);
    expect(holder.state.dynamic!.open).toEqual({ claims: [], milestones: [], offers: [] });
    expect(holder.state.dynamic!.queue).toEqual([]);
    expect(holder.log.some((l) => /probe_issued|milestone_offered|domain_claimed|aftermath_started|offer_made|leash_blocked/.test(l))).toBe(false);
    // and the same week is the same twice
    const again = runWeek(reg, { tweak: withDynamic({ holders: 'any' }, (s) => { s.relations[s.squad[0].id].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 25 }; }) });
    expect(again.log).toEqual(holder.log);
    expect(sha(again.state)).toBe(sha(holder.state));
  });

  it('the intent prompt is the pinned fixture: nothing is offered to the extractor with the dynamic on and nobody eligible', () => {
    const s = campaign(reg, 4);
    withDynamic({ holders: 'any' })(s);
    const ann = s.squad[0].id;
    const offer = dynamicIntentInput(s, reg, [ann], 'scene');
    expect(offer).toEqual({}); // she has no practice: nothing is offered
    const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');
    const ct = getCallType('intent_extract')!;
    const input: IntentExtractInput = { ...INTENT_SNAPSHOT_INPUT, ...offer };
    expect(`${ct.system(input) as string}\n=====\n${ct.prompt(input) as string}\n`).toBe(pinned);
  });

  it('the context block for a comrade scene has no dynamic: directive', () => {
    const s = campaign(reg, 4);
    withDynamic({ holders: 'any' }, (st) => { st.relations[st.squad[0].id].dynamic = { ...blankDynamic(st.day), frame: 'play', hold: 25 }; })(s);
    for (const u of s.squad) setRelation(s, u.id, { stateId: 'comrade' });
    const ann = s.squad[0].id;
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ann, s.squad[1].id], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(dynamicDirectives(r.state, reg, [ann, s.squad[1].id])).toEqual([]);
    const b = new ContextBuilder();
    refreshDynamicDirectives(b, r.state, reg);
    const ids = [...((b as unknown as { directives: Map<string, unknown> }).directives).keys()];
    expect(ids.filter((id) => id.startsWith('dynamic:'))).toEqual([]);
    clearDynamicDirectives(b);
  });
});
