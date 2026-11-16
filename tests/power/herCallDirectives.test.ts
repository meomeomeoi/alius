import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createPower, type PowerDeps } from '../../src/power/controller';
import { powerDirectives, refreshPowerDirectives } from '../../src/power/directives';
import { campaign, loadCore } from '../helpers/loyalty';
import '../helpers/power';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const PRONOUN = /\b(he|him|his|himself)\b/i;

/** The state a run leaves behind: a report with her calls. */
function afterRun(calls: Array<{ unitId: string; outcome: 'good' | 'bad' }>): CampaignState {
  const s = campaign(reg, 4);
  s.lastExpedition = {
    id: 'rep_x', missionId: 'm', missionTitle: 'M', regionId: 'quarantine_d7', day: s.day, outcome: 'failed', party: [ANN, BEA], nodes: [], log: [], loot: [],
    injuries: [], deaths: [], breakdowns: [], acknowledged: false, debriefed: false,
    herCalls: calls.map((c, i) => ({ nodeId: `n${i}`, unitId: c.unitId, outcome: c.outcome, templateId: 'evt_hc_route', odds: 0.5 })),
  };
  return s;
}
function rig(state: CampaignState) {
  const h = worldHarness(reg, state);
  const ctx = new ContextBuilder();
  const set = vi.spyOn(ctx, 'setDirective');
  const refresh = vi.fn();
  const deps: PowerDeps = { ...h.deps, context: ctx, refreshContext: refresh, showVote: async () => ({ choice: 'cancel' }) };
  return { h, ctx, set, refresh, power: createPower(deps) };
}
const ended = [{ type: 'expedition_ended', outcome: 'failed', reportId: 'rep_x' }];

describe('power:herCall:<unitId> after a run', () => {
  it('is derived for a present soldier who decided: went well / went badly, expiring after the scene', () => {
    const s = afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: BEA, outcome: 'good' }]);
    expect(powerDirectives(s, reg, [ANN])).toEqual([{ id: `power:herCall:${ANN}`, expiresAfter: 'scene', text: 'Ann took the decision herself in the field; it went badly.' }]);
    expect(powerDirectives(s, reg, [BEA])).toEqual([{ id: `power:herCall:${BEA}`, expiresAfter: 'scene', text: 'Bea took the decision herself in the field; it went well.' }]);
    expect(powerDirectives(s, reg, [ANN, BEA]).map((d) => d.id)).toEqual([`power:herCall:${ANN}`, `power:herCall:${BEA}`]);
  });

  it('only in a scene she is in: not in another soldier\'s scene, not with no scene', () => {
    const s = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    expect(powerDirectives(s, reg, ['unit_cat'])).toEqual([]);
    expect(powerDirectives(s, reg, [])).toEqual([]);
  });

  it('one directive per unit: her last call wins', () => {
    const s = afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: ANN, outcome: 'good' }]);
    expect(powerDirectives(s, reg, [ANN])).toEqual([{ id: `power:herCall:${ANN}`, expiresAfter: 'scene', text: 'Ann took the decision herself in the field; it went well.' }]);
  });

  it('a run with no her-call, a unit who is gone and a report from days ago give nothing', () => {
    expect(powerDirectives(afterRun([]), reg, [ANN])).toEqual([]);
    expect(powerDirectives(afterRun([{ unitId: 'ghost', outcome: 'bad' }]), reg, ['ghost'])).toEqual([]);
    const old = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    old.day = old.lastExpedition!.day + 2;
    expect(powerDirectives(old, reg, [ANN])).toEqual([]);
    const next = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    next.day = next.lastExpedition!.day + 1;
    expect(powerDirectives(next, reg, [ANN])).toHaveLength(1); // the next morning is still "the scene after the run"
    const dead = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    dead.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(powerDirectives(dead, reg, [ANN])).toEqual([]);
  });

  it('never leaks: a refresh drops it once she is not in the scene, and a chat without that report has none', () => {
    const s = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    s.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    const b = new ContextBuilder();
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('it went badly');
    s.scene = { id: 'sc2', participants: [BEA], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('it went badly'); // another scene
    s.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('it went badly');
    // another campaign's chat: its state has no such report
    const other = campaign(reg, 4);
    other.scene = s.scene;
    refreshPowerDirectives(b, other, reg);
    expect(b.build(other, 5000).directives).not.toContain('it went badly');
  });

  it('expedition_ended no longer sets it from the controller; it only refreshes the context', () => {
    const r = rig(afterRun([{ unitId: ANN, outcome: 'bad' }]));
    r.power.onEvents(ended);
    expect(r.set).not.toHaveBeenCalled();
    expect(r.refresh).toHaveBeenCalled();
    const none = rig(afterRun([]));
    none.power.onEvents(ended);
    expect(none.refresh).not.toHaveBeenCalled();
    const other = rig(afterRun([{ unitId: ANN, outcome: 'bad' }]));
    other.power.onEvents([{ type: 'expedition_ended', outcome: 'failed', reportId: 'rep_old' }]);
    expect(other.refresh).not.toHaveBeenCalled();
  });
});

describe('power:ask_first:<unitId>', () => {
  const ordered = (): CampaignState => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
    return s;
  };

  it('is derived while she is in the scene and dropped when lifted', () => {
    const s = ordered();
    expect(powerDirectives(s, reg, [ANN])).toEqual([{
      id: `power:ask_first:${ANN}`, expiresAfter: 'scene',
      text: 'The commander has ordered Ann to ask before she decides anything in the field.',
    }]);
    expect(powerDirectives(s, reg, [BEA])).toEqual([]);
    expect(powerDirectives(s, reg, [])).toEqual([]);
    delete s.power!.askFirst;
    expect(powerDirectives(s, reg, [ANN])).toEqual([]);
  });

  it('refreshPowerDirectives sets it for the open scene and drops it once lifted', () => {
    const s = ordered();
    s.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    const b = new ContextBuilder();
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('has ordered Ann to ask');
    delete s.power!.askFirst;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('to ask');
  });
});

describe('ids and words', () => {
  /** Every prefix P9, P9d, P11, the world layer and P9c reserve for their own directives. */
  const RESERVED = [
    'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
    'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'personal:',
  ];

  it('no directive id starts with a prefix P9, P9d or P11 reserve, and every one starts with power:', () => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
    const ran = afterRun([{ unitId: ANN, outcome: 'bad' }]);
    const ids = [...powerDirectives(s, reg, [ANN]).map((d) => d.id), ...powerDirectives(ran, reg, [ANN]).map((d) => d.id)];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) {
      expect(id.startsWith('power:'), id).toBe(true);
      expect(RESERVED.some((p) => id.startsWith(p)), id).toBe(false);
    }
  });

  it('no commander pronoun in any directive line', () => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
    const ran = afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: BEA, outcome: 'good' }]);
    const texts = [...powerDirectives(s, reg, [ANN]).map((d) => d.text), ...powerDirectives(ran, reg, [ANN, BEA]).map((d) => d.text)].join(' ');
    expect(texts).not.toMatch(PRONOUN);
  });
});

describe('app.power.askFirst', () => {
  it('dispatches power/ask_first, refreshes the context and returns whether it worked', async () => {
    const r = rig(campaign(reg, 4));
    expect(await r.power.askFirst(ANN, true)).toBe(true);
    expect(r.h.log.at(-1)).toEqual({ type: 'power/ask_first', payload: { unitId: ANN, on: true } });
    expect(r.h.state().power!.askFirst).toEqual({ [ANN]: r.h.state().day });
    expect(r.refresh).toHaveBeenCalled();
    // twice: the engine refuses, the controller toasts
    expect(await r.power.askFirst(ANN, true)).toBe(false);
    expect(r.h.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringContaining('already under that order') });
    expect(await r.power.askFirst(ANN, false)).toBe(true);
    expect(r.h.state().power!.askFirst).toBeUndefined();
    expect(await r.power.askFirst(ANN, false)).toBe(false);
  });
});
