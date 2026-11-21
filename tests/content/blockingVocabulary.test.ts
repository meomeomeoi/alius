import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { effectsOfEntry, ESCALATION_ORDER, WORN_SLOTS } from '../../src/engine/blocking/types';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const DOC = readFileSync('docs/content/blocking.md', 'utf8');
/** The ids in the first column of the tables of one section of blocking.md (`a` / `b` in one cell are two ids). */
function docIds(heading: string, stopAt?: string): string[] {
  const start = DOC.indexOf(`\n## ${heading}`);
  expect(start, heading).toBeGreaterThan(-1);
  const end = DOC.indexOf('\n## ', start + 4);
  let body = DOC.slice(start, end === -1 ? undefined : end);
  if (stopAt) body = body.slice(0, body.indexOf(stopAt));
  return body.split('\n').filter((l) => l.startsWith('| `')).flatMap((l) => [...l.split('|')[1]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!));
}
const ids = (name: keyof Registries) => [...reg[name].keys()];
const effectTypes = (name: keyof Registries, id: string) => effectsOfEntry(reg[name].get(id)).map((e) => e.type);
const find = (name: keyof Registries, id: string, type: string) => effectsOfEntry(reg[name].get(id)).find((e) => e.type === type) as Record<string, unknown> | undefined;

describe('ids match blocking.md (P15a)', () => {
  it('worship targets: the 17 of §1', () => {
    expect(docIds('1. Worship targets')).toHaveLength(17);
    expect(ids('worshipTargets').sort()).toEqual(docIds('1. Worship targets').sort());
  });

  it('items: the 31 of §2, the role-reversal strap and the six feminization items included', () => {
    expect(docIds('2. Items')).toHaveLength(31);
    expect(ids('blockingItems').sort()).toEqual(docIds('2. Items').sort());
    for (const id of ['strap', 'fem_underwear', 'fem_legwear', 'fem_dress', 'fem_makeup', 'fem_jewellery', 'fem_wig_or_hair']) {
      expect(reg.blockingItems.has(id), id).toBe(true);
      expect(effectsOfEntry(reg.blockingItems.get(id)), `${id} has no effects beyond the prompt`).toEqual([]);
    }
  });

  it('postures: the 13 base positions of §7 (the presets and points are P16b\'s)', () => {
    expect(docIds('7. Postures', '**Posture modifiers**')).toHaveLength(13);
    expect(ids('blockingPostures').sort()).toEqual(docIds('7. Postures', '**Posture modifiers**').sort());
  });

  it('anchors: the 22 of §8 (on_bunk and beside_bunk are two rows)', () => {
    expect(docIds('8. Anchors')).toHaveLength(22);
    expect(ids('blockingAnchors').sort()).toEqual(docIds('8. Anchors').sort());
    expect(reg.blockingAnchors.has('on_bunk') && reg.blockingAnchors.has('beside_bunk')).toBe(true);
  });

  it('escalation verbs: the 15 of §9 in the engine\'s order, none of the role-reversal ones', () => {
    expect(ids('escalationVerbs').sort()).toEqual(docIds('9. Escalation channels').sort());
    expect(ids('escalationVerbs').sort()).toEqual([...ESCALATION_ORDER].sort());
    for (const id of ['hand_in_hair', 'palm_on_back', 'hand_on_throat', 'pin_wrists']) expect(reg.escalationVerbs.has(id)).toBe(false);
  });
});

describe('the vocabulary\'s fields', () => {
  it('items carry the blocking.md tags as contentTags', () => {
    const tags = (id: string) => (reg.blockingItems.get(id)!.contentTags as string[] | undefined) ?? [];
    expect(tags('blindfold')).toEqual(['restraint']);
    expect(tags('collar')).toEqual([]);
    expect(tags('ring_gag')).toEqual(['restraint', 'humiliation']);
    expect(tags('property_tag')).toEqual(['objectification', 'public_humiliation']);
    expect(tags('remote_toy')).toEqual(['explicit_scenes', 'denial']);
    expect(tags('tail')).toEqual(['pet_play', 'explicit_scenes']);
    expect(tags('food_bowl')).toEqual(['pet_play', 'deprivation']);
    expect(tags('strap')).toEqual(['strap', 'explicit_scenes']);
    expect(tags('plug')).toEqual(['explicit_scenes', 'restraint']);
    for (const id of ids('blockingItems').filter((i) => i.startsWith('fem_'))) expect(tags(id), id).toEqual(['feminization']);
  });

  it('worship targets: tagged worship, the three body ones also explicit_scenes', () => {
    for (const t of reg.worshipTargets.values()) {
      const tags = t.contentTags as string[];
      expect(tags[0], String(t.id)).toBe('worship');
      expect(tags.includes('explicit_scenes'), String(t.id)).toBe(['bottom', 'breasts', 'genitalia'].includes(String(t.id)));
    }
  });

  it('the reference effects of a sample of items', () => {
    expect(find('blockingItems', 'ring_gag', 'input')).toMatchObject({ limit: 'garbled', strength: 3 });
    expect(find('blockingItems', 'ring_gag', 'camera')).toMatchObject({ mode: 'face_close' });
    expect(find('blockingItems', 'ring_gag', 'physics')).toMatchObject({ id: 'jaw' });
    expect(effectTypes('blockingItems', 'hood')).toEqual(expect.arrayContaining(['filter', 'perception', 'sound']));
    expect(find('blockingItems', 'hood', 'filter')).toMatchObject({ kind: 'sensory_dark' });
    expect(find('blockingItems', 'hood', 'perception')).toMatchObject({ others: 'obscured' });
    expect(find('blockingItems', 'hood', 'sound')).toMatchObject({ muffle: true });
    expect(find('blockingItems', 'paw_mitts', 'gestures')).toMatchObject({ variant: 'pet' });
    expect(find('blockingItems', 'paw_mitts', 'input')).toMatchObject({ limit: 'no_hands' });
    expect(find('blockingItems', 'paw_mitts', 'device')).toMatchObject({ lock: 'tabs' });
    expect(find('blockingItems', 'property_tag', 'visibility')).toMatchObject({ exposing: true, hideable: false });
    expect(find('blockingItems', 'property_tag', 'notice')).toMatchObject({ kind: 'knows_dynamic' });
    expect(find('blockingItems', 'tail', 'visibility')).toMatchObject({ exposing: true, hideable: false, unlessPosture: ['lying_back', 'lying_front', 'lying_side'] });
    expect(find('blockingItems', 'bell_collar', 'sound')).toMatchObject({ id: 'bell' });
    expect(find('blockingItems', 'bell_collar', 'strain')).toMatchObject({ condition: 'silence' });
    expect(find('blockingItems', 'leash', 'escalation')).toMatchObject({ verb: 'tug_leash' });
    expect(find('blockingItems', 'leash', 'mobility')).toMatchObject({ level: 'follows' });
    expect(find('blockingItems', 'leash', 'visibility')).toMatchObject({ exposing: true });
    expect(find('blockingItems', 'scent_gag', 'physics')).toMatchObject({ id: 'saturation' });
    expect(find('blockingItems', 'chastity_device', 'rule')).toMatchObject({ template: 'ask_permission' });
    expect(find('blockingItems', 'remote_toy', 'escalation')).toMatchObject({ verb: 'remote_pulse' });
    expect(find('blockingItems', 'spreader_bar', 'mobility')).toMatchObject({ level: 'limited' });
  });

  it('items: slots are worn slots; a hood takes eyes and ears, cuffs hands and neck, jewelry one of three', () => {
    for (const i of reg.blockingItems.values()) for (const s of i.slots as string[]) expect(WORN_SLOTS, String(i.id)).toContain(s);
    expect(reg.blockingItems.get('hood')!.slots).toEqual(['eyes', 'ears']);
    expect(reg.blockingItems.get('hood')!.slotMode).toBe('all');
    expect(reg.blockingItems.get('cuffs_to_collar')!.slots).toEqual(['hands', 'neck']);
    expect(reg.blockingItems.get('fem_jewellery')!).toMatchObject({ slots: ['ears', 'neck', 'hands'], slotMode: 'one' });
    expect(reg.blockingItems.get('strap')!.wornBy).toBe('her');
  });

  it('furniture anchors require their affordance', () => {
    const need = (id: string) => (reg.blockingAnchors.get(id)!.requires as { affordances: string[] } | undefined)?.affordances;
    expect(need('under_desk')).toEqual(['desk']);
    expect(need('at_desk')).toEqual(['desk']);
    expect(need('on_desk')).toEqual(['desk']);
    expect(need('on_bunk')).toEqual(['bunk']);
    expect(need('under_bunk')).toEqual(['bunk']);
    expect(need('inside_cupboard')).toEqual(['cupboard']);
    expect(need('behind_curtain')).toEqual(['curtain']);
    expect(need('at_console')).toEqual(['line']);
    for (const a of reg.blockingAnchors.values()) expect(need(String(a.id)) !== undefined, String(a.id)).toBe(a.kind === 'furniture');
    expect(find('blockingAnchors', 'under_desk', 'visibility')).toMatchObject({ hiddenFromDoor: true });
    expect(find('blockingAnchors', 'under_desk', 'backdrop')).toMatchObject({ id: 'frame_under_desk' });
    expect(find('blockingAnchors', 'at_her_feet', 'escalation')).toMatchObject({ verb: 'nudge_with_foot' });
  });

  it('anchors that follow another person are relative', () => {
    for (const id of ['at_her_feet', 'beside_her', 'behind_her', 'in_front_of_her', 'behind_her_chair', 'on_person']) expect(reg.blockingAnchors.get(id)!.kind, id).toBe('relative');
  });

  it('postures have no scope and no tags (physics, not power)', () => {
    for (const p of reg.blockingPostures.values()) {
      expect(p.scope, String(p.id)).toBeUndefined();
      expect(p.contentTags, String(p.id)).toBeUndefined();
    }
    expect(find('blockingPostures', 'all_fours', 'mobility')).toMatchObject({ level: 'crawl' });
    expect(find('blockingPostures', 'kneeling_upright', 'camera')).toMatchObject({ mode: 'from_below' });
  });

  it('every worship target has stimuli (the R13 ruling)', () => {
    const by = (id: string) => reg.worshipTargets.get(id)!.stimuli as string[];
    for (const id of ['feet', 'toes', 'soles']) expect(by(id), id).toEqual(['scent_feet', 'taste_salt']);
    expect(by('armpits')).toEqual(['scent_armpit']);
    expect(by('boots')).toEqual(['taste_dirt', 'taste_polish', 'scent_worn']);
    expect(by('scent')).toEqual(['scent_body', 'scent_worn']);
    for (const t of reg.worshipTargets.values()) {
      if (['feet', 'toes', 'soles', 'armpits', 'boots', 'scent'].includes(String(t.id))) continue;
      expect(t.stimuli, String(t.id)).toEqual(['scent_body', 'taste_skin']);
    }
  });

  it('the body map: each target has a zone on the side(s) it is on', () => {
    for (const t of reg.worshipTargets.values()) {
      const zone = t.zone as Record<string, unknown>;
      expect(Object.keys(zone).sort(), String(t.id)).toEqual(t.side === 'both' ? ['back', 'front'] : [t.side as string]);
    }
  });

  it('a lying posture list for the tail names real postures', () => {
    const lying = (find('blockingItems', 'tail', 'visibility')!.unlessPosture as string[]);
    for (const p of lying) expect(reg.blockingPostures.has(p), p).toBe(true);
    expect(ids('blockingPostures').filter((p) => p.startsWith('lying_')).sort()).toEqual([...lying].sort());
  });
});
