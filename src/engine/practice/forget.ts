/**
 * What the practices drop when a unit leaves the squad for good, or when a content category is switched off (P16, plan R2): by
 * `removeFromService`, the dead-unit sweep of the day step and `setCategories`. A leaf for the leash, personal and bonds layers: it imports
 * only types and `state.ts` (the tags it reads are plain `contentTags` fields). Draws nothing and changes no relation.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { Booking, CampaignState } from '../state/types';
import { EFFECT_NEEDS, type HeldState, type PracticeState } from './state';

/** Whether anything of hers is left for `forgetPractices` to drop (the sweep runs only for those). */
export function holdsPractices(state: Pick<CampaignState, 'practices'>, unitId: string): boolean {
  const p = state.practices;
  if (p === undefined) return false;
  return p.requests.some((r) => r.holderId === unitId || r.targetUnitId === unitId)
    || p.tasks.some((t) => t.holderId === unitId || (t.targetUnitId === unitId && isOpen(t.status)))
    || p.punishments.some((x) => x.holderId === unitId || (x.forUnitId === unitId && isOpen(x.status)))
    || p.demonstrations.some((x) => x.holderId === unitId || x.audienceIds.includes(unitId))
    || p.held?.by === unitId || p.alarm?.holderId === unitId || p.permission?.holderId === unitId
    || p.restrictions.some((r) => r.holderId === unitId) || p.cold[unitId] !== undefined || p.postures[unitId] !== undefined
    || p.call?.holderId === unitId || p.slap?.holderId === unitId || p.offences[unitId] !== undefined
    || p.records.some((r) => r.holderId === unitId) || p.handovers.some((h) => h.holderId === unitId)
    || p.asked?.holderId === unitId || p.unfair?.[unitId] !== undefined || p.lastThreat?.unitId === unitId || p.verdictScene?.[unitId] !== undefined;
}

const isOpen = (status: string): boolean => status === 'offered' || status === 'open' || status === 'negotiating' || status === 'accepted';
const tagsOf = (entry: unknown): string[] => {
  const tags = (entry as { contentTags?: unknown } | undefined)?.contentTags;
  return Array.isArray(tags) ? tags.map(String) : [];
};
const voided = (taskId: string, holderId: string, what: 'task' | 'punishment' | 'demonstration', reason: 'gone' | 'content'): EngineEvent => ({ type: 'task_void', taskId, holderId, what, reason });

/** Marks the bookings of a hold cancelled and clears the conflict flag of the slots they left (the personal layer's own rule, copied so this file stays a leaf). */
function cancelHeld(draft: CampaignState, held: HeldState): void {
  const bookings = draft.personal?.bookings;
  if (bookings === undefined) return;
  const touched: Booking[] = [];
  for (const b of bookings) if (held.bookingIds.includes(b.id) && b.status === 'booked') { b.status = 'cancelled'; touched.push(b); }
  for (const t of touched) {
    const same = bookings.filter((b) => b.status === 'booked' && b.day === t.day && b.slot === t.slot);
    for (const b of same) if (same.length > 1) b.conflict = true; else delete b.conflict;
  }
}

/** The hold ends with no delta: its bookings are cancelled and the alarm that asked about it goes. */
function endHold(draft: CampaignState, p: PracticeState, reason: 'gone' | 'content'): EngineEvent {
  const held = p.held!;
  cancelHeld(draft, held);
  if (p.alarm !== undefined && (held.alarm === p.alarm.id || p.alarm.holderId === held.by)) delete p.alarm;
  delete p.held;
  return { type: 'hold_released', holderId: held.by, reason };
}

function endHandover(h: PracticeState['handovers'][number], reason: 'gone'): EngineEvent {
  return { type: 'handover_ended', handoverId: h.id, holderId: h.holderId, reason };
}

/**
 * Drops what the practices hold of a unit who left: her requests (and the ones that name her), her tasks, punishments and demonstrations (an open
 * one is void with a `task_void` event), the hold she keeps (its bookings cancelled, `hold_released`), her alarm, permission, restrictions, cold
 * shoulder, postures, call, slap, offences, record lines, handovers (`handover_ended`) and the small marks that name her. A task that names her
 * as its target and a punishment that was to fall on her are void; she leaves the audience of a demonstration. No delta of any axis, no draw,
 * idempotent, and a campaign without `practices` is left as it is.
 */
export function forgetPractices(draft: CampaignState, unitId: string): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined || !holdsPractices(draft, unitId)) return [];
  const events: EngineEvent[] = [];
  p.requests = p.requests.filter((r) => r.holderId !== unitId && r.targetUnitId !== unitId);
  for (const t of p.tasks) if (t.holderId === unitId && isOpen(t.status)) events.push(voided(t.id, unitId, 'task', 'gone'));
  p.tasks = p.tasks.filter((t) => t.holderId !== unitId);
  for (const x of p.punishments) if (x.holderId === unitId && isOpen(x.status)) events.push(voided(x.id, unitId, 'punishment', 'gone'));
  p.punishments = p.punishments.filter((x) => x.holderId !== unitId);
  for (const x of p.demonstrations) if (x.holderId === unitId && (x.status === 'offered' || x.status === 'open')) events.push(voided(x.id, unitId, 'demonstration', 'gone'));
  p.demonstrations = p.demonstrations.filter((x) => x.holderId !== unitId);
  for (const t of p.tasks) if (t.targetUnitId === unitId && isOpen(t.status)) { t.status = 'void'; events.push(voided(t.id, t.holderId, 'task', 'gone')); }
  for (const x of p.punishments) if (x.forUnitId === unitId && isOpen(x.status)) { x.status = 'void'; events.push(voided(x.id, x.holderId, 'punishment', 'gone')); }
  for (const x of p.demonstrations) x.audienceIds = x.audienceIds.filter((id) => id !== unitId);
  if (p.held?.by === unitId) events.push(endHold(draft, p, 'gone'));
  if (p.alarm?.holderId === unitId) delete p.alarm;
  if (p.permission?.holderId === unitId) delete p.permission;
  p.restrictions = p.restrictions.filter((r) => r.holderId !== unitId);
  delete p.cold[unitId];
  delete p.postures[unitId];
  if (p.call?.holderId === unitId) delete p.call;
  if (p.slap?.holderId === unitId) delete p.slap;
  delete p.offences[unitId];
  if (p.noted !== undefined) p.noted.keys = p.noted.keys.filter((k) => !k.startsWith(`${unitId}|`));
  p.records = p.records.filter((r) => r.holderId !== unitId);
  for (const h of p.handovers) if (h.holderId === unitId) events.push(endHandover(h, 'gone'));
  p.handovers = p.handovers.filter((h) => h.holderId !== unitId);
  if (p.asked?.holderId === unitId) delete p.asked;
  if (p.unfair !== undefined) { delete p.unfair[unitId]; if (Object.keys(p.unfair).length === 0) delete p.unfair; }
  if (p.lastThreat?.unitId === unitId) delete p.lastThreat;
  if (p.verdictScene !== undefined) { delete p.verdictScene[unitId]; if (Object.keys(p.verdictScene).length === 0) delete p.verdictScene; }
  return events;
}

/**
 * A content category was switched off (`registerWithdrawal`, called by `setCategories` after the new list is stored): every open practice tagged with it is
 * void (`task_void`, reason `content`), a request whose every candidate seed was tagged with it goes, the hold ends when the held booking kind needs it
 * (`hold_released`, bookings cancelled), a slap in progress goes when the category it needs went, and a permission rule that was only proposed goes (an active
 * one is suspended by the bonds layer itself and comes back with the category; her answer to the question does not). No delta, no draw, and a campaign without
 * `practices` is untouched.
 */
export function withdrawPractices(draft: CampaignState, reg: Registries, changed: string[]): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined || changed.length === 0) return [];
  const events: EngineEvent[] = [];
  const hit = (tags: string[]): boolean => tags.some((t) => changed.includes(t));
  p.requests = p.requests.filter((r) => r.seedIds.length === 0 || !r.seedIds.every((id) => hit(tagsOf(reg.practiceSeeds.get(id)))));
  for (const t of p.tasks) if (isOpen(t.status) && hit(t.tags)) { t.status = 'void'; events.push(voided(t.id, t.holderId, 'task', 'content')); }
  for (const x of p.punishments) if (isOpen(x.status) && hit(tagsOf(reg.holderPunishments.get(x.entryId)))) { x.status = 'void'; events.push(voided(x.id, x.holderId, 'punishment', 'content')); }
  for (const x of p.demonstrations) if ((x.status === 'offered' || x.status === 'open') && hit(x.tags)) { x.status = 'void'; events.push(voided(x.id, x.holderId, 'demonstration', 'content')); }
  if (p.held !== undefined && [...reg.bookingKinds.values()].some((k) => k.held === true && hit(tagsOf(k)))) events.push(endHold(draft, p, 'content'));
  const enabled = draft.content?.enabled ?? [];
  const needs = EFFECT_NEEDS.slap;
  if (p.slap !== undefined && needs.some((t) => changed.includes(t)) && !needs.some((t) => enabled.includes(t))) delete p.slap;
  if (p.permission !== undefined) {
    const rule = draft.bonds?.rules.find((r) => r.id === p.permission!.ruleId);
    if (rule !== undefined && hit(tagsOf(reg.relationshipRuleTemplates.get(rule.templateId)))) {
      if (rule.status === 'proposed' || rule.status === 'negotiating') delete p.permission;
      else delete p.permission.asked;
    } else if (rule === undefined) delete p.permission;
  }
  return events;
}
