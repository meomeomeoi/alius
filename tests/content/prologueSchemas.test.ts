import { describe, expect, it } from 'vitest';
import {
  COMPLETIONS, MissionTemplateSchema, PROLOGUE_FIELDS, PrologueSchema, PrologueStepSchema, STEP_KINDS, UiUnlockSchema, WIZARD_KINDS,
} from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import { TAB_IDS } from '../../src/ui/shell/tabs';

type Step = Record<string, unknown>;

/** A minimal valid prologue; tests mutate a copy. Every field appears once and the entry has no startId unless a test adds one. */
const base = (): { id: string; startId?: string; order: string[]; steps: Record<string, Step> } => ({
  id: 'p_test',
  order: ['intake', 'exam', 'file', 'lineup', 'first_words', 'tutorial', 'free'],
  steps: {
    intake: { kind: 'paper_form', voice: 'paper', fields: ['crime', 'name'], completion: 'manual', skippable: false },
    exam: { kind: 'paper_form', voice: 'paper', fields: ['body', 'expression', 'seasoning', 'traits'], completion: 'manual', skippable: false },
    file: { kind: 'dossier', voice: 'paper', completion: 'manual', skippable: false },
    lineup: { kind: 'scene', voice: 'personal', locationId: 'garage', exchangeCap: 6, completion: 'no_open_scene', skippable: true },
    first_words: { kind: 'scene', voice: 'personal', locationId: 'quarters_unit', exchangeCap: 3, perUnit: true, completion: 'all_spoken', skippable: true },
    tutorial: { kind: 'expedition', voice: 'terminal', expeditionId: 'tutorial_patrol', regionId: 'quarantine_d7', completion: 'tutorial_returned', skippable: true },
    free: { kind: 'free', voice: 'terminal', completion: 'manual', skippable: false },
  },
});

const parse = (p: unknown) => PrologueSchema.safeParse(p);
const issuesOf = (p: unknown): Array<{ path: string; message: string }> => {
  const r = parse(p);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

describe('prologues schema', () => {
  it('is a registry name and exposes the closed enums', () => {
    expect(REGISTRY_NAMES).toContain('prologues');
    expect(REGISTRY_NAMES).toContain('uiUnlocks');
    expect(PROLOGUE_FIELDS).toEqual(['crime', 'name', 'body', 'expression', 'seasoning', 'traits']);
    expect(STEP_KINDS).toEqual(['paper_form', 'scene', 'expedition', 'dossier', 'guided_slot', 'free']);
    expect(COMPLETIONS).toEqual(['manual', 'no_open_scene', 'all_spoken', 'tutorial_returned', 'debriefed', 'next_day']);
    expect(WIZARD_KINDS).toEqual(['paper_form', 'dossier']);
  });

  it('valid skeleton parses', () => {
    expect(issuesOf(base())).toEqual([]);
  });

  it('a full step with every optional field parses', () => {
    const step = {
      kind: 'expedition', voice: 'terminal', title: 'Patrol', authoredText: ['a'], lines: { k: 'v' }, directive: 'd', expeditionId: 't', regionId: 'r',
      objective: 'Go.', hints: [{ id: 'h', screen: 'combat', glossaryId: 'cp', text: 'Spend CP.' }],
      nightKnock: { framing: '{name} knocks.', ignore: { event: 'dismissed', severity: 'minor' } }, completion: 'tutorial_returned', skippable: true,
    };
    expect(PrologueStepSchema.safeParse(step).success).toBe(true);
  });

  it('order id missing from steps is rejected', () => {
    const p = base();
    p.order.push('ghost');
    expect(issuesOf(p).some((i) => i.path === 'order' && /ghost/.test(i.message))).toBe(true);
  });

  it('wizard step after a campaign step is rejected', () => {
    const p = base();
    p.order = ['intake', 'exam', 'lineup', 'file', 'first_words', 'tutorial', 'free'];
    expect(issuesOf(p).some((i) => i.path === 'order' && /wizard/.test(i.message))).toBe(true);
  });

  it('two dossiers rejected', () => {
    const p = base();
    p.steps.file2 = { ...p.steps.file };
    p.order = ['intake', 'exam', 'file', 'file2', 'lineup', 'first_words', 'tutorial', 'free'];
    expect(issuesOf(p).some((i) => /dossier/.test(i.message))).toBe(true);
  });

  it('the dossier is the last wizard step', () => {
    const p = base();
    p.order = ['intake', 'file', 'exam', 'lineup', 'first_words', 'tutorial', 'free'];
    expect(issuesOf(p).some((i) => /dossier/.test(i.message))).toBe(true);
  });

  it('free not last rejected', () => {
    const p = base();
    p.order = ['intake', 'exam', 'file', 'lineup', 'first_words', 'free', 'tutorial'];
    expect(issuesOf(p).some((i) => /free/.test(i.message))).toBe(true);
  });

  it('a field listed twice is rejected', () => {
    const p = base();
    p.steps.exam.fields = ['body', 'expression', 'seasoning', 'traits', 'name'];
    expect(issuesOf(p).some((i) => /name/.test(i.message) && /once|twice|more than/.test(i.message))).toBe(true);
  });

  it('every field once is required for an entry with startId', () => {
    const p = base();
    p.startId = 'start_vesper';
    expect(issuesOf(p)).toEqual([]);
    p.steps.exam.fields = ['body', 'expression', 'seasoning'];
    expect(issuesOf(p).some((i) => i.path === 'steps' && /traits/.test(i.message))).toBe(true);
  });

  it('a skeleton without startId may leave a field out', () => {
    const p = base();
    p.steps.exam.fields = ['body', 'expression', 'seasoning'];
    expect(issuesOf(p)).toEqual([]);
  });

  it('scene step needs locationId and exchangeCap', () => {
    const p = base();
    delete p.steps.lineup.locationId;
    expect(issuesOf(p).some((i) => i.path === 'steps.lineup.locationId')).toBe(true);
    const q = base();
    delete q.steps.lineup.exchangeCap;
    expect(issuesOf(q).some((i) => i.path === 'steps.lineup.exchangeCap')).toBe(true);
  });

  it('expedition step needs expeditionId and regionId', () => {
    const p = base();
    delete p.steps.tutorial.expeditionId;
    expect(issuesOf(p).some((i) => i.path === 'steps.tutorial.expeditionId')).toBe(true);
    const q = base();
    delete q.steps.tutorial.regionId;
    expect(issuesOf(q).some((i) => i.path === 'steps.tutorial.regionId')).toBe(true);
  });

  it('paper_form completion must be manual', () => {
    const p = base();
    p.steps.intake.completion = 'next_day';
    expect(issuesOf(p).some((i) => i.path === 'steps.intake.completion')).toBe(true);
  });

  it('perUnit scene completion must be all_spoken', () => {
    const p = base();
    p.steps.first_words.completion = 'no_open_scene';
    expect(issuesOf(p).some((i) => i.path === 'steps.first_words.completion')).toBe(true);
  });

  it('an exchangeCap above 12, an unknown completion and an unknown field are rejected', () => {
    const p = base();
    p.steps.lineup.exchangeCap = 13;
    expect(parse(p).success).toBe(false);
    const q = base();
    q.steps.lineup.completion = 'whenever';
    expect(parse(q).success).toBe(false);
    const r = base();
    r.steps.intake.fields = ['shoe_size'];
    expect(parse(r).success).toBe(false);
  });

  it('more than four hints are rejected', () => {
    const hint = { id: 'h', screen: 'combat', glossaryId: 'cp', text: 't' };
    const step = { ...base().steps.tutorial, hints: [hint, hint, hint, hint, hint] };
    expect(PrologueStepSchema.safeParse(step).success).toBe(false);
  });
});

describe('missionTemplates tutorial and fixedMap', () => {
  const tpl = (extra: Record<string, unknown> = {}) => ({
    id: 'tpl_x', name: 'X', sources: ['command'], objectives: [{ node: 'cache', condition: 'reach' }], dangerRange: [1, 1], tiers: ['tier_1'],
    failureEffects: [], titles: ['t'], briefs: ['b'], ...extra,
  });
  const map = (layers: unknown[][]) => ({ layers });

  it('fixedMap rejects a layer of 4 nodes', () => {
    const four = [{ type: 'combat' }, { type: 'combat' }, { type: 'combat' }, { type: 'combat' }];
    expect(MissionTemplateSchema.safeParse(tpl({ fixedMap: map([four]) })).success).toBe(false);
    expect(MissionTemplateSchema.safeParse(tpl({ fixedMap: map([four.slice(0, 3)]) })).success).toBe(true);
  });

  it('fixedMap takes 1 to 4 layers and no empty layer', () => {
    const one = [{ type: 'combat' }];
    expect(MissionTemplateSchema.safeParse(tpl({ fixedMap: map([]) })).success).toBe(false);
    expect(MissionTemplateSchema.safeParse(tpl({ fixedMap: map([one, one, one, one, one]) })).success).toBe(false);
    expect(MissionTemplateSchema.safeParse(tpl({ fixedMap: map([[]]) })).success).toBe(false);
  });

  it('tutorial template needs fixedMap', () => {
    expect(MissionTemplateSchema.safeParse(tpl({ tutorial: true })).success).toBe(false);
    expect(MissionTemplateSchema.safeParse(tpl({ tutorial: true, fixedMap: map([[{ type: 'combat' }]]) })).success).toBe(true);
    expect(MissionTemplateSchema.safeParse(tpl({ tutorial: false })).success).toBe(false);
  });

  it('an ordinary template still parses', () => {
    expect(MissionTemplateSchema.safeParse(tpl()).success).toBe(true);
  });
});

describe('uiUnlocks schema', () => {
  const row = { id: 'u_x', target: { tab: 'ops' }, condition: { afterStep: 'tutorial' }, notice: 'MODULE ONLINE: OPS' };

  it('a complete row parses', () => {
    expect(UiUnlockSchema.safeParse(row).success).toBe(true);
    expect(UiUnlockSchema.safeParse({ ...row, condition: { minDay: 2 } }).success).toBe(true);
    expect(UiUnlockSchema.safeParse({ ...row, condition: { minDay: 2, afterStep: 'tutorial' } }).success).toBe(true);
  });

  it('uiUnlock needs minDay or afterStep', () => {
    expect(UiUnlockSchema.safeParse({ ...row, condition: {} }).success).toBe(false);
    expect(UiUnlockSchema.safeParse({ ...row, condition: { minDay: 0 } }).success).toBe(false);
  });

  it('target.tab must be a TabId', () => {
    expect(UiUnlockSchema.safeParse({ ...row, target: { tab: 'settings' } }).success).toBe(false);
    expect(UiUnlockSchema.safeParse({ ...row, target: {} }).success).toBe(false);
    for (const tab of TAB_IDS) expect(UiUnlockSchema.safeParse({ ...row, target: { tab } }).success, tab).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// cross references, through the real loader over a copy of the core pack

import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';

const coreJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(`content/core/${file}`, 'utf8'));

/** The core pack with some files replaced; only errors of the replaced files are returned. */
async function loadWith(replace: Record<string, unknown>) {
  const manifest = (await coreJson('manifest.json')) as { files: Record<string, string> };
  const files: Record<string, unknown> = { 'mem/manifest.json': { ...manifest, id: 'mem' } };
  for (const f of Object.values(manifest.files)) files[`mem/${f}`] = f in replace ? replace[f] : await coreJson(f);
  const loaded = await loadPacks(['mem'], async (p) => {
    if (!(p in files)) throw new Error(`404 ${p}`);
    return files[p];
  });
  return { ...loaded, errors: loaded.errors.filter((e) => e.file in replace) };
}

const skeleton = async () => ((await coreJson('prologues.json')) as Array<{ id: string; steps: Record<string, Step> }>);
const withStep = async (step: string, patch: Step) => {
  const list = await skeleton();
  const mine = list.find((e) => e.id === 'prologue_vesper')!;
  mine.steps = { ...mine.steps, [step]: patch };
  return loadWith({ 'prologues.json': list });
};

describe('prologues cross references', () => {
  it('core has no errors for its own prologues', async () => {
    const { errors } = await loadWith({ 'prologues.json': await skeleton() });
    expect(errors).toEqual([]);
  });

  it('unknown expeditionId is reported with its path', async () => {
    const { errors } = await withStep('tutorial', { expeditionId: 'tpl_nowhere' });
    expect(errors.some((e) => /missionTemplates id "tpl_nowhere"/.test(e.message) && /steps\.tutorial\.expeditionId/.test(e.path))).toBe(true);
  });

  it('unknown regionId is reported', async () => {
    const { errors } = await withStep('tutorial', { regionId: 'atlantis' });
    expect(errors.some((e) => /regions id "atlantis"/.test(e.message) && /steps\.tutorial\.regionId/.test(e.path))).toBe(true);
  });

  it('unknown locationId is reported', async () => {
    const { errors } = await withStep('lineup', { locationId: 'moon_base' });
    expect(errors.some((e) => /locations id "moon_base"/.test(e.message) && /steps\.lineup\.locationId/.test(e.path))).toBe(true);
  });

  it('unknown glossaryId in a hint is reported', async () => {
    const { errors } = await withStep('tutorial', { hints: [{ id: 'h1', screen: 'combat', glossaryId: 'no_such_term', text: 'x' }] });
    expect(errors.some((e) => /glossary id "no_such_term"/.test(e.message) && /hints\[0\]\.glossaryId/.test(e.path))).toBe(true);
  });

  it('unknown nightKnock ignore event is reported', async () => {
    const { errors } = await withStep('first_evening', { nightKnock: { framing: '{name} knocks.', ignore: { event: 'no_such_event', severity: 'minor' } } });
    expect(errors.some((e) => /eventDeltas id "no_such_event"/.test(e.message))).toBe(true);
  });

  it('unknown startId is reported', async () => {
    const list = await skeleton();
    (list.find((e) => e.id === 'prologue_vesper') as Step).startId = 'start_nowhere';
    const { errors } = await loadWith({ 'prologues.json': list });
    expect(errors.some((e) => /starts id "start_nowhere"/.test(e.message) && /startId/.test(e.path))).toBe(true);
  });

  it('an afterStep that is not a step of every prologue is reported', async () => {
    const rows = (await coreJson('uiUnlocks.json')) as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], condition: { afterStep: 'no_such_step' } };
    const { errors } = await loadWith({ 'uiUnlocks.json': rows });
    expect(errors.some((e) => /no_such_step/.test(e.message))).toBe(true);
  });

  it('a fixedMap node type that is the objective kind, and an unknown event, are reported', async () => {
    const tpls = (await coreJson('missionTemplates.json')) as Array<Record<string, unknown>>;
    const t = tpls.find((x) => x.id === 'tutorial_patrol')!;
    t.fixedMap = { layers: [[{ type: 'objective' }], [{ type: 'event', eventId: 'evt_nowhere' }]] };
    const { errors } = await loadWith({ 'missionTemplates.json': tpls });
    expect(errors.some((e) => /kind "objective"/.test(e.message) && /fixedMap/.test(e.path))).toBe(true);
    expect(errors.some((e) => /dilemmaTemplates id "evt_nowhere"/.test(e.message))).toBe(true);
  });

  it('a fixedMap event that is not an expedition_event template is reported', async () => {
    const tpls = (await coreJson('missionTemplates.json')) as Array<Record<string, unknown>>;
    const t = tpls.find((x) => x.id === 'tutorial_patrol')!;
    t.fixedMap = { layers: [[{ type: 'event', eventId: 'dil_rations' }]] };
    const { errors } = await loadWith({ 'missionTemplates.json': tpls });
    expect(errors.some((e) => /expedition_event/.test(e.message))).toBe(true);
  });
});

describe('ui tab ids', () => {
  it('the content schema lists exactly the PDA tabs', async () => {
    const { UI_TAB_IDS } = await import('../../src/content/schemas');
    expect([...UI_TAB_IDS]).toEqual([...TAB_IDS]);
  });
});
