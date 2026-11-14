import type { Registries } from '../../content/types';
import type { PunishmentEffect } from '../../content/schemas';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact, nextId } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { SEVERITIES } from '../relations/vocab';
import type { Application, CampaignState, DisciplineChannel, Inverse, Restriction } from '../state/types';
import { TUNING } from '../tuning';
import { countDeed } from './deeds';
import { perceptionOf, punishmentFor } from './perception';
import { captureInverse, disciplineOf, enforce } from './record';
import { addRestriction, dutySlot } from './restrictions';

export { perceptionOf } from './perception';

type Effects = PunishmentEffect[];
const effectsOf = (reg: Registries, measure: string): Effects => (punishmentFor(reg, measure)?.sideEffects as Effects | undefined) ?? [];
const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** The restriction kind a punishment imposes, if any (read from its side effects, not from its id). */
const restrictionKind = (e: PunishmentEffect): Restriction['kind'] | null =>
  e.type === 'confine' ? 'confined' : e.type === 'no_leave' ? 'no_leave' : e.type === 'bench' ? 'benched' : e.type === 'duty' ? 'duty' : null;

/**
 * Why this punishment cannot be imposed on her now, or `null`: she is a named, living unit, the measure is in the registry,
 * it was not imposed on her already today, `days` fits the entry's range and she is not already under the restriction it brings.
 */
export function checkPunish(state: CampaignState, reg: Registries, unitId: string, measure: string, days?: number): string | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || !state.relations[unitId]) return `Unknown unit "${unitId}".`;
  if (unit.kind !== 'named') return `${unit.displayName} is a grunt: grunts are not disciplined this way.`;
  if (!isLiving(unit)) return `${unit.displayName} is no longer in service.`;
  const pun = punishmentFor(reg, measure);
  if (!pun) return `Unknown punishment "${measure}".`;
  const label = String(pun.label);
  if (state.discipline?.applications.some((a) => a.unitId === unitId && a.measure === measure && a.day === state.day)) {
    return `${unit.displayName} was already given ${label} today.`;
  }
  const effects = effectsOf(reg, measure);
  const confine = effects.find((e) => e.type === 'confine');
  if (days !== undefined && confine && (!Number.isInteger(days) || days < confine.minDays || days > confine.maxDays)) {
    return `${label} lasts ${confine.minDays} to ${confine.maxDays} days.`;
  }
  for (const e of effects) {
    const kind = restrictionKind(e);
    if (!kind) continue;
    const under = state.discipline?.restrictions.some((r) => r.unitId === unitId && r.kind === kind
      && (kind === 'benched' || (kind === 'duty' ? r.day === dutySlot(state).day && r.slot === dutySlot(state).slot : (r.untilDay ?? -1) >= state.day)));
    if (under) return `${unit.displayName} is already under ${label}.`;
  }
  return null;
}

export interface PunishParams {
  unitId: string;
  measure: string;
  /** Days of a confinement; the shortest when absent. */
  days?: number;
  source: 'menu' | 'dialogue';
  channel: DisciplineChannel;
  sceneId?: string;
  messageRef?: string;
}

/**
 * Imposes a punishment (P9): the engine-made `commander_enforced` goes through the delta chain (her row × perception,
 * state, defect and disposition modifiers, image consistency), the deterrence moves her record, held defiance goes and a
 * matching threat is kept (`enforce`), the side effects happen, and an `Application` stores everything that changed so UNDO
 * can put exactly that back. Throws when `checkPunish` says no. Draws no rng. A menu application also writes a public fact.
 */
export function applyPunishment(draft: CampaignState, ctx: EngineCtx, p: PunishParams): EngineEvent[] {
  const reg = ctx.registries;
  const why = checkPunish(draft, reg, p.unitId, p.measure, p.days);
  if (why) throw new Error(why);
  const pun = punishmentFor(reg, p.measure)!;
  const unit = draft.squad.find((u) => u.id === p.unitId)!;
  const severity = Number(pun.severity) as 1 | 2 | 3 | 4;
  const id = nextId(draft, 'ap');
  const events: EngineEvent[] = [];
  const extra: Inverse = {};
  if (draft.discipline === undefined) extra.createdDiscipline = true;

  const { events: changed, inverse } = captureInverse(draft, p.unitId, () => {
    const out = applyEventToUnit(draft, reg, p.unitId, {
      type: 'commander_enforced', actor: 'commander', targets: [p.unitId], severity: SEVERITIES[severity - 1], measure: p.measure,
      evidence: `imposed ${String(pun.label)}`, confidence: 1,
    });
    const k = perceptionOf(reg, unit, pun);
    const enforced = enforce(draft, ctx, p.unitId, { measure: p.measure, severity, recordDelta: Math.round(Number(pun.impunityDelta) * k) });
    out.push(...enforced.events);
    countDeed(draft, `punish_${severity}` as 'punish_1');
    if (enforced.removed.defiance) extra.defiance = enforced.removed.defiance;
    if (enforced.removed.threat) extra.threat = enforced.removed.threat;
    // the side effects
    for (const fx of effectsOf(reg, p.measure)) {
      const kind = restrictionKind(fx);
      if (kind) {
        const base = { unitId: p.unitId, kind, applicationId: id } as Restriction;
        if (fx.type === 'confine') base.untilDay = draft.day + (p.days ?? fx.minDays);
        else if (fx.type === 'no_leave') base.untilDay = draft.day + fx.days;
        else if (fx.type === 'duty') Object.assign(base, dutySlot(draft));
        out.push(...addRestriction(draft, base));
        extra.restrictionIds = [id];
      } else if (fx.type === 'resource') {
        const before = draft.resources[fx.resource];
        draft.resources[fx.resource] = Math.max(0, before + fx.amount);
        const delta = draft.resources[fx.resource] - before;
        if (delta !== 0) {
          out.push({ type: 'resource_changed', resource: fx.resource, amount: delta });
          extra.resources = { ...(extra.resources ?? {}), [fx.resource]: delta };
        }
      }
    }
    // her bands and states follow the new numbers now, so UNDO can put back what this application moved
    out.push(...evaluateAutomatic(draft, reg, p.unitId));
    return out;
  });
  events.push(...changed);

  const d = disciplineOf(draft);
  const app: Application = {
    id, unitId: p.unitId, measure: p.measure, source: p.source, channel: p.channel, day: draft.day,
    ...(p.sceneId !== undefined ? { sceneId: p.sceneId } : {}), ...(p.messageRef !== undefined ? { messageRef: p.messageRef } : {}),
    inverse: { ...inverse, ...extra },
  };
  // a menu application is a public act; a dialogue one is already in the transcript and the scene summary
  if (p.source === 'menu') {
    app.inverse.factId = addFact(draft, {
      about: [p.unitId], text: `The commander imposed ${String(pun.label)} on ${nameOf(draft, p.unitId)}.`, tags: ['discipline'], importance: 3,
      day: draft.day, knownBy: ['*'], ...(p.sceneId ? { sceneId: p.sceneId } : {}),
    }).id;
  }
  d.applications = [...d.applications, app].slice(-TUNING.impunity.applicationsMax);
  events.push({ type: 'discipline_applied', applicationId: id, unitId: p.unitId, measure: p.measure, source: p.source });
  return events;
}
