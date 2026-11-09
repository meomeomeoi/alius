import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx } from '../../../src/engine/combat/effects';
import { usableSkills } from '../../../src/engine/combat/skills';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { PlannedAction, StartPayload } from '../../../src/engine/combat/types';
import type { Action, EngineEvent } from '../../../src/engine/dispatch';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const start = (s: CampaignState, enemies = [{ enemyId: 'husk', level: 1, affixes: [] as string[] }], over: Partial<StartPayload> = {}): Action => ({
  type: 'combat/start',
  payload: { encounter: { enemies, danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds), ...over },
});

/** The first usable skill on its first legal target for whoever the combat waits for. */
function pick(s: CampaignState): PlannedAction {
  const cs = s.combat!;
  const ctx = makeCtx(structuredClone(cs), s, reg, new Rng(s.rng));
  const best = usableSkills(ctx, cs.awaitingCid!)[0];
  return { kind: 'skill', skillId: best.skill.id, targetCid: best.targets[0] };
}

function play(s: CampaignState, maxActs = 100): { state: CampaignState; events: EngineEvent[] } {
  let cur = s;
  let all: EngineEvent[] = [];
  for (let i = 0; i < maxActs && cur.combat?.phase === 'awaiting'; i++) {
    const r = run(cur, reg, { type: 'combat/act', payload: { action: pick(cur) } });
    expect(errors(r.events)).toEqual([]);
    cur = r.state;
    all = all.concat(r.events);
  }
  return { state: cur, events: all };
}

describe('combat/start', () => {
  it('builds the combat, runs to the first squad decision and reports it', () => {
    const r = run(base, reg, start(base));
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat!.phase).toBe('awaiting');
    expect(ofType(r.events, 'combat_started')).toHaveLength(1);
    expect(ofType(r.events, 'combat_log')).toHaveLength(1);
    const waiting = ofType(r.events, 'combat_awaiting');
    expect(waiting).toHaveLength(1);
    expect(waiting[0].cid).toBe(r.state.combat!.awaitingCid);
    expect(r.state.combat!.round).toBe(1);
    expect(r.state.combat!.timeline.length).toBe(5);
  });

  it('each rejection leaves the state unchanged', () => {
    const bad: Array<[string, Action]> = [
      ['five units', start(base, undefined, { formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee', 'unit_eve'] } })],
      ['four in a row', start(base, undefined, { formation: { front: ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'], back: [] } })],
      ['unknown enemy', start(base, [{ enemyId: 'nobody', level: 1, affixes: [] }])],
      ['crisis without cover', start(base, undefined, { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true } })],
      ['no payload', { type: 'combat/start' }],
    ];
    for (const [name, action] of bad) {
      const r = run(base, reg, action);
      expect(errors(r.events), name).toHaveLength(1);
      expect(r.state, name).toBe(base);
    }
    const injured = structuredClone(base);
    injured.squad[0].status = 'injured';
    expect(run(injured, reg, start(base)).state).toBe(injured);
    const reserve = structuredClone(base);
    reserve.squad[0].status = 'reserve';
    expect(errors(run(reserve, reg, start(base)).events)).toHaveLength(1);
  });

  it('refuses a second combat while one is open', () => {
    const open = run(base, reg, start(base)).state;
    const r = run(open, reg, start(base));
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(open);
  });

  it('only state.combat and state.rng change during a combat', () => {
    const brutes = Array.from({ length: 3 }, () => ({ enemyId: 'brute', level: 3, affixes: [] as string[] }));
    const open = run(base, reg, start(base, brutes)).state;
    const { state } = play(open, 2);
    expect(state.combat!.phase).toBe('awaiting');
    const strip = (s: CampaignState) => { const { combat: _c, rng: _r, ...rest } = s; return JSON.stringify(rest); };
    expect(strip(state)).toBe(strip(base));
    expect(JSON.stringify(state.rng)).not.toBe(JSON.stringify(base.rng));
  });
});

describe('combat/act', () => {
  it('is refused without a combat, in a decided combat and for a bad action', () => {
    expect(errors(run(base, reg, { type: 'combat/act', payload: { action: { kind: 'pass' } } }).events)).toHaveLength(1);
    const open = run(base, reg, start(base)).state;
    for (const payload of [{}, { action: { kind: 'dance' } }, { action: { kind: 'skill', skillId: 'as_strike', targetCid: 'nobody' } }]) {
      const r = run(open, reg, { type: 'combat/act', payload });
      expect(errors(r.events), JSON.stringify(payload)).toHaveLength(1);
      expect(r.state).toBe(open);
    }
  });

  it('an illegal target is rejected without any change', () => {
    const open = run(base, reg, start(base, [{ enemyId: 'husk', level: 1, affixes: [] }, { enemyId: 'scav_marksman', level: 1, affixes: [] }])).state;
    const waiting = open.combat!.awaitingCid!;
    const back = open.combat!.combatants.find((c) => c.side === 'enemy' && c.row === 'back')!;
    const r = run(open, reg, { type: 'combat/act', payload: { action: { kind: 'skill', skillId: 'as_strike', targetCid: back.cid } } });
    expect(waiting).toBeTruthy();
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(open);
  });

  it('plays a full combat to a decision, passing the turn to the enemies in between', () => {
    const open = run(base, reg, start(base)).state;
    const { state, events } = play(open);
    expect(state.combat).toBeUndefined(); // a decided combat is written back at once
    expect(state.lastCombat!.outcome).toBe('won');
    expect(ofType(events, 'combat_ended')[0].outcome).toBe('won');
    expect(state.lastCombat!.log.length).toBeGreaterThan(3);
  });

  it('continues identically after a JSON round trip', () => {
    const open = run(base, reg, start(base, [{ enemyId: 'raider', level: 2, affixes: [] }, { enemyId: 'brute', level: 2, affixes: [] }])).state;
    const a = play(open, 4).state;
    const b = play(JSON.parse(JSON.stringify(open)) as CampaignState, 4).state;
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)));
    const roundTrip = JSON.parse(JSON.stringify(a)) as CampaignState;
    expect(play(roundTrip, 4).state).toEqual(play(a, 4).state);
  });

  it('guard and swap are legal choices; swap moves the unit to the other row', () => {
    const open = run(base, reg, start(base)).state;
    const cid = open.combat!.awaitingCid!;
    const before = open.combat!.combatants.find((c) => c.cid === cid)!.row;
    const swapped = run(open, reg, { type: 'combat/act', payload: { action: { kind: 'swap' } } });
    expect(errors(swapped.events)).toEqual([]);
    expect(swapped.state.combat!.combatants.find((c) => c.cid === cid)!.row).not.toBe(before);
    const guarded = run(open, reg, { type: 'combat/act', payload: { action: { kind: 'guard' } } });
    expect(guarded.state.combat!.combatants.find((c) => c.cid === cid)!.statuses.some((s) => s.id === 'guard')).toBe(true);
  });
});
