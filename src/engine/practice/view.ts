/**
 * What of a practice the commander may see (P16, plan R16, R24). The engine keeps every end, deadline and count it decided; a practice that runs "until she decides" (`noDuration`, a hidden hold,
 * a hidden count) shows none of them to any reader: the cards, the directives and the readings go through these. `practiceView` (Task 39) is what `Knowledge.practice` builds on. Reads only.
 */
import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOf } from '../dynamic/state';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { heldNow } from './held';
import { practiceLive } from './gate';
import { protocolRules } from './service';
import { severityWord, type AcceptForm, type HandoverKind, type HeldState, type OpenPunishment, type PermissionAnswer, type PunishmentStatus, type Task } from './state';

/** A task's deadline as the commander may see it: `null` while it runs with no duration (the sweep still settles it at the stored one). */
export function deadlineShown(task: Pick<Task, 'deadline' | 'noDuration'>): Task['deadline'] | null {
  return task.noDuration === true || task.deadline === undefined ? null : task.deadline;
}

/** The last held slot as the commander may see it: `null` while the hold is hidden (it still ends at the stored one). */
export function heldEndShown(held: Pick<HeldState, 'hidden' | 'until'>): HeldState['until'] | null {
  return held.hidden === true ? null : held.until;
}

/** Whether a punishment's count (the strokes, the number of a ceremony) is hers alone. */
export const countHidden = (p: Pick<OpenPunishment, 'hiddenCount'>): boolean => p.hiddenCount === true;

// --- the view the commander may read (Task 39, R24) -------------------------------------------------------------------------------------------------------------------------------------------


export interface TaskLine { id: string; kind: Task['kind']; summary: string | null; status: 'offered' | 'open'; acceptForm: AcceptForm; sealed: boolean; due: { day: number; slot?: Slot } | null; noDuration: boolean; handover?: HandoverKind }
export interface PunishmentLine {
  id: string; entryId: string | null; summary: string | null; status: Extract<PunishmentStatus, 'offered' | 'negotiating' | 'accepted'>; severity: 'light' | 'heavy' | 'harsh'; public: boolean; order: boolean; sealed: boolean;
  /** The steps of a ceremony she is holding, in her order: never the number the commander named. */
  ceremony?: Array<{ id: string; label: string; done: boolean }>;
}

/** What the commander may read of one holder's practices: no hidden end, count, flag, text of a sealed thing, roll or id of a request. */
export interface PracticeView {
  tasks: TaskLine[];
  punishments: PunishmentLine[];
  demonstrations: Array<{ id: string; summary: string; status: 'offered' | 'open' }>;
  /** The hold she keeps now: sensory or not, and the last slot of it unless it has no duration. */
  held: { sensory: boolean; until: { day: number; slot: Slot } | null } | null;
  /** Her favour as a word (`warm`, `even`, `cool`); absent in immersive mode. The number is never in the view. */
  favour?: 'warm' | 'even' | 'cool';
  protocol: string[];
  routine: string | null;
  permission: PermissionAnswer | null;
  postures: Array<{ postureId: string; name: string }>;
  handovers: Array<{ kind: HandoverKind; untilDay: number }>;
  records: Array<{ day: number; line: string }>;
}

/**
 * Her answer to a request for permission, or `null` while none stands (R13, R24): the answer of today, and a "not yet" until the day she named. Nothing is shown before the question was asked: the
 * answer never exists before it is given.
 */
export function permissionLine(state: Pick<CampaignState, 'practices' | 'day'>, unitId: string): PermissionAnswer | null {
  const asked = state.practices?.permission?.holderId === unitId ? state.practices.permission.asked : undefined;
  if (asked === undefined) return null;
  return asked.day === state.day || (asked.answer === 'wait' && (asked.untilDay ?? 0) > state.day) ? asked.answer : null;
}

const EMPTY: PracticeView = { tasks: [], punishments: [], demonstrations: [], held: null, protocol: [], routine: null, permission: null, postures: [], handovers: [], records: [] };
const text = (s: string): string => plainDraft(s).trim();

/**
 * What the commander may read of one woman's practices (R24): her tasks and discipline by summary (a sealed one only as sealed until it is opened; the ceremony's steps, never its number), the hold with no
 * end while it is hidden, her favour as a word, the forms she set, her routine, her answer to a request for permission once it was given, her names for postures, what stands in her hands and the record. A
 * woman who is not live has none of it (her practices are frozen). Reads only; draws nothing. `hidden` is immersive mode: no favour.
 */
export function practiceView(state: CampaignState, reg: Registries, unitId: string, opts: { hidden?: boolean } = {}): PracticeView {
  const p = state.practices;
  if (p === undefined || !practiceLive(state, reg, unitId)) return { ...EMPTY, tasks: [], punishments: [], demonstrations: [], protocol: [], postures: [], handovers: [], records: [] };
  const mine = <T extends { holderId: string }>(list: readonly T[]): T[] => list.filter((x) => x.holderId === unitId);
  const tasks: TaskLine[] = mine(p.tasks).flatMap((t) => {
    if ((t.status !== 'offered' && t.status !== 'open') || t.routine === true) return [];
    const sealedNow = t.sealed === true && t.status === 'offered';
    return [{
      id: t.id, kind: t.kind, summary: sealedNow ? null : text(t.summary), status: t.status, acceptForm: t.acceptForm, sealed: t.sealed === true, due: deadlineShown(t) ?? null, noDuration: t.noDuration === true,
      ...(t.handover !== undefined ? { handover: t.handover } : {}),
    }];
  });
  const routine = mine(p.tasks).find((t) => t.routine === true && t.status === 'open');
  const punishments: PunishmentLine[] = mine(p.punishments).filter((x) => x.status === 'offered' || x.status === 'negotiating' || x.status === 'accepted').map((x) => {
    const status = x.status as PunishmentLine['status'];
    const sealedNow = x.sealed === true && x.status === 'offered';
    const ceremony = x.ceremony === undefined ? undefined : x.ceremony.steps.map((id) => ({ id, label: String(reg.ceremonySteps.get(id)?.label ?? id), done: x.ceremony!.done.includes(id) }));
    return {
      id: x.id, entryId: sealedNow ? null : x.entryId, summary: sealedNow ? null : text(x.summary), status, severity: severityWord(x.severity), public: x.public === true, order: x.forUnitId !== undefined, sealed: x.sealed === true,
      ...(ceremony !== undefined ? { ceremony } : {}),
    };
  });
  const held = heldNow(state);
  const favour = dynamicOf(state, unitId)?.favour ?? 0;
  return {
    tasks,
    punishments,
    demonstrations: mine(p.demonstrations).filter((d) => d.status === 'offered' || d.status === 'open').map((d) => ({ id: d.id, summary: text(d.summary), status: d.status as 'offered' | 'open' })),
    held: held !== null && held.by === unitId ? { sensory: held.sensory, until: heldEndShown(held) } : null,
    ...(opts.hidden === true ? {} : { favour: favour >= TUNING.practice.kindnessAt ? 'warm' as const : favour <= TUNING.practice.refusalAt ? 'cool' as const : 'even' as const }),
    protocol: protocolRules(state, reg, unitId).filter((r) => r.status === 'active').map((r) => text(r.text)).filter((t) => t !== ''),
    routine: routine === undefined ? null : text(routine.summary),
    permission: permissionLine(state, unitId),
    postures: (p.postures[unitId] ?? []).map((x) => ({ postureId: x.postureId, name: x.name })),
    handovers: p.handovers.filter((x) => x.holderId === unitId).map((x) => ({ kind: x.kind, untilDay: x.untilDay })),
    records: p.records.filter((r) => r.holderId === unitId).map((r) => ({ day: r.day, line: text(r.line) })),
  };
}
