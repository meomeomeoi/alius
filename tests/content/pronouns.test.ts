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
