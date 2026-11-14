import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf, recordOf } from '../../../src/engine/discipline';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { noPresence } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  for (const u of s.squad) {
    u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; u.stress = 20;
    s.relations[u.id].stateId = 'comrade';
    s.relations[u.id].trust = 50;
    s.relations[u.id].affinity = 10;
    s.relations[u.id].metDay = -50;
  }
  return s;
}
const inScene = (s: CampaignState, ids = [ANN]): CampaignState =>
  run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } }).state;
const enforced = (measure: unknown, over: Record<string, unknown> = {}) => ({
  type: 'commander_enforced', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.8, measure, ...over,
});
const read = (s: CampaignState, events: unknown[], extra: Record<string, unknown> = {}, r: Registries = reg) =>
  run(s, r, { type: 'intents/apply', payload: { channel: 'scene', intents: { events }, ...extra } });
const readDm = (s: CampaignState, events: unknown[], extra: Record<string, unknown> = {}) =>
  run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events }, ...extra } });

describe('a punishment read from dialogue', () => {
  it('logs an application with the message ref and writes no fact', () => {
    const s = inScene(world());
    const facts = s.memory.facts.length;
    const r = read(s, [enforced('revoke_rations')], { messageRef: 'chat:7' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.discipline!.applications).toEqual([expect.objectContaining({ source: 'dialogue', channel: 'scene', measure: 'revoke_rations', unitId: ANN, messageRef: 'chat:7', sceneId: s.scene!.id })]);
    expect(r.state.memory.facts).toHaveLength(facts);
    expect(ofType(r.events, 'discipline_applied')).toMatchObject([{ measure: 'revoke_rations', source: 'dialogue' }]);
    expect(r.state.resources.supplies).toBe(s.resources.supplies + 1);
    expect(r.state.relations[ANN].trust).toBe(48);
  });

  it('uses the registry row, not the extraction severity, and the shortest brig', () => {
    const s = inScene(world());
    const r = read(s, [enforced('brig', { severity: 'minor' })]);
    expect(r.state.relations[ANN].trust).toBe(44);
    expect(recordOf(r.state, ANN)).toBe(-20);
    expect(r.state.discipline!.restrictions).toEqual([expect.objectContaining({ kind: 'confined', untilDay: 6 })]);
  });

  it('a DM reading logs it on the dm channel with the dm message ref', () => {
    const r = readDm(world(), [enforced('verbal')], { messageRef: 'dm:m5' });
    expect(r.state.discipline!.applications).toEqual([expect.objectContaining({ source: 'dialogue', channel: 'dm', messageRef: 'dm:m5' })]);
    expect(r.state.discipline!.applications[0].sceneId).toBeUndefined();
  });

  it('a garbled measure never applies an unknown punishment', () => {
    const s = inScene(world());
    for (const bad of ['brig; drop table', 'guillotine', 42, undefined, 'leash', 'unspecified']) {
      const r = read(s, [enforced(bad)]);
      expect(r.state.discipline!.applications.map((a) => a.measure), String(bad)).toEqual(['verbal']);
    }
  });

  it('0.59 logs nothing and 0.6 logs it', () => {
    const s = inScene(world());
    const low = read(s, [enforced('brig', { confidence: 0.59 })]);
    expect(low.state.discipline?.applications ?? []).toEqual([]);
    expect(low.state.relations[ANN].trust).toBe(50);
    expect(read(s, [enforced('brig', { confidence: 0.6 })]).state.discipline!.applications).toHaveLength(1);
  });

  it('a refused punishment (the same measure again today) is skipped quietly: nothing else changes either', () => {
    const s = inScene(world());
    const once = read(s, [enforced('verbal')]).state;
    const twice = read(once, [enforced('verbal')]);
    expect(errors(twice.events)).toEqual([]);
    expect(twice.state.discipline!.applications).toHaveLength(1);
    expect(twice.state.relations[ANN].trust).toBe(once.relations[ANN].trust);
    expect(twice.state.squad[0].stress).toBe(once.squad[0].stress);
    expect(recordOf(twice.state, ANN)).toBe(recordOf(once, ANN));
  });

  it('a unit who is not in the scene is ignored', () => {
    const s = inScene(world(), [BEA]);
    expect(read(s, [enforced('verbal')]).state.discipline?.applications ?? []).toEqual([]);
  });

  it('a punishment cancels the held defiance of the same reading', () => {
    const s = inScene(world());
    const r = read(s, [{ type: 'defied', actor: ANN, targets: [], severity: 'moderate', evidence: 'no', confidence: 0.9 }, enforced('verbal')]);
    expect(r.state.discipline!.defiance).toEqual([]);
    expect(r.state.discipline!.applications[0].inverse.defiance).toMatchObject({ unitId: ANN });
  });

  it('with a registry that has no such punishment it reads as the P9 fallback enforcement (−8)', () => {
    const none: Registries = { ...reg, punishments: new Map() };
    const r = read(inScene(world()), [enforced('brig')], {}, none);
    expect(r.state.discipline?.applications ?? []).toEqual([]);
    expect(recordOf(r.state, ANN)).toBe(-8);
  });

  it('a threat is still registered from dialogue', () => {
    const r = read(inScene(world()), [enforced('brig', { type: 'threatened' })]);
    expect(r.state.discipline!.threats).toHaveLength(1);
    expect(disciplineOf(r.state).applications).toEqual([]);
  });
});
