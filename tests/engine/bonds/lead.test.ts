import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { decideLead, leadScoreParts, raiseTone } from '../../../src/engine/bonds';
import { impunityOf } from '../../../src/engine/discipline';
import type { CampaignState, LeadStyle } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';
import { noPresence, setRecord } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base); // a fresh unit reads Impunity = base + leash term only
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** Day 8 and her record moved so her Impunity is exactly 50 (the reference point of the score). */
function at50(style: LeadStyle, tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 8;
  withBond(s, ANN, { leadStyle: style });
  tweak(s);
  setRecord(s, ANN, 0);
  const v = impunityOf(s, reg, ANN)!.value;
  setRecord(s, ANN, Math.max(-40, Math.min(40, 50 - v)));
  expect(impunityOf(s, reg, ANN)!.value).toBe(50);
  return s;
}
const hist = (s: CampaignState, type: string, daysAgo = 0, n = 1) => {
  for (let i = 0; i < n; i++) s.relations[ANN].history.push({ day: s.day - daysAgo, kind: 'event', type });
};
const start = (s: CampaignState, participants = [ANN], over: Record<string, unknown> = {}, r: Registries = reg) =>
  run(s, r, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0, ...over } });
const lover = (s: CampaignState) => setRelation(s, ANN, { stateId: 'lover' });
const inState = (stateId: string) => (s: CampaignState) => { setRelation(s, ANN, { stateId }); };

describe('the lead score', () => {
  it('a dominant unit at Impunity 50 leads; assertive leads; balanced shares; a yielding one follows the commander', () => {
    const by = (style: LeadStyle) => decideLead(at50(style), reg, ANN);
    expect(by('dominant')).toEqual({ by: 'unit', score: 75 });
    expect(by('assertive')).toEqual({ by: 'unit', score: 60 });
    expect(by('balanced')).toEqual({ by: 'shared', score: 40 });
    expect(by('yielding')).toEqual({ by: 'commander', score: 15 });
  });

  it('Impunity moves it by a fifth of its distance from 50', () => {
    const s = at50('balanced');
    setRecord(s, ANN, s.relations[ANN].impunityRecord! + 20);
    expect(leadScoreParts(s, reg, ANN)!.impunity).toBeCloseTo(4);
    expect(decideLead(s, reg, ANN)!.score).toBe(44);
  });

  it('the boundaries: 60 and above leads, 35 and below follows, between shares', () => {
    const s = at50('balanced');
    hist(s, 'commander_enforced'); // −10 → 30
    expect(decideLead(s, reg, ANN)).toEqual({ by: 'commander', score: 30 });
    const t = at50('assertive');
    hist(t, 'commander_enforced'); // 50
    expect(decideLead(t, reg, ANN)).toEqual({ by: 'shared', score: 50 });
  });

  it('two recent commander_enforced lower the score by 20, a third changes nothing more, old ones do not count', () => {
    const s = at50('assertive');
    hist(s, 'commander_enforced', 0, 2);
    expect(decideLead(s, reg, ANN)!.score).toBe(40);
    hist(s, 'commander_enforced', 1);
    expect(leadScoreParts(s, reg, ANN)!.enforced).toBe(-20);
    const old = at50('assertive');
    hist(old, 'commander_enforced', 3, 2); // three days ago: outside the window
    expect(decideLead(old, reg, ANN)!.score).toBe(60);
    const edge = at50('assertive');
    hist(edge, 'commander_enforced', 2);
    expect(leadScoreParts(edge, reg, ANN)!.enforced).toBe(-10);
  });

  it('commander_yielded and followed_lead each add 10, capped at 20', () => {
    const s = at50('balanced');
    hist(s, 'commander_yielded');
    hist(s, 'followed_lead', 1);
    expect(leadScoreParts(s, reg, ANN)!.yielded).toBe(20);
    expect(decideLead(s, reg, ANN)).toEqual({ by: 'unit', score: 60 });
    hist(s, 'commander_yielded', 0, 3);
    expect(leadScoreParts(s, reg, ANN)!.yielded).toBe(20);
  });

  it('a defect with leadBonus adds it unless her arc is cure; a state with leadBonus adds it only for assertive or dominant', () => {
    const r = structuredClone(reg);
    r.defects.get('echo_bleed')!.leadBonus = 15;
    const s = at50('balanced');
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'echo_bleed' }];
    expect(leadScoreParts(s, r, ANN)!.defect).toBe(15);
    s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'echo_bleed', arc: 'cure' }];
    expect(leadScoreParts(s, r, ANN)!.defect).toBe(0);
    // a lover with a balanced style gets nothing from her state, an assertive one gets 10
    expect(leadScoreParts(at50('balanced', inState('lover')), reg, ANN)!.state).toBe(0);
    expect(leadScoreParts(at50('assertive', inState('lover')), reg, ANN)!.state).toBe(10);
    expect(leadScoreParts(at50('dominant', inState('devoted')), reg, ANN)!.state).toBe(10);
    expect(leadScoreParts(at50('dominant', inState('friend')), reg, ANN)!.state).toBe(0);
  });

  it('the score is clamped to 0..100', () => {
    const s = at50('dominant', inState('lover'));
    hist(s, 'commander_yielded', 0, 3);
    expect(decideLead(s, reg, ANN)!.score).toBe(100);
    const t = at50('yielding');
    hist(t, 'commander_enforced', 0, 3);
    expect(decideLead(t, reg, ANN)!.score).toBe(0);
  });

  it('a grunt or an unknown unit has no lead', () => {
    const s = at50('dominant');
    s.squad.find((u) => u.id === 'unit_cat')!.kind = 'grunt';
    expect(decideLead(s, reg, 'unit_cat')).toBeNull();
    expect(decideLead(s, reg, 'nobody')).toBeNull();
  });

  it('the parts add up to the score', () => {
    const s = at50('assertive', inState('lover'));
    hist(s, 'commander_yielded');
    const p = leadScoreParts(s, reg, ANN)!;
    expect(p.styleBase + p.impunity + p.defect + p.yielded + p.enforced + p.state).toBeCloseTo(p.total);
    expect(decideLead(s, reg, ANN)!.score).toBe(Math.round(Math.min(100, Math.max(0, p.total))));
  });
});

describe('a scene decides its lead when its tone is first set', () => {
  it('a private scene with a lover starts romantic and decides a lead', () => {
    const s = at50('dominant', inState('lover'));
    const r = start(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.tone).toBe('romantic');
    expect(r.state.scene!.lead).toEqual({ by: 'unit', unitId: ANN, score: 85 }); // 75 + the lover's 10
    expect(ofType(r.events, 'lead_decided')).toEqual([{ type: 'lead_decided', unitId: ANN, by: 'unit' }]);
  });

  it('a scene with someone who is not in a romantic tier has no tone and no lead; neither has a flirting-less friend', () => {
    for (const stateId of ['friend', 'confidant', 'comrade']) {
      const r = start(at50('dominant', inState(stateId)));
      expect(r.state.scene!.tone, stateId).toBeUndefined();
      expect(r.state.scene!.lead, stateId).toBeUndefined();
    }
  });

  it('every state of the romantic tier starts a romantic scene', () => {
    for (const stateId of ['flirting', 'fwb', 'lover', 'devoted', 'secret_affair']) {
      expect(start(at50('balanced', inState(stateId))).state.scene!.tone, stateId).toBe('romantic');
    }
  });

  it('romance off: no tone, no lead', () => {
    const s = at50('dominant', inState('lover'));
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const r = start(s);
    expect(r.state.scene!.tone).toBeUndefined();
    expect(r.state.scene!.lead).toBeUndefined();
    expect(ofType(r.events, 'lead_decided')).toEqual([]);
  });

  it('a group scene with two named units gets no lead, whatever their state', () => {
    const s = at50('dominant', inState('lover'));
    setRelation(s, BEA, { stateId: 'lover' });
    const r = start(s, [ANN, BEA]);
    expect(r.state.scene!.mode).toBe('group');
    expect(r.state.scene!.tone).toBeUndefined();
    expect(r.state.scene!.lead).toBeUndefined();
  });

  it('a night knock of a want_visit starts romantic even when the relation has no romantic tier', () => {
    const s = at50('dominant');
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: 'want_visit', priority: 55, framing: 'k', ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: 99 };
    const r = start(s, [ANN], { origin: 'night', locationId: 'quarters_commander', nightEntryId: 'n1' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.tone).toBe('romantic');
    expect(r.state.scene!.lead).toMatchObject({ unitId: ANN, by: 'unit' });
    // another kind of knock does not
    const other = at50('dominant');
    other.slot = 'night';
    other.calendar.nightEvent = { id: 'n2', unitId: ANN, kind: 'visit', priority: 30, framing: 'k', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
    expect(start(other, [ANN], { origin: 'night', locationId: 'quarters_commander', nightEntryId: 'n2' }).state.scene!.tone).toBeUndefined();
  });

  it('a modest profile still gets a lead (shared): the lead is not Want or rules', () => {
    const s = setRelation(campaign(reg, 4), ANN, { stateId: 'lover' });
    expect(start(s).state.scene!.lead!.by).not.toBe('unit');
  });
});

describe('raising the tone decides the lead again', () => {
  it('extracted sceneTone intimate raises a romantic scene; romantic never lowers intimate', () => {
    const s = start(at50('balanced', inState('lover'))).state;
    expect(s.scene!.tone).toBe('romantic');
    const apply = (st: CampaignState, tone: string | null) => run(st, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, tone } }).state;
    const a = apply(s, 'intimate');
    expect(a.scene!.tone).toBe('intimate');
    const b = apply(a, 'romantic');
    expect(b.scene!.tone).toBe('intimate');
    expect(apply(b, null).scene!.tone).toBe('intimate');
  });

  it('the lead is decided again from the state of the moment', () => {
    const s = start(at50('balanced', inState('lover'))).state; // 40 + 0 → shared
    expect(s.scene!.lead!.by).toBe('shared');
    hist(s, 'commander_yielded', 0, 2);
    const d = structuredClone(s);
    const events = raiseTone(d, reg, 'intimate');
    expect(events.map((e) => e.type)).toEqual(['scene_tone', 'lead_decided']);
    expect(d.scene!.lead).toEqual({ by: 'unit', unitId: ANN, score: 60 });
  });

  it('a romantic tone reported by a reading in a scene with a friend sets tone and lead', () => {
    const s = at50('dominant');
    const opened = start(s).state;
    expect(opened.scene!.lead).toBeUndefined();
    const r = run(opened, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, tone: 'romantic' } });
    expect(r.state.scene!.tone).toBe('romantic');
    expect(r.state.scene!.lead).toMatchObject({ by: 'unit', unitId: ANN });
  });

  it('rollback of the reading restores tone and lead', () => {
    const opened = start(at50('dominant')).state;
    const read = run(opened, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, tone: 'intimate' } }).state;
    expect(read.scene!.lead).toBeDefined();
    expect(opened.scene!.tone).toBeUndefined();
    expect(opened.scene!.lead).toBeUndefined(); // restoring `opened` is the rollback the controller does
  });

  it('no tone and no lead with romance off, whatever the reading says', () => {
    const s = start(at50('dominant')).state;
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, tone: 'intimate' } });
    expect(r.state.scene!.tone).toBeUndefined();
    expect(r.state.scene!.lead).toBeUndefined();
  });
});

describe('followed_lead as an engine event', () => {
  it('has an eventDeltas row of Affinity +2 at minor and is never offered to the model', async () => {
    const row = reg.eventDeltas.get('followed_lead')!;
    expect((row.rows as Record<string, { affinity?: number }>).minor.affinity).toBe(2);
    const { validateIntents } = await import('../../../src/engine/relations/intents');
    const v = validateIntents({ events: [{ type: 'followed_lead', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 }] }, { participants: [ANN], squad: [{ id: ANN }] });
    expect(v.events).toEqual([]);
  });
});

describe('FOLLOW and SET A LIMIT (Task 8)', () => {
  const romantic = (style: LeadStyle = 'dominant') => start(at50(style, inState('lover'))).state;

  it('FOLLOW applies followed_lead once per scene', () => {
    const s = romantic();
    const aff = s.relations[ANN].affinity;
    const r = run(s, reg, { type: 'bonds/follow', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].affinity).toBe(aff + 2);
    expect(r.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'followed_lead', severity: 'minor' });
    expect(ofType(r.events, 'lead_followed')).toEqual([{ type: 'lead_followed', unitId: ANN }]);
    expect(r.state.scene!.followed).toBe(true);
    const again = run(r.state, reg, { type: 'bonds/follow', payload: {} });
    expect(errors(again.events)).toHaveLength(1);
    expect(again.state).toEqual(r.state);
  });

  it('FOLLOW does not touch Impunity, and counts as a yield for the next lead score', () => {
    const s = romantic();
    const before = impunityOf(s, reg, ANN)!.value;
    const r = run(s, reg, { type: 'bonds/follow', payload: {} });
    expect(impunityOf(r.state, reg, ANN)!.value).toBe(before);
    expect(r.state.relations[ANN].impunityRecord).toBe(s.relations[ANN].impunityRecord);
    expect(leadScoreParts(r.state, reg, ANN)!.yielded).toBe(10);
  });

  it('FOLLOW needs a lead: no scene, no tone, romance off', () => {
    expect(errors(run(campaign(reg, 4), reg, { type: 'bonds/follow', payload: {} }).events)).toHaveLength(1);
    expect(errors(run(start(at50('dominant')).state, reg, { type: 'bonds/follow', payload: {} }).events)).toHaveLength(1);
    const off = romantic();
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(errors(run(off, reg, { type: 'bonds/follow', payload: {} }).events)).toHaveLength(1);
  });

  it('SET A LIMIT writes a limit fact known by both and keeps the text on the scene', () => {
    const s = romantic();
    const r = run(s, reg, { type: 'bonds/limit', payload: { text: '  Nothing   past the door.\n ' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.limits).toEqual(['Nothing past the door.']);
    const fact = r.state.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ about: [ANN, 'commander'], tags: ['limit'], importance: 3, knownBy: [ANN] });
    expect(fact.text).toContain('Nothing past the door.');
    expect(fact.text).toContain('Ann');
    expect(ofType(r.events, 'scene_limit_set')).toEqual([{ type: 'scene_limit_set', unitId: ANN, text: 'Nothing past the door.' }]);
  });

  it('the limit is at most 160 characters, never empty, at most five a scene, and needs a lead', () => {
    const s = romantic();
    const long = run(s, reg, { type: 'bonds/limit', payload: { text: 'x'.repeat(500) } });
    expect(long.state.scene!.limits![0]).toHaveLength(160);
    for (const bad of ['', '   ', 7, undefined]) expect(errors(run(s, reg, { type: 'bonds/limit', payload: { text: bad } }).events), String(bad)).toHaveLength(1);
    let cur = s;
    for (let i = 0; i < 5; i++) cur = run(cur, reg, { type: 'bonds/limit', payload: { text: `limit ${i}` } }).state;
    expect(cur.scene!.limits).toHaveLength(5);
    expect(errors(run(cur, reg, { type: 'bonds/limit', payload: { text: 'one more' } }).events)).toHaveLength(1);
    expect(errors(run(start(at50('dominant')).state, reg, { type: 'bonds/limit', payload: { text: 'x' } }).events)).toHaveLength(1);
  });
});
