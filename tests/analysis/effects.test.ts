import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  entryEffects, summarizeActivityEffect, summarizeCombatEffect, summarizeWorldEffect,
} from '../../src/analysis/effects';
import { buildPanelModel } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import { loadPacks } from '../../src/content/loader';
import { emptyRegistries, type Entry, type RegistryName, type Registries } from '../../src/content/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { CombatEffect } from '../../src/content/schemas';

const reg = emptyRegistries();
const fx = (e: Record<string, unknown>) => summarizeCombatEffect(e as unknown as CombatEffect, reg);

describe('combat effect summaries', () => {
  it('+20% ATK at Stress ≥ 50 (trigger form and when form)', () => {
    expect(fx({ type: 'stat', stat: 'atk', pct: 20, trigger: 'onStressThreshold', threshold: 50 })).toBe('+20% ATK at Stress ≥ 50');
    expect(fx({ type: 'stat', stat: 'atk', pct: 20, when: { stressMin: 50 } })).toBe('+20% ATK at Stress ≥ 50');
    // the trigger already said it: no second mention
    expect(fx({ type: 'stat', stat: 'atk', pct: 20, trigger: 'onStressThreshold', threshold: 50, when: { stressMin: 50 } })).toBe('+20% ATK at Stress ≥ 50');
    expect(fx({ type: 'stat', stat: 'all', pct: -10 })).toBe('−10% all stats');
  });

  it('status links its id', () => {
    expect(fx({ type: 'status', statusId: 'bleed', turns: 2 })).toBe('Apply [[statuses:bleed]] (2 turns)');
    expect(fx({ type: 'status', statusId: 'bleed', stacks: 2, target: 'enemies' })).toBe('Apply [[statuses:bleed]] ×2 — enemies');
  });

  it('downside and chance', () => {
    expect(fx({ type: 'order_refusal', chance: 0.15, downside: true })).toBe('Downside: May refuse orders (15% chance)');
    expect(fx({ type: 'misfire', chance: 0.1, limit: 'combat' })).toBe('May misfire (10% chance) (once per combat)');
  });

  it('covers the rest of the vocabulary with the specified phrases', () => {
    expect(fx({ type: 'damage', mult: 1.5, hits: 2, ignoreRows: true, critBonus: 10 })).toBe('Damage ×1.5 ×2 hits ignores rows +10% crit');
    expect(fx({ type: 'damage', pctMaxHp: 12 })).toBe('Damage 12% max HP');
    expect(fx({ type: 'heal', pctMaxHp: 20, target: 'allies' })).toBe('Heal 20% max HP — allies');
    expect(fx({ type: 'revive', pctMaxHp: 30 })).toBe('Revive at 30% HP');
    expect(fx({ type: 'cleanse', kind: 'debuff', count: 2 })).toBe('Remove 2 debuffs');
    expect(fx({ type: 'outgoing', pct: 15, vs: 'marked' })).toBe('+15% damage dealt vs marked');
    expect(fx({ type: 'incoming', pct: -10 })).toBe('−10% damage taken');
    expect(fx({ type: 'stress', amount: 5 })).toBe('+5 Stress');
    expect(fx({ type: 'stress_taken', pct: -25, direction: 'gain' })).toBe('−25% stress gained');
    expect(fx({ type: 'stress_taken', pct: 50, direction: 'relief' })).toBe('+50% stress relief');
    expect(fx({ type: 'cp', amount: 1, trigger: 'onCombatStart' })).toBe('+1 CP at combat start');
    expect(fx({ type: 'move', to: 'swap' })).toBe('Swap rows');
    expect(fx({ type: 'move', to: 'front' })).toBe('Move to front');
    expect(fx({ type: 'extra_action', trigger: 'onKill' })).toBe('Extra action on kill');
    expect(fx({ type: 'redirect', pct: 50, turns: 2, from: 'commander' })).toBe('Takes 50% of hits aimed at the commander (2 turns)');
    expect(fx({ type: 'intercept_lethal', protect: 'ally' })).toBe('Takes a lethal hit for an ally');
    expect(fx({ type: 'summon', enemyId: 'drone', max: 2 })).toBe('Summons [[enemies:drone]] (max 2)');
    expect(fx({ type: 'follow_up', mult: 0.5, trigger: 'onAllyDowned' })).toBe('Follow-up ×0.5 when an ally falls');
    expect(fx({ type: 'override_action', policy: 'aggressive' })).toBe('Attacks on her own');
    expect(fx({ type: 'lock_target', turns: 2 })).toBe('Locks on (2 turns)');
    expect(fx({ type: 'loot_roll', extra: 1 })).toBe('+1 loot roll');
    expect(fx({ type: 'repeat_order' })).toBe('Repeats the last order');
    expect(fx({ type: 'hp_set', value: 1 })).toBe('HP set to 1');
    expect(fx({ type: 'immune', statusId: 'stun' })).toBe('Immune to [[statuses:stun]]');
    expect(fx({ type: 'order_cost', delta: -1, orders: ['o1'] })).toBe('Orders −1 CP ([[orders:o1]])');
    expect(fx({ type: 'loadout_slots', amount: 1 })).toBe('+1 loadout slot');
    expect(fx({ type: 'injury_days', pct: -30 })).toBe('−30% injury time');
    expect(fx({ type: 'stat', stat: 'def', pct: 10, when: { hpBelowPct: 50, aloneInRow: true } })).toBe('+10% DEF below 50% HP alone in row');
  });

  it('an unknown type is humanized', () => {
    expect(fx({ type: 'weird_new_thing' })).toBe('Weird new thing');
    expect(fx({})).not.toMatch(/undefined|\[object/);
    expect(summarizeWorldEffect({ type: 'future_effect' } as never, reg)).toBe('Future effect');
    expect(summarizeActivityEffect({ type: 'future_effect' } as never, reg)).toBe('Future effect');
  });
});

describe('world and activity effect summaries', () => {
  const world = emptyRegistries();
  world.clocks.set('seen', { id: 'seen', label: 'Bloom spread', visibleToPlayer: true });
  world.clocks.set('hidden', { id: 'hidden', label: 'SENTINEL secret plan', visibleToPlayer: false });

  it('−15 Credits for a world resource', () => {
    expect(summarizeWorldEffect({ type: 'resource', resource: 'credits', amount: -15 }, world)).toBe('−15 Credits');
    expect(summarizeWorldEffect({ type: 'resource', resource: 'plyx', amount: 4 }, world)).toBe('+4 Plyx');
    expect(summarizeWorldEffect({ type: 'faction', factionId: 'vesper', amount: 5 }, world)).toBe('+5 standing with [[corporations:vesper]]');
    expect(summarizeWorldEffect({ type: 'party_stress', amount: 8 }, world)).toBe('+8 Stress to the party');
    expect(summarizeWorldEffect({ type: 'party_hp', pct: -20 }, world)).toBe('−20% HP to the party');
    expect(summarizeWorldEffect({ type: 'leash', amount: -1 }, world)).toBe('−1 Leash authorization');
  });

  it('a hidden clock reads as an unseen threat', () => {
    expect(summarizeWorldEffect({ type: 'clock', clockId: 'seen', by: 1 }, world)).toBe('Bloom spread +1');
    const up = summarizeWorldEffect({ type: 'clock', clockId: 'hidden', by: 1 }, world);
    const down = summarizeWorldEffect({ type: 'clock', clockId: 'hidden', by: -1 }, world);
    expect(up).toBe('An unseen threat advances');
    expect(down).toBe('An unseen threat recedes');
    expect(up).not.toContain('SENTINEL');
    expect(summarizeWorldEffect({ type: 'clock', clockId: 'gone', by: 1 }, world)).toBe('An unseen threat advances');
  });

  it('flags, threads and facts give no line', () => {
    for (const e of [
      { type: 'flag', flagId: 'x' }, { type: 'thread', threadId: 't', status: 'open' },
      { type: 'thread_flag', threadId: 't', flagId: 'thread:t:a', description: 'd' },
      { type: 'fact', text: 't', tags: [], importance: 1 },
    ]) expect(summarizeWorldEffect(e as never, world), e.type).toBeNull();
  });

  it('Companion −10 Stress', () => {
    expect(summarizeActivityEffect({ type: 'unit_stress', target: 'companion', amount: -10 }, reg)).toBe('Companion −10 Stress');
    expect(summarizeActivityEffect({ type: 'unit_xp', target: 'selected', amount: 15, when: { focus: 'units' } }, reg, [{ id: 'units', label: 'Drill the squad' }]))
      .toBe('Chosen units +15 XP (focus: Drill the squad)');
    expect(summarizeActivityEffect({ type: 'resource', resource: 'credits', amount: 20, perStat: { stat: 'cunning', per: 5 }, scale: { facility: 'workshop', key: 'x' } }, reg))
      .toBe('+20 Credits +5 per Cunning rank (more with [[facilities:workshop]])');
    expect(summarizeActivityEffect({ type: 'relation', axis: 'trust', amount: 2, when: { companionLikes: 'quiet' } }, reg)).toBe('Companion +2 Trust (if she likes quiet)');
    expect(summarizeActivityEffect({ type: 'commander_stat', stat: 'empathy', amount: 1 }, reg)).toBe('+1 Empathy');
    expect(summarizeActivityEffect({ type: 'defect_upkeep', target: 'selected' }, reg)).toBe('Chosen units: defect upkeep');
    expect(summarizeActivityEffect({ type: 'emit_event', event: 'scene_requested' }, reg)).toBeNull();
  });
});

describe('entryEffects per registry', () => {
  const r = emptyRegistries();
  const put = (name: RegistryName, e: Entry) => r[name].set(e.id, e);
  put('skills', { id: 'sk', name: 'S', cooldown: 2, cp: 1, stressCost: 3, effects: [{ type: 'damage', mult: 2 }] });
  put('statuses', { id: 'st', name: 'T', turns: 3, maxStacks: 2, mods: { atk: -10 }, incomingPct: 15, tick: [{ type: 'stress', amount: 2, target: 'self' }], flags: ['skipTurn'] });
  put('items', { id: 'it', name: 'I', baseStats: { atk: 4, def: 2 }, effects: [{ type: 'cp', amount: 1, trigger: 'onCombatStart' }] });
  put('affixes', { id: 'af', name: 'A', statPct: { hp: 10 }, effects: [], drawback: true });
  put('orders', { id: 'or', name: 'O', cost: 2, effects: [{ type: 'extra_action' }] });
  put('defects', { id: 'df', name: 'D', breakdown: { name: 'Shutdown', text: 't' }, combat: {
    upside: [{ type: 'stat', stat: 'atk', pct: 20, trigger: 'onStressThreshold', threshold: 50 }],
    downside: [{ type: 'order_refusal', chance: 0.15, downside: true }],
  } });
  put('activities', { id: 'ac', name: 'A', cost: { credits: 10 }, effects: [{ type: 'unit_xp', target: 'selected', amount: 5 }], companionEffects: [{ type: 'relation', axis: 'trust', amount: 1 }] });
  put('facilities', { id: 'fa', name: 'F', levels: [{ effects: { rosterCapacity: 6, restPct: 0 } }, { effects: { rosterCapacity: 7, restPct: 20 } }] });
  put('crimes', { id: 'cr', name: 'C', perk: { text: 'Good.' }, flaw: { text: 'Bad.' } });
  put('corporations', { id: 'co', name: 'K', startingBonus: { text: 'Cash.' }, leash: { weekly: 3, approval: 0.5 } });
  put('nodeTypes', { id: 'rest', name: 'R', kind: 'rest', rest: { suppliesPerUnit: 1, hpPct: 25, stress: -15 } });
  put('nodeTypes', { id: 'elite', name: 'E', kind: 'combat', combat: { dangerDelta: 1, lootTableId: 'l' } });
  put('enemies', { id: 'en', name: 'E', skills: ['a', 'b'] });
  put('signatures', { id: 'sig_x', name: 'X', skill: 'sk' });
  put('relationshipStates', { id: 'friend', name: 'F', unlocks: { synergies: ['syn_a'] }, modifiers: { gain: { trust: 1.2 }, loss: { affinity: 0.5 } } });

  const lines = (name: RegistryName, id: string) => entryEffects(name, r[name].get(id)!, r);

  it('skills, statuses, items, affixes, orders', () => {
    expect(lines('skills', 'sk')).toEqual(['Cooldown 2 · 1 CP · 3 Stress', 'Damage ×2']);
    expect(lines('statuses', 'st')).toEqual([
      '−10% ATK per stack', '+15% damage taken', 'Each turn: +2 Stress', 'Skip turn', 'Lasts 3 turns, up to 2 stacks',
    ]);
    expect(lines('items', 'it')).toEqual(['+4 ATK', '+2 DEF', '+1 CP at combat start']);
    expect(lines('affixes', 'af')).toEqual(['+10% HP', 'Drawback']);
    expect(lines('orders', 'or')).toEqual(['Costs 2 CP', 'Extra action']);
  });

  it('defects keep their downside flag and name the breakdown', () => {
    expect(lines('defects', 'df')).toEqual([
      '+20% ATK at Stress ≥ 50', 'Downside: May refuse orders (15% chance)', 'Breakdown: Shutdown',
    ]);
  });

  it('activities, facilities, crimes, corporations', () => {
    expect(lines('activities', 'ac')).toEqual(['Costs 10 credits', 'Chosen units +5 XP', 'With a companion: Companion +1 Trust']);
    expect(lines('facilities', 'fa')).toEqual(['Level 1: beds 6, rest 0%', 'Level 2: beds 7, rest 20%']);
    expect(lines('crimes', 'cr')).toEqual(['Perk: Good.', 'Flaw: Bad.']);
    expect(lines('corporations', 'co')).toEqual(['Starting bonus: Cash.', 'Oversight: 3 authorizations a week']);
  });

  it('node types, enemies, signatures, relationship states', () => {
    expect(lines('nodeTypes', 'rest')).toEqual(['Costs 1 supplies per unit · 25% HP · −15 Stress']);
    expect(lines('nodeTypes', 'elite')).toEqual(['Danger +1']);
    expect(lines('enemies', 'en')).toEqual(['Skills: [[skills:a]], [[skills:b]]']);
    expect(lines('signatures', 'sig_x')).toEqual(['[[skills:sk]]']);
    expect(lines('relationshipStates', 'friend')).toEqual(['Unlocks: [[synergies:syn_a]]', 'Trust gains ×1.2', 'Affinity losses ×0.5']);
  });

  it('facility lines list every level', () => {
    expect(lines('facilities', 'fa')).toHaveLength(2);
  });

  it('registries without effects, and broken entries, give no lines and never throw', () => {
    expect(entryEffects('regions', { id: 'x', name: 'X' }, r)).toEqual([]);
    expect(entryEffects('glossary', { id: 'x', term: 'X', short: 's' }, r)).toEqual([]);
    for (const name of ['skills', 'statuses', 'items', 'affixes', 'defects', 'facilities', 'activities', 'nodeTypes', 'relationshipStates'] as RegistryName[]) {
      expect(() => entryEffects(name, { id: 'junk', effects: 'nope', combat: 5, levels: 3, mods: null, tick: {}, rest: 'x', unlocks: 1, modifiers: 2 }, r), name).not.toThrow();
    }
  });

  it('the panel model carries the effects of its entry', () => {
    const m = buildPanelModel(parseSubject('skills:sk')!, { registries: r, state: null, settings: DEFAULT_SETTINGS });
    expect(m.effects).toEqual(['Cooldown 2 · 1 CP · 3 Stress', 'Damage ×2']);
  });
});

describe('the core pack', () => {
  it('every effect in the core pack summarizes to a non-empty line without "undefined" or "[object"', async () => {
    const { registries, errors } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    expect(errors).toEqual([]);
    let checked = 0;
    for (const name of Object.keys(registries) as RegistryName[]) {
      for (const entry of (registries as Registries)[name].values()) {
        for (const line of entryEffects(name, entry, registries)) {
          checked++;
          expect(line.trim().length, `${name}:${entry.id}`).toBeGreaterThan(0);
          expect(line, `${name}:${entry.id}`).not.toMatch(/undefined|\[object|NaN/);
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe('scaled and timed effects (final review)', () => {
  it('a scale is spelled out instead of reading as ±0%', () => {
    expect(fx({ type: 'stat', stat: 'atk', pct: 0, scale: { by: 'stress_above', per: 1, base: 30 } })).toBe('+1% ATK per Stress above 30');
    expect(fx({ type: 'outgoing', pct: 0, scale: { by: 'own_hp_missing_pct', per: 0.5 } })).toBe('+0.5% damage dealt per 1% HP missing');
    expect(fx({ type: 'stat', stat: 'atk', pct: 10, scale: { by: 'own_hp_missing_pct', per: 0.3 } })).toBe('+10% ATK, +0.3% per 1% HP missing');
    expect(fx({ type: 'damage', mult: 0.8, scale: { by: 'allies_hp_missing_pct', per: 0.02 } })).toBe("Damage ×0.8, +×0.02 per 1% allies' HP missing");
    expect(fx({ type: 'stat', stat: 'atk', pct: 10, scale: { by: 'stress_above', per: 1 } })).toBe('+10% ATK, +1% per Stress above 0');
  });

  it('a stat effect with a duration says so, and an ally scope says whose hit it is', () => {
    expect(fx({ type: 'stat', stat: 'spd', pct: 20, turns: 2 })).toBe('+20% SPD (2 turns)');
    expect(fx({ type: 'stat', stat: 'spd', pct: 20, turns: 1 })).toBe('+20% SPD (1 turn)');
    expect(fx({ type: 'follow_up', mult: 0.5, trigger: 'onHit', scope: 'ally' })).toBe('Follow-up ×0.5 when an ally hits');
    expect(fx({ type: 'follow_up', mult: 0.5, trigger: 'onKill', scope: 'ally' })).toBe('Follow-up ×0.5 when an ally kills');
    expect(fx({ type: 'follow_up', mult: 0.5, trigger: 'onCrit', scope: 'ally' })).toBe('Follow-up ×0.5 when an ally crits');
  });

  it('no generated line in the core pack reads as a zero change', async () => {
    const { registries } = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    const zero: string[] = [];
    for (const name of Object.keys(registries) as RegistryName[]) {
      for (const entry of (registries as Registries)[name].values()) {
        for (const line of entryEffects(name, entry, registries)) if (/±0/.test(line)) zero.push(`${name}:${entry.id} ${line}`);
      }
    }
    expect(zero).toEqual([]);
  });
});

describe('node types', () => {
  it('a plain combat node says nothing about danger, a tougher one does', () => {
    const r = emptyRegistries();
    expect(entryEffects('nodeTypes', { id: 'combat', combat: { dangerDelta: 0, lootTableId: 'l' } }, r)).toEqual([]);
    expect(entryEffects('nodeTypes', { id: 'elite', combat: { dangerDelta: 1, lootTableId: 'l' } }, r)).toEqual(['Danger +1']);
    expect(entryEffects('nodeTypes', { id: 'easy', combat: { dangerDelta: -1, lootTableId: 'l' } }, r)).toEqual(['Danger −1']);
  });
});
