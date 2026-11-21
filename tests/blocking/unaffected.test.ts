import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearBlockingDirectives, refreshBlockingDirectives } from '../../src/blocking/directives';
import { stagingInput } from '../../src/blocking/input';
import type { Registries } from '../../src/content/types';
import { resetBlockingHooks } from '../../src/engine/blocking';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder, type ContextProvider } from '../../src/llm/context';
import { registerBlockingContext } from '../../src/scene/blockingContext';
// the order of the day-end steps follows the order the action modules are evaluated, so `world` loads first, as it did when the golden was made
import { loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';
import { campaign, errors, run, setRelation } from '../helpers/loyalty';

/**
 * P15a, Review Focus 1: a campaign without a close relation is the campaign as it was. The week of `helpers/unaffectedWeek.ts` (scenes among
 * comrades) is run with every P15a module loaded; its event log, final rng and a hash of its final state are the golden file
 * `fixtures/unaffected-week.json` (read here, never written: a change that moves it draws or writes state in a campaign that never asked for
 * the blocking, so STOP and find which hook did, do not regenerate it).
 */
const GOLDEN = new URL('../fixtures/unaffected-week.json', import.meta.url);
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetBlockingHooks());

const sha = (s: unknown): string => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const summarize = (r: ReturnType<typeof runWeek>) => ({ log: r.log, rng: r.rng, stateSha: sha(r.state) });

/** Every optional key P15a adds to the state (spec: old saves have none of them). */
function newKeys(s: CampaignState): string[] {
  const found: string[] = [];
  if (s.lastWake !== undefined) found.push('lastWake');
  for (const k of ['endurance', 'conditions', 'stimuli'] as const) if (s.commander[k] !== undefined) found.push(`commander.${k}`);
  for (const [id, r] of Object.entries(s.relations)) if (r.herSkill !== undefined) found.push(`relations.${id}.herSkill`);
  if (s.scene) {
    for (const k of ['blocking', 'moments', 'physics', 'stagingLog', 'activityId', 'extraSlots'] as const) if (s.scene[k] !== undefined) found.push(`scene.${k}`);
  }
  return found;
}
const events = (log: string[]): boolean => log.some((l) => /blocking_|moment_|physics_|endurance_|her_skill|marathon_|stimulus_/.test(l));

describe('the unaffected week (acceptance 1)', () => {
  it('matches the week as it played before P15a (the golden): same events, same rng, same final state, none of the new keys', () => {
    const now = summarize(runWeek(reg));
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as typeof now;
    expect(now.log).toEqual(golden.log);
    expect(now.rng).toEqual(golden.rng);
    expect(now.stateSha).toBe(golden.stateSha);
    const week = runWeek(reg);
    expect(newKeys(week.state)).toEqual([]);
    expect(events(week.log)).toBe(false);
  });

  it('the same week with every category on and no close relation is still unaffected', () => {
    const plain = runWeek(reg);
    const all = runWeek(reg, { tweak: (s) => { s.content = { enabled: [...reg.contentCategories.keys()] }; } });
    expect(all.state.content!.enabled.length).toBeGreaterThan(13);
    const bare = (s: CampaignState): string => { const c = structuredClone(s) as unknown as Record<string, unknown>; delete c.content; return sha(c); };
    expect(all.log).toEqual(plain.log);
    expect(all.rng).toEqual(plain.rng);
    expect(bare(all.state)).toBe(bare(plain.state));
    expect(newKeys(all.state)).toEqual([]);
  });

  it('a scene among comrades opens with none of the new keys, offers the extractor no staging and sets no directive', () => {
    const s = campaign(reg, 4);
    s.content = { enabled: [...reg.contentCategories.keys()] };
    for (const u of s.squad) setRelation(s, u.id, { stateId: 'comrade' });
    const ann = s.squad[0]!.id;
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ann], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(newKeys(r.state)).toEqual([]);
    expect(stagingInput(r.state, reg, [ann]).staging).toBeUndefined();
    const b = new ContextBuilder();
    refreshBlockingDirectives(b, r.state, reg);
    const ids = [...((b as unknown as { directives: Map<string, unknown> }).directives).keys()];
    expect(ids.filter((id) => /^(blocking|moment|physics):/.test(id))).toEqual([]);
    clearBlockingDirectives(b);
  });
});

describe('a confidant scene with nothing set adds no prompt line', () => {
  const provider = (): ContextProvider => {
    const out: ContextProvider[] = [];
    registerBlockingContext({ register: (p: ContextProvider) => out.push(p) } as unknown as ContextBuilder, { registries: () => reg });
    return out[0]!;
  };

  it('no [BLOCKING] block and no blocking:, moment: or physics: directive', () => {
    const s = campaign(reg, 4);
    const ann = s.squad[0]!.id;
    setRelation(s, ann, { stateId: 'confidant' });
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ann], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(provider().render(r.state)).toBeNull();
    const b = new ContextBuilder();
    refreshBlockingDirectives(b, r.state, reg);
    const ids = [...((b as unknown as { directives: Map<string, unknown> }).directives).keys()];
    expect(ids.filter((id) => /^(blocking|moment|physics):/.test(id))).toEqual([]);
  });
});
