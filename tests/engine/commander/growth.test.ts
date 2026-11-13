import { describe, it, expect, beforeAll } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import '../../../src/engine/actions/commander';
import { addBodyXp, commanderProfile } from '../../../src/engine/commander/profile';
import type { BodyStat, CampaignState } from '../../../src/engine/state/types';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** A commander whose body is `v` in every stat, no XP. */
function withBody(v: number): CampaignState {
  const s = campaign(reg, 2);
  s.commander.body = { strength: v, endurance: v, reflexes: v };
  s.commander.bodyXp = { strength: 0, endurance: 0, reflexes: 0 };
  return s;
}

/** One body training session; the slot is reset so sessions can follow each other. */
function train(s: CampaignState, focus: string): { state: CampaignState; events: ReturnType<typeof run>['events'] } {
  s.slot = 'morning';
  return run(s, reg, { type: 'activity/do', payload: { activityId: 'train', focus } });
}

describe('addBodyXp', () => {
  it('xp carries over a step', () => {
    const s = withBody(1);
    const r = addBodyXp(s.commander, 'strength', 40); // a step from 1 costs 30
    expect(r).toEqual({ value: 2, gained: true });
    expect(s.commander.body!.strength).toBe(2);
    expect(s.commander.bodyXp!.strength).toBe(10);
  });

  it('one amount can cross two steps', () => {
    const s = withBody(1);
    expect(addBodyXp(s.commander, 'reflexes', 100)).toEqual({ value: 3, gained: true }); // 30 + 60 = 90, 10 left
    expect(s.commander.bodyXp!.reflexes).toBe(10);
  });

  it('training a stat at 5 changes nothing', () => {
    const s = withBody(5);
    expect(addBodyXp(s.commander, 'endurance', 50)).toEqual({ value: 5, gained: false });
    expect(s.commander.body!.endurance).toBe(5);
    expect(s.commander.bodyXp!.endurance).toBe(0);
  });

  it('the archetype follows a raised stat', () => {
    const s = withBody(1); // sum 3: frail
    s.commander.body = { strength: 2, endurance: 1, reflexes: 2 }; // sum 5: slight
    s.commander.archetype = 'slight';
    s.commander.bodyXp = { strength: 0, endurance: 0, reflexes: 0 };
    addBodyXp(s.commander, 'endurance', 30); // 1 → 2, sum 6
    addBodyXp(s.commander, 'strength', 60); // 2 → 3, sum 7: average
    expect(s.commander.archetype).toBe('average');
    expect(commanderProfile(s).archetype).toBe('average');
  });
});

describe('train with a body focus', () => {
  it('three sessions raise strength 1 → 2', () => {
    let s = withBody(1);
    for (let i = 0; i < 2; i++) {
      const r = train(s, 'body_strength');
      expect(errors(r.events)).toEqual([]);
      expect(r.state.commander.body!.strength).toBe(1);
      s = r.state;
    }
    const r = train(s, 'body_strength');
    expect(r.state.commander.body!.strength).toBe(2);
    expect(r.state.commander.bodyXp!.strength).toBe(0);
    expect(ofType(r.events, 'body_trained')).toEqual([expect.objectContaining({ stat: 'strength', value: 2, raised: true })]);
  });

  it('six more raise 2 → 3', () => {
    let s = withBody(2);
    for (let i = 0; i < 5; i++) s = train(s, 'body_endurance').state;
    expect(s.commander.body!.endurance).toBe(2);
    s = train(s, 'body_endurance').state;
    expect(s.commander.body!.endurance).toBe(3);
  });

  it('train with focus body_reflexes needs no units', () => {
    const s = withBody(2);
    const r = train(s, 'body_reflexes');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.bodyXp!.reflexes).toBe(10);
    expect(r.state.slot).toBe('afternoon'); // the slot was spent
  });

  it('a session on a stat at 5 spends the slot and changes nothing', () => {
    const s = withBody(5);
    const r = train(s, 'body_strength');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.body!.strength).toBe(5);
    expect(ofType(r.events, 'body_trained')).toEqual([expect.objectContaining({ raised: false })]);
  });

  it('the commander injured blocks body training', () => {
    const s = withBody(2);
    s.commander.injuredUntilDay = s.day + 2;
    const r = train(s, 'body_strength');
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state.commander.bodyXp!.strength).toBe(0);
  });

  it('the three body focuses are labelled', () => {
    const labels = (reg.activities.get('train')!.focus as Array<{ id: string; label: string }>).filter((f) => f.id.startsWith('body_'));
    expect(labels.map((f) => [f.id, f.label])).toEqual([
      ['body_strength', 'Body: strength'], ['body_endurance', 'Body: endurance'], ['body_reflexes', 'Body: reflexes'],
    ]);
  });

  it('a companion train never trains the body', () => {
    const s = withBody(2);
    s.slot = 'morning';
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', companionId: s.squad[0].id } });
    expect(ofType(r.events, 'body_trained')).toHaveLength(0);
    expect(r.state.commander.bodyXp).toEqual({ strength: 0, endurance: 0, reflexes: 0 });
  });
});

describe('stat names', () => {
  it('every body stat can be trained', () => {
    for (const stat of ['strength', 'endurance', 'reflexes'] as BodyStat[]) {
      const r = train(withBody(1), `body_${stat}`);
      expect(r.state.commander.bodyXp![stat]).toBe(10);
    }
  });
});
