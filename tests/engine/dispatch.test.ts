import { describe, it, expect } from 'vitest';
import { dispatch, registerAction, snapshot, restore } from '../../src/engine/dispatch';
import '../../src/engine/actions/debug';
import { createCampaign } from '../../src/engine/state/create';
import type { CampaignState } from '../../src/engine/state/types';
import { emptyRegistries } from '../../src/content/types';

const registries = emptyRegistries();

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const fresh = (): CampaignState => createCampaign({ seed: 42, commanderName: 'Vale' });
const roll = (s: CampaignState) => dispatch(s, { type: 'debug/roll', payload: { sides: 1_000_000 } }, registries);
const rolled = (events: { type: string; [k: string]: unknown }[]) => events.find((e) => e.type === 'rolled')!.value;

registerAction('expedition/test_ok', () => [{ type: 'ok' }]);
registerAction('director/test_ok', () => [{ type: 'ok' }]);
registerAction('combat/test_ok', () => [{ type: 'ok' }]);
registerAction('test/other', () => [{ type: 'ok' }]);
registerAction('dilemma/test_ok', () => [{ type: 'ok' }]);
registerAction('activity/test_ok', () => [{ type: 'ok' }]);
registerAction('calendar/consume_slot', () => [{ type: 'ok' }]);
registerAction('scene/start', () => [{ type: 'ok' }]);
registerAction('expedition/start', () => [{ type: 'ok' }]);

registerAction('test/throw', (draft) => {
  draft.day = 99; // partial mutation must not leak out
  throw new Error('boom');
});

describe('dispatch', () => {
  it('does not mutate input', () => {
    const s0 = deepFreeze(fresh());
    const before = JSON.stringify(s0);
    expect(() => roll(s0)).not.toThrow();
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('rng advances and persists', () => {
    const s0 = fresh();
    const r1 = roll(s0);
    const r2 = roll(r1.state);
    expect(r1.state.rng).not.toEqual(s0.rng);
    expect(r2.state.rng).not.toEqual(r1.state.rng);

    const again1 = roll(s0);
    const again2 = roll(again1.state);
    expect(rolled(again1.events)).toBe(rolled(r1.events));
    expect(rolled(again2.events)).toBe(rolled(r2.events));
  });

  it('roll stays within 1..sides', () => {
    let s = fresh();
    for (let i = 0; i < 200; i++) {
      const r = dispatch(s, { type: 'debug/roll', payload: { sides: 6 } }, registries);
      const v = rolled(r.events) as number;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      s = r.state;
    }
  });

  it('noop returns no events and an equal state', () => {
    const s0 = fresh();
    const r = dispatch(s0, { type: 'debug/noop' }, registries);
    expect(r.events).toEqual([]);
    expect(r.state).toEqual(s0);
  });

  it('unknown action yields error event and same state', () => {
    const s0 = fresh();
    const r = dispatch(s0, { type: 'nope/nothing' }, registries);
    expect(r.state).toEqual(s0);
    expect(r.events).toEqual([{ type: 'error', code: 'unknown_action', action: 'nope/nothing' }]);
  });

  it('throwing handler leaves state unchanged', () => {
    const s0 = fresh();
    const r = dispatch(s0, { type: 'test/throw' }, registries);
    expect(r.state).toEqual(s0);
    expect(r.state.day).toBe(1);
    expect(r.events).toEqual([{ type: 'error', code: 'handler_failed', message: 'boom' }]);
  });

  it('registerAction throws on duplicate type', () => {
    expect(() => registerAction('debug/noop', () => [])).toThrow(/duplicate/i);
  });

  it('snapshot/restore round trip deep-equals', () => {
    const s = roll(fresh()).state;
    const snap = snapshot(s);
    expect(typeof snap).toBe('string');
    expect(restore(snap)).toEqual(s);
  });
});

describe('expedition guard', () => {
  const open = (): CampaignState => ({ ...fresh(), expedition: { id: 'exp_1' } as never });

  it('only expedition/, combat/, director/ and debug/ actions run while an expedition is open', () => {
    const s = open();
    for (const type of ['expedition/test_ok', 'combat/test_ok', 'director/test_ok', 'debug/noop']) {
      expect(dispatch(s, { type }, registries).events.some((e) => e.type === 'error'), type).toBe(false);
    }
    const r = dispatch(s, { type: 'test/other' }, registries);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([{ type: 'error', code: 'expedition_open', message: 'An expedition is under way: finish or abandon it first.' }]);
  });

  it('unknown actions keep their own error, and a closed expedition guards nothing', () => {
    expect(dispatch(open(), { type: 'nope/never' }, registries).events[0]).toMatchObject({ code: 'unknown_action' });
    expect(dispatch(fresh(), { type: 'test/other' }, registries).events).toEqual([{ type: 'ok' }]);
  });

  it('dilemma/ actions run while an expedition is open (P6)', () => {
    expect(dispatch(open(), { type: 'dilemma/test_ok' }, registries).events).toEqual([{ type: 'ok' }]);
  });

  it('a presented dilemma blocks activities, slots, scenes and departures; a requested one does not (P6)', () => {
    const presented = fresh();
    presented.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'minor', context: 'base', day: 1, status: 'presented', attempts: 1, units: [], beatId: 'b' } };
    for (const type of ['activity/test_ok', 'calendar/consume_slot', 'scene/start', 'expedition/start']) {
      const r = dispatch(presented, { type }, registries);
      expect(r.state, type).toBe(presented);
      expect(r.events, type).toEqual([{ type: 'error', code: 'dilemma_open', message: 'A decision is waiting: answer it first.' }]);
    }
    expect(dispatch(presented, { type: 'test/other' }, registries).events).toEqual([{ type: 'ok' }]);
    expect(dispatch(presented, { type: 'dilemma/test_ok' }, registries).events).toEqual([{ type: 'ok' }]);
    const requested = structuredClone(presented);
    requested.dilemmas!.open!.status = 'requested';
    expect(dispatch(requested, { type: 'calendar/consume_slot' }, registries).events).toEqual([{ type: 'ok' }]);
  });
});
