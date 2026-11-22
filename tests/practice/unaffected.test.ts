import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { practiceDirectives, refreshPracticeDirectives } from '../../src/practice/directives';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { heldGuard } from '../../src/engine/practice/held';
import { practiceIntentInput } from '../../src/engine/practice/intents';
import { practicesOn } from '../../src/engine/practice/gate';
import { PRACTICE_EVENT_TYPES } from '../../src/engine/practice/state';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { getCallType } from '../../src/llm/callTypes';
import type { IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
// the order of the day-end steps follows the order the action modules are evaluated, so `world` loads first, as it did when the golden was made
import { loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';
import { campaign } from '../helpers/loyalty';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';

/**
 * P16, Global Constraints: a campaign in which nobody holds at `play` is the campaign as it was. The week of `helpers/unaffectedWeek.ts` is run with every P16 module loaded; its event
 * log, final rng and a hash of its final state are the golden file `fixtures/unaffected-week.json` (made before P13; read here, never written: a change that moves it draws or writes state
 * in a campaign that never asked for a practice, so STOP and find which hook did, do not regenerate it).
 */
const GOLDEN = new URL('../fixtures/unaffected-week.json', import.meta.url);
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const sha = (s: unknown): string => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const summarize = (r: ReturnType<typeof runWeek>) => ({ log: r.log, rng: r.rng, stateSha: sha(r.state) });
const golden = (): ReturnType<typeof summarize> => JSON.parse(readFileSync(GOLDEN, 'utf8')) as ReturnType<typeof summarize>;
const OWN: readonly string[] = PRACTICE_EVENT_TYPES;
/** A log line is `type: event,event`: the events of a step. */
const eventsOf = (log: string[]): string[] => log.flatMap((l) => (l.split(': ')[1] ?? '').split(',').filter((x) => x !== ''));
const actionsOf = (log: string[]): string[] => [...new Set(log.map((l) => l.split(': ')[0].replace(/ !$/, '')))];

describe('the unaffected week (P16)', () => {
  it('matches the week as it played before P13 (the golden): same events, same rng, same final state, no practices key', () => {
    const now = runWeek(reg);
    const was = golden();
    expect(now.log).toEqual(was.log);
    expect(now.rng).toEqual(was.rng);
    expect(sha(now.state)).toBe(was.stateSha);
    expect(now.state.practices).toBeUndefined();
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

  it('every category on and a holder at equal: no practice event, no practices key, nothing offered to the extractor, the pinned prompt, no practice: directive, the hold guard is null', () => {
    const week = runWeek(reg, { tweak: everythingOn });
    const s = week.state;
    expect(s.dynamic).toBeDefined(); // the tweak's own block
    expect(s.relations[s.squad[0].id].dynamic!.frame).toBe('equal');
    expect(eventsOf(week.log).filter((t) => OWN.includes(t))).toEqual([]);
    expect(s.practices).toBeUndefined();
    expect(practicesOn(s, reg)).toBe(false);
    const ann = s.squad[0].id;
    expect(practiceIntentInput(s, reg, [ann], 'scene')).toEqual({});
    expect(practiceIntentInput(s, reg, [ann], 'dm')).toEqual({});
    const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');
    const ct = getCallType('intent_extract')!;
    const input: IntentExtractInput = { ...INTENT_SNAPSHOT_INPUT, ...practiceIntentInput(s, reg, [ann], 'scene') };
    expect(`${ct.system(input) as string}\n=====\n${ct.prompt(input) as string}\n`).toBe(pinned);
    expect(practiceDirectives(s, reg, s.squad.map((u) => u.id))).toEqual([]);
    const b = new ContextBuilder();
    refreshPracticeDirectives(b, s, reg);
    expect([...((b as unknown as { directives: Map<string, unknown> }).directives).keys()].filter((id) => id.startsWith('practice:'))).toEqual([]);
    // the hold guard answers null for every kind of action the week made, and for the ones a hold would refuse
    for (const type of [...actionsOf(week.log), 'expedition/start', 'night/open', 'scene/start', 'activity/do', 'comms/open']) expect(heldGuard(s, reg, { type, payload: {} }), type).toBeNull();
  });

  it('the same week draws nothing through the practice code (the dynamic of a holder at equal draws its own probes; the practices draw none)', () => {
    const stacks: string[] = [];
    const proto = Rng.prototype as unknown as { next: () => number };
    const original = proto.next;
    const spy = vi.spyOn(proto, 'next').mockImplementation(function (this: Rng) { stacks.push(new Error().stack ?? ''); return original.call(this); });
    try {
      runWeek(reg, { tweak: everythingOn });
    } finally {
      spy.mockRestore();
    }
    expect(stacks.length).toBeGreaterThan(50);
    expect(stacks.filter((st) => /src\/engine\/practice\//.test(st)).slice(0, 1)).toEqual([]);
  });
});
