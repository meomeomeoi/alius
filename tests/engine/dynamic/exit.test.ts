import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EngineCtx } from '../../../src/engine/dispatch';
import { compel } from '../../../src/engine/leash/use';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/discipline';
import { forgetDynamic } from '../../../src/engine/dynamic/forget';
import { exitCostWord, exitDynamic, exitSeverity } from '../../../src/engine/dynamic/exit';
import { dynamicIntentInput } from '../../../src/engine/dynamic/intents';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { TUNING } from '../../../src/engine/tuning';
import type { Frame } from '../../../src/engine/dynamic/types';
import { romanceStepDown } from '../../../src/engine/relations/graph';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = (attachment: 'steady' | 'intense' = 'steady') => ({
  leadStyle: 'dominant' as const, attachment, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds at `frame` with `hold` and `domains`; Bea too when `bea` is given. */
function world(frame: Frame, hold: number, domains: string[] = [], bea?: { frame: Frame; hold: number; domains?: string[] }): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = practice();
  unitOf(s, BEA).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold, domains: domains.map((id) => ({ id, since: 1 })), tracks: { restraint: { xp: 30, level: 2 } } };
  if (bea !== undefined) s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: bea.frame, hold: bea.hold, domains: (bea.domains ?? []).map((id) => ({ id, since: 1 })) };
  return s;
}
const dyn = (s: CampaignState, id = ANN) => dynamicOf(s, id)!;
const exit = (s: CampaignState, payload: Record<string, unknown>) => run(s, reg, { type: 'dynamic/exit', payload: { unitId: ANN, ...payload } });
const exitEvent = (events: Array<{ type: string; [k: string]: unknown }>) => events.find((e) => e.type === 'dynamic_exit')!;

describe('what an exit costs', () => {
  it('play with hold 30: minor', () => {
    const s = world('play', 30);
    expect(exitSeverity(s, reg, ANN, 'abrupt')).toBe('minor');
    const r = exit(s, { route: 'abrupt' });
    expect(errors(r.events)).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ unitId: ANN, route: 'abrupt', severity: 'minor', sworn: false });
    expect(exitCostWord(s, reg, ANN, 'abrupt')).toBe('nearly free');
  });

  it('role with two domains: major', () => {
    const s = world('role', 50, ['private_time', 'body']);
    expect(exitSeverity(s, reg, ANN, 'abrupt')).toBe('major');
    expect(exitSeverity(world('role', 50, ['private_time']), reg, ANN, 'abrupt')).toBe('moderate');
    expect(exitSeverity(world('rule', 70, ['private_time']), reg, ANN, 'abrupt')).toBe('major');
    expect(exitSeverity(world('play', 45), reg, ANN, 'abrupt')).toBe('moderate'); // no longer nearly free
  });

  it('a clean exit is one step lighter and a forced one two steps heavier (never past extreme or below minor)', () => {
    const s = world('role', 50, ['private_time', 'body']);
    expect(exitSeverity(s, reg, ANN, 'negotiated', true)).toBe('moderate');
    expect(exitSeverity(s, reg, ANN, 'force')).toBe('extreme');
    expect(exitSeverity(world('play', 30), reg, ANN, 'negotiated', true)).toBe('minor');
    expect(exitSeverity(world('rule', 90, ['private_time', 'body', 'device', 'household']), reg, ANN, 'force')).toBe('extreme');
  });

  it('sworn: extreme and a pinned fact (a break)', () => {
    const s = world('role', 65);
    dyn(s).sworn = { day: 3 };
    expect(exitSeverity(s, reg, ANN, 'abrupt')).toBe('extreme');
    expect(exitSeverity(s, reg, ANN, 'negotiated', true)).toBe('major'); // clean is a step lighter, still a break
    const r = exit(s, { route: 'abrupt' });
    expect(errors(r.events)).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ severity: 'extreme', sworn: true });
    const fact = r.state.memory.facts.find((f) => f.tags.includes('dynamic_break'));
    expect(fact).toMatchObject({ importance: 5, about: [ANN], knownBy: [ANN], pinned: true });
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
    expect(exitCostWord(s, reg, ANN, 'abrupt')).toBe('a break');
    // an exit that is not a break is remembered, lighter
    const plain = exit(world('role', 50), { route: 'abrupt' });
    expect(plain.state.memory.facts.find((f) => f.tags.includes('dynamic_ended'))).toMatchObject({ importance: 3, about: [ANN] });
    expect(plain.state.memory.facts.some((f) => f.tags.includes('dynamic_break'))).toBe(false);
  });

  it('the cost lands on her as the relation event, with its row', () => {
    const s = world('role', 50, ['private_time', 'body']); // major: Trust -10, Affinity -10, stress +10
    const trust = s.relations[ANN].trust;
    const stress = unitOf(s, ANN).stress;
    const r = exit(s, { route: 'abrupt' });
    expect(r.state.relations[ANN].trust).toBeLessThan(trust);
    expect(unitOf(r.state, ANN).stress).toBeGreaterThan(stress);
  });

  it('it needs a dynamic at play or beyond', () => {
    expect(errors(exit(world('equal', 30), { route: 'abrupt' }).events)).not.toEqual([]);
    const none = campaign(reg, 3);
    none.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    unitOf(none, ANN).bond = practice();
    none.content = { enabled: ['restraint'] };
    expect(errors(exit(none, { route: 'abrupt' }).events)).not.toEqual([]);
    expect(errors(exit(world('play', 30), { route: 'sideways' }).events)).not.toEqual([]);
  });
});

describe('what an exit does to the dynamic', () => {
  it('formerHolder is set and the dynamic resets to equal, hold 0, tracks kept', () => {
    const s = world('role', 50, ['private_time', 'body']);
    const r = exit(s, { route: 'abrupt' });
    const d = dyn(r.state);
    expect(d.frame).toBe('equal');
    expect(d.hold).toBe(0);
    expect(d.domains).toEqual([]);
    expect(d.tracks).toEqual({ restraint: { xp: 30, level: 2 } });
    expect(d.formerHolder).toEqual({ endedDay: r.state.day, frame: 'role', sworn: false });
    expect(r.events.filter((e) => e.type === 'domain_lost').map((e) => [e.domainId, e.reason])).toEqual([['private_time', 'exit'], ['body', 'exit']]);
    expect(dyn(world('role', 50)).formerHolder).toBeUndefined();
  });

  it('a held sworn status is kept in the record of the former holder', () => {
    const s = world('role', 65);
    dyn(s).sworn = { day: 2 };
    expect(dyn(exit(s, { route: 'abrupt' }).state).formerHolder).toEqual({ endedDay: s.day, frame: 'role', sworn: true });
  });

  it('every domain is dropped except countermand, which starts command_kept', () => {
    const s = world('rule', 70, ['private_time', 'command', 'device']);
    const r = exit(s, { route: 'abrupt' });
    expect(dyn(r.state).domains.map((d) => d.id)).toEqual(['command']);
    expect(exitEvent(r.events)).toMatchObject({ commandKept: true });
    expect(r.events.filter((e) => e.type === 'domain_lost').map((e) => e.domainId)).toEqual(['private_time', 'device']);
    const without = exit(world('rule', 70, ['private_time', 'device']), { route: 'abrupt' });
    expect(exitEvent(without.events)).toMatchObject({ commandKept: false });
  });

  it('an open claim or milestone of hers goes with it', () => {
    const s = world('role', 50);
    s.dynamic!.open.claims.push({ id: 'dc0', unitId: ANN, domainId: 'body', day: s.day });
    s.dynamic!.open.milestones.push({ id: 'dm0', unitId: ANN, milestoneId: 'vow', day: s.day, form: 'scene' });
    const r = exit(s, { route: 'abrupt' });
    expect(r.state.dynamic!.open.claims).toEqual([]);
    expect(r.state.dynamic!.open.milestones).toEqual([]);
  });
});

describe('the routes', () => {
  it('negotiated stays pending until a compromise, and the card can still make it abrupt', () => {
    const s = world('role', 50, ['private_time', 'body']);
    const r = exit(s, { route: 'negotiated' });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.some((e) => e.type === 'dynamic_exit')).toBe(false);
    expect(dyn(r.state).frame).toBe('role');
    expect(r.state.dynamic!.open.exits).toEqual([{ id: 'dx0', unitId: ANN, day: r.state.day }]);
    // asking again changes nothing but keeps one open
    expect(exit(r.state, { route: 'negotiated' }).state.dynamic!.open.exits).toHaveLength(1);
    // ABRUPT on the same card ends it now and closes the pending one
    const abrupt = exit(r.state, { route: 'abrupt' });
    expect(exitEvent(abrupt.events)).toMatchObject({ route: 'abrupt', severity: 'major' });
    expect(abrupt.state.dynamic!.open.exits).toEqual([]);
  });

  it('negotiated then compromise: one step down and a clean exit flag', () => {
    const s = world('role', 50, ['private_time', 'body']);
    const pending = exit(s, { route: 'negotiated' }).state;
    // the intent prompt offers the exit while a scene with her is open
    const offer = dynamicIntentInput(pending, reg, [ANN], 'scene').dynamic;
    expect(offer?.exits).toEqual(['dx0']);
    expect(offer?.types).toContain('compromise_reached');
    const talk = run(pending, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(talk.events)).toEqual([]);
    const compromise = (exitId: string) => run(talk.state, reg, {
      type: 'intents/apply',
      payload: { channel: 'scene', intents: { events: [{ type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she named a last condition and it was kept', confidence: 1, exitId, text: 'a last task' }] } },
    });
    const stale = compromise('dx9');
    expect(dyn(stale.state).frame).toBe('role');
    const ok = compromise('dx0');
    expect(errors(ok.events)).toEqual([]);
    expect(exitEvent(ok.events)).toMatchObject({ route: 'negotiated', clean: true, severity: 'moderate', sworn: false });
    expect(dyn(ok.state).frame).toBe('equal');
    expect(ok.state.dynamic!.open.exits).toEqual([]);
  });

  it('a compromise of another unit is not hers to settle', () => {
    const s = world('role', 50, [], { frame: 'role', hold: 50 });
    const pending = exit(s, { route: 'negotiated' }).state;
    const talk = run(pending, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const r = run(talk.state, reg, {
      type: 'intents/apply',
      payload: { channel: 'scene', intents: { events: [{ type: 'compromise_reached', actor: 'commander', targets: [BEA], severity: 'minor', evidence: 'they settled it', confidence: 1, exitId: 'dx0', text: 'x' }] } },
    });
    expect(dyn(r.state).frame).toBe('role');
    expect(r.state.dynamic!.open.exits).toHaveLength(1);
  });

  it('transfer runs the conflict and moves the domains to the winner', () => {
    const s = world('role', 70, ['device', 'command'], { frame: 'role', hold: 70 });
    unitOf(s, BEA).bond = practice('intense'); // Bea wins the order of two
    const r = exit(s, { route: 'transfer', toUnitId: BEA });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.filter((e) => e.type === 'domain_contested').map((e) => [e.domainId, e.winnerId, e.loserId])).toEqual([['device', BEA, ANN], ['command', BEA, ANN]]);
    expect(dyn(r.state, BEA).domains.map((d) => d.id).sort()).toEqual(['command', 'device']);
    expect(dyn(r.state).domains).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ route: 'transfer', toUnitId: BEA, commandKept: false });
    // the one who lost the conflict is the one who left: nothing is kept for command_kept
    expect(dyn(r.state).formerHolder).toBeDefined();
  });

  it('transfer: the winner keeps the domains', () => {
    const s = world('role', 70, ['device', 'command'], { frame: 'play', hold: 45 });
    unitOf(s, ANN).bond = practice('intense'); // the old holder wins the order of two
    const r = exit(s, { route: 'transfer', toUnitId: BEA });
    expect(errors(r.events)).toEqual([]);
    // she keeps everything and nobody takes the command from her: it is the claimant who loses
    expect(dyn(r.state).domains.map((d) => d.id).sort()).toEqual(['command', 'device']);
    expect(dyn(r.state).frame).toBe('role');
    expect(dyn(r.state).hold).toBe(70); // hers is untouched
    expect(dyn(r.state).formerHolder).toBeUndefined();
    expect(r.events.some((e) => e.type === 'domain_lost')).toBe(false); // she held them all along: no domain moved
    expect(r.events.some((e) => e.type === 'dynamic_exit' && e.unitId === ANN)).toBe(false);
    expect(exitEvent(r.events)).toMatchObject({ unitId: BEA, route: 'transfer', toUnitId: ANN, commandKept: false });
    // the one who won a domain of the loser takes that one too
    const rich = world('role', 70, ['device'], { frame: 'role', hold: 60, domains: ['body'] });
    unitOf(rich, ANN).bond = practice('intense');
    const won = exit(rich, { route: 'transfer', toUnitId: BEA });
    expect(dyn(won.state).domains.map((d) => d.id).sort()).toEqual(['body', 'device']);
    expect(dyn(won.state, BEA).domains).toEqual([]);
  });

  it('transfer: the loser alone exits with an aftermath and -10 once', () => {
    const s = world('role', 70, ['device', 'command'], { frame: 'role', hold: 70 });
    unitOf(s, BEA).bond = practice('intense'); // the claimant wins
    const r = exit(s, { route: 'transfer', toUnitId: BEA });
    expect(errors(r.events)).toEqual([]);
    const exits = r.events.filter((e) => e.type === 'dynamic_exit');
    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({ unitId: ANN, toUnitId: BEA });
    // the winner holds what the loser held, and nobody else left
    expect(dyn(r.state, BEA).domains.map((d) => d.id).sort()).toEqual(['command', 'device']);
    expect(dyn(r.state, BEA).frame).toBe('role');
    expect(dyn(r.state, BEA).formerHolder).toBeUndefined();
    expect(dyn(r.state).frame).toBe('equal');
    // an aftermath for the loser only
    expect(r.events.filter((e) => e.type === 'aftermath_started').map((e) => e.unitId)).toEqual([ANN]);
    expect(dyn(r.state).aftermath).toBeDefined();
    expect(dyn(r.state, BEA).aftermath).toBeUndefined();
    // -10 once, not once per domain
    const lost = r.events.filter((e) => e.type === 'hold_changed' && e.cause === 'contested');
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ unitId: ANN });
    expect(Number(lost[0].from) - Number(lost[0].to)).toBe(TUNING.dynamic.contestedLoss);
    expect(r.events.filter((e) => e.type === 'domain_contested').map((e) => e.domainId)).toEqual(['device', 'command']);
    expect(r.events.filter((e) => e.type === 'domain_lost').map((e) => e.reason)).toEqual(['contest', 'contest']);
  });

  it('transfer needs another holder at play or beyond', () => {
    const s = world('role', 70, ['device']);
    expect(errors(exit(s, { route: 'transfer' }).events)).not.toEqual([]);
    expect(errors(exit(s, { route: 'transfer', toUnitId: BEA }).events)).not.toEqual([]); // Bea holds nothing
    expect(errors(exit(s, { route: 'transfer', toUnitId: ANN }).events)).not.toEqual([]);
    expect(dyn(s).frame).toBe('role'); // refused: nothing changed
  });

  it('force refuses without the means done today', () => {
    const s = world('role', 50, ['private_time']);
    for (const means of ['discipline', 'leash'] as const) {
      const r = exit(s, { route: 'force', means });
      const bad = errors(r.events);
      expect(bad, means).not.toEqual([]);
      expect(String(bad[0].message), means).toMatch(/Do it first/);
      expect(dyn(r.state).frame, means).toBe('role'); // refused: nothing changed
      expect(r.events.some((e) => e.type === 'dynamic_exit'), means).toBe(false);
    }
    expect(errors(exit(s, { route: 'force' }).events)).not.toEqual([]); // a forced exit names its means
    // a means that was not on her, not done, or not today does not count
    const other = structuredClone(s);
    compel(other, ctxOf(other, reg) as EngineCtx, { unitId: BEA, context: 'pda', roll: false });
    expect(errors(exit(other, { route: 'force', means: 'leash' }).events)).not.toEqual([]);
    const failed = structuredClone(s);
    failed.leash.log.push({ no: 90, unitId: ANN, kind: 'compel', day: failed.day, context: 'pda', outcome: 'failed' });
    expect(errors(exit(failed, { route: 'force', means: 'leash' }).events)).not.toEqual([]);
    const old = structuredClone(s);
    old.leash.log.push({ no: 91, unitId: ANN, kind: 'compel', day: old.day - 1, context: 'pda', outcome: 'done' });
    expect(errors(exit(old, { route: 'force', means: 'leash' }).events)).not.toEqual([]);
    const yesterday = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } }).state;
    yesterday.discipline!.applications.forEach((a) => { a.day = yesterday.day - 1; });
    expect(errors(exit(yesterday, { route: 'force', means: 'discipline' }).events)).not.toEqual([]);
    // the means that was done is the one that opens the exit: a punishment does not stand in for the Leash
    const punished = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } }).state;
    expect(errors(exit(punished, { route: 'force', means: 'leash' }).events)).not.toEqual([]);
  });

  it('force after a done Leash use costs two steps up', () => {
    const s = world('role', 50, ['private_time']); // moderate, two up: extreme
    compel(s, ctxOf(s, reg) as EngineCtx, { unitId: ANN, context: 'pda', roll: false });
    const left = s.leash.authorizationsLeft;
    const r = exit(s, { route: 'force', means: 'leash' });
    expect(errors(r.events)).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ route: 'force', severity: 'extreme', force: true, means: 'leash' });
    expect(r.events.some((e) => e.type === 'leash_used')).toBe(false); // the exit runs nothing itself
    expect(r.state.leash.authorizationsLeft).toBe(left);
    expect(dyn(r.state).frame).toBe('equal');
  });

  it('force after a punishment today costs two steps up, and the means is not run again', () => {
    const s = world('role', 50, ['private_time']);
    const punished = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } });
    expect(errors(punished.events)).toEqual([]);
    const r = exit(punished.state, { route: 'force', means: 'discipline' });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.some((e) => e.type === 'discipline_applied')).toBe(false);
    expect(r.state.discipline!.applications).toHaveLength(1);
    expect(exitEvent(r.events)).toMatchObject({ severity: 'extreme', force: true, means: 'discipline' });
  });

  it('a forced exit by the Leash on a command holder starts no command_kept and returns command', () => {
    const leashed = (): CampaignState => {
      const s = world('rule', 70, ['private_time', 'command']);
      compel(s, ctxOf(s, reg) as EngineCtx, { unitId: ANN, context: 'pda', roll: false });
      return s;
    };
    const r = exit(leashed(), { route: 'force', means: 'leash' });
    expect(errors(r.events)).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ route: 'force', commandKept: false });
    expect(dyn(r.state).domains).toEqual([]);
    expect(dyn(r.state).aftermath?.kind).not.toBe('command_kept');
    expect(r.events.filter((e) => e.type === 'domain_lost' && e.domainId === 'command').map((e) => e.reason)).toEqual(['force']);
    expect(r.events.some((e) => e.type === 'aftermath_started' && e.kind === 'command_kept')).toBe(false);
    // the same command held, left by another force, is still a struggle (R15a lists only the Leash)
    const s = world('rule', 70, ['private_time', 'command']);
    const punished = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } }).state;
    const other = exit(punished, { route: 'force', means: 'discipline' });
    expect(exitEvent(other.events)).toMatchObject({ commandKept: true });
    expect(dyn(other.state).aftermath?.kind).toBe('command_kept');
  });

  it('a forced exit by an enforcement of severity 3 or more on a command holder returns command too (no command_kept); a lighter one does not', () => {
    for (const measure of ['bench', 'brig']) {
      const s = world('rule', 70, ['private_time', 'command']);
      const punished = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure, ...(measure === 'brig' ? { days: 2 } : {}) } });
      expect(errors(punished.events), measure).toEqual([]);
      // the enforcement itself ended nothing: she has no struggle yet (the exit creates it)
      const r = exit(punished.state, { route: 'force', means: 'discipline' });
      expect(errors(r.events), measure).toEqual([]);
      expect(exitEvent(r.events), measure).toMatchObject({ route: 'force', commandKept: false, means: 'discipline' });
      expect(dyn(r.state).domains, measure).toEqual([]);
      expect(dyn(r.state).aftermath?.kind, measure).not.toBe('command_kept');
      expect(r.events.filter((e) => e.type === 'domain_lost' && e.domainId === 'command').map((e) => e.reason), measure).toEqual(['force']);
      expect(r.events.some((e) => e.type === 'aftermath_started' && e.kind === 'command_kept'), measure).toBe(false);
    }
    // a severity-2 punishment today: she keeps the command as a struggle
    const light = run(world('rule', 70, ['private_time', 'command']), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } }).state;
    expect(exitEvent(exit(light, { route: 'force', means: 'discipline' }).events)).toMatchObject({ commandKept: true });
    // a heavy punishment of yesterday is not the means of today: the exit refuses
    const old = run(world('rule', 70, ['private_time', 'command']), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'bench' } }).state;
    old.day += 1;
    expect(errors(exit(old, { route: 'force', means: 'discipline' }).events)).not.toEqual([]);
  });

  it('a Leash with no authorization left cannot be done first, so the forced exit stays closed', () => {
    const dry = world('role', 50, ['private_time']);
    dry.leash.authorizationsLeft = 0;
    expect(() => compel(dry, ctxOf(dry, reg) as EngineCtx, { unitId: ANN, context: 'pda', roll: false })).toThrow();
    const bad = exit(dry, { route: 'force', means: 'leash' });
    expect(errors(bad.events)).not.toEqual([]);
    expect(dyn(bad.state).frame).toBe('role');
  });

  it('no path in exit.ts runs a means itself', () => {
    const code = readFileSync('src/engine/dynamic/exit.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(applyPunishment|compel|checkPunish|suppress)\s*\(/);
  });

  it('the transfer request is accepted as a means and costs the same (the oversight request is chunk (i)\'s)', () => {
    const r = exit(world('role', 50, ['private_time']), { route: 'force', means: 'transfer_request' });
    expect(errors(r.events)).toEqual([]);
    expect(exitEvent(r.events)).toMatchObject({ severity: 'extreme', force: true, means: 'transfer_request' });
  });

  it('exitDynamic called directly returns the same events', () => {
    const s = world('play', 30);
    const events = exitDynamic(s, ctxOf(s, reg), ANN, 'abrupt', {});
    expect(events.find((e) => e.type === 'dynamic_exit')).toMatchObject({ severity: 'minor' });
  });
});

describe('a unit who leaves the service', () => {
  it('takes her open negotiated exit with her', () => {
    const s = exit(world('role', 50), { route: 'negotiated' }).state;
    expect(s.dynamic!.open.exits).toHaveLength(1);
    forgetDynamic(s, ANN);
    expect(s.dynamic!.open.exits).toEqual([]);
  });
});

describe('the romance steps down', () => {
  const romantic = (state: string): CampaignState => {
    const s = world('role', 50);
    s.relations[ANN].stateId = state;
    return s;
  };

  it('devoted → lover, never to comrade', () => {
    const s = romantic('devoted');
    const events = romanceStepDown(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('lover');
    expect(events.map((e) => e.type)).toContain('relation_state_changed');
    romanceStepDown(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(romanceStepDown(s, reg, ANN)).toEqual([]);
    expect(s.relations[ANN].stateId).toBe('flirting'); // the last rung stays
  });

  it('fwb → flirting, and a state that is not romantic is left alone', () => {
    const s = romantic('fwb');
    romanceStepDown(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('flirting');
    const friend = romantic('friend');
    expect(romanceStepDown(friend, reg, ANN)).toEqual([]);
    expect(friend.relations[ANN].stateId).toBe('friend');
  });

  it('a secret affair keeps its concealment and steps down inside it', () => {
    const s = romantic('secret_affair');
    s.relations[ANN].affair = { as: 'lover', hiddenFrom: [BEA], since: 1 };
    romanceStepDown(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('secret_affair');
    expect(s.relations[ANN].affair).toEqual({ as: 'flirting', hiddenFrom: [BEA], since: 1 });
  });

  it('the exit steps the romance down, and the dynamic outlives a broken romance', () => {
    const s = romantic('devoted');
    const r = exit(s, { route: 'abrupt' });
    expect(r.state.relations[ANN].stateId).toBe('lover');
    expect(r.events.some((e) => e.type === 'relation_state_changed')).toBe(true);
  });

  it('every romantic state names its step in the registry, and no step leads out of romance', () => {
    for (const st of reg.relationshipStates.values()) {
      const down = (st as unknown as { stepDown?: string }).stepDown;
      if (down === undefined) continue;
      expect(reg.relationshipStates.has(down), String(st.id)).toBe(true);
      expect(reg.relationshipStates.get(down)!.romance, String(st.id)).toBe(true);
    }
    expect((reg.relationshipStates.get('devoted') as unknown as { stepDown?: string }).stepDown).toBe('lover');
  });
});
