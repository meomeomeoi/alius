import type { ActivityEffect, CombatEffect } from '../content/schemas';
import type { Entry, Registries, RegistryName } from '../content/types';
import type { WorldEffect } from '../engine/world/types';

/**
 * Plain-English lines generated from structured effects (P7a §3). Lines may carry `[[links]]`.
 * Nothing here throws on odd content: an unknown effect type falls back to its humanized name.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const MINUS = '−';

/** `snake_case` / `camelCase` → lower-case words. */
export function humanize(key: string): string {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
}
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

const num = (n: number): string => String(Math.round(n * 100) / 100);
const abs = (n: number): string => num(Math.abs(n));
/** `+5`, `−5` (U+2212), `±0`. */
export const signed = (n: number): string => (n > 0 ? `+${num(n)}` : n < 0 ? `${MINUS}${abs(n)}` : '±0');
const pctSigned = (n: number): string => `${signed(n)}%`;
const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------------------------
// combat

const TRIGGER_SUFFIX: Record<string, string> = {
  onHit: ' on hit',
  onCrit: ' on crit',
  onKill: ' on kill',
  onDamaged: ' when hit',
  onAllyDowned: ' when an ally falls',
  onTurnStart: ' each turn',
  onRoundStart: ' each round',
  onCombatStart: ' at combat start',
  onCombatEnd: ' after combat',
  onAction: ' on action',
};

function combatBase(e: Loose): string {
  switch (e.type) {
    case 'damage': {
      let s = isNum(e.pctMaxHp) ? `Damage ${num(e.pctMaxHp)}% max HP` : `Damage ×${num(Number(e.mult ?? 1))}`;
      if (isNum(e.hits) && e.hits > 1) s += ` ×${e.hits} hits`;
      if (e.ignoreRows) s += ' ignores rows';
      if (isNum(e.critBonus)) s += ` +${num(e.critBonus)}% crit`;
      return s;
    }
    case 'heal': return `Heal ${num(Number(e.pctMaxHp))}% max HP`;
    case 'revive': return `Revive at ${num(Number(e.pctMaxHp))}% HP`;
    case 'status': {
      let s = `Apply [[statuses:${e.statusId}]]`;
      if (isNum(e.turns)) s += ` (${e.turns} ${plural(e.turns, 'turn')})`;
      if (isNum(e.stacks)) s += ` ×${e.stacks}`;
      return s;
    }
    case 'cleanse': return `Remove ${e.count} ${e.kind}${Number(e.count) === 1 ? '' : 's'}`;
    case 'stat': return `${pctSigned(Number(e.pct))} ${e.stat === 'all' ? 'all stats' : String(e.stat).toUpperCase()}`;
    case 'outgoing': return `${pctSigned(Number(e.pct))} damage dealt${e.vs && e.vs !== 'any' ? ` vs ${e.vs}` : ''}`;
    case 'incoming': return `${pctSigned(Number(e.pct))} damage taken`;
    case 'stress': return `${signed(Number(e.amount))} Stress`;
    case 'stress_taken': return `${pctSigned(Number(e.pct))} stress ${e.direction === 'relief' ? 'relief' : 'gained'}`;
    case 'cp': return `${signed(Number(e.amount))} CP`;
    case 'move': return e.to === 'swap' ? 'Swap rows' : `Move to ${e.to}`;
    case 'extra_action': return 'Extra action';
    case 'redirect': return `Takes ${num(Number(e.pct))}% of hits aimed at ${e.from === 'commander' ? 'the commander' : 'an ally'} (${e.turns} ${plural(Number(e.turns), 'turn')})`;
    case 'intercept_lethal': return `Takes a lethal hit for ${e.protect === 'commander' ? 'the commander' : 'an ally'}`;
    case 'summon': return `Summons [[enemies:${e.enemyId}]] (max ${e.max})`;
    case 'follow_up': return `Follow-up ×${num(Number(e.mult))}`;
    case 'misfire': return 'May misfire';
    case 'override_action': return 'Attacks on her own';
    case 'lock_target': return `Locks on (${e.turns} ${plural(Number(e.turns), 'turn')})`;
    case 'loot_roll': return `+${e.extra} loot ${plural(Number(e.extra), 'roll')}`;
    case 'repeat_order': return 'Repeats the last order';
    case 'hp_set': return `HP set to ${e.value}`;
    case 'immune': return `Immune to [[statuses:${e.statusId}]]`;
    case 'order_cost': {
      const orders = Array.isArray(e.orders) && e.orders.length ? ` (${e.orders.map((o: string) => `[[orders:${o}]]`).join(', ')})` : '';
      return `Orders ${signed(Number(e.delta))} CP${orders}`;
    }
    case 'order_refusal': return 'May refuse orders';
    case 'loadout_slots': return `+${e.amount} loadout ${plural(Number(e.amount), 'slot')}`;
    case 'injury_days': return `${pctSigned(Number(e.pct))} injury time`;
    default: return cap(humanize(String(e.type ?? 'effect')));
  }
}

function whenSuffix(e: Loose): string {
  const when = e.when as Loose | undefined;
  if (!when || typeof when !== 'object') return '';
  let s = '';
  for (const [key, value] of Object.entries(when)) {
    if (key === 'stressMin') {
      if (e.trigger !== 'onStressThreshold') s += ` at Stress ≥ ${value}`;
    } else if (key === 'hpBelowPct') s += ` below ${value}% HP`;
    else if (value === true) s += ` ${humanize(key)}`;
    else if (value === false) s += ` not ${humanize(key)}`;
    else s += ` ${humanize(key)} ${value}`;
  }
  return s;
}

export function summarizeCombatEffect(effect: CombatEffect, _reg: Registries): string {
  const e = (effect ?? {}) as unknown as Loose;
  let s = combatBase(e);
  if (e.target && e.target !== 'self' && e.target !== 'target') s += ` — ${humanize(String(e.target))}`;
  if (e.trigger === 'onStressThreshold') s += ` at Stress ≥ ${e.threshold}`;
  else if (typeof e.trigger === 'string' && TRIGGER_SUFFIX[e.trigger]) s += TRIGGER_SUFFIX[e.trigger];
  s += whenSuffix(e);
  if (isNum(e.chance)) s += ` (${Math.round(e.chance * 100)}% chance)`;
  if (e.limit === 'round' || e.limit === 'combat') s += ` (once per ${e.limit})`;
  return e.downside === true ? `Downside: ${s}` : s;
}

// ---------------------------------------------------------------------------------------------
// world

const RESOURCE_LABEL: Record<string, string> = { credits: 'Credits', supplies: 'Supplies', plyx: 'Plyx' };
const NO_LINE_WORLD = new Set(['flag', 'thread_flag', 'thread', 'fact']);

/** `null` for effects the player has no line for (flags, threads, facts). */
export function summarizeWorldEffect(effect: WorldEffect, reg: Registries): string | null {
  const e = (effect ?? {}) as unknown as Loose;
  if (NO_LINE_WORLD.has(e.type)) return null;
  switch (e.type) {
    case 'resource': return `${signed(Number(e.amount))} ${RESOURCE_LABEL[e.resource] ?? cap(humanize(String(e.resource)))}`;
    case 'faction': return `${signed(Number(e.amount))} standing with [[corporations:${e.factionId}]]`;
    case 'clock': {
      const clock = reg.clocks.get(String(e.clockId));
      if (clock && clock.visibleToPlayer === true) return `${String(clock.label)} ${signed(Number(e.by))}`;
      return `An unseen threat ${Number(e.by) < 0 ? 'recedes' : 'advances'}`;
    }
    case 'party_stress': return `${signed(Number(e.amount))} Stress to the party`;
    case 'party_hp': return `${pctSigned(Number(e.pct))} HP to the party`;
    case 'leash': return `${signed(Number(e.amount))} Leash authorization`;
    default: {
      const base = cap(humanize(String(e.type ?? 'effect')));
      return isNum(e.amount) ? `${base} ${signed(e.amount)}` : base;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// activities

const WHO: Record<string, string> = { selected: 'Chosen units', companion: 'Companion', roster: 'Roster' };

/** `emit_event` has no line (`null`). `focus` lets a `when.focus` show its label instead of its id. */
export function summarizeActivityEffect(
  effect: ActivityEffect,
  _reg: Registries,
  focus?: ReadonlyArray<{ id: string; label: string }>,
): string | null {
  const e = (effect ?? {}) as unknown as Loose;
  if (e.type === 'emit_event') return null;
  const who = WHO[e.target] ?? 'Chosen units';
  let s: string;
  switch (e.type) {
    case 'resource':
      s = `${signed(Number(e.amount))} ${RESOURCE_LABEL[e.resource] ?? cap(humanize(String(e.resource)))}`;
      if (e.perStat) s += ` ${signed(Number(e.perStat.per))} per ${cap(String(e.perStat.stat))} rank`;
      break;
    case 'commander_stat': s = `${signed(Number(e.amount))} ${cap(String(e.stat))}`; break;
    case 'unit_xp': s = `${who} ${signed(Number(e.amount))} XP`; break;
    case 'unit_stress': s = `${who} ${signed(Number(e.amount))} Stress`; break;
    case 'injury_days': s = `${who} ${signed(Number(e.amount))} injury days`; break;
    case 'commander_injury_days': s = `Commander ${signed(Number(e.amount))} injury days`; break;
    case 'defect_upkeep': s = `${who}: defect upkeep`; break;
    case 'relation': s = `Companion ${signed(Number(e.amount))} ${cap(String(e.axis))}`; break;
    default: return cap(humanize(String(e.type ?? 'effect')));
  }
  if (e.scale?.facility) s += ` (more with [[facilities:${e.scale.facility}]])`;
  if (e.when?.focus !== undefined) {
    const label = focus?.find((f) => f.id === e.when.focus)?.label ?? humanize(String(e.when.focus));
    s += ` (focus: ${label})`;
  }
  if (e.when?.companionLikes !== undefined) s += ` (if she likes ${e.when.companionLikes})`;
  return s;
}

// ---------------------------------------------------------------------------------------------
// per registry

export const FACILITY_KEY_LABELS: Record<string, string> = {
  rosterCapacity: 'beds',
  restPct: 'rest %',
  rarityCap: 'rarity cap',
  upgradeDiscountPct: 'upgrade discount %',
  stressReliefPct: 'stress relief %',
  injurySpeed: 'recovery speed',
  arcStageCap: 'defect arc stage',
  upkeepReduction: 'upkeep −',
  mealPct: 'meal effect %',
  rumorsPerDay: 'rumors/day',
  missionBoardSize: 'board size',
  dmFeatures: 'DM features',
};

const list = (v: unknown): Loose[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const combat = (v: unknown, reg: Registries): string[] => list(v).map((e) => summarizeCombatEffect(e as CombatEffect, reg));
const compact = (lines: Array<string | null | undefined>): string[] => lines.filter((l): l is string => typeof l === 'string' && l !== '');

function facilityLevel(label: string, value: unknown): string {
  if (label.endsWith('%')) return `${label.slice(0, -1).trim()} ${value}%`;
  if (label.endsWith('−')) return `${label}${value}`;
  return `${label} ${value}`;
}

function statLines(stats: unknown, format: (stat: string, n: number) => string): string[] {
  if (!stats || typeof stats !== 'object') return [];
  return Object.entries(stats as Loose).filter(([, n]) => isNum(n)).map(([stat, n]) => format(stat.toUpperCase(), n as number));
}

function effectsFor(registry: RegistryName, entry: Entry, reg: Registries): string[] {
  const e = entry as Loose;
  switch (registry) {
    case 'skills': {
      const head = compact([
        isNum(e.cooldown) ? `Cooldown ${e.cooldown}` : null,
        isNum(e.cp) ? `${e.cp} CP` : null,
        isNum(e.stressCost) ? `${e.stressCost} Stress` : null,
      ]).join(' · ');
      return compact([head, ...combat(e.effects, reg)]);
    }
    case 'statuses': {
      const turns = isNum(e.turns) && isNum(e.maxStacks) ? `Lasts ${e.turns} ${plural(e.turns, 'turn')}, up to ${e.maxStacks} ${plural(e.maxStacks, 'stack')}` : null;
      return compact([
        ...statLines(e.mods, (stat, n) => `${pctSigned(n)} ${stat} per stack`),
        isNum(e.incomingPct) ? `${pctSigned(e.incomingPct)} damage taken` : null,
        ...combat(e.tick, reg).map((l) => `Each turn: ${l}`),
        ...(Array.isArray(e.flags) ? e.flags.map((f: unknown) => cap(humanize(String(f)))) : []),
        turns,
      ]);
    }
    case 'items':
      return compact([...statLines(e.baseStats, (stat, n) => `${signed(n)} ${stat}`), ...combat(e.effects, reg)]);
    case 'affixes':
      return compact([
        ...statLines(e.statPct, (stat, n) => `${pctSigned(n)} ${stat}`),
        ...combat(e.effects, reg),
        e.drawback === true ? 'Drawback' : null,
      ]);
    case 'orders':
      return compact([isNum(e.cost) ? `Costs ${e.cost} CP` : null, ...combat(e.effects, reg)]);
    case 'synergies':
      return combat(e.effects, reg);
    case 'defects': {
      const c = (e.combat && typeof e.combat === 'object' ? e.combat : {}) as Loose;
      const name = e.breakdown && typeof e.breakdown === 'object' ? (e.breakdown as Loose).name : undefined;
      return compact([...combat(c.upside, reg), ...combat(c.downside, reg), typeof name === 'string' ? `Breakdown: ${name}` : null]);
    }
    case 'activities': {
      const cost = e.cost && typeof e.cost === 'object'
        ? Object.entries(e.cost as Loose).filter(([, n]) => isNum(n) && n > 0).map(([r, n]) => `${n} ${r}`)
        : [];
      const focus = list(e.focus) as Array<{ id: string; label: string }>;
      return compact([
        cost.length ? `Costs ${cost.join(', ')}` : null,
        ...list(e.effects).map((x) => summarizeActivityEffect(x as ActivityEffect, reg, focus)),
        ...list(e.companionEffects).map((x) => {
          const line = summarizeActivityEffect(x as ActivityEffect, reg, focus);
          return line === null ? null : `With a companion: ${line}`;
        }),
      ]);
    }
    case 'facilities':
      return list(e.levels).map((level, i) => {
        const parts = Object.entries((level.effects && typeof level.effects === 'object' ? level.effects : {}) as Loose)
          .map(([key, value]) => facilityLevel(FACILITY_KEY_LABELS[key] ?? humanize(key), value));
        return `Level ${i + 1}: ${parts.join(', ')}`;
      });
    case 'crimes':
      return compact([typeof e.perk?.text === 'string' ? `Perk: ${e.perk.text}` : null, typeof e.flaw?.text === 'string' ? `Flaw: ${e.flaw.text}` : null]);
    case 'corporations':
      return compact([
        typeof e.startingBonus?.text === 'string' ? `Starting bonus: ${e.startingBonus.text}` : null,
        isNum(e.leash?.weekly) ? `Oversight: ${e.leash.weekly} authorizations a week` : null,
      ]);
    case 'nodeTypes': {
      const r = e.rest && typeof e.rest === 'object' ? (e.rest as Loose) : null;
      const c = e.combat && typeof e.combat === 'object' ? (e.combat as Loose) : null;
      return compact([
        r ? `Costs ${r.suppliesPerUnit} supplies per unit · ${r.hpPct}% HP · ${isNum(r.stress) ? signed(r.stress) : r.stress} Stress` : null,
        c && isNum(c.dangerDelta) ? `Danger ${signed(c.dangerDelta)}` : null,
      ]);
    }
    case 'enemies':
      return Array.isArray(e.skills) && e.skills.length ? [`Skills: ${e.skills.map((s: unknown) => `[[skills:${s}]]`).join(', ')}`] : [];
    case 'signatures':
      return typeof e.skill === 'string' ? [`[[skills:${e.skill}]]`] : [];
    case 'relationshipStates': {
      const syn = e.unlocks && typeof e.unlocks === 'object' && Array.isArray((e.unlocks as Loose).synergies) ? ((e.unlocks as Loose).synergies as unknown[]) : [];
      const mod = (kind: 'gain' | 'loss', word: string): string[] => {
        const row = e.modifiers && typeof e.modifiers === 'object' ? (e.modifiers as Loose)[kind] : null;
        if (!row || typeof row !== 'object') return [];
        return Object.entries(row as Loose).filter(([, n]) => isNum(n)).map(([axis, n]) => `${cap(axis)} ${word} ×${num(n as number)}`);
      };
      return compact([syn.length ? `Unlocks: ${syn.map((s) => `[[synergies:${s}]]`).join(', ')}` : null, ...mod('gain', 'gains'), ...mod('loss', 'losses')]);
    }
    default:
      return [];
  }
}

/** The generated effects lines of a registry entry (never throws; an entry that cannot be read gives no lines). */
export function entryEffects(registry: RegistryName, entry: Entry, reg: Registries): string[] {
  try {
    return effectsFor(registry, entry, reg);
  } catch {
    return [];
  }
}
