import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { unitStats } from '../../../src/engine/combat/stats';
import { retrieveFacts } from '../../../src/engine/memory';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { addSecret, heldTerm, secretsKnownBy } from '../../../src/engine/personal/secrets';
import { forgetPersonal, personalOf } from '../../../src/engine/personal/state';
import type { CampaignState, SquadSecret } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { endExpedition } from '../../../src/engine/world/expedition';
import { depart, withMission } from '../../helpers/expedition';
import { ANN, BEA, CAT, ctxFrom, errors, loadCore, ofType, plain, run, withLeader, withStance } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const record = (s: CampaignState, id: string) => s.relations[id].impunityRecord ?? 0;

/** A secret of the kind, known by the given units (in place). */
function keep(s: CampaignState, kindId: string, knownBy: string[], subjectId?: string): SquadSecret {
  addSecret(s, reg, { kindId, knownBy, ...(subjectId !== undefined ? { subjectId } : {}), vars: { name: 'Ann', leader: 'Ann' } });
  return personalOf(s).secrets!.at(-1)!;
}

/** The squad is out on a run; Ann has the stance and the HP fraction, then the run ends. */
function endRun(o: { stance: 'defiant_loyal' | 'fearful' | 'disciplined'; hp: number; party?: string[] }) {
  const base = plain(reg);
  withStance(base, reg, ANN, o.stance);
  const { state, mission } = withMission(reg, base);
  const d = depart(reg, state, mission.id);
  if (o.party) d.expedition!.party = o.party;
  const ann = d.squad.find((u) => u.id === ANN)!;
  ann.currentHp = Math.max(1, Math.floor(unitStats(d, reg, ann).hp * o.hp));
  const ctx = ctxFrom(d, reg);
  const events = endExpedition(d, ctx, 'retreated');
  return { d, events, rng: structuredClone(ctx.rng.state) };
}

describe('the sources', () => {
  it('a defiant_loyal unit ending a run at 20 % HP makes a hidden-injury secret known by the party; at 30 % or as disciplined, none; no draw either way', () => {
    const low = endRun({ stance: 'defiant_loyal', hp: 0.2 });
    const secrets = personalOf(low.d).secrets!;
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ reason: 'protect_commander', status: 'kept', subjectId: ANN });
    expect(secrets[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
    expect(secrets[0].text).toContain('Ann');
    expect(ofType(low.events, 'secret_kept')).toEqual([expect.objectContaining({ secretId: secrets[0].id })]);

    const mid = endRun({ stance: 'defiant_loyal', hp: 0.3 });
    expect(mid.d.personal?.secrets).toBeUndefined();
    const calm = endRun({ stance: 'disciplined', hp: 0.2 });
    expect(calm.d.personal?.secrets).toBeUndefined();
    expect(low.rng).toEqual(mid.rng);
    expect(calm.rng).toEqual(mid.rng);
    const fearful = endRun({ stance: 'fearful', hp: 0.2 });
    expect(personalOf(fearful.d).secrets).toHaveLength(1);
  });

  it('a unit alone in the party has nobody to share a hidden injury with: no secret', () => {
    const r = endRun({ stance: 'defiant_loyal', hp: 0.2, party: [ANN] });
    expect(r.d.personal?.secrets).toBeUndefined();
  });

  it('the squad_secret world effect stores one known by the party or squad', () => {
    const s = plain(reg);
    const d = structuredClone(s);
    const events = applyWorldEffects(d, ctxFrom(d, reg), [{ type: 'squad_secret', kindId: 'trader_deal', knownBy: 'squad' }], { kind: 'event', id: 'x' });
    expect(personalOf(d).secrets).toEqual([expect.objectContaining({ kindId: 'trader_deal', reason: 'self_interest', status: 'kept', knownBy: expect.arrayContaining([ANN, BEA]) })]);
    expect(ofType(events, 'secret_kept')).toHaveLength(1);
    const party = structuredClone(s);
    party.roster.activeIds = [ANN, BEA];
    applyWorldEffects(party, ctxFrom(party, reg), [{ type: 'squad_secret', kindId: 'trader_deal', knownBy: 'party' }], { kind: 'event', id: 'x' });
    expect(personalOf(party).secrets![0].knownBy.sort()).toEqual([ANN, BEA]);
    expect(party.relations[ANN]).toEqual(s.relations[ANN]); // nothing else moved
  });

  it('an unknown kind or one nobody can know is skipped', () => {
    const d = plain(reg);
    expect(addSecret(d, reg, { kindId: 'nope', knownBy: [ANN, BEA] })).toEqual([]);
    expect(addSecret(d, reg, { kindId: 'trader_deal', knownBy: [] })).toEqual([]);
    expect(d.personal?.secrets).toBeUndefined();
  });

  it('a leader holding 7 days makes the successor secret once', () => {
    const s = plain(reg);
    s.day = 3;
    withLeader(s, ANN);
    const day = (d: CampaignState, n: number) => {
      d.day = n;
      return personalDayStep(d, ctxFrom(d, reg));
    };
    day(s, 3);
    expect(s.personal?.secrets).toBeUndefined();
    day(s, 9);
    expect(s.personal?.secrets).toBeUndefined();
    const events = day(s, 10);
    const secrets = personalOf(s).secrets!;
    expect(secrets).toEqual([expect.objectContaining({ kindId: 'successor', reason: 'leader_order', status: 'kept', subjectId: ANN })]);
    expect(secrets[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
    expect(secrets[0].text).toContain('Ann');
    expect(ofType(events, 'secret_kept')).toHaveLength(1);
    day(s, 11);
    day(s, 30);
    expect(personalOf(s).secrets).toHaveLength(1);
  });

  it('a new leader starts a new clock; no leader writes nothing', () => {
    const s = plain(reg);
    s.day = 3;
    withLeader(s, ANN);
    personalDayStep(s, ctxFrom(s, reg));
    withLeader(s, BEA);
    s.day = 10;
    personalDayStep(s, ctxFrom(s, reg));
    expect(s.personal?.secrets).toBeUndefined();
    s.day = 17;
    personalDayStep(s, ctxFrom(s, reg));
    expect(personalOf(s).secrets).toEqual([expect.objectContaining({ subjectId: BEA })]);
    const none = plain(reg);
    personalDayStep(none, ctxFrom(none, reg));
    expect(none.personal).toBeUndefined();
  });
});

describe('what is kept', () => {
  it('a kept secret is no fact, and nothing the engine reports carries its text', () => {
    const s = plain(reg);
    const events = addSecret(s, reg, { kindId: 'successor', knownBy: [ANN, BEA], subjectId: ANN, vars: { leader: 'Ann', name: 'Ann' } });
    const text = personalOf(s).secrets![0].text;
    expect(text.length).toBeGreaterThan(10);
    expect(s.memory.facts.some((f) => f.text.includes(text))).toBe(false);
    expect(JSON.stringify(events)).not.toContain(text);
    expect(secretsKnownBy(s, ANN)).toHaveLength(1);
    expect(secretsKnownBy(s, CAT)).toEqual([]);
  });

  it('the same secret about the same unit is not stored twice while it is kept', () => {
    const s = plain(reg);
    keep(s, 'hidden_injury', [ANN, BEA], ANN);
    expect(addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [ANN, BEA], subjectId: ANN, vars: { name: 'Ann' } })).toEqual([]);
    expect(personalOf(s).secrets).toHaveLength(1);
  });
});

describe('the answer', () => {
  const found = (s: CampaignState, knownBy = [ANN, BEA]): SquadSecret => {
    const x = keep(s, 'hidden_injury', knownBy, ANN);
    x.status = 'found';
    return x;
  };
  const respond = (s: CampaignState, secretId: string, choice: string) => run(s, reg, { type: 'secret/respond', payload: { secretId, choice } });

  it('only a found secret can be answered, with one of three answers', () => {
    const s = plain(reg);
    const x = keep(s, 'hidden_injury', [ANN, BEA], ANN);
    expect(errors(respond(s, x.id, 'confront').events)).toHaveLength(1);
    expect(errors(respond(s, 'nope', 'confront').events)).toHaveLength(1);
    x.status = 'found';
    expect(errors(respond(s, x.id, 'bribe').events)).toHaveLength(1);
  });

  it('confront: record −5 for knowers, secret_confronted on the squad, a public fact (acceptance 5)', () => {
    const s = plain(reg);
    const x = found(s);
    const r = respond(s, x.id, 'confront');
    expect(errors(r.events)).toEqual([]);
    expect(record(r.state, ANN)).toBe(-TUNING.personal.secret.confrontRecord);
    expect(record(r.state, BEA)).toBe(-TUNING.personal.secret.confrontRecord);
    expect(record(r.state, CAT)).toBe(0);
    // every named living unit took secret_confronted (Trust −1, Affinity −2 at minor)
    for (const id of [ANN, BEA, CAT]) expect(r.state.relations[id].affinity).toBeLessThan(s.relations[id].affinity);
    const done = personalOf(r.state).secrets![0];
    expect(done.status).toBe('confronted');
    const fact = r.state.memory.facts.find((f) => f.text.includes(done.text));
    expect(fact?.knownBy).toEqual(['*']);
    expect(ofType(r.events, 'secret_answered')).toEqual([expect.objectContaining({ secretId: x.id, choice: 'confront' })]);
    expect(errors(respond(r.state, x.id, 'use').events)).toHaveLength(1);
  });

  it('pretend: a fact only the commander knows; it never reaches retrieveFacts for a scene (acceptance 5)', () => {
    const s = plain(reg);
    const x = found(s);
    const r = respond(s, x.id, 'pretend');
    expect(errors(r.events)).toEqual([]);
    const done = personalOf(r.state).secrets![0];
    expect(done.status).toBe('pretend');
    const fact = r.state.memory.facts.find((f) => f.text.includes(done.text))!;
    expect(fact.knownBy).toEqual([]);
    expect(fact.tags).toContain('secret');
    expect(retrieveFacts(r.state, { participants: [ANN, BEA], tags: ['secret'] }).some((f) => f.id === fact.id)).toBe(false);
    expect(record(r.state, ANN)).toBe(0);
  });

  it('use: held −8 per secret, at least −16, for 14 days; only for those who know (acceptance 5)', () => {
    const s = plain(reg);
    const x = found(s, [ANN, BEA]);
    const before = impunityOf(s, reg, ANN)!;
    expect(before.terms.held).toBe(0);
    const r = respond(s, x.id, 'use');
    expect(errors(r.events)).toEqual([]);
    const done = personalOf(r.state).secrets![0];
    expect(done).toMatchObject({ status: 'used', usedUntil: s.day + TUNING.personal.secret.usedDays });
    const fact = r.state.memory.facts.find((f) => f.text.includes(done.text))!;
    expect([...fact.knownBy].sort()).toEqual([ANN, BEA]);
    expect(impunityOf(r.state, reg, ANN)!.terms.held).toBe(-8);
    expect(impunityOf(r.state, reg, ANN)!.value).toBe(before.value - 8);
    expect(impunityOf(r.state, reg, CAT)!.terms.held).toBe(0);
    // three used secrets floor at −16
    const many = structuredClone(r.state);
    for (let i = 0; i < 2; i++) {
      const y = keep(many, 'trader_deal', [ANN, BEA]);
      y.status = 'used';
      y.usedUntil = many.day + 14;
    }
    expect(heldTerm(many, ANN)).toBe(-16);
    expect(impunityOf(many, reg, ANN)!.terms.held).toBe(-16);
    // it lasts 14 days
    const later = structuredClone(r.state);
    later.day += TUNING.personal.secret.usedDays;
    expect(impunityOf(later, reg, ANN)!.terms.held).toBe(0);
  });

  it('the P9 provider shows the held term', async () => {
    const { readingFor } = await import('../../../src/analysis/providers');
    const { registerCoreProviders } = await import('../../../src/analysis/providers/core');
    const { parseSubject } = await import('../../../src/analysis/subject');
    const { DEFAULT_SETTINGS } = await import('../../../src/settings');
    registerCoreProviders();
    const s = plain(reg);
    const read = (): string => readingFor(parseSubject('glossary:impunity', JSON.stringify({ unitId: ANN }))!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: false } })?.lines.join('\n') ?? '';
    expect(read()).not.toMatch(/Held over her/);
    const x = found(s);
    x.status = 'used';
    x.usedUntil = s.day + 14;
    expect(read()).toMatch(/Held over her/);
    expect(read()).not.toMatch(/\d/);
  });

  it('a secret she alone knew is dropped when she leaves; the others lose her from knownBy (Review Focus 3)', () => {
    const s = plain(reg);
    keep(s, 'hidden_injury', [ANN], ANN);
    keep(s, 'trader_deal', [ANN, BEA]);
    forgetPersonal(s, ANN);
    const left = personalOf(s).secrets!;
    expect(left).toHaveLength(1);
    expect(left[0].kindId).toBe('trader_deal');
    expect(left[0].knownBy).toEqual([BEA]);
  });
});
