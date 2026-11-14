import { describe, expect, it } from 'vitest';
import { CommandStanceSchema, CrimeSchema, DispositionLevelSchema, FlagSchema, PunishmentSchema, RelationshipStateSchema } from '../../src/content/schemas';
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
