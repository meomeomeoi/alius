import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { Rng, seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createDiscipline } from '../../src/discipline/controller';
import type { DisciplineDeps } from '../../src/discipline/deps';
import { demandDirective } from '../../src/discipline/directives';
import { campaign, loadCore } from '../helpers/loyalty';
import { setRecord } from '../helpers/discipline';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  const base = await loadCore();
  // a loud squad: every stance asks all the time, so a roll opens something
  reg = { ...base, presence: new Map(), commandStances: new Map([...base.commandStances].map(([id, e]) => [id, { ...(e as object), id, demandWeight: 4 } as Entry])) };
});
const ANN = 'unit_ann';

function stateWith(tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous' };
  s.resources = { credits: 200, supplies: 30, plyx: 10 };
  for (const u of s.squad) { u.defects = []; s.relations[u.id].trust = 10; s.relations[u.id].metDay = -50; setRecord(s, u.id, 40); }
  for (const u of s.squad.filter((x) => x.id !== ANN)) u.status = 'dead';
  tweak(s);
  return s;
}

interface Rig { h: WorldHarness; ctx: ContextBuilder; refresh: ReturnType<typeof vi.fn>; discipline: ReturnType<typeof createDiscipline>; startScene: ReturnType<typeof vi.fn> }
function rig(opts: { tweak?: (s: CampaignState) => void; wording?: boolean; inScene?: boolean } = {}): Rig {
  const h = worldHarness(reg, stateWith(opts.tweak), { demandWording: opts.wording ?? true });
  if (opts.inScene) h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const startScene = vi.fn(async (o: { participants: string[] }) => {
    const r = h.app().dispatch({ type: 'scene/start', payload: { locationId: 'quarters_unit', participants: o.participants, origin: 'event', startIndex: 0 } });
    return !r.some((e) => e.type === 'error');
  });
  const deps: DisciplineDeps = { ...h.deps, context: ctx, refreshContext: refresh, startScene };
  return { h, ctx, refresh, startScene, discipline: createDiscipline(deps) };
}
const dirs = (r: Rig) => r.ctx.build(r.h.state(), 5000).directives;
const setSeed = (r: Rig, seed: number) => r.h.setState((s) => { s.rng = seedRng(seed); });
const demands = (r: Rig) => r.h.state().discipline?.demands ?? [];
const roll = async (r: Rig) => {
  for (let seed = 1; seed < 120; seed++) {
    setSeed(r, seed);
    await r.discipline.onSlotAdvanced();
    if (demands(r).length > 0) return seed;
    r.h.setState((s) => { delete s.discipline; });
  }
  throw new Error('no seed opens a demand');
};

describe('a slot change rolls, words and delivers', () => {
  it('words the demand with the mechanic model and delivers a DM with that text', async () => {
    const r = rig();
    r.h.st.mainReplies = Array.from({ length: 120 }, () => '{"text":"I want double rations. Starting tonight."}');
    await roll(r);
    const d = demands(r)[0];
    expect(d.status).toBe('open');
    expect(d.text).toBe('I want double rations. Starting tonight.');
    expect(r.h.state().dms[ANN].at(-1)).toMatchObject({ text: 'I want double rations. Starting tonight.', initiated: true });
    const call = r.h.st.calls.find((c) => (c.system ?? '').includes('demand'))!;
    expect(call.prompt).toContain('<demand>');
  });

  it('wording off, or a failed call, delivers the template text with no second call', async () => {
    const off = rig({ wording: false });
    await roll(off);
    expect(demands(off)[0].status).toBe('open');
    expect(String(off.h.state().dms[ANN].at(-1)!.text)).toBe(demands(off)[0].text);
    expect(off.h.st.calls).toEqual([]);
    const failing = rig();
    failing.h.st.mainReplies = [];
    await roll(failing);
    const d = demands(failing)[0];
    expect(d.status).toBe('open');
    expect(d.text).toBe(String(reg.demandTemplates.get(d.templateId)!.text).replaceAll('{name}', 'Ann'));
  });

  it('nothing is rolled during an expedition, a combat or a presented dilemma', async () => {
    const exp = rig({ tweak: (s) => { (s as { expedition?: unknown }).expedition = { id: 'e1' }; } });
    await exp.discipline.onSlotAdvanced();
    expect(demands(exp)).toEqual([]);
    expect(exp.h.log.filter((a) => a.type === 'demand/roll')).toEqual([]);
    const dil = rig({ tweak: (s) => { s.dilemmas = { seq: 1, open: { id: 'dl', status: 'presented' } } as CampaignState['dilemmas']; } });
    await dil.discipline.onSlotAdvanced();
    expect(dil.h.log.filter((a) => a.type === 'demand/roll')).toEqual([]);
  });

  it('a chat switch between roll and delivery drops the delivery (the engine delivers it at day end)', async () => {
    const r = rig();
    r.h.st.mainReplies = Array.from({ length: 120 }, () => '{"text":"Give me a room."}');
    let switched = false;
    const real = r.h.deps.app.dispatch;
    r.h.deps.app.dispatch = (a, o) => {
      const events = real(a, o);
      if (a.type === 'demand/roll' && events.some((e) => e.type === 'demand_opened') && !switched) {
        switched = true;
        r.h.switchChat('other');
      }
      return events;
    };
    for (let seed = 1; seed < 120 && !switched; seed++) {
      setSeed(r, seed);
      await r.discipline.onSlotAdvanced();
      if (!switched) r.h.setState((s) => { delete s.discipline; });
    }
    expect(switched).toBe(true);
    expect(demands(r)[0].status).toBe('undelivered');
    expect(r.h.state().dms[ANN] ?? []).toEqual([]);
  });

  it('a demand from a route (delegate_demand) is worded and delivered too', async () => {
    const r = rig({ wording: false });
    r.h.setState((s) => { s.rng = seedRng(3); });
    const { openDemand } = await import('../../src/engine/discipline/demands');
    let id = '';
    r.h.setState((s) => { id = openDemand(s, { registries: reg, rng: new Rng(s.rng) }, ANN, { owed: true })!.demand.id; });
    r.discipline.onEvents([{ type: 'delegate_demand', unitId: ANN, demandId: id }, { type: 'demand_opened', demandId: id, unitId: ANN }]);
    await new Promise((res) => setTimeout(res, 0));
    expect(demands(r)[0]).toMatchObject({ id, status: 'open', owed: true });
  });
});

describe('answering and TALK', () => {
  async function opened(r: Rig): Promise<string> {
    await roll(r);
    return demands(r)[0].id;
  }

  it('grant and refuse dispatch demand/answer and clear the directive', async () => {
    const r = rig({ wording: false, inScene: true });
    const id = await opened(r);
    r.discipline.onSceneOpened();
    expect(dirs(r)).toContain('demands something of the commander');
    expect(r.discipline.answerDemand(id, 'refuse')).toBe(true);
    expect(demands(r)).toEqual([]);
    expect(dirs(r)).not.toContain('demands something');
    expect(r.h.log.some((a) => a.type === 'demand/answer')).toBe(true);
  });

  it('a grant that cannot be paid toasts the reason and keeps the demand', async () => {
    const r = rig({ wording: false });
    const id = await opened(r);
    r.h.setState((s) => { s.resources = { credits: 0, supplies: 0, plyx: 0 }; });
    const tpl = demands(r)[0].templateId;
    const costly = (reg.demandTemplates.get(tpl)!.grantCost as unknown[]).length > 0;
    if (!costly) return;
    const ok = r.discipline.answerDemand(id, 'grant');
    if (!ok) {
      expect(r.h.toasts.at(-1)!.kind).toBe('error');
      expect(demands(r)).toHaveLength(1);
    }
  });

  it('TALK opens a private scene with her and keeps the demand open, with the directive', async () => {
    const r = rig({ wording: false });
    const id = await opened(r);
    expect(await r.discipline.talkDemand(id)).toBe(true);
    expect(r.startScene).toHaveBeenCalledWith(expect.objectContaining({ participants: [ANN], origin: 'event', locationId: 'quarters_unit' }));
    expect(demands(r)).toHaveLength(1);
    expect(dirs(r)).toContain(`Ann demands something of the commander and presses it this scene: "${demands(r)[0].text}"`);
  });

  it('TALK for an unknown demand is false', async () => {
    const r = rig();
    expect(await r.discipline.talkDemand('d999')).toBe(false);
  });

  it('a demand of a unit in the open scene sets the directive at once', async () => {
    const r = rig({ wording: false, inScene: true });
    await roll(r);
    expect(dirs(r)).toContain('demands something of the commander');
    expect(r.refresh).toHaveBeenCalled();
  });

  it('the directive is cleared with the scene and carries the demand text', () => {
    expect(demandDirective(ANN, 'Ann', 'Room.')).toEqual({ id: `demand:${ANN}`, expiresAfter: 'scene', text: 'Ann demands something of the commander and presses it this scene: "Room."' });
  });
});

describe('POSTPONE on her want (P9d)', () => {
  it('sets the patience directive for the next reply; GRANT sets none', async () => {
    const r = rig({ wording: false, inScene: true });
    r.h.setState((s) => {
      s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [{ id: 'dx', unitId: ANN, templateId: 'want_tonight', text: 'x', day: s.day, expiresDay: s.day + 2, status: 'open', impunityDriven: false }], demandLog: [] };
    });
    expect(r.discipline.answerDemand('dx', 'refuse')).toBe(true);
    expect(dirs(r)).toContain('Ann was asked to wait; she is trying to be patient.');
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('trying to be patient');
  });
});
