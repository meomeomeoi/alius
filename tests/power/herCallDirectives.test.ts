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
  it('expedition_ended sets it with went well / went badly, expiring after the scene', () => {
    const r = rig(afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: BEA, outcome: 'good' }]));
    r.power.onEvents(ended);
    expect(r.set.mock.calls.map((c) => c[0])).toEqual([
      { id: `power:herCall:${ANN}`, expiresAfter: 'scene', text: 'Ann took the decision herself in the field; it went badly.' },
      { id: `power:herCall:${BEA}`, expiresAfter: 'scene', text: 'Bea took the decision herself in the field; it went well.' },
    ]);
    expect(r.refresh).toHaveBeenCalled();
    expect(r.ctx.build(r.h.state(), 5000).directives).toContain('Ann took the decision herself in the field; it went badly.');
  });

  it('one directive per unit: her last call wins', () => {
    const r = rig(afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: ANN, outcome: 'good' }]));
    r.power.onEvents(ended);
    expect(r.set.mock.calls.map((c) => c[0])).toEqual([{ id: `power:herCall:${ANN}`, expiresAfter: 'scene', text: 'Ann took the decision herself in the field; it went well.' }]);
  });

  it('a run with no her-call, another report and a unit who is gone set nothing', () => {
    const none = rig(afterRun([]));
    none.power.onEvents(ended);
    expect(none.set).not.toHaveBeenCalled();
    const other = rig(afterRun([{ unitId: ANN, outcome: 'bad' }]));
    other.power.onEvents([{ type: 'expedition_ended', outcome: 'failed', reportId: 'rep_old' }]);
    expect(other.set).not.toHaveBeenCalled();
    const gone = rig(afterRun([{ unitId: 'ghost', outcome: 'bad' }]));
    gone.power.onEvents(ended);
    expect(gone.set).not.toHaveBeenCalled();
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

  it('refreshPowerDirectives sets it for the open scene and drops it once lifted; power:herCall survives a refresh', () => {
    const s = ordered();
    s.scene = { id: 'sc', participants: [ANN], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    const b = new ContextBuilder();
    b.setDirective({ id: `power:herCall:${ANN}`, expiresAfter: 'scene', text: 'Ann took the decision herself in the field; it went badly.' });
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('has ordered Ann to ask');
    expect(b.build(s, 5000).directives).toContain('it went badly');
    delete s.power!.askFirst;
    refreshPowerDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('to ask');
    expect(b.build(s, 5000).directives).toContain('it went badly');
  });
});

describe('ids and words', () => {
  /** Every prefix P9, P9d, P11 and the world layer reserve for their own directives. */
  const RESERVED = [
    'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
    'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:',
  ];

  it('no directive id starts with a prefix P9, P9d or P11 reserve, and every one starts with power:', () => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
    const r = rig(afterRun([{ unitId: ANN, outcome: 'bad' }]));
    r.power.onEvents(ended);
    const ids = [...powerDirectives(s, reg, [ANN]).map((d) => d.id), ...r.set.mock.calls.map((c) => c[0].id)];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) {
      expect(id.startsWith('power:'), id).toBe(true);
      expect(RESERVED.some((p) => id.startsWith(p)), id).toBe(false);
    }
  });

  it('no commander pronoun in any directive line', () => {
    const s = campaign(reg, 4);
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [ANN]: s.day } };
    const r = rig(afterRun([{ unitId: ANN, outcome: 'bad' }, { unitId: BEA, outcome: 'good' }]));
    r.power.onEvents(ended);
    const texts = [...powerDirectives(s, reg, [ANN]).map((d) => d.text), ...r.set.mock.calls.map((c) => c[0].text)].join(' ');
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
