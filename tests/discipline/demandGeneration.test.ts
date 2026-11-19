import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createDiscipline } from '../../src/discipline/controller';
import { campaign, loadCore } from '../helpers/loyalty';
import { setRecord } from '../helpers/discipline';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  const base = await loadCore();
  reg = { ...base, presence: new Map(), commandStances: new Map([...base.commandStances].map(([id, e]) => [id, { ...(e as object), id, demandWeight: 4 } as Entry])) };
});
const ANN = 'unit_ann';

function rig() {
  const s = campaign(reg, 4);
  s.day = 20;
  s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous' };
  s.resources = { credits: 200, supplies: 30, plyx: 10 };
  for (const u of s.squad) { u.defects = []; s.relations[u.id].trust = 10; s.relations[u.id].metDay = -50; setRecord(s, u.id, 40); }
  for (const u of s.squad.filter((x) => x.id !== ANN)) u.status = 'dead';
  const h = worldHarness(reg, s, { demandWording: true, autoRetry: 0 });
  const discipline = createDiscipline({ ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), startScene: vi.fn(async () => true) });
  return { h, discipline };
}
const demands = (h: WorldHarness) => h.state().discipline?.demands ?? [];
const records = (h: WorldHarness) => h.state().generations?.records ?? [];
/** A demand delivered with the template text (the model fails). */
async function delivered(): Promise<ReturnType<typeof rig>> {
  const r = rig();
  for (let seed = 1; seed < 120; seed++) {
    r.h.setState((s) => { s.rng = seedRng(seed); });
    await r.discipline.onSlotAdvanced();
    if (demands(r.h).length > 0) return r;
    r.h.setState((s) => { delete s.discipline; });
  }
  throw new Error('no seed opens a demand');
}

describe('flavor.demand', () => {
  it('a failed demand wording delivers the template and leaves a quiet record', async () => {
    const r = await delivered();
    const d = demands(r.h)[0];
    expect(d.status).toBe('open');
    expect(d.text.length).toBeGreaterThan(0);
    expect(r.h.state().dms[ANN].at(-1)).toMatchObject({ text: d.text, initiated: true });
    expect(records(r.h)).toMatchObject([{ siteId: 'flavor.demand', key: d.id, quiet: true, fallbackApplied: true, status: 'open' }]);
    expect(r.h.toasts).toEqual([]);
  });

  it('RETRY rewords it before an answer, in the demand and in the message that carried it', async () => {
    const r = await delivered();
    const d = demands(r.h)[0];
    r.h.st.mainReplies = ['{"text":"Double rations. Tonight."}'];
    expect((await r.h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(demands(r.h)[0].text).toBe('Double rations. Tonight.');
    expect(r.h.state().dms[ANN].find((m) => m.id === d.dmId)!.text).toBe('Double rations. Tonight.');
    expect(records(r.h)).toEqual([]);
  });

  it('REROLL rewords a delivered demand; after the answer it is refused', async () => {
    const r = await delivered();
    const d = demands(r.h)[0];
    expect(r.h.deps.generations.rerollState('flavor.demand', d.id)).toEqual({ enabled: true });
    r.h.st.mainReplies = ['{"text":"Another way of asking."}'];
    await r.discipline.reword(d.id);
    expect(demands(r.h)[0].text).toBe('Another way of asking.');
    r.discipline.answerDemand(d.id, 'refuse');
    expect(r.h.deps.generations.rerollState('flavor.demand', d.id)).toEqual({ enabled: false, reason: 'It was answered.' });
    const calls = r.h.st.calls.length;
    await r.discipline.reword(d.id);
    expect(r.h.st.calls).toHaveLength(calls);
  });

  it('a failed reroll leaves the wording that was there', async () => {
    const r = await delivered();
    const d = demands(r.h)[0];
    const text = d.text;
    r.h.st.mainReplies = [];
    await r.discipline.reword(d.id);
    expect(demands(r.h)[0].text).toBe(text);
  });
});
