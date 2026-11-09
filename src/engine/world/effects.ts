import type { EngineCtx, EngineEvent } from '../dispatch';
import { activeRosterUnits, isLiving } from '../economy';
import { unitStats } from '../combat/stats';
import { bankLoot, rollLoot } from '../items';
import { addFact } from '../memory';
import type { CampaignState, LootDrop, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { advanceClock } from './clocks';
import type { QueuedIntent, WorldEffect } from './types';

/** Where a list of effects came from. `depth` counts nested chains (a clock's `onFill`); past `MAX_DEPTH` they stop. */
export interface EffectSource {
  kind: 'mission' | 'clock' | 'event' | 'beat' | 'director';
  id: string;
  depth?: number;
  /** Shown as the evidence of relation events; defaults to `id`. */
  label?: string;
}

export const MAX_EFFECT_DEPTH = 3;

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

/** Not implemented until Task 5 replaces it: mission offers need the mission module. */
function offerMissionEffect(_draft: CampaignState, _ctx: EngineCtx, _fx: Extract<WorldEffect, { type: 'offer_mission' }>): EngineEvent[] {
  throw new Error('offer_mission: not implemented');
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
        if (!reg.corporations.has(fx.factionId)) break;
        const before = draft.world.factions[fx.factionId] ?? 0;
        const after = clamp(before + fx.amount, -100, 100);
        draft.world.factions[fx.factionId] = after;
        if (after !== before) events.push({ type: 'faction_changed', factionId: fx.factionId, amount: after - before, standing: after });
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
      case 'leash':
        draft.leash.authorizationsLeft = Math.max(0, draft.leash.authorizationsLeft + fx.amount);
        break;
      case 'thread': {
        const thread = draft.world.threads.find((t) => t.id === fx.threadId);
        if (!thread || thread.status === fx.status) break;
        thread.status = fx.status;
        events.push({ type: 'thread_changed', threadId: fx.threadId, status: fx.status });
        break;
      }
      case 'unit_event': {
        const exp = draft.expedition;
        if (!exp) break;
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
