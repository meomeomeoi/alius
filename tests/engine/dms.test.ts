import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { initiativeChance, pushMessage, rollInitiative, threadOf, unreadCount, dmMode } from '../../src/engine/dms';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const fresh = (): CampaignState => campaign(reg, 4);
const send = (s: CampaignState, unitId: string, text = 'hello') => run(s, reg, { type: 'dm/send', payload: { unitId, text } });
const receive = (s: CampaignState, unitId: string, text = 'hi', initiated = false) => run(s, reg, { type: 'dm/receive', payload: { unitId, text, initiated } });

describe('dm/send', () => {
  it('records the message and counts the battery', () => {
    const r = send(fresh(), ANN, '  are you awake?  ');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dms[ANN]).toMatchObject([{ from: 'commander', text: 'are you awake?', day: 1, slot: 'morning', read: true }]);
    expect(r.state.dmMeta![ANN]).toEqual({ day: 1, sent: 1 });
    expect(ofType(r.events, 'dm_sent')).toEqual([{ type: 'dm_sent', unitId: ANN, mode: 'reply' }]);
  });
  it('fifth message today snaps, seventh is ignored, next day resets', () => {
    let s = fresh();
    const modes: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = send(s, ANN, `m${i}`);
      s = r.state;
      modes.push(String(ofType(r.events, 'dm_sent')[0].mode));
    }
    expect(modes).toEqual(['reply', 'reply', 'reply', 'reply', 'snap', 'snap', 'ignore']);
    s.day = 2;
    expect(String(ofType(send(s, ANN).events, 'dm_sent')[0].mode)).toBe('reply');
    expect(send(s, ANN).state.dmMeta![ANN]).toEqual({ day: 2, sent: 1 });
    expect(dmMode(s, BEA)).toBe('reply');
  });
  it('other units keep their own battery', () => {
    let s = fresh();
    for (let i = 0; i < 7; i++) s = send(s, ANN).state;
    expect(String(ofType(send(s, BEA).events, 'dm_sent')[0].mode)).toBe('reply');
  });
  it('threads keep the last 40', () => {
    let s = fresh();
    for (let i = 0; i < 50; i++) pushMessage(s, ANN, { from: ANN, text: `m${i}`, day: 1, slot: 'morning', read: true });
    s = structuredClone(s);
    expect(threadOf(s, ANN)).toHaveLength(TUNING.comms.threadMax);
    expect(threadOf(s, ANN)[0].text).toBe('m10');
    expect(threadOf(s, ANN).at(-1)!.text).toBe('m49');
    expect(threadOf(s, BEA)).toEqual([]);
  });
  it('grunts, dead units, empty and overlong text cannot be sent', () => {
    const s = fresh();
    s.squad.find((u) => u.id === DEE)!.status = 'dead';
    for (const [unitId, text] of [[DEE, 'x'], ['ghost', 'x'], [ANN, '   '], [ANN, 'x'.repeat(1001)]] as const) {
      const r = send(s, unitId, text);
      expect(r.state).toBe(s);
      expect(errors(r.events)).toHaveLength(1);
    }
    const g = run(s, reg, { type: 'base/recruit_grunt', payload: {} });
    const grunt = g.state.squad.find((u) => u.kind === 'grunt');
    if (grunt) expect(errors(send(g.state, grunt.id).events)).toHaveLength(1);
  });
});

describe('dm/receive, dm/read and the unread counter', () => {
  it('unread counter counts only her unread messages', () => {
    let s = fresh();
    expect(unreadCount(s)).toBe(0);
    s = send(s, ANN).state;
    expect(unreadCount(s)).toBe(0);
    s = receive(s, ANN, 'yes').state;
    s = receive(s, BEA, 'hey', true).state;
    s = receive(s, BEA, 'again').state;
    expect(unreadCount(s)).toBe(3);
    expect(s.dms[BEA][0]).toMatchObject({ from: BEA, initiated: true, read: false });
    expect(s.dms[BEA][1].initiated).toBeUndefined();
  });
  it('dm/read clears the unread mark of that thread only', () => {
    let s = fresh();
    s = receive(s, ANN).state;
    s = receive(s, BEA).state;
    s = run(s, reg, { type: 'dm/read', payload: { unitId: ANN } }).state;
    expect(unreadCount(s)).toBe(1);
    expect(s.dms[ANN].every((m) => m.read)).toBe(true);
    expect(errors(run(s, reg, { type: 'dm/read', payload: { unitId: 'ghost' } }).events)).toHaveLength(1);
  });
  it('receive needs a named living unit and text', () => {
    const s = fresh();
    expect(errors(receive(s, 'ghost').events)).toHaveLength(1);
    expect(errors(receive(s, ANN, '').events)).toHaveLength(1);
  });
  it('receiving re-evaluates the automatic states', () => {
    const s = fresh();
    Object.assign(s.relations[ANN], { stateId: 'stranger', trust: 25 });
    expect(receive(s, ANN).state.relations[ANN].stateId).toBe('comrade');
  });
});

describe('initiative', () => {
  const always = { chance: () => true, int: (_a: number, b: number) => b } as unknown as Rng;
  it('initiativeChance uses the state, the setting and the defect bonus', () => {
    const s = fresh();
    s.relations[ANN].stateId = 'lover';
    expect(initiativeChance(s, reg, ANN)).toBeCloseTo(0.3);
    s.settings.intimacy = { romance: true, initiative: 'high' };
    expect(initiativeChance(s, reg, ANN)).toBeCloseTo(0.45);
    s.settings.intimacy = { romance: true, initiative: 'low' };
    expect(initiativeChance(s, reg, ANN)).toBeCloseTo(0.15);
    s.squad.find((u) => u.id === BEA)!.defects = [{ id: 'imprint_hunger' }];
    s.relations[BEA].stateId = 'comrade';
    expect(initiativeChance(s, reg, BEA)).toBeCloseTo(0.05 * 0.5 + 0.1);
    expect(initiativeChance(s, reg, 'ghost')).toBe(0);
  });
  it('romance off removes romantic initiative', () => {
    const s = fresh();
    s.relations[ANN].stateId = 'lover';
    s.settings.intimacy = { romance: false, initiative: 'med' };
    expect(initiativeChance(s, reg, ANN)).toBe(0);
    expect(rollInitiative(s, reg, always)).not.toContain(ANN);
  });
  it('lover rolls more often than comrade over 1000 seeded rolls', () => {
    const s = fresh();
    s.relations[ANN].stateId = 'lover';
    for (const id of [BEA, CAT, DEE]) s.relations[id].stateId = 'comrade';
    const rng = new Rng(s.rng);
    const count: Record<string, number> = { [ANN]: 0, [BEA]: 0 };
    for (let i = 0; i < 1000; i++) for (const id of rollInitiative(s, reg, rng)) if (id in count) count[id]++;
    expect(count[ANN]).toBeGreaterThan(count[BEA] * 3);
    expect(count[ANN]).toBeGreaterThan(150);
  });
  it('at most two initiators per slot', () => {
    const s = fresh();
    expect(rollInitiative(s, reg, always)).toHaveLength(TUNING.comms.maxInitiatedPerSlot);
  });
  it('a unit waiting on an unanswered message is skipped', () => {
    const s = fresh();
    pushMessage(s, ANN, { from: ANN, text: 'hey', day: 1, slot: 'morning', read: false, initiated: true });
    expect(rollInitiative(s, reg, always)).not.toContain(ANN);
    pushMessage(s, ANN, { from: 'commander', text: 'hi', day: 1, slot: 'morning', read: true });
    expect(rollInitiative(s, reg, always)).toContain(ANN);
  });
  it('grunts, dead and deserted units never initiate', () => {
    const s = fresh();
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    s.squad.find((u) => u.id === BEA)!.status = 'deserted';
    const out = rollInitiative(s, reg, always);
    expect(out).not.toContain(ANN);
    expect(out).not.toContain(BEA);
  });
  it('dm/roll_initiative reports the units and advances the rng', () => {
    const r = run(fresh(), reg, { type: 'dm/roll_initiative', payload: {} });
    expect(ofType(r.events, 'dm_initiative')).toHaveLength(1);
    expect(r.state.rng).not.toEqual(fresh().rng);
  });
});
