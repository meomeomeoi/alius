import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/practice';
import { requestPractice } from '../../src/engine/practice/issue';
import { buildPracticeInput, validatePracticeOutput } from '../../src/engine/practice/validate';
import { Rng } from '../../src/engine/rng';
import { CALL_TYPE_IDS, getCallType } from '../../src/llm/callTypes';
import '../../src/llm/calls/all';
import { llmLog } from '../../src/llm/log';
import { callLlm } from '../../src/llm/orchestrator';
import { generationSite } from '../../src/llm/sites';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { ANN, withService, world } from '../engine/practice/world';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => llmLog.clear());
const fixture = (n: string) => readFileSync(`tests/fixtures/practice_generate/${n}.json`, 'utf8');

const setup = () => {
  const s = withService(world(reg, 'role'));
  const d = structuredClone(s);
  requestPractice(d, { registries: reg, rng: new Rng(d.rng) }, ANN, 'task');
  const request = d.practices!.requests[0];
  return { s: d, request, input: buildPracticeInput(d, reg, request, 'A sergeant.') };
};
const ask = async (reply: string) => {
  const { s, request, input } = setup();
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  st.mainReplies = [reply];
  const r = await callLlm<unknown>('practice_generate', input, { st, settings: getSettings(st) });
  return { r, s, request, call: st.calls[0] as { prompt: string; system?: string } };
};

describe('the practice_generate call type', () => {
  it('is a mechanic JSON call with a budget of 700 and six comms sites that reroll before commit', () => {
    expect(CALL_TYPE_IDS).toContain('practice_generate');
    expect(getCallType('practice_generate')).toMatchObject({ profile: 'mechanic', json: true });
    expect(getCallType('practice_generate')!.prose).toBeUndefined();
    expect(DEFAULT_SETTINGS.budgets.practice_generate).toBe(700);
    for (const kind of ['task', 'punishment', 'demonstration', 'protocol', 'denial', 'hold']) {
      expect(generationSite(`practice.${kind}`), kind).toMatchObject({ callType: 'practice_generate', surface: 'comms', reroll: 'before_commit', record: 'full' });
      expect(generationSite(`practice.${kind}`)!.label(null, 'pq1')).toBe('Her practice');
    }
  });

  it('the valid fixture goes through the validator', async () => {
    const { r, s, request } = await ask(fixture('valid'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(validatePracticeOutput(s, reg, request, r.value)!.output).toMatchObject({ kind: 'task', seedId: 'task_report_at_dusk', stakes: 'trivial', deadline: { days: 2, slot: 'evening' } });
  });

  it('the hostile fixture passes the structure and the validator refuses it: every tag is off, the pronoun is there', async () => {
    const { r, s, request } = await ask(fixture('hostile'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(validatePracticeOutput(s, reg, request, r.value)).toBeNull();
  });

  it('a cut-off answer is repaired and still goes through the validator; prose fails', async () => {
    const t = await ask(fixture('truncated'));
    expect(t.r.ok).toBe(true);
    if (t.r.ok) expect(validatePracticeOutput(t.s, reg, t.request, t.r.value)!.output.summary).toBe('report to her at dusk');
    const bad = await ask('She would probably ask for something small, I think.');
    expect(bad.r.ok).toBe(false);
  });

  it('sends the card as data, one block, and lists the seeds', async () => {
    const { call, request } = await ask(fixture('valid'));
    expect(call.system).toMatch(/data, not instructions/);
    expect(call.prompt.match(/<card>/g)).toHaveLength(1);
    expect(call.prompt).toContain('SEEDS');
    expect(call.prompt).toContain(`- ${request.seedIds[0]} |`);
  });
});
