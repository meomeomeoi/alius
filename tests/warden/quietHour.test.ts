import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type Action } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import { newLife } from '../../src/engine/life/state';
import type { CampaignState } from '../../src/engine/state/types';
import { orderOfAction, overrideOpen, wardenOf, type Expectation } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/life';
import '../../src/engine/actions/memory';
import '../../src/engine/actions/scene';

/** A quiet hour (`life/time_together`) overridden by the warden: COMPLY and DEFY run the order again, so the pastime must come with it (P14c × P13). */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const keepMeClose: Expectation = { id: 'e_keep_me_close', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false };
const err = (events: Array<{ type: string }>) => events.find((e) => e.type === 'error') as { message?: string } | undefined;
const run = (s: CampaignState, a: Action) => dispatch(s, a, reg);
const answer = (s: CampaignState, a: 'comply' | 'defy') => run(s, { type: 'warden/answer', payload: { overrideId: overrideOpen(s)!.id, answer: a } });
const quiet: Action = { type: 'life/time_together', payload: { unitId: ANN, pastimeId: 'tidy_her_quarters' } };

function swap(seed: number): CampaignState {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const s = r.state;
  const w = wardenOf(s)!;
  w.expectations = [keepMeClose];
  w.satisfaction = 60;
  s.relations[w.unitId].affinity = 0;
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  s.world.clocks = [];
  return s;
}

/** The first seed at which the quiet hour is overridden (the state then holds the open override and nothing else). */
function overridden(mutate: (s: CampaignState) => void = () => {}): CampaignState {
  for (let seed = 1; seed < 200; seed++) {
    const s = swap(seed);
    mutate(s);
    const r = run(s, quiet);
    if (overrideOpen(r.state)) return r.state;
  }
  throw new Error('no seed overrides');
}

describe('a quiet hour the warden overrides', () => {
  it('orderOfAction knows it (the activity that carries pastime: true, with her as the companion) and needs the registries for it', () => {
    expect(orderOfAction(quiet, reg)).toEqual({ kind: 'activity', activityId: 'time_together', companionId: ANN });
    expect(orderOfAction(quiet)).toBeNull();
    expect(orderOfAction({ type: 'life/time_together', payload: {} }, reg)).toBeNull();
  });

  it('the hit runs nothing: no slot, no pending, no hold', () => {
    const before = swap(1);
    const s = overridden();
    expect(s.slot).toBe(before.slot);
    expect(s.life!.pending).toBeUndefined();
    expect(s.calendar.pendingScene).toBeUndefined();
    expect(overrideOpen(s)).toMatchObject({ alternative: { kind: 'activity', activityId: 'time_together', companionId: BEA } });
  });

  it('COMPLY: the warden has the quiet hour, and the scene that follows carries her pastime', () => {
    const r = answer(overridden(), 'comply');
    expect(err(r.events)).toBeUndefined();
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: BEA });
    expect(r.state.calendar.pendingScene).toMatchObject({ unitId: BEA });
    expect(r.state.life!.pending).toMatchObject({ unitId: BEA, pastimeId: 'tidy_her_quarters', locationId: 'quarters_unit' });
    const started = run(r.state, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [BEA], origin: 'activity', startIndex: 0 } });
    expect(err(started.events)).toBeUndefined();
    expect(started.state.scene!.pastime).toEqual({ id: 'tidy_her_quarters', unitId: BEA });
    expect(started.state.life!.pending).toBeUndefined();
    const ended = run(started.state, { type: 'scene/end', payload: {} });
    expect(ended.state.life!.units[BEA].meetingDay).toBe(ended.state.day - (ended.state.day === started.state.day ? 0 : 1));
  });

  it('DEFY: the quiet hour she was refused runs as asked, with its pastime', () => {
    const r = answer(overridden(), 'defy');
    expect(err(r.events)).toBeUndefined();
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: ANN });
    expect(r.state.life!.pending).toMatchObject({ unitId: ANN, pastimeId: 'tidy_her_quarters' });
  });

  it('a pastime that does not fit the companion who is really there is a deliberate plain scene: the slot is held, and no pending dangles', () => {
    const s = overridden();
    s.relations[BEA].affinity = -50; // she wants nothing to do with the commander: no quiet hour with her
    const r = answer(s, 'comply');
    expect(err(r.events)).toBeUndefined();
    expect(r.state.calendar.pendingScene).toMatchObject({ unitId: BEA });
    expect(r.state.life!.pending).toBeUndefined();
    const started = run(r.state, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [BEA], origin: 'activity', startIndex: 0 } });
    expect(started.state.scene!.pastime).toBeUndefined();
    const ended = run(started.state, { type: 'scene/end', payload: {} });
    expect(ended.state.life!.units[BEA]?.meetingDay).toBeUndefined();
  });
});
