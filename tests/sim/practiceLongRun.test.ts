import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/personal';
import '../../src/engine/actions/practice';
import type { EngineEvent } from '../../src/engine/dispatch';
import { frameRank } from '../../src/engine/blocking/state';
import { dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { practiceLive } from '../../src/engine/practice/gate';
import { PRACTICE_EVENT_TYPES } from '../../src/engine/practice/state';
import { Rng, seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const DAYS = 120;
const OWN: readonly string[] = PRACTICE_EVENT_TYPES;

/** An eager holder (the setup of `dynamicLongRun`) who also practises service, denial and public humiliation, so that every kind of practice has a seed. */
function world(seed: number): CampaignState {
  const s = campaign(reg, 3);
  s.rng = seedRng(seed);
  setRelation(s, ANN, { stateId: 'comrade', trust: 60, affinity: 30 });
  s.squad.find((u) => u.id === ANN)!.bond = {
    leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'craves', witness: 'indifferent' }, service: { as: 'enjoys', witness: 'indifferent' }, denial: { as: 'enjoys', witness: 'indifferent' }, public_humiliation: { as: 'enjoys', witness: 'indifferent' } },
      style: { primary: 'cold' }, audience: 'show_off', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'high',
    },
  };
  s.content = { enabled: ['restraint', 'service', 'denial', 'public_humiliation'] };
  s.dynamic = newDynamicCampaign(seed, { holders: 1, pace: 'fast', frequency: 'often', units: {} });
  return s;
}

interface Entry { day: number; action: string; events: EngineEvent[]; frameBefore: string; frameAfter: string; liveBefore: boolean; liveAfter: boolean }

/**
 * Plays `DAYS` days with a player who accepts most of what she asks and refuses every third thing: the dynamic's own answers as in `dynamicLongRun` (probes, milestones, bookings), then what the
 * practices put in front of the commander (tasks, her discipline, a demonstration, a slap, an alarm), reporting half of the open tasks kept. Returns every action with her frame and whether she was live.
 */
function play(seed: number): { log: Entry[]; state: CampaignState } {
  let s = world(seed);
  const log: Entry[] = [];
  const frame = (st: CampaignState): string => dynamicOf(st, ANN)?.frame ?? 'none';
  let probes = 0;
  let answered = 0;
  let kept = 0;
  let n = 0;
  const step = (type: string, payload?: unknown): ReturnType<typeof run> => {
    const before = s;
    const r = run(s, reg, { type, payload });
    log.push({ day: s.day, action: type, events: r.events, frameBefore: frame(before), frameAfter: frame(r.state), liveBefore: practiceLive(before, reg, ANN), liveAfter: practiceLive(r.state, reg, ANN) });
    s = r.state;
    return r;
  };
  const intent = (event: Record<string, unknown>): void => {
    step('intents/apply', { channel: 'dm', unitId: ANN, intents: { events: [{ actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, ...event }] } });
  };
  /** What the practices put in front of the commander, answered. Errors are part of the run (a held commander is refused many things). */
  const practices = (): void => {
    for (let guard = 0; guard < 8; guard++) {
      const p = s.practices;
      if (p === undefined) return;
      const task = p.tasks.find((t) => t.status === 'offered' && t.holderId === ANN);
      const punishment = p.punishments.find((x) => (x.status === 'offered' || x.status === 'negotiating') && x.holderId === ANN);
      const demo = p.demonstrations.find((d) => d.status === 'offered' && d.holderId === ANN);
      if (p.slap !== undefined) { step('practice/slap_answer', { slapId: p.slap.id, result: n++ % 2 === 0 ? 'braced' : 'flinched' }); continue; }
      if (p.alarm !== undefined && p.alarm.answer === 'keep' && p.alarm.accepted !== true) { step('practice/answer_alarm', { alarmId: p.alarm.id, answer: 'accept' }); continue; }
      if (task !== undefined) {
        if (n++ % 3 === 2) step('practice/answer_task', { taskId: task.id, answer: 'refuse' });
        else if (task.acceptForm === 'words' || task.acceptForm === 'signed') {
          intent({ type: 'practice_accepted', taskId: task.id });
          if (task.acceptForm === 'signed' && s.practices?.tasks.find((t) => t.id === task.id)?.said === true) step('practice/sign', { taskId: task.id });
          else if (s.practices?.tasks.find((t) => t.id === task.id)?.status === 'offered') step('practice/answer_task', { taskId: task.id, answer: 'refuse' }); // the words did not open it: no loop
        } else step('practice/answer_task', { taskId: task.id, answer: 'accept' });
        continue;
      }
      if (punishment !== undefined) {
        if (punishment.forUnitId !== undefined) step('practice/take_instead', { punishmentId: punishment.id, answer: 'refuse' });
        else step('practice/answer_punishment', { punishmentId: punishment.id, answer: n++ % 3 === 2 ? 'refuse' : 'accept' });
        if (s.practices?.punishments.find((x) => x.id === punishment.id)?.status === 'offered') step('practice/answer_punishment', { punishmentId: punishment.id, answer: 'refuse' });
        continue;
      }
      if (demo !== undefined) {
        const r = step('practice/answer_demonstration', { demonstrationId: demo.id, answer: n++ % 3 === 2 ? 'refuse' : 'go' });
        const scene = r.events.find((e) => e.type === 'task_answered' && e.answer === 'go')?.scene as { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean } | undefined;
        if (scene !== undefined) {
          step('scene/start', { ...scene, startIndex: 0 });
          if (s.scene) step('scene/end', {});
        }
        continue;
      }
      return;
    }
  };
  while (s.day <= DAYS) {
    const start = s.day;
    s.resources = { credits: 9999, supplies: 99, plyx: 99 };
    for (let i = 0; i < 6 && s.day === start; i++) {
      if (s.dilemmas?.open) {
        const open = s.dilemmas.open;
        if (open.status === 'requested') step('dilemma/fallback', { requestId: open.id });
        for (let index = 0; index < 3 && s.dilemmas?.open; index++) step('dilemma/choose', { id: s.dilemmas.open.id, index });
      }
      if (dynamicOf(s, ANN)?.probes.pending !== undefined) intent({ type: 'probe_answered', response: probes++ % 2 === 0 ? 'yielded' : 'deflected' });
      const open = s.dynamic!.open.milestones[0];
      if (open !== undefined) step('dynamic/answer_milestone', { milestoneId: open.id, answer: answered++ % 2 === 0 ? 'accept' : 'refuse' });
      practices();
      for (const t of (s.practices?.tasks ?? []).filter((x) => x.status === 'open' && x.holderId === ANN && x.routine !== true && x.check === 'model' && x.kind === 'task')) {
        if (n++ % 2 === 0) intent({ type: 'task_kept', taskId: t.id });
      }
      if (s.scene) step('scene/end', {});
      const r = step('calendar/consume_slot', {});
      const due = errors(r.events).some((e) => e.code === 'booking_due');
      if (due) for (const b of (s.personal?.bookings ?? []).filter((x) => x.status === 'booked' && x.day === s.day && x.slot === s.slot)) step(kept++ % 2 === 0 ? 'booking/play' : 'booking/cancel', { bookingId: b.id });
    }
    if (s.day === start) break;
  }
  return { log, state: s };
}

/** The first day each practice event type happened. */
const firstDays = (log: Entry[], type: string, pred: (e: EngineEvent) => boolean = () => true): number | 'never' => log.find((e) => e.events.some((ev) => ev.type === type && pred(ev)))?.day ?? 'never';

describe('the long run: practices over 120 seeded days (Task 41)', () => {
  for (const seed of [11, 29]) {
    it(`seed ${seed}: every task comes from a request of a live holder, nothing happens below play, every kind of practice happens, restraint reaches level 1, nothing is NaN`, () => {
      const { log, state } = play(seed);
      const events = log.flatMap((e) => e.events.map((ev) => ({ e, ev })));
      // a request is written by a live holder; a task is issued from a request she made
      const requested = new Map<string, string>();
      for (const { e, ev } of events) {
        if (ev.type === 'practice_requested') {
          requested.set(String(ev.requestId), String(ev.holderId));
          expect(e.liveBefore || e.liveAfter, `request on day ${e.day} by a holder who is not live`).toBe(true);
        }
        if (ev.type === 'task_issued' && ev.kind !== 'demonstration' && ev.handover !== true && ev.rerolled !== true) {
          // the one task with no request is the confession an accepted punishment asks for (its effect writes the card at once, by her, for the punishment it names)
          if (ev.confession === true) {
            expect(e.liveAfter, `confession ${String(ev.taskId)} of a holder who is not live`).toBe(true);
            expect(events.some((x) => x.ev.type === 'punishment_issued' && x.ev.punishmentId === ev.punishmentId), `a confession names her punishment`).toBe(true);
          } else expect(requested.get(String(ev.requestId)), `task ${String(ev.taskId)} has no request of a holder`).toBe(String(ev.holderId));
        }
      }
      // no practice event while she holds below play (the live flag is the engine's own: play or beyond, a profile, no aftermath)
      for (const { e, ev } of events) {
        if (OWN.includes(ev.type) && !['task_void', 'practice_undone', 'hold_released', 'practice_requested'].includes(ev.type)) {
          expect(frameRank(e.frameBefore as never) >= frameRank('play') || frameRank(e.frameAfter as never) >= frameRank('play'), `${ev.type} on day ${e.day} with her frame ${e.frameBefore}`).toBe(true);
        }
      }
      const days = {
        play: firstDays(log, 'frame_changed', (ev) => ev.to === 'play'), requested: firstDays(log, 'practice_requested'), task: firstDays(log, 'task_issued', (ev) => ev.kind !== 'demonstration'),
        punishment: firstDays(log, 'punishment_issued'), hold: firstDays(log, 'hold_started'), demonstration: firstDays(log, 'demonstration_staged'), firstNight: firstDays(log, 'milestone_offered', (ev) => ev.milestoneId === 'first_night_held'),
      };
      console.info(`[practiceLongRun] seed ${seed}:`, JSON.stringify(days));
      expect(days.task, 'a task').not.toBe('never');
      expect(days.punishment, 'a punishment').not.toBe('never');
      expect(days.hold, 'a hold').not.toBe('never');
      expect(days.demonstration, 'a demonstration').not.toBe('never');
      expect((dynamicOf(state, ANN)?.tracks.restraint?.level ?? 0)).toBeGreaterThanOrEqual(1);
      expect(days.firstNight, 'first_night_held is offered').not.toBe('never');
      const walk = (v: unknown, where: string): void => {
        if (typeof v === 'number') expect(Number.isNaN(v), `${where} is NaN`).toBe(false);
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
        else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
      };
      walk(state, 'state');
    });
  }

  it('the practice code draws nothing: no draw of any rng the dispatcher builds has a stack through src/engine/practice/', () => {
    const stacks: string[] = [];
    // every draw goes through `next`; the spy wraps it and records where it was called from
    const proto = Rng.prototype as unknown as { next: () => number };
    const original = proto.next;
    const spy = vi.spyOn(proto, 'next').mockImplementation(function (this: Rng) { stacks.push(new Error().stack ?? ''); return original.call(this); });
    try {
      const { log } = play(11);
      expect(log.some((e) => e.events.some((ev) => OWN.includes(ev.type))), 'practice events happened while the draws were recorded').toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(stacks.length, 'the run draws (the spy sees them)').toBeGreaterThan(100);
    const through = stacks.filter((st) => /src\/engine\/practice\//.test(st));
    expect(through.slice(0, 1)).toEqual([]);
  });
});
