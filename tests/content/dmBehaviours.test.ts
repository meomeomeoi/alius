import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, DM_BEHAVIOUR_KINDS, DmBehaviourSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
beforeAll(async () => {
  const r = await loadPacks(['content/core'], read);
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const entry = (over: Record<string, unknown> = {}) => ({ id: 'x', name: 'X', description: 'D', kind: 'hesitate', chance: 0.5, ...over });

describe('registry dmBehaviours (P10b)', () => {
  it('is a registry and a described one', () => {
    expect(REGISTRY_NAMES).toContain('dmBehaviours');
    expect(DESCRIBED_REGISTRIES).toContain('dmBehaviours');
  });

  it('the core pack loads it with every kind present, each entry described', () => {
    const kinds = new Set([...reg.dmBehaviours.values()].map((e) => e.kind));
    expect([...kinds].sort()).toEqual([...DM_BEHAVIOUR_KINDS].sort());
    expect(DM_BEHAVIOUR_KINDS).toEqual(['hesitate', 'deleted', 'burst', 'late', 'voice', 'curt']);
    for (const e of reg.dmBehaviours.values()) expect(String(e.description).length, String(e.id)).toBeGreaterThan(0);
  });

  it('carries the eight drafts of the plan', () => {
    expect([...reg.dmBehaviours.keys()].sort()).toEqual([
      'burst_wanting', 'curt_affinity_drop', 'curt_resentful', 'deleted_after_conflict', 'hesitate_after_conflict', 'hesitate_avoidant', 'late_wanting', 'voice_close',
    ]);
    expect(reg.dmBehaviours.get('late_wanting')).toMatchObject({ kind: 'late', chance: 1, when: { minWant: 40, initiated: true, slots: ['evening', 'night'] } });
    expect(reg.dmBehaviours.get('hesitate_avoidant')!.when).toMatchObject({ attachment: ['avoidant'] });
    expect((reg.dmBehaviours.get('curt_resentful')!.when as { states: string[] }).states).toContain('resentful');
  });
});

describe('DmBehaviourSchema', () => {
  it('accepts a plain entry and every condition', () => {
    expect(DmBehaviourSchema.safeParse(entry()).success).toBe(true);
    const when = {
      minWant: 40, wantBands: ['aching'], attachment: ['avoidant'], stateGroups: ['romantic'], states: ['friend'], afterConflictSlots: 2, affinityDrop: 5, slots: ['night'], initiated: true,
    };
    expect(DmBehaviourSchema.safeParse(entry({ when })).success).toBe(true);
  });

  it('rejects an unknown kind and a chance above 1 or below 0', () => {
    expect(DmBehaviourSchema.safeParse(entry({ kind: 'ghost' })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ chance: 1.01 })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ chance: -0.1 })).success).toBe(false);
  });

  it('rejects unknown condition fields and bad values, and an entry with no description', () => {
    expect(DmBehaviourSchema.safeParse(entry({ when: { vibes: true } })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ when: { attachment: ['clingy'] } })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ when: { slots: ['dawn'] } })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ when: { minWant: 101 } })).success).toBe(false);
    expect(DmBehaviourSchema.safeParse(entry({ bogus: 1 })).success).toBe(false);
    const { description: _d, ...bare } = entry();
    expect(DmBehaviourSchema.safeParse(bare).success).toBe(false);
  });

  it('every state id in when.states exists (a reference check of the loader)', async () => {
    const bad = async (p: string) => {
      const data = await read(p);
      return p.endsWith('dmBehaviours.json') ? [...data, entry({ id: 'bad_state', kind: 'curt', when: { states: ['no_such_state'] } })] : data;
    };
    const r = await loadPacks(['content/core'], bad);
    expect(r.errors.map((e) => JSON.stringify(e)).join('\n')).toContain('no_such_state');
    for (const e of reg.dmBehaviours.values()) {
      for (const id of (e.when as { states?: string[] } | undefined)?.states ?? []) expect(reg.relationshipStates.has(id), `${String(e.id)} → ${id}`).toBe(true);
    }
  });

  it('every state group in when.stateGroups is one the relationship states use', () => {
    const groups = new Set([...reg.relationshipStates.values()].map((s) => s.group));
    for (const e of reg.dmBehaviours.values()) for (const g of (e.when as { stateGroups?: string[] } | undefined)?.stateGroups ?? []) expect(groups.has(g), g).toBe(true);
  });
});

describe('glossary of the living DMs', () => {
  it('dm_behaviour, read_receipt and voice_message exist', () => {
    for (const id of ['dm_behaviour', 'read_receipt', 'voice_message']) {
      expect(reg.glossary.has(id), id).toBe(true);
    }
  });
});
