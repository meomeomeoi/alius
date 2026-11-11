import { beforeAll, describe, expect, it } from 'vitest';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { applyDirectorOutput, beatCooldownDays, fallbackOutput, openRequest } from '../../../src/engine/world/director';
import { clockById } from '../../../src/engine/world/state';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const fb = (s: CampaignState, seed = 1) => fallbackOutput(s, reg, new Rng(seedRng(seed)));

describe('M6: the fallback moves a clock once per day', () => {
  it('two fallback answers on one even day advance the clocks once', () => {
    const s = structuredClone(base);
    s.day = 2;
    const first = fb(s);
    expect(first.clockAdvances).toHaveLength(1);
    const d = structuredClone(s);
    applyDirectorOutput(d, ctxOf(d, reg), first, { fallback: true });
    expect(d.world.director!.lastClockDay).toBe(2);
    expect(fb(d, 2).clockAdvances).toEqual([]);
    // the next even day moves again
    d.day = 4;
    expect(fb(d, 3).clockAdvances).toHaveLength(1);
    // a model answer does not use up the fallback's day
    const m = structuredClone(s);
    applyDirectorOutput(m, ctxOf(m, reg), first);
    expect(fb(m, 2).clockAdvances).toHaveLength(1);
  });
});

describe('M7: a scout request does not swallow a later full request', () => {
  it('the full request is opened right after the scout answer', () => {
    const s = structuredClone(base);
    openRequest(s, 'scout');
    expect(openRequest(s, 'expedition')).toEqual([]);
    expect(s.world.director!.after).toBe('expedition');
    const r = run(s, reg, { type: 'director/fallback', payload: { requestId: 'd1' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'director_requested')).toEqual([{ type: 'director_requested', id: 'd2', reason: 'expedition' }]);
    expect(r.state.world.director!.pending).toEqual({ id: 'd2', reason: 'expedition', day: s.day });
    expect(r.state.world.director!.after).toBeUndefined();
  });

  it('a scout request behind a full one is simply covered by it; a day-end request keeps the stronger reason', () => {
    const s = structuredClone(base);
    openRequest(s, 'day_end');
    expect(openRequest(s, 'scout')).toEqual([]);
    expect(s.world.director!.after).toBeUndefined();
    const t = structuredClone(base);
    openRequest(t, 'scout');
    openRequest(t, 'expedition');
    openRequest(t, 'day_end'); // the first remembered full request stays
    expect(t.world.director!.after).toBe('expedition');
  });
});

describe('M9: the beat cooldown setting reaches every director answer', () => {
  it('campaign/set_beat_cooldown stores a valid value and refuses the rest', () => {
    const ok = run(base, reg, { type: 'campaign/set_beat_cooldown', payload: { days: 5 } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.settings.beatCooldownDays).toBe(5);
    expect(beatCooldownDays(ok.state)).toBe(5);
    expect(beatCooldownDays(base)).toBe(3);
    for (const days of [0, 15, 2.5, '3', undefined]) expect(errors(run(base, reg, { type: 'campaign/set_beat_cooldown', payload: { days } }).events), String(days)).toHaveLength(1);
  });

  it('the fallback proposes a beat after the configured cooldown', () => {
    const s = structuredClone(base);
    s.day = 5;
    s.world.spine = { lastProposalDay: 4 };
    expect(fb(s).storyBeatProposal).toBeUndefined(); // default 3 days
    s.settings.beatCooldownDays = 1;
    expect(fb(s).storyBeatProposal).toEqual({ beatId: 'beat_1', framing: '' });
    s.settings.beatCooldownDays = 14;
    s.day = 10;
    expect(fb(s).storyBeatProposal).toBeUndefined();
  });

  it('a day-end fallback answer honours it too', () => {
    const s = structuredClone(base);
    s.settings.beatCooldownDays = 1;
    s.world.spine = { lastProposalDay: 0 };
    s.day = 1;
    s.slot = 'evening';
    openRequest(s, 'day_end');
    s.world.spine.lastProposalDay = 1; // proposed today: only a 1-day cooldown allows tomorrow's
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    // the unanswered request is answered by the fallback with cooldown 1 on day 1: too early (0 days since), so nothing
    expect(r.state.world.spine?.proposed).toBeUndefined();
    const later = structuredClone(r.state);
    later.slot = 'evening';
    const r2 = run(later, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(r2.state.world.spine?.proposed).toBe('beat_1'); // a day later, cooldown 1 is over (the default 3 would not be)
  });

  it('a payload value still wins over the campaign setting', () => {
    const s = structuredClone(base);
    s.settings.beatCooldownDays = 1;
    s.world.spine = { lastProposalDay: s.day - 1 };
    openRequest(s, 'day_end');
    const r = run(s, reg, { type: 'director/apply', payload: { requestId: 'd1', beatCooldownDays: 9, output: { storyBeatProposal: { beatId: 'beat_1', framing: 'x' } } } });
    expect(r.state.world.spine?.proposed).toBeUndefined();
  });
});

describe('M9: the Leash and the report', () => {
  it('a leash effect reports the authorizations left, and nothing when nothing changed', () => {
    const s = structuredClone(base);
    s.leash.authorizationsLeft = 2;
    const d = structuredClone(s);
    const events = applyWorldEffects(d, ctxOf(d, reg), [{ type: 'leash', amount: -1 }, { type: 'leash', amount: 1 }], { kind: 'event', id: 'x' });
    expect(ofType(events, 'leash_changed')).toEqual([
      { type: 'leash_changed', amount: -1, left: 1 }, { type: 'leash_changed', amount: 1, left: 2 },
    ]);
    const z = structuredClone(s);
    z.leash.authorizationsLeft = 0;
    expect(applyWorldEffects(z, ctxOf(z, reg), [{ type: 'leash', amount: -1 }], { kind: 'event', id: 'x' })).toEqual([]);
  });

  it('an oversight fill shows up as a leash change', () => {
    const s = structuredClone(base);
    s.leash.authorizationsLeft = 2;
    clockById(s, 'oversight')!.filled = 5;
    const d = structuredClone(s);
    const events = applyWorldEffects(d, ctxOf(d, reg), [{ type: 'clock', clockId: 'oversight', by: 1 }], { kind: 'event', id: 'x' });
    expect(ofType(events, 'leash_changed')).toEqual([{ type: 'leash_changed', amount: -1, left: 1 }]);
  });

  it('the report carries the day the squad came back', () => {
    const { state, mission } = withMission(reg, base);
    state.slot = 'afternoon';
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.objectiveDone = true;
    // some seeds queue a night visit (the day then stays at Night); take one where the day really rolls over
    let rolled: CampaignState | undefined;
    for (let seed = 1; seed <= 40 && !rolled; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      const next = run(t, reg, { type: 'expedition/return', payload: {} }).state;
      if (next.day === s.day + 1) rolled = next;
    }
    expect(rolled).toBeDefined();
    expect(rolled!.lastExpedition!.day).toBe(s.day + 1);
    // returning the same day keeps the day
    const m = withMission(reg, base);
    const morning = structuredClone(depart(reg, m.state, m.mission.id));
    morning.expedition!.objectiveDone = true;
    const same = run(morning, reg, { type: 'expedition/return', payload: {} }).state;
    expect(same.lastExpedition!.day).toBe(morning.day);
  });
});
