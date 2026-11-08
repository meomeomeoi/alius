import { describe, it, expect } from 'vitest';
import { dispatch, registerAction, snapshot, restore } from '../../src/engine/dispatch';
import '../../src/engine/actions/debug';
import { createCampaign } from '../../src/engine/state/create';
import type { CampaignState } from '../../src/engine/state/types';
import type { Registries } from '../../src/content/types';

const registries: Registries = {};

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
