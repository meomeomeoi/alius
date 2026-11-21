import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState, Inverse } from '../state/types';
import { syncPublicity } from '../bonds/publicitySync';
import { removeAppraisals } from '../development/appraisal';
import { countDeed } from './deeds';
import { addRecord, disciplineOf, runUndone } from './record';
import { removeRestrictions } from './restrictions';

const RANGE = { trust: [0, 100], affinity: [-100, 100], attraction: [0, 100] } as const;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Why this application or threat cannot be undone now, or `null`. Only a punishment read from dialogue (never a menu
 * one) or a threat, on the day it was logged and, in a scene, while that scene is still open.
 */
export function canUndo(state: CampaignState, id: string): string | null {
  const d = state.discipline;
  if (id.startsWith('th')) {
    const t = d?.threats.find((x) => x.id === id);
    if (!t) return 'That threat is no longer pending.';
    return windowProblem(state, t);
  }
  const a = id.startsWith('ap') ? d?.applications.find((x) => x.id === id) : undefined;
  if (!a) return 'There is nothing to undo.';
  if (a.source !== 'dialogue') return 'Only a punishment read from dialogue can be undone.';
  return windowProblem(state, a);
}

function windowProblem(state: CampaignState, r: { day: number; channel: string; sceneId?: string }): string | null {
  if (r.day !== state.day) return 'It can only be undone on the day it was logged.';
  if (r.channel === 'scene' && (state.scene === undefined || state.scene.id !== r.sceneId)) return 'Its scene has ended.';
  return null;
}

/**
 * Puts back exactly what an application or a threat changed, and only that: its own axis, stress, record and resource
 * deltas (clamped; later changes stay), the history lines it wrote, the restrictions it started, the state and the loyalty
 * band it moved her to (only while she is still in them) and the defiance and threat it removed.
 */
function revertInverse(draft: CampaignState, ctx: EngineCtx, unitId: string, applicationId: string | null, inv: Inverse): EngineEvent[] {
  const events: EngineEvent[] = [];
  const rel = draft.relations[unitId];
  const unit = draft.squad.find((u) => u.id === unitId);
  if (rel) {
    for (const axis of ['trust', 'affinity', 'attraction'] as const) {
      const delta = inv.axes?.[axis];
      if (delta) rel[axis] = clamp(rel[axis] - delta, RANGE[axis][0], RANGE[axis][1]);
      const daily = inv.dailyGain?.[axis];
      if (daily) rel.dailyGain[axis] = Math.max(0, rel.dailyGain[axis] - daily);
    }
    if (inv.state && rel.stateId === inv.state.to) {
      rel.stateId = inv.state.from;
      rel.stateSince = inv.state.sinceFrom;
      events.push(...syncPublicity(draft, ctx.registries, unitId)); // P9d: publicity follows the restored state
      if (inv.publicity && draft.relations[unitId]?.publicity) rel.publicity = structuredClone(inv.publicity); // and is what it was, not a fresh default
    }
    if (inv.loyaltyBand && rel.loyaltyBand === inv.loyaltyBand.to) rel.loyaltyBand = inv.loyaltyBand.from;
    for (const line of [...(inv.history ?? [])].reverse()) {
      const at = rel.history.map((h) => JSON.stringify(h)).lastIndexOf(JSON.stringify(line));
      if (at >= 0) rel.history.splice(at, 1);
    }
    for (const { at, line } of inv.historyDropped ?? []) rel.history.splice(Math.min(at, rel.history.length), 0, structuredClone(line));
  }
  if (unit && inv.stress) unit.stress = clamp(unit.stress - inv.stress, 0, 100);
  if (inv.record) events.push(...addRecord(draft, unitId, -inv.record, 'undo'));
  for (const resource of ['credits', 'supplies', 'plyx'] as const) {
    const delta = inv.resources?.[resource];
    if (delta) draft.resources[resource] = Math.max(0, draft.resources[resource] - delta);
  }
  for (const [counter, n] of Object.entries(inv.deeds ?? {})) countDeed(draft, counter as 'protected', -n);
  if (inv.appraisals) removeAppraisals(draft, inv.appraisals); // P14b
  if (applicationId !== null && inv.restrictionIds) removeRestrictions(draft, (r) => r.applicationId === applicationId);
  const d = disciplineOf(draft);
  if (inv.defiance && !d.defiance.some((x) => x.unitId === unitId)) d.defiance.push(structuredClone(inv.defiance));
  if (inv.threat && !d.threats.some((x) => x.unitId === unitId)) d.threats.push(structuredClone(inv.threat));
  if (inv.dynamic) events.push(...runUndone(draft, ctx, unitId, inv.dynamic)); // P15: the struggle for the command the enforcement ended
  return events;
}

/** A save that had no discipline object looks untouched again once the last thing in it is gone. */
function tidy(draft: CampaignState, created: boolean | undefined): void {
  const d = draft.discipline;
  if (!created || !d) return;
  const empty = d.defiance.length + d.threats.length + d.applications.length + d.restrictions.length + d.demands.length + d.demandLog.length === 0
    && (d.sabotage === undefined || (d.sabotage.queued.length === 0 && d.sabotage.gear === undefined && d.sabotage.lastDay === undefined));
  if (empty) delete draft.discipline;
}

export function undoApplication(draft: CampaignState, ctx: EngineCtx, id: string): EngineEvent[] {
  const why = canUndo(draft, id);
  if (why) throw new Error(why);
  const d = disciplineOf(draft);
  const app = d.applications.find((a) => a.id === id)!;
  d.applications = d.applications.filter((a) => a.id !== id);
  const events = revertInverse(draft, ctx, app.unitId, app.id, app.inverse);
  tidy(draft, app.inverse.createdDiscipline);
  return [{ type: 'discipline_undone', id, unitId: app.unitId }, ...events];
}

export function undoThreat(draft: CampaignState, ctx: EngineCtx, id: string): EngineEvent[] {
  const why = canUndo(draft, id);
  if (why) throw new Error(why);
  const d = disciplineOf(draft);
  const threat = d.threats.find((t) => t.id === id)!;
  d.threats = d.threats.filter((t) => t.id !== id);
  const events = revertInverse(draft, ctx, threat.unitId, null, threat.inverse);
  tidy(draft, threat.inverse.createdDiscipline);
  return [{ type: 'discipline_undone', id, unitId: threat.unitId }, ...events];
}
