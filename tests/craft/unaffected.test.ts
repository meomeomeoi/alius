import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { CRAFT_EVENT_TYPES } from '../../src/engine/craft/state';
import { careOpen, craftOn } from '../../src/engine/craft/gate';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';

/**
 * P16b, Global Constraints: a campaign in which nobody holds at `play` is the campaign as it was. The week of `helpers/unaffectedWeek.ts` is run with every P16b
 * module loaded; its event log, final rng and a hash of its final state are the golden file `fixtures/unaffected-week.json` (made before P13; read here, never
 * written: a change that moves it draws or writes state in a campaign that never asked for the craft, so STOP and find which hook did, do not regenerate it).
 * The second week (every category on, a holder at `equal`) is pinned by `fixtures/craft-equal-week.json`, made on the commit before the craft existed.
 */
const GOLDEN = new URL('../fixtures/unaffected-week.json', import.meta.url);
const EQUAL = new URL('../fixtures/craft-equal-week.json', import.meta.url);
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const sha = (s: unknown): string => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const summarize = (r: ReturnType<typeof runWeek>) => ({ log: r.log, rng: r.rng, stateSha: sha(r.state) });
const read = (u: URL): ReturnType<typeof summarize> => JSON.parse(readFileSync(u, 'utf8')) as ReturnType<typeof summarize>;
const OWN: readonly string[] = CRAFT_EVENT_TYPES;
const eventsOf = (log: string[]): string[] => log.flatMap((l) => (l.split(': ')[1] ?? '').split(',').filter((x) => x !== ''));

/** No key named `craft` anywhere in the state (the commander's book, a relation's, a unit's). */
const hasCraftKey = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(hasCraftKey);
  if (v !== null && typeof v === 'object') return Object.entries(v).some(([k, x]) => k === 'craft' || hasCraftKey(x));
  return false;
};

describe('the unaffected week (P16b)', () => {
  it('matches the week as it played before P13 (the golden): same events, same rng, same final state, no craft key', () => {
    const now = runWeek(reg);
    const was = read(GOLDEN);
    expect(now.log).toEqual(was.log);
    expect(now.rng).toEqual(was.rng);
    expect(sha(now.state)).toBe(was.stateSha);
    expect(hasCraftKey(now.state)).toBe(false);
    expect(eventsOf(now.log).filter((t) => OWN.includes(t))).toEqual([]);
  });

  /** Every category on, the dynamic on with `holders: 'any'`, and Ann with a practice profile that practises all of it, standing at `equal`: nobody holds. */
  const everythingOn = (s: CampaignState): void => {
    s.content = { enabled: [...reg.contentCategories.keys()] };
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'often', units: {} });
    const ann = s.squad[0];
    ann.bond = {
      leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
      practice: { categories: Object.fromEntries([...reg.contentCategories.keys()].map((c) => [c, { as: 'craves', witness: 'indifferent' }])), style: { primary: 'cold' }, audience: 'show_off', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'high' },
    };
    s.relations[ann.id].dynamic = { ...blankDynamic(s.day), frame: 'equal', hold: 10 };
  };

  it('every category on and a holder at equal: the same log, rng and state as before the craft, no craft event, no craft key, the craft is off', () => {
    const week = runWeek(reg, { tweak: everythingOn });
    const was = read(EQUAL);
    expect(week.log).toEqual(was.log);
    expect(week.rng).toEqual(was.rng);
    expect(sha(week.state)).toBe(was.stateSha);
    expect(eventsOf(week.log).filter((t) => OWN.includes(t))).toEqual([]);
    expect(hasCraftKey(week.state)).toBe(false);
    expect(craftOn(week.state, reg)).toBe(false);
    expect(careOpen(week.state, reg, week.state.squad[0].id)).toBe(true); // care alone is open toward her, and it writes nothing until it is used (Task 14)
  });

  it('the same week draws nothing through the craft code', () => {
    const stacks: string[] = [];
    const proto = Rng.prototype as unknown as { next: () => number };
    const original = proto.next;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = Infinity;
    const spy = vi.spyOn(proto, 'next').mockImplementation(function (this: Rng) { stacks.push(new Error().stack ?? ''); return original.call(this); });
    try {
      runWeek(reg, { tweak: everythingOn });
    } finally {
      spy.mockRestore();
      Error.stackTraceLimit = limit;
    }
    expect(stacks.length).toBeGreaterThan(50);
    expect(stacks.filter((st) => /src\/engine\/craft\//.test(st)).slice(0, 1)).toEqual([]);
  });
});
