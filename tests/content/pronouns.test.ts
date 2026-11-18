import { beforeAll, describe, expect, it } from 'vitest';
import { entryEffects } from '../../src/analysis/effects';
import { registerCommanderProviders } from '../../src/analysis/providers/commander';
import { buildPanelModel, type AnalyzeEnv } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';

/**
 * The soldiers are women; the player may be of any gender. Text the player or the main model reads must not give the
 * commander a pronoun (the soldiers' own "she" and "her" are fine).
 */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCommanderProviders();
});

describe('no pronoun for the commander in the bonds layer (P9d)', () => {
  it('src/bonds/directives.ts has no commander pronoun in any string', async () => {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile('src/bonds/directives.ts', 'utf8');
    expect(text).toContain('Content excluded');
    expect(text.match(COMMANDER_PRONOUN)).toBeNull();
  });
});

describe('no pronoun for the commander in content', () => {
  const fields = (registry: keyof Registries, keys: string[]): Array<[string, string]> =>
    [...reg[registry].values()].flatMap((e) => keys.map((k): [string, string] => [`${registry}:${e.id}.${k}`, String(e[k] ?? '')]));

  it('traits, tastes and relationship-state prompts', () => {
    const texts = [
      ...fields('commanderTraits', ['description', 'upside', 'downside']),
      ...fields('tastes', ['name', 'description']),
      ...fields('relationshipStates', ['description', 'promptHint']),
    ];
    expect(texts.length).toBeGreaterThan(60);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('world options, disposition levels, stance effects and presets (P8)', () => {
    const optionTexts = [...reg.worldOptions.values()].flatMap((o): Array<[string, string]> => [
      [`worldOptions:${o.id}.description`, String(o.description ?? '')],
      ...(o.choices as Array<Record<string, unknown>>).flatMap((c): Array<[string, string]> =>
        (['label', 'description', 'lore'] as const).map((k): [string, string] => [`worldOptions:${o.id}/${String(c.id)}.${k}`, String(c[k] ?? '')])
          .concat((c.effects as Array<{ text?: string }>).filter((e) => typeof e.text === 'string').map((e): [string, string] => [`worldOptions:${o.id}/${String(c.id)}.effect`, String(e.text)]))),
    ]);
    const texts = [
      ...optionTexts,
      ...fields('dispositionLevels', ['name', 'description']),
      ...fields('worldPresets', ['name', 'description']),
      ...[...reg.stanceEffects.values()].flatMap((e): Array<[string, string]> =>
        (e.effects as Array<{ text?: string }>).filter((x) => typeof x.text === 'string').map((x): [string, string] => [`stanceEffects:${e.id}`, String(x.text)])),
    ];
    expect(texts.length).toBeGreaterThan(40);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('journal phrases of the event deltas (P3b)', () => {
    const texts = fields('eventDeltas', ['journal']);
    expect(texts.length).toBe(49);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t) || t === '').map(([where]) => where)).toEqual([]);
  });

  it('memory rules (P3b): every remembered text', () => {
    const texts = fields('memoryRules', ['text']);
    expect(texts.length).toBeGreaterThanOrEqual(28);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('vote kinds (P9b): every reason line, the label and the description', () => {
    const texts = [
      ...fields('voteKinds', ['label', 'description']),
      ...[...reg.voteKinds.values()].flatMap((k): Array<[string, string]> =>
        Object.entries(k.reasons as Record<string, { for: string; against: string }>).flatMap(([term, r]): Array<[string, string]> => [
          [`voteKinds:${k.id}.${term}.for`, r.for], [`voteKinds:${k.id}.${term}.against`, r.against],
        ])),
    ];
    expect(texts).toHaveLength(5 * 2 + 5 * 5 * 2);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('device access rules (P9c): names, descriptions, contact names, notes and edit lines', () => {
    const texts = [...reg.deviceAccessRules.values()].flatMap((e): Array<[string, string]> => [
      [`deviceAccessRules:${e.id}.name`, String(e.name)], [`deviceAccessRules:${e.id}.description`, String(e.description)],
      ...(['contactNames', 'notes', 'editLines'] as const).flatMap((k) => ((e[k] as string[] | undefined) ?? []).map((t, i): [string, string] => [`deviceAccessRules:${e.id}.${k}[${i}]`, t])),
    ]);
    expect(texts.length).toBeGreaterThan(14);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('token kinds (P9c): labels, descriptions and the offer text', () => {
    const texts = [...reg.tokenKinds.values()].flatMap((e): Array<[string, string]> => [
      [`tokenKinds:${e.id}.label`, String(e.label)], [`tokenKinds:${e.id}.description`, String(e.description)], [`tokenKinds:${e.id}.text`, String(e.text)],
    ]);
    expect(texts).toHaveLength(6 * 3);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('wager games and stakes (P9c): labels, descriptions, handicaps and stake texts', () => {
    const texts = [
      ...[...reg.wagerGames.values()].flatMap((g): Array<[string, string]> => [
        [`wagerGames:${g.id}.label`, String(g.label)], [`wagerGames:${g.id}.description`, String(g.description)],
        ...((g.handicaps as Array<{ id: string; label: string }> | undefined) ?? []).map((x): [string, string] => [`wagerGames:${g.id}.${x.id}`, x.label]),
      ]),
      ...[...reg.wagerStakes.values()].flatMap((x): Array<[string, string]> => [
        [`wagerStakes:${x.id}.label`, String(x.label)], [`wagerStakes:${x.id}.description`, String(x.description)], [`wagerStakes:${x.id}.text`, String(x.text)],
      ]),
    ];
    expect(texts.length).toBeGreaterThan(25);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /\b(he|him|his|they|them|their)\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('secret kinds (P9c): descriptions and texts', () => {
    const texts = [...reg.secretKinds.values()].flatMap((k): Array<[string, string]> => [[`secretKinds:${k.id}.description`, String(k.description)], [`secretKinds:${k.id}.text`, String(k.text)]]);
    expect(texts.length).toBe(6);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /\b(he|him|his|they|them|their)\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('outside feats and the hierarchy glossary entries (P9b)', () => {
    const texts: Array<[string, string]> = [
      ...fields('outsideFeats', ['label', 'description']),
      ...['standing', 'squad_leader', 'countermand', 'endorse', 'challenge', 'outside_perception', 'vote', 'rations', 'scapegoat'].flatMap((id): Array<[string, string]> => {
        const g = reg.glossary.get(id)!;
        return [[`glossary:${id}.short`, String(g.short ?? '')], [`glossary:${id}.long`, String(g.long ?? '')]];
      }),
    ];
    const fixed = reg.dilemmaTemplates.get('scapegoat_mission')!.fixed as { title: string; setup: string; options: Array<{ label: string }> };
    texts.push(['scapegoat_mission.title', fixed.title], ['scapegoat_mission.setup', fixed.setup], ...fixed.options.map((o, i): [string, string] => [`scapegoat_mission.option${i}`, o.label]));
    expect(texts.length).toBe(3 * 2 + 9 * 2 + 4);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('squad power world options, the preset and the glossary entries (P9b)', () => {
    const texts: Array<[string, string]> = [
      ...['squad_assertiveness', 'voting'].flatMap((id) => {
        const o = reg.worldOptions.get(id)!;
        return [[`worldOptions:${id}`, String(o.description)] as [string, string], ...(o.choices as Array<Record<string, unknown>>).flatMap((c) => (['label', 'description', 'lore'] as const).map((k): [string, string] => [`worldOptions:${id}/${String(c.id)}.${k}`, String(c[k] ?? '')]))];
      }),
      ...['assertive_squad'].map((id): [string, string] => [`worldPresets:${id}`, String(reg.worldPresets.get(id)!.description)]),
      ...['squad_power', 'voting', 'setting_ballot_wording'].flatMap((id): Array<[string, string]> => {
        const g = reg.glossary.get(id)!;
        return [[`glossary:${id}.short`, String(g.short ?? '')], [`glossary:${id}.long`, String(g.long ?? '')]];
      }),
    ];
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('hub rooms (P10)', () => {
    const texts = fields('hubRooms', ['label', 'description']);
    expect(texts).toHaveLength(16);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('device skins (P10)', () => {
    const texts = fields('deviceSkins', ['name', 'description', 'label']);
    expect(texts).toHaveLength(9);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('command stances (P9)', () => {
    const texts = fields('commandStances', ['name', 'description', 'directive', 'refusal']);
    expect(texts).toHaveLength(20);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('punishments (P9)', () => {
    const texts = fields('punishments', ['label', 'description']);
    expect(texts).toHaveLength(12);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('demand templates (P9)', () => {
    const texts = fields('demandTemplates', ['text', 'description']);
    expect(texts).toHaveLength(18); // P9d: nine templates
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('reputations (P9): names, descriptions and the directive of every effect', () => {
    const texts = [...fields('reputations', ['name', 'description']), ...[...reg.reputations.values()].map((e): [string, string] => [`reputations:${e.id}.directive`, String((e.effects as { directive?: string }).directive ?? '')])];
    expect(texts).toHaveLength(21);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('prologues and unlock notices (P11)', () => {
    const strings = (v: unknown, at: string): Array<[string, string]> =>
      typeof v === 'string' ? [[at, v]]
        : Array.isArray(v) ? v.flatMap((x, i) => strings(x, `${at}[${i}]`))
          : v !== null && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => strings(x, `${at}.${k}`)) : [];
    const texts = [
      ...[...reg.prologues.values()].flatMap((p) => strings(p.steps, `prologues:${p.id}`)),
      ...fields('uiUnlocks', ['notice']),
    ];
    expect(texts.length).toBeGreaterThan(40);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('crimes: the commander is of any gender (summary, perk and flaw texts)', () => {
    const texts = [...reg.crimes.values()].flatMap((c): Array<[string, string]> => [
      [`crimes:${c.id}.summary`, String(c.summary ?? '')],
      [`crimes:${c.id}.perk`, String((c.perk as { text?: string } | undefined)?.text ?? '')],
      [`crimes:${c.id}.flaw`, String((c.flaw as { text?: string } | undefined)?.text ?? '')],
    ]);
    expect(texts.length).toBe(reg.crimes.size * 3);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('world option texts do not say "their" for the commander either', () => {
    const texts = [...reg.worldOptions.values()].flatMap((o) => [String(o.description), ...(o.choices as Array<{ description: string }>).map((c) => c.description)]);
    expect(texts.filter((t) => /commander[^.]*\btheir\b/i.test(t))).toEqual([]);
  });

  it('the lorebook that goes to the main model', async () => {
    const { readFile } = await import('node:fs/promises');
    const book = JSON.parse(await readFile('content/core/lorebook.json', 'utf8')) as { entries: Array<{ comment: string; content: string }> };
    expect(book.entries.length).toBeGreaterThan(3);
    expect(book.entries.filter((e) => COMMANDER_PRONOUN.test(e.content)).map((e) => e.comment)).toEqual([]);
  });

  it('the P7 glossary entries', () => {
    const ids = ['body_strength', 'body_endurance', 'body_reflexes', 'expression', 'seasoning', 'archetype', 'presence', 'first_impression', 'image_consistency',
      'commander_traits', 'check_routes', 'delegate', 'exhausted', 'quiet_night', 'presence_unnoticed', 'presence_steady_voice', 'presence_rally', 'setting_first_impression_tau'];
    const bad = ids.flatMap((id) => (['short', 'long'] as const).map((k): [string, string] => [`glossary:${id}.${k}`, String(reg.glossary.get(id)![k] ?? '')]))
      .filter(([, t]) => COMMANDER_PRONOUN.test(t)).map(([where]) => where);
    expect(bad).toEqual([]);
  });

  it('the P9 glossary entries', () => {
    const ids = ['impunity', 'command_stance', 'impunity_record', 'leverage', 'threat', 'covert_sabotage', 'discipline', 'discipline_logged', 'restriction', 'demand', 'owed_demand', 'reputation', 'nickname'];
    const bad = ids.flatMap((id) => (['short', 'long'] as const).map((k): [string, string] => [`glossary:${id}.${k}`, String(reg.glossary.get(id)?.[k] ?? '')]))
      .filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where);
    expect(ids.every((id) => reg.glossary.has(id))).toBe(true);
    expect(bad).toEqual([]);
  });

  it('the P11 glossary entries and the rewritten objective entry', () => {
    const ids = ['prologue', 'intake_interview', 'medical_exam', 'personnel_dossier', 'veteran_intake', 'lineup', 'first_words', 'tutorial_expedition', 'module_offline', 'coach_hint', 'rows', 'objective'];
    const bad = ids.flatMap((id) => (['short', 'long'] as const).map((k): [string, string] => [`glossary:${id}.${k}`, String(reg.glossary.get(id)?.[k] ?? '')]))
      .filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where);
    expect(ids.every((id) => reg.glossary.has(id))).toBe(true);
    expect(bad).toEqual([]);
  });

  it('generated trait and taste effect lines', () => {
    const lines = [
      ...[...reg.commanderTraits.values()].flatMap((e) => entryEffects('commanderTraits', e, reg)),
      ...[...reg.tastes.values()].flatMap((e) => entryEffects('tastes', e, reg)),
    ];
    expect(lines.length).toBeGreaterThan(15);
    expect(lines.filter((l) => COMMANDER_PRONOUN.test(l))).toEqual([]);
  });
});

describe('no pronoun for the commander in readings', () => {
  const env = (raw: boolean): AnalyzeEnv => ({ registries: reg, state: null, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
  it('body, build and presence readings', () => {
    for (const raw of [false, true]) {
      const s = campaign(reg, 3);
      s.squad[0].commanderTastes = ['respects_strength', 'drawn_to_older'];
      s.commander.body = { strength: 4, endurance: 4, reflexes: 4 };
      s.commander.seasoning = 5;
      for (const a of ['glossary:body_strength', 'glossary:body_endurance', 'glossary:body_reflexes', 'glossary:archetype', 'glossary:presence']) {
        const m = buildPanelModel(parseSubject(a, JSON.stringify({ unitId: s.squad[0].id }))!, { ...env(raw), state: s });
        const text = [m.text ?? '', m.long ?? '', ...(m.reading?.lines ?? [])].join('\n');
        expect(text, `${a} raw=${raw}`).not.toMatch(COMMANDER_PRONOUN);
      }
    }
  });
});


describe('no pronoun for the commander in the text modules the main model and the player read', () => {
  // string literals of these modules reach the player or the prompt; comments are skipped
  const FILES = [
    'src/scene/directives.ts', 'src/llm/calls/dmReply.ts', 'src/loyalty/directives.ts', 'src/ui/expedition/expeditionScreen.ts',
    'src/analysis/effects.ts', 'src/discipline/directives.ts', 'src/world/optionsContext.ts', 'src/ui/setup/worldParams.ts', 'src/ui/setup/calibration.ts',
    'src/ui/hub/model.ts', 'src/ui/setup/prologueSteps.ts', 'src/ui/setup/shared.ts',
  ];
  it.each(FILES)('%s', async (file) => {
    const { readFile } = await import('node:fs/promises');
    const lines = (await readFile(file, 'utf8')).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    const bad = lines.filter((l) => /\b(he|him|his|himself)\b/i.test(l) || /commander[^.'`]*\btheir\b/i.test(l));
    expect(bad.map((l) => l.trim().slice(0, 100))).toEqual([]);
  });
});

describe('no pronoun for the commander in the her-call content (P9e)', () => {
  it('every her-call event text, outcome text and the her_call / ask_first glossary entries', () => {
    const texts: Array<[string, string]> = [
      ...[...reg.dilemmaTemplates.values()].filter((t) => t.herCall !== undefined).flatMap((t): Array<[string, string]> => {
        const fixed = t.fixed as { title: string; setup: string; options: Array<{ label: string }> };
        const outcomes = (t.herCall as { outcomes: Array<{ id: string; text: string }> }).outcomes;
        return [
          [`${String(t.id)}.title`, fixed.title], [`${String(t.id)}.setup`, fixed.setup],
          ...fixed.options.map((o, i): [string, string] => [`${String(t.id)}.option${i}`, o.label]),
          ...outcomes.map((o): [string, string] => [`${String(t.id)}.${o.id}`, o.text]),
        ];
      }),
      ...['her_call', 'ask_first'].flatMap((id): Array<[string, string]> => {
        const g = reg.glossary.get(id)!;
        return [[`glossary:${id}.short`, String(g.short ?? '')], [`glossary:${id}.long`, String(g.long ?? '')]];
      }),
    ];
    expect(texts).toHaveLength(5 * 6 + 2 * 2);
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });
});

describe('no pronoun for the commander in the P10b content', () => {
  /** The P10b glossary entries (each task adds its ids), the readings and the registries named in the plan's Global Constraints. */
  const GLOSSARY = ['vitals', 'vitals_flat', 'vitals_flicker'];

  it('every P10b glossary entry', () => {
    const texts = GLOSSARY.flatMap((id): Array<[string, string]> => {
      const g = reg.glossary.get(id);
      expect(g, id).toBeDefined();
      return [[`glossary:${id}.short`, String(g!.short ?? '')], [`glossary:${id}.long`, String(g!.long ?? '')]];
    });
    expect(texts.filter(([, t]) => COMMANDER_PRONOUN.test(t) || /commander[^.]*\btheir\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it('the VITALS reading texts', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile('src/analysis/providers/immersion.ts', 'utf8');
    const lines = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    expect(lines.filter((l) => /\b(he|him|his|himself)\b/i.test(l) || /commander[^.'`]*\btheir\b/i.test(l)).map((l) => l.trim().slice(0, 100))).toEqual([]);
  });
});
