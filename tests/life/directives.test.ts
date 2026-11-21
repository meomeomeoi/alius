import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/life';
import '../../src/engine/actions/scene';
import { closeNews, endSceneNews, enqueue, writeLifeFact } from '../../src/engine/life';
import { newLife } from '../../src/engine/life/state';
import type { CampaignState } from '../../src/engine/state/types';
import { clearLifeDirectives, lifeDirectives, LIFE_DERIVED, refreshLifeDirectives } from '../../src/life/directives';
import type { Directive } from '../../src/llm/context';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** Ann has two things to tell (the older first), Bea one, and a scene with Ann and Bea is open. */
function world(mode: 'normal' | 'off' = 'normal'): { s: CampaignState; ids: string[] } {
  const s = campaign(reg, 4);
  s.day = 20;
  s.settings.lifeEvents = mode;
  s.life = newLife(7);
  const ids: string[] = [];
  const add = (unitId: string, name: string, day: number, text: string) => {
    const fact = writeLifeFact(s, unitId, `${name}: ${text}`, ['life'], 1);
    enqueue(s, { unitId, kind: 'event', ref: 'found_something', what: 'event', factId: fact.id, category: 'things', day });
    const id = s.life!.queue.at(-1)!.id;
    s.life!.news.push({ itemId: id, unitId, until: 23 });
    ids.push(id);
  };
  add(ANN, 'Ann', 19, 'She found a coin in the vents.');
  add(ANN, 'Ann', 17, 'She mended a boot with wire.');
  add(BEA, 'Bea', 18, 'She won a hand of cards.');
  s.scene = { id: 's1', participants: [ANN, BEA], exchanges: 0 } as never;
  return { s, ids };
}
const idsOf = (s: CampaignState, present: string[]): string[] => lifeDirectives(s, reg, present).map((d) => d.id);

describe('the news directive', () => {
  it('one per present woman, the oldest item, scene-long', () => {
    const { s } = world();
    const all = lifeDirectives(s, reg, [ANN, BEA]);
    expect(all.map((d) => d.id)).toEqual([`life:news:${ANN}`, `life:news:${BEA}`]);
    expect(all.every((d) => d.expiresAfter === 'scene')).toBe(true);
    expect(all[0].text).toContain('She mended a boot with wire.'); // the oldest of Ann's two
    expect(all[0].text).not.toContain('coin');
    expect(all[0].text).toContain('Ann');
    expect(all[0].text).toMatch(/If it fits/);
    expect(all[0].text).toMatch(/once/i);
    expect(all[0].text).not.toContain('Ann: Ann'); // her name is not said twice
    expect(all[0].text).not.toMatch(/recently/);
  });

  it('only for the women who are present', () => {
    const { s } = world();
    expect(idsOf(s, [BEA])).toEqual([`life:news:${BEA}`]);
    expect(idsOf(s, [])).toEqual([]);
    expect(idsOf(s, ['unit_cat'])).toEqual([]);
  });

  it('a passing mention reads "recently"', () => {
    const { s, ids } = world();
    s.life!.news.find((n) => n.itemId === ids[2])!.passing = true;
    const d = lifeDirectives(s, reg, [BEA])[0];
    expect(d.text).toContain('recently');
    expect(d.text).toContain('in passing');
    expect(d.text).toContain('She won a hand of cards.');
  });

  it('no life directive with life off', () => {
    const { s } = world('off');
    expect(lifeDirectives(s, reg, [ANN, BEA])).toEqual([]);
    const none = campaign(reg, 4);
    none.scene = { id: 's1', participants: [ANN], exchanges: 0 } as never;
    expect(lifeDirectives(none, reg, [ANN])).toEqual([]);
  });

  it('a news entry whose fact is gone says nothing', () => {
    const { s } = world();
    s.memory.facts = [];
    expect(idsOf(s, [ANN, BEA])).toEqual([]);
  });

  it('the text is one clean line with no pronoun for the commander', () => {
    const { s } = world();
    for (const d of lifeDirectives(s, reg, [ANN, BEA])) {
      expect(d.text).not.toMatch(/[\u0000-\u001f\u007f]/);
      expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });
});

describe('refresh, clear and being told', () => {
  /** The two methods of the context builder the directives use, over a map we can read. */
  const builder = () => {
    const map = new Map<string, Directive>();
    return {
      map,
      setDirective: (d: Directive) => { map.set(d.id, d); },
      clearMatching: (f: (d: Directive) => boolean) => { for (const d of [...map.values()]) if (f(d)) map.delete(d.id); },
    };
  };
  type B = ReturnType<typeof builder>;
  const ids = (b: B): string[] => [...b.map.keys()];

  it('refresh sets what holds and drops the rest, and clear takes them all', () => {
    const { s } = world();
    const b = builder();
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b).sort()).toEqual([`life:news:${ANN}`, `life:news:${BEA}`]);
    b.setDirective({ id: 'other:keep', text: 'x', expiresAfter: 'scene' });
    s.scene = { id: 's1', participants: [BEA], exchanges: 0 } as never;
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b).sort()).toEqual([`life:news:${BEA}`, 'other:keep']);
    clearLifeDirectives(b as never);
    expect(ids(b)).toEqual(['other:keep']);
    s.scene = undefined;
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b)).toEqual(['other:keep']);
  });

  it('is gone after the news is told: closeNews, then the next refresh (Review Focus 3)', () => {
    const { s, ids: items } = world();
    const b = builder();
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b)).toContain(`life:news:${BEA}`);
    const fact = s.memory.facts.find((f) => f.id === s.life!.queue.find((q) => q.id === items[2])!.factId)!;
    expect(fact.hiddenFromCommander).toBe(true);
    closeNews(s, items[2]);
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b)).toEqual([`life:news:${ANN}`]);
    expect(fact.hiddenFromCommander).toBeUndefined();
    // her second item comes next, once the first is told
    closeNews(s, items[1]);
    refreshLifeDirectives(b as never, s, reg);
    expect(b.map.get(`life:news:${ANN}`)!.text).toContain('coin');
  });

  it('is gone after the scene with her ends', () => {
    const { s } = world();
    const b = builder();
    refreshLifeDirectives(b as never, s, reg);
    endSceneNews(s, [ANN]);
    refreshLifeDirectives(b as never, s, reg);
    expect(ids(b)).toEqual([`life:news:${BEA}`]);
  });
});

describe('ids', () => {
  /** Every prefix the older packages reserve (the P9c, P9b and P13 tests keep the same list). */
  const OLDER = [
    'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
    'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'personal:', 'special:', 'power:', 'warden:', 'development:', 'head_start:',
    'smother:',
  ];

  it('life: collides with no reserved prefix, and every directive starts with it', () => {
    expect(LIFE_DERIVED).toEqual(['life:']);
    for (const p of OLDER) {
      expect('life:'.startsWith(p), p).toBe(false);
      expect(p.startsWith('life:'), p).toBe(false);
    }
    const { s } = world();
    for (const d of lifeDirectives(s, reg, [ANN, BEA])) {
      expect(d.id.startsWith('life:')).toBe(true);
      expect(OLDER.some((p) => d.id.startsWith(p)), d.id).toBe(false);
    }
  });
});
