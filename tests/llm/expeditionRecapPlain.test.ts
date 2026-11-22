import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../../src/llm/calls/all';
import { getCallType } from '../../src/llm/callTypes';
import type { RecapInput } from '../../src/llm/calls/expeditionRecap';

const input = (over: Partial<RecapInput> = {}): RecapInput => ({
  commanderName: 'Vale', missionTitle: 'Recover the cache', regionName: 'District 7 Quarantine', environment: 'Overgrown arcology.', outcome: 'OBJECTIVE SECURED',
  units: [{ name: 'Ann', role: 'Assault' }, { name: 'Bea', role: 'Medic' }],
  lines: ['AFTER-ACTION REPORT', 'Fight at node 1 against Husk: won in 4 round(s).', 'Injured: Bea.', 'Loot banked: 12 credits.'], ...over,
});
const prompt = (i: RecapInput): string => getCallType('expedition_recap')!.prompt(i);
const LINE = 'The commander was not with the squad.';

describe('the recap prompt (P16)', () => {
  it('is byte-identical without the flag (the fixture was made from the builder before the flag existed)', () => {
    const plain = readFileSync('tests/fixtures/expedition_recap/prompt_plain.txt', 'utf8');
    expect(prompt(input())).toBe(plain);
    expect(prompt(input({ withoutCommand: undefined }))).toBe(plain);
    expect(prompt(input({ withoutCommand: false as never }))).toBe(plain);
  });

  it('with the flag it carries one line, "The commander was not with the squad.", among the facts the recap may use', () => {
    const text = prompt(input({ withoutCommand: true }));
    expect(text.split(LINE)).toHaveLength(2);
    const report = text.slice(text.indexOf('<report>'), text.indexOf('</report>'));
    expect(report).toContain(LINE);
    expect(text.replace(`${LINE}\n`, '')).toBe(prompt(input()));
  });
});
