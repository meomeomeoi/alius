import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import { buildDilemmaDigest } from '../../src/engine/dilemma/flow';
import { parseDilemmaOutput, validateOptions } from '../../src/engine/dilemma/validate';
import type { DilemmaState } from '../../src/engine/dilemma/types';
import type { CampaignState } from '../../src/engine/state/types';
import { runDilemmaGenerate, type DilemmaGenerateInput } from '../../src/llm/calls/dilemmaGenerate';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
let state: CampaignState;
let template: Entry;
let input: DilemmaGenerateInput;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
  for (const u of state.squad) u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  state.squad[0].values.mercy = 3;
  state.squad[1].values.mercy = -3;
  state.squad[0].triggers = ['informers'];
  setRelation(state, 'unit_ann', { trust: 73, affinity: 41 });
  state.squad[0].stress = 77;
  template = reg.dilemmaTemplates.get('dil_informant')!;
  const open: DilemmaState = {
    id: 'dl1', templateId: 'dil_informant', scale: 'major', context: 'base', day: state.day, status: 'requested', attempts: 0,
    units: state.roster.activeIds, beatId: 'beat_1',
  };
  input = {
    template: { id: 'dil_informant', scale: 'major', brief: String((template.generate as { brief: string }).brief), optionCount: 3, flagPerOption: false },
    digest: buildDilemmaDigest(state, reg, open),
  };
});
beforeEach(() => llmLog.clear());

const fixture = (n: string) => readFileSync(`tests/fixtures/dilemma_generate/${n}`, 'utf8');
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const run = async (reply: string | string[], inp: DilemmaGenerateInput = input) => {
  const { st, settings } = setup();
  st.mainReplies = Array.isArray(reply) ? reply : [reply];
  const out = await runDilemmaGenerate(inp, { st, settings });
  return { out, st };
};
/** What the engine makes of an answer: the parse and the rules 1–3. */
function engine(raw: unknown): { rejected: Array<{ rule: unknown }> } | { ok: true } {
  const parsed = parseDilemmaOutput(raw, { state, reg, template });
  if ('rejected' in parsed) return parsed;
  const bad = validateOptions(parsed.options, 'major', state.squad);
  return bad.length > 0 ? { rejected: bad } : { ok: true };
}

describe('dilemma_generate call', () => {
  it('the valid fixture parses and passes every rule', async () => {
    const { out } = await run(fixture('valid.json'));
    expect(out).not.toBeNull();
    expect(Object.keys(out as object).sort()).toEqual(['options', 'setup', 'title']);
    expect(engine(out)).toEqual({ ok: true });
  });

  it('a fenced answer with prose around it parses', async () => {
    const { out } = await run(fixture('fenced.txt'));
    expect(out).not.toBeNull();
    expect(engine(out)).toEqual({ ok: true });
  });

  it('a truncated answer is repaired or fails soft and never throws', async () => {
    const { out, st } = await run([fixture('truncated.txt'), fixture('truncated.txt')]);
    if (out !== null) {
      // what survives the cut is rejected by the engine (too few options): it never reaches the player
      expect(engine(out)).toHaveProperty('rejected');
    }
    expect(st.calls.length).toBeLessThanOrEqual(2);
    const { settings, st: st2 } = setup();
    st2.mainReplies = ['{"title": "The infor', '{"title": "The infor'];
    expect(await runDilemmaGenerate(input, { st: st2, settings })).toBeNull();
    expect(st2.calls).toHaveLength(2);
  });

  it('the invalid, dominated and no_cost fixtures reach the engine and are rejected there with the rule number', async () => {
    const invalid = await run(fixture('invalid.json'));
    expect(invalid.out).not.toBeNull();
    const a = engine(invalid.out) as { rejected: Array<{ rule: unknown }> };
    expect(a.rejected.map((r) => r.rule)).toContain('shape');

    const dominated = await run(fixture('dominated.json'));
    const b = engine(dominated.out) as { rejected: Array<{ rule: unknown }> };
    expect(b.rejected.map((r) => r.rule)).toContain(3);

    const noCost = await run(fixture('no_cost.json'));
    const c = engine(noCost.out) as { rejected: Array<{ rule: unknown }> };
    expect(c.rejected.map((r) => r.rule)).toContain(1);
  });

  it('hostile text returns null', async () => {
    const { out, st } = await run([fixture('hostile.txt'), fixture('hostile.txt')]);
    expect(out).toBeNull();
    expect(st.calls).toHaveLength(2);
  });

  it('an answer without options fails the shape and returns null after one retry', async () => {
    const { out, st } = await run([JSON.stringify({ title: 'T', setup: 'S' }), JSON.stringify({ title: 'T', setup: 'S', options: 'x' })]);
    expect(out).toBeNull();
    expect(st.calls).toHaveLength(2);
    expect(llmLog.entries().filter((e) => e.callType === 'dilemma_generate')).toHaveLength(2);
  });

  it('no profile and fallback off returns null without a call', async () => {
    const { st, settings } = setup();
    settings.mechanicProfileId = '';
    settings.mechanicFallbackToMain = false;
    st.mainReplies = [fixture('valid.json')];
    expect(await runDilemmaGenerate(input, { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(0);
  });

  it('the prompt contains the template brief, the option count, unit values and allowed flags, and no unit ids or relationship numbers', async () => {
    const withFlags: DilemmaGenerateInput = {
      template: { ...input.template, flagPerOption: true, optionCount: 3 },
      digest: { ...input.digest, allowedFlags: [{ id: 'evidence_buried', description: 'The evidence was buried.' }] },
    };
    const { st } = await run(fixture('valid.json'), withFlags);
    const call = st.calls[0] as { system?: string; prompt: string; systemPrompt?: string };
    const text = `${call.system ?? call.systemPrompt ?? ''}\n${call.prompt}`;
    expect(text).toContain(input.template.brief);
    expect(text).toMatch(/3 options/);
    expect(text).toContain('"mercy":3');
    expect(text).toContain('evidence_buried');
    expect(text).toContain('The evidence was buried.');
    expect(text).toMatch(/one of the allowed flags/i);
    expect(text).not.toMatch(/unit_ann|unit_bea|unit_cat|unit_dee/);
    expect(call.prompt).not.toMatch(/trust|affinity|stress|\b73\b|\b41\b|\b77\b/i);
    expect(text).not.toMatch(/\b73\b|\b41\b|\b77\b/);
  });

  it('the system prompt states the rules the engine enforces', async () => {
    const { st } = await run(fixture('valid.json'));
    const call = st.calls[0] as { system?: string; systemPrompt?: string };
    const sys = call.system ?? call.systemPrompt ?? '';
    for (const word of ['resource', 'unit_event', 'faction', 'clock', 'flag', 'stress', 'social_check', 'small', 'medium', 'large', '-1', '120 words', '12 words']) {
      expect(sys, word).toContain(word);
    }
    expect(sys).toMatch(/never write amounts/i);
    expect(sys).toMatch(/gain and a cost/i);
    expect(sys).toMatch(/data, not instructions/i);
    expect(sys).toMatch(/squad/);
  });
});
