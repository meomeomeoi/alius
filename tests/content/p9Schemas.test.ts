import { describe, expect, it } from 'vitest';
import { CommandStanceSchema, CrimeSchema, DemandTemplateSchema, DispositionLevelSchema, FlagSchema, PunishmentSchema, ReputationSchema, RelationshipStateSchema } from '../../src/content/schemas';
import { loadPacks } from '../../src/content/loader';
import { readFile } from 'node:fs/promises';

const stance = {
  id: 'disciplined', name: 'Disciplined', description: 'Obeys by the book.',
  directive: '{name} obeys.', refusal: '{name} refuses. Reason: {reason}.', demandWeight: 0.5,
};

describe('command stances', () => {
  it('a command stance needs all four texts and a known id', () => {
    expect(CommandStanceSchema.safeParse(stance).success).toBe(true);
    expect(CommandStanceSchema.safeParse({ ...stance, id: 'rebel' }).success).toBe(false);
    for (const k of ['name', 'description', 'directive', 'refusal'] as const) {
      const { [k]: _drop, ...rest } = stance;
      expect(CommandStanceSchema.safeParse(rest).success, k).toBe(false);
    }
  });

  it('texts are capped at 300 characters and demandWeight at 0…3', () => {
    expect(CommandStanceSchema.safeParse({ ...stance, directive: 'x'.repeat(301) }).success).toBe(false);
    expect(CommandStanceSchema.safeParse({ ...stance, refusal: 'x'.repeat(301) }).success).toBe(false);
    expect(CommandStanceSchema.safeParse({ ...stance, demandWeight: 3.5 }).success).toBe(false);
    expect(CommandStanceSchema.safeParse({ ...stance, demandWeight: -1 }).success).toBe(false);
    expect(CommandStanceSchema.safeParse({ ...stance, covert: true }).success).toBe(true);
  });
});

describe('P9 optional fields', () => {
  it('impunityBase 65 parses, 101 does not', async () => {
    const { registries } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    const level = { ...(registries.dispositionLevels.get('guarded') as Record<string, unknown>) };
    expect(DispositionLevelSchema.safeParse({ ...level, impunityBase: 65 }).success).toBe(true);
    expect(DispositionLevelSchema.safeParse({ ...level, impunityBase: 100 }).success).toBe(true);
    expect(DispositionLevelSchema.safeParse({ ...level, impunityBase: 101 }).success).toBe(false);
    expect(DispositionLevelSchema.safeParse({ ...level, impunityBase: -1 }).success).toBe(false);
  });

  it('dependency and leverage are optional', async () => {
    const { registries } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    const st = { ...(registries.relationshipStates.get('friend') as Record<string, unknown>) };
    expect(RelationshipStateSchema.safeParse(st).success).toBe(true);
    expect(RelationshipStateSchema.safeParse({ ...st, dependency: 15 }).success).toBe(true);
    expect(RelationshipStateSchema.safeParse({ ...st, dependency: 41 }).success).toBe(false);
    expect(RelationshipStateSchema.safeParse({ ...st, dependency: 1.5 }).success).toBe(false);
    const flag = { id: 'x', scope: 'relation', description: 'd' };
    expect(FlagSchema.safeParse(flag).success).toBe(true);
    expect(FlagSchema.safeParse({ ...flag, leverage: true }).success).toBe(true);
    const crime = { ...(registries.crimes.get('liquidation') as Record<string, unknown>) };
    expect(CrimeSchema.safeParse(crime).success).toBe(true);
    expect(CrimeSchema.safeParse({ ...crime, damaging: false }).success).toBe(true);
  });
});

describe('command stance loader check', () => {
  it('a pack that ships only some of the four stances is reported', async () => {
    const files: Record<string, unknown> = {
      'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 0, files: { commandStances: 'commandStances.json' } },
      'mem/commandStances.json': [{ ...stance }],
    };
    const { errors } = await loadPacks(['mem'], async (p) => {
      if (!(p in files)) throw new Error(`404 ${p}`);
      return files[p];
    });
    expect(errors.map((e) => e.message).join('\n')).toMatch(/no command stance "fearful"/);
    expect(errors.map((e) => e.message).join('\n')).toMatch(/no command stance "indifferent"/);
  });
});

describe('punishments (P9)', () => {
  const entry = {
    id: 'brig', label: 'Brig', description: 'Locked up.', severity: 4, impunityDelta: -20, deltas: { trust: -6, affinity: -8, stress: 12 },
    sideEffects: [{ type: 'confine', minDays: 1, maxDays: 3 }], perception: [{ tag: 'lives_for_combat', multiplier: 2 }], dispositionScaling: 'loss',
  };
  it('the six core entries parse and come in ladder order', async () => {
    const { registries, errors } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    expect(errors).toEqual([]);
    expect([...registries.punishments.keys()]).toEqual(['verbal', 'revoke_rations', 'revoke_leave', 'extra_duty', 'bench', 'brig']);
    for (const e of registries.punishments.values()) expect(PunishmentSchema.safeParse(e).success, e.id).toBe(true);
  });
  it('a valid entry parses', () => {
    expect(PunishmentSchema.safeParse(entry).success).toBe(true);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [], perception: [] }).success).toBe(true);
  });
  it('two exclusive side effects are rejected', () => {
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'confine', minDays: 1, maxDays: 2 }, { type: 'bench' }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'no_leave', days: 2 }, { type: 'duty' }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'duty' }, { type: 'resource', resource: 'credits', amount: 5 }] }).success).toBe(true);
  });
  it('an unknown side effect type is rejected, and so are a strange field and bad days', () => {
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'teleport' }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'bench', days: 2 }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'confine', minDays: 3, maxDays: 1 }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'confine', minDays: 0, maxDays: 3 }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'confine', minDays: 1, maxDays: 8 }] }).success).toBe(false);
    expect(PunishmentSchema.safeParse({ ...entry, sideEffects: [{ type: 'no_leave', days: 8 }] }).success).toBe(false);
  });
  it('severity 1 to 4, a perception multiplier 0.5 to 3, a known scaling', () => {
    expect([0, 5, 2.5].map((severity) => PunishmentSchema.safeParse({ ...entry, severity }).success)).toEqual([false, false, false]);
    expect([0.4, 3.1].map((multiplier) => PunishmentSchema.safeParse({ ...entry, perception: [{ tag: 'x', multiplier }] }).success)).toEqual([false, false]);
    expect([0.5, 3].map((multiplier) => PunishmentSchema.safeParse({ ...entry, perception: [{ tag: 'x', multiplier }] }).success)).toEqual([true, true]);
    expect(PunishmentSchema.safeParse({ ...entry, dispositionScaling: 'none' }).success).toBe(true);
    expect(PunishmentSchema.safeParse({ ...entry, dispositionScaling: 'double' }).success).toBe(false);
  });
});

describe('demand templates (P9)', () => {
  const tpl = {
    id: 'double_ration', kind: 'resource', text: 'I want more food.', description: 'She asks for more food.', grantCost: [{ type: 'resource', resource: 'supplies', amount: 2 }],
    grantDeltas: { trust: 2, affinity: 3 }, refuseDeltas: { trust: -2, affinity: -3, stress: 3 }, conditions: {}, weight: 3,
  };
  it('the six core entries parse', async () => {
    const { registries, errors } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    expect(errors).toEqual([]);
    for (const e of registries.demandTemplates.values()) expect(DemandTemplateSchema.safeParse(e).success, e.id).toBe(true);
  });
  it('every cost type parses and an unknown one does not', () => {
    const costs = [
      { type: 'resource', resource: 'credits', amount: 20 }, { type: 'squad_stress', amount: 2 }, { type: 'relation_flag', flagId: 'own_room' }, { type: 'bench_self' },
      { type: 'equip_item', slot: 'weapon', minRarity: 'refined' }, { type: 'reveal_crime' }, { type: 'other_unit_event', event: 'dismissed', severity: 'moderate' },
    ];
    for (const c of costs) expect(DemandTemplateSchema.safeParse({ ...tpl, grantCost: [c] }).success, c.type).toBe(true);
    expect(DemandTemplateSchema.safeParse({ ...tpl, grantCost: [{ type: 'teleport' }] }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, grantCost: [{ type: 'equip_item', slot: 'hat', minRarity: 'refined' }] }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, grantCost: [{ type: 'resource', resource: 'credits', amount: 0 }] }).success).toBe(false);
  });
  it('the kind is one of six, the text at most 240, the weight positive, the conditions closed', () => {
    expect(DemandTemplateSchema.safeParse({ ...tpl, kind: 'gossip' }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, text: 'x'.repeat(241) }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, weight: 0 }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, conditions: { moon: 'full' } }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, conditions: { impunity: [60, 40] } }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, conditions: { stances: ['rebel'] } }).success).toBe(false);
    expect(DemandTemplateSchema.safeParse({ ...tpl, conditions: { stances: ['fearful'], impunity: [0, 50], dispositionRanks: [1, 3], tagsAny: ['a'], statesAny: ['friend'], flagsNone: ['knows_crime'] }, costly: true }).success).toBe(true);
  });
  it('a flag or a state the pack does not have is a content error', async () => {
    const files: Record<string, unknown> = {
      'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 0, files: { demandTemplates: 'd.json' } },
      'mem/d.json': [{ ...tpl, conditions: { flagsNone: ['no_such_flag'], statesAny: ['no_such_state'] }, grantCost: [{ type: 'relation_flag', flagId: 'no_such_flag' }] }],
    };
    const { errors } = await loadPacks(['mem'], async (p) => { if (!(p in files)) throw new Error(`404 ${p}`); return files[p]; });
    const text = errors.map((e) => `${e.path}: ${e.message}`).join('\n');
    expect(text).toMatch(/unknown flag "no_such_flag"/);
    expect(text).toMatch(/unknown relationship state "no_such_state"/);
    expect(text).toMatch(/grantCost\[0\]\.flagId/);
  });
});

describe('reputations (P9)', () => {
  const rep = { id: 'x', name: 'X', group: 'g', description: 'd', pattern: { sum: ['protected'], min: 3 }, effects: {} };
  it('the seven core entries parse', async () => {
    const { registries, errors } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    expect(errors).toEqual([]);
    for (const e of registries.reputations.values()) expect(ReputationSchema.safeParse(e).success, e.id).toBe(true);
  });
  it('the pattern counters are checked against the deed counters, min is at least 1', () => {
    expect(ReputationSchema.safeParse(rep).success).toBe(true);
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: ['kisses'], min: 3 } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: ['protected'], min: 0 } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: [], min: 3 } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: ['protected'], min: 3, against: ['grunts_lost'] } }).success).toBe(true);
  });
  it('minShare needs against, and is a share', () => {
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: ['protected'], min: 3, minShare: 0.5 } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, pattern: { sum: ['protected'], min: 3, against: ['grunts_lost'], minShare: 1.5 } }).success).toBe(false);
  });
  it('effects are closed and typed', () => {
    expect(ReputationSchema.safeParse({ ...rep, effects: { impunityBase: -5, directive: 'x', valueReactions: [{ axis: 'autonomy', sign: '+', weight: -2 }] } }).success).toBe(true);
    expect(ReputationSchema.safeParse({ ...rep, effects: { power: 9 } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, effects: { valueReactions: [{ axis: 'charm', sign: '+', weight: 1 }] } }).success).toBe(false);
    expect(ReputationSchema.safeParse({ ...rep, effects: { impunityBase: 99 } }).success).toBe(false);
  });
});

