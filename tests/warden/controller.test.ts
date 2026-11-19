import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { wardenOf } from '../../src/engine/warden';
import { createWarden } from '../../src/warden/controller';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const swap = (): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea'), unitSetup('Cat')],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const ANSWER = { expectations: [{ kind: 'meet_quota', weight: 'high', source: 'corporate' }, { kind: 'keep_me_close', weight: 'medium' }, { kind: 'no_civilian_harm', weight: 'low' }] };
const flush = () => new Promise((r) => setTimeout(r, 0));

function rig() {
  const h = worldHarness(reg, swap());
  h.st.cards.set('bea.png', { avatar: 'bea.png', name: 'Bea', description: 'A sergeant.', personality: 'Dry.', scenario: '', creatorNotes: '' });
  const ctl = createWarden({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn() });
  return { h, ctl };
}

describe('the warden controller: the agenda', () => {
  it('on warden_assigned it asks the model once and dispatches the agenda', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    ctl.onEvents([{ type: 'warden_assigned', unitId: wardenOf(h.state())!.unitId }]);
    await flush();
    expect(wardenOf(h.state())!.agenda).toBe('model');
    expect(wardenOf(h.state())!.expectations.map((x) => x.kind)).toEqual(['meet_quota', 'keep_me_close', 'no_civilian_harm']);
    expect(h.log.filter((a) => a.type === 'warden/agenda')).toHaveLength(1);
  });

  it('a campaign that was just deployed (no event stream) asks at load, once', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    ctl.onLoaded();
    ctl.onLoaded();
    await flush();
    expect(h.log.filter((a) => a.type === 'warden/agenda')).toHaveLength(1);
  });

  it('a late agenda for another chat is dropped', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    ctl.onLoaded();
    h.switchChat('other');
    await flush();
    expect(h.log.filter((a) => a.type === 'warden/agenda')).toHaveLength(0);
    expect(wardenOf(h.state())!.agenda).toBe('fallback');
  });

  it('a failed or invalid answer leaves the fallback, with no toast', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = ['not json', 'not json'];
    ctl.onLoaded();
    await flush();
    expect(wardenOf(h.state())!.agenda).toBe('fallback');
    expect(h.toasts).toEqual([]);
  });

  it('does not ask when the agenda is already in play, nor outside the mode', async () => {
    const { h, ctl } = rig();
    h.setState((s) => { wardenOf(s)!.overrideFired = true; });
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(0);
    const plain = worldHarness(reg, (() => { const s = swap(); delete s.leashswap; return s; })());
    createWarden({ ...plain.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn() }).onLoaded();
    await flush();
    expect(plain.st.calls).toHaveLength(0);
  });

  it('what the model is told never carries an unknown expectation', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    ctl.onLoaded();
    await flush();
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('A sergeant.');
    expect(prompt).toContain('meet_quota'); // the closed list of kinds
  });
});
