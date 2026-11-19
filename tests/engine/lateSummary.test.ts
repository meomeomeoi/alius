import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/memory';
import '../../src/engine/actions/scene';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, errors, loadCore, ofType, run } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** A scene of Ann and Bea that ended with no summary (the model failed): a fallback line and a mark that waits. */
function endedWithoutSummary(): CampaignState {
  const s = campaign(reg, 4);
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 7 } });
  expect(errors(started.events)).toEqual([]);
  const ended = run(started.state, reg, { type: 'scene/end', payload: { endIndex: 12 } });
  expect(errors(ended.events)).toEqual([]);
  return ended.state;
}
const summary = (facts: unknown[] = []) => ({ chronicle: 'Ann and Bea talked it out.', facts });
const late = (s: CampaignState, payload: unknown = { sceneId: 's1', summary: summary() }) => run(s, reg, { type: 'scene/late_summary', payload });
const fact = (text: string) => ({ about: [ANN], text, importance: 3, tags: [] });

describe('scene/late_summary', () => {
  it('late summary replaces the fallback line and adds facts once', () => {
    const s = endedWithoutSummary();
    const line = s.memory.chronicle.at(-1)!;
    expect(line.text).toContain('talked.');
    const r = late(s, { sceneId: 's1', summary: summary([fact('Ann told Bea about the yard.')]) });
    expect(errors(r.events)).toEqual([]);
    const after = r.state.memory.chronicle.filter((e) => e.sceneId === 's1');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: line.id, text: 'Ann and Bea talked it out.', audience: line.audience, day: line.day, slot: line.slot });
    expect(r.state.memory.facts.filter((f) => f.sceneId === 's1')).toHaveLength(1);
    expect(r.state.memory.facts[0]).toMatchObject({ text: 'Ann told Bea about the yard.', knownBy: [ANN, BEA], day: line.day });
    expect(r.state.memory.scenes![0]).toEqual({ sceneId: 's1', from: 7, to: 12, summarized: true });
    expect(ofType(r.events, 'scene_summarized_late')).toEqual([{ type: 'scene_summarized_late', sceneId: 's1', replaced: true }]);
    // a second one has nothing to do: the scene is summarized
    expect(errors(late(r.state).events)).toHaveLength(1);
  });

  it('late summary on a compacted line adds facts only', () => {
    const s = endedWithoutSummary();
    s.memory.chronicle = []; // the line was compacted away
    const r = late(s, { sceneId: 's1', summary: summary([fact('Ann told Bea about the yard.')]) });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.chronicle).toEqual([]);
    expect(r.state.memory.facts).toHaveLength(1);
    expect(ofType(r.events, 'scene_summarized_late')[0]).toMatchObject({ replaced: false });
  });

  it('respects factsPerScene together with the facts a digest stored', () => {
    const s = endedWithoutSummary();
    for (let i = 0; i < TUNING.memory.factsPerScene - 1; i++) {
      s.memory.facts.push({ id: `f${i}`, about: [ANN], text: `Digest fact ${i}`, tags: [], importance: 3, day: s.day, sceneId: 's1', knownBy: [ANN, BEA] } as never);
    }
    const r = late(s, { sceneId: 's1', summary: summary([fact('One more.'), fact('And another.'), fact('And a third.')]) });
    expect(r.state.memory.facts.filter((f) => f.sceneId === 's1')).toHaveLength(TUNING.memory.factsPerScene);
  });

  it('refuses a scene that is not waiting, and an old mark without participants', () => {
    const s = endedWithoutSummary();
    expect(errors(late(s, { sceneId: 'nope', summary: summary() }).events)).toHaveLength(1);
    expect(errors(late(s, { sceneId: 's1' }).events)).toHaveLength(1);
    delete s.memory.scenes![0].participants; // a mark written before P14
    const r = late(s);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
  });

  it('draws nothing from the rng', () => {
    const s = endedWithoutSummary();
    expect(late(s).state.rng).toEqual(s.rng);
  });
});
