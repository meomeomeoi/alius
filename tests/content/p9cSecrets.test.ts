import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { CommandStanceSchema, DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES, SecretKindSchema, WorldEffectSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const kind = (over: Record<string, unknown> = {}) => ({ id: 'x', description: 'D', source: 'event', reason: 'self_interest', text: 'Something.', importance: 3, ...over });

describe('P9c registries: secretKinds', () => {
  it('is a registry, described, with a kind for each source', () => {
    expect(REGISTRY_NAMES).toContain('secretKinds');
    expect(DESCRIBED_REGISTRIES).toContain('secretKinds');
    expect([...reg.secretKinds.values()].map((k) => k.source).sort()).toEqual(['event', 'hidden_injury', 'successor']);
  });

  it('a hidden-injury secret must name {name} and a successor secret {leader}', () => {
    expect(SecretKindSchema.safeParse(kind()).success).toBe(true);
    expect(SecretKindSchema.safeParse(kind({ source: 'hidden_injury', text: 'Hurt.' })).success).toBe(false);
    expect(SecretKindSchema.safeParse(kind({ source: 'hidden_injury', text: '{name} is hurt.' })).success).toBe(true);
    expect(SecretKindSchema.safeParse(kind({ source: 'successor', text: 'Somebody leads.' })).success).toBe(false);
    expect(SecretKindSchema.safeParse(kind({ source: 'successor', text: '{leader} leads.' })).success).toBe(true);
  });

  it('the source and reason are closed vocabularies, and the entry is strict', () => {
    expect(SecretKindSchema.safeParse(kind({ source: 'rumour' })).success).toBe(false);
    expect(SecretKindSchema.safeParse(kind({ reason: 'protect_him' })).success).toBe(false);
    expect(SecretKindSchema.safeParse(kind({ bogus: 1 })).success).toBe(false);
  });
});

describe('P9c: what lets a secret out is data', () => {
  it('hidesInjury and secretSlip are optional booleans on a command stance', () => {
    const base = { id: 'disciplined', name: 'N', description: 'D', directive: 'd', refusal: 'r', demandWeight: 1 };
    expect(CommandStanceSchema.safeParse({ ...base, hidesInjury: true, secretSlip: true }).success).toBe(true);
    expect(CommandStanceSchema.safeParse({ ...base, hidesInjury: 'yes' }).success).toBe(false);
  });

  it('the core stances and states carry them (draft)', () => {
    expect([...reg.commandStances.values()].filter((s) => s.hidesInjury === true).map((s) => s.id).sort()).toEqual(['defiant_loyal', 'fearful']);
    expect([...reg.commandStances.values()].filter((s) => s.secretSlip === true).map((s) => s.id)).toEqual(['open_defiance']);
    expect([...reg.relationshipStates.values()].filter((s) => s.secretSlip === true).map((s) => s.id)).toEqual(['resentful']);
  });

  it('the squad_secret world effect names a kind and who knows', () => {
    expect(WorldEffectSchema.safeParse({ type: 'squad_secret', kindId: 'trader_deal', knownBy: 'party' }).success).toBe(true);
    expect(WorldEffectSchema.safeParse({ type: 'squad_secret', kindId: 'trader_deal', knownBy: 'nobody' }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ type: 'squad_secret', kindId: 'trader_deal' }).success).toBe(false);
  });

  it('the three secret events are reserved for the engine', () => {
    for (const t of ['secret_kept', 'secret_found', 'secret_answered']) expect(RESERVED_EVENT_TYPES).toContain(t);
  });
});
