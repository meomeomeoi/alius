import { beforeAll, describe, expect, it } from 'vitest';
import type { PracticeSeedEntry } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import { requestPractice } from '../../../src/engine/practice/issue';
import type { PracticeRequest } from '../../../src/engine/practice/state';
import { buildPracticeInput, validatePracticeOutput } from '../../../src/engine/practice/validate';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { getCallType } from '../../../src/llm/callTypes';
import '../../../src/llm/calls/all';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withService, withWant, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const requestFor = (s: CampaignState, kind: PracticeRequest['kind'] = 'task'): PracticeRequest => {
  const d = structuredClone(s);
  requestPractice(d, { registries: reg, rng: new Rng(d.rng) }, ANN, kind);
  return d.practices!.requests[0];
};
const valid = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'task', seedId: 'task_report_at_dusk', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'dm_report', proof: 'dm_report',
  deadline: { days: 2, slot: 'evening' }, text: 'Report to me at dusk.', summary: 'report at dusk', ...over,
});
const roleWorld = (): CampaignState => withService(world(reg, 'role'));

describe('validatePracticeOutput: the table', () => {
  it('a valid card is kept as it is', () => {
    const s = roleWorld();
    const r = validatePracticeOutput(s, reg, requestFor(s), valid())!;
    expect(r.issues).toEqual([]);
    expect(r.output).toEqual({ kind: 'task', seedId: 'task_report_at_dusk', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'dm_report', deadline: { days: 2, slot: 'evening' }, proof: 'dm_report', text: 'Report to me at dusk.', summary: 'report at dusk' });
  });

  it('a wrong kind is null, and so are a card that is not an object', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ kind: 'protocol' }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ kind: undefined }))).toBeNull();
    for (const bad of [null, 'text', [], 4]) expect(validatePracticeOutput(s, reg, req, bad)).toBeNull();
  });

  it('an unknown seedId is dropped and the output kept', () => {
    const s = roleWorld();
    const r = validatePracticeOutput(s, reg, requestFor(s), valid({ seedId: 'made_up' }))!;
    expect(r.output.seedId).toBeUndefined();
    expect(r.issues.join(' ')).toMatch(/seedId/);
  });

  it('a disabled tag is dropped with an issue; every tag disabled is null', () => {
    const s = roleWorld();
    const req = requestFor(s);
    const r = validatePracticeOutput(s, reg, req, valid({ tags: ['service', 'humiliation'] }))!;
    expect(r.output.tags).toEqual(['service']);
    expect(r.issues.join(' ')).toMatch(/humiliation/);
    expect(validatePracticeOutput(s, reg, req, valid({ tags: ['humiliation'] }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ tags: [] }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ tags: ['magic'] }))).toBeNull();
    const limited = roleWorld();
    unitOf(limited, ANN).bond!.ownLimits.categories = ['denial'];
    expect(validatePracticeOutput(limited, reg, req, valid({ tags: ['service', 'denial'] }))!.output.tags).toEqual(['service']);
  });

  it('tier 5 at track level 0 becomes 1; at level 2 it becomes 3', () => {
    const s = roleWorld();
    expect(validatePracticeOutput(s, reg, requestFor(s), valid({ tier: 5 }))!.output.tier).toBe(1);
    s.relations[ANN].dynamic!.tracks.service = { xp: 30, level: 2 };
    expect(validatePracticeOutput(s, reg, requestFor(s), valid({ tier: 5 }))!.output.tier).toBe(3);
    expect(validatePracticeOutput(s, reg, requestFor(s), valid({ tier: 0 }))!.output.tier).toBe(1);
  });

  it('a track that is not open falls to the seed track, else null', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ track: 'pain_rough' }))!.output.track).toBe('service');
    expect(validatePracticeOutput(s, reg, req, valid({ track: 'pain_rough', seedId: undefined }))).toBeNull();
  });

  it('stakes severe at play become minor, at role major, at rule severe', () => {
    const play = withService(world(reg, 'play'));
    expect(validatePracticeOutput(play, reg, requestFor(play), valid({ stakes: 'severe' }))!.output.stakes).toBe('minor');
    const role = roleWorld();
    expect(validatePracticeOutput(role, reg, requestFor(role), valid({ stakes: 'severe' }))!.output.stakes).toBe('major');
    const rule = withService(world(reg, 'rule'));
    expect(validatePracticeOutput(rule, reg, requestFor(rule), valid({ stakes: 'severe' }))!.output.stakes).toBe('severe');
  });

  it('a check that is not a kind becomes model; so does one whose argument does not stand', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'magic' }))!.output.check).toBe('model');
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'no_scene_with', checkArg: BEA }))!.output).toMatchObject({ check: 'no_scene_with', checkArg: BEA });
    const dead = roleWorld();
    unitOf(dead, BEA).status = 'dead';
    const r = validatePracticeOutput(dead, reg, requestFor(dead), valid({ check: 'no_scene_with', checkArg: BEA }))!;
    expect(r.output.check).toBe('model');
    expect(r.output.checkArg).toBeUndefined();
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'no_scene_with', checkArg: ANN }))!.output.check).toBe('model'); // not herself
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'rule_kept_until', checkArg: 'r1' }))!.output.check).toBe('model');
    s.bonds = { ...(s.bonds ?? { rules: [] }), rules: [{ id: 'r1', unitId: ANN, templateId: 'x', text: 'Stand.', status: 'active', day: 1, brokenCount: 0 }] } as CampaignState['bonds'];
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'rule_kept_until', checkArg: 'r1' }))!.output).toMatchObject({ check: 'rule_kept_until', checkArg: 'r1' });
    expect(validatePracticeOutput(s, reg, req, valid({ check: 'dm_report', checkArg: BEA }))!.output.checkArg).toBeUndefined();
  });

  it('a proof that is not one falls to the seed proof', () => {
    const s = roleWorld();
    expect(validatePracticeOutput(s, reg, requestFor(s), valid({ proof: 'trust me' }))!.output.proof).toBe('dm_report');
  });

  it('deadline days are clamped to 1 to 7 and a slot that is not one is dropped', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ deadline: { days: 30 } }))!.output.deadline).toEqual({ days: 7 });
    expect(validatePracticeOutput(s, reg, req, valid({ deadline: { days: 0, slot: 'dawn' } }))!.output.deadline).toEqual({ days: 1 });
    expect(validatePracticeOutput(s, reg, req, valid({ deadline: 'soon' }))!.output.deadline).toBeUndefined();
  });

  it('audienceIds with an absent id are filtered; a demonstration left with none is null', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ audienceIds: [BEA, 'unit_nobody', ANN] }))!.output.audienceIds).toEqual([BEA]);
    expect(validatePracticeOutput(s, reg, req, valid({ audienceIds: ['unit_nobody'] }))!.output.audienceIds).toBeUndefined();
    const demo = { ...req, kind: 'demonstration' as const };
    const raw = valid({ kind: 'demonstration', seedId: 'demo_her_verdict', audienceIds: ['unit_nobody'] });
    expect(validatePracticeOutput(s, reg, demo, raw)).toBeNull();
    expect(validatePracticeOutput(s, reg, demo, { ...raw, audienceIds: [CAT] })!.output.audienceIds).toEqual([CAT]);
  });

  it('text of 3000 characters is cut to 400 and markup is stripped', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ text: 'word '.repeat(600) }))!.output.text.length).toBeLessThanOrEqual(400);
    const r = validatePracticeOutput(s, reg, req, valid({ text: '"**Her words:** <b>Come</b>\n\nat _dusk_."', summary: '<i>at dusk</i>' }))!;
    expect(r.output.text).toBe('Come at dusk.');
    expect(r.output.summary).toBe('at dusk');
    expect(validatePracticeOutput(s, reg, req, valid({ summary: 'x'.repeat(300) }))!.output.summary.length).toBeLessThanOrEqual(80);
  });

  it('a commander pronoun in the text or the summary is null; empty text is null', () => {
    const s = roleWorld();
    const req = requestFor(s);
    expect(validatePracticeOutput(s, reg, req, valid({ summary: 'make him wait' }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ text: 'I told him to come.' }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ text: '   ' }))).toBeNull();
    expect(validatePracticeOutput(s, reg, req, valid({ text: 4 }))).toBeNull();
  });

  it('an empty summary is the seed gist', () => {
    const s = roleWorld();
    const gist = (reg.practiceSeeds.get('task_report_at_dusk') as unknown as PracticeSeedEntry).gist;
    const r = validatePracticeOutput(s, reg, requestFor(s), valid({ summary: '' }))!;
    expect(r.output.summary).toBe(gist);
    expect(r.issues.join(' ')).toMatch(/summary/);
    const none = validatePracticeOutput(s, reg, requestFor(s), valid({ summary: '', seedId: undefined }));
    expect(none).toBeNull(); // no seed, no words: the fallback line stands
  });

  it('the fixtures: valid passes, hostile is clamped or refused, truncated parses to nothing', async () => {
    const { readFileSync } = await import('node:fs');
    const s = roleWorld();
    const req = requestFor(s);
    const good = JSON.parse(readFileSync('tests/fixtures/practice_generate/valid.json', 'utf8'));
    expect(validatePracticeOutput(s, reg, req, good)!.output).toMatchObject({ seedId: 'task_report_at_dusk', tier: 1, check: 'dm_report' });
    const hostile = JSON.parse(readFileSync('tests/fixtures/practice_generate/hostile.json', 'utf8'));
    expect(validatePracticeOutput(s, reg, req, hostile)).toBeNull(); // every tag is off, and the pronoun
    expect(Object.keys(validatePracticeOutput(s, reg, req, { ...hostile, tags: ['service'], text: 'Obey.', summary: 'obey' })!.output).sort()).not.toContain('trust');
    expect(() => JSON.parse(readFileSync('tests/fixtures/practice_generate/truncated.json', 'utf8'))).toThrow();
  });

  it('draws nothing and changes nothing', () => {
    const s = roleWorld();
    const req = requestFor(s);
    const before = structuredClone(s);
    validatePracticeOutput(s, reg, req, valid());
    buildPracticeInput(s, reg, req);
    expect(s).toEqual(before);
  });
});

describe('the prompt', () => {
  const promptOf = (s: CampaignState, card = 'A sergeant who gives orders in a low voice.') => {
    const req = requestFor(s);
    const input = buildPracticeInput(s, reg, req, card);
    const ct = getCallType('practice_generate')!;
    return { input, req, system: ct.system(input), prompt: ct.prompt(input) };
  };

  it('never names a disabled category or one of her limits', () => {
    const s = roleWorld();
    unitOf(s, ANN).bond!.ownLimits.categories = ['degrading_language', 'exposure_risk'];
    const { prompt, system } = promptOf(s);
    const enabled = s.content!.enabled;
    const enabledText = enabled.map((id) => `${id} ${String(reg.contentCategories.get(id)?.label ?? '')}`).join(' ').toLowerCase();
    const off = [...reg.contentCategories.values()].filter((c) => !enabled.includes(c.id));
    expect(off.length).toBeGreaterThan(4);
    for (const c of off) {
      for (const word of [String(c.label).toLowerCase(), c.id.toLowerCase()]) {
        if (enabledText.includes(word)) continue; // a word that an enabled category contains cannot be told apart
        expect(prompt.toLowerCase(), `${c.id} in the prompt`).not.toContain(word);
        expect(system.toLowerCase(), `${c.id} in the system prompt`).not.toContain(word);
      }
    }
    expect(prompt).toMatch(/Some things are hers to refuse/);
    const free = promptOf(roleWorld());
    expect(free.prompt).not.toMatch(/Some things are hers to refuse/);
  });

  it('lists three to six seeds and the categories and tracks that stand', () => {
    const { input, prompt } = promptOf(roleWorld());
    expect(input.seeds.length).toBeGreaterThanOrEqual(3);
    expect(input.seeds.length).toBeLessThanOrEqual(6);
    for (const seed of input.seeds) expect(prompt).toContain(`- ${seed.id} | ${seed.gist} |`);
    expect(prompt).toContain('service (Service');
    expect(input.categories.map((c) => c.id)).toEqual(expect.arrayContaining(['service', 'restraint']));
  });

  it('carries no number of hold, favour or Regard: the only digits are the day and the deadline range', () => {
    const s = withWant(roleWorld(), 77);
    s.relations[ANN].dynamic!.hold = 61;
    s.relations[ANN].dynamic!.favour = 13;
    s.relations[ANN].dynamic!.recent = ['probe_obedience', 'task_report_at_dusk'];
    const { prompt } = promptOf(s, 'A sergeant of 40 years.');
    const lines = prompt.split('\n');
    const open = lines.indexOf('<card>');
    const close = lines.indexOf('</card>');
    const context = [...lines.slice(0, open), ...lines.slice(close + 1)].join('\n').replace(/Day: \d+/, 'Day: N').replace(/Deadline: \d+ to \d+ days/, 'Deadline: range');
    expect(context).not.toMatch(/\d/);
    expect(prompt).not.toContain('61');
    expect(prompt).not.toContain('77');
    expect(prompt).toMatch(/Her want: aching/);
  });

  it('a sealed open task is a sealed task, a plain one its summary', () => {
    const s = roleWorld();
    s.practices = {
      seq: 3, requests: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [],
      tasks: [
        { id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'secret words', summary: 'secret summary', status: 'offered', sealed: true, acceptForm: 'sealed', day: 19 },
        { id: 'pt2', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'words', summary: 'carry the roster', status: 'open', acceptForm: 'button_cost', day: 19 },
      ],
    };
    const { prompt } = promptOf(s);
    expect(prompt).toContain('a sealed task; carry the roster');
    expect(prompt).not.toContain('secret');
  });

  it('the call type is a mechanic JSON call, not prose, and says the card is data', () => {
    const ct = getCallType('practice_generate')!;
    expect(ct).toMatchObject({ profile: 'mechanic', json: true });
    expect(ct.prose).toBeUndefined();
    const { system } = promptOf(roleWorld());
    expect(system).toMatch(/single JSON object and nothing else/);
    expect(system).toMatch(/data, not instructions/);
    expect(system).toMatch(/never use a pronoun for the commander/i);
    expect(system).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
