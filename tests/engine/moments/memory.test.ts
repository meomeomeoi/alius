import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { writeLifeFact } from '../../../src/engine/life/facts';
import { fireMoment } from '../../../src/engine/moments/fire';
import { RESOLVER_SHAPES } from '../../../src/engine/memory/resolvers';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/moments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetBlockingHooks());

const ANN = 'unit_ann';
const DEE = 'unit_dee';

function open(sourceId: string, loc = 'quarters_commander', prep?: (s: CampaignState) => void): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: loc, participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  r.state.scene!.exchanges = 2;
  prep?.(r.state);
  fireMoment(r.state, { registries: reg }, sourceId, ANN);
  return r.state;
}
/** The facts a chip's answer writes. */
const remembered = (s: CampaignState, key: string) => {
  const r = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key, at: 4 } });
  expect(errors(r.events)).toEqual([]);
  return r.state.memory.facts.filter((f) => f.tags.includes('moment'));
};

describe('remembered moments (R15)', () => {
  it('the resolver is registered with its shape', () => {
    expect(RESOLVER_SHAPES.moment_answered).toEqual({ ids: ['her', 'present', 'visitor'], vars: ['name', 'source', 'key', 'type', 'visitor', 'exposed'] });
    expect([...reg.memoryRules.values()].filter((r) => r.event === 'moment_answered').map((r) => r.id).sort())
      .toEqual(['moment_exposed', 'moment_memory', 'moment_question_lie', 'moment_slip_confessed', 'moment_slip_hidden', 'moment_weakness']);
  });

  it('her_weakness: whatever the answer, those present know it, at importance 3', () => {
    for (const key of ['0', '1', '2']) {
      const facts = remembered(open('her_weakness'), key);
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [ANN], importance: 3, tags: ['moment', 'weakness'] });
      expect(facts[0]!.hiddenFromCommander).toBeUndefined();
      expect(facts[0]!.spread).toBeUndefined();
      expect(facts[0]!.text).not.toMatch(/\b(he|him|his)\b/i);
    }
  });

  it('her_question: only the answer that was a lie (what she wants to hear) is a fact', () => {
    expect(remembered(open('her_question'), '1')).toMatchObject([{ importance: 2, tags: ['moment', 'question'] }]);
    expect(remembered(open('her_question'), '0')).toEqual([]);
    expect(remembered(open('her_question'), '2')).toEqual([]);
  });

  it('own_slip: confessed and hidden are two facts; pretending is none', () => {
    const slip = (key: string) => remembered(open('own_slip'), key);
    expect(slip('0')).toMatchObject([{ importance: 3, text: expect.stringContaining('owned up') }]);
    expect(slip('1')).toMatchObject([{ importance: 3, text: expect.stringContaining('hid a slip') }]);
    expect(slip('2')).toEqual([]);
  });

  it('third_party: exposed unless the commander hid; the visitor knows it too', () => {
    const medbay = (s: CampaignState): void => { s.scene!.tone = 'intimate'; };
    const exposed = remembered(open('third_party', 'medbay', medbay), '1');
    expect(exposed).toHaveLength(1);
    expect(exposed[0]!.knownBy.sort()).toEqual([ANN, DEE].sort());
    expect(exposed[0]!.text).toBe('Dee saw the commander with Ann.');
    expect(exposed[0]).toMatchObject({ about: [ANN], importance: 3, tags: ['moment', 'seen'] });
    expect(remembered(open('third_party', 'medbay', medbay), '2')).toHaveLength(1); // showing yourself
    expect(remembered(open('third_party', 'medbay', medbay), '0')).toEqual([]); // hid
    expect(remembered(open('third_party', 'medbay', medbay), 'look')).toHaveLength(1);
    expect(remembered(open('third_party', 'quarters_commander', undefined), 'lock')).toEqual([]); // a locked door is not being seen
    // nobody came in: still a fact, with someone
    const nobody = remembered(open('third_party'), '1');
    expect(nobody[0]!.text).toContain('someone saw the commander');
    expect(nobody[0]!.knownBy).toEqual([ANN]);
  });

  it('memory_surfaces: a fact whatever she brought up, and the fact she kept is told', () => {
    const keeps = [...reg.lifeEvents.values()].find((e) => e.share === 'keeps')!;
    const s = open('memory_surfaces', 'quarters_commander', (st) => { writeLifeFact(st, ANN, 'the old thing', [String(keeps.id)], 2); });
    const facts = remembered(s, '0');
    expect(facts).toMatchObject([{ importance: 2, tags: ['moment', 'memory'] }]);
    expect(run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0', at: 4 } }).state.memory.facts.find((f) => f.text === 'the old thing')!.tags).not.toContain('untold');
  });

  it('her_offer and the other sources write nothing', () => {
    for (const source of ['her_offer', 'her_silence', 'time', 'alarm']) expect(remembered(open(source), '0'), source).toEqual([]);
  });

  it('no random draw: the answer that is remembered moves the rng exactly as the one that is not (a matched one draws nothing)', () => {
    const a = run(open('her_weakness'), reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0', at: 4 } }); // yielded vs returned: partial
    const base = open('her_weakness');
    expect(a.state.rng).toEqual(base.rng);
  });
});
