import type { Registries } from '../../content/types';
import type { Bond, CampaignState, DesireLevel, LeadStyle, Unit } from '../state/types';
import { TUNING } from '../tuning';

/** Ranked weakest first: `leadRank` makes "at least assertive" a rank test. */
export const LEAD_STYLES = ['yielding', 'balanced', 'assertive', 'dominant'] as const satisfies readonly LeadStyle[];
export const ATTACHMENTS = ['slow', 'steady', 'intense', 'avoidant'] as const;
export const DESIRE_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly DesireLevel[];
export const PUBLICITY_LEVELS = ['secret', 'known', 'public'] as const;

/** 0 (yielding) … 3 (dominant). */
export const leadRank = (style: LeadStyle): number => LEAD_STYLES.indexOf(style);
/** 0 (low) … 2 (high). */
export const desireRank = (level: DesireLevel): number => DESIRE_LEVELS.indexOf(level);

/** What a named unit without a bond section has. It never qualifies for Want or rules (balanced, low desire). */
export const MODEST_BOND: Bond = Object.freeze({
  leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false,
  ownLimits: Object.freeze({ categories: Object.freeze([]) as unknown as string[] }), publicity: 'known',
}) as Bond;

/** The bond profile of a named unit (a modest one when the card gave none); `null` for a grunt, which has no bond. */
export function bondOf(unit: Pick<Unit, 'kind' | 'bond'>): Bond | null {
  if (unit.kind !== 'named') return null;
  return unit.bond ?? MODEST_BOND;
}

/**
 * The bond tier of her current relationship state (`romantic` or `close`), `null` when the state has none or she has no
 * relation. Code reads the tier, never a state id (overview P4).
 */
export function bondTierOf(state: Pick<CampaignState, 'relations'>, reg: Registries, unitId: string): 'romantic' | 'close' | null {
  const stateId = state.relations[unitId]?.stateId;
  if (stateId === undefined) return null;
  const tier = reg.relationshipStates.get(stateId)?.bondTier;
  return tier === 'romantic' || tier === 'close' ? tier : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The note of her own limits is cut to this many characters (spec: ≤ 160). */
const NOTE_MAX = TUNING.bonds.limits.noteMax;

/**
 * Reads a bond profile from untrusted data (a card import, a wizard edit, a save): every field that is not legal becomes the
 * modest default and is named in `issues`, unknown limit ids are dropped, the note is cut. Never throws. An absent profile
 * (`undefined`) is the modest one with no issue; the caller decides whether that counts as missing.
 */
export function validateBond(raw: unknown, reg: Registries): { bond: Bond; issues: string[]; /** The fields that were present and legal. */ valid: string[] } {
  const issues: string[] = [];
  const valid: string[] = [];
  const bond: Bond = { ...MODEST_BOND, ownLimits: { categories: [] } };
  if (raw === undefined) return { bond, issues, valid };
  if (!isObj(raw)) return { bond, issues: ['the bond profile must be an object'], valid };
  const pick = <T extends string>(field: string, allowed: readonly T[], fallback: T): T => {
    const v = raw[field];
    if (v === undefined) return fallback;
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) {
      valid.push(field);
      return v as T;
    }
    issues.push(`${field} must be one of ${allowed.join(', ')}`);
    return fallback;
  };
  bond.leadStyle = pick('leadStyle', LEAD_STYLES, MODEST_BOND.leadStyle);
  bond.attachment = pick('attachment', ATTACHMENTS, MODEST_BOND.attachment);
  bond.desire = pick('desire', DESIRE_LEVELS, MODEST_BOND.desire);
  bond.publicity = pick('publicity', PUBLICITY_LEVELS, MODEST_BOND.publicity);
  if (raw.caretaker !== undefined) {
    if (typeof raw.caretaker === 'boolean') {
      bond.caretaker = raw.caretaker;
      valid.push('caretaker');
    } else issues.push('caretaker must be true or false');
  }
  if (raw.ownLimits !== undefined) {
    const limits = raw.ownLimits;
    if (!isObj(limits)) issues.push('ownLimits must be an object');
    else {
      valid.push('ownLimits');
      const cats = limits.categories;
      if (cats !== undefined && !Array.isArray(cats)) issues.push('ownLimits.categories must be a list');
      else {
        for (const c of cats ?? []) {
          if (typeof c !== 'string' || !reg.contentCategories.has(c)) issues.push(`ownLimits names unknown content category "${String(c)}"`);
          else if (!bond.ownLimits.categories.includes(c)) bond.ownLimits.categories.push(c);
        }
      }
      if (limits.note !== undefined) {
        if (typeof limits.note !== 'string') issues.push('ownLimits.note must be text');
        else {
          const note = limits.note.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
          if (note.length > NOTE_MAX) issues.push(`ownLimits.note was cut to ${NOTE_MAX} characters`);
          if (note !== '') bond.ownLimits.note = note.slice(0, NOTE_MAX).trim();
        }
      }
    }
  }
  return { bond, issues, valid };
}

/** May a unit with this bond take this defect? A defect with `requiresBond` needs the traits it names (read by field, never by id). */
export function defectAllowedFor(reg: Registries, defectId: string, bond: Bond | null): boolean {
  const need = reg.defects.get(defectId)?.requiresBond as { caretaker?: true } | undefined;
  if (!need) return true;
  return need.caretaker !== true || bond?.caretaker === true;
}
