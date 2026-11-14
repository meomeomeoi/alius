import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { RESYNC_SECTIONS } from '../../src/engine/actions/squad';
import { crimeEffectsOf, crimeKnownByDefault, buildCampaign, initialRelation, startingTrustAdjust, type UnitSetup } from '../../src/engine/setup';
import { gruntRelation } from '../../src/engine/grunts';
import { livingUnits } from '../../src/engine/economy';
import type { CampaignState } from '../../src/engine/state/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unit = (over: Partial<UnitSetup> = {}): UnitSetup => ({
  cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
  defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
  values: { ...ZERO, mercy: 2 }, likes: ['tea'], dislikes: ['noise'], triggers: ['fire'],
  baseline: { trust: 20, affinity: 5, attraction: 1 }, ...over,
});
function campaign(desireBondDefects = false): CampaignState {
  const r = buildCampaign(
    { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unit(), unit({ cardRef: 'kay.png', displayName: 'Kay', roleId: 'medic' })] },
    reg, { desireBondDefects, seed: 3 },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
}
const run = (state: CampaignState, unitId: string, patch: Record<string, unknown>) =>
  dispatch(state, { type: 'squad/resync', payload: { unitId, patch } }, reg);

describe('squad/resync', () => {
  it('RESYNC_SECTIONS excludes baseline and includes the P7 tastes and the P8 disposition and stances', () => {
    expect([...RESYNC_SECTIONS]).toEqual(['role', 'values', 'tags', 'signature', 'defects', 'tastes', 'disposition', 'stances']);
  });

  it('resync values replaces only values', () => {
    const s = campaign();
    const values = { ...ZERO, mercy: -3, autonomy: 3 };
    const r = run(s, 'unit_rhea', { values });
    expect(r.events).toEqual([{ type: 'unit_resynced', unitId: 'unit_rhea', sections: ['values'] }]);
    const before = s.squad[0];
    const after = r.state.squad[0];
    expect(after.values).toEqual(values);
    expect({ ...after, values: before.values }).toEqual(before); // everything else identical
    expect(r.state.squad[1]).toEqual(s.squad[1]);
    expect(s.squad[0].values.mercy).toBe(2); // input not mutated
  });

  it('resync role resets stats and hp', () => {
    const s = campaign();
    s.squad[0].currentHp = 7;
    s.squad[0].stress = 40;
    s.squad[0].level = 3;
    const r = run(s, 'unit_rhea', { roleId: 'defender' });
    const u = r.state.squad[0];
    expect(u.roleId).toBe('defender');
    expect(u.baseStats).toEqual(reg.roles.get('defender')!.baseStats);
    expect(u.currentHp).toBe(150);
    expect([u.level, u.stress, u.displayName, u.cardRef]).toEqual([3, 40, 'Rhea', 'rhea.png']);
    expect(r.events[0]).toMatchObject({ sections: ['role'] });
  });

  it('resync to the same role keeps wounds', () => {
    const s = campaign();
    s.squad[0].currentHp = 7;
    const r = run(s, 'unit_rhea', { roleId: 'assault' });
    expect(r.state.squad[0].currentHp).toBe(7);
  });

  it('resync tags, signature and defects', () => {
    const s = campaign();
    s.squad[0].defects[0].arc = 'cure_step_1';
    const r = run(s, 'unit_rhea', {
      likes: ['rain'], dislikes: [], triggers: ['smoke'],
      signature: { templateId: 'sig_frenzy', name: 'Wild', description: 'Hits hard.' },
      defects: [{ id: 'threat_saturation', origin: 'New origin.' }, { id: 'echo_bleed', origin: 'Heard.' }],
    });
    const u = r.state.squad[0];
    expect([u.likes, u.dislikes, u.triggers]).toEqual([['rain'], [], ['smoke']]);
    expect(u.signatureSkill).toEqual({ templateId: 'sig_frenzy', name: 'Wild', description: 'Hits hard.' });
    expect(u.defects).toEqual([{ id: 'threat_saturation', origin: 'New origin.', arc: 'cure_step_1' }, { id: 'echo_bleed', origin: 'Heard.' }]);
    expect(r.events[0]).toEqual({ type: 'unit_resynced', unitId: 'unit_rhea', sections: ['tags', 'signature', 'defects'] });
  });

  it('resync with unknown defect fails and leaves state unchanged', () => {
    const s = campaign();
    const before = structuredClone(s);
    const r = run(s, 'unit_rhea', { defects: [{ id: 'lycanthropy', origin: 'x' }] });
    expect(r.state).toBe(s);
    expect(s).toEqual(before);
    expect(r.events).toEqual([{ type: 'error', code: 'handler_failed', message: expect.stringContaining('lycanthropy') }]);
  });

  it('resync fails on other invalid input without touching state', () => {
    const s = campaign();
    const bad: Array<[string, Record<string, unknown>]> = [
      ['unit_ghost', { values: ZERO }],
      ['unit_rhea', { roleId: 'berserker' }],
      ['unit_rhea', { values: { ...ZERO, mercy: 4 } }],
      ['unit_rhea', { likes: ['Loud Music'] }],
      ['unit_rhea', { signature: { templateId: 'sig_nope', name: 'x', description: 'y' } }],
      ['unit_rhea', { defects: [] }],
      ['unit_rhea', { signature: { templateId: 'sig_frenzy', name: '', description: 'y' } }],
    ];
    for (const [id, patch] of bad) {
      const r = run(s, id, patch);
      expect(r.state, JSON.stringify(patch)).toBe(s);
      expect(r.events[0]).toMatchObject({ type: 'error', code: 'handler_failed' });
    }
    expect(dispatch(s, { type: 'squad/resync', payload: null }, reg).events[0]).toMatchObject({ type: 'error' });
  });

  it('a desire_bond defect follows the campaign setting', () => {
    const patch = { defects: [{ id: 'imprint_hunger', origin: 'x' }] };
    expect(run(campaign(false), 'unit_rhea', patch).events[0]).toMatchObject({ type: 'error' });
    expect(run(campaign(true), 'unit_rhea', patch).events[0]).toMatchObject({ type: 'unit_resynced' });
  });

  it('resync never touches the relation', () => {
    const s = campaign();
    const r = run(s, 'unit_rhea', { roleId: 'sniper', values: { ...ZERO, mercy: -1 }, likes: [] });
    expect(r.state.relations).toEqual(s.relations);
    expect(r.state.resources).toEqual(s.resources);
    expect(r.state.commander).toEqual(s.commander);
    expect(r.state.roster).toEqual(s.roster);
  });

  it('tastes re-sync never changes axes', () => {
    const s = campaign();
    const r = run(s, 'unit_rhea', { commanderTastes: ['respects_strength', 'drawn_to_older'] });
    expect(r.events[0]).toMatchObject({ type: 'unit_resynced', sections: ['tastes'] });
    expect(r.state.squad[0].commanderTastes).toEqual(['respects_strength', 'drawn_to_older']);
    expect(r.state.relations).toEqual(s.relations);
    expect(r.state.commander).toEqual(s.commander);
  });

  it('tastes re-sync can add tastes to a unit that has none and clear them again', () => {
    const s = campaign();
    expect(s.squad[0].commanderTastes).toBeUndefined();
    const added = run(s, 'unit_rhea', { commanderTastes: ['wary_of_brutes'] }).state;
    expect(added.squad[0].commanderTastes).toEqual(['wary_of_brutes']);
    const cleared = run(added, 'unit_rhea', { commanderTastes: [] }).state;
    expect(cleared.squad[0].commanderTastes ?? []).toEqual([]);
  });

  it('tastes re-sync refuses unknown, repeated and too many tastes and changes nothing', () => {
    const s = campaign();
    for (const tastes of [['no_such_taste'], ['wary_of_brutes', 'wary_of_brutes'], ['respects_strength', 'wary_of_brutes', 'protective_of_frail', 'drawn_to_older']]) {
      const r = run(s, 'unit_rhea', { commanderTastes: tastes });
      expect(r.events[0]).toMatchObject({ type: 'error' });
      expect(r.state).toEqual(s);
    }
  });

  it('a re-sync of other sections keeps the tastes', () => {
    const s = campaign();
    const withTastes = run(s, 'unit_rhea', { commanderTastes: ['respects_strength'] }).state;
    expect(run(withTastes, 'unit_rhea', { likes: ['rain'] }).state.squad[0].commanderTastes).toEqual(['respects_strength']);
  });

  it('unknown patch keys are ignored', () => {
    const s = campaign();
    const r = run(s, 'unit_rhea', { baseline: { trust: 99 }, level: 40, values: { ...ZERO, mercy: 1 } });
    expect(r.state.squad[0].level).toBe(1);
    expect(r.state.relations.unit_rhea).toEqual(s.relations.unit_rhea);
    expect(r.events[0]).toMatchObject({ sections: ['values'] });
  });
});

describe('incoming named units (P5)', () => {
  const zed = (over: Partial<UnitSetup> = {}): UnitSetup => unit({ cardRef: 'zed.png', displayName: 'Zed', ...over });
  const waiting = (n = 1, day = 5, edit: (s: CampaignState) => void = () => {}): CampaignState => {
    const s = campaign();
    s.world.incomingUnits = n;
    s.day = day;
    edit(s);
    return s;
  };
  const add = (s: CampaignState, u: UnitSetup) => dispatch(s, { type: 'squad/add_named', payload: { unit: u } }, reg);
  const message = (r: ReturnType<typeof add>) => String(r.events.find((e) => e.type === 'error')?.message ?? '');

  it('add_named needs a pending intake and a free bed', () => {
    const none = campaign();
    expect(message(add(none, zed()))).toBe('No unit is waiting for intake.');
    expect(add(none, zed()).state).toBe(none);
    const full = waiting(1, 5, (s) => { s.roster.capacity = livingUnits(s).length; });
    expect(message(add(full, zed()))).toBe('No free bed: upgrade the barracks or let someone go.');
    expect(message(dispatch(full, { type: 'squad/decline_incoming', payload: {} }, reg))).toBe('No free bed: upgrade the barracks or let someone go.');
    expect(add(waiting(), zed()).events.some((e) => e.type === 'error')).toBe(false);
  });

  it('an invalid profile is refused with every problem listed', () => {
    const s = waiting();
    const r = add(s, zed({ roleId: 'ghost_role', defects: [], baseline: { trust: 99, affinity: 0, attraction: 0 } }));
    const msg = message(r);
    expect(msg).toContain('unknown role "ghost_role"');
    expect(msg).toContain('needs 1 to 2 defects');
    expect(msg).toContain('baseline trust');
    expect(r.state).toBe(s);
    expect(s.world.incomingUnits).toBe(1);
    expect(message(add(s, { ...zed(), cardRef: '' }))).toMatch(/card/i);
    expect(message(dispatch(s, { type: 'squad/add_named', payload: {} }, reg))).toMatch(/unit/i);
  });

  it('a card already in the squad is refused', () => {
    const s = waiting();
    expect(message(add(s, zed({ cardRef: 'rhea.png' })))).toMatch(/already/i);
  });

  it('the new unit starts as stranger with the crime adjustment and since = today', () => {
    const s = waiting(1, 9);
    const u = zed({ values: { ...ZERO, mercy: -2, corporate: 3 } });
    const r = add(s, u);
    expect(message(r)).toBe('');
    const id = 'unit_zed';
    const added = r.state.squad.find((x) => x.id === id)!;
    expect(added).toMatchObject({ kind: 'named', cardRef: 'zed.png', displayName: 'Zed', roleId: 'assault', level: 1, status: 'active', currentHp: added.baseStats.hp });
    expect(added.defects).toEqual([{ id: 'threat_saturation', origin: 'Three tours.' }]);
    expect(added.values).toEqual(u.values);
    const crime = reg.crimes.get('mutiny')!;
    const expected = initialRelation({
      trust: u.baseline.trust + startingTrustAdjust(crimeEffectsOf(crime), u.values), affinity: u.baseline.affinity, attraction: u.baseline.attraction,
      knowsCrime: crimeKnownByDefault(crime, reg.starts.get('start_vesper')), since: 9,
    });
    expect(r.state.relations[id]).toEqual(expected);
    expect(r.state.relations[id]).toMatchObject({ stateId: 'stranger', stateSince: 9 });
    expect(r.state.world.incomingUnits).toBe(0);
    expect(r.state.roster.activeIds).toContain(id);
    expect(r.events.find((e) => e.type === 'unit_joined')).toEqual({ type: 'unit_joined', unitId: id, kind: 'named' });
  });

  it('the unit id follows the unit_<slug> rule and stays unique', () => {
    const s = waiting(2);
    const a = add(s, zed({ displayName: 'Zed Ro' })).state;
    expect(a.squad.some((u) => u.id === 'unit_zed_ro')).toBe(true);
    const b = add(a, zed({ cardRef: 'zed2.png', displayName: 'Zed Ro' })).state;
    expect(b.squad.some((u) => u.id === 'unit_zed_ro_2')).toBe(true);
  });

  it('she goes to reserve when four are active', () => {
    const four = waiting(1, 5, (s) => {
      for (const name of ['Cy', 'Di']) {
        const copy = structuredClone(s.squad[0]);
        Object.assign(copy, { id: `unit_${name.toLowerCase()}`, displayName: name, cardRef: `${name.toLowerCase()}.png` });
        s.squad.push(copy);
        s.relations[copy.id] = structuredClone(s.relations[s.squad[0].id]);
        s.roster.activeIds.push(copy.id);
      }
    });
    expect(four.roster.activeIds).toHaveLength(4);
    const r = add(four, zed());
    const added = r.state.squad.find((u) => u.id === 'unit_zed')!;
    expect(added.status).toBe('reserve');
    expect(r.state.roster.activeIds).toHaveLength(4);
    expect(r.state.roster.activeIds).not.toContain('unit_zed');
    // with room on the active roster she joins it
    const roomy = add(waiting(), zed());
    expect(roomy.state.roster.activeIds).toContain('unit_zed');
  });

  it('decline adds a grunt and lowers the counter', () => {
    const s = waiting(1, 7);
    const r = dispatch(s, { type: 'squad/decline_incoming', payload: {} }, reg);
    expect(r.events.some((e) => e.type === 'error')).toBe(false);
    expect(r.state.squad).toHaveLength(s.squad.length + 1);
    const grunt = r.state.squad.at(-1)!;
    expect(grunt.kind).toBe('grunt');
    expect(r.state.relations[grunt.id]).toEqual(gruntRelation({ ...s, day: 7 }, reg, grunt));
    expect(r.state.world.incomingUnits).toBe(0);
    expect(r.events.find((e) => e.type === 'unit_joined')).toEqual({ type: 'unit_joined', unitId: grunt.id, kind: 'grunt' });
    expect(message(dispatch(r.state, { type: 'squad/decline_incoming', payload: {} }, reg))).toBe('No unit is waiting for intake.');
    if (grunt.status === 'active') expect(r.state.roster.activeIds).toContain(grunt.id);
  });

  it('two offers allow two intakes', () => {
    const s = waiting(2);
    const first = add(s, zed()).state;
    expect(first.world.incomingUnits).toBe(1);
    const second = add(first, zed({ cardRef: 'yan.png', displayName: 'Yan' })).state;
    expect(second.world.incomingUnits).toBe(0);
    expect(message(add(second, zed({ cardRef: 'xe.png', displayName: 'Xe' })))).toBe('No unit is waiting for intake.');
    expect(second.squad.filter((u) => u.kind === 'named')).toHaveLength(4);
  });
});


describe('squad/resync of the P8 sections', () => {
  const stances = { gender_norms: { stance: 'shares' as const, strength: 2 as const, reason: 'Raised in the barracks.' } };
  it('re-sync writes offset and stances without moving axes', () => {
    const s = campaign(true);
    const before = structuredClone(s.relations.unit_rhea);
    const r = run(s, 'unit_rhea', { dispositionOffset: -1, dispositionReason: 'Eager.', worldStances: stances });
    expect(r.events).toEqual([{ type: 'unit_resynced', unitId: 'unit_rhea', sections: ['disposition', 'stances'] }]);
    const u = r.state.squad.find((x) => x.id === 'unit_rhea')!;
    expect(u.dispositionOffset).toBe(-1);
    expect(u.dispositionReason).toBe('Eager.');
    expect(u.worldStances).toEqual(stances);
    expect(r.state.relations.unit_rhea).toEqual(before);
  });
  it('offset 0 and empty values clear the fields', () => {
    const s = campaign(true);
    const a = run(s, 'unit_rhea', { dispositionOffset: 2, dispositionReason: 'Hard.', worldStances: stances }).state;
    const b = run(a, 'unit_rhea', { dispositionOffset: 0, dispositionReason: '', worldStances: {} });
    const u = b.state.squad.find((x) => x.id === 'unit_rhea')!;
    expect('dispositionOffset' in u || 'dispositionReason' in u || 'worldStances' in u).toBe(false);
  });
  it('invalid offsets and unknown stance options are refused and change nothing', () => {
    const s = campaign(true);
    for (const patch of [{ dispositionOffset: 3 }, { worldStances: { tone: { stance: 'shares', strength: 1, reason: '' } } }]) {
      const r = run(s, 'unit_rhea', patch as never);
      expect(r.events[0]).toMatchObject({ type: 'error' });
      expect(r.state).toEqual(s);
    }
  });
});
