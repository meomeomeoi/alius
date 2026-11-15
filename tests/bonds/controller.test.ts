import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { rollRules } from '../../src/engine/bonds';
import { ContextBuilder } from '../../src/llm/context';
import { bondsDirectives } from '../../src/bonds/directives';
import { createBonds, type BondsDeps } from '../../src/bonds/controller';
import { sanitizeRuleFlavor } from '../../src/llm/calls/flavor';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';
import { withBond } from '../helpers/bonds';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';

function stateWith(tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 10;
  for (const u of s.squad) u.defects = [];
  setRelation(s, ANN, { stateId: 'lover' });
  withBond(s, ANN, { leadStyle: 'dominant' });
  tweak(s);
  return s;
}
interface Rig { h: WorldHarness; ctx: ContextBuilder; refresh: ReturnType<typeof vi.fn>; startScene: ReturnType<typeof vi.fn>; bonds: ReturnType<typeof createBonds> }
function rig(opts: { wording?: boolean; inScene?: boolean; tweak?: (s: CampaignState) => void } = {}): Rig {
  const h = worldHarness(reg, stateWith(opts.tweak), { ruleWording: opts.wording ?? true });
  if (opts.inScene) h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  const ctx = new ContextBuilder();
  const refresh = vi.fn(() => bondsDirectives(ctx, h.state(), reg));
  const startScene = vi.fn(async (o: { participants: string[] }) => {
    const r = h.app().dispatch({ type: 'scene/start', payload: { locationId: 'quarters_unit', participants: o.participants, origin: 'event', startIndex: 0 } });
    return !r.some((e) => e.type === 'error');
  });
  const deps: BondsDeps = { ...h.deps, context: ctx, refreshContext: refresh, startScene };
  return { h, ctx, refresh, startScene, bonds: createBonds(deps) };
}
const dirs = (r: Rig) => r.ctx.build(r.h.state(), 5000).directives;
const rules = (r: Rig) => r.h.state().bonds?.rules ?? [];
/** Rolls until a proposal exists; returns its events. */
function propose(r: Rig): unknown[] {
  for (let seed = 1; seed < 400; seed++) {
    const events: unknown[] = [];
    r.h.setState((s) => {
      const d = structuredClone(s);
      events.push(...rollRules(d, { registries: reg, rng: new Rng(seedRng(seed)) }));
      Object.keys(s).forEach((k) => delete (s as never as Record<string, unknown>)[k]);
      Object.assign(s, d);
    });
    if (rules(r).length > 0) return events;
  }
  throw new Error('nothing was proposed');
}
const flush = () => new Promise((res) => setTimeout(res, 0));

describe('a proposed rule is worded and delivered', () => {
  it('words it once with the mechanic model and delivers it as a DM when she is not in the scene', async () => {
    const r = rig();
    r.h.st.mainReplies = ['{"text":"Check in with me when the day is done."}'];
    const events = propose(r);
    r.bonds.onEvents(events as never);
    await flush();
    const rule = rules(r)[0];
    expect(rule).toMatchObject({ status: 'proposed', delivered: true, text: 'Check in with me when the day is done.' });
    expect(r.h.state().dms[ANN].at(-1)).toMatchObject({ text: 'Check in with me when the day is done.', initiated: true });
    expect(r.h.st.calls).toHaveLength(1);
    const call = r.h.st.calls[0];
    expect((call.system ?? '') + call.prompt).toContain('<rule>');
    r.bonds.onEvents(events as never); // a second reading of the same event does not word it again
    await flush();
    expect(r.h.st.calls).toHaveLength(1);
  });

  it('in the scene she says it there: no DM', async () => {
    const r = rig({ inScene: true });
    r.h.st.mainReplies = ['{"text":"Report to me."}'];
    r.bonds.onEvents(propose(r) as never);
    await flush();
    expect(rules(r)[0].delivered).toBe(true);
    expect(r.h.state().dms[ANN] ?? []).toEqual([]);
  });

  it('the template text is used when wording fails or is off', async () => {
    const failing = rig();
    failing.h.st.mainReplies = [];
    failing.bonds.onEvents(propose(failing) as never);
    await flush();
    const rule = rules(failing)[0];
    expect(rule.delivered).toBe(true);
    expect(rule.text).toBe(String(reg.relationshipRuleTemplates.get(rule.templateId)!.text));
    const off = rig({ wording: false });
    off.bonds.onEvents(propose(off) as never);
    await flush();
    expect(rules(off)[0].delivered).toBe(true);
    expect(off.h.st.calls).toEqual([]);
  });

  it('a chat switch while the model words it drops the delivery (the day step delivers the template text)', async () => {
    const r = rig();
    r.h.st.mainReplies = ['{"text":"Check in."}'];
    const real = r.h.st.generateMain.bind(r.h.st);
    r.h.st.generateMain = async (req) => {
      r.h.switchChat('other');
      return real(req);
    };
    r.bonds.onEvents(propose(r) as never);
    await flush();
    expect(rules(r)[0].delivered).not.toBe(true);
  });

  it('wording is plain text of at most 160 characters; markup and empty answers fail soft', () => {
    expect(sanitizeRuleFlavor({ text: '<b>Report</b>\n to   me.' })).toEqual({ text: 'Report to me.' });
    expect(sanitizeRuleFlavor({ text: 'x'.repeat(500) })!.text).toHaveLength(160);
    for (const bad of [null, 'text', [], {}, { text: 5 }, { text: '  ' }, { text: '<i></i>' }]) expect(sanitizeRuleFlavor(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('answering', () => {
  async function delivered(r: Rig): Promise<string> {
    r.bonds.onEvents(propose(r) as never);
    await flush();
    return rules(r)[0].id;
  }

  it('accept and refuse dispatch bonds/answer_rule', async () => {
    const r = rig({ wording: false });
    const id = await delivered(r);
    expect(r.bonds.answerRule(id, 'accept')).toBe(true);
    expect(rules(r)[0].status).toBe('active');
    const r2 = rig({ wording: false });
    const id2 = await delivered(r2);
    expect(r2.bonds.answerRule(id2, 'refuse')).toBe(true);
    expect(rules(r2)).toEqual([]);
  });

  it('negotiate opens a scene with her and sets the rule directive for it', async () => {
    const r = rig({ wording: false });
    const id = await delivered(r);
    expect(await r.bonds.negotiateRule(id)).toBe(true);
    expect(r.startScene).toHaveBeenCalledWith(expect.objectContaining({ participants: [ANN], origin: 'event', locationId: 'quarters_unit' }));
    expect(rules(r)[0].status).toBe('negotiating');
    r.refresh();
    expect(dirs(r)).toContain('proposed a rule');
    expect(dirs(r)).toContain(rules(r)[0].text);
  });

  it('a refused answer toasts the reason and keeps the proposal', async () => {
    const r = rig({ wording: false });
    expect(r.bonds.answerRule('nope', 'accept')).toBe(false);
    expect(r.h.toasts.at(-1)!.kind).toBe('error');
  });
});

describe('the rule directive follows the state', () => {
  const sceneState = (status: 'proposed' | 'negotiating', delivered = true) => stateWith((s) => {
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report to me every evening.', status, day: 10, brokenCount: 0, delivered }] };
    s.scene = { id: 's1', day: 10, slot: 'morning', locationId: 'mess_hall', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, exchanges: 0 };
  });
  const read = (s: CampaignState) => {
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    return b.build(s, 5000).directives;
  };

  it('a delivered proposal is pressed in the scene; a negotiation is negotiated', () => {
    expect(read(sceneState('proposed'))).toContain('Ann has proposed a rule and presses it this scene: "Report to me every evening."');
    expect(read(sceneState('negotiating'))).toContain('Ann proposed a rule: "Report to me every evening." She and the commander negotiate it now');
  });

  it('nothing for an undelivered proposal, an active rule, or a unit who is not present', () => {
    expect(read(sceneState('proposed', false))).not.toContain('proposed a rule');
    const active = sceneState('proposed');
    active.bonds!.rules[0].status = 'active';
    expect(read(active)).not.toContain('proposed a rule');
    const away = sceneState('negotiating');
    away.scene!.participants = ['unit_bea'];
    expect(read(away)).not.toContain('proposed a rule');
  });

  it('has no commander pronoun', () => {
    expect(read(sceneState('negotiating'))).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
