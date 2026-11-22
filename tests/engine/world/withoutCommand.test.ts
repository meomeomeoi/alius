import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx } from '../../../src/engine/combat/effects';
import { usableSkills } from '../../../src/engine/combat/skills';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { PlannedAction, StartPayload } from '../../../src/engine/combat/types';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { eventOptions, squadChoice } from '../../../src/engine/world/expedition';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const ANN = 'unit_ann';
const NODE = 'n0_0';
const option = (label: string, effects: unknown[], extra: Record<string, unknown> = {}) => ({ label, effects, ...extra });
const regsOf = (...templates: unknown[]): Registries => ({ ...reg, dilemmaTemplates: new Map(templates.map((t) => [(t as { id: string }).id, t as never])) });
const template = (id: string, options: unknown[]) => ({ id, scale: 'minor', contexts: ['expedition_event'], fixed: { title: 'The ridge', setup: 'S', options } });

/** A run in quarantine_d7 with an event node first; `without` marks it as a run without the commander (what an open keep alarm lets the action do). */
function runOf(without: boolean): CampaignState {
  const { state, mission } = withMission(reg, base);
  for (const u of state.squad) u.defects = [];
  const s = structuredClone(depart(reg, state, mission.id, { supplies: 4 }));
  s.expedition!.map.nodes[NODE].type = 'event';
  if (without) s.expedition!.withoutCommand = { holderId: ANN };
  return s;
}
const move = (s: CampaignState, regs: Registries) => run(s, regs, { type: 'expedition/move', payload: { nodeId: NODE } });

describe('event nodes are the squad\'s', () => {
  const social = option('Talk them down', [{ type: 'party_stress', amount: -5 }], { requires: { stat: 'authority', rank: 1 } });
  const plain = option('Wait it out', [{ type: 'party_stress', amount: 7 }]);
  let regs: Registries;
  beforeAll(() => { regs = regsOf(template('evt_squad', [social, plain])); });

  it('the first option that does not need the commander is applied at entry and the node waits for ACKNOWLEDGE; no run dilemma is asked for', () => {
    const s = runOf(true);
    const stress = s.squad.map((u) => u.stress);
    const r = move(s, regs);
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.pending).toMatchObject({ kind: 'event', nodeId: NODE, templateId: 'evt_squad', squadCall: { index: 1 } });
    expect(exp.phase).toBe('event');
    expect(ofType(r.events, 'expedition_event')).toEqual([]); // the app opens a run dilemma only on this event
    expect(ofType(r.events, 'expedition_choice')).toMatchObject([{ nodeId: NODE, option: 1, label: 'Wait it out', squadCall: true }]);
    expect(exp.party.map((id) => r.state.squad.find((u) => u.id === id)!.stress)).toEqual(exp.party.map((id) => Math.min(100, stress[s.squad.findIndex((u) => u.id === id)] + 7))); // its effect has applied
    expect(exp.log.at(-1)).toMatchObject({ kind: 'event', nodeId: NODE });
    expect(errors(run(r.state, regs, { type: 'expedition/choose', payload: { option: 0 } }).events)).toMatchObject([{ message: expect.stringContaining('squad has already decided') }]);
    const ack = run(r.state, regs, { type: 'expedition/ack_squad_call', payload: {} });
    expect(errors(ack.events)).toEqual([]);
    expect(ofType(ack.events, 'squad_call_acknowledged')).toMatchObject([{ nodeId: NODE }]);
    expect(ack.state.expedition!.pending).toBeUndefined();
    expect(ack.state.expedition!.phase).toBe('travel');
    expect(errors(run(ack.state, regs, { type: 'expedition/ack_squad_call', payload: {} }).events)).toHaveLength(1); // nothing left to acknowledge
  });

  it('a normal run is unchanged: the same node asks for a decision and the event says so', () => {
    const r = move(runOf(false), regs);
    expect(ofType(r.events, 'expedition_event')).toMatchObject([{ nodeId: NODE, templateId: 'evt_squad' }]);
    expect(r.state.expedition!.pending).toEqual({ kind: 'event', nodeId: NODE, templateId: 'evt_squad' });
    expect(errors(run(r.state, regs, { type: 'expedition/ack_squad_call', payload: {} }).events)).toHaveLength(1);
  });

  it('squadChoice skips every option that needs the commander (a social requirement, a routed one) and every one the squad cannot afford; none left is "Nothing here."', () => {
    const routed = option('Work it out', [], { routeCheck: { id: 'pry', routes: [{ kind: 'body', stat: 'strength', min: 1 }] } });
    const dear = option('Pay them', [{ type: 'carried_supplies', amount: -99 }]);
    const only = regsOf(template('evt_none', [social, routed, dear]));
    const none = move(runOf(true), only);
    expect(errors(none.events)).toEqual([]);
    expect(none.state.expedition!.pending).toBeUndefined();
    expect(none.state.expedition!.phase).toBe('travel');
    expect(none.state.expedition!.log.at(-1)).toMatchObject({ kind: 'event', text: 'Nothing here.' });
    const s = runOf(true);
    const entered = structuredClone(s);
    entered.expedition!.pending = { kind: 'event', nodeId: NODE, templateId: 'evt_squad' };
    entered.expedition!.phase = 'event';
    expect(squadChoice(entered, regs)).toBe(1);
    expect(squadChoice(runOf(true), regs)).toBeNull(); // no event is pending
    expect(eventOptions(entered, regs).map((o) => o.disabled === null)).toEqual([true, true]);
  });

  it('a node whose only option asks nothing of the commander still waits for ACKNOWLEDGE', () => {
    const s = runOf(true);
    const r = move(s, regsOf(template('evt_squad', [plain])));
    expect(r.state.expedition!.pending).toMatchObject({ squadCall: { index: 0 } });
    expect(run(r.state, regs, { type: 'expedition/ack_squad_call', payload: {} }).state.expedition!.pending).toBeUndefined();
  });

  it('the report carries the flag, and a run without it carries none', () => {
    const r = run(runOf(true), reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastExpedition!.withoutCommand).toEqual({ holderId: ANN });
    const normal = run(runOf(false), reg, { type: 'expedition/retreat', payload: {} });
    expect(normal.state.lastExpedition).not.toHaveProperty('withoutCommand');
  });
});

describe('combat without the commander', () => {
  const STRONG = Array.from({ length: 6 }, () => ({ enemyId: 'husk', level: 30, affixes: [] as string[] }));
  const start = (s: CampaignState, over: Partial<StartPayload> = {}) => run(s, reg, {
    type: 'combat/start',
    payload: { encounter: { enemies: STRONG, danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds), expedition: true, ...over },
  });
  const pick = (s: CampaignState): PlannedAction => {
    const cs = s.combat!;
    const ctx = makeCtx(structuredClone(cs), s, reg, new Rng(s.rng));
    const best = usableSkills(ctx, cs.awaitingCid!)[0];
    return { kind: 'skill', skillId: best.skill.id, targetCid: best.targets[0] };
  };

  it('starts at CP 0 and stays there for three rounds; no commander is in it, even when the encounter exposes one', () => {
    const open = runOf(true);
    open.expedition!.phase = 'combat';
    const r = start(open, { encounter: { enemies: STRONG, danger: 1, exposesCommander: true } });
    expect(errors(r.events)).toEqual([]);
    let cur = r.state;
    expect(cur.combat!.cp).toBe(0);
    expect(cur.combat!.commander).toBeUndefined();
    expect(cur.combat!.presence).toBeUndefined();
    const rounds = new Set<number>();
    for (let i = 0; i < 80 && cur.combat?.phase === 'awaiting' && rounds.size < 4; i++) {
      rounds.add(cur.combat.round);
      expect(cur.combat.cp, `round ${cur.combat.round}`).toBe(0);
      const a = run(cur, reg, { type: 'combat/act', payload: { action: pick(cur) } });
      expect(errors(a.events)).toEqual([]);
      cur = a.state;
    }
    expect(rounds.size).toBeGreaterThanOrEqual(3);
  });

  it('every order is refused ("The commander is not with the squad."), a compel is refused, the presence action is not there; a 0-CP skill works', () => {
    const open = runOf(true);
    const s = start(open).state;
    const cid = s.combat!.combatants.find((c) => c.side === 'squad')!.cid;
    for (const orderId of ['steady', 'hold_the_line']) {
      const target = cid;
      expect(errors(run(s, reg, { type: 'combat/order', payload: { orderId, targetCid: target } }).events), orderId).toMatchObject([{ message: 'The commander is not with the squad.' }]);
    }
    expect(errors(run(s, reg, { type: 'combat/compel', payload: {} }).events)).toMatchObject([{ message: 'The commander is not with the squad.' }]);
    expect(errors(run(s, reg, { type: 'combat/presence', payload: {} }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'combat/act', payload: { action: pick(s) } }).events)).toEqual([]);
  });

  it('a normal run in the same state is unchanged: CP above 0, a commander only when exposed with a cover', () => {
    const s = start(runOf(false)).state;
    expect(s.combat!.cp).toBeGreaterThan(0);
    expect(s.combat!.presence).toBeDefined();
    const exposed = runOf(false);
    expect(errors(start(exposed, { encounter: { enemies: STRONG, danger: 1, exposesCommander: true } }).events)).toHaveLength(1); // a cover is still required
    const ids = exposed.roster.activeIds;
    const covered = start(exposed, { encounter: { enemies: STRONG, danger: 1, exposesCommander: true }, coverId: ids[0] });
    expect(errors(covered.events)).toEqual([]);
    expect(covered.state.combat!.commander).toBeDefined();
  });
});
