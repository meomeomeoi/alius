import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { proposeRuleHashed, rollRules } from '../../../src/engine/bonds/rules';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { ANN, enable, loadCore, partner, plain } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const PRACTICE_ROWS = ['stand_when_i_enter', 'ask_before_you_sit', 'maam_before_the_squad', 'ask_permission'];
/** A dominant lover with every category of the practice rows on (the dynamic off: the pool is P9d's). */
const base = (): CampaignState => enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover' }), 'jealousy_games', 'restraint', 'service', 'denial');
const without = (r: Registries): Registries => ({ ...r, relationshipRuleTemplates: new Map([...r.relationshipRuleTemplates].filter(([id]) => !PRACTICE_ROWS.includes(id))) } as unknown as Registries);

describe('the practice rule templates (I2)', () => {
  it('the four rows are marked by a field', () => {
    for (const id of PRACTICE_ROWS) expect((reg.relationshipRuleTemplates.get(id) as { practice?: true }).practice, id).toBe(true);
    expect([...reg.relationshipRuleTemplates.values()].filter((t) => (t as { practice?: true }).practice === true)).toHaveLength(PRACTICE_ROWS.length);
  });

  it('rollRules never proposes a practice template, whatever the weighted pick', () => {
    const seen = new Set<string>();
    for (let f = 0; f < 1; f += 0.02) {
      const d = base();
      rollRules(d, { registries: reg, rng: { chance: () => true, float: () => f } as unknown as Rng });
      for (const r of d.bonds?.rules ?? []) seen.add(r.templateId);
    }
    expect(seen.size).toBeGreaterThan(1);
    for (const id of PRACTICE_ROWS) expect(seen.has(id), id).toBe(false);
  });

  it('P15\'s hashed proposal pool is what it was before P16: the same pick with and without the four rows', () => {
    for (let roll = 0; roll < 1; roll += 0.05) {
      const a = base();
      const b = base();
      proposeRuleHashed(a, reg, ANN, roll);
      proposeRuleHashed(b, without(reg), ANN, roll);
      expect(a.bonds?.rules.map((r) => r.templateId), `roll ${roll}`).toEqual(b.bonds?.rules.map((r) => r.templateId));
    }
  });

  it('P16 can still ask for its own rows', () => {
    const seen = new Set<string>();
    for (let roll = 0; roll < 1; roll += 0.02) {
      const d = base();
      proposeRuleHashed(d, reg, ANN, roll, { practice: true });
      for (const r of d.bonds?.rules ?? []) seen.add(r.templateId);
    }
    for (const id of PRACTICE_ROWS) expect(seen.has(id), id).toBe(true);
  });
});
