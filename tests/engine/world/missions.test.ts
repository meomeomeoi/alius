import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import {
  boardRoom, checkOffer, completeMission, missionById, offerMission, releaseMission, rollRewards, runDeadlines,
  type MissionOffer,
} from '../../../src/engine/world/missions';
import type { Mission } from '../../../src/engine/world/types';
import { clockById } from '../../../src/engine/world/state';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const SWEEP: MissionOffer = { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' };

function offer(state: CampaignState, o: MissionOffer, regs: Registries = reg) {
  const draft = structuredClone(state);
  const r = offerMission(draft, ctxOf(draft, regs), o);
  return { draft, ...r };
}
/** Moves an offered mission to the active list, as `expedition/start` does. */
function activate(draft: CampaignState, id: string): Mission {
  const i = draft.missions.offered.findIndex((m) => m.id === id);
  const [m] = draft.missions.offered.splice(i, 1);
  m.status = 'active';
  draft.missions.active.push(m);
  return m;
}
const withRegs = (patch: (r: Registries) => void): Registries => {
  const r = { ...reg } as Registries;
  for (const k of ['missionTemplates', 'regions', 'rewardTiers'] as const) r[k] = new Map(reg[k]);
  patch(r);
  return r;
};

describe('offers', () => {
  it('offer fills title, brief, danger, tier and a deadline of at least 5 days', () => {
    const r = offer(base, SWEEP);
    const tpl = reg.missionTemplates.get('tpl_sweep')!;
    expect(r.mission).not.toBeNull();
    const m = r.mission!;
    expect(tpl.titles).toContain(m.title);
    expect(tpl.briefs).toContain(m.brief);
    expect(m.danger).toBe(1);
    expect(m.rewardsTier).toBe('tier_1');
    expect(m.objective).toEqual({ node: 'combat', condition: 'win' });
    expect(m.status).toBe('offered');
    expect(m.offeredDay).toBe(base.day);
    expect(m.deadlineDay).toBe(base.day + 7);
    expect(m.failureEffects).toEqual(tpl.failureEffects);
    expect(r.draft.missions.offered).toEqual([m]);
    expect(ofType(r.events, 'mission_offered')).toEqual([{ type: 'mission_offered', missionId: m.id, source: 'command', regionId: 'quarantine_d7', title: m.title }]);
    expect(missionById(r.draft, m.id)).toEqual(m);
    // deadlines are clamped to 5…14 days
    expect(offer(base, { ...SWEEP, deadlineDays: 1 }).mission!.deadlineDay).toBe(base.day + TUNING.world.deadlineMinDays);
    expect(offer(base, { ...SWEEP, deadlineDays: 99 }).mission!.deadlineDay).toBe(base.day + TUNING.world.deadlineMaxDays);
  });

  it('danger is the region danger clamped to the template range; given values are clamped too; text is cut', () => {
    expect(offer(base, { ...SWEEP, danger: 5 }).mission!.danger).toBe(3);
    expect(offer(base, { templateId: 'tpl_hunt', regionId: 'ashway', source: 'side' }).mission!.danger).toBe(2);
    const r = offer(base, { ...SWEEP, title: 'T'.repeat(100), brief: 'B'.repeat(500) }).mission!;
    expect(r.title).toHaveLength(TUNING.director.titleMax);
    expect(r.brief).toHaveLength(TUNING.director.briefMax);
    const chosen = offer(base, { templateId: 'tpl_hunt', regionId: 'ashway', source: 'rumor', rewardsTier: 'tier_4', objectiveNode: 'elite', scouted: true }).mission!;
    expect(chosen).toMatchObject({ rewardsTier: 'tier_4', scouted: true, objective: { node: 'elite', condition: 'win' } });
  });

  it('a story offer has no deadline and needs a spine beat', () => {
    const story: MissionOffer = { templateId: 'tpl_vesper_beat_1', regionId: 'quarantine_d7', source: 'story' };
    expect(checkOffer(base, reg, story)).toMatch(/spine/i);
    expect(offer(base, story).mission).toBeNull();
    const ok = offer(base, { ...story, spineBeat: 'beat_1' });
    expect(ok.mission!.deadlineDay).toBeUndefined();
    expect(ok.mission!.spineBeat).toBe('beat_1');
  });

  it('an unknown template, unknown region, unknown tier or wrong source is refused with a reason', () => {
    const reason = (o: Partial<MissionOffer>, s = base, regs = reg) => checkOffer(s, regs, { ...SWEEP, ...o });
    expect(reason({})).toBeNull();
    expect(reason({ templateId: 'ghost' })).toMatch(/template/i);
    expect(reason({ regionId: 'ghost' })).toMatch(/region/i);
    expect(reason({ regionId: 'drowned_market' })).toMatch(/not (yet )?known|unknown|reach/i);
    expect(reason({ rewardsTier: 'tier_4' })).toMatch(/tier/i);
    expect(reason({ rewardsTier: 'ghost' })).toMatch(/tier/i);
    expect(reason({ source: 'rumor' })).toMatch(/source/i);
    expect(reason({ templateId: 'tpl_outbreak', regionId: 'ashway' })).toMatch(/region/i);
    expect(reason({ objectiveNode: 'cache' })).toMatch(/objective/i);
    expect(reason({ threadId: 'ghost' })).toMatch(/thread/i);
    const s = structuredClone(base);
    s.world.threads.push({ id: 't1', title: 'T', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
    expect(reason({ threadId: 't1' }, s)).toBeNull();
    s.world.threads[0].status = 'resolved';
    expect(reason({ threadId: 't1' }, s)).toMatch(/thread/i);
    // the region becomes known with clearance
    s.world.clearanceTier = 1;
    expect(reason({ regionId: 'drowned_market' }, s)).toBeNull();
  });

  it('a duplicate template+region offer is refused', () => {
    const first = offer(base, SWEEP);
    expect(checkOffer(first.draft, reg, SWEEP)).toMatch(/already/i);
    expect(offerMission(first.draft, ctxOf(first.draft, reg), SWEEP).mission).toBeNull();
    // an active mission blocks the same offer too
    activate(first.draft, first.mission!.id);
    expect(checkOffer(first.draft, reg, SWEEP)).toMatch(/already/i);
    // another region is fine
    expect(checkOffer(first.draft, reg, { ...SWEEP, regionId: 'ashway' })).toBeNull();
  });
});

describe('the board', () => {
  const fill = (s: CampaignState, n: number, source: MissionOffer['source'] = 'side') => {
    const draft = structuredClone(s);
    const combos: Array<[string, string]> = [['tpl_sweep', 'quarantine_d7'], ['tpl_sweep', 'kestrel_corridor'], ['tpl_sweep', 'ashway'],
      ['tpl_recover', 'quarantine_d7'], ['tpl_recover', 'kestrel_corridor']];
    for (const [templateId, regionId] of combos.slice(0, n)) {
      const m = offerMission(draft, ctxOf(draft, reg), { templateId, regionId, source }).mission;
      expect(m, `${templateId} ${regionId}`).not.toBeNull();
    }
    return draft;
  };

  it('board size follows the comms level', () => {
    expect(boardRoom(base, reg)).toBe(3);
    const s = structuredClone(base);
    s.base.facilities.comms = 2;
    expect(boardRoom(s, reg)).toBe(4);
    s.base.facilities.comms = 3;
    expect(boardRoom(s, reg)).toBe(5);
    expect(boardRoom(fill(base, 2), reg)).toBe(1);
    expect(boardRoom(fill(base, 3), reg)).toBe(0);
  });

  it('a full board refuses a side offer and lets a command offer push out the oldest side one', () => {
    const full = fill(base, 3);
    expect(boardRoom(full, reg)).toBe(0);
    const oldest = full.missions.offered[0];
    const refused = offerMission(full, ctxOf(structuredClone(full), reg), { templateId: 'tpl_hunt', regionId: 'ashway', source: 'side' });
    expect(refused).toEqual({ mission: null, events: [] });
    expect(offerMission(structuredClone(full), ctxOf(full, reg), { templateId: 'tpl_hunt', regionId: 'ashway', source: 'rumor' }).mission).toBeNull();

    const r = offer(full, { templateId: 'tpl_recover', regionId: 'ashway', source: 'command' });
    expect(r.mission).not.toBeNull();
    expect(r.draft.missions.offered).toHaveLength(3);
    expect(r.draft.missions.offered.some((m) => m.id === oldest.id)).toBe(false);
    expect(r.draft.missions.offered.at(-1)!.id).toBe(r.mission!.id);
    expect(ofType(r.events, 'mission_expired')).toEqual([{ type: 'mission_expired', missionId: oldest.id, reason: 'pushed_out' }]);
  });

  it('command and story offers always fit, even when nothing can be pushed out', () => {
    const full = fill(base, 3, 'command');
    const r = offer(full, { templateId: 'tpl_recover', regionId: 'ashway', source: 'command' });
    expect(r.mission).not.toBeNull();
    expect(r.draft.missions.offered).toHaveLength(4);
    expect(ofType(r.events, 'mission_expired')).toEqual([]);
  });

  it('the offer_mission world effect offers a mission and skips an invalid one', () => {
    const draft = structuredClone(base);
    const events = applyWorldEffects(draft, ctxOf(draft, reg), [
      { type: 'offer_mission', templateId: 'tpl_outbreak', regionId: 'quarantine_d7', source: 'command' },
      { type: 'offer_mission', templateId: 'ghost', source: 'command' },
    ], { kind: 'clock', id: 'bloom_d7' });
    expect(draft.missions.offered.map((m) => m.templateId)).toEqual(['tpl_outbreak']);
    expect(ofType(events, 'mission_offered')).toHaveLength(1);
    // without a region the template's first allowed region is used
    const d2 = structuredClone(base);
    applyWorldEffects(d2, ctxOf(d2, reg), [{ type: 'offer_mission', templateId: 'tpl_outbreak', source: 'command' }], { kind: 'clock', id: 'x' });
    expect(d2.missions.offered[0].regionId).toBe('quarantine_d7');
  });
});

describe('rewards and completion', () => {
  it('rewards stay inside the tier ranges for 200 seeds', () => {
    const m = offer(base, { templateId: 'tpl_vesper_beat_4', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_4' }).mission!;
    expect(m.rewardsTier).toBe('tier_3');
    const tier = reg.rewardTiers.get('tier_3')!;
    const [cLo, cHi] = tier.credits as [number, number];
    const [pLo, pHi] = tier.plyx as [number, number];
    let sawLow = false, sawHigh = false;
    for (let seed = 1; seed <= 200; seed++) {
      const draft = structuredClone(base);
      draft.rng = seedRng(seed);
      const { rewards, drops } = rollRewards(draft, ctxOf(draft, reg), m);
      expect(rewards.credits).toBeGreaterThanOrEqual(cLo);
      expect(rewards.credits).toBeLessThanOrEqual(cHi);
      expect(rewards.plyx).toBeGreaterThanOrEqual(pLo);
      expect(rewards.plyx).toBeLessThanOrEqual(pHi);
      expect(rewards.faction).toEqual({ id: 'vesper', amount: 5 });
      expect(drops.length).toBeGreaterThan(0);
      if (rewards.credits < cLo + 5) sawLow = true;
      if (rewards.credits > cHi - 5) sawHigh = true;
    }
    expect(sawLow && sawHigh).toBe(true);
  });

  it('a template without a faction gives none; a tier without loot gives no drops', () => {
    const m = offer(base, SWEEP).mission!;
    const { rewards, drops } = rollRewards(structuredClone(base), ctxOf(structuredClone(base), reg), m);
    expect(rewards.faction).toBeUndefined();
    expect(rewards.clearance).toBeUndefined();
    expect(drops).toEqual([]);
    expect(rewards.items).toEqual([]);
  });

  it('completion banks credits, plyx and loot once and applies faction and clearance', () => {
    const regs = withRegs((r) => {
      r.missionTemplates.set('tpl_vesper_beat_4', { ...reg.missionTemplates.get('tpl_vesper_beat_4')!, clearance: 2, onSuccess: [{ type: 'flag', flagId: 'evidence_buried' }] });
    });
    const o = offer(base, { templateId: 'tpl_vesper_beat_4', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_4' }, regs);
    const draft = o.draft;
    const m = activate(draft, o.mission!.id);
    draft.day = 5;
    const events = completeMission(draft, ctxOf(draft, regs), m.id);
    expect(draft.missions.active).toEqual([]);
    expect(draft.missions.offered).toEqual([]);
    const done = draft.missions.completed.at(-1)!;
    expect(done).toMatchObject({ id: m.id, status: 'completed', outcomeDay: 5 });
    const rewards = done.rewards!;
    expect(rewards.clearance).toBe(2);
    expect(draft.world.clearanceTier).toBe(2);
    expect(draft.world.factions.vesper).toBe(base.world.factions.vesper + 5);
    expect(draft.resources.credits).toBeGreaterThanOrEqual(base.resources.credits + rewards.credits);
    expect(draft.resources.plyx).toBeGreaterThanOrEqual(base.resources.plyx + rewards.plyx);
    expect(draft.world.flags).toContain('evidence_buried'); // onSuccess ran
    expect(ofType(events, 'mission_completed')).toHaveLength(1);
    expect(ofType(events, 'loot_banked')).toHaveLength(1);

    // a second completion changes nothing
    const snapshot = structuredClone(draft);
    expect(completeMission(draft, ctxOf(draft, regs), m.id)).toEqual([]);
    expect(draft).toEqual(snapshot);
  });

  it('on-success effects of a story mission run (spine fact)', () => {
    const o = offer(base, { templateId: 'tpl_vesper_beat_1', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_1' });
    activate(o.draft, o.mission!.id);
    completeMission(o.draft, ctxOf(o.draft, reg), o.mission!.id);
    expect(o.draft.memory.facts.some((f) => f.text.includes('first Bloom sample'))).toBe(true);
  });

  it('completed keeps the newest 30', () => {
    const o = offer(base, SWEEP);
    const draft = o.draft;
    const proto = draft.missions.offered.pop()!;
    for (let i = 0; i < TUNING.world.completedMax + 5; i++) {
      draft.missions.active.push({ ...structuredClone(proto), id: `mx${i}`, status: 'active' });
      completeMission(draft, ctxOf(draft, reg), `mx${i}`);
    }
    expect(draft.missions.completed).toHaveLength(TUNING.world.completedMax);
    expect(draft.missions.completed.at(-1)!.id).toBe(`mx${TUNING.world.completedMax + 4}`);
    expect(draft.missions.completed[0].id).toBe('mx5');
  });

  it('releaseMission puts a mission back on the board; a point-of-interest run is dropped', () => {
    const o = offer(base, SWEEP);
    const m = activate(o.draft, o.mission!.id);
    releaseMission(o.draft, m.id);
    expect(o.draft.missions.active).toEqual([]);
    expect(o.draft.missions.offered).toHaveLength(1);
    expect(o.draft.missions.offered[0]).toMatchObject({ id: m.id, status: 'offered' });
    const poi = { ...structuredClone(m), id: 'mp', poiId: 'scavenge', status: 'active' as const };
    o.draft.missions.offered = [];
    o.draft.missions.active.push(poi);
    releaseMission(o.draft, 'mp');
    expect(o.draft.missions.offered).toEqual([]);
    expect(o.draft.missions.active).toEqual([]);
  });
});

describe('deadlines', () => {
  it('deadline day passing fails the mission and applies its failure effects once', () => {
    const o = offer(base, SWEEP);
    const draft = o.draft;
    const m = draft.missions.offered[0];
    const before = clockById(draft, 'oversight')!.filled;
    draft.day = m.deadlineDay! - 1;
    expect(runDeadlines(draft, ctxOf(draft, reg))).toEqual([]);
    expect(draft.missions.offered).toHaveLength(1);
    draft.day = m.deadlineDay!;
    const events = runDeadlines(draft, ctxOf(draft, reg));
    expect(ofType(events, 'mission_failed')).toEqual([{ type: 'mission_failed', missionId: m.id, title: m.title }]);
    expect(draft.missions.offered).toEqual([]);
    expect(draft.missions.completed.at(-1)).toMatchObject({ id: m.id, status: 'failed', outcomeDay: m.deadlineDay });
    expect(clockById(draft, 'oversight')!.filled).toBe(before + 1);
    // once only
    expect(runDeadlines(draft, ctxOf(draft, reg))).toEqual([]);
    expect(clockById(draft, 'oversight')!.filled).toBe(before + 1);
  });

  it('a mission completed today is not failed by tonight\'s deadline step', () => {
    const o = offer(base, SWEEP);
    const draft = o.draft;
    const m = activate(draft, o.mission!.id);
    draft.day = m.deadlineDay!;
    completeMission(draft, ctxOf(draft, reg), m.id);
    const before = clockById(draft, 'oversight')!.filled;
    expect(runDeadlines(draft, ctxOf(draft, reg))).toEqual([]);
    expect(draft.missions.completed.at(-1)!.status).toBe('completed');
    expect(clockById(draft, 'oversight')!.filled).toBe(before);
    // and a mission that is out on an expedition (active) is never failed by the deadline either
    const o2 = offer(base, SWEEP);
    const a = activate(o2.draft, o2.mission!.id);
    o2.draft.day = a.deadlineDay! + 3;
    expect(runDeadlines(o2.draft, ctxOf(o2.draft, reg))).toEqual([]);
    expect(o2.draft.missions.active).toHaveLength(1);
  });

  it('a mission whose template or region was removed expires without effects and the step does not throw', () => {
    const o = offer(base, SWEEP);
    const o2 = offerMission(o.draft, ctxOf(o.draft, reg), { templateId: 'tpl_sweep', regionId: 'ashway', source: 'command' });
    const draft = o.draft;
    expect(o2.mission).not.toBeNull();
    const regs = withRegs((r) => {
      r.missionTemplates.delete('tpl_sweep');
    });
    const before = clockById(draft, 'oversight')!.filled;
    draft.day += 30;
    const events = runDeadlines(draft, ctxOf(draft, regs));
    expect(ofType(events, 'mission_expired')).toHaveLength(2);
    expect(ofType(events, 'mission_failed')).toEqual([]);
    expect(draft.missions.offered).toEqual([]);
    expect(draft.missions.completed).toEqual([]);
    expect(clockById(draft, 'oversight')!.filled).toBe(before);

    const o3 = offer(base, SWEEP);
    const regs2 = withRegs((r) => r.regions.delete('quarantine_d7'));
    expect(() => runDeadlines(o3.draft, ctxOf(o3.draft, regs2))).not.toThrow();
    expect(o3.draft.missions.offered).toEqual([]);
  });

  it('the day-end hook runs the deadline step', () => {
    const o = offer(base, SWEEP);
    const draft = o.draft;
    draft.day = draft.missions.offered[0].deadlineDay!;
    draft.slot = 'evening';
    const r = run(draft, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'mission_failed')).toHaveLength(1);
  });
});

describe('mission/dismiss', () => {
  it('removes a side or rumor mission without effects and refuses command and story', () => {
    const o = offer(base, { templateId: 'tpl_recover', regionId: 'ashway', source: 'rumor' });
    const ok = run(o.draft, reg, { type: 'mission/dismiss', payload: { missionId: o.mission!.id } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.missions.offered).toEqual([]);
    expect(ok.state.missions.completed).toEqual([]);
    const cmd = offer(base, SWEEP);
    const refused = run(cmd.draft, reg, { type: 'mission/dismiss', payload: { missionId: cmd.mission!.id } });
    expect(errors(refused.events)[0]).toMatchObject({ code: 'handler_failed' });
    expect(refused.state.missions.offered).toHaveLength(1);
    expect(errors(run(o.draft, reg, { type: 'mission/dismiss', payload: { missionId: 'ghost' } }).events)).toHaveLength(1);
    // an active mission cannot be dismissed
    const act = offer(base, { templateId: 'tpl_recover', regionId: 'ashway', source: 'side' });
    activate(act.draft, act.mission!.id);
    expect(errors(run(act.draft, reg, { type: 'mission/dismiss', payload: { missionId: act.mission!.id } }).events)).toHaveLength(1);
  });
});
