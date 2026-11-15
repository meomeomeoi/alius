import { describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DilemmaTemplateSchema, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import { TUNING } from '../../src/engine/tuning';

const option = (label: string, effects: unknown[]) => ({ label, effects });
const cost = { type: 'party_stress', amount: 5 };
const fixed = { title: 'T', setup: 'S', options: [option('A', [cost]), option('B', [{ type: 'carried_supplies', amount: -2 }])] };
const good = { id: 'good', lean: { pragmatism: 1 }, text: 'It goes well.', effects: [{ type: 'party_stress', amount: -5 }] };
const bad = { id: 'bad', lean: { autonomy: 2 }, text: 'It goes badly.', effects: [{ type: 'carried_supplies', amount: -2 }, { type: 'party_stress', amount: 10 }] };
const herCall = { trigger: { minLeadRank: 2 }, outcomes: [good, bad] };
const tpl = { id: 'evt_hc_x', scale: 'minor', contexts: ['expedition_event'], fixed, herCall };

const parse = (t: unknown) => DilemmaTemplateSchema.safeParse(t);
const issuePaths = (t: unknown): string[] => {
  const r = parse(t);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('P9e: the herCall block', () => {
  it('a her-call template parses', () => {
    expect(parse(tpl).success).toBe(true);
    const full = { ...tpl, herCall: { ...herCall, trigger: { minLeadRank: 2, stances: ['open_defiance'], minImpunity: 50 }, defectTilt: [{ category: 'neural', shift: -0.1 }] } };
    expect(parse(full).success).toBe(true);
  });

  it('herCall needs exactly one good and one bad outcome', () => {
    expect(issuePaths({ ...tpl, herCall: { ...herCall, outcomes: [good, { ...good }] } })).toContain('herCall.outcomes');
    expect(issuePaths({ ...tpl, herCall: { ...herCall, outcomes: [bad, { ...bad }] } })).toContain('herCall.outcomes');
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [good] } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [bad, good] } }).success).toBe(true);
  });

  it('lean outside −2…2 is refused', () => {
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [{ ...good, lean: { pragmatism: 3 } }, bad] } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [{ ...good, lean: { pragmatism: -2 } }, bad] } }).success).toBe(true);
  });

  it('a trigger needs minLeadRank or stances', () => {
    expect(parse({ ...tpl, herCall: { ...herCall, trigger: {} } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, trigger: { minImpunity: 50 } } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, trigger: { stances: [] } } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, trigger: { stances: ['open_defiance'], minImpunity: 50 } } }).success).toBe(true);
    expect(parse({ ...tpl, herCall: { ...herCall, trigger: { minLeadRank: 4 } } }).success).toBe(false);
  });

  it('herCall only on a minor expedition_event template without generate or flavor', () => {
    expect(issuePaths({ ...tpl, scale: 'major' })).toContain('herCall');
    expect(issuePaths({ ...tpl, contexts: ['base'] })).toContain('herCall');
    expect(issuePaths({ ...tpl, contexts: ['expedition_event', 'base'] })).toContain('herCall');
    expect(issuePaths({ ...tpl, generate: { brief: 'A brief.' } })).toContain('herCall');
    expect(issuePaths({ ...tpl, flavor: true, fixed: { title: 'T', setup: 'S', options: [option('OK', [])] } })).toContain('herCall');
  });

  it('the bad outcome needs a cost effect; the good outcome carries none', () => {
    expect(issuePaths({ ...tpl, herCall: { ...herCall, outcomes: [good, { ...bad, effects: [{ type: 'party_stress', amount: -5 }] }] } })).toContain('herCall.outcomes.1.effects');
    expect(issuePaths({ ...tpl, herCall: { ...herCall, outcomes: [{ ...good, effects: [cost] }, bad] } })).toContain('herCall.outcomes.0.effects');
  });

  it('subject/witnesses targets and oversight_punish are refused in herCall outcomes', () => {
    const subject = { type: 'unit_event', event: 'praised', severity: 'minor', targets: 'subject' };
    const witnesses = { ...subject, targets: 'witnesses' };
    const punish = { type: 'oversight_punish', days: 1, stress: 5 };
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [{ ...good, effects: [subject] }, bad] } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [good, { ...bad, effects: [...bad.effects, witnesses] }] } }).success).toBe(false);
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [good, { ...bad, effects: [...bad.effects, punish] }] } }).success).toBe(false);
  });

  it('expedition-only effects are allowed in herCall outcomes', () => {
    const g = { ...good, effects: [{ type: 'loot', tableId: 'loot_cache' }, { type: 'party_hp', pct: 5 }] };
    const b = { ...bad, effects: [{ type: 'carried_supplies', amount: -2 }, { type: 'party_hp', pct: -10 }] };
    expect(parse({ ...tpl, herCall: { ...herCall, outcomes: [g, b] } }).success).toBe(true);
  });
});

const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};
async function errorsOf(files: Record<string, unknown[]>) {
  const out: Record<string, unknown> = {
    'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`])) },
  };
  for (const [k, v] of Object.entries(files)) out[`p/${k}.json`] = v;
  return (await loadPacks(['p'], memFetch(out))).errors;
}

describe('P9e: refs and reserved events', () => {
  it('trigger.stances must name commandStances (loader ref error for "nope")', async () => {
    const errs = await errorsOf({ dilemmaTemplates: [{ ...tpl, herCall: { ...herCall, trigger: { stances: ['nope'] } } }] });
    const e = errs.find((x) => x.file === 'dilemmaTemplates.json' && x.path === '[0].herCall.trigger.stances[0]');
    expect(e?.message).toContain('unknown commandStances id');
  });

  it('outcome effects are checked for refs (an unknown loot table)', async () => {
    const g = { ...good, effects: [{ type: 'loot', tableId: 'ghost_table' }] };
    const errs = await errorsOf({ dilemmaTemplates: [{ ...tpl, herCall: { ...herCall, outcomes: [g, bad] } }] });
    expect(errs.find((x) => x.path === '[0].herCall.outcomes[0].effects[0].tableId')?.message).toContain('unknown lootTables id');
  });

  it('her_call, her_call_acknowledged and ask_first_set are reserved event types', () => {
    for (const t of ['her_call', 'her_call_acknowledged', 'ask_first_set']) expect(RESERVED_EVENT_TYPES).toContain(t);
  });

  it('TUNING.herCall carries the draft numbers and is frozen', () => {
    expect(TUNING.herCall).toMatchObject({
      chance: 0.35, chanceCap: 0.8, leaderMult: 2, meritGood: 6, recordGood: 4, recordBad: 4, factImportance: 2,
      leadBonus: { yielding: 0, balanced: 0, assertive: 1, dominant: 2 },
      band: { cowed: 0.5, low: 0.75, high: 1, brazen: 1.5 },
      odds: { base: 0.5, perPoint: 0.05, min: 0.15, max: 0.85 },
      askFirst: { severity: 'minor' },
    });
    expect(Object.isFrozen(TUNING.herCall)).toBe(true);
    expect(Object.isFrozen(TUNING.herCall.odds)).toBe(true);
  });
});
