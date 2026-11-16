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

describe('derived directives of chunk (b)', () => {
  it('personal:tokens names what is worn, in every scene', () => {
    const s = scene(lover(), BEA);
    s.personal = { seq: 0, tokens: { owned: [{ id: 't1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 1, worn: true }, { id: 't2', giverId: BEA, kindId: 'ribbon', label: "Bea's ribbon", day: 1, worn: true }], given: [] } };
    const d = personalDirectives(s, reg, [BEA]).find((x) => x.id === 'personal:tokens')!;
    expect(d.text).toBe("The commander wears Ann's patch and Bea's ribbon.");
    expect(personalDirectives(lover(), reg, [BEA]).some((x) => x.id === 'personal:tokens')).toBe(false);
  });

  it('personal:token_removed the day a worn token came off and the next, while the giver is present', () => {
    const s = lover();
    s.personal = { seq: 0, tokens: { owned: [{ id: 't1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 1, worn: false, removedDay: s.day - 1 }], given: [ANN] } };
    expect(ids(s, [ANN])).toContain(`personal:token_removed:${ANN}`);
    expect(text(s, [ANN])).toContain('took off');
    expect(ids(s, [BEA])).not.toContain(`personal:token_removed:${ANN}`);
    s.personal.tokens!.owned[0].removedDay = s.day - 2;
    expect(ids(s, [ANN])).not.toContain(`personal:token_removed:${ANN}`);
    s.personal.tokens!.owned[0].removedDay = s.day;
    s.personal.tokens!.owned[0].worn = true;
    expect(ids(s, [ANN])).not.toContain(`personal:token_removed:${ANN}`);
  });

  it('personal:obedience while she follows the commander today; none while the commander follows her', () => {
    const s = lover();
    s.personal = { seq: 0, obedience: { unitId: ANN, day: s.day, who: 'unit' } };
    expect(text(s, [ANN])).toContain("Ann follows the commander's non-combat orders today.");
    s.personal.obedience!.who = 'commander';
    expect(ids(s, [ANN])).not.toContain(`personal:obedience:${ANN}`);
    s.personal.obedience = { unitId: ANN, day: s.day - 1, who: 'unit' };
    expect(ids(s, [ANN])).not.toContain(`personal:obedience:${ANN}`);
  });

  it('personal:truth tells her to answer the commander\'s question truthfully', () => {
    const s = lover();
    s.personal = { seq: 0, truth: { unitId: ANN, wagerId: 'wg_1', question: 'Who did you serve before?' } };
    const t = text(s, [ANN]);
    expect(t).toContain('Ann');
    expect(t).toContain('Who did you serve before?');
    expect(t).toMatch(/truth/i);
    expect(ids(s, [BEA])).not.toContain(`personal:truth:${ANN}`);
  });

  it('personal:mark while the commander bears her mark', () => {
    const s = scene(lover(), BEA);
    s.personal = { seq: 0, mark: { unitId: ANN, untilDay: s.day + 1 } };
    expect(personalDirectives(s, reg, [BEA]).find((d) => d.id === 'personal:mark')!.text).toContain("Ann's mark");
    s.day += 2;
    expect(personalDirectives(s, reg, [BEA]).some((d) => d.id === 'personal:mark')).toBe(false);
  });

  it('refresh sets and clears them with the others', () => {
    const s = scene(lover(), ANN);
    s.personal = { seq: 0, obedience: { unitId: ANN, day: s.day, who: 'unit' }, mark: { unitId: ANN, untilDay: s.day + 1 } };
    const b = new ContextBuilder();
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('non-combat orders');
    delete s.personal;
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('non-combat orders');
  });
});

describe('ids and words', () => {
  /** Every prefix P9, P9d, P9b, P9e and P11 reserve (tests/power/herCallDirectives.test.ts holds the same list, with personal:). */
  const RESERVED = [
    'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
    'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'power:', 'smother:',
  ];
  function everything(): CampaignState {
    const s = scene(enable(lover(), 'jealousy_games'), ANN, BEA);
    s.personal = {
      seq: 0, claims: [{ unitId: ANN, day: s.day }],
      decor: { [ANN]: { since: 1, parts: ['contact'], contactName: 'x', removed: { sticker: s.day } } },
      bookings: [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: s.day, slot: s.slot, status: 'played', source: 'roll' }],
      tokens: { owned: [{ id: 't1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 1, worn: true }], given: [ANN] },
      obedience: { unitId: ANN, day: s.day, who: 'unit' }, truth: { unitId: ANN, wagerId: 'wg_1', question: 'Who did you serve?' }, mark: { unitId: ANN, untilDay: s.day + 1 },
    };
    return s;
  }

  it('no directive id starts with a reserved prefix; all start with personal:', () => {
    const all = personalDirectives(everything(), reg, [ANN, BEA]);
    expect(all.length).toBeGreaterThanOrEqual(8);
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
