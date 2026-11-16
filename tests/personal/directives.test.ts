import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { clearPersonalDirectives, personalDirectives, refreshPersonalDirectives } from '../../src/personal/directives';
import { powerDirectives } from '../../src/power/directives';
import { ANN, BEA, enable, partner, plain, setRelation } from '../helpers/personal';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** The commander has no pronoun in any text a player or the model reads (lore §0), "they" and "their" included. */
const PRONOUN = /\b(he|him|his|himself|she's)\b(?<=\bthe commander[^.]{0,40}\b\w+)|\bthe commander\b[^.]*\b(he|him|his|himself|they|them|their|theirs)\b/i;

function scene(s: CampaignState, ...ids: string[]): CampaignState {
  s.scene = { id: 'sc', day: s.day, slot: s.slot, participants: ids, mode: ids.length > 1 ? 'group' : 'private', locationId: 'mess_hall', exchanges: 0 } as never;
  return s;
}
const lover = (): CampaignState => partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover', affinity: 80 });
const ids = (s: CampaignState, present: string[]) => personalDirectives(s, reg, present).map((d) => d.id);
const text = (s: CampaignState, present: string[]) => personalDirectives(s, reg, present).map((d) => d.text).join('\n');

describe('derived directives', () => {
  it('a courting unit in the scene gets personal:court', () => {
    const s = lover();
    expect(ids(s, [ANN])).toEqual([`personal:court:${ANN}`]);
    expect(text(s, [ANN])).toContain('Ann takes the initiative with the commander');
    expect(ids(s, [BEA])).toEqual([]); // not present
    expect(ids(partner(plain(reg), ANN, { lead: 'balanced', stateId: 'lover' }), [ANN])).toEqual([]);
    expect(ids(plain(reg), [ANN])).toEqual([]);
  });

  it('personal:claimed while a claim of today or yesterday stands and she is with someone else', () => {
    const s = lover();
    s.personal = { seq: 0, claims: [{ unitId: ANN, day: s.day - 1 }] };
    expect(ids(s, [ANN, BEA])).toContain(`personal:claimed:${ANN}`);
    expect(text(s, [ANN, BEA])).toContain('Ann has made it plain to everyone that the commander is hers.');
    expect(ids(s, [ANN])).not.toContain(`personal:claimed:${ANN}`); // alone with the commander: nobody to tell
    s.personal.claims![0].day = s.day - 2;
    expect(ids(s, [ANN, BEA])).not.toContain(`personal:claimed:${ANN}`);
  });

  it('personal:decor the day a part was peeled and the next', () => {
    const s = lover();
    s.personal = { seq: 0, decor: { [ANN]: { since: 1, parts: ['wallpaper', 'contact'], contactName: 'x', removed: { sticker: s.day } } } };
    expect(ids(s, [ANN])).toContain(`personal:decor:${ANN}`);
    s.day += 1;
    expect(ids(s, [ANN])).toContain(`personal:decor:${ANN}`);
    s.day += 1;
    expect(ids(s, [ANN])).not.toContain(`personal:decor:${ANN}`);
  });

  it('personal:booking while a booking of hers is in play, and after a cancelled one', () => {
    const s = lover();
    s.personal = { seq: 0, bookings: [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: s.day, slot: s.slot, status: 'played', source: 'roll' }] };
    expect(ids(s, [ANN])).toContain(`personal:booking:${ANN}`);
    s.personal.bookings![0].status = 'cancelled';
    expect(text(s, [ANN])).toContain('cancelled');
    s.personal.bookings![0].day = s.day - 3;
    expect(ids(s, [ANN])).not.toContain(`personal:booking:${ANN}`);
  });

  it('directives follow a reload (derived from state) and are cleared on chat switch', () => {
    const s = scene(lover(), ANN);
    const b = new ContextBuilder();
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('takes the initiative');
    const reloaded = JSON.parse(JSON.stringify(s)) as CampaignState;
    const b2 = new ContextBuilder();
    refreshPersonalDirectives(b2, reloaded, reg);
    expect(b2.build(reloaded, 5000).directives).toContain('takes the initiative');
    // refreshing with a state that no longer holds drops them
    setRelation(s, ANN, { stateId: 'stranger' });
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('takes the initiative');
    // the chat switch
    refreshPersonalDirectives(b2, reloaded, reg);
    clearPersonalDirectives(b2);
    expect(b2.build(reloaded, 5000).directives).not.toContain('takes the initiative');
  });

  it('a refresh never touches directives of other layers', () => {
    const s = scene(lover(), ANN);
    const b = new ContextBuilder();
    b.setDirective({ id: 'power:leader', expiresAfter: 'scene', text: 'Leader.' });
    b.setDirective({ id: 'content', expiresAfter: 'manual', text: 'Content.' });
    refreshPersonalDirectives(b, s, reg);
    const out = b.build(s, 5000).directives;
    expect(out).toContain('Leader.');
    expect(out).toContain('Content.');
  });
});

describe('ids and words', () => {
  /** Every prefix P9, P9d, P9b, P9e and P11 reserve (tests/power/herCallDirectives.test.ts holds the same list, with personal:). */
  const RESERVED = [
    'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
    'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'power:', 'smother:',
  ];
  function everything(): CampaignState {
    const s = enable(lover(), 'jealousy_games');
    s.personal = {
      seq: 0, claims: [{ unitId: ANN, day: s.day }],
      decor: { [ANN]: { since: 1, parts: ['contact'], contactName: 'x', removed: { sticker: s.day } } },
      bookings: [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: s.day, slot: s.slot, status: 'played', source: 'roll' }],
    };
    return s;
  }

  it('no directive id starts with a reserved prefix; all start with personal:', () => {
    const all = personalDirectives(everything(), reg, [ANN, BEA]);
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const d of all) {
      expect(d.id.startsWith('personal:'), d.id).toBe(true);
      expect(RESERVED.some((p) => d.id.startsWith(p)), d.id).toBe(false);
    }
    // and none of the others starts with personal:
    expect(powerDirectives(everything(), reg, [ANN]).every((d) => !d.id.startsWith('personal:'))).toBe(true);
  });

  it('no commander pronoun in any directive line', () => {
    const t = personalDirectives(everything(), reg, [ANN, BEA]).map((d) => d.text).join(' ');
    expect(t).not.toMatch(/\b(he|him|his|himself|they|them|their|theirs|themselves)\b/i);
    expect(t).toContain('the commander');
  });
});

void PRONOUN;
