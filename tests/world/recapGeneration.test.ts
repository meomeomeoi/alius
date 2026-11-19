import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { createExpedition } from '../../src/world/expeditionController';
import { depart, withMission } from '../helpers/expedition';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const make = (h: WorldHarness) => createExpedition({ ...h.deps, startCombat: h.startCombat as never, startScene: h.startScene as never });
const done = (): CampaignState => {
  const { state, mission } = withMission(reg, base);
  const s = structuredClone(depart(reg, state, mission.id));
  s.expedition!.objectiveDone = true;
  const w = worldHarness(reg, s);
  make(w).return();
  return w.state();
};
const world = () => worldHarness(reg, done(), { autoRetry: 0 });
const records = (h: WorldHarness) => h.state().generations?.records ?? [];
const reportId = (h: WorldHarness) => h.state().lastExpedition!.id;

describe('expedition.recap', () => {
  it('a failed recap records on the report', async () => {
    const h = world();
    h.st.mainReplies = [];
    await make(h).requestRecap();
    expect(records(h)).toMatchObject([{ siteId: 'expedition.recap', key: reportId(h), reason: 'network', status: 'open' }]);
    expect(h.state().lastExpedition!.recap).toBeUndefined();
  });

  it('RETRY writes the recap and closes the record', async () => {
    const h = world();
    h.st.mainReplies = [];
    await make(h).requestRecap();
    h.st.mainReplies = ['The squad went in and came back.'];
    expect((await h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(h.state().lastExpedition!.recap).toBe('The squad went in and came back.');
    expect(records(h)).toEqual([]);
  });

  it('reroll replaces the recap', async () => {
    const h = world();
    h.st.mainReplies = ['First telling.'];
    await make(h).requestRecap();
    const id = reportId(h);
    expect(h.deps.generations.rerollState('expedition.recap', id)).toEqual({ enabled: true });
    h.st.mainReplies = ['Second telling.'];
    expect((await h.deps.generations.reroll('expedition.recap', id)).kind).toBe('applied');
    expect(h.state().lastExpedition!.recap).toBe('Second telling.');
  });

  it('a newer report expires the record and disables the reroll', async () => {
    const h = world();
    h.st.mainReplies = [];
    await make(h).requestRecap();
    const id = reportId(h);
    h.setState((s) => { s.lastExpedition!.id = 'rep_newer'; });
    expect(h.deps.generations.rerollState('expedition.recap', id)).toEqual({ enabled: false, reason: 'A newer report replaced it.' });
    expect(await h.deps.generations.retry('g1')).toEqual({ kind: 'expired', why: 'A newer report replaced it.' });
    expect(records(h)[0]).toMatchObject({ status: 'expired' });
  });
});
