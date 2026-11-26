import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { effectsOfEntry, type BlockingActivityEntry, type ContactEntry } from '../../src/engine/blocking/types';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const DOC = readFileSync('docs/content/blocking.md', 'utf8');
/** The ids in the first column of one subsection (or section) of blocking.md. */
function docIds(heading: string): string[] {
  const start = DOC.indexOf(`\n${heading}`);
  expect(start, heading).toBeGreaterThan(-1);
  const ends = [DOC.indexOf('\n## ', start + 4), DOC.indexOf('\n### ', start + 4)].filter((n) => n !== -1);
  const body = DOC.slice(start, Math.min(...ends));
  return body.split('\n').filter((l) => l.startsWith('| `')).map((l) => /`([a-z_]+)`/.exec(l.split('|')[1]!)![1]!);
}
const contact = (id: string) => reg.blockingContacts.get(id) as unknown as ContactEntry;
const activity = (id: string) => reg.blockingActivities.get(id) as unknown as BlockingActivityEntry;
const contacts = () => [...reg.blockingContacts.values()] as unknown as ContactEntry[];
const activities = () => [...reg.blockingActivities.values()] as unknown as BlockingActivityEntry[];

describe('ids match blocking.md (P15a)', () => {
  it('contacts: §3.1–§3.5 (48), and §3.6 (role reversal) is absent', () => {
    const doc = [...docIds('### 3.1'), ...docIds('### 3.2'), ...docIds('### 3.3'), ...docIds('### 3.4'), ...docIds('### 3.5')];
    expect(doc).toHaveLength(48);
    expect([...reg.blockingContacts.keys()].sort()).toEqual([...doc].sort());
    for (const id of docIds('### 3.6')) expect(reg.blockingContacts.has(id), id).toBe(false);
    expect(docIds('### 3.6')).toContain('taken_all_fours');
  });

  it('activities: §4 (58, with the throne\'s holding_audience) as is, §5 (19) with c_ on the four that share an id with hers', () => {
    const her = docIds('## 4.');
    const own = docIds('## 5.');
    expect(her).toHaveLength(58);
    expect(own).toHaveLength(19);
    const shared = own.filter((id) => her.includes(id));
    expect(shared.sort()).toEqual(['eating', 'idle', 'on_comms', 'writing_report']);
    const expected = [...her, ...own.map((id) => (shared.includes(id) ? `c_${id}` : id))];
    expect([...reg.blockingActivities.keys()].sort()).toEqual(expected.sort());
    expect(reg.blockingActivities.size).toBe(77);
    for (const id of her) expect(activity(id).actor, id).toBe('her');
    for (const id of own) expect(activity(shared.includes(id) ? `c_${id}` : id).actor, id).toBe('commander');
  });
});

describe('scope by section', () => {
  it('§3.1–§3.3 and §3.5 are dynamic, §3.4 is any', () => {
    for (const h of ['### 3.1', '### 3.2', '### 3.3', '### 3.5']) for (const id of docIds(h)) expect(contact(id).scope, id).toBe('dynamic');
    for (const id of docIds('### 3.4')) expect(contact(id).scope, id).toBe('any');
  });

  it('hand_feeding and face_in_her_neck are any with no tag; the tagged reading inside a dynamic is in the description', () => {
    for (const id of ['hand_feeding', 'face_in_her_neck']) {
      expect(contact(id).scope, id).toBe('any');
      expect(contact(id).contentTags, id).toBeUndefined();
    }
  });

  it('the activities inside a dynamic and every commander service activity are dynamic; her own and the commander\'s own work are any', () => {
    for (const id of ['ignoring', 'inspecting', 'writing_task', 'choosing_equipment', 'holding_audience']) expect(activity(id).scope, id).toBe('dynamic');
    const service = activities().filter((a) => a.actor === 'commander' && !a.id.startsWith('c_'));
    expect(service).toHaveLength(15);
    for (const a of service) expect(a.scope, a.id).toBe('dynamic');
    for (const id of ['c_writing_report', 'c_on_comms', 'c_eating', 'c_idle']) expect(activity(id).scope, id).toBe('any');
    expect(activities().filter((a) => a.actor === 'her' && a.scope === 'dynamic')).toHaveLength(5);
  });
});

describe('the contacts\' fields', () => {
  it('weight-bearing contacts declare implies (spec §2.2)', () => {
    for (const id of ['human_chair', 'footrest', 'standing_on', 'straddled', 'under_her_seat', 'feet_on_face', 'on_lap']) {
      const i = contact(id).implies;
      expect(i, id).toBeDefined();
      expect(Object.keys(i!).length, id).toBeGreaterThan(0);
    }
    expect(contact('human_chair').implies).toEqual({ actor: { posture: 'sitting', anchor: 'on_person' }, receiver: { posture: 'all_fours' } });
    expect(contact('footrest').implies!.receiver).toEqual({ posture: 'all_fours' });
    expect(contact('standing_on').implies).toEqual({ actor: { posture: 'standing', anchor: 'on_person' }, receiver: { posture: 'lying_front' } });
  });

  it('contacts with two physics', () => {
    const ids = (id: string) => (contact(id).physics ?? []).map((p) => p.id);
    expect(ids('smothered_armpit')).toEqual(['breath', 'saturation']);
    expect(ids('face_to_bottom')).toEqual(['breath', 'saturation']);
    expect(ids('under_her_seat')).toEqual(['breath', 'her_activity']);
    expect(ids('feet_on_face')).toEqual(['saturation', 'her_activity']);
    expect(ids('between_thighs')).toEqual(['breath', 'weight']);
    for (const c of contacts()) expect((c.physics ?? []).length, c.id).toBeLessThanOrEqual(2);
    expect(effectsOfEntry(reg.blockingContacts.get('between_thighs')).filter((e) => e.type === 'physics')).toHaveLength(2);
  });

  it('seal ranges on the breath contacts (AUTHOR TO TUNE); hand_over_mouth has no physics', () => {
    const seal = (id: string) => contact(id).physics!.find((p) => p.id === 'breath')!.seal;
    expect(seal('smothered_armpit')).toEqual(['firm', 'leaky']);
    expect(seal('smothered_breasts')).toEqual(['tight', 'firm']);
    expect(seal('under_her_seat')).toEqual(['tight', 'firm']);
    expect(seal('face_to_bottom')).toEqual(['firm']);
    expect(seal('between_thighs')).toEqual(['leaky']);
    expect(contact('hand_over_mouth').physics).toBeUndefined();
  });

  it('the reference case: kneeling_between_legs', () => {
    const c = contact('kneeling_between_legs');
    expect(effectsOfEntry(c)).toEqual(expect.arrayContaining([
      { type: 'escalation', verb: 'nudge_with_foot' }, { type: 'visibility', hiddenFromDoor: true }, { type: 'backdrop', id: 'frame_under_desk' },
    ]));
    expect(c.requires).toEqual({ affordances: ['desk'] });
    expect(c.sources).toEqual({ third_party: 1, remote: 1 });
    expect(c.implies).toEqual({ actor: { posture: 'kneeling_upright', anchor: 'under_desk' }, receiver: { posture: 'sitting', anchor: 'at_desk' } });
    expect(c.dir).toBe('commander');
  });

  it('mouth contacts', () => {
    expect(contacts().filter((c) => c.mouth === true).map((c) => c.id).sort()).toEqual(['boot_worship', 'face_in_her_neck', 'foot_worship', 'oral_service', 'sole_to_mouth']);
  });

  it('directions: ← she acts, → the commander acts, ↔ either, no touch none', () => {
    expect(contact('smothered_armpit').dir).toBe('her');
    expect(contact('foot_worship').dir).toBe('commander');
    expect(contact('spooning').dir).toBe('either');
    for (const id of ['step_behind', 'kneeling_at_door', 'forehead_to_forehead', 'back_to_back']) expect(contact(id).dir, id).toBe('none');
  });

  it('the escalation channel follows the contact (blocking.md §9)', () => {
    const verb = (id: string) => effectsOfEntry(reg.blockingContacts.get(id)).find((e) => e.type === 'escalation');
    expect(verb('smothered_armpit')).toMatchObject({ verb: 'tighten_hold' });
    expect(verb('between_thighs')).toMatchObject({ verb: 'squeeze' });
    expect(verb('held_by_hair')).toMatchObject({ verb: 'tug_hair' });
    expect(verb('foot_on_head')).toMatchObject({ verb: 'press' });
    expect(verb('pinned_to_wall')).toMatchObject({ verb: 'press_harder' });
    expect(verb('crawling_on_leash')).toMatchObject({ verb: 'tug_leash' });
    expect(verb('footrest')).toBeUndefined();
  });

  it('devices that lock the tabs: the smothering contacts', () => {
    const locks = contacts().filter((c) => effectsOfEntry(c).some((e) => e.type === 'device')).map((c) => c.id).sort();
    expect(locks).toEqual(['smothered_armpit', 'smothered_breasts', 'under_her_seat']);
  });

  it('bathing needs a place with water; tied to a bedpost needs a bunk', () => {
    expect(contact('bathing_her').requires).toEqual({ affordances: ['water'] });
    expect(contact('tied_to_bedpost').requires).toEqual({ affordances: ['bunk'] });
  });
});

describe('the activities\' fields', () => {
  it('the reference case: on_comms', () => {
    expect(activity('on_comms')).toMatchObject({ actor: 'her', attention: 'elsewhere', pairTags: ['focused'], sources: { remote: 2 }, impliedPosture: 'sitting' });
  });

  it('attention is read from the first word of the table cell', () => {
    expect(activity('attending').attention).toBe('on_commander');
    expect(activity('leading_briefing').attention).toBe('elsewhere');
    expect(activity('waiting_for_commander').attention).toBe('on_commander');
    for (const id of ['showering', 'sleeping', 'dozing', 'firmware_flash']) expect(activity(id).attention, id).toBe('none');
    expect(activity('idle').attention).toBe('divided');
  });

  it('pair tags follow the table; the dash is none', () => {
    expect(activity('idle').pairTags).toEqual(['relaxed']);
    expect(activity('showering').pairTags).toEqual(['body']);
    expect(activity('sleeping').pairTags).toEqual(['asleep']);
    expect(activity('attending').pairTags).toBeUndefined();
    expect(activity('mourning').pairTags).toBeUndefined();
  });

  it('fromActivities: the P2 activities that open a scene with her activity', () => {
    expect(activity('repairing_gear').fromActivities).toEqual(['workshop']);
    expect(activity('working_out').fromActivities).toEqual(['train']);
    expect(activity('tending_own_wound').fromActivities).toEqual(['medbay']);
    expect(activity('eating').fromActivities).toEqual(['mess']);
    expect(activity('reading_book').fromActivities).toEqual(['study']);
    expect(activities().filter((a) => a.fromActivities !== undefined)).toHaveLength(5);
    for (const a of activities()) for (const p of a.fromActivities ?? []) expect(reg.activities.has(p), p).toBe(true);
  });

  it('the commander\'s service entries carry fits and judged; standing by is a stillness strain', () => {
    expect(activity('taking_dictation')).toMatchObject({ fits: ['focused'], judged: true });
    expect(activity('reading_aloud')).toMatchObject({ fits: ['relaxed', 'asleep'], judged: true });
    expect(activity('doing_her_laundry').fits).toBeUndefined();
    expect(effectsOfEntry(reg.blockingActivities.get('standing_by'))).toEqual([{ type: 'strain', condition: 'stillness', rate: 1 }]);
    expect(activity('c_idle').judged).toBeUndefined();
  });

  it('every pastime activity of the right actor and every hobby activity resolves (the P14c hand-off)', () => {
    for (const h of reg.hobbies.values()) for (const id of h.activityIds as string[]) expect(activity(id)?.actor, `${String(h.id)}: ${id}`).toBe('her');
    expect(reg.hobbies.get('training')!.activityIds).toEqual(['working_out', 'stretching']);
  });
});

describe('the hobby hand-off check', () => {
  const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
  const hobby = (activityIds: string[]) => ({ id: 'fx_hobby', label: 'Hobby', locations: ['workshop'], activityIds, teachable: true, milestones: [1, 2, 3, 4].map((n) => ({ id: `m${n}`, line: 'x' })), description: 'x' });
  const load = async (activityIds: string[]) => {
    const mem: Record<string, unknown> = {
      'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 50, files: { hobbies: 'hobbies.json' } },
      'mem/hobbies.json': [hobby(activityIds)],
    };
    return loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
  };

  it('a hobby activityId that is not a her-activity is refused', async () => {
    const msgs = (r: Awaited<ReturnType<typeof load>>) => r.errors.map((e) => e.message).join('\n');
    expect(msgs(await load(['c_idle']))).toMatch(/"c_idle" is an activity of the commander/);
    expect(msgs(await load(['polishing_her_boots']))).toMatch(/is an activity of the commander/);
    expect(msgs(await load(['nothing_like_it']))).toMatch(/unknown blocking activity "nothing_like_it"/);
    expect((await load(['reading_book'])).errors).toEqual([]);
  });
});
