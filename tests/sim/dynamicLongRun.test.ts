import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/personal';
import { dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { DynamicMilestoneEntry } from '../../src/engine/dynamic/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { applyEventToUnit } from '../../src/engine/relations/effects';
import type { EventIntent } from '../../src/engine/relations/intents';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const DAYS = 120;

/** An eager holder: dominant, craves restraint, fast pace and often (the dynamic as lively as the settings allow). */
function world(seed: number): CampaignState {
  const s = campaign(reg, 3);
  s.rng = seedRng(seed);
  setRelation(s, ANN, { stateId: 'comrade', trust: 60, affinity: 30 });
  s.squad.find((u) => u.id === ANN)!.bond = {
    leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'craves', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'high' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(seed, { holders: 1, pace: 'fast', frequency: 'often', units: {} });
  return s;
}

/**
 * Plays `DAYS` days with a player who accepts half of everything: every pending probe is answered `yielded` and `deflected` in turn, the commander follows her lead every other
 * day, every open milestone is accepted and refused in turn, and a booking that falls due is kept or canceled in turn. Returns every action's events with the
 * frame before and after it.
 */
function play(seed: number): { log: Array<{ day: number; action: string; accept?: boolean; events: EngineEvent[]; before: string; after: string }>; milestones: string[] } {
  let s = world(seed);
  const log: Array<{ day: number; action: string; accept?: boolean; events: EngineEvent[]; before: string; after: string }> = [];
  const frame = (st: CampaignState): string => dynamicOf(st, ANN)?.frame ?? 'none';
  let probes = 0;
  let answered = 0;
  let kept = 0;
  const step = (type: string, payload?: unknown, accept?: boolean): ReturnType<typeof run> => {
    const before = frame(s);
    const r = run(s, reg, { type, payload });
    log.push({ day: s.day, action: type, ...(accept !== undefined ? { accept } : {}), events: r.events, before, after: frame(r.state) });
    s = r.state;
    return r;
  };
  const milestones: string[] = [];
  while (s.day <= DAYS) {
    const start = s.day;
    s.resources = { credits: 9999, supplies: 99, plyx: 99 }; // the sim is about the dynamic, not the economy
    for (let i = 0; i < 6 && s.day === start; i++) {
      if (s.dilemmas?.open) {
        const open = s.dilemmas.open;
        if (open.status === 'requested') step('dilemma/fallback', { requestId: open.id });
        for (let index = 0; index < 3 && s.dilemmas?.open; index++) step('dilemma/choose', { id: s.dilemmas.open.id, index });
      }
      if (dynamicOf(s, ANN)?.probes.pending !== undefined) {
        step('intents/apply', { channel: 'dm', unitId: ANN, intents: { events: [{ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, response: probes++ % 2 === 0 ? 'yielded' : 'deflected' }] } });
      }
      const open = s.dynamic!.open.milestones[0];
      if (open !== undefined) {
        const accept = answered++ % 2 === 0;
        milestones.push(`${s.day}:${open.milestoneId}:${accept ? 'accept' : 'refuse'}`);
        step('dynamic/answer_milestone', { milestoneId: open.id, answer: accept ? 'accept' : 'refuse' }, accept);
      }
      if (i === 0 && s.day % 2 === 0) { // she leads, the commander follows (an engine event, so it is landed directly, as the engine's own checks do)
        const before = frame(s);
        const events = applyEventToUnit(s, reg, ANN, { type: 'followed_lead', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1 } as EventIntent);
        log.push({ day: s.day, action: 'followed_lead', events, before, after: frame(s) });
      }
      if (s.scene) step('scene/end', {});
      const r = step('calendar/consume_slot', {});
      const due = errors(r.events).some((e) => e.code === 'booking_due');
      if (due) for (const b of (s.personal?.bookings ?? []).filter((x) => x.status === 'booked' && x.day === s.day && x.slot === s.slot)) step(kept++ % 2 === 0 ? 'booking/play' : 'booking/cancel', { bookingId: b.id });
    }
    if (s.day === start) break; // the day did not move: stop rather than loop
  }
  return { log, milestones };
}

describe('the long run: a frame moves only through a milestone', () => {
  it('no frame_changed without a milestone (120 seeded days, an eager holder, half of everything accepted)', () => {
    for (const seed of [11, 29]) {
      const { log, milestones } = play(seed);
      const frames = log.flatMap((e) => e.events.filter((ev) => ev.type === 'frame_changed').map((ev) => ({ entry: e, ev })));
      for (const { entry, ev } of frames) {
        const row = reg.dynamicMilestones.get(String(ev.milestoneId)) as unknown as DynamicMilestoneEntry | undefined;
        expect(row, `frame_changed names a milestone (${String(ev.milestoneId)})`).toBeDefined();
        // either an automatic milestone, or the answer to an open one that was accepted, in the same action
        const answered = entry.action === 'dynamic/answer_milestone' && entry.accept === true && entry.events.some((x) => x.type === 'milestone_accepted' && x.milestoneId === ev.milestoneId);
        expect(row!.offer === 'automatic' || answered, `${String(ev.milestoneId)} in ${entry.action}`).toBe(true);
      }
      // and the other way: the frame never differs across an action that emitted no frame_changed
      for (const e of log) {
        if (e.before !== e.after && e.before !== 'none') expect(e.events.some((x) => x.type === 'frame_changed'), `${e.action} moved the frame`).toBe(true);
      }
      expect(frames.length, `seed ${seed}: something moved`).toBeGreaterThan(0);
      const dayOf = (to: string): number | string => log.find((e) => e.events.some((ev) => ev.type === 'frame_changed' && ev.to === to))?.day ?? 'never';
      console.info(`[dynamicLongRun] seed ${seed}: ${milestones.length} milestones answered, ${frames.length} frame changes, play on day ${dayOf('play')}, role on day ${dayOf('role')}`);
    }
  });
});
