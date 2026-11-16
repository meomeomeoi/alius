import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { activeRules, bondsDayStep, rollRules } from '../../../src/engine/bonds';
import { Rng, seedRng } from '../../../src/engine/rng';
import { validateIntents } from '../../../src/engine/relations/intents';
import type { CampaignState, LeadStyle, Rule } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { depart, withMission } from '../../helpers/expedition';
import { enable, withBond } from '../../helpers/bonds';
import { noPresence } from '../../helpers/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = noPresence(await loadCore());
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

function world(style: LeadStyle = 'assertive', stateId = 'lover'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 10;
  for (const u of s.squad) u.defects = [];
  setRelation(s, ANN, { stateId });
  withBond(s, ANN, { leadStyle: style });
  return s;
}
let seq = 0;
function rule(s: CampaignState, templateId: string, status: Rule['status'] = 'active', over: Partial<Rule> = {}): Rule {
  const tpl = reg.relationshipRuleTemplates.get(templateId)!;
  const r: Rule = { id: `r${++seq}`, unitId: ANN, templateId, text: String(tpl.text), status, day: s.day, brokenCount: 0, ...over };
  s.bonds = { rules: [...(s.bonds?.rules ?? []), r], ...(s.bonds?.smother ? { smother: s.bonds.smother } : {}) };
  return r;
}
const rolled = (s: CampaignState, seed: number, r: Registries = reg) => {
  const d = structuredClone(s);
  const events = rollRules(d, { registries: r, rng: new Rng(seedRng(seed)) });
  return { state: d, events };
};
const proposals = (s: CampaignState, n = 200, r: Registries = reg): number => {
  let count = 0;
  for (let seed = 1; seed <= n; seed++) count += ofType(rolled(s, seed, r).events, 'rule_proposed').length;
  return count;
};
const apply = (s: CampaignState, events: unknown[], r: Registries = reg) =>
  run(s, r, { type: 'intents/apply', payload: { channel: 'scene', intents: { events } } });
const ev = (type: string, ruleId: string, over: Record<string, unknown> = {}) => ({ type, actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'quoted', confidence: 0.9, ruleId, ...over });
const open = (s: CampaignState, participants = [ANN]) => run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } }).state;

describe('the core templates', () => {
  it('five templates with the checks of the spec, all drafts to write, none naming the commander', () => {
    const t = [...reg.relationshipRuleTemplates.values()];
    expect(t.map((x) => `${x.id}:${x.check}`)).toEqual([
      'report_evening:daily_contact', 'hands_off_gear:intent', 'ask_before_runs:run_without_asking', 'no_other_tokens:token_wear', 'name_me_first:intent',
    ]);
    for (const x of t) {
      expect(String(x.text), String(x.id)).toMatch(/^AUTHOR TO WRITE/);
      expect(String(x.description).length).toBeGreaterThan(0);
      expect(JSON.stringify(x)).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });
});

describe('who proposes (acceptance 1)', () => {
  it('only assertive or dominant units in romantic or close states propose rules', () => {
    expect(proposals(world('assertive', 'lover'))).toBeGreaterThan(0);
    expect(proposals(world('dominant', 'fwb'))).toBeGreaterThan(0);
    expect(proposals(world('assertive', 'sworn'))).toBeGreaterThan(0); // a close state
    for (const style of ['balanced', 'yielding'] as const) expect(proposals(world(style, 'lover')), style).toBe(0);
    for (const stateId of ['friend', 'comrade', 'trusted', 'resentful']) expect(proposals(world('dominant', stateId)), stateId).toBe(0);
    const modest = campaign(reg, 4);
    setRelation(modest, ANN, { stateId: 'lover' });
    expect(proposals(modest)).toBe(0);
  });

  it('romance off and grunts: none', () => {
    const off = world('dominant');
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(proposals(off)).toBe(0);
    const grunt = world('dominant');
    grunt.squad.find((u) => u.id === ANN)!.kind = 'grunt';
    expect(proposals(grunt)).toBe(0);
  });

  it('a dominant unit proposes about one and a half times as often as an assertive one', () => {
    const a = proposals(world('assertive'), 1500);
    const d = proposals(world('dominant'), 1500);
    expect(d / a).toBeGreaterThan(1.2);
    expect(d / a).toBeLessThan(1.9);
    expect(a / 1500).toBeGreaterThan(0.03); // draft chance 5 % a day
    expect(a / 1500).toBeLessThan(0.08);
  });

  it('at most one open proposal and three active rules per unit', () => {
    const open1 = world('dominant');
    rule(open1, 'report_evening', 'proposed');
    expect(proposals(open1)).toBe(0);
    const neg = world('dominant');
    rule(neg, 'report_evening', 'negotiating');
    expect(proposals(neg)).toBe(0);
    const full = world('dominant');
    for (const t of ['report_evening', 'hands_off_gear', 'no_other_tokens']) rule(full, t, 'active');
    expect(proposals(full)).toBe(0);
    const two = world('dominant');
    rule(two, 'report_evening', 'active');
    rule(two, 'hands_off_gear', 'active');
    expect(proposals(two)).toBeGreaterThan(0);
  });

  it('she is never offered a template she already has a rule for', () => {
    const s = world('dominant');
    for (const t of ['report_evening', 'hands_off_gear', 'ask_before_runs', 'no_other_tokens']) rule(s, t, 'suspended');
    for (let seed = 1; seed <= 300; seed++) {
      for (const r of rolled(s, seed).state.bonds!.rules) if (r.status === 'proposed') expect(r.templateId).toBe('name_me_first');
    }
  });

  it('a template whose conditions she does not meet is not offered (minLead, tiers)', () => {
    const r = structuredClone(reg);
    for (const [id, t] of r.relationshipRuleTemplates) {
      if (id !== 'name_me_first') r.relationshipRuleTemplates.delete(id);
      else t.conditions = { minLead: 'dominant', tiers: ['romantic'] };
    }
    expect(proposals(world('assertive'), 300, r)).toBe(0);
    expect(proposals(world('dominant', 'sworn'), 300, r)).toBe(0);
    expect(proposals(world('dominant', 'lover'), 300, r)).toBeGreaterThan(0);
  });

  it('a new proposal is stored undelivered with her name in the text and is not active', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rolled(world('dominant'), seed);
      const made = r.state.bonds?.rules[0];
      if (!made) continue;
      expect(made).toMatchObject({ unitId: ANN, status: 'proposed', brokenCount: 0, day: 10 });
      expect(made.delivered).not.toBe(true);
      expect(ofType(r.events, 'rule_proposed')).toEqual([{ type: 'rule_proposed', ruleId: made.id, unitId: ANN }]);
      return;
    }
    throw new Error('nothing was ever proposed');
  });

  it('the roll draws only while some unit is eligible', () => {
    const s = campaign(reg, 4);
    const d = structuredClone(s);
    const rng = new Rng(seedRng(7));
    const before = rng.state.slice();
    rollRules(d, { registries: reg, rng });
    expect([...rng.state]).toEqual(before);
  });
});

describe('answering and delivering', () => {
  it('a proposal is delivered as a DM from her when she is not in the scene, and in the scene without one', () => {
    const s = world();
    const r = rule(s, 'report_evening', 'proposed');
    const dm = run(s, reg, { type: 'bonds/deliver_rule', payload: { ruleId: r.id, text: ' Report to me every evening. ' } });
    expect(errors(dm.events)).toEqual([]);
    expect(dm.state.bonds!.rules[0]).toMatchObject({ delivered: true, text: 'Report to me every evening.' });
    expect(dm.state.dms[ANN].at(-1)).toMatchObject({ from: ANN, text: 'Report to me every evening.', initiated: true });
    expect(ofType(dm.events, 'rule_delivered')).toEqual([{ type: 'rule_delivered', ruleId: r.id, unitId: ANN, viaDm: true }]);
    const inScene = open(world());
    const r2 = rule(inScene, 'report_evening', 'proposed');
    const live = run(inScene, reg, { type: 'bonds/deliver_rule', payload: { ruleId: r2.id } });
    expect(ofType(live.events, 'rule_delivered')[0]).toMatchObject({ viaDm: false });
    expect(live.state.dms[ANN]).toBeUndefined();
    expect(errors(run(live.state, reg, { type: 'bonds/deliver_rule', payload: { ruleId: r2.id } }).events)).toHaveLength(1); // once
  });

  it('accept activates and applies rule_accepted (Affinity +3)', () => {
    const s = world();
    const r = rule(s, 'report_evening', 'proposed', { delivered: true });
    const aff = s.relations[ANN].affinity;
    const out = run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: r.id, answer: 'accept' } });
    expect(errors(out.events)).toEqual([]);
    expect(out.state.bonds!.rules[0].status).toBe('active');
    expect(activeRules(out.state, ANN)).toHaveLength(1);
    expect(out.state.relations[ANN].affinity).toBe(aff + 3);
    expect(ofType(out.events, 'rule_accepted')).toHaveLength(1);
  });

  it('refuse removes it and applies rule_refused (Trust −1, Affinity −3, stress +3)', () => {
    const s = world();
    const r = rule(s, 'report_evening', 'proposed', { delivered: true });
    const t = s.relations[ANN].trust, a = s.relations[ANN].affinity, st = s.squad.find((u) => u.id === ANN)!.stress;
    const out = run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: r.id, answer: 'refuse' } });
    expect(out.state.bonds!.rules).toEqual([]);
    expect(out.state.relations[ANN].trust).toBe(t - 1);
    expect(out.state.relations[ANN].affinity).toBe(a - 3);
    expect(out.state.squad.find((u) => u.id === ANN)!.stress).toBe(st + 3);
    expect(ofType(out.events, 'rule_refused')).toHaveLength(1);
  });

  it('negotiate makes it negotiating; compromise_reached then sets the agreed text and activates it', () => {
    const s = open(world());
    const r = rule(s, 'report_evening', 'proposed', { delivered: true });
    const n = run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: r.id, answer: 'negotiate' } });
    expect(n.state.bonds!.rules[0].status).toBe('negotiating');
    expect(ofType(n.events, 'rule_negotiating')).toEqual([{ type: 'rule_negotiating', ruleId: r.id, unitId: ANN }]);
    const aff = n.state.relations[ANN].affinity;
    const done = apply(n.state, [ev('compromise_reached', r.id, { text: '  Message me on the evenings you can.\n' })]);
    expect(done.state.bonds!.rules[0]).toMatchObject({ status: 'active', text: 'Message me on the evenings you can.' });
    expect(done.state.relations[ANN].affinity).toBeGreaterThan(aff); // the +2 row of the event
  });

  it('compromise_reached only counts for a rule that is being negotiated; its text is cut to 160 and may not be empty', () => {
    const s = open(world());
    const active = rule(s, 'report_evening', 'active');
    expect(apply(s, [ev('compromise_reached', active.id, { text: 'new' })]).state.bonds!.rules[0].text).toBe(active.text);
    const neg = open(world());
    const r = rule(neg, 'hands_off_gear', 'negotiating');
    expect(apply(neg, [ev('compromise_reached', r.id, { text: 'x'.repeat(400) })]).state.bonds!.rules[0].text).toHaveLength(160);
    const unchanged = apply(neg, [ev('compromise_reached', r.id, { text: '   ' })]).state.bonds!.rules[0];
    expect(unchanged.status).toBe('negotiating');
  });

  it('an open negotiation returns to proposed at the end of the scene', () => {
    const s = open(world());
    const r = rule(s, 'report_evening', 'negotiating', { delivered: true });
    const end = run(s, reg, { type: 'scene/end', payload: {} });
    expect(end.state.bonds!.rules.find((x) => x.id === r.id)!.status).toBe('proposed');
  });

  it('answers are refused for a rule that is not a delivered proposal, and change nothing', () => {
    const s = world();
    const undelivered = rule(s, 'report_evening', 'proposed');
    const active = rule(s, 'hands_off_gear', 'active');
    for (const id of [undelivered.id, active.id, 'nope']) {
      const r = run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: id, answer: 'accept' } });
      expect(errors(r.events), id).toHaveLength(1);
      expect(r.state).toEqual(s);
    }
    expect(errors(run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: undelivered.id, answer: 'maybe' } }).events)).toHaveLength(1);
  });

  it('accepting a fourth rule is refused (three active at most)', () => {
    const s = world();
    for (const t of ['report_evening', 'hands_off_gear', 'no_other_tokens']) rule(s, t, 'active');
    const p = rule(s, 'name_me_first', 'proposed', { delivered: true });
    expect(errors(run(s, reg, { type: 'bonds/answer_rule', payload: { ruleId: p.id, answer: 'accept' } }).events)).toHaveLength(1);
  });
});

describe('keeping and breaking', () => {
  it('rule_kept applies keepDeltas; rule_broken applies breakDeltas, counts and stamps the day', () => {
    const s = open(world());
    const r = rule(s, 'hands_off_gear', 'active');
    const tpl = reg.relationshipRuleTemplates.get('hands_off_gear')!;
    const keep = tpl.keepDeltas as { trust: number; affinity: number };
    const brk = tpl.breakDeltas as { trust: number; affinity: number; stress: number };
    const t0 = s.relations[ANN].trust, a0 = s.relations[ANN].affinity, st0 = s.squad.find((u) => u.id === ANN)!.stress;
    const kept = apply(s, [ev('rule_kept', r.id)]).state;
    expect(kept.relations[ANN].trust).toBe(t0 + keep.trust);
    expect(kept.relations[ANN].affinity).toBe(a0 + keep.affinity);
    expect(kept.bonds!.rules[0].brokenCount).toBe(0);
    const broken = apply(s, [ev('rule_broken', r.id)]).state;
    expect(broken.relations[ANN].trust).toBe(t0 + brk.trust);
    expect(broken.relations[ANN].affinity).toBe(a0 + brk.affinity);
    expect(broken.squad.find((u) => u.id === ANN)!.stress).toBe(st0 + brk.stress);
    expect(broken.bonds!.rules[0]).toMatchObject({ brokenCount: 1, lastBrokenDay: 10 });
    expect(broken.relations[ANN].history.at(-1)).toMatchObject({ type: 'rule_broken' });
  });

  it('events about an unknown, inactive or foreign rule are dropped', () => {
    const s = open(world());
    const proposed = rule(s, 'hands_off_gear', 'proposed');
    const other = rule(s, 'no_other_tokens', 'active', { unitId: BEA });
    for (const id of ['nope', proposed.id, other.id]) {
      const out = apply(s, [ev('rule_broken', id)]);
      expect(out.state.relations[ANN].trust, id).toBe(s.relations[ANN].trust);
      expect(out.state.bonds!.rules.every((r) => r.brokenCount === 0), id).toBe(true);
    }
    const none = validateIntents({ events: [ev('rule_broken', 'nope')] }, { participants: [ANN], squad: [{ id: ANN }], rules: [] });
    expect(none.events).toEqual([]);
    expect(validateIntents({ events: [ev('rule_broken', 'r1')] }, { participants: [ANN], squad: [{ id: ANN }] }).events).toEqual([]);
    expect(validateIntents({ events: [ev('rule_broken', 'r1')] }, { participants: [ANN], squad: [{ id: ANN }], rules: [{ id: 'r1', unitId: ANN }] }).events).toMatchObject([{ type: 'rule_broken', ruleId: 'r1' }]);
  });

  it('a reading below the confidence floor changes nothing (P8 floors)', () => {
    const s = open(world());
    const r = rule(s, 'hands_off_gear', 'active');
    const out = apply(s, [ev('rule_broken', r.id, { confidence: 0.2 })]);
    expect(out.state.bonds!.rules[0].brokenCount).toBe(0);
  });

  it('a break with others present writes a public fact known by those present; alone, none', () => {
    const group = open(world(), [ANN, BEA]);
    const r = rule(group, 'hands_off_gear', 'active');
    const out = apply(group, [ev('rule_broken', r.id)]);
    const fact = out.state.memory.facts.at(-1)!;
    expect(fact.text).toBe(`Ann's rule was broken: ${r.text}.`);
    expect(fact.knownBy.sort()).toEqual([ANN, BEA]);
    expect(fact.tags).toContain('rule');
    const alone = open(world());
    const r2 = rule(alone, 'hands_off_gear', 'active');
    expect(apply(alone, [ev('rule_broken', r2.id)]).state.memory.facts.some((f) => f.tags.includes('rule'))).toBe(false);
  });

  it('an unknown ruleId can never be smuggled in through a fact or a promise', () => {
    const s = open(world());
    expect(errors(apply(s, [ev('rule_broken', 'nope')]).events)).toEqual([]);
  });
});

describe('engine checks', () => {
  const day = (s: CampaignState) => bondsDayStep(s, { registries: reg, rng: new Rng(s.rng) });

  it('daily_contact breaks at day end without a scene or DM with her', () => {
    const s = world();
    const r = rule(s, 'report_evening', 'active');
    const d = structuredClone(s);
    const events = day(d);
    expect(d.bonds!.rules.find((x) => x.id === r.id)).toMatchObject({ brokenCount: 1, lastBrokenDay: 10 });
    expect(ofType(events, 'rule_broken_by_check')).toHaveLength(1);
    expect(d.relations[ANN].trust).toBeLessThan(s.relations[ANN].trust);
  });

  it('a scene or a DM that day keeps it', () => {
    const scened = world();
    const r = rule(scened, 'report_evening', 'active');
    const after = open(scened);
    const d = structuredClone(after);
    day(d);
    expect(d.bonds!.rules.find((x) => x.id === r.id)!.brokenCount).toBe(0);
    const dmed = world();
    const r2 = rule(dmed, 'report_evening', 'active');
    const sent = run(dmed, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'Reporting in.' } }).state;
    const e = structuredClone(sent);
    day(e);
    expect(e.bonds!.rules.find((x) => x.id === r2.id)!.brokenCount).toBe(0);
  });

  it('an old contact does not count, a suspended rule is not checked and a rule is not broken twice in a day', () => {
    const s = world();
    s.relations[ANN].contactDay = 9;
    const r = rule(s, 'report_evening', 'active');
    const d = structuredClone(s);
    day(d);
    day(d);
    expect(d.bonds!.rules.find((x) => x.id === r.id)!.brokenCount).toBe(1); // lastBrokenDay stops the second
    const susp = world();
    rule(susp, 'report_evening', 'suspended');
    const e = structuredClone(susp);
    day(e);
    expect(e.bonds!.rules[0].brokenCount).toBe(0);
  });

  it('the real day end runs the check', () => {
    const s = world();
    rule(s, 'report_evening', 'active');
    s.settings.intimacy = { romance: true, initiative: 'med' };
    const after = endDay(s, reg);
    expect(after.bonds!.rules[0].brokenCount).toBeGreaterThanOrEqual(1);
  });

  it('run_without_asking breaks when a rival romantic partner goes on a run without her', () => {
    const base = world();
    setRelation(base, BEA, { stateId: 'lover' });
    base.roster.activeIds = [ANN, BEA, CAT, 'unit_dee'];
    const r = rule(base, 'ask_before_runs', 'active');
    const { state, mission } = withMission(reg, base);
    const without = depart(reg, state, mission.id, { unitIds: [BEA, CAT, 'unit_dee'] });
    expect(without.bonds!.rules.find((x) => x.id === r.id)).toMatchObject({ brokenCount: 1 });
    // she is in the party: nothing; a party with no other romantic partner: nothing
    const withHer = depart(reg, state, mission.id, { unitIds: [ANN, BEA, CAT, 'unit_dee'] });
    expect(withHer.bonds!.rules.find((x) => x.id === r.id)!.brokenCount).toBe(0);
    const noRival = depart(reg, state, mission.id, { unitIds: [CAT, 'unit_dee'] });
    expect(noRival.bonds!.rules.find((x) => x.id === r.id)!.brokenCount).toBe(0);
  });

  it('a run break is witnessed by the whole party', () => {
    const base = world();
    setRelation(base, BEA, { stateId: 'lover' });
    rule(base, 'ask_before_runs', 'active');
    const { state, mission } = withMission(reg, base);
    const out = depart(reg, state, mission.id, { unitIds: [BEA, CAT, 'unit_dee'] });
    const fact = out.memory.facts.find((f) => f.tags.includes('rule'))!;
    expect(fact.knownBy.sort()).toEqual([ANN, BEA, CAT, 'unit_dee']); // the party saw it, and it is her rule
  });
});

describe('content categories and rules (Review Focus 3)', () => {
  const tagged = (): Registries => {
    const r = structuredClone(reg);
    r.relationshipRuleTemplates.get('report_evening')!.contentTags = ['restraint'];
    return r;
  };

  it('a rule tagged with a disabled category is never proposed', () => {
    const r = tagged();
    for (const [id] of r.relationshipRuleTemplates) if (id !== 'report_evening') r.relationshipRuleTemplates.delete(id);
    expect(proposals(world('dominant'), 200, r)).toBe(0);
    expect(proposals(enable(world('dominant'), 'restraint'), 200, r)).toBeGreaterThan(0);
    const limited = enable(world('dominant'), 'restraint');
    withBond(limited, ANN, { leadStyle: 'dominant', ownLimits: { categories: ['restraint'] } });
    expect(proposals(limited, 200, r)).toBe(0);
  });

  it('disabling withdraws a proposal and suspends an active rule; re-enabling brings it back', () => {
    const r = tagged();
    const s = enable(world(), 'restraint');
    const act = rule(s, 'report_evening', 'active');
    const prop = rule(s, 'report_evening', 'proposed', { delivered: true, unitId: BEA });
    const plain = rule(s, 'hands_off_gear', 'active');
    const off = run(s, r, { type: 'content/set_categories', payload: { enabled: [] } });
    const byId = (st: CampaignState, id: string) => st.bonds!.rules.find((x) => x.id === id);
    expect(byId(off.state, act.id)!.status).toBe('suspended');
    expect(byId(off.state, prop.id)).toBeUndefined();
    expect(byId(off.state, plain.id)!.status).toBe('active');
    expect(activeRules(off.state, ANN).map((x) => x.id)).toEqual([plain.id]);
    expect(off.state.relations[ANN]).toEqual(s.relations[ANN]); // no deltas
    const on = run(off.state, r, { type: 'content/set_categories', payload: { enabled: ['restraint'] } });
    expect(byId(on.state, act.id)!.status).toBe('active');
  });

  it('a suspended rule is neither checked nor broken, and a rule that was never active does not come back', () => {
    const r = tagged();
    const s = enable(world(), 'restraint');
    const act = rule(s, 'report_evening', 'active');
    const off = run(s, r, { type: 'content/set_categories', payload: { enabled: [] } }).state;
    const d = structuredClone(off);
    bondsDayStep(d, { registries: r, rng: new Rng(d.rng) });
    expect(d.bonds!.rules.find((x) => x.id === act.id)!.brokenCount).toBe(0);
  });
});

describe('proposals the app never delivered', () => {
  it('the next day step delivers the template text, but never on the day it was proposed', () => {
    const s = world();
    const r = rule(s, 'report_evening', 'proposed');
    r.day = 10;
    const same = structuredClone(s);
    bondsDayStep(same, { registries: reg, rng: new Rng(same.rng) });
    expect(same.bonds!.rules.find((x) => x.id === r.id)!.delivered).not.toBe(true);
    const later = { ...structuredClone(s), day: 11 };
    const events = bondsDayStep(later, { registries: reg, rng: new Rng(later.rng) });
    expect(later.bonds!.rules.find((x) => x.id === r.id)).toMatchObject({ delivered: true });
    expect(ofType(events, 'rule_delivered')).toHaveLength(1);
    expect(later.dms[ANN].at(-1)!.text).toBe(r.text);
  });
});
