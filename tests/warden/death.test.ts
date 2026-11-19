import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import type { DeathRule } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/debug';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const build = (rule: DeathRule | null = 'campaign_end'): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea')],
    ...(rule ? { mode: { kind: 'leashswap' as const, deathRule: rule, warden: { by: 'player' as const, index: 0 } } } : {}),
  }, reg, { desireBondDefects: false, seed: 4 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const kill = (s: CampaignState, cause?: string) => dispatch(s, { type: 'debug/kill_commander', payload: cause ? { cause } : {} }, reg);
const errorOf = (events: Array<{ type: string }>) => events.find((e) => e.type === 'error') as { code?: string; message?: string } | undefined;

describe('commanderDies: campaign_end', () => {
  it('closes the campaign: ended is set and a chronicle line with audience * is written', () => {
    const s = build('campaign_end');
    const out = kill(s);
    expect(errorOf(out.events)).toBeUndefined();
    expect(out.state.ended).toEqual({ day: s.day, cause: 'terminated' });
    const line = out.state.memory.chronicle.at(-1)!;
    expect(line.audience).toBe('*');
    expect(line.text).toMatch(/commander is dead/i);
    expect(line.text).not.toMatch(/\b(he|him|his)\b/i);
    expect(out.events.map((e) => e.type)).toEqual(expect.arrayContaining(['commander_died', 'campaign_ended']));
    expect(out.events.find((e) => e.type === 'commander_died')).toMatchObject({ rule: 'campaign_end', cause: 'terminated' });
  });

  it('afterwards every action but debug/* and campaign/epilogue is refused and changes nothing', () => {
    const closed = kill(build('campaign_end')).state;
    for (const action of [
      { type: 'activity/do', payload: { activityId: 'rest' } }, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } },
      { type: 'warden/revealed', payload: {} }, { type: 'scene/start', payload: {} },
    ]) {
      const out = dispatch(closed, action, reg);
      expect(errorOf(out.events)?.code, action.type).toBe('campaign_ended');
      expect(out.state, action.type).toBe(closed);
    }
    expect(errorOf(dispatch(closed, { type: 'debug/noop', payload: {} }, reg).events)).toBeUndefined();
  });

  it('is refused for an unknown action too, but an open combat or expedition does not stop the epilogue', () => {
    const closed = kill(build('campaign_end')).state;
    closed.combat = {} as never;
    expect(errorOf(dispatch(closed, { type: 'campaign/epilogue', payload: { text: 'x' } }, reg).events)).toBeUndefined();
  });

  it('campaign/epilogue is accepted once, only when ended, and only as plain text of at most 2400 characters', () => {
    const open = build('campaign_end');
    expect(errorOf(dispatch(open, { type: 'campaign/epilogue', payload: { text: 'x' } }, reg).events)).toBeDefined();
    const closed = kill(open).state;
    expect(errorOf(dispatch(closed, { type: 'campaign/epilogue', payload: { text: '  ' } }, reg).events)).toBeDefined();
    expect(errorOf(dispatch(closed, { type: 'campaign/epilogue', payload: { text: 'x'.repeat(2401) } }, reg).events)).toBeDefined();
    const done = dispatch(closed, { type: 'campaign/epilogue', payload: { text: 'The commander is remembered.' } }, reg);
    expect(errorOf(done.events)).toBeUndefined();
    expect(done.state.ended?.epilogue).toBe('The commander is remembered.');
    expect(errorOf(dispatch(done.state, { type: 'campaign/epilogue', payload: { text: 'Again.' } }, reg).events)?.message).toMatch(/already/i);
  });
});

describe('commanderDies: rewind_day', () => {
  it('changes nothing in the engine: the state is the same, only the events say so', () => {
    const s = build('rewind_day');
    const out = kill(s);
    expect(errorOf(out.events)).toBeUndefined();
    expect(out.state).toEqual(s);
    expect(out.events).toEqual([{ type: 'commander_died', rule: 'rewind_day', cause: 'terminated' }]);
  });

  it('an execution by verdict always ends the campaign', () => {
    const out = kill(build('rewind_day'), 'executed');
    expect(out.state.ended).toEqual({ day: out.state.day, cause: 'executed' });
    expect(out.events.find((e) => e.type === 'commander_died')).toMatchObject({ rule: 'campaign_end', cause: 'executed' });
  });

  it('warden/no_snapshot ends the campaign for the cause the controller names', () => {
    const s = build('rewind_day');
    const out = dispatch(s, { type: 'warden/no_snapshot', payload: { cause: 'terminated' } }, reg);
    expect(errorOf(out.events)).toBeUndefined();
    expect(out.state.ended).toEqual({ day: s.day, cause: 'terminated' });
    const bad = dispatch(s, { type: 'warden/no_snapshot', payload: { cause: 'sleep' } }, reg);
    expect(errorOf(bad.events)).toBeDefined();
  });

  it('warden/no_snapshot is allowed while a combat or an expedition is open', () => {
    const s = build('rewind_day');
    s.combat = {} as never;
    expect(errorOf(dispatch(s, { type: 'warden/no_snapshot', payload: { cause: 'terminated' } }, reg).events)).toBeUndefined();
  });
});

describe('no mode', () => {
  it('the commander cannot die: commanderDies throws', () => {
    const out = kill(build(null));
    expect(errorOf(out.events)?.message).toMatch(/cannot die|not in the LEASHSWAP/i);
    expect(out.state.ended).toBeUndefined();
    expect(errorOf(dispatch(build(null), { type: 'warden/no_snapshot', payload: { cause: 'terminated' } }, reg).events)).toBeDefined();
    expect(errorOf(dispatch(build(null), { type: 'campaign/epilogue', payload: { text: 'x' } }, reg).events)).toBeDefined();
  });
});
