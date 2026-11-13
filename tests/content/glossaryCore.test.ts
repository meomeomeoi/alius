import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { missingDescriptions, settingGlossaryId } from '../../src/analysis/describe';
import { CORE_GLOSSARY_IDS } from '../../src/analysis/providers/core';
import { loadPacks } from '../../src/content/loader';
import { linkTargets } from '../../src/content/links';
import type { Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

describe('core glossary and descriptions', () => {
  it('missingDescriptions is empty for the core pack', () => {
    expect(missingDescriptions(reg)).toEqual([]);
  });

  it('every glossary id the code addresses exists', () => {
    const wanted = [...CORE_GLOSSARY_IDS, ...Object.keys(DEFAULT_SETTINGS).map(settingGlossaryId), settingGlossaryId('difficulty')];
    expect(wanted.filter((id) => !reg.glossary.has(id))).toEqual([]);
    expect(new Set(CORE_GLOSSARY_IDS).size).toBe(CORE_GLOSSARY_IDS.length);
  });

  it('there are at least 30 concept entries, and no entry that nothing addresses', () => {
    const concepts = [...reg.glossary.keys()].filter((id) => !id.startsWith('setting_'));
    expect(concepts.length).toBeGreaterThanOrEqual(30);
    expect([...concepts].sort()).toEqual([...CORE_GLOSSARY_IDS].sort());
    const settings = [...reg.glossary.keys()].filter((id) => id.startsWith('setting_'));
    expect(settings.sort()).toEqual([...Object.keys(DEFAULT_SETTINGS), 'difficulty'].map(settingGlossaryId).sort());
  });

  it('every glossary entry has a term and a short text, concepts about numbers carry a long text', () => {
    for (const e of reg.glossary.values()) {
      expect(String(e.term).length, e.id).toBeGreaterThan(0);
      expect(String(e.short).length, e.id).toBeGreaterThan(0);
    }
    for (const id of ['trust', 'affinity', 'stress', 'stat_hp', 'stat_atk', 'stat_def', 'stat_spd']) {
      expect(typeof reg.glossary.get(id)!.long, id).toBe('string');
    }
  });

  it('every eventDelta has a cause', () => {
    expect(reg.eventDeltas.size).toBeGreaterThan(20);
    for (const e of reg.eventDeltas.values()) {
      expect(typeof e.cause, e.id).toBe('string');
      expect((e.cause as string).length, e.id).toBeGreaterThan(0);
    }
  });

  it('no glossary or description text contains raw HTML', () => {
    const html = /<\/?[a-z!][^>]*>|&[a-z]+;/i;
    for (const [name, map] of Object.entries(reg)) {
      for (const e of map.values()) {
        for (const field of ['term', 'short', 'long', 'description', 'cause']) {
          const v = e[field];
          if (typeof v === 'string') expect(v, `${name}:${e.id}.${field}`).not.toMatch(html);
        }
      }
    }
  });

  it('every setting-link in the text points at a setting that has an entry', () => {
    const settingKeys = new Set([...Object.keys(DEFAULT_SETTINGS), 'difficulty']);
    for (const e of reg.glossary.values()) {
      for (const field of ['short', 'long']) {
        for (const target of linkTargets(String(e[field] ?? ''))) {
          if (target.startsWith('setting:')) expect(settingKeys.has(target.slice(8)), `${e.id}: ${target}`).toBe(true);
        }
      }
    }
  });

  it('the descriptions the plan names are all there', () => {
    for (const name of ['items', 'affixes', 'enemies', 'nodeTypes', 'relationshipStates'] as const) {
      expect(reg[name].size, name).toBeGreaterThan(0);
      for (const e of reg[name].values()) expect(typeof e.description, `${name}:${e.id}`).toBe('string');
    }
  });
});
