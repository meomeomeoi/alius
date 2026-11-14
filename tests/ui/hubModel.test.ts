import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { Mission } from '../../src/engine/world/types';
import type { CampaignState, NightEntry } from '../../src/engine/state/types';
import { currentObjective, endSlotBlock, latestOversight, markerTone, TONE_GLYPH, tonightItems } from '../../src/ui/hub/model';
import { campaign, loadCore } from '../helpers/world';
import { setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const mission = (over: Partial<Mission> = {}): Mission => ({
  id: 'm1', source: 'director', templateId: 't', title: 'Hold the line', brief: 'b', regionId: 'r', danger: 2,
  objective: { node: 'n', condition: 'win' }, offeredDay: 1, rewardsTier: 'low', failureEffects: [], status: 'active', ...over,
}) as Mission;

const night = (unitId: string, kind: string, over: Partial<NightEntry> = {}): NightEntry => ({
  id: `n_${unitId}_${kind}`, unitId, kind, priority: 5, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99, ...over,
});

const tone = (s: CampaignState, i = 0) => markerTone(s, reg, s.squad[i]);

describe('markerTone', () => {
  it('stress 85 is danger', () => {
    const s = campaign(reg, 4);
    s.squad[0].stress = 85;
    expect(tone(s)).toBe('danger');
  });

  it('a lover is bond, a friend is trust', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'lover' });
    setRelation(s, s.squad[1].id, { stateId: 'friend' });
    expect(tone(s, 0)).toBe('bond');
    expect(tone(s, 1)).toBe('trust');
  });

  it('a comrade with Affinity 70 is affinity, with Affinity 20 neutral', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'comrade', affinity: 70 });
    setRelation(s, s.squad[1].id, { stateId: 'comrade', affinity: 20 });
    expect(tone(s, 0)).toBe('affinity');
    expect(tone(s, 1)).toBe('neutral');
  });

  it('a resentful unit is warn, and so is stress 55 in a comrade', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'resentful' });
    setRelation(s, s.squad[1].id, { stateId: 'comrade' });
    s.squad[1].stress = 55;
    expect(tone(s, 0)).toBe('warn');
    expect(tone(s, 1)).toBe('warn');
  });

  it('a fresh stranger is neutral', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'stranger', affinity: 0 });
    s.squad[0].stress = 0;
    expect(tone(s)).toBe('neutral');
  });

  it('an injured lover is danger (danger wins), and so is a breaking loyalty band', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'lover' });
    s.squad[0].status = 'injured';
    setRelation(s, s.squad[1].id, { stateId: 'friend', band: 'breaking' });
    expect(tone(s, 0)).toBe('danger');
    expect(tone(s, 1)).toBe('danger');
    const s2 = campaign(reg, 4);
    setRelation(s2, s2.squad[0].id, { stateId: 'lover' });
    s2.squad[0].injuryDays = 1;
    expect(tone(s2)).toBe('danger');
  });

  it('every tone has a glyph, so colour is never the only carrier', () => {
    expect(TONE_GLYPH).toEqual({ danger: '!', bond: '♥', trust: '+', affinity: '*', warn: '~', neutral: '·' });
  });

  it('a unit without a relation (a grunt) still gets a tone', () => {
    const s = campaign(reg, 4);
    const g = { ...structuredClone(s.squad[0]), id: 'g1', kind: 'grunt' as const, stress: 10 };
    expect(markerTone(s, reg, g)).toBe('neutral');
  });
});

describe('currentObjective', () => {
  it('a spine-beat mission wins over a nearer deadline', () => {
    const s = campaign(reg, 4);
    s.day = 5;
    s.missions.active = [mission({ id: 'near', title: 'Near', deadlineDay: 6 }), mission({ id: 'beat', title: 'Beat', spineBeat: 'b1', deadlineDay: 20 })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Beat', dueDays: 15, missionId: 'beat' });
  });

  it('without a spine beat the nearest deadline wins; dueDays is deadlineDay minus day', () => {
    const s = campaign(reg, 4);
    s.day = 5;
    s.missions.active = [mission({ id: 'far', title: 'Far', deadlineDay: 12 }), mission({ id: 'near', title: 'Near', deadlineDay: 7 }), mission({ id: 'open', title: 'Open' })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Near', dueDays: 2, missionId: 'near' });
  });

  it('an active mission without a deadline has dueDays null', () => {
    const s = campaign(reg, 4);
    s.missions.active = [mission({ id: 'open', title: 'Open' })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Open', dueDays: null, missionId: 'open' });
  });

  it('falls back to an offered spine-beat mission, then to null', () => {
    const s = campaign(reg, 4);
    s.missions.active = [];
    s.missions.offered = [mission({ id: 'plain', title: 'Plain', status: 'offered' }), mission({ id: 'story', title: 'Story', status: 'offered', spineBeat: 'b2' })];
    expect(currentObjective(s, reg)?.missionId).toBe('story');
    s.missions.offered = [mission({ id: 'plain', title: 'Plain', status: 'offered' })];
    expect(currentObjective(s, reg)).toBeNull();
  });

  it('no missions gives null', () => {
    const s = campaign(reg, 4);
    s.missions = { offered: [], active: [], completed: [] };
    expect(currentObjective(s, reg)).toBeNull();
  });
});

describe('tonightItems', () => {
  const quiet = (): CampaignState => {
    const s = campaign(reg, 4);
    s.missions = { offered: [], active: [], completed: [] };
    return s;
  };

  it('a queued talk entry gives "{name} will knock tonight."', () => {
    const s = quiet();
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'we_need_to_talk')];
    const items = tonightItems(s, reg);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'knock', text: `${s.squad[0].displayName} will knock tonight.`, unitId: s.squad[0].id });
  });

  it('an expired talk entry gives nothing', () => {
    const s = quiet();
    s.day = 5;
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'we_need_to_talk', { expiresDay: 4 })];
    expect(tonightItems(s, reg)).toEqual([]);
  });

  it('hidden night kinds (desertion, mutiny, visit) give nothing', () => {
    const s = quiet();
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'desertion'), night(s.squad[1].id, 'mutiny'), night(s.squad[2].id, 'visit'), night(s.squad[3].id, 'deserter_return')];
    expect(tonightItems(s, reg)).toEqual([]);
  });

  it('two unread DMs give "{name}: 2 unread messages."; one gives the singular', () => {
    const s = quiet();
    const id = s.squad[0].id;
    const dm = (n: number, from: string, read: boolean) => ({ id: `d${n}`, from, text: 't', day: 1, slot: 'morning' as const, read });
    s.dms[id] = [dm(1, id, false), dm(2, id, false), dm(3, id, true), dm(4, 'commander', false)];
    s.dms[s.squad[1].id] = [dm(5, s.squad[1].id, false)];
    const items = tonightItems(s, reg).filter((i) => i.kind === 'dm');
    expect(items.map((i) => i.text)).toEqual([`${s.squad[0].displayName}: 2 unread messages.`, `${s.squad[1].displayName}: 1 unread message.`]);
  });

  it('an open delivered demand says she is waiting; an undelivered one is hidden', () => {
    const s = quiet();
    const base = { templateId: 't', text: 'x', day: 1, expiresDay: 9, impunityDriven: false };
    s.discipline = {
      defiance: [], threats: [], applications: [], restrictions: [], demandLog: [],
      demands: [{ id: 'd1', unitId: s.squad[0].id, status: 'open', ...base }, { id: 'd2', unitId: s.squad[1].id, status: 'undelivered', ...base }],
    };
    const items = tonightItems(s, reg);
    expect(items.map((i) => i.text)).toEqual([`${s.squad[0].displayName} is waiting for an answer.`]);
  });

  it('an incoming unit, a near deadline and warnings are listed', () => {
    const s = quiet();
    s.day = 6;
    s.world.incomingUnits = 1;
    s.missions.active = [mission({ id: 'a', title: 'Hold', deadlineDay: 6 }), mission({ id: 'b', title: 'Escort', deadlineDay: 7 }), mission({ id: 'c', title: 'Later', deadlineDay: 9 })];
    s.calendar.shortageStreak = 2;
    s.commander.injuredUntilDay = 8;
    const texts = tonightItems(s, reg).map((i) => i.text);
    expect(texts).toEqual(['A new unit is waiting for intake.', 'Hold: due today.', 'Escort: due tomorrow.', 'SHORTAGE 2d', 'INJURED 2d']);
  });

  it('more than six sources give six items in the ruled order', () => {
    const s = quiet();
    s.day = 6;
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'we_need_to_talk'), night(s.squad[1].id, 'we_need_to_talk')];
    for (const u of s.squad) s.dms[u.id] = [{ id: `d_${u.id}`, from: u.id, text: 't', day: 1, slot: 'morning', read: false }];
    s.world.incomingUnits = 2;
    s.calendar.shortageStreak = 1;
    const items = tonightItems(s, reg);
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.kind)).toEqual(['knock', 'knock', 'dm', 'dm', 'dm', 'dm']);
  });

  it('every item names a glossary address that exists, and no text gives the commander a pronoun', () => {
    const s = quiet();
    s.day = 6;
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'we_need_to_talk')];
    s.dms[s.squad[1].id] = [{ id: 'd', from: s.squad[1].id, text: 't', day: 1, slot: 'morning', read: false }];
    s.world.incomingUnits = 1;
    s.missions.active = [mission({ deadlineDay: 6 })];
    s.calendar.shortageStreak = 1;
    s.commander.injuredUntilDay = 9;
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demandLog: [], demands: [{ id: 'd1', unitId: s.squad[2].id, templateId: 't', text: 'x', day: 1, expiresDay: 9, status: 'open', impunityDriven: false }] };
    const items = tonightItems(s, reg);
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(['knock', 'dm', 'demand', 'intake', 'deadline', 'warning']));
    for (const i of items) {
      expect(i.analyze, i.text).toMatch(/^glossary:/);
      expect(reg.glossary.has(i.analyze.slice('glossary:'.length)), i.analyze).toBe(true);
      expect(i.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });
});

describe('endSlotBlock', () => {
  it('is null on a quiet board', () => {
    expect(endSlotBlock(campaign(reg, 4))).toBeNull();
  });

  it('an open scene blocks', () => {
    const s = campaign(reg, 4);
    s.scene = { id: 's', day: 1, slot: 'morning', locationId: 'mess_hall', participants: [], mode: 'private', origin: 'activity', consumesSlot: true, startIndex: 0, exchanges: 0 };
    expect(endSlotBlock(s)).toBe('A conversation is open.');
  });

  it('a pending talk blocks', () => {
    const s = campaign(reg, 4);
    s.calendar.pendingScene = { unitId: s.squad[0].id, day: s.day, slot: s.slot };
    expect(endSlotBlock(s)).toBe('A talk is waiting for its scene.');
  });

  it('an open expedition blocks', () => {
    const s = campaign(reg, 4);
    s.expedition = { party: [] } as unknown as CampaignState['expedition'];
    expect(endSlotBlock(s)).toBe('The squad is out.');
  });

  it('a presented dilemma blocks, a merely requested one does not', () => {
    const s = campaign(reg, 4);
    s.dilemmas = { seq: 1, open: { id: 'd', templateId: 't', scale: 'minor', context: {}, day: 1, status: 'requested', attempts: 0, units: [], beatId: 'b' } as unknown as NonNullable<CampaignState['dilemmas']>['open'] };
    expect(endSlotBlock(s)).toBeNull();
    s.dilemmas.open!.status = 'presented';
    expect(endSlotBlock(s)).toBe('A decision is waiting.');
  });

  it('a night visitor blocks', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    s.calendar.nightEvent = night(s.squad[0].id, 'visit');
    expect(endSlotBlock(s)).toBe('Someone is at the door.');
  });
});

describe('latestOversight', () => {
  const entry = (no: number, day: number) => ({ no, unitId: 'u', kind: 'compel', day, context: 'scene', outcome: 'done' });

  it('is the newest entry from today or yesterday', () => {
    const s = campaign(reg, 4);
    s.day = 6;
    s.leash.log = [entry(1, 3), entry(2, 5), entry(3, 6)];
    expect(latestOversight(s)?.no).toBe(3);
    s.leash.log = [entry(1, 3), entry(2, 5)];
    expect(latestOversight(s)?.no).toBe(2);
  });

  it('an entry from 2 days ago gives null', () => {
    const s = campaign(reg, 4);
    s.day = 6;
    s.leash.log = [entry(1, 4)];
    expect(latestOversight(s)).toBeNull();
  });

  it('ignores malformed entries and an empty log', () => {
    const s = campaign(reg, 4);
    s.leash.log = [{ junk: true }, 7];
    expect(latestOversight(s)).toBeNull();
    s.leash.log = [];
    expect(latestOversight(s)).toBeNull();
  });
});
