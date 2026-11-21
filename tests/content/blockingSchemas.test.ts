import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { REGISTRY_NAMES, type RegistryName } from '../../src/content/types';
import { PLAYER_VISIBLE } from '../../src/analysis/describe';
import { CONTENT_GATED_REGISTRIES } from '../../src/engine/bonds';
import { ESCALATION_ORDER, effectsOfEntry } from '../../src/engine/blocking/types';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const NEW: RegistryName[] = ['worshipTargets', 'blockingPostures', 'blockingAnchors', 'blockingContacts', 'blockingItems', 'blockingActivities', 'momentSources', 'contactPhysics', 'physicsCues', 'stimulusKinds', 'escalationVerbs', 'commanderConditions'];
const FIXTURE = 'tests/fixtures/packs/blocking';

/** The core pack, the fixture pack and an in-memory pack of `rows` per registry (later packs win by id). */
async function load(rows: Partial<Record<RegistryName, unknown[]>> = {}, roots: string[] = ['content/core', FIXTURE]) {
  const mem: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 50, files: Object.fromEntries(Object.keys(rows).map((k) => [k, `${k}.json`])) },
    ...Object.fromEntries(Object.entries(rows).map(([k, v]) => [`mem/${k}.json`, v])),
  };
  return loadPacks([...roots, 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
}
const messages = (r: { errors: Array<{ message: string; pack: string }> }) => r.errors.map((e) => e.message).join('\n');

let base: Awaited<ReturnType<typeof load>>;
beforeAll(async () => {
  base = await load();
});

describe('the twelve registries (P15a)', () => {
  it('are registry names, all described, and all but the cues and the verbs are player-visible', () => {
    for (const n of NEW) {
      expect(REGISTRY_NAMES, n).toContain(n);
      expect(DESCRIBED_REGISTRIES, n).toContain(n);
    }
    for (const n of NEW) expect(PLAYER_VISIBLE.includes(n), n).toBe(n !== 'physicsCues' && n !== 'escalationVerbs');
  });

  it('the seven registries that may carry contentTags are gated', () => {
    for (const n of ['worshipTargets', 'blockingContacts', 'blockingItems', 'blockingActivities', 'momentSources', 'contactPhysics', 'stimulusKinds']) expect(CONTENT_GATED_REGISTRIES, n).toContain(n);
    for (const n of ['blockingPostures', 'blockingAnchors', 'physicsCues', 'escalationVerbs', 'commanderConditions']) expect(CONTENT_GATED_REGISTRIES, n).not.toContain(n);
  });

  it('each registry loads a valid row', () => {
    expect(base.errors).toEqual([]);
    for (const n of NEW) expect(base.registries[n].size, n).toBeGreaterThan(0);
    const contact = base.registries.blockingContacts.get('fx_foot_worship')!;
    expect(contact.dir).toBe('commander');
    expect(effectsOfEntry(contact).map((e) => e.type)).toEqual(['escalation', 'physics']);
    expect(effectsOfEntry(base.registries.blockingPostures.get('fx_sitting'))).toEqual([]);
    expect(effectsOfEntry(undefined)).toEqual([]);
  });

  it('every engine event of the package is reserved', () => {
    for (const t of ['blocking_changed', 'blocking_rolled_back', 'moment_fired', 'moment_answered', 'moment_lapsed', 'moment_escalated', 'physics_started', 'physics_segment', 'physics_signal', 'physics_slip', 'physics_cheat', 'physics_caught', 'physics_noise', 'physics_outcome', 'blackout', 'endurance_gained', 'her_skill_gained', 'marathon_phase', 'marathon_done', 'reflex', 'stimulus_stage_changed', 'condition_set', 'condition_ended']) {
      expect(RESERVED_EVENT_TYPES, t).toContain(t);
    }
  });
});

describe('what is refused', () => {
  it('an unknown effect type', async () => {
    const r = await load({ blockingItems: [{ id: 'bad_fx', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'teleport' }] }] });
    expect(messages(r)).toMatch(/Invalid discriminator value/);
    expect(r.registries.blockingItems.has('bad_fx')).toBe(false);
  });

  it('an effect with an unknown key or a missing value', async () => {
    const r = await load({ blockingItems: [
      { id: 'bad_a', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'camera', mode: 'from_below', zoom: 2 }] },
      { id: 'bad_b', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'sound' }] },
      { id: 'bad_c', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'perception' }] },
    ] });
    for (const id of ['bad_a', 'bad_b', 'bad_c']) expect(r.registries.blockingItems.has(id), id).toBe(false);
  });

  it('a furniture anchor with an affordance no plan room has', async () => {
    const r = await load({ blockingAnchors: [{ id: 'on_the_moon', kind: 'furniture', requires: { affordances: ['moon_base'] }, label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(r)).toMatch(/no plan room offers the affordance "moon_base"/);
  });

  it('a furniture anchor with no requirement at all', async () => {
    const r = await load({ blockingAnchors: [{ id: 'floating', kind: 'furniture', label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(r)).toMatch(/requires the affordance/);
  });

  it('a contact implying an unknown posture', async () => {
    const r = await load({ blockingContacts: [{ id: 'bad_implies', scope: 'any', dir: 'her', implies: { actor: { posture: 'levitating' } }, label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(r)).toMatch(/unknown posture "levitating"/);
  });

  it('a contact naming an unknown target, physics, stimulus or source', async () => {
    const r = await load({ blockingContacts: [{ id: 'bad_refs', scope: 'any', dir: 'her', target: ['nowhere'], physics: [{ id: 'no_physics' }], stimuli: ['no_stimulus'], sources: { no_source: 1 }, label: 'X', description: 'x', promptHint: 'x' }] });
    const m = messages(r);
    for (const w of ['worship target "nowhere"', 'contact physics "no_physics"', 'stimulus kind "no_stimulus"', 'moment source "no_source"']) expect(m).toContain(w);
  });

  it('a source frame of two options', async () => {
    const r = await load({ momentSources: [{ id: 'two_options', scope: 'any', frame: [{ type: 'yielded', generic: 'yes' }, { type: 'resisted', generic: 'no' }], live: ['extracted'], description: 'x' }] });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.registries.momentSources.has('two_options')).toBe(false);
  });

  it('a source option of an unknown response type', async () => {
    const o = (type: string) => ({ type, generic: 'x' });
    const r = await load({ momentSources: [{ id: 'odd_type', scope: 'any', frame: [o('yielded'), o('resisted'), o('shrugged')], live: ['extracted'], description: 'x' }] });
    expect(r.registries.momentSources.has('odd_type')).toBe(false);
  });

  it('an escalation verb outside the enum, as a row and as an effect', async () => {
    const row = await load({ escalationVerbs: [{ id: 'zap', label: 'Zap', promptHint: 'zaps', description: 'x' }] });
    expect(row.registries.escalationVerbs.has('zap')).toBe(false);
    const fx = await load({ blockingItems: [{ id: 'zapper', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'escalation', verb: 'zap' }] }] });
    expect(fx.registries.blockingItems.has('zapper')).toBe(false);
    expect(ESCALATION_ORDER).toHaveLength(15);
  });

  it('an escalation verb nothing defines', async () => {
    const r = await load({ blockingItems: [{ id: 'tugger', scope: 'any', slots: ['neck'], label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'escalation', verb: 'tug_leash' }] }] });
    expect(messages(r)).toMatch(/unknown escalation verb "tug_leash"/);
  });

  it('a pastime naming a dynamic source', async () => {
    const pastime = (sources: string[]) => ({ id: 'fx_pastime', label: 'Pastime', locations: ['mess'], slots: ['evening'], talk: 'some', herActivity: 'fx_on_comms', commanderActivity: 'fx_c_tidying', sensoryTag: 'x', momentSources: sources, description: 'x', opening: 'x', lines: ['x', 'x'] });
    const bad = await load({ pastimes: [pastime(['fx_dynamic_source'])] });
    expect(messages(bad)).toMatch(/"fx_dynamic_source" needs a dynamic frame/);
    const ok = await load({ pastimes: [pastime(['fx_source'])] });
    expect(messages(ok)).not.toMatch(/momentSources/);
  });

  it('contentTags on the new gated registries are checked against the categories', async () => {
    const r = await load({ blockingItems: [{ id: 'bad_tag', scope: 'any', contentTags: ['no_such_category'], slots: ['neck'], label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(r)).toMatch(/unknown content category "no_such_category"/);
    const ok = await load({ blockingItems: [{ id: 'good_tag', scope: 'any', contentTags: ['restraint'], slots: ['neck'], label: 'X', description: 'x', promptHint: 'x' }] });
    expect(ok.registries.blockingItems.get('good_tag')!.contentTags).toEqual(['restraint']);
  });

  it('contentTags on a registry that is not gated', async () => {
    const r = await load({ blockingPostures: [{ id: 'tagged_posture', contentTags: ['restraint'], label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(r)).toMatch(/Unrecognized key.*contentTags/);
  });

  it('text over its limit: a label of 41, a hint of 121, a generic option word of 41', async () => {
    const r = await load({ blockingPostures: [
      { id: 'long_label', label: 'x'.repeat(41), description: 'x', promptHint: 'x' },
      { id: 'long_hint', label: 'x', description: 'x', promptHint: 'x'.repeat(121) },
    ] });
    for (const id of ['long_label', 'long_hint']) expect(r.registries.blockingPostures.has(id), id).toBe(false);
    const o = (generic: string) => ({ type: 'yielded', generic });
    const s = await load({ momentSources: [{ id: 'long_generic', scope: 'any', frame: [o('x'.repeat(41)), o('x'), o('x')], live: ['extracted'], description: 'x' }] });
    expect(s.registries.momentSources.has('long_generic')).toBe(false);
  });

  it('a physics chained to an unknown physics, a cue for one, an effect naming one', async () => {
    const chain = await load({ contactPhysics: [{ id: 'bad_chain', gauge: { kind: 'fill', start: 0 }, interaction: 'passive', skill: false, segmentSeconds: 30, chains: [{ on: 'slip', to: 'nowhere' }], label: 'X', description: 'x', promptHint: 'x' }] });
    expect(messages(chain)).toMatch(/unknown contact physics "nowhere"/);
    const cue = await load({ physicsCues: [{ id: 'bad_cue', kind: 'count', physics: ['nowhere'], lines: ['a', 'b', 'c'], description: 'x' }] });
    expect(messages(cue)).toMatch(/unknown contact physics "nowhere"/);
    const fx = await load({ blockingContacts: [{ id: 'bad_fx_physics', scope: 'any', dir: 'her', label: 'X', description: 'x', promptHint: 'x', effects: [{ type: 'physics', id: 'nowhere' }, { type: 'status_after', id: 'nobody', afterExchanges: 2 }] }] });
    expect(messages(fx)).toMatch(/unknown contact physics "nowhere"/);
    expect(messages(fx)).toMatch(/unknown commander condition "nobody"/);
  });

  it('cues need three to five lines; a worship target needs a zone for its side', async () => {
    const few = await load({ physicsCues: [{ id: 'two_lines', kind: 'count', lines: ['a', 'b'], description: 'x' }, { id: 'six_lines', kind: 'count', lines: ['a', 'b', 'c', 'd', 'e', 'f'], description: 'x' }] });
    expect(few.registries.physicsCues.has('two_lines') || few.registries.physicsCues.has('six_lines')).toBe(false);
    const zone = await load({ worshipTargets: [{ id: 'no_zone', contentTags: ['worship'], side: 'both', zone: { front: { x: 1, y: 1, r: 2 } }, stimuli: ['fx_scent'], label: 'X', description: 'x' }] });
    expect(zone.registries.worshipTargets.has('no_zone')).toBe(false);
  });

  it('an engine event cannot be emitted by an activity', async () => {
    const r = await load({ activities: [{ id: 'fake_moment', extends: 'train', effects: [{ type: 'emit_event', event: 'moment_fired' }] }] });
    expect(messages(r)).toMatch(/this event name belongs to the engine/);
  });
});
