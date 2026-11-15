import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { WorldOptionEffectSchema } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { TUNING } from '../../src/engine/tuning';
import { estTokens } from '../../src/llm/text';
import { worldSettingsLine } from '../../src/world/optionsContext';
import { campaign } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
type Choice = { id: string; lore?: string; effects: Array<Record<string, unknown>> };
const choices = (id: string) => reg.worldOptions.get(id)!.choices as Choice[];

describe('world options of P9b', () => {
  it('squad_assertiveness has low/normal/high with one squad_power effect each', () => {
    const o = reg.worldOptions.get('squad_assertiveness')!;
    expect(o.group).toBe('Soldiers');
    expect(o.live).toBe(false);
    expect(o.default).toBe('normal');
    expect(choices('squad_assertiveness').map((c) => c.id)).toEqual(['low', 'normal', 'high']);
    for (const c of choices('squad_assertiveness')) {
      expect(c.effects).toHaveLength(1);
      expect(c.effects[0].type).toBe('squad_power');
    }
    const by = Object.fromEntries(choices('squad_assertiveness').map((c) => [c.id, c.effects[0]]));
    expect(by.high.commanderVoteMult).toBe(0.75);
    expect(by.normal).toMatchObject({ privilegeMult: 1, demandMult: 1, commanderVoteMult: 1 });
  });

  it('only low and high carry a lore line, each at most 70 characters', () => {
    const lore = Object.fromEntries(choices('squad_assertiveness').map((c) => [c.id, c.lore]));
    expect(lore.normal).toBeUndefined();
    for (const id of ['low', 'high']) {
      expect(lore[id], id).toBeTruthy();
      expect(lore[id]!.length).toBeLessThanOrEqual(70);
    }
  });

  it('voting defaults to off and its on choice carries a voting effect', () => {
    const o = reg.worldOptions.get('voting')!;
    expect(o.group).toBe('Soldiers');
    expect(o.live).toBe(false);
    expect(o.default).toBe('off');
    const by = Object.fromEntries(choices('voting').map((c) => [c.id, c]));
    expect(by.on.effects).toEqual([{ type: 'voting' }]);
    expect(by.on.lore).toBeTruthy();
    expect(by.off.effects).toEqual([]);
    expect(by.off.lore).toBeUndefined();
  });

  it('the effect schemas bound their numbers', () => {
    const ok = { type: 'squad_power', privilegeMult: 1, demandMult: 1, commanderVoteMult: 1 };
    expect(WorldOptionEffectSchema.safeParse(ok).success).toBe(true);
    expect(WorldOptionEffectSchema.safeParse({ ...ok, privilegeMult: 3.1 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ ...ok, privilegeMult: 0.2 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ ...ok, commanderVoteMult: 2.1 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ ...ok, demandMult: 0.2 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ type: 'voting' }).success).toBe(true);
    expect(WorldOptionEffectSchema.safeParse({ type: 'voting', x: 1 }).success).toBe(false);
  });

  it('every preset names both new options; assertive_squad sets high and on', () => {
    expect([...reg.worldPresets.keys()].sort()).toEqual(['assertive_squad', 'brutal', 'gentle', 'standard']);
    for (const p of reg.worldPresets.values()) {
      const c = p.choices as Record<string, string>;
      expect(c.squad_assertiveness, p.id).toBeTruthy();
      expect(c.voting, p.id).toBeTruthy();
    }
    const get = (id: string) => reg.worldPresets.get(id)!.choices as Record<string, string>;
    for (const id of ['gentle', 'standard', 'brutal']) expect(get(id)).toMatchObject({ squad_assertiveness: 'normal', voting: 'off' });
    expect(get('assertive_squad')).toEqual({ ...get('standard'), squad_assertiveness: 'high', voting: 'on' });
    expect(reg.worldPresets.get('assertive_squad')!.name).toBe('Assertive squad');
  });

  it('the WORLD SETTINGS block of every preset fits 120 tokens and drops no lore line', () => {
    for (const p of reg.worldPresets.values()) {
      const s = campaign(reg, 2);
      s.world.options = { ...(p.choices as Record<string, string>) };
      const line = worldSettingsLine(s, reg);
      expect(estTokens(line), p.id).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
      for (const [optionId, choiceId] of Object.entries(p.choices as Record<string, string>)) {
        const lore = (reg.worldOptions.get(optionId)!.choices as Choice[]).find((c) => c.id === choiceId)!.lore;
        if (lore !== undefined) expect(line, `${p.id}: ${optionId}`).toContain(lore);
      }
    }
  });

  it('every choice of the two new options still fits next to the longest line of each other option', () => {
    const longest = (id: string) => choices(id).reduce((a, c) => ((c.lore ?? '').length > a.length ? (c.lore ?? '') : a), '');
    const all = [...reg.worldOptions.keys()].map(longest).filter((l) => l !== '');
    expect(estTokens(`World settings: ${all.join(' ')}`)).toBeLessThanOrEqual(TUNING.disposition.worldBlockTokens);
  });
});
