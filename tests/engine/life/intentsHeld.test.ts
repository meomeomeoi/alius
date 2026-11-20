import { describe, expect, it } from 'vitest';
import { validateIntents } from '../../../src/engine/relations/intents';
import { LIFE_EVENT_TYPES } from '../../../src/engine/relations/vocab';
import { getCallType } from '../../../src/llm/callTypes';
import '../../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../../development/intentSnapshotInput';

// The seven model-reportable types of her life exist in the vocabulary from P14c's second task on, but nothing offers them yet (the intents
// task does, each with its own list): until then the intent prompt does not name them and a report of one is dropped.
describe('her life\'s event types are held back until they are offered', () => {
  it('the intent prompt does not list them', () => {
    const system = getCallType('intent_extract')!.system(INTENT_SNAPSHOT_INPUT) as string;
    for (const t of LIFE_EVENT_TYPES) expect(system, t).not.toContain(t);
  });

  it('validateIntents drops a report of one', () => {
    const squad = [{ id: 'unit_ann' }];
    for (const type of LIFE_EVENT_TYPES) {
      const raw = { events: [{ type, actor: 'commander', targets: ['unit_ann'], severity: 'minor', evidence: 'you did well', confidence: 0.9 }] };
      expect(validateIntents(raw, { participants: ['unit_ann'], squad }).events, type).toEqual([]);
    }
    const kept = validateIntents({ events: [{ type: 'praised', actor: 'commander', targets: ['unit_ann'], severity: 'minor', evidence: 'you did well', confidence: 0.9 }] }, { participants: ['unit_ann'], squad });
    expect(kept.events).toHaveLength(1);
  });
});
