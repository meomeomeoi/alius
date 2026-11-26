/** P10e-e Task 22 (R26): the engine checks a mention of the commander against the listener's knowledge (P15) and the relation's publicity (P9d). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { listenerKnows, mentionText } from '../../../src/engine/physics/mention';
import { newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { campaign, loadCore } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const M = { plain: 'just my footrest.', veiled: 'no. the heater ticks.' };

describe('mentionText (R26)', () => {
  function world(level?: 'suspects_close' | 'knows_dynamic', publicity?: 'secret' | 'known' | 'public') {
    const s = campaign(reg, 4);
    const [her, other] = [s.squad[0]!.id, s.squad[1]!.id];
    if (level) {
      s.dynamic = newDynamicCampaign(3, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
      s.dynamic.knowledge = { [other]: { [her]: { suspicion: 70, level } } };
    }
    if (publicity) s.relations[her]!.publicity = { level: publicity, since: 1 };
    return { s, her, other };
  }

  it('a listener who knows hears it plainly', () => {
    const { s, her, other } = world('knows_dynamic');
    expect(listenerKnows(s, her, other)).toBe('knows');
    expect(mentionText(s, reg, her, other, M)).toBe(M.plain);
  });

  it('one who does not (or only suspects) hears the veiled form; with none it is left unsaid', () => {
    const none = world();
    expect(listenerKnows(none.s, none.her, none.other)).toBe('none');
    expect(mentionText(none.s, reg, none.her, none.other, M)).toBe(M.veiled);
    expect(mentionText(none.s, reg, none.her, none.other, { plain: M.plain, veiled: '' })).toBeNull();
    const sus = world('suspects_close');
    expect(listenerKnows(sus.s, sus.her, sus.other)).toBe('suspects');
    expect(mentionText(sus.s, reg, sus.her, sus.other, M)).toBe(M.veiled);
  });

  it('a public relation is plain; a reckless tactic says it plainly anyway', () => {
    const pub = world(undefined, 'public');
    expect(mentionText(pub.s, reg, pub.her, pub.other, M)).toBe(M.plain);
    const known = world(undefined, 'known');
    expect(mentionText(known.s, reg, known.her, known.other, M)).toBe(M.veiled);
    expect(mentionText(known.s, reg, known.her, known.other, M, 'reckless')).toBe(M.plain);
  });
});
