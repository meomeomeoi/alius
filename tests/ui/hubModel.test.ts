import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { newDynamicCampaign } from '../../src/engine/dynamic/state';
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
    expect(currentObjective(s, reg)).toEqual({ text: 'Beat', dueDays: 15, missionId: 'beat', source: 'mission' });
  });

  it('without a spine beat the nearest deadline wins; dueDays is deadlineDay minus day', () => {
    const s = campaign(reg, 4);
    s.day = 5;
    s.missions.active = [mission({ id: 'far', title: 'Far', deadlineDay: 12 }), mission({ id: 'near', title: 'Near', deadlineDay: 7 }), mission({ id: 'open', title: 'Open' })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Near', dueDays: 2, missionId: 'near', source: 'mission' });
  });

  it('an active mission without a deadline has dueDays null', () => {
    const s = campaign(reg, 4);
    s.missions.active = [mission({ id: 'open', title: 'Open' })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Open', dueDays: null, missionId: 'open', source: 'mission' });
  });

  it('falls back to an offered spine-beat mission, then to null', () => {
    const s = campaign(reg, 4);
    s.missions.active = [];
    s.missions.offered = [mission({ id: 'plain', title: 'Plain', status: 'offered' }), mission({ id: 'story', title: 'Story', status: 'offered', spineBeat: 'b2' })];
    expect(currentObjective(s, reg)?.missionId).toBe('story');
    s.missions.offered = [mission({ id: 'plain', title: 'Plain', status: 'offered' })];
    expect(currentObjective(s, reg)).toBeNull();
  });

  it('old save objective unchanged: a plain campaign reads exactly as before, with the mission as its source', () => {
    const s = campaign(reg, 4);
    expect(s.onboarding).toBeUndefined();
    expect(s.objectives).toBeUndefined();
    s.day = 5;
    s.missions.active = [mission({ id: 'm', title: 'Hold', deadlineDay: 9 })];
    expect(currentObjective(s, reg)).toEqual({ text: 'Hold', dueDays: 4, missionId: 'm', source: 'mission' });
  });

  it('the prologue step comes first, then the director hint; missions are only the fallback', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.missions.active = [mission({ id: 'm', title: 'Hold', deadlineDay: 9 })];
    expect(currentObjective(s, reg)).toMatchObject({ source: 'prologue', dueDays: null });
    expect(currentObjective(s, reg)!.missionId).toBeUndefined();
    s.onboarding!.done = true;
    s.day = 5;
    s.objectives = [{ id: 'o', text: 'Scout east.', source: 'director', dueDay: 7, done: false }];
    expect(currentObjective(s, reg)).toEqual({ text: 'Scout east.', dueDays: 2, source: 'director' });
    s.objectives[0].done = true;
    expect(currentObjective(s, reg)).toMatchObject({ source: 'mission', missionId: 'm' });
  });

  it('a waiting demand does not push an active mission off the hub (old save)', () => {
    const s = campaign(reg, 4);
    s.day = 5;
    s.missions.active = [mission({ id: 'm', title: 'Hold', deadlineDay: 7 })];
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [{ id: 'd1', unitId: 'unit_ann', status: 'open', text: 't', kind: 'x', day: 1 } as never], demandLog: [] };
    expect(currentObjective(s, reg)).toEqual({ text: 'Hold', dueDays: 2, missionId: 'm', source: 'mission' });
    s.missions.active = [];
    expect(currentObjective(s, reg)).toMatchObject({ source: 'unit', text: 'Ann is waiting for an answer.' });
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

describe('tonightItems: the cut keeps the dynamic (P15, M8)', () => {
  const crowded = (withDynamic: boolean): CampaignState => {
    const s = campaign(reg, 4);
    s.day = 6;
    s.missions = { offered: [], active: [mission({ deadlineDay: 6 })], completed: [] };
    s.calendar.nightEventsQueue = [night(s.squad[0].id, 'we_need_to_talk')];
    for (const u of [s.squad[1], s.squad[2]]) s.dms[u.id] = [{ id: `d${u.id}`, from: u.id, text: 't', day: 1, slot: 'morning', read: false }];
    s.world.incomingUnits = 1;
    s.calendar.shortageStreak = 1;
    s.commander.injuredUntilDay = 9; // eight lines of the older kind
    if (withDynamic) {
      s.content = { enabled: ['restraint'] };
      s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
      s.dynamic.open.claims.push({ id: 'dc1', unitId: s.squad[0].id, domainId: 'device', day: s.day });
      s.dynamic.oversight = { blocked: [], threat: { unitId: s.squad[1].id, untilDay: s.day + 5 } };
    }
    return s;
  };
  it('without the dynamic the first six stay, as before', () => {
    const items = tonightItems(crowded(false), reg);
    expect(items).toHaveLength(6);
    expect(items.map((i) => i.kind)).toEqual(['knock', 'dm', 'dm', 'intake', 'deadline', 'warning']);
  });
  it('with it the older tail is cut first: her ask and oversight\'s threat stay, in their order', () => {
    const items = tonightItems(crowded(true), reg);
    expect(items).toHaveLength(6);
    expect(items.some((i) => i.kind === 'dynamic' && i.analyze === 'glossary:oversight_inquiry')).toBe(true);
    expect(items.some((i) => i.kind === 'dynamic' && i.analyze === 'glossary:claim')).toBe(true);
    expect(items.map((i) => i.kind)).toEqual(['knock', 'dm', 'dm', 'intake', 'dynamic', 'dynamic']);
  });
  it('the threat is the last to go: with the dynamic lines alone over the limit it stays', () => {
    const s = crowded(true);
    for (const u of s.squad) s.dynamic!.open.claims.push({ id: `x${u.id}`, unitId: u.id, domainId: 'device', day: s.day });
    expect(tonightItems(s, reg).some((i) => i.analyze === 'glossary:oversight_inquiry')).toBe(true);
  });
});

describe('tonightItems: a note under the door (P10b)', () => {
  const doorNote = (s: CampaignState, over: Record<string, unknown> = {}) => {
    s.notes = { seq: 1, list: [{ id: 'hn1', unitId: s.squad[0].id, noteId: 'door_plain', where: 'door', text: 'I came by.', day: s.day, ...over }] as never };
    return s;
  };

  it('lists an unread door note from today or yesterday', () => {
    const s = campaign(reg, 4);
    s.day = 5;
    const items = tonightItems(doorNote(s), reg);
    expect(items).toEqual([expect.objectContaining({ kind: 'note', unitId: s.squad[0].id, analyze: 'glossary:hand_note' })]);
    expect(items[0].text).toContain(s.squad[0].displayName);
    const y = campaign(reg, 4);
    y.day = 5;
    expect(tonightItems(doorNote(y, { day: 4 }), reg)).toHaveLength(1);
  });

  it('not a read one, not an older one, not a quarters or gear note, not a unit who is gone', () => {
    const base = () => { const s = campaign(reg, 4); s.day = 5; return s; };
    expect(tonightItems(doorNote(base(), { read: true }), reg)).toEqual([]);
    expect(tonightItems(doorNote(base(), { day: 3 }), reg)).toEqual([]);
    expect(tonightItems(doorNote(base(), { where: 'quarters' }), reg)).toEqual([]);
    expect(tonightItems(doorNote(base(), { where: 'gear' }), reg)).toEqual([]);
    const gone = base();
    gone.squad[0].status = 'dead';
    expect(tonightItems(doorNote(gone), reg)).toEqual([]);
  });

  it('a save with no notes lists no note', () => {
    expect(tonightItems(campaign(reg, 4), reg).some((i) => i.kind === 'note')).toBe(false);
  });
});

describe('endSlotBlock', () => {
  it('is null on a quiet board', () => {
    expect(endSlotBlock(campaign(reg, 4), reg)).toBeNull();
  });

  it('an open scene blocks', () => {
    const s = campaign(reg, 4);
    s.scene = { id: 's', day: 1, slot: 'morning', locationId: 'mess_hall', participants: [], mode: 'private', origin: 'activity', consumesSlot: true, startIndex: 0, exchanges: 0 };
    expect(endSlotBlock(s, reg)).toBe('A conversation is open.');
  });

  it('a pending talk blocks', () => {
    const s = campaign(reg, 4);
    s.calendar.pendingScene = { unitId: s.squad[0].id, day: s.day, slot: s.slot };
    expect(endSlotBlock(s, reg)).toBe('A talk is waiting for its scene.');
  });

  it('an open expedition blocks', () => {
    const s = campaign(reg, 4);
    s.expedition = { party: [] } as unknown as CampaignState['expedition'];
    expect(endSlotBlock(s, reg)).toBe('The squad is out.');
  });

  it('a presented dilemma blocks, a merely requested one does not', () => {
    const s = campaign(reg, 4);
    s.dilemmas = { seq: 1, open: { id: 'd', templateId: 't', scale: 'minor', context: {}, day: 1, status: 'requested', attempts: 0, units: [], beatId: 'b' } as unknown as NonNullable<CampaignState['dilemmas']>['open'] };
    expect(endSlotBlock(s, reg)).toBeNull();
    s.dilemmas.open!.status = 'presented';
    expect(endSlotBlock(s, reg)).toBe('A decision is waiting.');
  });

  it('a night visitor blocks', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    s.calendar.nightEvent = night(s.squad[0].id, 'visit');
    expect(endSlotBlock(s, reg)).toBe('Someone is at the door.');
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

describe('tonightItems: failed generations (P14)', () => {
  const rec = (id: string, siteId: string, over: Record<string, unknown> = {}) => ({
    id, siteId, key: id, reason: 'refused', detail: '', attempts: 1, day: 1, slot: 'morning', at: 1, budgetMult: 1, status: 'open', ...over,
  }) as NonNullable<CampaignState['generations']>['records'][number];
  const failed = (...records: ReturnType<typeof rec>[]): CampaignState => {
    const s = campaign(reg, 4);
    s.generations = { seq: records.length, records };
    return s;
  };

  it('no records, no line', () => {
    expect(tonightItems(campaign(reg, 4), reg).some((i) => i.kind === 'generation')).toBe(false);
    expect(tonightItems(failed(rec('g1', 'scene.digest'), rec('g2', 'scene.summary', { status: 'expired', reason: 'expired' })), reg).some((i) => i.kind === 'generation')).toBe(false);
  });

  it('ends with "2 generations failed." and counts only open full records', () => {
    const s = failed(rec('g1', 'scene.summary'), rec('g2', 'director.tick'), rec('g3', 'flavor.grunt'));
    const items = tonightItems(s, reg);
    expect(items.at(-1)).toEqual({ kind: 'generation', text: '2 generations failed.', tone: 'warn', analyze: 'glossary:generation_record' });
    expect(tonightItems(failed(rec('g1', 'scene.summary')), reg).at(-1)!.text).toBe('1 generation failed.');
  });

  it('keeps the line within six: it takes the last place when the list is full', () => {
    const s = failed(rec('g1', 'scene.summary'), rec('g2', 'director.tick'));
    const names = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
    for (const id of names) s.dms[id] = [{ id: `m_${id}`, from: id, text: 'hey', day: 1, slot: 'morning', read: false }];
    s.world.incomingUnits = 1;
    s.calendar.shortageStreak = 2;
    s.commander.injuredUntilDay = s.day + 3;
    const items = tonightItems(s, reg);
    expect(items).toHaveLength(6);
    expect(items.at(-1)!.kind).toBe('generation');
    expect(items.filter((i) => i.kind === 'generation')).toHaveLength(1);
  });
});
