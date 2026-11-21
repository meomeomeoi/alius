/**
 * P15: the expectation profile (plan R6): what she expects of the commander and what she wants to see, imported from her card, editable and
 * lockable. `validateExpectations` reads untrusted data field by field; `expectationsOf` is the reader the engine uses (the profile minus the
 * worship targets whose content gate is closed). In play it is hidden: it becomes known only through a fact tagged `expect:<field>`.
 */
import type { Registries } from '../../content/types';
import { RESPONSE_TYPES, type ResponseType } from '../blocking/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';
import type { HoldsUntil } from '../physics/state';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';

export const ATTITUDES = ['craves', 'enjoys', 'indifferent', 'dislikes'] as const;
export type Attitude = (typeof ATTITUDES)[number];
export const MEANINGS = ['reward', 'duty', 'humiliation', 'intimacy', 'play', 'comfort'] as const;
export type Meaning = (typeof MEANINGS)[number];
export const BODY_FEELINGS = ['proud', 'ashamed', 'indifferent'] as const;
export type BodyFeeling = (typeof BODY_FEELINGS)[number];
export const HYGIENE = ['meticulous', 'normal', 'lax'] as const;
export const HAIR = ['short', 'bob', 'long', 'tail'] as const;
export const HOLDS_UNTIL: readonly HoldsUntil[] = ['signal', 'limit', 'blackout'];

export interface ExpectationProfile {
  moments?: Record<string, { type: ResponseType; strength: 1 | 2 | 3 }>;
  /** Added to her style's point in the (readiness, friction) plane, −0.3…0.3. */
  offset?: { r: number; f: number };
  tells?: { irritation?: string; pleasure?: string };
  holdsUntil?: HoldsUntil;
  worship?: Record<string, { attitude: Attitude; how?: string; meaning?: Meaning }>;
  body?: Record<string, BodyFeeling>;
  scent?: { base?: Record<string, 1 | 2 | 3 | 4 | 5>; hygiene?: (typeof HYGIENE)[number] };
  /** Weights 0–1 of the three builds the body map blends. */
  build?: { slim: number; athletic: number; curvy: number };
  hair?: (typeof HAIR)[number];
  traits?: string[];
}

/** The top-level fields of a profile (a lock may name one; `moments.<sourceId>` and `worship.<targetId>` name an entry). */
export const EXPECTATION_FIELDS = ['moments', 'offset', 'tells', 'holdsUntil', 'worship', 'body', 'scent', 'build', 'hair', 'traits'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A pronoun for the commander (lore §0): a text that has one is dropped, never rewritten. */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;

/** Strips control characters (a line break or a tab reads as a space) and collapses spaces. */
const clean = (v: string): string => v.replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Reads an expectation profile from untrusted data. A field that is not legal is dropped and named in `issues`; an unknown id (a moment
 * source, a worship or body target) is dropped and named in `dropped` as `expectations:<field>.<id>`. With `ctx.state`, a worship target
 * whose content gate is closed (a category switched off, or one of HER limits) is dropped too; without it the structure alone is read. Texts
 * are cleaned, cut, and dropped whole when they carry a pronoun for the commander. Never throws.
 */
export function validateExpectations(
  raw: unknown, reg: Registries, ctx: { state?: ContentHolder; unitId?: string },
): { expectations?: ExpectationProfile; issues: string[]; dropped: string[] } {
  const issues: string[] = [];
  const dropped: string[] = [];
  if (raw === undefined) return { issues, dropped };
  if (!isObj(raw)) return { issues: ['expectations must be an object'], dropped };
  const out: ExpectationProfile = {};
  const L = TUNING.dynamic.profile;
  const drop = (field: string, id: string, why: string): void => {
    issues.push(`expectations.${field} ${why} "${id}"`);
    dropped.push(`expectations:${field}.${id}`);
  };
  const text = (field: string, v: unknown, max: number): string | undefined => {
    if (typeof v !== 'string') return void issues.push(`expectations.${field} must be text`);
    const t = clean(v);
    if (t === '') return undefined;
    if (COMMANDER_PRONOUN.test(t)) return void issues.push(`expectations.${field} has a pronoun for the commander and was dropped`);
    if (t.length > max) issues.push(`expectations.${field} was cut to ${max} characters`);
    return t.slice(0, max).trim();
  };
  const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const target = (id: string) => reg.worshipTargets.get(id);
  const open = (id: string): boolean => ctx.state === undefined || contentAllowed(ctx.state, reg, target(id)!, ctx.unitId);

  for (const key of Object.keys(raw)) if (!(EXPECTATION_FIELDS as readonly string[]).includes(key)) issues.push(`expectations has no field "${key}"`);

  if (raw.moments !== undefined) {
    if (!isObj(raw.moments)) issues.push('expectations.moments must be an object');
    else {
      const moments: NonNullable<ExpectationProfile['moments']> = {};
      for (const [id, m] of Object.entries(raw.moments)) {
        const source = reg.momentSources.get(id);
        if (source === undefined) { drop('moments', id, 'names unknown moment source'); continue; }
        const type = isObj(m) ? m.type : undefined;
        const strength = isObj(m) ? m.strength : undefined;
        const offered = ((source.frame as Array<{ type?: unknown }> | undefined) ?? []).map((o) => o.type);
        if (typeof type !== 'string' || !(RESPONSE_TYPES as readonly string[]).includes(type)) { issues.push(`expectations.moments.${id}.type must be one of ${RESPONSE_TYPES.join(', ')}`); continue; }
        if (!offered.includes(type)) { issues.push(`expectations.moments.${id}: that moment does not offer "${type}"`); continue; }
        if (strength !== 1 && strength !== 2 && strength !== 3) { issues.push(`expectations.moments.${id}.strength must be 1, 2 or 3`); continue; }
        moments[id] = { type: type as ResponseType, strength };
      }
      if (Object.keys(moments).length > 0) out.moments = moments;
    }
  }

  if (raw.offset !== undefined) {
    const r = isObj(raw.offset) ? num(raw.offset.r, -L.offsetMax, L.offsetMax) : undefined;
    const f = isObj(raw.offset) ? num(raw.offset.f, -L.offsetMax, L.offsetMax) : undefined;
    if (r === undefined || f === undefined) issues.push('expectations.offset needs numbers r and f');
    else {
      if (isObj(raw.offset) && (Math.abs(Number(raw.offset.r)) > L.offsetMax || Math.abs(Number(raw.offset.f)) > L.offsetMax)) issues.push(`expectations.offset was clamped to ±${L.offsetMax}`);
      out.offset = { r, f };
    }
  }

  if (raw.tells !== undefined) {
    if (!isObj(raw.tells)) issues.push('expectations.tells must be an object');
    else {
      const tells: NonNullable<ExpectationProfile['tells']> = {};
      for (const k of ['irritation', 'pleasure'] as const) {
        if (raw.tells[k] === undefined) continue;
        const t = text(`tells.${k}`, raw.tells[k], L.tellMax);
        if (t !== undefined) tells[k] = t;
      }
      for (const k of Object.keys(raw.tells)) if (k !== 'irritation' && k !== 'pleasure') issues.push(`expectations.tells has no field "${k}"`);
      if (Object.keys(tells).length > 0) out.tells = tells;
    }
  }

  if (raw.holdsUntil !== undefined) {
    if (typeof raw.holdsUntil === 'string' && (HOLDS_UNTIL as readonly string[]).includes(raw.holdsUntil)) out.holdsUntil = raw.holdsUntil as HoldsUntil;
    else issues.push(`expectations.holdsUntil must be one of ${HOLDS_UNTIL.join(', ')}`);
  }

  if (raw.worship !== undefined) {
    if (!isObj(raw.worship)) issues.push('expectations.worship must be an object');
    else {
      const worship: NonNullable<ExpectationProfile['worship']> = {};
      for (const [id, w] of Object.entries(raw.worship)) {
        if (target(id) === undefined) { drop('worship', id, 'names unknown target'); continue; }
        if (!open(id)) { drop('worship', id, 'names a target that is closed here:'); continue; }
        if (!isObj(w) || typeof w.attitude !== 'string' || !(ATTITUDES as readonly string[]).includes(w.attitude)) { issues.push(`expectations.worship.${id}.attitude must be one of ${ATTITUDES.join(', ')}`); continue; }
        const entry: NonNullable<ExpectationProfile['worship']>[string] = { attitude: w.attitude as Attitude };
        if (w.how !== undefined) {
          const how = text(`worship.${id}.how`, w.how, L.howMax);
          if (how !== undefined) entry.how = how;
        }
        if (w.meaning !== undefined) {
          if (typeof w.meaning === 'string' && (MEANINGS as readonly string[]).includes(w.meaning)) entry.meaning = w.meaning as Meaning;
          else issues.push(`expectations.worship.${id}.meaning must be one of ${MEANINGS.join(', ')}`);
        }
        worship[id] = entry;
      }
      if (Object.keys(worship).length > 0) out.worship = worship;
    }
  }

  if (raw.body !== undefined) {
    if (!isObj(raw.body)) issues.push('expectations.body must be an object');
    else {
      const body: NonNullable<ExpectationProfile['body']> = {};
      for (const [id, v] of Object.entries(raw.body)) {
        if (target(id) === undefined) { drop('body', id, 'names unknown target'); continue; }
        if (typeof v === 'string' && (BODY_FEELINGS as readonly string[]).includes(v)) body[id] = v as BodyFeeling;
        else issues.push(`expectations.body.${id} must be one of ${BODY_FEELINGS.join(', ')}`);
      }
      if (Object.keys(body).length > 0) out.body = body;
    }
  }

  if (raw.scent !== undefined) {
    if (!isObj(raw.scent)) issues.push('expectations.scent must be an object');
    else {
      const scent: NonNullable<ExpectationProfile['scent']> = {};
      if (raw.scent.base !== undefined) {
        if (!isObj(raw.scent.base)) issues.push('expectations.scent.base must be an object');
        else {
          const base: Record<string, 1 | 2 | 3 | 4 | 5> = {};
          for (const [id, v] of Object.entries(raw.scent.base)) {
            if (target(id) === undefined) { drop('scent', id, 'names unknown target'); continue; }
            if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) base[id] = v as 1 | 2 | 3 | 4 | 5;
            else issues.push(`expectations.scent.base.${id} must be 1 to 5`);
          }
          if (Object.keys(base).length > 0) scent.base = base;
        }
      }
      if (raw.scent.hygiene !== undefined) {
        if (typeof raw.scent.hygiene === 'string' && (HYGIENE as readonly string[]).includes(raw.scent.hygiene)) scent.hygiene = raw.scent.hygiene as (typeof HYGIENE)[number];
        else issues.push(`expectations.scent.hygiene must be one of ${HYGIENE.join(', ')}`);
      }
      if (Object.keys(scent).length > 0) out.scent = scent;
    }
  }

  if (raw.build !== undefined) {
    const b = isObj(raw.build) ? raw.build : {};
    const slim = num(b.slim, 0, 1);
    const athletic = num(b.athletic, 0, 1);
    const curvy = num(b.curvy, 0, 1);
    if (slim === undefined || athletic === undefined || curvy === undefined) issues.push('expectations.build needs the weights slim, athletic and curvy');
    else out.build = { slim, athletic, curvy };
  }

  if (raw.hair !== undefined) {
    if (typeof raw.hair === 'string' && (HAIR as readonly string[]).includes(raw.hair)) out.hair = raw.hair as (typeof HAIR)[number];
    else issues.push(`expectations.hair must be one of ${HAIR.join(', ')}`);
  }

  if (raw.traits !== undefined) {
    if (!Array.isArray(raw.traits)) issues.push('expectations.traits must be a list');
    else {
      const traits: string[] = [];
      for (const [i, t] of raw.traits.entries()) {
        const v = text(`traits[${i}]`, t, L.traitMax);
        if (v !== undefined && !traits.includes(v)) traits.push(v);
      }
      if (traits.length > L.traitsMax) issues.push(`expectations.traits was cut to ${L.traitsMax}`);
      if (traits.length > 0) out.traits = traits.slice(0, L.traitsMax);
    }
  }

  return { ...(Object.keys(out).length > 0 ? { expectations: out } : {}), issues, dropped };
}

/**
 * Her profile as the engine reads it: what is stored, minus the worship, body and scent entries of targets whose content gate is closed
 * (a category switched off, or one of her limits). `{}` when nothing is stored or she is not a named unit. Nothing is rewritten, so a
 * target that opens again reads again.
 */
export function expectationsOf(state: Pick<CampaignState, 'squad' | 'content'>, reg: Registries, unitId: string): ExpectationProfile {
  const unit = state.squad.find((u) => u.id === unitId);
  const stored = unit?.kind === 'named' ? unit.expectations : undefined;
  if (stored === undefined) return {};
  const out = structuredClone(stored);
  const open = (id: string): boolean => {
    const t = reg.worshipTargets.get(id);
    return t !== undefined && contentAllowed(state, reg, t, unitId);
  };
  const keep = <T>(rec: Record<string, T> | undefined): Record<string, T> | undefined =>
    rec === undefined ? undefined : Object.fromEntries(Object.entries(rec).filter(([id]) => open(id)));
  if (out.worship !== undefined) out.worship = keep(out.worship);
  if (out.body !== undefined) out.body = keep(out.body);
  if (out.scent?.base !== undefined) out.scent = { ...out.scent, base: keep(out.scent.base) };
  return out;
}

/** Is this field locked? `field` is a top-level field or `worship.<targetId>` / `moments.<sourceId>`; a lock on the whole field covers every id under it. */
export function lockedExpectation(unit: Pick<Unit, 'expectationLocks'>, field: string): boolean {
  const locks = unit.expectationLocks ?? [];
  return locks.includes(field) || locks.includes(field.split('.')[0]);
}

/**
 * A re-import of the profile keeps what she locked: a locked top-level field of `old` replaces the same field of `next`, and a locked
 * `worship.<id>` / `moments.<id>` replaces that one entry (an entry `old` lacks is removed from `next`). Pure; nothing is changed in place.
 */
export function keepLockedExpectations(old: ExpectationProfile | undefined, next: ExpectationProfile | undefined, locks: readonly string[]): ExpectationProfile | undefined {
  if (locks.length === 0) return next;
  const out = structuredClone(next ?? {}) as Record<string, unknown>;
  const was = (old ?? {}) as Record<string, unknown>;
  for (const f of locks) {
    const [head, id] = f.split('.');
    if (id === undefined) {
      if (was[head] !== undefined) out[head] = structuredClone(was[head]);
      else delete out[head];
      continue;
    }
    const rec = { ...(out[head] as Record<string, unknown> | undefined) };
    const oldEntry = (was[head] as Record<string, unknown> | undefined)?.[id];
    if (oldEntry !== undefined) rec[id] = structuredClone(oldEntry);
    else delete rec[id];
    if (Object.keys(rec).length > 0) out[head] = rec;
    else delete out[head];
  }
  return Object.keys(out).length > 0 ? (out as ExpectationProfile) : undefined;
}

/**
 * The raw result of a patch on her profile (not yet validated): `worship` and `moments` merge per id, every other field is replaced whole,
 * and `null` removes a field or an id. The one merge the action and the editors share; pass the result to `validateExpectations`.
 */
export function mergeExpectations(have: ExpectationProfile | undefined, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...have };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else if ((k === 'worship' || k === 'moments') && isObj(v)) {
      const rec: Record<string, unknown> = { ...(merged[k] as Record<string, unknown> | undefined) };
      for (const [id, entry] of Object.entries(v)) {
        if (entry === null) delete rec[id];
        else rec[id] = entry;
      }
      if (Object.keys(rec).length > 0) merged[k] = rec;
      else delete merged[k];
    } else merged[k] = v;
  }
  return merged;
}
