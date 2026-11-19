import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import type { Appraisal, AppraisalRole, CampaignState, Reading, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { flipReading, misreads, readingOf } from './misread';
import { matchRules, accumulate } from './rules';
import { developmentMode, ensureDevelopment, nextDevId } from './state';

/**
 * Appraisal (P14b): an event as one soldier read it. The model reads the events of a conversation (`EventIntent.reading`); an
 * engine-made event, an activity and a dilemma carry a registry row instead. Recording draws nothing: a campaign with development
 * off records nothing at all, and `state.rng` is never touched.
 */

/** The reading of an event: the model's own, else the `eventDeltas` row's; null when neither exists (nothing is recorded). */
export function readingFor(reg: Registries, event: Pick<EventIntent, 'type' | 'reading'>): Reading | null {
  if (event.reading) return event.reading;
  const row = reg.eventDeltas.get(event.type)?.appraisal as Reading | undefined;
  return row ?? null;
}

const nameOf = (state: CampaignState, subject: string): string =>
  subject === 'commander' ? state.commander.name : (state.squad.find((u) => u.id === subject)?.displayName ?? subject);

/** `"<role> · <kind> · <subject name> · wanted <w>, harm <h>, outcome <o>"`, plus the evidence cut to 60 characters, in all at most `summaryMax`. */
export function summaryOf(state: CampaignState, a: Pick<Appraisal, 'role' | 'kind' | 'subject' | 'wanted' | 'harm' | 'outcome'>, evidence?: string): string {
  const head = `${a.role} · ${a.kind} · ${nameOf(state, a.subject)} · wanted ${a.wanted}, harm ${a.harm}, outcome ${a.outcome}`;
  const quote = evidence !== undefined && evidence.trim() !== '' ? `: "${evidence.replace(/\s+/g, ' ').trim().slice(0, 60)}"` : '';
  return `${head}${quote}`.slice(0, TUNING.development.summaryMax);
}

export interface Seen {
  kind: string;
  target: string;
  role: AppraisalRole;
  subject: string;
  reading: Reading;
  severity: Severity;
  evidence?: string;
  sceneId?: string;
  /** The event's own tags (a `like:{tag}` push takes these). */
  tags?: string[];
}

/**
 * Stores one appraisal for one named, living soldier (the oldest past `pendingMax` falls out). Everything else this package
 * does with it (the accumulators, a misreading) hangs off this one place. Returns the event, or [] when it recorded nothing.
 */
export function pushAppraisal(draft: CampaignState, reg: Registries, unitId: string, seen: Seen): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return [];
  const dev = ensureDevelopment(unit);
  const a: Appraisal = {
    id: nextDevId(dev, 'ap'), day: draft.day, kind: seen.kind, target: seen.target, role: seen.role, ...seen.reading, severity: seen.severity,
    ...(seen.sceneId !== undefined ? { sceneId: seen.sceneId } : {}), subject: seen.subject, pushes: [],
    summary: '',
  };
  // a witness may misread (only a clear yes or no): she keeps the flipped reading and the true one, until the truth reaches her
  const misread = a.role === 'witness' && (a.wanted === 'yes' || a.wanted === 'no') && misreads(draft, unit, a.id, a.subject);
  if (misread) {
    a.truth = readingOf(a);
    Object.assign(a, flipReading(a.truth));
    a.misread = true;
  }
  a.summary = summaryOf(draft, a, seen.evidence);
  a.pushes = accumulate(unit, matchRules(draft, reg, unit, a, seen.tags ?? []));
  if (misread) {
    (dev.misread ??= []).push(structuredClone(a));
    if (dev.misread.length > TUNING.development.misreadMax) dev.misread.splice(0, dev.misread.length - TUNING.development.misreadMax);
  }
  dev.pending.push(a);
  if (dev.pending.length > TUNING.development.pendingMax) dev.pending.splice(0, dev.pending.length - TUNING.development.pendingMax);
  return [{ type: 'appraisal_recorded', unitId, appraisalId: a.id, role: a.role }];
}

/**
 * A soldier takes an event as its subject (it happened to her) or as its actor (she did it to the commander). `applyEventToUnit`
 * calls this, so every caller is covered: punishments, demands, power moves, the leash, a her-call.
 */
export function recordAppraisal(
  draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, role: 'subject' | 'actor', opts: { sceneId?: string } = {},
): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const reading = readingFor(reg, event);
  if (!reading) return [];
  const sceneId = opts.sceneId ?? draft.scene?.id;
  return pushAppraisal(draft, reg, unitId, {
    kind: event.type, target: role === 'actor' ? 'commander' : 'her', role, subject: role === 'actor' ? 'commander' : unitId,
    reading, severity: event.severity, evidence: event.evidence, tags: event.tags ?? [], ...(sceneId !== undefined ? { sceneId } : {}),
  });
}

/**
 * The other named participants of a scene read the same event from the side: each who is neither its actor nor among the units
 * it landed on. Scene channel only (the caller). `target` is the first believed unit when the commander did it, else the commander.
 */
export function recordWitnesses(
  draft: CampaignState, reg: Registries, event: EventIntent, believed: string[], participants: string[], sceneId?: string,
): EngineEvent[] {
  if (developmentMode(draft) === 'off' || believed.length === 0) return [];
  const reading = readingFor(reg, event);
  if (!reading) return [];
  const subject = event.actor === 'commander' ? believed[0] : 'commander';
  const events: EngineEvent[] = [];
  for (const id of participants) {
    if (id === event.actor || believed.includes(id)) continue;
    events.push(...pushAppraisal(draft, reg, id, {
      kind: event.type, target: event.actor === 'commander' ? `unit:${believed[0]}` : 'commander', role: 'witness', subject,
      reading, severity: event.severity, evidence: event.evidence, tags: event.tags ?? [], ...(sceneId !== undefined ? { sceneId } : {}),
    }));
  }
  return events;
}

/** The companion of an activity reads it from its registry row (`activities[].appraisal`); an activity without one records nothing. */
export function recordActivity(draft: CampaignState, reg: Registries, unitId: string, activityId: string): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const reading = reg.activities.get(activityId)?.appraisal as Reading | undefined;
  if (!reading) return [];
  return pushAppraisal(draft, reg, unitId, { kind: `activity:${activityId}`, target: 'her', role: 'subject', subject: unitId, reading, severity: 'minor', tags: (reg.activities.get(activityId)?.appraisalTags as string[] | undefined) ?? [] });
}

/**
 * UNDO (P9): takes the appraisals an application recorded back out of `pending` / `misread` and subtracts what they pushed into the
 * accumulators (the pushes are stored as applied, after the clamp). An id that is no longer there (reviewed since) is skipped.
 */
export function removeAppraisals(draft: CampaignState, list: Array<{ unitId: string; id: string }>): void {
  for (const { unitId, id } of list) {
    const dev = draft.squad.find((u) => u.id === unitId)?.development;
    if (!dev) continue;
    const found = dev.pending.find((a) => a.id === id) ?? dev.misread?.find((a) => a.id === id);
    if (!found) continue;
    for (const p of found.pushes) {
      const next = (dev.acc[p.axis] ?? 0) - p.amount;
      if (Math.abs(next) < 1e-9) delete dev.acc[p.axis];
      else dev.acc[p.axis] = next;
    }
    dev.pending = dev.pending.filter((a) => a.id !== id);
    if (dev.misread) dev.misread = dev.misread.filter((a) => a.id !== id);
  }
}
