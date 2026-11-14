import type { EngineCtx, EngineEvent } from '../dispatch';
import { activeRosterUnits, isLiving } from '../economy';
import { unitStats } from '../combat/stats';
import { bankLoot, rollLoot } from '../items';
import { addFact } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { CampaignState, LootDrop, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { stanceEffects } from '../worldOptions';
import { advanceClock } from './clocks';
import { offerMission } from './missions';
import { checkBeatFlags } from './spine';
import { knownRegions } from './state';
import type { QueuedIntent, WorldEffect } from './types';

/** Where a list of effects came from. `depth` counts nested chains (a clock's `onFill`); past `MAX_DEPTH` they stop. */
export interface EffectSource {
  kind: 'mission' | 'clock' | 'event' | 'beat' | 'director';
  id: string;
  depth?: number;
  /** Shown as the evidence of relation events; defaults to `id`. */
  label?: string;
  /** Who a `unit_event` outside an expedition touches (P6: the units present at a dilemma); default the active roster. */
  units?: string[];
}

export const MAX_EFFECT_DEPTH = 3;

/** P8: a `faction` effect with this id moves the commander's own corporation (content shared by every start, like the purge sweep). */
export const OWN_FACTION = 'own';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Units the party-wide effects touch: the expedition party, or the active roster when nothing is under way. */
function partyUnits(draft: CampaignState): Unit[] {
  if (draft.expedition) {
    return draft.expedition.party
      .map((id) => draft.squad.find((u) => u.id === id))
      .filter((u): u is Unit => u !== undefined && isLiving(u));
  }
  return activeRosterUnits(draft);
}

/**
 * A `unit_event` with no expedition under way (P6 dilemmas at the base): applied at once through P3 to the units
 * present (default the active roster), then each unit is re-evaluated. Only named units for `targets: 'named'`.
 */
function applyUnitEventAtBase(
  draft: CampaignState, ctx: EngineCtx, fx: Extract<WorldEffect, { type: 'unit_event' }>, src: EffectSource,
): EngineEvent[] {
  const ids = src.units ?? activeRosterUnits(draft).map((u) => u.id);
  const targets = ids.filter((id) => {
    const u = draft.squad.find((x) => x.id === id);
    return u !== undefined && isLiving(u) && (fx.targets === 'party' || u.kind === 'named');
  });
  const events: EngineEvent[] = [];
  for (const id of targets) {
    events.push(...applyEventToUnit(draft, ctx.registries, id, {
      type: fx.event, actor: 'commander', targets: [id], severity: fx.severity, evidence: src.label ?? src.id, confidence: 1,
      ...(fx.valueAxes ? { valueAxes: fx.valueAxes.map((a) => ({ axis: a.axis as never, direction: a.direction })) } : {}),
    }));
  }
  for (const id of targets) events.push(...evaluateAutomatic(draft, ctx.registries, id));
  return events;
}

/** Offers a mission; the region defaults to the template's first allowed one. An invalid offer is skipped. */
function offerMissionEffect(draft: CampaignState, ctx: EngineCtx, fx: Extract<WorldEffect, { type: 'offer_mission' }>): EngineEvent[] {
  const tpl = ctx.registries.missionTemplates.get(fx.templateId);
  const regionId = fx.regionId ?? (tpl?.regions as string[] | undefined)?.[0] ?? knownRegions(draft, ctx.registries)[0]?.id;
  if (regionId === undefined) return [];
  return offerMission(draft, ctx, { templateId: fx.templateId, regionId, source: fx.source }).events;
}

/**
 * The one interpreter for every consequence outside combat (mission rewards and failures, clock fills, event options,
 * beat completions). Effects whose target no longer exists in state or content are skipped without an event.
 */
export function applyWorldEffects(
  draft: CampaignState, ctx: EngineCtx, effects: WorldEffect[], src: EffectSource,
): EngineEvent[] {
  const depth = src.depth ?? 0;
  if (depth > MAX_EFFECT_DEPTH) return [];
  const events: EngineEvent[] = [];
  const reg = ctx.registries;

  for (const fx of effects) {
    switch (fx.type) {
      case 'resource': {
        const before = draft.resources[fx.resource];
        const after = Math.max(0, before + fx.amount);
        draft.resources[fx.resource] = after;
        if (after !== before) events.push({ type: 'resource_changed', resource: fx.resource, amount: after - before });
        break;
      }
      case 'carried_supplies': {
        const exp = draft.expedition;
        if (exp) exp.supplies = clamp(exp.supplies + fx.amount, 0, TUNING.expedition.suppliesMax);
        break;
      }
      case 'faction': {
        const factionId = fx.factionId === OWN_FACTION ? draft.commander.corporationId ?? '' : fx.factionId;
        if (!reg.corporations.has(factionId)) break;
        const before = draft.world.factions[factionId] ?? 0;
        const after = clamp(before + fx.amount, -100, 100);
        draft.world.factions[factionId] = after;
        if (after !== before) events.push({ type: 'faction_changed', factionId, amount: after - before, standing: after });
        break;
      }
      case 'clock':
        events.push(...advanceClock(draft, ctx, fx.clockId, fx.by, `${src.kind}:${src.id}`, depth));
        break;
      case 'flag': {
        const def = reg.flags.get(fx.flagId);
        if (!def || (def.scope !== 'world' && def.scope !== 'commander')) break;
        const list = def.scope === 'world' ? draft.world.flags : draft.commander.flags;
        if (list.includes(fx.flagId)) break;
        const excluded = new Set((def.mutuallyExclusiveWith as string[] | undefined) ?? []);
        for (let i = list.length - 1; i >= 0; i--) if (excluded.has(list[i])) list.splice(i, 1);
        list.push(fx.flagId);
        events.push({ type: 'flag_set', flagId: fx.flagId, scope: def.scope });
        events.push(...checkBeatFlags(draft, ctx));
        break;
      }
      case 'clearance': {
        const before = draft.world.clearanceTier ?? 0;
        const after = Math.min(3, Math.max(before, fx.tier));
        if (after > before) {
          draft.world.clearanceTier = after;
          events.push({ type: 'clearance_raised', tier: after });
        }
        break;
      }
      case 'party_stress': {
        for (const u of partyUnits(draft)) {
          const next = clamp(u.stress + fx.amount, 0, 100);
          if (next !== u.stress) events.push({ type: 'stress_changed', unitId: u.id, delta: next - u.stress });
          u.stress = next;
        }
        break;
      }
      case 'stigma_news': {
        for (const u of draft.squad) {
          if (!isLiving(u)) continue;
          const mult = stanceEffects(draft, reg, u, 'news_stress_mult').reduce((m, x) => m * x.mult, 1);
          const next = clamp(u.stress + Math.round(fx.amount * mult), 0, 100);
          if (next !== u.stress) events.push({ type: 'stress_changed', unitId: u.id, delta: next - u.stress });
          u.stress = next;
        }
        break;
      }
      case 'party_hp': {
        for (const u of partyUnits(draft)) {
          const max = unitStats(draft, reg, u).hp;
          const next = u.currentHp + Math.round((max * fx.pct) / 100);
          // damage never kills (HP stays at 1 or more); healing never passes the unit's maximum
          u.currentHp = fx.pct < 0 ? Math.max(1, next) : Math.min(max, next);
        }
        break;
      }
      case 'loot': {
        if (!reg.lootTables.has(fx.tableId)) break;
        const drops: LootDrop[] = [];
        for (let i = 0; i < (fx.rolls ?? 1); i++) drops.push(...rollLoot(draft, reg, ctx.rng, fx.tableId));
        if (draft.expedition) draft.expedition.loot.push(...drops);
        else events.push(...bankLoot(draft, drops));
        break;
      }
      case 'leash': {
        const before = draft.leash.authorizationsLeft;
        draft.leash.authorizationsLeft = Math.max(0, before + fx.amount);
        if (draft.leash.authorizationsLeft !== before) {
          events.push({ type: 'leash_changed', amount: draft.leash.authorizationsLeft - before, left: draft.leash.authorizationsLeft });
        }
        break;
      }
      case 'thread': {
        const thread = draft.world.threads.find((t) => t.id === fx.threadId);
        if (!thread || thread.status === fx.status) break;
        thread.status = fx.status;
        events.push({ type: 'thread_changed', threadId: fx.threadId, status: fx.status });
        break;
      }
      case 'unit_event': {
        const exp = draft.expedition;
        if (!exp) {
          events.push(...applyUnitEventAtBase(draft, ctx, fx, src));
          break;
        }
        const targets = exp.party.filter((id) => {
          const u = draft.squad.find((x) => x.id === id);
          return u !== undefined && (fx.targets === 'party' || u.kind === 'named');
        });
        if (targets.length === 0) break;
        const hint: QueuedIntent = { type: fx.event, actor: 'commander', targets, severity: fx.severity, evidence: src.label ?? src.id };
        if (fx.valueAxes) hint.valueAxes = fx.valueAxes.map((a) => ({ axis: a.axis as never, direction: a.direction }));
        exp.hints.push(hint);
        break;
      }
      case 'thread_flag': {
        const thread = draft.world.threads.find((t) => t.id === fx.threadId);
        if (!thread || thread.flags.length >= TUNING.world.threadFlagsMax || thread.flags.some((f) => f.id === fx.flagId)) break;
        thread.flags.push({ id: fx.flagId, description: fx.description });
        events.push({ type: 'thread_flag_set', threadId: fx.threadId, flagId: fx.flagId });
        break;
      }
      case 'incoming_unit':
        draft.world.incomingUnits = (draft.world.incomingUnits ?? 0) + 1;
        events.push({ type: 'incoming_unit_offered', count: draft.world.incomingUnits });
        break;
      case 'fact':
        addFact(draft, { about: [], text: fx.text, tags: fx.tags, importance: fx.importance as 1 | 2 | 3 | 4 | 5, day: draft.day, knownBy: ['*'] });
        break;
      case 'offer_mission':
        events.push(...offerMissionEffect(draft, ctx, fx));
        break;
    }
  }
  return events;
}
