import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { checkStart } from '../../../src/engine/combat/build';
import { unitSkillIds } from '../../../src/engine/combat/skills';
import type { Encounter, StartPayload } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
});

const mutiny = (over: Partial<Encounter> = {}): Encounter => ({ enemies: [], mutineers: [{ unitId: ANN }], danger: 0, ...over });
const payload = (e: Encounter = mutiny(), over: Partial<StartPayload> = {}): StartPayload => ({
  encounter: e, formation: { front: [BEA, CAT], back: [DEE] }, ...over,
});
const start = (s: CampaignState, p: StartPayload = payload()) => run(s, reg, { type: 'combat/start', payload: p });
const ann = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;

describe('building a combat with mutineers', () => {
  it('a combat can be built from mutineers only', () => {
    const r = start(base);
    expect(errors(r.events)).toEqual([]);
    const cs = r.state.combat!;
    const m = cs.combatants.find((c) => c.unitId === ANN)!;
    expect(m).toMatchObject({ side: 'enemy', cid: 'e1', nameKey: 'Ann', stress: 0, level: ann(base).level, downed: false });
    expect(m.enemyId).toBeUndefined();
    expect(cs.combatants.filter((c) => c.side === 'squad').map((c) => c.unitId)).toEqual([BEA, CAT, DEE]);
    expect(cs.encounter.mutineers).toEqual([{ unitId: ANN }]);
  });

  it('her skills are her own loadout and her passives are only those of her defects', () => {
    const cs = start(base).state.combat!;
    const m = cs.combatants.find((c) => c.unitId === ANN)!;
    expect(m.skills).toEqual(unitSkillIds(reg, ann(base)));
    expect(m.skills.length).toBeGreaterThan(0);
    expect(m.passives.length).toBeGreaterThan(0);
    for (const p of m.passives) expect(p.source, p.type).toMatch(/^defect:/);
    expect(m.aiProfile).toBe(reg.roles.get(ann(base).roleId)!.aiProfile ?? 'aggressive');
  });

  it('mutineers share the enemy rows and can come with ordinary enemies', () => {
    const r = start(base, payload(mutiny({
      enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], mutineers: [{ unitId: ANN, row: 'back' }],
    })));
    expect(errors(r.events)).toEqual([]);
    const enemies = r.state.combat!.combatants.filter((c) => c.side === 'enemy');
    expect(enemies.map((c) => c.cid)).toEqual(['e1', 'e2']);
    expect(enemies.find((c) => c.unitId === ANN)!.row).toBe('back');
  });

  it('a mutineer in the formation, a dead one, an unknown one, a duplicate or seven opponents are refused', () => {
    const bad: Array<[string, (s: CampaignState) => StartPayload]> = [
      ['in the formation', () => payload(mutiny(), { formation: { front: [ANN, BEA], back: [CAT] } })],
      ['unknown', () => payload(mutiny({ mutineers: [{ unitId: 'unit_nobody' }] }))],
      ['twice', () => payload(mutiny({ mutineers: [{ unitId: ANN }, { unitId: ANN }] }))],
      ['seven opponents', () => payload(mutiny({
        enemies: Array.from({ length: 4 }, () => ({ enemyId: 'husk', level: 1, affixes: [] })),
        mutineers: [{ unitId: ANN }, { unitId: 'unit_eve' }, { unitId: 'unit_fay' }],
      }))],
      ['nobody at all', () => payload(mutiny({ mutineers: [] }))],
      ['a bad row', () => payload(mutiny({ mutineers: [{ unitId: ANN, row: 'side' as never }] }))],
    ];
    for (const [name, make] of bad) {
      const s = campaign(reg, 6);
      const r = start(s, make(s));
      expect(errors(r.events), name).toHaveLength(1);
      expect(r.state, name).toBe(s);
    }
    for (const status of ['dead', 'deserted', 'terminated'] as const) {
      const s = structuredClone(base);
      ann(s).status = status;
      expect(checkStart(s, reg, payload()), status).toMatch(/Ann/);
    }
  });

  it('P4 encounters without mutineers behave as before', () => {
    const r = start(base, payload({ enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }));
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat!.combatants.filter((c) => c.side === 'enemy').map((c) => c.enemyId)).toEqual(['husk']);
    expect(checkStart(base, reg, payload({ enemies: [], mutineers: undefined, danger: 1 }))).toBe('An encounter has 1 to 6 enemies.');
  });
});

describe('playing it out', () => {
  const auto = (s: CampaignState) => run(s, reg, { type: 'combat/auto', payload: { on: true } });

  it('a mutineer acts on her turn with one of her own skills', () => {
    const s = start(base).state;
    const r = auto(s);
    expect(errors(r.events)).toEqual([]);
    const log = ofType(r.events, 'combat_log').flatMap((e) => e.entries as Array<{ kind: string; actor?: string; skillId?: string }>);
    const hers = log.filter((l) => l.kind === 'skill' && l.actor === 'e1');
    expect(hers.length).toBeGreaterThan(0);
    const own = unitSkillIds(reg, ann(base));
    for (const l of hers) expect(own).toContain(l.skillId);
  });

  it('finalize never writes a mutineer back as a squad unit, gives her no XP and no breakdown', () => {
    // a combat she loses: she ends downed
    const weak = structuredClone(base);
    const w = ann(weak);
    w.currentHp = 5;
    w.stress = 40;
    const before = structuredClone(w);
    const done = auto(start(weak).state).state;
    expect(done.combat).toBeUndefined();
    expect(done.lastCombat!.outcome).toBe('won');
    const after = ann(done);
    expect(after.xp).toBe(before.xp);
    expect(after.stress).toBe(before.stress);
    expect(after.currentHp).toBe(before.currentHp);
    expect(after.status).toBe('active');
    expect(after.breakdown).toBeUndefined();
    expect(after.injuries).toEqual([]);
    expect(done.lastCombat!.participants).toEqual([BEA, CAT, DEE]);
    expect(Object.keys(done.lastCombat!.xp).sort()).toEqual([BEA, CAT, DEE]);
    expect(done.lastCombat!.stressDelta[ANN]).toBeUndefined();
    // the squad still gets its normal write-back
    expect(done.squad.find((u) => u.id === BEA)!.xp).toBeGreaterThan(base.squad.find((u) => u.id === BEA)!.xp);
  });

  it('a mutineers-only fight drops no loot', () => {
    const done = auto(start(base).state).state;
    expect(done.lastCombat!.outcome).toBe('won');
    expect(done.lastCombat!.loot).toEqual([]);
    expect(done.inventory).toEqual(base.inventory);
    expect(done.resources).toEqual(base.resources);
  });

  it('the result lists mutineers with downed flags and only real enemies as enemies', () => {
    const mixed = payload(mutiny({ enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], mutineers: [{ unitId: ANN }, { unitId: 'unit_eve' }] }));
    const s = campaign(reg, 6);
    for (const u of s.squad) setRelation(s, u.id, { trust: 60, stateId: 'comrade', band: 'steady' });
    const done = auto(start(s, mixed).state).state;
    const res = done.lastCombat!;
    expect(res.enemies).toHaveLength(1);
    expect(res.enemies[0].enemyId).toBe('husk');
    expect(res.mutineers!.map((m) => m.unitId)).toEqual([ANN, 'unit_eve']);
    for (const m of res.mutineers!) expect(typeof m.downed).toBe('boolean');
    if (res.outcome === 'won') expect(res.mutineers!.every((m) => m.downed)).toBe(true);
    // with an ordinary enemy in the fight loot rolls as usual (a table exists)
    expect(res.loot).toBeDefined();
  });

  it('a combat without mutineers has no mutineers list', () => {
    const done = auto(start(base, payload({ enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 })).state).state;
    expect(done.lastCombat!.mutineers).toBeUndefined();
  });
});
