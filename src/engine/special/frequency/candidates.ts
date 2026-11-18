import type { Registries } from '../../../content/types';
import { commandStance, type CommandStance } from '../../discipline/stance';
import { impunityOf, impunityBand } from '../../discipline/impunity';
import { rawRefusalChance } from '../../loyalty/refusal';
import { attractionBand } from '../../relations/bands';
import type { Rng } from '../../rng';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import type { CandidateKind } from '../state';

export { CANDIDATE_KINDS, type CandidateKind } from '../state';

/** One thing the commander could overhear about her: a kind, the engine's key for it and, where it is a record, its id. */
export interface Candidate { kind: CandidateKind; value: string; refId?: string }

const STANCES: readonly CommandStance[] = ['disciplined', 'defiant_loyal', 'fearful', 'open_defiance', 'indifferent'];
const IMPUNITY_BANDS = ['cowed', 'low', 'high', 'brazen'] as const;
const ATTRACTION_BANDS = ['none', 'faint', 'interested', 'strong'] as const;

/** The value of a record that is not there: what a distortion of an id-like candidate says (`she is not…`). */
export const NONE = 'none';
/** The value of a planned refusal. */
export const REFUSES = 'refuses';

/**
 * What the commander could overhear about her hidden state, in a closed order, read from live state: her stance, her
 * Impunity band, a demand she has not delivered yet, a pending desertion or mutiny warning, a fact about her that the commander does not know
 * (never the frequency's own fact), her Attraction band, a planned refusal and a kept squad secret she knows. No rng.
 */
export function candidateTruths(state: CampaignState, reg: Registries, unitId: string): Candidate[] {
  const out: Candidate[] = [];
  const rel = state.relations[unitId];
  const stance = commandStance(state, reg, unitId);
  if (stance !== null) out.push({ kind: 'stance', value: stance });
  const impunity = impunityOf(state, reg, unitId);
  if (impunity !== null) out.push({ kind: 'impunity', value: impunityBand(impunity.value) });
  for (const d of state.discipline?.demands ?? []) {
    if (d.unitId === unitId && d.status === 'undelivered') out.push({ kind: 'demand', value: d.templateId, refId: d.id });
  }
  const sign = [...(state.disloyalty?.units[unitId]?.signs ?? [])].reverse().find((x) => x.about === 'desertion' || x.about === 'mutiny');
  if (sign) out.push({ kind: 'loyalty', value: sign.about });
  const facts = state.memory.facts
    .filter((f) => f.about.includes(unitId) && f.hiddenFromCommander === true && !f.knownBy.includes('*') && !f.tags.includes('frequency'))
    .sort((a, b) => b.day - a.day);
  for (const f of facts) out.push({ kind: 'fact', value: f.id, refId: f.id });
  if (rel) out.push({ kind: 'attraction', value: attractionBand(rel.attraction) });
  const defied = (state.discipline?.defiance ?? []).some((x) => x.unitId === unitId);
  if (defied || rawRefusalChance(state, reg, unitId) >= TUNING.special.frequency.refusalMin) out.push({ kind: 'refusal', value: REFUSES });
  for (const x of state.personal?.secrets ?? []) {
    if (x.status === 'kept' && x.knownBy.includes(unitId)) out.push({ kind: 'secret', value: x.id, refId: x.id });
  }
  return out;
}

/**
 * The plausible false value of a distorted intercept: another stance or band from the same closed list (one draw), or for
 * an id or a yes/no (`demand`, `fact`, `secret`, `loyalty`, `refusal`) a negation, `none` (no draw).
 */
export function falseValue(kind: CandidateKind, value: string, rng: Rng): string {
  const list: readonly string[] | null = kind === 'stance' ? STANCES : kind === 'impunity' ? IMPUNITY_BANDS : kind === 'attraction' ? ATTRACTION_BANDS : null;
  if (list === null) return NONE;
  const others = list.filter((x) => x !== value);
  return others.length === 0 ? value : rng.pick(others);
}
