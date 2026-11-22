// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { addMastery } from '../../../src/engine/dynamic/mastery';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { zoneTag } from '../../../src/engine/dynamic/zones';
import { addFact } from '../../../src/engine/memory/facts';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { bodyMapFor, bodyMapZones, hairPath, outlinePath, renderBodyMap, type BodyMapCtx } from '../../../src/ui/dynamic/bodyMap';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
const knowledge = (s: CampaignState) => buildKnowledge(s, { ...DEFAULT_SETTINGS });

function world(on: string[] = ['restraint', 'worship'], shown: string[] = []): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  unitOf(s, ANN).expectations = {
    worship: { feet: { attitude: 'craves', meaning: 'reward', how: 'slowly' }, toes: { attitude: 'enjoys' }, hands: { attitude: 'dislikes' }, breasts: { attitude: 'craves' } },
    build: { slim: 0, athletic: 1, curvy: 0 }, hair: 'tail',
  };
  s.content = { enabled: on };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 25 };
  for (const t of shown) addFact(s, { about: [ANN], text: `AUTHOR TO WRITE: Ann showed the commander ${t}.`, tags: ['dynamic', zoneTag(t)], importance: 2, day: s.day, knownBy: [ANN] });
  return s;
}
const draw = (s: CampaignState, over: Partial<BodyMapCtx> = {}) => {
  const host = h('div');
  document.body.append(host);
  renderBodyMap(host, { ...bodyMapFor(s, reg, knowledge(s), ANN, false), ...over });
  return host;
};
const zoneEl = (host: HTMLElement, id: string, side = 'front') => host.querySelector<SVGGElement>(`g.alius-bm-zone[data-target="${id}"][data-side="${side}"]`)!;
const ATTITUDES = ['is-craves', 'is-enjoys', 'is-indifferent', 'is-dislikes'];

describe('the zones', () => {
  it('an unrevealed zone is a question mark with no attitude class', () => {
    const s = world();
    const host = draw(s);
    const feet = zoneEl(host, 'feet');
    expect(feet.querySelector('.alius-bm-q')!.textContent).toBe('?');
    expect(feet.classList.contains('is-unknown')).toBe(true);
    for (const c of ATTITUDES) expect(feet.classList.contains(c), c).toBe(false);
    expect(feet.getAttribute('data-attitude')).toBeNull();
    expect(host.querySelector('.alius-bm-row[data-target="feet"]')!.textContent).toContain('NOT YET KNOWN');
    expect(host.innerHTML).not.toMatch(/CRAVES|DISLIKES/); // nothing of her profile before a fact shows it
  });

  it('a zone a fact has shown carries its attitude, meaning and the fact as its source', () => {
    const s = world(['restraint', 'worship'], ['feet']);
    const host = draw(s);
    const feet = zoneEl(host, 'feet');
    expect(feet.classList.contains('is-craves')).toBe(true);
    expect(feet.classList.contains('is-unknown')).toBe(false);
    expect(feet.querySelector('.alius-bm-q')).toBeNull();
    expect(feet.querySelector('.alius-bm-meaning')).not.toBeNull();
    const row = host.querySelector('.alius-bm-row[data-target="feet"]')!;
    expect(row.textContent).toContain('CRAVES');
    expect(row.textContent).toContain('Ann showed the commander feet.'); // the note found on the form
    expect(row.textContent).not.toContain('AUTHOR TO WRITE');
    expect(zoneEl(host, 'toes').classList.contains('is-unknown')).toBe(true); // another zone is still a question
  });

  it('a fact the commander does not have shows nothing', () => {
    const s = world();
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: hidden', tags: ['dynamic', zoneTag('feet')], importance: 2, day: s.day, knownBy: [ANN], hiddenFromCommander: true });
    const zones = bodyMapZones(s, reg, knowledge(s), ANN);
    expect(zones.find((z) => z.targetId === 'feet')).toMatchObject({ known: false });
    expect(zones.find((z) => z.targetId === 'feet')!.attitude).toBeUndefined();
    expect(zones.find((z) => z.targetId === 'feet')!.sources).toEqual([]);
  });

  it('explicit zones only with explicit_scenes', () => {
    const ids = (s: CampaignState) => [...new Set(bodyMapZones(s, reg, knowledge(s), ANN).map((z) => z.targetId))];
    const plain = ids(world());
    for (const id of ['breasts', 'bottom', 'genitalia']) expect(plain, id).not.toContain(id);
    expect(plain).toContain('feet');
    const explicit = world(['restraint', 'worship', 'explicit_scenes']);
    for (const id of ['breasts', 'bottom', 'genitalia']) expect(ids(explicit), id).toContain(id);
    expect(bodyMapZones(explicit, reg, knowledge(explicit), ANN).find((z) => z.targetId === 'breasts')).toMatchObject({ side: 'front', explicit: true });
    expect(draw(explicit).querySelector('g.alius-bm-zone[data-target="breasts"] .alius-bm-explicit')).not.toBeNull();
    expect(draw(world()).querySelector('[data-target="breasts"]')).toBeNull();
    // her own limit closes a zone too, and the whole map is empty while worship is off
    const limit = world();
    unitOf(limit, ANN).bond!.ownLimits.categories = ['worship'];
    expect(ids(limit)).toEqual([]);
    expect(ids(world(['restraint']))).toEqual([]);
  });

  it('a target on both sides is a zone on each figure; one side only is drawn on its own', () => {
    const host = draw(world());
    expect(zoneEl(host, 'legs', 'front')).not.toBeNull();
    expect(zoneEl(host, 'legs', 'back')).not.toBeNull();
    expect(zoneEl(host, 'soles', 'back')).not.toBeNull();
    expect(zoneEl(host, 'soles', 'front')).toBeNull();
    expect(host.querySelectorAll('.alius-bm-row[data-target="legs"]')).toHaveLength(1); // the list names it once
  });

  it('mastery shows as dots and never as xp; a woman with none shows no dots', () => {
    const s = world(['restraint', 'worship'], ['feet']);
    expect(draw(s).querySelector('g.alius-bm-zone[data-target="feet"] .alius-bm-dots')).toBeNull();
    addMastery(s, reg, ANN, 'feet', 70); // level 2
    const host = draw(s);
    expect(host.querySelector('g.alius-bm-zone[data-target="feet"] .alius-bm-dots')!.textContent).toBe('●●○○○');
    const row = host.querySelector('.alius-bm-row[data-target="feet"] .alius-bm-dots')!;
    expect(row.getAttribute('aria-label')).toBe('Mastery: two of five');
    expect(host.textContent).not.toMatch(/\d/);
  });

  it('scent shows as rings from noticeable up', () => {
    const s = world();
    const zones = bodyMapZones(s, reg, knowledge(s), ANN);
    expect(zones.every((z) => typeof z.scent === 'number' && z.scent >= 0 && z.scent <= 3)).toBe(true);
    const strong = zones.map((z) => (z.targetId === 'feet' ? { ...z, scent: 3 } : { ...z, scent: 0 }));
    const host = draw(s, { zones: strong });
    expect(host.querySelectorAll('g.alius-bm-zone[data-target="feet"] .alius-bm-scent')).toHaveLength(3);
    expect(host.querySelectorAll('g.alius-bm-zone[data-target="toes"] .alius-bm-scent')).toHaveLength(0);
    expect(host.querySelector('.alius-bm-row[data-target="feet"]')!.textContent).toContain('SCENT: OVERWHELMING');
  });
});

describe('the silhouette', () => {
  /** The x of the outline's anchor point on a row (the right half): the largest x among the path's points at that y. */
  const xAt = (d: string, y: number): number => {
    const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].filter((m) => Math.abs(Number(m[2]) - y) < 0.01).map((m) => Number(m[1]));
    return Math.max(...xs);
  };

  it('builds blend: slim and curvy differ and a half-and-half one lies between them (x at y = 272)', () => {
    const slim = xAt(outlinePath({ slim: 1, athletic: 0, curvy: 0 }, 'front'), 272);
    const curvy = xAt(outlinePath({ slim: 0, athletic: 0, curvy: 1 }, 'front'), 272);
    const half = xAt(outlinePath({ slim: 0.5, athletic: 0, curvy: 0.5 }, 'front'), 272);
    expect(slim).toBe(50);
    expect(curvy).toBeGreaterThan(slim);
    expect(outlinePath({ slim: 1, athletic: 0, curvy: 0 }, 'front')).not.toBe(outlinePath({ slim: 0, athletic: 0, curvy: 1 }, 'front'));
    expect(half).toBeGreaterThan(slim);
    expect(half).toBeLessThan(curvy);
    expect(half).toBeCloseTo((slim + curvy) / 2, 6);
    // weights are a blend, not a sum: only their proportions count; nothing at all reads as slim
    expect(outlinePath({ slim: 2, athletic: 0, curvy: 2 }, 'front')).toBe(outlinePath({ slim: 0.5, athletic: 0, curvy: 0.5 }, 'front'));
    expect(outlinePath({ slim: 0, athletic: 0, curvy: 0 }, 'back')).toBe(outlinePath({ slim: 1, athletic: 0, curvy: 0 }, 'back'));
  });

  it('four hair variants differ, front and back', () => {
    const kinds = ['short', 'bob', 'long', 'tail'] as const;
    for (const side of ['front', 'back'] as const) expect(new Set(kinds.map((k) => hairPath(k, side))).size, side).toBe(4);
    for (const d of kinds.map((k) => hairPath(k, 'back'))) expect(d).toMatch(/^M/);
  });

  it('the figure follows her build and hair', () => {
    const host = draw(world());
    expect(host.querySelectorAll('svg.alius-bm-svg')).toHaveLength(1);
    expect(host.querySelectorAll('.alius-bm-figure')).toHaveLength(2);
    const athletic = host.querySelector('.alius-bm-figure .alius-bm-outline path')!.getAttribute('d');
    const slim = draw(world(), { build: { slim: 1, athletic: 0, curvy: 0 } }).querySelector('.alius-bm-figure .alius-bm-outline path')!.getAttribute('d');
    expect(athletic).not.toBe(slim);
  });
});

describe('readable mode, analysis and assets', () => {
  it('readable mode draws only the list', () => {
    const s = world(['restraint', 'worship'], ['feet']);
    const host = draw(s, { readable: true });
    expect(host.querySelector('svg')).toBeNull();
    expect(host.querySelector('g.alius-bm-zone')).toBeNull();
    const rows = [...host.querySelectorAll('.alius-bm-row')].map((r) => r.getAttribute('data-target'));
    expect(rows).toContain('feet');
    expect(rows).toContain('toes');
    expect(host.querySelector('.alius-bm-row[data-target="feet"]')!.textContent).toContain('CRAVES');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('every zone carries data-analyze worshipTargets:<id> and resolves', () => {
    const s = world(['restraint', 'worship', 'explicit_scenes'], ['feet']);
    const host = draw(s);
    const zones = [...host.querySelectorAll<SVGGElement>('g.alius-bm-zone')];
    expect(zones.length).toBeGreaterThan(10);
    for (const z of zones) {
      expect(z.getAttribute('data-analyze')).toBe(`worshipTargets:${z.getAttribute('data-target')}`);
      expect(JSON.parse(z.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN });
      expect(z.getAttribute('aria-label')).toBeTruthy();
    }
    for (const row of host.querySelectorAll('.alius-bm-row')) expect(row.getAttribute('data-analyze')).toBe(`worshipTargets:${row.getAttribute('data-target')}`);
    expect(host.querySelector('.alius-bodymap')!.getAttribute('data-analyze')).toBe('glossary:body_map'); // the map as a whole
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('says nothing of the commander: no number, no raw id, no pronoun', () => {
    const host = draw(world(['restraint', 'worship', 'explicit_scenes'], ['feet']));
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(host.textContent).not.toMatch(/_/);
    expect(host.textContent).not.toMatch(/\d/);
  });

  it('no url( and no network: neither the markup nor the style of the map', () => {
    const host = draw(world(['restraint', 'worship', 'explicit_scenes'], ['feet']));
    expect(host.innerHTML).not.toMatch(/url\(/);
    expect(host.innerHTML).not.toMatch(/https?:|\/\/|<image|<use|xlink:href|<style/i);
    const source = readFileSync('css/19-dynamic.css', 'utf8');
    const block = source.slice(source.indexOf('/* The body map'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/url\(/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // palette variables only
    const built = readFileSync('style.css', 'utf8');
    expect(built).not.toMatch(/url\(\s*['"]?(https?:)?\/\//); // the rule of tests/assets.test.ts
  });
});
