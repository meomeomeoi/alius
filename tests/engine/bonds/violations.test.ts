import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { raiseTone } from '../../../src/engine/bonds';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/loyalty';
import { enable } from '../../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function inScene(participants = [ANN], tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = campaign(reg, 4);
  tweak(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const apply = (s: CampaignState, extra: Record<string, unknown> = {}, intents: unknown = { events: [], facts: [], proposals: [], promises: [], emotions: [], stressHints: [] }) =>
  run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents, readIndex: 4, ...extra } });

describe('violations on a scene reply', () => {
  it('are stored with the reply index', () => {
    const r = apply(inScene(), { violations: { index: 3, categories: ['restraint', 'pain_rough'] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.violations).toEqual([{ index: 3, categories: ['restraint', 'pain_rough'] }]);
  });

  it('a flag on an enabled or unknown category is dropped; nothing left means no entry', () => {
    const s = enable(inScene(), 'restraint');
    const r = apply(s, { violations: { index: 3, categories: ['restraint', 'no_such', 'humiliation', 'humiliation'] } });
    expect(r.state.scene!.violations).toEqual([{ index: 3, categories: ['humiliation'] }]);
    const none = apply(s, { violations: { index: 3, categories: ['restraint', 'no_such'] } });
    expect(none.state.scene!.violations).toBeUndefined();
  });

  it('a second reading of the same reply replaces its mark', () => {
    const first = apply(inScene(), { violations: { index: 3, categories: ['restraint'] } });
    const second = apply(first.state, { violations: { index: 3, categories: ['humiliation'] } });
    expect(second.state.scene!.violations).toEqual([{ index: 3, categories: ['humiliation'] }]);
    const other = apply(second.state, { violations: { index: 5, categories: ['restraint'] } });
    expect(other.state.scene!.violations!.map((v) => v.index)).toEqual([3, 5]);
  });

  it('a malformed payload is ignored without failing the reading', () => {
    for (const bad of [null, 'x', { index: 'a', categories: ['restraint'] }, { index: -1, categories: ['restraint'] }, { index: 2, categories: 'restraint' }, { index: 2 }]) {
      const r = apply(inScene(), { violations: bad });
      expect(errors(r.events), JSON.stringify(bad)).toEqual([]);
      expect(r.state.scene!.violations).toBeUndefined();
    }
  });

  it('a rollback to the state before the reading removes the mark', () => {
    const before = inScene();
    const after = apply(before, { violations: { index: 3, categories: ['restraint'] } }).state;
    expect(after.scene!.violations).toHaveLength(1);
    expect(before.scene!.violations).toBeUndefined(); // dispatch never mutates its input: restoring `before` is the rollback
  });
});

describe('violations on a DM', () => {
  const dmState = (): { s: CampaignState; id: string } => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'Come here.' } });
    return { s: r.state, id: r.state.dms[ANN].at(-1)!.id };
  };
  const applyDm = (s: CampaignState, extra: Record<string, unknown>) =>
    run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [] }, ...extra } });

  it('a violation marks the DM the reading is about', () => {
    const { s, id } = dmState();
    const r = applyDm(s, { messageRef: `dm:${id}`, violations: { categories: ['restraint'] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dms[ANN].find((m) => m.id === id)!.violation).toEqual(['restraint']);
  });

  it('an enabled category, an unknown id, another unit\'s message or a commander message is not marked', () => {
    const { s, id } = dmState();
    expect(applyDm(enable(structuredClone(s), 'restraint'), { messageRef: `dm:${id}`, violations: { categories: ['restraint', 'zzz'] } }).state.dms[ANN].at(-1)!.violation).toBeUndefined();
    expect(applyDm(s, { messageRef: 'dm:nope', violations: { categories: ['restraint'] } }).state.dms[ANN].at(-1)!.violation).toBeUndefined();
    const sent = run(s, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'hi' } }).state;
    const mine = sent.dms[ANN].at(-1)!;
    expect(mine.from).toBe('commander');
    expect(applyDm(sent, { messageRef: `dm:${mine.id}`, violations: { categories: ['restraint'] } }).state.dms[ANN].find((m) => m.id === mine.id)!.violation).toBeUndefined();
  });
});

describe('scene tone', () => {
  const tone = (s: CampaignState, t: string | null) => apply(s, { tone: t }).state;

  it('a reported tone raises the scene tone, never lowers it', () => {
    let s = inScene();
    expect(s.scene!.tone).toBeUndefined();
    s = tone(s, 'romantic');
    expect(s.scene!.tone).toBe('romantic');
    s = tone(s, 'intimate');
    expect(s.scene!.tone).toBe('intimate');
    s = tone(s, 'romantic');
    expect(s.scene!.tone).toBe('intimate');
    s = tone(s, null);
    expect(s.scene!.tone).toBe('intimate');
  });

  it('an unknown tone changes nothing', () => {
    expect(tone(inScene(), 'filthy').scene!.tone).toBeUndefined();
  });

  it('romance off: ignored', () => {
    const s = inScene([ANN], (w) => { w.settings.intimacy = { romance: false, initiative: 'med' }; });
    expect(tone(s, 'intimate').scene!.tone).toBeUndefined();
  });

  it('a group scene (grunts cannot join a scene, so every participant is named): ignored', () => {
    const s = inScene([ANN, BEA]);
    expect(s.scene!.mode).toBe('group');
    expect(tone(s, 'romantic').scene!.tone).toBeUndefined();
  });

  it('raiseTone is pure on a draft and reports what it did', () => {
    const s = inScene();
    expect(raiseTone(s, reg, 'romantic')).toEqual([{ type: 'scene_tone', tone: 'romantic' }]);
    expect(raiseTone(s, reg, 'romantic')).toEqual([]);
    expect(raiseTone(s, reg, 'intimate')).toEqual([{ type: 'scene_tone', tone: 'intimate' }]);
    expect(s.scene!.tone).toBe('intimate');
  });

  it('with no scene open raiseTone does nothing', () => {
    const s = campaign(reg, 4);
    expect(raiseTone(s, reg, 'romantic')).toEqual([]);
  });
});
