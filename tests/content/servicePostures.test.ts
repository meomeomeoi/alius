import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PLAYER_VISIBLE } from '../../src/analysis/describe';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, ServicePostureSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import type { Registries } from '../../src/content/types';
import { BASE_POINTS, type PointStates } from '../../src/ui/scene/dial/points';
import { PRESETS } from '../fixtures/dial/presets';
import { loadCore } from '../helpers/world';

/**
 * P16b, Task 9: the 47 posture presets of docs/content/blocking.md section 7.3 are the registry `servicePostures`, beside the 13 bases of `blockingPostures`
 * (whose strict schema stays). A preset is read by `base`, `points`, `meaning`, `humiliation`, `tags`, `supports`, `signal`, `noise` and `default`, never by id.
 */
// compile-time: the schema's point states are the dial's (`PointStates`) and the other way round
type SchemaPoints = import('../../src/content/schemas').ServicePostureEntry['points'];
const _schemaFitsDial = (p: SchemaPoints): PointStates => p;
const _dialFitsSchema = (p: PointStates): SchemaPoints => p;
void _schemaFitsDial; void _dialFitsSchema;

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const rows = () => [...reg.servicePostures.values()];
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

describe('the registry servicePostures', () => {
  it('is a registry name, described, shown to the player, and holds the 47 presets', () => {
    expect(REGISTRY_NAMES).toContain('servicePostures');
    expect(DESCRIBED_REGISTRIES).toContain('servicePostures');
    expect(PLAYER_VISIBLE).toContain('servicePostures');
    expect(rows()).toHaveLength(47);
  });

  it('every preset stands on one of the 13 bases', () => {
    expect(reg.blockingPostures.size).toBe(13);
    for (const p of rows()) expect(reg.blockingPostures.has(String(p.base)), `${p.id} base`).toBe(true);
  });

  it('every base has exactly one default preset', () => {
    for (const base of reg.blockingPostures.keys()) {
      const defaults = rows().filter((p) => p.base === base && p.default === true);
      expect(defaults.map((p) => p.id), `default of ${base}`).toHaveLength(1);
    }
    expect(rows().filter((p) => p.default === true)).toHaveLength(13);
  });

  it('a second default on a base is refused by the registry check', async () => {
    const dup = { ...(await read('content/core/servicePostures.json')).find((p: { id: string }) => p.id === 'kneel_rest'), id: 'kneel_rest_two', default: true };
    const mem: Record<string, unknown> = {
      'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 50, files: { servicePostures: 'servicePostures.json' } },
      'mem/servicePostures.json': [dup, { ...dup, id: 'kneel_rest_three', default: true }],
    };
    const r = await loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/default/);
  });

  it('every point state is a state the dial knows (PointStates)', () => {
    // the states themselves are checked by the schema (and at compile time above: the schema's enums are `PointStates` both ways)
    for (const states of Object.values(BASE_POINTS)) for (const k of Object.keys(states)) expect(['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet']).toContain(k);
    for (const p of rows()) {
      expect(ServicePostureSchema.safeParse(p).success, p.id).toBe(true);
      for (const point of Object.keys(p.points as object)) expect(['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet'], `${p.id} point ${point}`).toContain(point);
      for (const point of Object.keys(p.drift as Record<string, number>)) expect(['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet'], `${p.id} drift ${point}`).toContain(point);
    }
  });

  it('a point that drifts is a point the preset sets, with the rates of the spec TUNING', () => {
    const by = (id: string) => reg.servicePostures.get(id)!.drift as Record<string, number>;
    expect(by('kneel_hands_behind_head').arms).toBe(9);
    expect(by('arms_out').arms).toBe(10);
    expect(by('tiptoe_hands_head').feet).toBe(10);
    expect(by('kneel_upright').hips).toBe(5);
    expect(by('kneel_upright').knees).toBe(3);
    expect(by('kneel_upright').head).toBe(4);
    expect(by('kneel_upright').gaze).toBe(0); // the gaze drifts by temptation, not fatigue
    expect(by('kneel_upright').arms).toBeUndefined(); // hands on the thighs hold themselves
    expect(by('attention').torso).toBe(4);
    for (const p of rows()) for (const point of Object.keys(p.drift as object)) expect((p.points as Record<string, unknown>)[point], `${p.id} drifts ${point} it does not set`).toBeDefined();
  });

  it('tags are content categories, requires name places, anchors, items and tracks that exist', () => {
    const categories = new Set(reg.contentCategories.keys());
    for (const p of rows()) {
      for (const t of p.tags as string[]) expect(categories.has(t), `${p.id} tag ${t}`).toBe(true);
      const r = (p.requires ?? {}) as { anchor?: string[]; items?: string[]; track?: string };
      for (const a of r.anchor ?? []) expect(reg.blockingAnchors.has(a), `${p.id} anchor ${a}`).toBe(true);
      for (const i of r.items ?? []) expect(reg.blockingItems.has(i), `${p.id} item ${i}`).toBe(true);
      if (r.track !== undefined) expect(reg.dynamicTracks.has(r.track), `${p.id} track`).toBe(true);
      for (const c of (p.supports ?? []) as string[]) expect(reg.blockingContacts.has(c) || reg.contactPhysics.has(c), `${p.id} supports ${c}`).toBe(true);
    }
  });

  it('humiliation is 0 to 5, meanings and signal are closed words, every row has a description and a hint with no pronoun for the commander', () => {
    for (const p of rows()) {
      expect(Number.isInteger(p.humiliation) && (p.humiliation as number) >= 0 && (p.humiliation as number) <= 5, p.id).toBe(true);
      expect((p.meaning as string[]).length, p.id).toBeGreaterThan(0);
      expect(['none', 'odd', 'telling', 'exposing']).toContain(p.signal);
      expect(['low', 'mid', 'high']).toContain(p.noise);
      expect(String(p.description).startsWith('AUTHOR TO WRITE:'), p.id).toBe(true);
      expect(String(p.promptHint), p.id).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });

  it('the spec rows: the hard ones carry the gate they were given (kneel_present supports on_hands; hogtied is a restraint with every point fixed)', () => {
    const by = (id: string) => reg.servicePostures.get(id)!;
    expect(by('kneel_present').supports).toEqual(['on_hands']);
    expect(by('hogtied').tags).toContain('restraint');
    expect(by('hogtied').drift).toEqual({});
    expect(by('hogtied').hogtie).toBe(true);
    expect(by('facing_wall' as string)).toBeUndefined(); // renamed: an activity of that name exists
    expect(by('face_to_wall').humiliation).toBe(2);
    expect((by('face_to_wall').requires as { anchor: string[] }).anchor).toEqual(['corner', 'by_wall']);
  });

  it('no preset id is the id of a blocking activity (the activity `facing_wall` and the preset `face_to_wall` are told apart)', () => {
    for (const p of rows()) {
      expect(reg.blockingActivities.has(p.id), `${p.id} is an activity`).toBe(false);
      
    }
  });

  it('the fixture of the dial (the contact sheet and the mannequin tests) reads the registry: the same 47 rows, the dial states unchanged', async () => {
    const json = (await read('content/core/servicePostures.json')) as Array<{ id: string; base: string; points: object }>;
    expect(PRESETS.map((x) => x.id)).toEqual(json.map((x) => x.id));
    for (const x of PRESETS) {
      const row = json.find((j) => j.id === x.id)!;
      expect(x.base, x.id).toBe(row.base);
      expect(x.points, x.id).toEqual(row.points);
    }
  });
});
