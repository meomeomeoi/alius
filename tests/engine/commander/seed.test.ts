import { describe, it, expect, beforeAll } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import '../../../src/engine/actions/commander';
import { commanderProfile, daysKnown } from '../../../src/engine/commander/profile';
import type { CampaignState } from '../../../src/engine/state/types';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** A campaign as P6 left it: no P7 field anywhere. */
function p6Save(): CampaignState {
  const s = campaign(reg, 3);
  for (const k of ['body', 'bodyXp', 'expression', 'seasoning', 'traits', 'archetype', 'fileReviewed', 'sleeplessDay'] as const) delete s.commander[k];
  for (const r of Object.values(s.relations)) delete r.metDay;
  return s;
}

describe('commander/seed', () => {
  it('seed fills a P6 fixture commander and back-fills metDay from history', () => {
    const s0 = p6Save();
    const [a, b, c] = s0.squad.map((u) => u.id);
    s0.day = 20;
    s0.relations[a].stateSince = 9;
    s0.relations[a].history = [{ day: 4, kind: 'event', type: 'comforted' }, { day: 12, kind: 'event', type: 'coerced' }];
    s0.relations[b].stateSince = 6;
    s0.relations[b].history = [{ day: 15, kind: 'event', type: 'comforted' }];
    s0.relations[c].stateSince = 1;
    const { state, events } = run(s0, reg, { type: 'commander/seed', payload: {} });
    expect(errors(events)).toEqual([]);
    expect(ofType(events, 'commander_seeded')).toHaveLength(1);
    expect(state.commander.body).toEqual({ strength: 3, endurance: 3, reflexes: 2 });
    expect(state.commander).toMatchObject({ expression: 3, seasoning: 3, archetype: 'average', fileReviewed: false, traits: { regular: [] } });
    expect(state.relations[a].metDay).toBe(4);
    expect(state.relations[b].metDay).toBe(6);
    expect(state.relations[c].metDay).toBe(1);
  });

  it('seed is idempotent', () => {
    const once = run(p6Save(), reg, { type: 'commander/seed', payload: {} }).state;
    const twice = run(once, reg, { type: 'commander/seed', payload: {} });
    expect(twice.state).toEqual(once);
    expect(ofType(twice.events, 'commander_seeded')).toHaveLength(0);
  });

  it('seed never touches an already reviewed new campaign', () => {
    const s = campaign(reg, 2);
    const { state } = run(s, reg, { type: 'commander/seed', payload: {} });
    expect(state.commander.fileReviewed).toBe(true);
  });

  it('readers survive a P6 save before seeding', () => {
    const s = p6Save();
    s.day = 10;
    expect(commanderProfile(s).archetype).toBe('average');
    expect(daysKnown(s, s.squad[0].id)).toBe(9);
    expect(daysKnown(s, 'nobody')).toBe(9);
  });

  it('daysKnown never goes below 0', () => {
    const s = campaign(reg, 1);
    s.relations[s.squad[0].id].metDay = 50;
    expect(daysKnown(s, s.squad[0].id)).toBe(0);
  });
});

describe('commander/set_profile and review_done', () => {
  const seeded = () => run(p6Save(), reg, { type: 'commander/seed', payload: {} }).state;
  const good = { body: { strength: 4, endurance: 2, reflexes: 2 }, expression: 2, seasoning: 4, traits: { regular: [] } };

  it('set_profile applies and marks the file reviewed', () => {
    const { state, events } = run(seeded(), reg, { type: 'commander/set_profile', payload: { commander: good } });
    expect(errors(events)).toEqual([]);
    expect(state.commander).toMatchObject({ body: good.body, expression: 2, seasoning: 4, archetype: 'average', fileReviewed: true });
  });

  it('set_profile is refused once reviewed', () => {
    const s = campaign(reg, 1); // fileReviewed: true
    const { state, events } = run(s, reg, { type: 'commander/set_profile', payload: { commander: good } });
    expect(errors(events)).toHaveLength(1);
    expect(state).toEqual(s);
  });

  it('set_profile with a 5 changes nothing', () => {
    const s = seeded();
    const { state, events } = run(s, reg, { type: 'commander/set_profile', payload: { commander: { ...good, body: { strength: 5, endurance: 1, reflexes: 1 } } } });
    expect(errors(events)).toHaveLength(1);
    expect(state).toEqual(s);
  });

  it('review_done marks reviewed', () => {
    const { state } = run(seeded(), reg, { type: 'commander/review_done', payload: {} });
    expect(state.commander.fileReviewed).toBe(true);
    expect(state.commander.body).toEqual({ strength: 3, endurance: 3, reflexes: 2 });
  });
});

describe('metDay', () => {
  it('a new relation has metDay = its join day', async () => {
    const s = campaign(reg, 2);
    for (const r of Object.values(s.relations)) expect(r.metDay).toBe(1);
  });
});
