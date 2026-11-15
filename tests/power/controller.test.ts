import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState, Vote } from '../../src/engine/state/types';
import { sanitizeBallotFlavor } from '../../src/llm/calls/flavor';
import { createPower, type PowerDeps, type VoteChoice } from '../../src/power/controller';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';
import { upkeepNeeded } from '../../src/engine/economy';
import { withOptions } from '../helpers/power';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

/** Voting on and neutral units. `fail` makes every unit oppose a workshop upgrade (pragmatism −3). */
function stateWith(o: { voting?: boolean; fail?: boolean; shortBy?: number } = {}): CampaignState {
  const s = campaign(reg, 4);
  s.commander.socialStats.authority = 1;
  s.resources.credits = 1000;
  s.resources.plyx = 1000;
  for (const u of s.squad) {
    u.values = { ...ZERO, ...(o.fail ? { pragmatism: -3 } : {}) };
    setRelation(s, u.id, { trust: 50 });
  }
  if (o.voting !== false) withOptions(s, { voting: 'on' });
  if (o.shortBy !== undefined) s.resources.supplies = upkeepNeeded(s, reg).needed - o.shortBy;
  return s;
}
interface Rig {
  h: WorldHarness;
  power: ReturnType<typeof createPower>;
  shown: Array<{ vote: Vote; lines: Record<string, string> }>;
  refresh: ReturnType<typeof vi.fn>;
  answer: { next: VoteChoice | ((vote: Vote) => VoteChoice | Promise<VoteChoice>) };
}
function rig(state: CampaignState, over: Partial<typeof DEFAULT_SETTINGS> = {}): Rig {
  const h = worldHarness(reg, state, over);
  const shown: Rig['shown'] = [];
  const answer: Rig['answer'] = { next: { choice: 'carry' } };
  const refresh = vi.fn();
  const deps: PowerDeps = {
    ...h.deps, context: { setDirective() {}, clearMatching() {} } as never, refreshContext: refresh,
    showVote: async (vote, lines) => {
      shown.push({ vote: structuredClone(vote), lines });
      return typeof answer.next === 'function' ? answer.next(vote) : answer.next;
    },
  };
  return { h, power: createPower(deps), shown, refresh, answer };
}
const upgrade = { type: 'base/upgrade', payload: { facilityId: 'workshop' } };
const rations = (mode: string) => ({ type: 'rations/set', payload: { mode } });

describe('requestVote', () => {
  it('runs an ungated action directly', async () => {
    const r = rig(stateWith({ voting: false }));
    expect(await r.power.requestVote(rations('fighters_first'))).toBe('ran');
    expect(r.shown).toEqual([]);
    expect(r.h.state().base.rations).toBe('fighters_first');
    expect(r.h.log.map((a) => a.type)).toEqual(['rations/set']);
  });

  it('on vote_needed it opens the vote, shows the panel and, on carry, re-dispatches with the voteId', async () => {
    const r = rig(stateWith({ shortBy: 2 }));
    expect(await r.power.requestVote(rations('fighters_first'))).toBe('ran');
    expect(r.h.log.map((a) => a.type)).toEqual(['rations/set', 'vote/open', 'rations/set']);
    expect(r.h.log[2].payload).toEqual({ mode: 'fighters_first', voteId: 'v1' });
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0].vote).toMatchObject({ kind: 'rations', subject: 'fighters_first', status: 'passed' });
    expect(Object.keys(r.shown[0].lines).sort()).toEqual([ANN, BEA, CAT, DEE].sort());
    expect(r.h.state().base.rations).toBe('fighters_first');
    expect(r.h.state().power!.votes.log).toEqual([expect.objectContaining({ id: 'v1', result: 'carried' })]);
    expect(r.refresh).toHaveBeenCalled();
  });

  it('a failed vote the commander accepts is dropped and nothing runs', async () => {
    const r = rig(stateWith({ fail: true }));
    r.answer.next = { choice: 'accept' };
    expect(await r.power.requestVote(upgrade)).toBe('dropped');
    expect(r.shown[0].vote).toMatchObject({ status: 'failed', passed: false });
    expect(r.h.state().power!.votes.open).toBeUndefined();
    expect(r.h.state().power!.votes.log.at(-1)).toMatchObject({ result: 'dropped' });
    expect(r.h.state().base.upgrades).toBeUndefined();
  });

  it('overrule by an order costs and then re-dispatches the action with the voteId', async () => {
    const r = rig(stateWith({ fail: true }));
    r.answer.next = { choice: 'overrule', means: 'order' };
    expect(await r.power.requestVote(upgrade)).toBe('ran');
    expect(r.h.log.map((a) => a.type)).toEqual(['base/upgrade', 'vote/open', 'vote/overrule', 'base/upgrade']);
    expect(r.h.state().base.upgrades).toEqual([expect.objectContaining({ facilityId: 'workshop' })]);
    expect(r.h.state().power!.votes.log.at(-1)).toMatchObject({ result: 'overruled' });
    expect(r.h.state().power!.grudges![ANN]).toBe(r.h.state().day);
  });

  it('an overrule the engine refuses is toasted and the vote stays open', async () => {
    const r = rig(stateWith({ fail: true }));
    r.h.setState((s) => { s.leash.authorizationsLeft = 0; });
    r.answer.next = { choice: 'overrule', means: 'leash' };
    expect(await r.power.requestVote(upgrade)).toBe('cancelled');
    expect(r.h.toasts.some((t) => t.kind === 'error' && /authorization/i.test(t.text))).toBe(true);
    expect(r.h.state().base.upgrades).toBeUndefined();
    expect(r.h.state().power!.votes.open).toBeUndefined(); // the failed attempt is dropped, nothing is left half done
  });

  it('cancel drops the vote', async () => {
    const r = rig(stateWith({ fail: true }));
    r.answer.next = { choice: 'cancel' };
    expect(await r.power.requestVote(upgrade)).toBe('cancelled');
    expect(r.h.state().power!.votes.open).toBeUndefined();
    expect(r.h.state().power!.votes.log.at(-1)).toMatchObject({ result: 'dropped' });
  });

  it('a chat that changed while the panel was open runs nothing', async () => {
    const r = rig(stateWith({ shortBy: 2 }));
    r.answer.next = async () => { r.h.switchChat('other'); return { choice: 'carry' }; };
    expect(await r.power.requestVote(rations('fighters_first'))).toBe('cancelled');
    expect(r.h.state().base.rations).toBeUndefined();
  });

  it('another refusal of the action is toasted and nothing opens', async () => {
    const r = rig(stateWith({ voting: false }));
    expect(await r.power.requestVote(rations('feast'))).toBe('cancelled');
    expect(r.h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(r.shown).toEqual([]);
  });

  it('drop and overrule on their own go through the engine and toast a refusal', () => {
    const r = rig(stateWith({ fail: true }));
    r.h.app().dispatch({ type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    expect(r.power.overrule('v1', 'order')).toBe(true);
    expect(r.power.drop('v99')).toBe(false);
    expect(r.h.toasts.at(-1)!.kind).toBe('error');
  });
});

describe('onEvents', () => {
  it('refreshes the context when a grudge starts or ends, and for nothing else', () => {
    const r = rig(stateWith());
    r.power.onEvents([{ type: 'relation_changed' }, { type: 'vote_opened' }]);
    expect(r.refresh).not.toHaveBeenCalled();
    r.power.onEvents([{ type: 'vote_overruled', voteId: 'v1' }]);
    expect(r.refresh).toHaveBeenCalledTimes(1);
    r.power.onEvents([{ type: 'grudges_ended', unitIds: [ANN] }]);
    expect(r.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('ballot lines', () => {
  const vote = (s: CampaignState): Vote => {
    const r = rig(s);
    r.h.app().dispatch({ type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    return r.h.state().power!.votes.open!;
  };

  it('are the templates of the vote kind with the name filled in, and nothing is called, while the setting is off', async () => {
    const s = stateWith({ fail: true });
    const r = rig(s);
    r.h.app().dispatch({ type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    const v = r.h.state().power!.votes.open!;
    const lines = await r.power.ballotLines(v);
    expect(Object.keys(lines).sort()).toEqual([ANN, BEA, CAT, DEE].sort());
    for (const text of Object.values(lines)) {
      expect(text).not.toMatch(/[{}]/);
      expect(text.length).toBeLessThanOrEqual(120);
    }
    expect(lines[ANN]).toContain('Ann');
    expect(r.h.st.calls).toEqual([]);
    expect(vote(stateWith()).ballots).toHaveLength(4);
  });

  it('use the flavor call when the setting is on, and fall back to the template per name when it fails or answers badly', async () => {
    const s = stateWith({ fail: true });
    const r = rig(s, { ballotWording: true });
    r.h.app().dispatch({ type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    const v = r.h.state().power!.votes.open!;
    const template = (await rig(s).power.ballotLines(v));
    r.h.st.mainReplies = ['{"lines":[{"name":"Ann","line":"Ann says the workshop can wait."},{"name":"Ghost","line":"Nobody asked."},{"name":"Bea","line":"<b>x</b> ok"}]}'];
    const lines = await r.power.ballotLines(v);
    expect(r.h.st.calls).toHaveLength(1);
    expect((r.h.st.calls[0].system ?? '') + r.h.st.calls[0].prompt).toContain('<vote>');
    expect(lines[ANN]).toBe('Ann says the workshop can wait.');
    expect(lines[BEA]).toBe('x ok'); // markup stripped
    expect(lines[CAT]).toBe(template[CAT]);
    expect(Object.keys(lines)).not.toContain('Ghost');
    // a failing call
    const failing = rig(s, { ballotWording: true });
    failing.h.app().dispatch({ type: 'vote/open', payload: { kind: 'upgrade', subject: 'workshop' } });
    failing.h.st.mainReplies = [];
    expect(await failing.power.ballotLines(failing.h.state().power!.votes.open!)).toEqual(template);
  });

  it('sanitizeBallotFlavor keeps only known names, plain text of at most 120 characters', () => {
    const out = sanitizeBallotFlavor({ lines: [{ name: 'Ann', line: ` ${'x'.repeat(200)} ` }, { name: 'Zed', line: 'no' }, { name: 'Bea' }, 7, { name: 'Cat', line: '' }] }, ['Ann', 'Bea', 'Cat']);
    expect(Object.keys(out)).toEqual(['Ann']);
    expect(out.Ann).toHaveLength(120);
    expect(sanitizeBallotFlavor('nope', ['Ann'])).toEqual({});
    expect(sanitizeBallotFlavor(null, ['Ann'])).toEqual({});
  });
});
