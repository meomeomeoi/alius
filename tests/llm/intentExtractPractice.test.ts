import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PracticeOffer } from '../../src/engine/practice/intents';
import { PRACTICE_INTENT_TYPES } from '../../src/engine/relations/vocab';
import { getCallType } from '../../src/llm/callTypes';
import { readIntentOutput, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';

const ANN = 'unit_ann';
const ct = () => getCallType('intent_extract')!;
const system = (i: IntentExtractInput) => ct().system(i) as string;
const prompt = (i: IntentExtractInput) => ct().prompt(i) as string;
const offer = (over: Partial<PracticeOffer> = {}): PracticeOffer => ({ types: [], tasks: [], accepts: [], talks: [], punishments: [], alarms: [], ceremonies: [], handovers: [], denial: [], service: [], threats: [], ...over });
const withPractice = (p: PracticeOffer, channel: 'scene' | 'dm' = 'scene'): IntentExtractInput => ({ ...INTENT_SNAPSHOT_INPUT, channel, practice: p });
const typeLine = (i: IntentExtractInput): string => system(i).split('\n').find((l) => l.startsWith('EVENT_TYPE:'))!;

const OFFERS: Array<{ type: string; offer: PracticeOffer; word: string }> = [
  { type: 'task_kept', offer: offer({ types: ['task_kept', 'task_broken'], tasks: [{ id: 'pt1', unitId: ANN, summary: 'carry the roster' }] }), word: 'carry the roster' },
  { type: 'task_broken', offer: offer({ types: ['task_kept', 'task_broken'], tasks: [{ id: 'pt1', unitId: ANN, summary: 'x' }] }), word: '"taskId"' },
  { type: 'practice_accepted', offer: offer({ types: ['practice_accepted'], accepts: [{ id: 'pt2', unitId: ANN, summary: 'a night in her quarters' }] }), word: 'a night in her quarters' },
  { type: 'service_rated', offer: offer({ types: ['service_rated'], service: [ANN] }), word: '"verdict"' },
  { type: 'denial_broken', offer: offer({ types: ['denial_broken'], denial: [ANN] }), word: 'DENIAL' },
  { type: 'threat_voiced', offer: offer({ types: ['threat_voiced'], threats: [ANN] }), word: 'THREATS' },
  { type: 'ceremony_step', offer: offer({ types: ['ceremony_step'], ceremonies: [{ id: 'pp1', unitId: ANN, step: 'cs_ask', check: 'words', label: 'ask for it formally' }] }), word: 'ask for it formally' },
];

describe('the intent prompt and the practices', () => {
  const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');

  it('the prompt with the field absent or with nothing offered is byte-identical (the pinned text)', () => {
    for (const input of [INTENT_SNAPSHOT_INPUT, withPractice(offer())]) expect(`${system(input)}\n=====\n${prompt(input)}\n`).toBe(pinned);
    for (const t of PRACTICE_INTENT_TYPES) expect(pinned, t).not.toContain(t);
    expect(pinned).not.toContain('PRACTICE');
  });

  for (const { type, offer: o, word } of OFFERS) {
    it(`${type} is offered only with its subject`, () => {
      expect(system(INTENT_SNAPSHOT_INPUT)).not.toContain(type);
      const both = `${system(withPractice(o))}\n${prompt(withPractice(o))}`;
      expect(typeLine(withPractice(o))).toContain(type);
      expect(both).toContain(word);
      expect(both).toContain(`"${type}"`); // its rule line
    });
  }

  it('only offered types are listed: an open task lists task_kept and not practice_accepted', () => {
    const line = typeLine(withPractice(OFFERS[0].offer));
    expect(line).toContain('task_kept');
    for (const other of PRACTICE_INTENT_TYPES.filter((t) => t !== 'task_kept' && t !== 'task_broken')) expect(line, other).not.toContain(other);
  });

  it('a negotiable task, punishment or alarm offers compromise_reached with its field', () => {
    for (const [o, field] of [[offer({ types: ['compromise_reached'], talks: [{ id: 'pt3', unitId: ANN, summary: 's' }] }), '"taskId"'], [offer({ types: ['compromise_reached'], punishments: [{ id: 'pp3', unitId: ANN, summary: 's' }] }), '"punishmentId"'], [offer({ types: ['compromise_reached'], alarms: [{ id: 'pa3', unitId: ANN, summary: '' }] }), '"alarmId"']] as const) {
      const i = withPractice(o);
      expect(typeLine(i)).toContain('compromise_reached');
      expect(system(i)).toContain(field);
      expect(prompt(i)).toMatch(/\b(pt3|pp3|pa3)\b/);
    }
  });

  it('the PRACTICE block lists the ids a report may use, one per line, with her words, on one line each; no pronoun for the commander', () => {
    const i = withPractice(offer({ types: ['task_kept', 'task_broken', 'practice_accepted'], tasks: [{ id: 'pt1', unitId: ANN, summary: 'carry\nthe roster' }], accepts: [{ id: 'pt2', unitId: ANN, summary: 'a night' }] }));
    const text = prompt(i);
    expect(text).toContain('PRACTICE');
    expect(text).toContain(`- pt1 — ${ANN}: carry the roster`);
    expect(text).toContain(`- pt2 — ${ANN}: a night`);
    expect(`${system(i)}\n${text}`).not.toMatch(/\bhe\b|\bhim\b|\bhis\b/i);
  });

  it('a reading keeps what was offered and drops the rest', () => {
    const o = offer({ types: ['task_kept', 'task_broken', 'threat_voiced'], tasks: [{ id: 'pt1', unitId: ANN, summary: 'x' }], threats: [ANN] });
    const ev = (over: Record<string, unknown>) => ({ type: 'task_kept', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she kept it', confidence: 0.9, taskId: 'pt1', ...over });
    const read = (events: unknown[], p: PracticeOffer) => readIntentOutput({ events }, withPractice(p), { minConfidence: 0.5 }).intents.events;
    expect(read([ev({})], o).map((e) => [e.type, e.taskId])).toEqual([['task_kept', 'pt1']]);
    expect(read([ev({ taskId: 'pt9' })], o)).toEqual([]);
    expect(read([ev({})], offer())).toEqual([]);
    expect(read([ev({ type: 'threat_voiced', taskId: undefined })], o)).toHaveLength(1);
    expect(read([ev({ type: 'service_rated', verdict: 'pleased' })], o)).toEqual([]);
  });
});
