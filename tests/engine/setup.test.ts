import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import {
  INITIAL_RELATION_STATE, SETUP_LIMITS, buildCampaign, normalizeTag, validateSetup,
  type SetupResult, type UnitSetup,
} from '../../src/engine/setup';
import { migrate } from '../../src/engine/state/migrations';
import type { CampaignState } from '../../src/engine/state/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unit = (over: Partial<UnitSetup> = {}): UnitSetup => ({
  cardRef: 'rhea.png',
  displayName: 'Rhea',
  roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds the line.' },
  defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
  values: { ...ZERO },
  likes: [], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 },
  ...over,
});
const result = (units: UnitSetup[] = [unit()], over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units, ...over,
});
const OPTS = { desireBondDefects: false, seed: 7 };
const build = (r: SetupResult, o = OPTS, registries = reg) => buildCampaign(r, registries, o);
const ok = (r: SetupResult, o = OPTS, registries = reg): CampaignState => {
  const b = build(r, o, registries);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return b.state;
};
const four = () => [
  unit({ cardRef: 'a.png', displayName: 'Ann' }), unit({ cardRef: 'b.png', displayName: 'Bea', roleId: 'medic' }),
  unit({ cardRef: 'c.png', displayName: 'Cat', roleId: 'sniper' }), unit({ cardRef: 'd.png', displayName: 'Dee', roleId: 'defender' }),
];
/** Copy of the registries with every crime (and optionally start) patched. */
const patched = (crime: Record<string, unknown>, start: Record<string, unknown> = {}): Registries => ({
  ...reg,
  crimes: new Map([...reg.crimes].map(([k, v]) => [k, { ...v, ...crime }])),
  starts: new Map([...reg.starts].map(([k, v]) => [k, { ...v, ...start }])),
});

describe('buildCampaign', () => {
  it('four units build a valid campaign that passes migrate()', () => {
    const s = ok(result(four()));
    expect(migrate(s).ok).toBe(true);
    expect(s.squad).toHaveLength(4);
    expect(s.roster.activeIds).toEqual(s.squad.map((u) => u.id));
    expect(s.roster.capacity).toBe(6);
    expect(s.commander).toMatchObject({ name: 'Vale', corporationId: 'vesper', crimeId: 'liquidation' });
    expect(s.world.startId).toBe('start_vesper');
    expect(s.settings).toEqual({ desireBondDefects: false });
    expect(Object.keys(s.relations)).toEqual(s.squad.map((u) => u.id));
  });

  it('zero units is valid', () => {
    const s = ok(result([]));
    expect(s.squad).toEqual([]);
    expect(s.roster.activeIds).toEqual([]);
    expect(s.relations).toEqual({});
    expect(migrate(s).ok).toBe(true);
  });

  it('day 1 morning', () => {
    const s = ok(result());
    expect([s.day, s.slot]).toEqual([1, 'morning']);
  });

  it('stats initialized from role', () => {
    for (const role of reg.roles.values()) {
      const u = ok(result([unit({ roleId: role.id })])).squad[0];
      expect(u.baseStats, role.id).toEqual(role.baseStats);
      expect(u.currentHp).toBe(u.baseStats.hp);
      expect(u).toMatchObject({ level: 1, xp: 0, skillPoints: 0, unlockedNodes: [], stress: 0, status: 'active', kind: 'named', equipment: {}, injuries: [] });
    }
  });

  it('unit carries card, signature, defect origin, values and tags', () => {
    const u = ok(result([unit({ values: { ...ZERO, mercy: 2 }, likes: ['tea'], dislikes: ['noise'], triggers: ['fire'] })])).squad[0];
    expect(u).toMatchObject({
      id: 'unit_rhea', cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
      signatureSkill: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds the line.' },
      defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
      likes: ['tea'], dislikes: ['noise'], triggers: ['fire'],
    });
    expect(u.values.mercy).toBe(2);
  });

  it('mutiny raises authority to 2, others stay 1', () => {
    expect(ok(result([], { crimeId: 'liquidation' })).commander.socialStats).toEqual({ authority: 1, insight: 1, empathy: 1, cunning: 1 });
    expect(ok(result([], { crimeId: 'mutiny' })).commander.socialStats).toEqual({ authority: 2, insight: 1, empathy: 1, cunning: 1 });
  });

  it('strain_trade adds 20 plyx', () => {
    expect(ok(result([], { crimeId: 'strain_trade' })).resources.plyx).toBe(20);
    expect(ok(result([], { crimeId: 'liquidation' })).resources.plyx).toBe(0);
  });

  it('corporation starting bonus adds its resources', () => {
    expect(ok(result([], { startId: 'start_vesper' })).resources).toMatchObject({ supplies: 10, credits: 0 });
    expect(ok(result([], { startId: 'start_kestrel' })).resources).toMatchObject({ credits: 100, supplies: 0 });
  });

  it('experimentation lowers starting trust by 10, clamped at 0', () => {
    const low = ok(result([unit({ baseline: { trust: 5, affinity: 0, attraction: 0 } })], { crimeId: 'experimentation' }));
    expect(low.relations.unit_rhea.trust).toBe(0);
    const mid = ok(result([unit()], { crimeId: 'experimentation' }));
    expect(mid.relations.unit_rhea.trust).toBe(10);
  });

  it('purge adds trust only to pragmatism+ units', () => {
    const s = ok(result([
      unit({ cardRef: 'a.png', displayName: 'Ann', values: { ...ZERO, pragmatism: 2 } }),
      unit({ cardRef: 'b.png', displayName: 'Bea', values: { ...ZERO, pragmatism: 0 } }),
      unit({ cardRef: 'c.png', displayName: 'Cat', values: { ...ZERO, pragmatism: -2 } }),
    ], { crimeId: 'purge' }));
    expect(s.relations.unit_ann.trust).toBe(30);
    expect(s.relations.unit_bea.trust).toBe(20);
    expect(s.relations.unit_cat.trust).toBe(20);
  });

  it('starting_trust with a "-" ifValue only hits units below zero on that axis', () => {
    const r2 = patched({}, {});
    r2.crimes = new Map([['liquidation', {
      ...reg.crimes.get('liquidation')!,
      flaw: { text: 'x', effects: [{ type: 'starting_trust', amount: -10, ifValue: { axis: 'mercy', sign: '-' } }] },
    }]]);
    const s = ok(result([
      unit({ cardRef: 'a.png', displayName: 'Ann', values: { ...ZERO, mercy: -1 } }),
      unit({ cardRef: 'b.png', displayName: 'Bea', values: { ...ZERO, mercy: 1 } }),
    ]), OPTS, r2);
    expect(s.relations.unit_ann.trust).toBe(10);
    expect(s.relations.unit_bea.trust).toBe(20);
  });

  it('relation starts as stranger with baseline axes, no flags and a loyalty band from trust', () => {
    const s = ok(result([
      unit({ cardRef: 'a.png', displayName: 'Ann', baseline: { trust: 5, affinity: -10, attraction: 3 } }),
      unit({ cardRef: 'b.png', displayName: 'Bea', baseline: { trust: 15, affinity: 0, attraction: 0 } }),
      unit({ cardRef: 'c.png', displayName: 'Cat', baseline: { trust: 40, affinity: 30, attraction: 20 } }),
    ]));
    expect(s.relations.unit_ann).toEqual({
      trust: 5, affinity: -10, attraction: 3, stateId: INITIAL_RELATION_STATE, stateSince: 1, history: [], flags: [],
      dailyGain: { trust: 0, affinity: 0, attraction: 0 }, loyaltyBand: 'breaking', marks: [],
    });
    expect(INITIAL_RELATION_STATE).toBe('stranger');
    expect(s.relations.unit_bea.loyaltyBand).toBe('wavering');
    expect(s.relations.unit_cat.loyaltyBand).toBe('steady');
  });

  it('knows_crime only when the crime or start says so', () => {
    expect(ok(result()).relations.unit_rhea.flags).toEqual([]);
    expect(ok(result(), OPTS, patched({ knownByDefault: true })).relations.unit_rhea.flags).toEqual(['knows_crime']);
    expect(ok(result(), OPTS, patched({}, { crimeKnownByDefault: true })).relations.unit_rhea.flags).toEqual(['knows_crime']);
  });

  it('duplicate display names get distinct ids', () => {
    const s = ok(result([
      unit({ cardRef: 'a.png' }), unit({ cardRef: 'b.png' }), unit({ cardRef: 'c.png' }),
    ]));
    expect(s.squad.map((u) => u.id)).toEqual(['unit_rhea', 'unit_rhea_2', 'unit_rhea_3']);
    expect(Object.keys(s.relations)).toEqual(['unit_rhea', 'unit_rhea_2', 'unit_rhea_3']);
  });

  it('slug handles punctuation and empty names', () => {
    const s = ok(result([
      unit({ cardRef: 'a.png', displayName: ' K-117 "Rhea"! ' }), unit({ cardRef: 'b.png', displayName: '???' }),
    ]));
    expect(s.squad.map((u) => u.id)).toEqual(['unit_k_117_rhea', 'unit_unit']);
  });

  it('unknown effect types in a crime are ignored', () => {
    const s = ok(result([unit()], { crimeId: 'liquidation' }));
    expect(s.resources).toEqual({ credits: 0, supplies: 10, plyx: 0 });
    expect(s.relations.unit_rhea.trust).toBe(20);
  });

  it('same input and seed give deep-equal states', () => {
    expect(ok(result(four()))).toEqual(ok(result(four())));
    expect(ok(result(four())).rng).not.toEqual(ok(result(four()), { ...OPTS, seed: 8 }).rng);
  });

  it('commander name is trimmed', () => {
    expect(ok(result([], { commanderName: '  Vale  ' })).commander.name).toBe('Vale');
  });

  it('does not mutate the input', () => {
    const r = result(four());
    const copy = structuredClone(r);
    ok(r);
    expect(r).toEqual(copy);
  });
});

describe('validateSetup', () => {
  const errs = (r: SetupResult, desireBondDefects = false) => validateSetup(r, reg, { desireBondDefects });

  it('a good setup has no errors', () => {
    expect(errs(result(four()))).toEqual([]);
  });

  it('commander name must be 1–60 characters after trim', () => {
    expect(errs(result([], { commanderName: '   ' }))).not.toEqual([]);
    expect(errs(result([], { commanderName: 'x'.repeat(61) }))).not.toEqual([]);
    expect(errs(result([], { commanderName: 'x'.repeat(60) }))).toEqual([]);
  });

  it('unknown start, non-playable corporation and unknown crime are rejected by name', () => {
    expect(errs(result([], { startId: 'ghost' })).join()).toContain('ghost');
    expect(errs(result([], { crimeId: 'jaywalking' })).join()).toContain('jaywalking');
    const r2: Registries = { ...reg, starts: new Map([['start_vesper', { ...reg.starts.get('start_vesper')!, corporationId: 'aurum' }]]) };
    expect(validateSetup(result([]), r2, { desireBondDefects: false }).join()).toContain('aurum');
  });

  it('unknown role, defect or signature is rejected with a message naming it', () => {
    expect(errs(result([unit({ roleId: 'berserker' })])).join()).toContain('berserker');
    expect(errs(result([unit({ defects: [{ id: 'lycanthropy', origin: '' }] })])).join()).toContain('lycanthropy');
    expect(errs(result([unit({ signature: { templateId: 'sig_telekinesis', name: 'x', description: 'y' } })])).join()).toContain('sig_telekinesis');
  });

  it('desire_bond defect rejected when disabled, accepted when enabled', () => {
    const r = result([unit({ defects: [{ id: 'imprint_hunger', origin: 'x' }] })]);
    expect(errs(r, false).join()).toContain('imprint_hunger');
    expect(errs(r, true)).toEqual([]);
    expect(build(r).ok).toBe(false);
    const b = build(r, { desireBondDefects: true, seed: 1 });
    expect(b.ok && b.state.settings).toEqual({ desireBondDefects: true });
  });

  it('five units rejected', () => {
    expect(errs(result([...four(), unit({ cardRef: 'e.png', displayName: 'Eve' })])).length).toBeGreaterThan(0);
    expect(SETUP_LIMITS.maxUnits).toBe(4);
  });

  it('same card twice rejected', () => {
    expect(errs(result([unit(), unit({ displayName: 'Other' })])).join()).toContain('rhea.png');
  });

  it('zero or three defects rejected, duplicate defect rejected', () => {
    expect(errs(result([unit({ defects: [] })])).length).toBeGreaterThan(0);
    const d = (id: string) => ({ id, origin: 'o' });
    expect(errs(result([unit({ defects: [d('echo_bleed'), d('rage_governor'), d('hunger_loop')] })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ defects: [d('echo_bleed'), d('echo_bleed')] })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ defects: [d('echo_bleed'), d('rage_governor')] })]))).toEqual([]);
  });

  it('out-of-range value or baseline rejected', () => {
    expect(errs(result([unit({ values: { ...ZERO, mercy: 4 } })])).join()).toContain('mercy');
    expect(errs(result([unit({ values: { ...ZERO, mercy: 1.5 } })])).join()).toContain('mercy');
    expect(errs(result([unit({ baseline: { trust: 41, affinity: 0, attraction: 0 } })])).join()).toContain('trust');
    expect(errs(result([unit({ baseline: { trust: 20, affinity: -21, attraction: 0 } })])).join()).toContain('affinity');
    expect(errs(result([unit({ baseline: { trust: 20, affinity: 0, attraction: 21 } })])).join()).toContain('attraction');
    expect(errs(result([unit({ baseline: { trust: 20.5, affinity: 0, attraction: 0 } })])).length).toBeGreaterThan(0);
  });

  it('non-normalized tag rejected, tag caps enforced', () => {
    expect(errs(result([unit({ likes: ['Loud Music'] })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ likes: Array.from({ length: 7 }, (_, i) => `t${i}`) })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ dislikes: Array.from({ length: 7 }, (_, i) => `t${i}`) })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ triggers: Array.from({ length: 5 }, (_, i) => `t${i}`) })])).length).toBeGreaterThan(0);
    expect(errs(result([unit({ likes: Array.from({ length: 6 }, (_, i) => `t${i}`), triggers: ['a', 'b', 'c', 'd'] })]))).toEqual([]);
  });

  it('empty display name rejected', () => {
    expect(errs(result([unit({ displayName: '  ' })])).length).toBeGreaterThan(0);
  });
});

describe('normalizeTag', () => {
  it('cases', () => {
    expect(normalizeTag('  Loud   MUSIC!! ')).toBe('loud music');
    expect(normalizeTag('a'.repeat(40))).toBe('a'.repeat(32));
    expect(normalizeTag('!!!')).toBeNull();
    expect(normalizeTag(42)).toBeNull();
    expect(normalizeTag("Rhea's_tea-time")).toBe("rhea's_tea-time");
  });
});
