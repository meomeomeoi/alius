import type { Entry, Registries } from '../../content/types';
import { firstImpressionWeight, presenceOf } from '../commander/presence';
import { isLiving } from '../economy';
import { isOversightEntry } from '../leash/forced';
import { leashLog } from '../leash/weekly';
import { privilegeScale } from '../power/leader';
import { heldTerm } from '../personal/state';
import { leaderOf } from '../power/state';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicTerm, protectionShare } from '../dynamic/witness';
import { dispositionFor } from '../worldOptions';
import { recordOf } from './record';

/** The six computed terms and the stored one; `presence` and `dependency` are the signed contribution (already negated). */
export interface ImpunityTerms {
  base: number;
  record: number;
  leash: number;
  presence: number;
  dependency: number;
  contagion: number;
  leverage: number;
  /** P9c: the commander used a secret of the squad's against her (−8 for each she knows, at least −16, for 14 days). */
  held: number;
  /** P15: she knows what a holder has over the commander and dislikes it (+5 each), less the protection a holder's standing gives a unit who is no holder (up to 30 % of her positive terms); absent while 0, so a campaign without a dynamic has the same terms as before. */
  dynamic?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** `-0` would break exact comparisons of a term. */
const int = (n: number): number => Math.round(n) + 0;

/** The flag a unit gets when she learns the commander's crime; it is a secret only while that crime is damaging. */
const CRIME_FLAG = 'knows_crime';

const namedLiving = (state: CampaignState): Unit[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u));

function baseOf(state: CampaignState, reg: Registries, unit: Unit): number {
  const level = dispositionFor(state, reg, unit);
  const own = typeof level.impunityBase === 'number' ? level.impunityBase : TUNING.impunity.defaultBase;
  let nick = 0;
  for (const n of state.commander.reputation?.active ?? []) {
    const fx = reg.reputations.get(n.id)?.effects as { impunityBase?: number } | undefined;
    if (typeof fx?.impunityBase === 'number') nick += fx.impunityBase;
  }
  return own + nick;
}

/** L: an empty Leash looks like a bluff, and so does one nobody has used (a credit that builds over the first week); a use in the last days is fresh in every unit's mind. */
function leashTerm(state: CampaignState): number {
  const T = TUNING.impunity.leash;
  const all = leashLog(state);
  const log = all.filter((e) => !isOversightEntry(e)); // oversight's own forced Leash on a holder is not the commander's use (nor does its number count as one)
  const usedOnce = (state.leash.seq ?? 0) - (all.length - log.length) > 0;
  let l = 0;
  if (state.leash.authorizationsLeft <= 0) l += T.noneLeft;
  // the bluff credit: it grows over the first `bluffDays` days and, after the first use, fades over as many; a plain sum with
  // every other term, so a punishment, a scare or the stored record never cancels it and it never cancels them
  const firstUse = log.length > 0 ? Math.min(...log.map((e) => e.day)) : usedOnce ? Number.NEGATIVE_INFINITY : undefined;
  const grown = Math.min(T.bluffDays, Math.max(0, state.day - 1)) / T.bluffDays;
  const faded = firstUse === undefined ? 0 : Math.min(T.bluffDays, Math.max(0, state.day - firstUse)) / T.bluffDays;
  l += Math.round(T.neverUsed * Math.max(0, grown - faded));
  if (log.some((e) => e.outcome === 'done' && state.day - e.day >= 0 && state.day - e.day < T.recentDays)) l += T.recentUse;
  return l;
}

/** D: what she needs from the commander. */
function dependencyTerm(state: CampaignState, reg: Registries, unit: Unit): number {
  const rel = state.relations[unit.id];
  const stateDep = Number(reg.relationshipStates.get(rel?.stateId ?? '')?.dependency ?? 0);
  const upkeep = rel?.flags.includes('need_controlled') === true || unit.defects.some((d) => d.arc === 'manage');
  return (Number.isFinite(stateDep) ? stateDep : 0) + (upkeep ? TUNING.impunity.defectUpkeep : 0);
}

/** C: how bold the rest of the squad is. */
function contagionTerm(state: CampaignState, reg: Registries, unit: Unit): number {
  const others = namedLiving(state).filter((u) => u.id !== unit.id);
  if (others.length === 0) return 0;
  // P9b: the squad leader's record counts with weight `1 + privilegeScale` (2 at normal), everyone else's with 1
  const leaderId = leaderOf(state)?.id;
  const leaderWeight = 1 + privilegeScale(state, reg);
  const weight = (u: Unit): number => (u.id === leaderId ? leaderWeight : 1);
  const total = others.reduce((sum, u) => sum + weight(u), 0);
  const mean = others.reduce((sum, u) => sum + weight(u) * recordOf(state, u.id), 0) / total;
  return int(TUNING.impunity.contagion * mean);
}

/** Is a concealed affair still a secret from someone it is hidden from? Mirrors `rollDiscovery`: the hidden partners are living units still in romance. */
function concealedAffairs(state: CampaignState, reg: Registries): Array<{ unitId: string }> {
  const out: Array<{ unitId: string }> = [];
  for (const u of state.squad) {
    const affair = state.relations[u.id]?.affair;
    if (!affair || !isLiving(u)) continue;
    const hidden = affair.hiddenFrom.filter((id) => {
      const h = state.squad.find((x) => x.id === id);
      return h !== undefined && isLiving(h) && reg.relationshipStates.get(state.relations[id]?.stateId ?? '')?.romance === true;
    });
    if (hidden.length === 0) continue;
    const known = state.memory.facts.some((f) => f.tags.includes('affair') && f.about.includes(u.id) && (f.knownBy.includes('*') || hidden.some((h) => f.knownBy.includes(h))));
    if (!known) out.push({ unitId: u.id });
  }
  return out;
}

/** What she holds over the commander: the ids of leverage flags (secrets some other named unit does not share) and `affair`. */
export function leverageOf(state: CampaignState, reg: Registries, unitId: string): string[] {
  const rel = state.relations[unitId];
  if (!rel) return [];
  const named = namedLiving(state);
  const out: string[] = [];
  const crime = state.commander.crimeId === null ? undefined : (reg.crimes.get(state.commander.crimeId) as Entry | undefined);
  for (const flag of rel.flags) {
    if ((reg.flags.get(flag) as { leverage?: boolean } | undefined)?.leverage !== true) continue;
    if (flag === CRIME_FLAG && (crime as { damaging?: boolean } | undefined)?.damaging === false) continue;
    // a secret everybody shares is no leverage
    const others = named.filter((u) => u.id !== unitId);
    if (others.length > 0 && others.every((u) => state.relations[u.id]?.flags.includes(flag))) continue;
    out.push(flag);
  }
  const affairs = concealedAffairs(state, reg);
  const holdsAffair = affairs.some((a) => a.unitId === unitId)
    || affairs.some((a) => state.memory.facts.some((f) => f.tags.includes('affair') && f.about.includes(a.unitId) && f.knownBy.includes(unitId)));
  if (holdsAffair) out.push('affair');
  return out;
}

/**
 * Impunity `I = clamp(base + R + L − P·w(d) − D + C + S, 0, 100)` (P9 §1): what happens to her if she defies the commander,
 * as she sees it. Computed on demand; only `R` is stored. `null` for a grunt, a unit that is no longer living and an unknown id.
 */
export function impunityOf(state: CampaignState, reg: Registries, unitId: string): { value: number; terms: ImpunityTerms } | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || !state.relations[unitId]) return null;
  const T = TUNING.impunity;
  const terms: ImpunityTerms = {
    base: baseOf(state, reg, unit),
    record: recordOf(state, unitId),
    leash: leashTerm(state),
    presence: int(-presenceOf(state, reg) * firstImpressionWeight(state, unitId)),
    dependency: int(-dependencyTerm(state, reg, unit)),
    contagion: contagionTerm(state, reg, unit),
    leverage: Math.min(T.secretCap, leverageOf(state, reg, unitId).length * T.secret),
    held: heldTerm(state, unitId),
  };
  // P15 (R19): her dislike of a dynamic she knows of, less the share of the positive terms a holder's standing shields her from (never a holder herself)
  const others = [terms.base, terms.record, terms.leash, terms.presence, terms.dependency, terms.contagion, terms.leverage, terms.held];
  const shield = protectionShare(state, reg, unitId);
  const dynamic = dynamicTerm(state, reg, unitId) - (shield > 0 ? int(shield * others.reduce((sum, n) => sum + Math.max(0, n), 0)) : 0);
  if (dynamic !== 0) terms.dynamic = dynamic;
  const sum = others.reduce((a, b) => a + b, 0) + dynamic;
  return { value: clamp(Math.round(sum), 0, 100), terms };
}

/** Words for the number: `cowed` < 30, `low` < 50, `high` < 60, else `brazen`. */
export function impunityBand(value: number): 'cowed' | 'low' | 'high' | 'brazen' {
  const B = TUNING.impunity.bands;
  return value < B.low ? 'cowed' : value < B.high ? 'low' : value < B.brazen ? 'high' : 'brazen';
}
