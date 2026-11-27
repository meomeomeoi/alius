import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { REGISTRY_NAMES, type RegistryName } from '../../src/content/types';
import { PLAYER_VISIBLE } from '../../src/analysis/describe';
import { CONTENT_GATED_REGISTRIES } from '../../src/engine/bonds';
import { AFTERMATH_KINDS, CAPABILITIES, DYNAMIC_EVENT_TYPES, REGION_RANKS, SIGN_KINDS, type DynamicSignEntry } from '../../src/engine/dynamic/types';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const NEW: RegistryName[] = ['practiceStyles', 'holdBands', 'dynamicFrames', 'dynamicMilestones', 'dynamicDomains', 'dynamicTracks', 'probeAxes', 'positionRegions', 'aftermaths', 'regardBands', 'dynamicSigns'];

/** The core pack plus an in-memory pack of `rows` per registry (later packs win by id). */
async function load(rows: Partial<Record<RegistryName, unknown[]>> = {}) {
  const mem: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 50, files: Object.fromEntries(Object.keys(rows).map((k) => [k, `${k}.json`])) },
    ...Object.fromEntries(Object.entries(rows).map(([k, v]) => [`mem/${k}.json`, v])),
  };
  return loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
}
const messages = (r: { errors: Array<{ message: string }> }) => r.errors.map((e) => e.message).join('\n');

let base: Awaited<ReturnType<typeof load>>;
beforeAll(async () => {
  base = await load();
});
const rows = (name: RegistryName) => [...base.registries[name].values()];

describe('the eleven registries (P15)', () => {
  it('the core pack loads the eleven registries', () => {
    expect(base.errors).toEqual([]);
    const styles = rows('practiceStyles');
    expect(styles).toHaveLength(11);
    expect(styles.map((s) => s.id)).not.toContain('neutral');
    const bands = rows('holdBands').map((b) => [Number(b.min), Number(b.max)]).sort((a, b) => a[0] - b[0]);
    expect(bands).toHaveLength(5);
    expect(bands[0][0]).toBe(0);
    expect(bands[4][1]).toBe(100);
    bands.slice(1).forEach((b, i) => expect(b[0]).toBe(bands[i][1] + 1));
    const frames = rows('dynamicFrames');
    expect(frames.map((f) => [f.id, f.holdFloor])).toEqual([['equal', 0], ['play', 20], ['role', 40], ['rule', 60]]);
    expect(base.registries.dynamicFrames.get('equal')!.holdCeiling).toBe(39);
    expect(rows('dynamicMilestones')).toHaveLength(10); // P15b: + the joke that stopped being a joke (regal)
    expect(rows('dynamicDomains')).toHaveLength(6);
    expect(rows('dynamicTracks')).toHaveLength(10);
    const axes = rows('probeAxes');
    expect(axes).toHaveLength(17); // ten from P15 and, from P15b, the seven rows with `needs` (spec §12.2)
    expect(new Set(axes.map((a) => a.tier))).toEqual(new Set([1, 2]));
    const regions = rows('positionRegions');
    expect(regions).toHaveLength(11);
    expect(regions.map((r) => r.rank).sort()).toEqual([...REGION_RANKS].sort());
    const aftermaths = rows('aftermaths');
    expect(aftermaths).toHaveLength(9);
    expect(aftermaths.map((a) => a.kind).sort()).toEqual([...AFTERMATH_KINDS].sort());
    const regard = rows('regardBands').map((b) => [Number(b.min), Number(b.max)]).sort((a, b) => a[0] - b[0]);
    expect(regard).toHaveLength(5);
    expect(regard[0][0]).toBe(0);
    expect(regard[4][1]).toBe(100);
    regard.slice(1).forEach((b, i) => expect(b[0]).toBe(regard[i][1] + 1));
    const signs = rows('dynamicSigns') as unknown as DynamicSignEntry[];
    expect(signs.map((s) => s.kind).sort()).toEqual([...SIGN_KINDS].sort());
    expect(signs.filter((s) => s.instant).every((s) => s.amount === 100)).toBe(true);
    expect(signs.filter((s) => s.closenessOnly).every((s) => s.amount === 0)).toBe(true);
    expect(Object.fromEntries(signs.filter((s) => !s.instant && !s.closenessOnly).map((s) => [s.kind, s.amount]))).toMatchObject({
      step_behind: 15, protocol_public: 20, protocol_slip: 20, kneeling_at_door: 25, her_marks: 30, remote_toy: 10, leaving_quarters: 5, held_night: 5,
      background_role: 3, background_rule: 6, gossip_knows: 5, gossip_suspects: 2, territory_marking: 30,
    });
  });

  it('are registry names, all described, and all but the regions are player-visible', () => {
    for (const n of NEW) {
      expect(REGISTRY_NAMES, n).toContain(n);
      expect(DESCRIBED_REGISTRIES, n).toContain(n);
      expect(PLAYER_VISIBLE.includes(n), n).toBe(n !== 'positionRegions');
    }
  });

  it('the milestones and the aftermaths are content-gated, the rest are not', () => {
    for (const n of ['dynamicMilestones', 'aftermaths']) expect(CONTENT_GATED_REGISTRIES, n).toContain(n);
    for (const n of NEW.filter((x) => x !== 'dynamicMilestones' && x !== 'aftermaths')) expect(CONTENT_GATED_REGISTRIES, n).not.toContain(n);
  });

  it('domains grant only known capabilities and every capability is granted once', () => {
    const granted = rows('dynamicDomains').flatMap((d) => d.grants as string[]);
    for (const c of granted) expect(CAPABILITIES).toContain(c);
    expect([...granted].sort()).toEqual([...CAPABILITIES].sort());
    expect(new Set(granted).size).toBe(granted.length);
    expect(rows('dynamicDomains').filter((d) => d.claim === 'milestone').map((d) => d.id)).toEqual(['command']);
  });

  it('refs: milestones, tracks, styles, aftermaths and signs name what exists', () => {
    const bands = new Set(rows('holdBands').map((b) => b.id));
    const tracks = new Set(rows('dynamicTracks').map((t) => t.id));
    for (const m of rows('dynamicMilestones')) {
      const req = m.requires as { holdBand?: string; tracks?: Record<string, number>; capabilities?: string[]; categories?: string[]; styles?: string[] };
      if (req.holdBand) expect(bands.has(req.holdBand), `${m.id} band`).toBe(true);
      for (const t of Object.keys(req.tracks ?? {})) expect(tracks.has(t), `${m.id} track ${t}`).toBe(true);
      for (const c of req.capabilities ?? []) expect(CAPABILITIES).toContain(c);
      for (const c of req.categories ?? []) expect(base.registries.contentCategories.has(c), `${m.id} category ${c}`).toBe(true);
      for (const s of req.styles ?? []) expect(base.registries.practiceStyles.has(s), `${m.id} style ${s}`).toBe(true);
    }
    for (const t of rows('dynamicTracks')) if (t.category !== undefined) expect(base.registries.contentCategories.has(String(t.category)), `${t.id} category`).toBe(true);
    for (const a of rows('aftermaths')) for (const k of (a.chainsTo as string[] | undefined) ?? []) expect(AFTERMATH_KINDS).toContain(k);
    for (const s of rows('dynamicSigns')) for (const t of (s.contentTags as string[] | undefined) ?? []) expect(base.registries.contentCategories.has(t), `${s.id} tag ${t}`).toBe(true);
  });

  it('the aftermath bias of a style is held once, in the aftermath weights', () => {
    for (const s of rows('practiceStyles')) {
      expect('aftermathBias' in s, `${s.id} has no bias of its own`).toBe(false);
      const pulls = rows('aftermaths').filter((a) => ((a.weights as { styles?: Record<string, number> }).styles?.[String(s.id)] ?? 0) > 0);
      expect(pulls.length, `${s.id} is the bias of some aftermath`).toBeGreaterThan(0);
      for (const a of pulls) expect(AFTERMATH_KINDS).toContain(a.kind);
    }
  });

  it('an aftermath\'s value weights say which side of the value counts', async () => {
    const a = rows('aftermaths').find((x) => x.id === 'revenge')!;
    const w = a.weights as Record<string, unknown>;
    const ok = await load({ aftermaths: [{ ...a, id: 'merciless', weights: { ...w, values: { mercy: { low: 3 }, autonomy: { high: 1, low: 0.5 } } } }] });
    expect(ok.errors).toEqual([]);
    expect(ok.registries.aftermaths.get('merciless')!.weights).toMatchObject({ values: { mercy: { low: 3 }, autonomy: { high: 1, low: 0.5 } } });
    const bare = await load({ aftermaths: [{ ...a, id: 'bare', weights: { ...w, values: { mercy: 3 } } }] }); // a number cannot say which side
    expect(bare.registries.aftermaths.has('bare')).toBe(false);
    const empty = await load({ aftermaths: [{ ...a, id: 'empty', weights: { ...w, values: { mercy: {} } } }] });
    expect(empty.registries.aftermaths.has('empty')).toBe(false);
    const neither = await load({ aftermaths: [{ ...a, id: 'neither', weights: { ...w, values: { mercy: { middle: 1 } } } }] });
    expect(neither.registries.aftermaths.has('neither')).toBe(false);
    const own = await load({ practiceStyles: [{ ...rows('practiceStyles')[0], id: 'with_bias', aftermathBias: ['revenge'] }] });
    expect(own.registries.practiceStyles.has('with_bias')).toBe(false); // the second source is gone
  });

  it('every engine event of the package is reserved', () => {
    for (const t of DYNAMIC_EVENT_TYPES) expect(RESERVED_EVENT_TYPES, t).toContain(t);
    expect(DYNAMIC_EVENT_TYPES).toHaveLength(31);
  });
});

describe('what is refused', () => {
  it('an unknown capability, a band gap or a duplicate region rank is a content error', async () => {
    const domain = rows('dynamicDomains')[0];
    const unknown = await load({ dynamicDomains: [{ ...domain, id: 'bad_domain', grants: ['teleport'] }] });
    expect(messages(unknown)).toMatch(/Invalid enum value/);
    expect(unknown.registries.dynamicDomains.has('bad_domain')).toBe(false);

    const twice = await load({ dynamicDomains: [{ ...domain, id: 'second_private', requires: { frame: 'play', holdBand: 'keeping' } }] });
    expect(messages(twice)).toMatch(/already granted by another domain/);

    const gap = await load({ holdBands: [{ id: 'interest', label: 'Interest', min: 0, max: 14, description: 'x' }] });
    expect(messages(gap)).toMatch(/gap above 14/);
    expect(messages(gap)).toMatch(/gap below 20/);

    const dup = await load({ positionRegions: [{ id: 'another_hollow', rank: 'hollow', label: 'Hollow', description: 'x' }] });
    expect(messages(dup)).toMatch(/a second region has the rank "hollow"/);
  });

  it('a milestone that names an unknown track, band or category, and a frame effect that goes nowhere', async () => {
    const m = rows('dynamicMilestones').find((x) => x.id === 'first_night_held')!;
    const r = await load({ dynamicMilestones: [
      { ...m, id: 'bad_track', requires: { holdBand: 'nowhere', tracks: { nothing: 1 }, categories: ['nope'] } },
      { ...m, id: 'bad_frame', from: 'play', to: 'play', effects: [{ type: 'frame' }] },
      { ...m, id: 'bad_sworn', sworn: true },
    ] });
    const text = messages(r);
    expect(text).toMatch(/unknown hold band "nowhere"/);
    expect(text).toMatch(/unknown practice track "nothing"/);
    expect(text).toMatch(/unknown content category "nope"/);
    expect(text).toMatch(/cannot change the frame/);
    expect(text).toMatch(/go together/);
  });

  it('a style named neutral, a region of an unknown rank and an instant sign that is not worth 100', async () => {
    const style = rows('practiceStyles')[0];
    const r = await load({
      practiceStyles: [{ ...style, id: 'neutral' }],
      positionRegions: [{ id: 'x', rank: 'lost', label: 'x', description: 'x' }],
      dynamicSigns: [{ id: 'weak', kind: 'dynamic_item', amount: 50, instant: true, description: 'x' }],
    });
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.registries.practiceStyles.has('neutral')).toBe(false);
    expect(r.registries.dynamicSigns.has('weak')).toBe(false);
  });
});
