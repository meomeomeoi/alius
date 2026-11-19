import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import { validateIntents } from '../../../src/engine/relations/intents';
import { addFact } from '../../../src/engine/memory/facts';
import { factTextMax, MEMORY_PRESETS, MEMORY_RANGES, memoryConfig } from '../../../src/engine/memory/config';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const fresh = (): CampaignState => campaign(reg, 2);
const configure = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'memory/configure', payload });
const long = 'x'.repeat(500);
const fact = (s: CampaignState, text: string) => addFact(s, { about: ['unit_ann'], text, tags: [], importance: 3, day: 1, knownBy: ['*'] });

describe('the fact text size is a setting of the campaign memory', () => {
  it('is 200 by default, in every preset and in an old save', () => {
    expect(factTextMax(fresh())).toBe(200);
    for (const p of Object.values(MEMORY_PRESETS)) expect(p.factTextMax).toBe(200);
    expect(MEMORY_RANGES.factTextMax).toEqual([100, 400]);
  });

  it('is the player\'s own choice: kept across presets, accepted with a named preset', () => {
    let s = configure(fresh(), { preset: 'normal', factTextMax: 320 }).state;
    expect(memoryConfig(s).factTextMax).toBe(320);
    s = configure(s, { preset: 'long' }).state;
    expect(memoryConfig(s)).toMatchObject({ preset: 'long', factTextMax: 320, factsMax: 320 });
    s = configure(s, { preset: 'custom', factsMax: 100 }).state;
    expect(memoryConfig(s).factTextMax).toBe(320);
  });

  it('is clamped to 100…400', () => {
    expect(factTextMax(configure(fresh(), { preset: 'normal', factTextMax: 5 }).state)).toBe(100);
    expect(factTextMax(configure(fresh(), { preset: 'normal', factTextMax: 1e9 }).state)).toBe(400);
    expect(errors(configure(fresh(), { preset: 'normal', factTextMax: 'wide' }).events)).toHaveLength(1);
  });

  it('addFact and memory/edit cut to it', () => {
    const s = fresh();
    expect(fact(s, long).text).toHaveLength(200);
    const wide = configure(fresh(), { preset: 'normal', factTextMax: 350 }).state;
    const f = fact(wide, long);
    expect(f.text).toHaveLength(350);
    const edited = run(wide, reg, { type: 'memory/edit', payload: { factId: f.id, text: 'y'.repeat(500) } });
    expect(edited.state.memory.facts.find((x) => x.id === f.id)!.text).toHaveLength(350);
    const narrow = configure(fresh(), { preset: 'normal', factTextMax: 120 }).state;
    expect(fact(narrow, long).text).toHaveLength(120);
  });

  it('the intent validator keeps what the setting allows', () => {
    const raw = { facts: [{ about: ['unit_ann'], text: long, importance: 3, tags: [] }], promises: [{ kind: 'made', by: 'commander', to: 'unit_ann', text: long }] };
    const base = { participants: ['unit_ann'], squad: [{ id: 'unit_ann' }] };
    expect(validateIntents(raw, base).facts[0].text).toHaveLength(200);
    const wide = validateIntents(raw, { ...base, factTextMax: 350 });
    expect(wide.facts[0].text).toHaveLength(350);
    expect(wide.promises[0].text).toHaveLength(350);
  });
});
