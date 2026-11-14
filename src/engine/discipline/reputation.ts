import type { Entry, Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { applyRelationDelta } from '../relationGain';
import { evaluateAutomatic } from '../relations/graph';
import type { CampaignState, DeedCounter } from '../state/types';
import { TUNING } from '../tuning';
import { deedsOf } from './deeds';

type Pattern = { sum: DeedCounter[]; min: number; against?: DeedCounter[]; minShare?: number };
const patternOf = (e: Entry): Pattern => e.pattern as Pattern;
const total = (deeds: Record<DeedCounter, number>, list: DeedCounter[] | undefined): number => (list ?? []).reduce((n, c) => n + (deeds[c] ?? 0), 0);

/** A pattern holds when the counters reach `min` and, with `against`, their share of the pair reaches `minShare`. */
export function patternHolds(state: CampaignState, entry: Entry): boolean {
  const p = patternOf(entry);
  const deeds = deedsOf(state);
  const sum = total(deeds, p.sum);
  if (sum < p.min) return false;
  if (p.against === undefined) return true;
  const against = total(deeds, p.against);
  return sum / (sum + against) >= (p.minShare ?? 0);
}

/** How far past its minimum a pattern is (a nickname with a higher score takes over the group). */
export function patternScore(state: CampaignState, entry: Entry): number {
  const p = patternOf(entry);
  return total(deedsOf(state), p.sum) / p.min;
}

/**
 * The day-end part of reputation: queues one pending nickname, and lets an active one whose pattern no longer holds leave
 * after a week without a successor. The best-scoring pattern that holds goes first. A group has one nickname; at most two
 * are active; a third replaces one that no longer holds.
 */
export function reputationDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  const rep = draft.commander.reputation;
  const lookup = (id: string): Entry | undefined => reg.reputations.get(id);

  // mark and drop the active ones that no longer hold
  if (rep) {
    for (const a of [...rep.active]) {
      const e = lookup(a.id);
      if (e && patternHolds(draft, e)) {
        delete a.lapsedDay;
        continue;
      }
      a.lapsedDay ??= draft.day;
      if (draft.day - a.lapsedDay >= TUNING.reputation.leaveAfterDays && rep.pending?.replaces !== a.id) {
        rep.active = rep.active.filter((x) => x.id !== a.id);
        events.push({ type: 'nickname_dropped', id: a.id });
      }
    }
  }
  if (rep?.pending) return events;

  const active = rep?.active ?? [];
  const holding = (id: string): boolean => { const e = lookup(id); return e !== undefined && patternHolds(draft, e); };
  const candidates = [...reg.reputations.values()]
    .filter((e) => !active.some((a) => a.id === e.id) && patternHolds(draft, e))
    .sort((a, b) => patternScore(draft, b) - patternScore(draft, a));
  for (const c of candidates) {
    const sameGroup = active.find((a) => lookup(a.id)?.group === c.group);
    let replaces: string | undefined;
    if (!sameGroup) {
      if (active.length < TUNING.reputation.maxActive) replaces = undefined;
      else {
        const gone = active.find((a) => !holding(a.id));
        if (!gone) continue; // two are active and both still hold: it waits
        replaces = gone.id;
      }
    } else {
      const old = lookup(sameGroup.id);
      if (holding(sameGroup.id) && old && patternScore(draft, c) <= patternScore(draft, old)) continue;
      replaces = sameGroup.id;
    }
    draft.commander.reputation = { active: rep?.active ?? [], pending: { id: String(c.id), queuedDay: draft.day, ...(replaces !== undefined ? { replaces } : {}) } };
    events.push({ type: 'nickname_pending', id: String(c.id), ...(replaces !== undefined ? { replaces } : {}) });
    break;
  }
  return events;
}

/**
 * The nickname moment: `unitId` is the only unit of the open scene and calls the commander by the pending nickname for the
 * first time. It becomes active (its name is copied into the state), a public fact names it, and every named living unit reacts
 * once by her values. Throws when it cannot happen.
 */
export function introduceNickname(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const rep = draft.commander.reputation;
  const pending = rep?.pending;
  if (!rep || !pending) throw new Error('No nickname is waiting.');
  const scene = draft.scene;
  if (!scene || scene.participants.length !== 1 || scene.participants[0] !== unitId) throw new Error('A nickname is introduced in a private scene with the unit who says it.');
  const entry = reg.reputations.get(pending.id);
  if (!entry) {
    delete rep.pending; // the pack no longer has it
    return [];
  }
  const name = String(entry.name);
  rep.active = rep.active.filter((a) => a.id !== pending.replaces);
  rep.active.push({ id: pending.id, name, sinceDay: draft.day, by: unitId });
  delete rep.pending;
  addFact(draft, { about: ['commander'], text: `The squad has started calling the commander "${name}".`, tags: ['reputation'], importance: 3, day: draft.day, knownBy: ['*'] });
  const events: EngineEvent[] = [];
  const reactions = ((entry.effects as { valueReactions?: Array<{ axis: string; sign: '+' | '-'; weight: number }> } | undefined)?.valueReactions) ?? [];
  const flag = `nickname_reacted:${pending.id}`;
  for (const u of draft.squad.filter((x) => x.kind === 'named' && isLiving(x))) {
    const rel = draft.relations[u.id];
    if (!rel || rel.flags.includes(flag)) continue;
    rel.flags.push(flag);
    for (const r of reactions) {
      const v = u.values[r.axis as keyof typeof u.values];
      if (r.sign === '+' ? !(v > 0) : !(v < 0)) continue;
      applyRelationDelta(draft, u.id, 'trust', r.weight * TUNING.reputation.trustPerWeight, `nickname:${pending.id}`);
      applyRelationDelta(draft, u.id, 'affinity', r.weight * TUNING.reputation.affinityPerWeight, `nickname:${pending.id}`);
    }
    events.push(...evaluateAutomatic(draft, reg, u.id));
  }
  events.push({ type: 'nickname_given', id: pending.id, name, unitId, ...(pending.replaces !== undefined ? { replaced: pending.replaces } : {}) });
  return events;
}
