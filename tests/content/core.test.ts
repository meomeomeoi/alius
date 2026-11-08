import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';

const load = () => loadPacks(['content/core'], async (path) => JSON.parse(await readFile(path, 'utf8')));

describe('core content pack', () => {
  it('core pack loads with zero errors', async () => {
    const { errors } = await load();
    expect(errors).toEqual([]);
  });

  it('counts: 4 corporations, 2 starts, 6 crimes, 6 roles, 12 signatures, 18 defects (4 desire_bond), 10 statuses', async () => {
    const { registries: r } = await load();
    expect(r.corporations.size).toBe(4);
    expect(r.starts.size).toBe(2);
    expect(r.crimes.size).toBe(6);
    expect(r.roles.size).toBe(6);
    expect(r.signatures.size).toBe(12);
    expect(r.defects.size).toBe(18);
    expect([...r.defects.values()].filter((d) => d.category === 'desire_bond')).toHaveLength(4);
    expect(r.statuses.size).toBe(10);
  });

  it('both starts use playable corporations', async () => {
    const { registries: r } = await load();
    expect([...r.corporations.keys()].sort()).toEqual(['aurum', 'kestrel', 'sable', 'vesper']);
    expect(r.starts.get('start_vesper')!.corporationId).toBe('vesper');
    expect(r.starts.get('start_kestrel')!.corporationId).toBe('kestrel');
    for (const s of r.starts.values()) {
      expect(r.corporations.get(s.corporationId as string)!.playable).toBe(true);
    }
    expect(r.corporations.get('aurum')!.playable).toBe(false);
    expect(r.corporations.get('sable')!.playable).toBe(false);
  });

  it('lorebook has the three constant entries', async () => {
    const { lorebook } = await load();
    expect(lorebook!.name).toBe('Alius Core Lore');
    expect(lorebook!.entries.filter((e) => e.constant).map((e) => e.comment)).toEqual([
      'world_premise', 'leash_protocol', 'ccp_program',
    ]);
    for (const e of lorebook!.entries) {
      expect(e.content.split(/\s+/).length, e.comment).toBeLessThanOrEqual(120);
    }
    expect(lorebook!.entries).toHaveLength(21);
  });

  it('assault base stats are 110/24/12/14/10', async () => {
    const { registries: r } = await load();
    expect(r.roles.get('assault')!.baseStats).toEqual({ hp: 110, atk: 24, def: 12, spd: 14, crit: 10 });
  });

  it('crime start effects match the plan', async () => {
    const { registries: r } = await load();
    const fx = (id: string, side: 'perk' | 'flaw') =>
      ((r.crimes.get(id)![side] as { effects: unknown[] }).effects);
    expect(fx('mutiny', 'perk')).toContainEqual({ type: 'social_rank', stat: 'authority', rank: 2 });
    expect(fx('strain_trade', 'perk')).toContainEqual({ type: 'resource', resource: 'plyx', amount: 20 });
    expect(fx('experimentation', 'flaw')).toContainEqual({ type: 'starting_trust', amount: -10 });
    expect(fx('purge', 'perk')).toContainEqual({
      type: 'starting_trust', amount: 10, ifValue: { axis: 'pragmatism', sign: '+' },
    });
    for (const c of r.crimes.values()) expect(c.knownByDefault).toBe(false);
  });

  it('knows_crime flag is declared', async () => {
    const { registries: r } = await load();
    expect(r.flags.get('knows_crime')).toMatchObject({ scope: 'relation', setBy: ['start', 'event'] });
  });
});
