import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { REGISTRY_NAMES, type RegistryName } from '../../src/content/types';
import { PLAYER_VISIBLE } from '../../src/analysis/describe';
import { CONTENT_GATED_REGISTRIES } from '../../src/engine/bonds';
import { bookingKindsFor, rollBookings } from '../../src/engine/personal/bookings';
import { CHECK_KINDS, PRACTICE_EVENT_TYPES, PRACTICE_KINDS } from '../../src/engine/practice/state';
import { TUNING } from '../../src/engine/tuning';
import { ANN, ctxFrom, enable, ofType, partner, plain, seeded } from '../helpers/personal';
import { loadCore } from '../helpers/world';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const NEW: RegistryName[] = ['practiceSeeds', 'holderPunishments', 'implements', 'ceremonySteps'];

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
beforeAll(async () => { base = await load(); });
const rows = (name: RegistryName) => [...base.registries[name].values()];

describe('the four practice registries (P16)', () => {
  it('core pack loads the four registries', () => {
    expect(base.errors).toEqual([]);
    const seeds = rows('practiceSeeds');
    expect(seeds.length).toBeGreaterThanOrEqual(36);
    for (const kind of PRACTICE_KINDS) expect(seeds.filter((s) => s.kind === kind).length, `seeds of kind ${kind}`).toBeGreaterThanOrEqual(5);
    const punishments = rows('holderPunishments');
    expect(punishments).toHaveLength(10);
    for (let severity = 1; severity <= 5; severity++) expect(punishments.filter((p) => p.severity === severity), `punishments of severity ${severity}`).toHaveLength(2);
    expect(rows('implements')).toHaveLength(7);
    const steps = rows('ceremonySteps').sort((a, b) => Number(a.order) - Number(b.order));
    expect(steps).toHaveLength(8);
    expect(steps.map((s) => s.check)).toEqual(['chip', 'words', 'number', 'posture', 'chip', 'posture', 'words', 'chip']);
    expect(steps.every((s) => !(s.styles as string[]).includes('cold'))).toBe(true);
  });

  it('are registry names, described, gated where they carry tags, and only the seeds stay hidden from the player', () => {
    for (const n of NEW) {
      expect(REGISTRY_NAMES, n).toContain(n);
      expect(DESCRIBED_REGISTRIES, n).toContain(n);
      expect(PLAYER_VISIBLE.includes(n), n).toBe(n !== 'practiceSeeds');
    }
    for (const n of ['practiceSeeds', 'holderPunishments', 'implements', 'bookingKinds']) expect(CONTENT_GATED_REGISTRIES, n).toContain(n);
    expect(CONTENT_GATED_REGISTRIES).not.toContain('ceremonySteps');
  });

  it('the seeds name an open track and a closed check, every seed text is a draft, and every gist is two to six words', () => {
    const tracks = new Set(rows('dynamicTracks').map((t) => t.id));
    for (const s of rows('practiceSeeds')) {
      expect(tracks.has(String(s.track)), `${s.id} track`).toBe(true);
      if (s.check !== undefined) expect(CHECK_KINDS).toContain(s.check);
      expect(String(s.description).startsWith('AUTHOR TO WRITE:'), `${s.id} description`).toBe(true);
      expect(String(s.gist).split(/\s+/).length).toBeGreaterThanOrEqual(2);
      expect(String(s.gist).split(/\s+/).length).toBeLessThanOrEqual(6);
      expect((s.contentTags as string[]).length).toBeGreaterThan(0);
    }
    // a denial seed uses neutral wording and the denial tag
    expect(rows('practiceSeeds').filter((s) => s.kind === 'denial').every((s) => (s.contentTags as string[]).includes('denial'))).toBe(true);
  });

  it('a ceremony step with a posture names a blocking posture that exists', () => {
    for (const c of rows('ceremonySteps')) if (c.posture !== undefined) expect(base.registries.blockingPostures.has(String(c.posture)), `${c.id} posture`).toBe(true);
    expect(rows('ceremonySteps').find((c) => c.check === 'posture' && Number(c.order) === 4)!.posture).toBe('kneeling_upright');
  });

  it('every punishment effect carries the tag it needs, and every injury route has a body-independent term', () => {
    for (const p of rows('holderPunishments')) {
      const effects = p.effects as Array<{ type: string; perTrained?: number }>;
      const tags = (p.contentTags as string[] | undefined) ?? [];
      for (const fx of effects) {
        if (fx.type === 'slap' || fx.type === 'physical') expect(tags, `${p.id}/${fx.type}`).toContain('physical_discipline_shown');
        if (fx.type === 'confession') expect(tags, `${p.id}/${fx.type}`).toContain('public_humiliation');
        if (fx.type === 'mark') expect(tags, `${p.id}/${fx.type}`).toContain('body_modification');
        if (fx.type === 'injury_chance') expect(fx.perTrained, `${p.id}/${fx.type}`).toBeGreaterThan(0);
      }
    }
  });

  it('refs: the chastity item names a rule template that exists, and ask_permission asks for permission', () => {
    const tpl = base.registries.relationshipRuleTemplates.get('ask_permission')!;
    expect(tpl).toMatchObject({ asks: 'permission', check: 'intent', contentTags: ['denial'] });
    const item = base.registries.blockingItems.get('chastity_device')!;
    expect((item.effects as Array<{ type: string; template?: string }>).find((e) => e.type === 'rule')!.template).toBe('ask_permission');
    expect(base.registries.relationshipRuleTemplates.has(String((item.effects as Array<{ template?: string }>)[0].template))).toBe(true);
    const service = [...base.registries.relationshipRuleTemplates.values()].filter((t) => (t.contentTags as string[] | undefined)?.includes('service'));
    expect(service).toHaveLength(3);
    for (const t of service) expect(t).toMatchObject({ check: 'intent', conditions: { minLead: 'assertive' } });
  });

  it('every engine event of the package is reserved', () => {
    for (const t of PRACTICE_EVENT_TYPES) expect(RESERVED_EVENT_TYPES, t).toContain(t);
    expect(new Set(PRACTICE_EVENT_TYPES).size).toBe(PRACTICE_EVENT_TYPES.length);
    expect(PRACTICE_EVENT_TYPES).toHaveLength(33);
  });

  it('TUNING.practice holds the spec drafts (R.12) as given and every key of the task', () => {
    const t = TUNING.practice;
    for (const k of ['keep', 'frequency', 'kindWeights', 'taskCap', 'protocolMax', 'stakesCeiling', 'deadlineDays', 'seeds', 'textMax', 'summaryMax', 'fallback', 'sealedLine', 'sealedRecord', 'chainChance', 'xp', 'severity', 'repair',
      'refuseRecord', 'coldWant', 'takeInstead', 'demonstration', 'verdict', 'momentGap', 'kindnessAt', 'refusalAt', 'denialRelief', 'hold', 'alarm', 'ask', 'posture', 'slap', 'ceremony', 'sealedShare', 'noDurationShare', 'unfairness']) {
      expect(t, k).toHaveProperty(k);
    }
    expect(t.seeds).toEqual({ min: 3, max: 6 });
    expect([t.textMax, t.summaryMax, t.repair, t.refuseRecord, t.coldWant, t.kindnessAt, t.refusalAt, t.denialRelief]).toEqual([400, 80, 0.5, 5, 5, 8, -8, 10]);
    expect(t.xp).toEqual({ kept: 2, discipline: 2, demonstration: 6, hold: 3 });
    expect(t.takeInstead).toEqual({ trust: 5, record: 2 });
    expect(t.momentGap).toEqual({ matched: 2, partial: 0, opposite: -3 });
    expect(t.alarm).toEqual({ release: 0.5, late: -0.5, releaseHold: 2, lateRecord: 3, keepRecord: 5 });
    expect(t.slap.windowMs).toEqual({ affectionate: 700, regal: 650, ritual: 550, drill: 550, cold: 500, clinical: 500, possessive: 450, playful: 450, obsessive: 300, vindictive: 350, cruel: 300 });
    expect([t.slap.unannounced, t.slap.feintPerLevel, t.slap.obsessiveSpread]).toEqual([0.3, 0.1, 400]);
    expect(t.unfairness).toMatchObject({ fair: 0, strict: 0.02, capricious: 0.08, unfair: 0.15 });
    expect(t.sealedShare).toMatchObject({ cruel: 0.25, vindictive: 0.25, playful: 0.15, regal: 0.15, ritual: 0.02, cold: 0.05 });
    expect(t.noDurationShare).toMatchObject({ cruel: 0.3, possessive: 0.3, vindictive: 0.3, ritual: 0, drill: 0, cold: 0.1 });
    expect(t.hold).toMatchObject({ gain: 2, impunityAt: 60, sensoryVolume: 0.3 });
    expect(t.posture.callChance).toBe(0.15);
    expect(t.demonstration).toMatchObject({ hold: 3, seenByChance: 0.2 });
    for (const kind of PRACTICE_KINDS) expect(t.fallback[kind]).toMatch(/^AUTHOR TO WRITE: \{gist\}\.$/);
    expect(t.taskCap).toEqual({ play: 1, role: 2, rule: 3 });
    expect(t.stakesCeiling).toEqual({ play: 'minor', role: 'major', rule: 'severe' });
  });
});

describe('what is refused', () => {
  it('a punishment effect without its tag is refused, naming the row', async () => {
    const p = rows('holderPunishments')[0];
    const r = await load({ holderPunishments: [{ ...p, id: 'bad_slap', effects: [{ type: 'slap' }], contentTags: undefined }] });
    expect(messages(r)).toMatch(/the effect "slap" needs the content tag "physical_discipline_shown"/);
    expect(r.errors.map((e) => e.file)).toEqual(['holderPunishments.json']);
    expect(r.errors[0].path).toBe('[0].effects[0]'); // the row and the effect
    expect(r.registries.holderPunishments.has('bad_slap')).toBe(false);
    const ok = await load({ holderPunishments: [{ ...p, id: 'good_slap', effects: [{ type: 'slap' }], contentTags: ['physical_discipline_shown'] }] });
    expect(ok.errors).toEqual([]);
    expect(ok.registries.holderPunishments.has('good_slap')).toBe(true);
    const mark = await load({ holderPunishments: [{ ...p, id: 'bad_mark', effects: [{ type: 'mark', days: 3 }], contentTags: ['restraint'] }] });
    expect(messages(mark)).toMatch(/needs the content tag "body_modification"/);
  });

  it('injury_chance needs a non-body route', async () => {
    const p = rows('holderPunishments')[0];
    const fx = (perTrained: number) => [{ type: 'injury_chance', chance: 0.1, perEndurance: 0.01, perTrained, days: 2 }];
    const bad = await load({ holderPunishments: [{ ...p, id: 'body_only', effects: fx(0), contentTags: ['pain_rough'] }] });
    expect(messages(bad)).toMatch(/perTrained/);
    expect(bad.registries.holderPunishments.has('body_only')).toBe(false);
    const good = await load({ holderPunishments: [{ ...p, id: 'both_routes', effects: fx(0.01), contentTags: ['pain_rough'] }] });
    expect(good.errors).toEqual([]);
  });

  it('a seed names an open track and a closed check', async () => {
    const s = rows('practiceSeeds')[0];
    const track = await load({ practiceSeeds: [{ ...s, id: 'bad_track', track: 'nope' }] });
    expect(messages(track)).toMatch(/unknown practice track "nope"/);
    expect(track.errors.find((e) => /nope/.test(e.message))).toMatchObject({ file: 'practiceSeeds.json', path: '[0].track' });
    const check = await load({ practiceSeeds: [{ ...s, id: 'bad_check', check: 'magic' }] });
    expect(messages(check)).toMatch(/Invalid enum value/);
    expect(check.registries.practiceSeeds.has('bad_check')).toBe(false);
    const gist = await load({ practiceSeeds: [{ ...s, id: 'long_gist', gist: 'one two three four five six seven' }, { ...s, id: 'short_gist', gist: 'one' }] });
    expect(messages(gist)).toMatch(/two to six words/);
  });

  it('a ceremony posture step needs its posture and an item\'s rule template must exist', async () => {
    const c = rows('ceremonySteps')[0];
    const noPosture = await load({ ceremonySteps: [{ ...c, id: 'bad_step', check: 'posture' }] });
    expect(messages(noPosture)).toMatch(/names its posture/);
    const unknown = await load({ ceremonySteps: [{ ...c, id: 'bad_posture', check: 'posture', posture: 'nowhere' }] });
    expect(messages(unknown)).toMatch(/unknown posture "nowhere"/);
    const item = base.registries.blockingItems.get('chastity_device')!;
    const ref = await load({ blockingItems: [{ ...item, id: 'bad_item', effects: [{ type: 'rule', template: 'no_such_template' }] }] });
    expect(messages(ref)).toMatch(/unknown rule template "no_such_template"/);
  });

  it('a content emit_event of a practice event is refused', async () => {
    const act = [...base.registries.activities.values()][0];
    const r = await load({ activities: [{ ...act, id: 'fake_task', effects: [{ type: 'emit_event', event: 'task_issued' }] }] });
    expect(messages(r)).toMatch(/belongs to the engine/);
    expect(r.registries.activities.has('fake_task')).toBe(false);
  });

  it('a held booking kind needs weight 0 and a rolled one does not', async () => {
    const k = rows('bookingKinds').find((x) => x.id === 'held_in_quarters')!;
    expect(k).toMatchObject({ held: true, weight: 0, wantRelief: 10, locationId: 'quarters_unit', contentTags: ['restraint'] });
    const heavy = await load({ bookingKinds: [{ ...k, id: 'heavy_hold', weight: 5 }] });
    expect(messages(heavy)).toMatch(/weight is 0/);
    const none = await load({ bookingKinds: [{ ...k, id: 'weightless', held: undefined }] });
    expect(messages(none)).toMatch(/weight of at least 1/);
  });
});

describe('held booking kinds are never rolled', () => {
  it('rollBookings over many seeded days never books held_in_quarters, and bookingKindsFor does not list it', async () => {
    const reg = await loadCore();
    expect(reg.bookingKinds.has('held_in_quarters')).toBe(true);
    const state = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 90, want: 50 }), 'restraint');
    expect(bookingKindsFor(state, reg, ANN).map((k) => k.id)).not.toContain('held_in_quarters');
    let made = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = seeded(structuredClone(state), seed);
      const booked = ofType(rollBookings(t, ctxFrom(t, reg)), 'booking_made');
      made += booked.length;
      for (const b of booked) expect(b.kindId).not.toBe('held_in_quarters');
    }
    expect(made, 'the roll is live: some seeds book something else').toBeGreaterThan(0);
  });
});
