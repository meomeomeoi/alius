import type { ActivityEffect, CombatEffect, TraitEffect } from '../content/schemas';
import { TUNING } from '../engine/tuning';
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

/** Triggers of an effect that belongs to an ally (`scope: 'ally'`). */
const ALLY_TRIGGER_SUFFIX: Record<string, string> = { onHit: ' when an ally hits', onCrit: ' when an ally crits', onKill: ' when an ally kills' };

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

/** What a `scale` multiplies: `per × value`, with the value named here. */
function scaleUnit(scale: Loose): string {
  switch (scale.by) {
    case 'stress_above': return `Stress above ${num(Number(scale.base ?? 0))}`;
    case 'own_hp_missing_pct': return '1% HP missing';
    case 'allies_hp_missing_pct': return "1% allies' HP missing";
    default: return humanize(String(scale.by));
  }
}

/** The scaled part of a percentage line; with a zero base the line is the scale alone (`+1% ATK per Stress above 30`). */
function scaledPct(pct: number, name: string, scale: Loose | undefined): string {
  if (!scale || !isNum(scale.per)) return `${pctSigned(pct)} ${name}`;
  if (pct === 0) return `${signed(scale.per)}% ${name} per ${scaleUnit(scale)}`;
  return `${pctSigned(pct)} ${name}, ${signed(scale.per)}% per ${scaleUnit(scale)}`;
}

function combatBase(e: Loose): string {
  switch (e.type) {
    case 'damage': {
      let s = isNum(e.pctMaxHp) ? `Damage ${num(e.pctMaxHp)}% max HP` : `Damage ×${num(Number(e.mult ?? 1))}`;
      if (e.scale && isNum(e.scale.per)) s += `, +×${num(e.scale.per)} per ${scaleUnit(e.scale)}`;
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
    case 'stat': return `${scaledPct(Number(e.pct), e.stat === 'all' ? 'all stats' : String(e.stat).toUpperCase(), e.scale)}${isNum(e.turns) ? ` (${e.turns} ${plural(e.turns, 'turn')})` : ''}`;
    case 'outgoing': return `${scaledPct(Number(e.pct), 'damage dealt', e.scale)}${e.vs && e.vs !== 'any' ? ` vs ${e.vs}` : ''}`;
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
    case 'order_refusal': return Array.isArray(e.orders) && e.orders.length ? `May refuse ${e.orders.map((o: string) => `[[orders:${o}]]`).join(', ')}` : 'May refuse orders';
    case 'loadout_slots': return `+${e.amount} loadout ${plural(Number(e.amount), 'slot')}`;
    case 'injury_days': return `${pctSigned(Number(e.pct))} injury time`;
    default: return cap(humanize(String(e.type ?? 'effect')));
  }
}

/** How each condition key reads; a key without an entry falls back to its humanized name. */
const WHEN_TEXT: Record<string, (value: unknown) => string> = {
  hpBelowPct: (v) => ` below ${v}% HP`,
  hpAbovePct: (v) => ` above ${v}% HP`,
  stressMax: (v) => ` at Stress ≤ ${v}`,
  roundMin: (v) => ` from round ${v}`,
  targetHasStatus: (v) => ` target has [[statuses:${v}]]`,
  selfHasStatus: (v) => ` while [[statuses:${v}]]`,
  rowChanged: (v) => (v === false ? ' unless she changed rows' : ' after changing rows'),
  commanderExposed: (v) => (v === false ? ' while the commander is covered' : ' while the commander is exposed'),
  notOrderedThisRound: (v) => (v === false ? ' if ordered this round' : ' if not ordered this round'),
  upkeepWithinDays: (v) => ` within ${v} days of upkeep`,
  upkeepOlderThanDays: (v) => ` when upkeep is older than ${v} days`,
};

function whenSuffix(e: Loose): string {
  const when = e.when as Loose | undefined;
  if (!when || typeof when !== 'object') return '';
  let s = '';
  for (const [key, value] of Object.entries(when)) {
    if (key === 'stressMin') {
      if (e.trigger !== 'onStressThreshold') s += ` at Stress ≥ ${value}`;
    } else if (WHEN_TEXT[key]) s += WHEN_TEXT[key](value);
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
  else if (e.scope === 'ally' && typeof e.trigger === 'string' && ALLY_TRIGGER_SUFFIX[e.trigger]) s += ALLY_TRIGGER_SUFFIX[e.trigger];
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
    case 'faction': return e.factionId === 'own' ? `${signed(Number(e.amount))} standing with your own corporation` : `${signed(Number(e.amount))} standing with [[corporations:${e.factionId}]]`;
    case 'stigma_news': return `${signed(Number(e.amount))} Stress to every unit, more for those who take the news to heart`;
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
    case 'commander_body_xp': s = `Body training: ${String(e.stat)}`; break;
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

function effectsFor(registry: RegistryName, entry: Entry, reg: Registries, data?: Record<string, unknown>): string[] {
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
        c && isNum(c.dangerDelta) && c.dangerDelta !== 0 ? `Danger ${signed(c.dangerDelta)}` : null,
      ]);
    }
    case 'enemies':
      return Array.isArray(e.skills) && e.skills.length ? [`Skills: ${e.skills.map((s: unknown) => `[[skills:${s}]]`).join(', ')}`] : [];
    case 'signatures':
      return typeof e.skill === 'string' ? [`[[skills:${e.skill}]]`] : [];
    case 'worldOptions': {
      // a choice card shows that choice's effects; the option itself shows every choice that has some
      const choices = list(e.choices) as Array<{ id: string; label: string; effects?: unknown[] }>;
      const lines = (c: { effects?: unknown[] }): string[] => (Array.isArray(c.effects) ? c.effects : []).map((fx) => summarizeWorldOptionEffect(fx as never, reg));
      if (typeof data?.choice === 'string') return lines(choices.find((c) => c.id === data.choice) ?? {});
      return choices.filter((c) => lines(c).length > 0).map((c) => `${c.label}: ${lines(c).join('; ')}`);
    }
    case 'dispositionLevels':
      return summarizeDispositionLevel(entry);
    case 'commanderTraits':
      return list(e.effects).map((x) => summarizeTraitEffect(x as unknown as TraitEffect, reg));
    case 'tastes': {
      const o = e.offsets && typeof e.offsets === 'object' ? (e.offsets as Loose) : {};
      return compact([
        ...(['trust', 'affinity', 'attraction'] as const).filter((a) => isNum(o[a]) && o[a] !== 0).map((a) => `${cap(a)} ${signed(o[a])}`),
        isNum(e.presenceMult) ? `Presence ×${num(e.presenceMult)}` : null,
        isNum(e.imageMult) ? `Image consistency ×${num(e.imageMult)}` : null,
      ]);
    }
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

/** One line for a commander trait effect (P7); an effect type this layer does not know gives its humanized name. */
export function summarizeTraitEffect(e: TraitEffect, _reg: Registries): string {
  const x = e as unknown as Loose;
  const stat = (s: unknown): string => cap(String(s));
  switch (x.type) {
    case 'social_rank': return `${stat(x.stat)} rank ${x.rank} at start`;
    case 'starting_trust': {
      const iv = x.ifValue as { axis: string; sign: string } | undefined;
      return `Starting Trust ${signed(x.amount)}${iv ? ` with units whose ${iv.axis} value is ${iv.sign === '+' ? 'above' : 'below'} zero` : ''}`;
    }
    case 'leash_weekly': return `${signed(x.amount)} Leash ${Math.abs(x.amount) === 1 ? 'authorization' : 'authorizations'} a week`;
    case 'seasoning_start': return `Seasoning ${signed(x.amount)} at start`;
    case 'faction_start': return `Own corporation standing ${signed(x.amount)} at start`;
    case 'taste_attraction': return `Starting Attraction ${signed(x.amount)} with units whose tastes fit the commander`;
    case 'social_growth': return `${stat(x.stat)} grows ×${num(x.mult)} ${x.mult >= 1 ? 'faster' : 'slower'}`;
    case 'body_growth': return `Body training XP ×${num(x.mult)}`;
    case 'early_trust_gain': return `Trust gains ${pctSigned(x.pct)} for the first ${TUNING.commander.earlyDays} days`;
    case 'crisis_hp': return `Crisis HP ${signed(x.amount)}`;
    case 'terminate_approval': return `Termination approval ${pctSigned(x.amount * 100)}`;
    case 'requisition_price': return `Requisition price ${pctSigned(x.pct)}`;
    case 'activity_cost': return `[[activities:${x.activityId}]] costs ${signed(x.amount)} ${x.resource}`;
    case 'activity_relation': return `[[activities:${x.activityId}]] with a companion: ${cap(x.axis)} ${signed(x.amount)}`;
    case 'relation_event_mult': return `[[eventDeltas:${x.event}]] lands ×${num(x.mult)}${x.ifTrigger ? ` with units that have the trigger "${x.ifTrigger}"` : ''}`;
    case 'night_slot': return 'The Night is always yours: a quiet night when nobody knocks';
    case 'sleepless_rank': return `${stat(x.stat)} rank ${signed(x.amount)} the day after a night spent awake`;
    case 'no_romance': return 'No romance in this campaign';
    case 'platonic_threshold': return `${(x.states as string[]).map((s) => `[[relationshipStates:${s}]]`).join(', ')} need ${x.pct}% less to reach`;
    case 'unlock_state': return `Unlocks [[relationshipStates:${x.stateId}]]`;
    default: return humanize(String(x.type));
  }
}

// ---------------------------------------------------------------------------------------------
// P8: world options and disposition levels. Words only: the numbers come from a provider, through `Knowledge`.

/** One line for the effect of a world choice, with no figure in it. */
export function summarizeWorldOptionEffect(effect: unknown, reg: Registries): string {
  const x = (effect ?? {}) as Loose;
  switch (x.type) {
    case 'disposition': return `Soldiers are ${String(reg.dispositionLevels.get(String(x.levelId))?.name ?? humanize(String(x.levelId)))}`;
    case 'leash_weekly': return x.amount > 0 ? 'More Leash authorizations each week' : 'Fewer Leash authorizations each week';
    case 'terminate_approval': return x.amount > 0 ? 'Termination requests are approved more often' : 'Termination requests are approved less often';
    case 'command_failure_mult': return x.mult > 1 ? 'Failed command missions cost more standing' : 'Failed command missions cost less standing';
    case 'mission_reward_pct': return x.pct < 0 ? 'Missions pay less' : 'Missions pay more';
    case 'expression_norm': {
      const look = x.norm >= 4 ? 'masculine' : x.norm <= 2 ? 'feminine' : 'balanced';
      return `Command is expected to look ${look}; a commander who presents differently starts with less standing at their own corporation`;
    }
    case 'enable_family': return `Adds the ${cap(humanize(String(x.family)))} events to the world`;
    case 'director_hint': return `Story tone: ${String(x.text)}`;
    case 'scene_directive': return 'The story model is told how this world feels';
    case 'grunt_stances': return 'Generated soldiers lean for or against the norm';
    default: return cap(humanize(String(x.type ?? 'effect')));
  }
}

/** A disposition level in words, as a difference from the baseline (guarded says nothing special). */
export function summarizeDispositionLevel(entry: Entry): string[] {
  const e = entry as Loose;
  const out: string[] = [];
  const start = e.start && typeof e.start === 'object' ? (e.start as Loose) : {};
  if (isNum(start.trust)) {
    if (start.trust >= 5) out.push('Starts out trusting');
    else if (start.trust <= -25) out.push('Starts out hostile');
    else if (start.trust <= -5) out.push('Starts out wary');
  }
  if (isNum(e.lossMult)) out.push(...(e.lossMult > 1 ? ['Slights and betrayals weigh more'] : e.lossMult < 1 ? ['Slights and betrayals weigh less'] : []));
  if (isNum(e.gainMult)) out.push(...(e.gainMult > 1 ? ['Kindness earns more'] : e.gainMult < 1 ? ['Kindness earns less'] : []));
  const conf = e.minConfidence && typeof e.minConfidence === 'object' ? (e.minConfidence as Loose) : {};
  if (isNum(conf.gain) && conf.gain > 0.5) out.push('Believes kind acts only when they are clear');
  if (isNum(conf.loss)) out.push(...(conf.loss < 0.5 ? ['Believes the worst on thin evidence'] : conf.loss > 0.5 ? ['Believes bad news only when it is clear'] : []));
  if (isNum(e.bandShift)) out.push(...(e.bandShift > 0 ? ['Loyalty breaks sooner and recovers later'] : e.bandShift < 0 ? ['Loyalty is steadier'] : []));
  if (isNum(e.stageDaysMult)) out.push(...(e.stageDaysMult > 1 ? ['Relationships move on more slowly'] : e.stageDaysMult < 1 ? ['Relationships move on faster'] : []));
  if (isNum(e.refusalMult) && e.refusalMult !== 1) out.push(e.refusalMult > 1 ? 'Refuses orders and deserts more often' : 'Refuses orders and deserts less often');
  const mut = e.mutiny && typeof e.mutiny === 'object' ? (e.mutiny as Loose) : null;
  if (mut) {
    if (mut.enabled === false) out.push('Never mutinies');
    else if (Array.isArray(mut.states) && mut.states.length > 1) {
      out.push(`Can mutiny from ${(mut.states as string[]).join(' and ')}${mut.minSigns === 1 ? ', after one clear warning' : ''}`);
    }
  }
  const target: Record<string, string> = {
    self: 'Under a breakdown she turns on herself', allies: 'Under a breakdown she may hit an ally',
    allies_commander: 'Under a breakdown she may turn on an ally or the commander', everyone: 'Under a breakdown she may turn on anyone',
  };
  if (typeof e.breakdownTarget === 'string' && target[e.breakdownTarget]) out.push(target[e.breakdownTarget]);
  if (isNum(e.bigGestureMult) && e.bigGestureMult > 1) out.push('A big gesture counts for more');
  return out;
}

/** The generated effects lines of a registry entry (never throws; an entry that cannot be read gives no lines). `data` is the element's analysis context. */
export function entryEffects(registry: RegistryName, entry: Entry, reg: Registries, data?: Record<string, unknown>): string[] {
  try {
    return effectsFor(registry, entry, reg, data);
  } catch {
    return [];
  }
}
