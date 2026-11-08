import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { RESYNC_SECTIONS } from '../../src/engine/actions/squad';
import { buildCampaign, type UnitSetup } from '../../src/engine/setup';
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
  it('RESYNC_SECTIONS excludes baseline', () => {
    expect([...RESYNC_SECTIONS]).toEqual(['role', 'values', 'tags', 'signature', 'defects']);
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

  it('unknown patch keys are ignored', () => {
    const s = campaign();
    const r = run(s, 'unit_rhea', { baseline: { trust: 99 }, level: 40, values: { ...ZERO, mercy: 1 } });
    expect(r.state.squad[0].level).toBe(1);
    expect(r.state.relations.unit_rhea).toEqual(s.relations.unit_rhea);
    expect(r.events[0]).toMatchObject({ sections: ['values'] });
  });
});
