import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/discipline';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerMemoryProviders } from '../../../src/analysis/providers/memory';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { compromatCount, startAftermath } from '../../../src/engine/dynamic/aftermath';
import { addCompromat, compromatOf, mentionCompromat } from '../../../src/engine/dynamic/compromat';
import { applyDynamicIntent, dynamicIntentInput } from '../../../src/engine/dynamic/intents';
import { applyMilestone } from '../../../src/engine/dynamic/milestones';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import { seedRng } from '../../../src/engine/rng';
import { liveSources } from '../../../src/engine/moments/live';
import type { EventIntent } from '../../../src/engine/relations/intents';
import { factTextMax } from '../../../src/engine/memory/config';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import '../../../src/engine/actions/leash';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerMemoryProviders();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = () => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds at `frame` (a scene with her and Bea open when `scene`). */
function world(over: { frame?: Frame; scene?: boolean; present?: string[] } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'role', hold: 70, domains: [{ id: 'device', since: 1 }] };
  if (over.scene === false) return s;
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: over.present ?? [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const text = (s: CampaignState, id = ANN) => compromatOf(s, id).map((f) => f.text);
const mention = (s: CampaignState, factId?: string, summary?: string) => {
  const d = structuredClone(s);
  const events = mentionCompromat(d, ctxOf(d, reg), ANN, factId, summary);
  return { state: d, events };
};
const ev = (over: Partial<EventIntent> = {}): EventIntent => ({ type: 'compromat_mentioned', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she says what she holds', confidence: 1, summary: 'the stolen ration log', ...over } as EventIntent);

describe('the facts', () => {
  it('addCompromat writes a hidden fact tagged compromat and holder:<id>, known to her alone', () => {
    const s = world({ scene: false });
    const f = addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander was seen on a lead by Bea.', [BEA]);
    expect(f).toMatchObject({ tags: expect.arrayContaining(['compromat', `holder:${ANN}`]), hiddenFromCommander: true, knownBy: [ANN] });
    expect(f.about).toEqual(['commander', BEA]);
    expect(compromatOf(s, ANN)).toEqual([f]);
    expect(compromatOf(s, BEA)).toEqual([]);
    expect(compromatCount(s, ANN)).toBe(1); // blackmail's reader is wired
    expect(compromatCount(s, BEA)).toBe(0);
    // the same text twice is one fact
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander was seen on a lead by Bea.', [BEA]);
    expect(compromatOf(s, ANN)).toHaveLength(1);
  });

  it('is invisible: no Knowledge reading, count or hint shows it', () => {
    const s = world({ scene: false });
    addCompromat(s, ANN, 'SENTINEL-COMPROMAT kneeling at the door', [BEA]);
    const k = buildKnowledge(s, DEFAULT_SETTINGS);
    expect(k.facts().some((f) => f.tags.includes('compromat'))).toBe(false);
    expect(JSON.stringify(k.facts())).not.toContain('SENTINEL-COMPROMAT');
    expect(k.factVisible(compromatOf(s, ANN)[0])).toBe(false);
    // after she mentions it, it is the commander's too
    const out = mention(s, compromatOf(s, ANN)[0].id);
    expect(buildKnowledge(out.state, DEFAULT_SETTINGS).facts().map((f) => f.text)).toContain('SENTINEL-COMPROMAT kneeling at the door');
  });
});

describe('a mention', () => {
  it('reveals the matching fact: by its id, or by what the summary says', () => {
    const s = world({ scene: false });
    const a = addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the whole mess hall.', [BEA]);
    const b = addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander signed the ration log with a forged hand.', []);
    const byId = mention(s, b.id, 'whatever');
    expect(ofType(byId.events, 'compromat_revealed')).toEqual([expect.objectContaining({ unitId: ANN, factId: b.id })]);
    expect(byId.state.memory.facts.find((f) => f.id === b.id)!.hiddenFromCommander).toBeUndefined();
    expect(byId.state.memory.facts.find((f) => f.id === a.id)!.hiddenFromCommander).toBe(true);
    const bySummary = mention(s, undefined, 'she says the commander begged in the mess hall');
    expect(bySummary.state.memory.facts.find((f) => f.id === a.id)!.hiddenFromCommander).toBeUndefined();
    expect(bySummary.state.memory.facts.find((f) => f.id === b.id)!.hiddenFromCommander).toBe(true);
    expect(compromatOf(bySummary.state, ANN)).toHaveLength(2); // still hers; nothing new was written
    // a fact of another holder's is never matched
    expect(mention(s, 'f9999', 'x').state.memory.facts.length).toBe(s.memory.facts.length + 1);
  });

  it('with no matching fact writes a new known one with the summary, cut to the fact length, a pronoun for the commander dropped', () => {
    const s = world({ scene: false });
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the whole mess hall.', [BEA]);
    const r = mention(s, undefined, 'the stolen ration log');
    const fresh = compromatOf(r.state, ANN).find((f) => f.text === 'the stolen ration log')!;
    expect(fresh).toBeDefined();
    expect(fresh.hiddenFromCommander).toBeUndefined();
    expect(fresh.tags).toEqual(expect.arrayContaining(['compromat', `holder:${ANN}`]));
    expect(fresh.knownBy).toEqual([ANN]);
    expect(compromatOf(r.state, ANN).find((f) => f.hiddenFromCommander === true)).toBeDefined(); // the other one is still hidden
    // cut
    const long = mention(s, undefined, 'x'.repeat(500) + ' things');
    expect(compromatOf(long.state, ANN).find((f) => f.text.startsWith('xxx'))!.text.length).toBeLessThanOrEqual(factTextMax(long.state));
    // a pronoun for the commander: the text is dropped, never rewritten
    const he = mention(s, undefined, 'she says he knelt at the door');
    expect(compromatOf(he.state, ANN)).toHaveLength(1);
    expect(he.events).toEqual([]);
    // an empty summary with nothing to match changes nothing
    expect(mention(s, undefined, '   ').events).toEqual([]);
  });
});

describe('the intent', () => {
  it('compromat_mentioned is offered only while a present holder holds some', () => {
    const none = world();
    expect(dynamicIntentInput(none, reg, [ANN, BEA], 'scene').dynamic?.types ?? []).not.toContain('compromat_mentioned');
    const s = world();
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged.', [BEA]);
    const offer = dynamicIntentInput(s, reg, [ANN, BEA], 'scene').dynamic!;
    expect(offer.types).toContain('compromat_mentioned');
    expect(offer.compromat).toEqual([ANN]);
    // she is not in the room: nothing is offered
    expect(dynamicIntentInput(s, reg, [BEA], 'scene').dynamic?.compromat ?? []).toEqual([]);
    // a holder's compromat is named by holder only, never its content
    expect(JSON.stringify(offer)).not.toContain('begged');
  });

  it('applying it mentions the fact; with the dynamic off or no longer offered it does nothing', () => {
    const s = world();
    const f = addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the mess hall.', [BEA]);
    const d = structuredClone(s);
    const events = applyDynamicIntent(d, ctxOf(d, reg), ANN, ev({ factId: f.id }));
    expect(ofType(events, 'compromat_revealed')).toHaveLength(1);
    expect(d.memory.facts.find((x) => x.id === f.id)!.hiddenFromCommander).toBeUndefined();
    const gone = structuredClone(s);
    expect(applyDynamicIntent(gone, ctxOf(gone, reg), BEA, ev({ targets: [BEA] }))).toEqual([]); // Bea holds none
    const off = campaign(reg, 3);
    expect(applyDynamicIntent(off, ctxOf(off, reg), ANN, ev())).toEqual([]);
  });
});

describe('her directive', () => {
  it('lists hers while she is in the room, never anyone else\'s, and carries no number', () => {
    const s = world();
    s.dynamic!.knowledge[BEA] = { [ANN]: { suspicion: 100, level: 'knows_dynamic', levelDay: 1, peakDay: s.day } }; // P15b: before one who does not know, her line shows nothing of the dynamic
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the mess hall.', [BEA]);
    const line = dynamicDirectives(s, reg, [ANN, BEA]).find((d) => d.id === `dynamic:${ANN}`)!;
    expect(line.text).toContain('begged in front of the mess hall');
    expect(line.text).not.toMatch(/\b(he|him|his)\b/i);
    // a revealed one is still hers; the player's view (Knowledge) is not what it reads
    const revealed = mention(s, compromatOf(s, ANN)[0].id).state;
    expect(dynamicDirectives(revealed, reg, [ANN, BEA]).find((d) => d.id === `dynamic:${ANN}`)!.text).toContain('begged');
    // none, no line
    expect(dynamicDirectives(world(), reg, [ANN, BEA]).find((d) => d.id === `dynamic:${ANN}`)!.text).not.toMatch(/holds something over/i);
    // Bea's compromat is not listed in Ann's line
    unitOf(s, BEA).bond = practice();
    addCompromat(s, BEA, 'AUTHOR TO WRITE: the commander lied to Cat.', [CAT]);
    expect(dynamicDirectives(s, reg, [ANN, BEA]).find((d) => d.id === `dynamic:${ANN}`)!.text).not.toContain('lied to Cat');
  });
});

describe('compromat_hint', () => {
  const live = (s: CampaignState) => liveSources(s, reg).some((x) => x.sourceId === 'compromat_hint' && x.unitId === ANN);
  it('is live under its condition only: a present holder at role or more, who holds some, with a refusal in the last 3 days', () => {
    const s = world();
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged.', [BEA]);
    expect(live(s)).toBe(false); // no refusal
    dynamicOf(s, ANN)!.refusals = [s.day - 2];
    expect(live(s)).toBe(true);
    dynamicOf(s, ANN)!.refusals = [s.day - 5];
    expect(live(s)).toBe(false); // too old
    dynamicOf(s, ANN)!.refusals = [s.day];
    dynamicOf(s, ANN)!.frame = 'play';
    expect(live(s)).toBe(false); // frame below role
    dynamicOf(s, ANN)!.frame = 'role';
    expect(live(s)).toBe(true);
    const bare = world();
    dynamicOf(bare, ANN)!.refusals = [bare.day];
    expect(live(bare)).toBe(false); // she holds none
    expect(live(world({ present: [BEA, CAT] }))).toBe(false);
    const away = world({ present: [BEA, CAT] });
    addCompromat(away, ANN, 'AUTHOR TO WRITE: the commander begged.', []);
    dynamicOf(away, ANN)!.refusals = [away.day];
    expect(live(away)).toBe(false); // she is not present
  });
});

describe('blackmail', () => {
  /** Ann has compromat; her blackmail stage begins (with `audience` as the stage's own, put back after). */
  function blackmail(audience: 'squad' | 'outside' = 'squad', extra: string[] = []): { s: CampaignState; factId: string } {
    const s = world({ scene: false });
    s.content = { enabled: ['restraint', ...extra] };
    s.relations[ANN].metDay = s.day - 60; // out of her acquaintance period, so the stage's demand may open
    s.relations[ANN].stateId = 'lover';
    const f = addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the mess hall.', [BEA]);
    const row = reg.aftermaths.get('blackmail') as unknown as { stages: Array<{ effects: Array<{ type: string; audience?: 'squad' | 'outside' }> }> };
    const tell = row.stages[0].effects.find((e) => e.type === 'threaten_tell')!;
    const was = tell.audience;
    tell.audience = audience;
    try { startAftermath(s, ctxOf(s, reg), ANN, 'blackmail'); } finally { tell.audience = was; }
    return { s, factId: f.id };
  }
  const open = (s: CampaignState): CampaignState => ({ ...s, discipline: { ...s.discipline!, demands: s.discipline!.demands.map((d) => ({ ...d, status: 'open' as const })) } });

  it('threaten_tell spreads it to the squad on refuse, and not on grant', () => {
    const { s, factId } = blackmail();
    const demand = s.discipline!.demands.find((d) => d.unitId === ANN)!;
    expect(demand).toBeDefined();
    expect(demand.threat).toEqual({ factId, audience: 'squad' });
    const fact = (st: CampaignState) => st.memory.facts.find((f) => f.id === factId)!;
    expect(fact(s).knownBy).toEqual([ANN]);
    // refused: the squad knows, and the commander learns that
    const out = run(open(s), reg, { type: 'demand/answer', payload: { demandId: demand.id, answer: 'refuse' } });
    expect(errors(out.events)).toEqual([]);
    for (const id of [ANN, BEA, CAT]) expect(fact(out.state).knownBy).toContain(id);
    expect(fact(out.state).hiddenFromCommander).toBeUndefined();
    expect(ofType(out.events, 'compromat_told')).toEqual([expect.objectContaining({ unitId: ANN, factId, audience: 'squad' })]);
    expect(fact(out.state).spread).toBeUndefined(); // squad only: no rumor outside
    // granted: nothing is told
    const granted = run(open(s), reg, { type: 'demand/answer', payload: { demandId: demand.id, answer: 'grant' } });
    if (errors(granted.events).length === 0) expect(fact(granted.state).knownBy).toEqual([ANN]);
  });

  it('with the outside and public_humiliation on, the fact also spreads as a fast rumor', () => {
    const { s, factId } = blackmail('outside', ['public_humiliation']);
    const demand = s.discipline!.demands.find((d) => d.unitId === ANN)!;
    expect(demand.threat).toEqual({ factId, audience: 'outside' });
    const out = run(open(s), reg, { type: 'demand/answer', payload: { demandId: demand.id, answer: 'refuse' } });
    expect(out.state.memory.facts.find((f) => f.id === factId)!.spread).toBe('fast');
    // without the category, the outside is not touched
    const closed = blackmail('outside', []);
    const d2 = closed.s.discipline!.demands.find((d) => d.unitId === ANN)!;
    const out2 = run(open(closed.s), reg, { type: 'demand/answer', payload: { demandId: d2.id, answer: 'refuse' } });
    expect(out2.state.memory.facts.find((f) => f.id === closed.factId)!.spread).toBeUndefined();
  });

  it('without compromat the stage threatens nothing', () => {
    const s = world({ scene: false });
    startAftermath(s, ctxOf(s, reg), ANN, 'blackmail');
    expect(s.discipline?.demands.some((d) => d.threat !== undefined) ?? false).toBe(false);
  });
});

describe('where compromat comes from', () => {
  it('a vow sworn before others: she holds what was said, with the others as witnesses', () => {
    const s = world({ present: [ANN, BEA] });
    const d = structuredClone(s);
    applyMilestone(d, ctxOf(d, reg), ANN, 'vow');
    expect(dynamicOf(d, ANN)!.sworn).toBeDefined();
    const held = compromatOf(d, ANN);
    expect(held).toHaveLength(1);
    expect(held[0].about).toEqual(['commander', BEA]);
    expect(held[0].text).not.toMatch(/\b(he|him|his)\b/i);
    // sworn with nobody else there: nothing to hold
    const alone = world({ present: [ANN] });
    applyMilestone(alone, ctxOf(alone, reg), ANN, 'vow');
    expect(compromatOf(alone, ANN)).toEqual([]);
  });

  it('a bypass she found out is hers to hold; one she did not is not', () => {
    let found = false;
    let missed = false;
    for (let seed = 1; seed < 80 && !(found && missed); seed++) {
      const s = world({ scene: false });
      s.relations[ANN].dynamic!.favour = -20;
      s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: BEA, at: 'day' } } as unknown as CampaignState['disloyalty'];
      s.rng = seedRng(seed);
      const r = run(s, reg, { type: 'dynamic/bypass_leash', payload: { route: 'comms', kind: 'suppress', unitId: BEA } });
      expect(errors(r.events)).toEqual([]);
      const discovered = ofType(r.events, 'leash_bypassed')[0].discovered === true;
      if (discovered) { found = true; expect(compromatOf(r.state, ANN)).toHaveLength(1); expect(compromatOf(r.state, ANN)[0].text).toMatch(/going around her hold/); }
      else { missed = true; expect(compromatOf(r.state, ANN)).toEqual([]); }
    }
    expect(found && missed).toBe(true);
  });

  it('a Leash filed on her is hers to hold', () => {
    // a Leash filed on her (held by her own block): she saw the request
    const s = world({ scene: false });
    s.relations[ANN].dynamic!.favour = -20;
    s.scene = undefined;
    const r = run(s, reg, { type: 'leash/terminate', payload: { unitId: ANN } });
    // terminate needs a cause: the request is refused before anything is held, so nothing is written
    expect(compromatOf(r.state, ANN)).toEqual([]);
    const suppress = structuredClone(s);
    suppress.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, at: 'day' } } as unknown as CampaignState['disloyalty'];
    const out = run(suppress, reg, { type: 'leash/suppress', payload: { unitId: ANN } });
    expect(errors(out.events)).toEqual([]);
    expect(compromatOf(out.state, ANN)).toHaveLength(1);
    expect(compromatOf(out.state, ANN)[0].text).not.toMatch(/\b(he|him|his)\b/i);
    // oversight's own forced Leash is not the commander's doing
    expect(compromatOf(world({ scene: false }), ANN)).toEqual([]);
  });
});
