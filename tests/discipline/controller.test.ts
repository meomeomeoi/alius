import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createDiscipline } from '../../src/discipline/controller';
import type { DisciplineDeps } from '../../src/discipline/deps';
import { campaign, loadCore } from '../helpers/loyalty';
import { setRecord } from '../helpers/discipline';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';

interface Rig { h: WorldHarness; ctx: ContextBuilder; refresh: ReturnType<typeof vi.fn>; discipline: ReturnType<typeof createDiscipline> }
function rig(tweak: (s: CampaignState) => void = () => {}, debug = false): Rig {
  const s = campaign(reg, 4);
  s.day = 3;
  tweak(s);
  const h = worldHarness(reg, s, { debug });
  h.app().dispatch({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const deps: DisciplineDeps = { ...h.deps, context: ctx, refreshContext: refresh };
  return { h, ctx, refresh, discipline: createDiscipline(deps) };
}
const dirs = (r: Rig) => r.ctx.build(r.h.state(), 5000).directives;
const threaten = (r: Rig, measure = 'unspecified'): EngineEvent[] => r.h.app().dispatch({
  type: 'intents/apply',
  payload: { channel: 'scene', intents: { events: [{ type: 'threatened', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'or else', confidence: 0.9, measure }] } },
});

describe('threat directives', () => {
  it('a believed and an unbelieved threat give the two texts', () => {
    const cowed = rig((s) => setRecord(s, ANN, -40));
    cowed.discipline.onEvents(threaten(cowed));
    expect(dirs(cowed)).toContain("Ann believes the commander's threat (Consequences) will be carried out.");
    expect(cowed.refresh).toHaveBeenCalled();
    const bold = rig((s) => setRecord(s, ANN, 40));
    bold.discipline.onEvents(threaten(bold));
    expect(dirs(bold)).toContain("Ann does not believe the commander's threat (Consequences) will be carried out, and it shows.");
  });

  it('the directive lasts for one reply', () => {
    const r = rig();
    r.discipline.onEvents(threaten(r, 'leash'));
    expect(dirs(r)).toContain('(The Leash)');
    r.ctx.onReplyReceived();
    expect(dirs(r)).not.toContain('threat');
  });

  it('events without a threat change nothing and do not refresh', () => {
    const r = rig();
    r.discipline.onEvents([{ type: 'scene_exchange' }, { type: 'relation_changed' }]);
    expect(r.refresh).not.toHaveBeenCalled();
    expect(dirs(r)).toBe('');
  });
});

describe('toasts', () => {
  it('a lapsed threat tells the player the squad saw the commander back down', () => {
    const r = rig();
    r.discipline.onEvents([{ type: 'threat_lapsed', threatId: 'th1', unitId: ANN, measure: 'unspecified' }]);
    expect(r.h.toasts).toEqual([{ kind: 'info', text: 'A threat lapsed: Ann saw the commander back down.' }]);
  });

  it('covert sabotage is only mentioned in debug mode', () => {
    const quiet = rig();
    quiet.discipline.onEvents([{ type: 'covert_sabotage', kind: 'supplies' }]);
    expect(quiet.h.toasts).toEqual([]);
    const loud = rig(() => {}, true);
    loud.discipline.onEvents([{ type: 'covert_sabotage', kind: 'supplies' }]);
    expect(loud.h.toasts).toHaveLength(1);
    expect(loud.h.toasts[0].text).toContain('supplies');
  });
});

describe('scene lifecycle', () => {
  it('opening a scene sets the stance directives; closing clears them and the threat one', () => {
    const r = rig();
    r.discipline.onSceneOpened();
    expect(dirs(r)).toContain('Ann complies in silence'); // a fresh unit: Trust 20, Impunity 43 → fearful
    r.discipline.onEvents(threaten(r));
    r.discipline.onSceneClosed();
    expect(dirs(r)).toBe('');
    expect(r.refresh).toHaveBeenCalled();
  });

  it('no open scene: opening sets nothing', () => {
    const s = campaign(reg, 4);
    const h = worldHarness(reg, s);
    const ctx = new ContextBuilder();
    const d = createDiscipline({ ...h.deps, context: ctx, refreshContext: vi.fn() });
    d.onSceneOpened();
    expect(ctx.build(h.state(), 5000).directives).toBe('');
  });
});
