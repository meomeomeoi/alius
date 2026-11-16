import type { Registries } from '../../content/types';
import { unitStats } from '../combat/stats';
import { commandStance } from '../discipline/stance';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { leaderOf } from '../power/state';
import type { CampaignState, SquadSecret } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { nextPersonalId, personalOf } from './state';

export { heldTerm, secretsKnownBy } from './state';

/**
 * Squad secrets (P9c §5): things the squad keeps from the commander. A kept secret is NOT a `Fact` (P3's "the commander always
 * knows a fact" stays true); it lives in `personal.secrets` and becomes a fact only when the commander learns it and answers.
 * Its text never reaches an event, a log line or a reading while it is kept. Sources are deterministic and draw no rng.
 */

export const SECRET_ANSWERS = ['confront', 'pretend', 'use'] as const;
export type SecretAnswer = (typeof SECRET_ANSWERS)[number];

const unitOf = (state: CampaignState, id: string) => state.squad.find((u) => u.id === id);
const namedLiving = (state: CampaignState, id: string): boolean => {
  const u = unitOf(state, id);
  return u !== undefined && u.kind === 'named' && isLiving(u);
};

/** The first kind of a source (secret kinds are read by `source`, never by id). */
const kindOfSource = (reg: Registries, source: string) => [...reg.secretKinds.values()].find((k) => k.source === source);

/**
 * Stores a secret of the kind, known by the named living units among `knownBy` (nobody to know it = nothing is stored). A
 * secret about a unit is not stored again while an earlier one of the same kind about her is still open. `vars` fill `{name}`
 * and `{leader}` (default: the subject's name). Draws no rng; the event carries ids, never the text.
 */
export function addSecret(
  draft: CampaignState, reg: Registries, p: { kindId: string; knownBy: string[]; subjectId?: string; vars?: Record<string, string> },
): EngineEvent[] {
  const kind = reg.secretKinds.get(p.kindId);
  if (!kind) return [];
  const knownBy = [...new Set(p.knownBy)].filter((id) => namedLiving(draft, id));
  if (knownBy.length === 0) return [];
  const open = (draft.personal?.secrets ?? []).some((x) => x.kindId === kind.id && p.subjectId !== undefined && x.subjectId === p.subjectId && (x.status === 'kept' || x.status === 'found' || x.status === 'pretend'));
  if (open) return [];
  const subject = p.subjectId === undefined ? '' : unitOf(draft, p.subjectId)?.displayName ?? '';
  const text = String(kind.text).replaceAll('{name}', p.vars?.name ?? subject).replaceAll('{leader}', p.vars?.leader ?? subject);
  const personal = personalOf(draft);
  const secret: SquadSecret = {
    id: nextPersonalId(draft, 'sx'), kindId: kind.id, text, ...(p.subjectId !== undefined ? { subjectId: p.subjectId } : {}),
    knownBy, reason: kind.reason as SquadSecret['reason'], day: draft.day, status: 'kept',
  };
  (personal.secrets ??= []).push(secret);
  return [{ type: 'secret_kept', secretId: secret.id, kindId: kind.id }];
}

/**
 * A run ends: a named party member at or under a quarter of her HP, whose command stance hides injuries, keeps it from the
 * commander, and the other named members who saw it keep it with her. Units who were carried back or died are no secret. No draw.
 */
export function hideInjuries(draft: CampaignState, reg: Registries, party: string[], visible: string[] = []): EngineEvent[] {
  const kind = kindOfSource(reg, 'hidden_injury');
  if (!kind) return [];
  const units = party.map((id) => unitOf(draft, id)).filter((u): u is NonNullable<typeof u> => u !== undefined && namedLiving(draft, u.id));
  if (units.length < 2) return [];
  const events: EngineEvent[] = [];
  for (const unit of units) {
    if (visible.includes(unit.id)) continue;
    const stance = commandStance(draft, reg, unit.id);
    if (stance === null || reg.commandStances.get(stance)?.hidesInjury !== true) continue;
    if (unit.currentHp / unitStats(draft, reg, unit).hp > TUNING.personal.secret.hiddenInjuryHp) continue;
    events.push(...addSecret(draft, reg, { kindId: String(kind.id), knownBy: units.map((u) => u.id), subjectId: unit.id, vars: { name: unit.displayName } }));
  }
  return events;
}

/** The day step's secret part: the successor secret, once a leader has held the squad for a week. Writes nothing while nobody leads. */
export function secretDayStep(draft: CampaignState, reg: Registries): EngineEvent[] {
  const leader = leaderOf(draft);
  const p = draft.personal;
  if (!leader) {
    if (p?.leaderSince) delete p.leaderSince;
    return [];
  }
  if (p?.leaderSince?.unitId !== leader.id) {
    personalOf(draft).leaderSince = { unitId: leader.id, day: draft.day };
    return [];
  }
  if (draft.day - p.leaderSince.day < TUNING.personal.secret.successorDays) return [];
  const kind = kindOfSource(reg, 'successor');
  if (!kind || p.secrets?.some((x) => x.kindId === kind.id && x.subjectId === leader.id)) return [];
  const everyone = draft.squad.filter((u) => namedLiving(draft, u.id)).map((u) => u.id);
  return addSecret(draft, reg, { kindId: String(kind.id), knownBy: everyone, subjectId: leader.id, vars: { leader: leader.displayName } });
}

/**
 * The commander's answer to a secret that came out (`found`): confront everyone (record −5 for each who knew, `secret_confronted`
 * on every named living unit, a public fact), pretend not to know (a fact only the commander has) or use it (a fact the knowers
 * share, and the `held` term of their Impunity for 14 days).
 */
export function respondSecret(draft: CampaignState, ctx: EngineCtx, secretId: string, choice: SecretAnswer): EngineEvent[] {
  const secret = draft.personal?.secrets?.find((x) => x.id === secretId);
  if (!secret) throw new Error('There is no such secret.');
  if (!SECRET_ANSWERS.includes(choice)) throw new Error('A secret is answered with confront, pretend or use.');
  if (secret.status !== 'found') throw new Error('That secret has not come out.');
  const reg = ctx.registries;
  const kind = reg.secretKinds.get(secret.kindId);
  const importance = (Number(kind?.importance ?? 3) as 1 | 2 | 3 | 4 | 5);
  const about = secret.subjectId !== undefined ? [secret.subjectId] : [];
  const events: EngineEvent[] = [];
  const fact = (knownBy: string[]) => addFact(draft, { about, text: secret.text, tags: ['secret'], importance, day: draft.day, knownBy });
  if (choice === 'confront') {
    for (const id of secret.knownBy) if (namedLiving(draft, id)) events.push(...addRecord(draft, id, -TUNING.personal.secret.confrontRecord, 'secret'));
    for (const u of draft.squad) if (namedLiving(draft, u.id)) events.push(...hitHer(draft, reg, u.id, 'secret_confronted', 'minor', 'the squad was confronted about what it kept back'));
    fact(['*']);
    secret.status = 'confronted';
  } else if (choice === 'pretend') {
    fact([]);
    secret.status = 'pretend';
  } else {
    fact([...secret.knownBy]);
    secret.status = 'used';
    secret.usedUntil = draft.day + TUNING.personal.secret.usedDays;
  }
  events.push({ type: 'secret_answered', secretId, choice });
  return events;
}
