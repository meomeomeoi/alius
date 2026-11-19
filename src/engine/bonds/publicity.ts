import type { Registries } from '../../content/types';
import { addRecord } from '../discipline/record';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { applyRelationDelta } from '../relationGain';
import { applyEventToUnit } from '../relations/effects';
import { intimacyOf } from '../relations/gain';
import { evaluateAutomatic } from '../relations/graph';
import type { Rng } from '../rng';
import type { CampaignState, Publicity } from '../state/types';
import { TUNING } from '../tuning';
import { bondOf, leadRank, PUBLICITY_LEVELS } from './profile';
import { rank } from './publicitySync';
import { valuesOf } from '../development/profile';

/**
 * Does her preference differ from how open the relationship is now? Only a relation that has a publicity level can be
 * mismatched (one is set while she is in a romantic-tier state); the level the commander and she live with against what her
 * card prefers. Enables the demand `publicity_talk`.
 */
export function publicityMismatch(state: Pick<CampaignState, 'relations' | 'squad'>, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const bond = unit ? bondOf(unit) : null;
  const level = state.relations[unitId]?.publicity?.level;
  return bond !== null && level !== undefined && level !== bond.publicity;
}

/** Does she lead now? Her open scene's lead if she has one, otherwise her style (assertive or dominant leads when nothing was decided). */
function sheLeads(state: CampaignState, unitId: string): boolean {
  const lead = state.scene?.lead;
  if (lead && lead.unitId === unitId) return lead.by === 'unit';
  const unit = state.squad.find((u) => u.id === unitId);
  return unit !== undefined && leadRank(bondOf(unit)?.leadStyle ?? 'balanced') >= leadRank('assertive');
}

/**
 * Every other named living unit reacts once to a relationship that went public, by her values: a corporate or anti-ingroup one
 * loses respect (her impunity record rises), an autonomous or merciful one respects the honesty (Trust rises); the rest do
 * nothing. "Her friends close ranks" has no unit-to-unit axes in v1 (open item): it is a public fact and nothing more.
 */
function publicReactions(draft: CampaignState, herId: string): EngineEvent[] {
  const T = TUNING.bonds.publicity.reactions;
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    const rel = draft.relations[u.id];
    const flag = `public_reacted:${herId}`;
    if (u.id === herId || u.kind !== 'named' || !isLiving(u) || !rel || rel.flags.includes(flag)) continue;
    rel.flags.push(flag);
    const v = valuesOf(u);
    if (v.corporate >= 1 || v.ingroup <= -1) events.push(...addRecord(draft, u.id, T.lostRespectRecord, 'relationship_public'));
    else if (v.autonomy >= 1 || v.mercy >= 1) applyRelationDelta(draft, u.id, 'trust', T.respectTrust, 'relationship_public');
  }
  return events;
}

/** `listened` toward her preference, `dismissed` away from it (minor, from the commander). */
function preferenceEvent(draft: CampaignState, reg: Registries, unitId: string, from: Publicity, to: Publicity): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  const pref = (unit ? bondOf(unit)?.publicity : undefined) ?? 'known';
  const toward = to === pref || Math.abs(rank(to) - rank(pref)) < Math.abs(rank(from) - rank(pref));
  return applyEventToUnit(draft, reg, unitId, {
    type: toward ? 'listened' : 'dismissed', actor: 'commander', targets: [unitId], severity: 'minor', evidence: 'how open the relationship is', confidence: 1,
  });
}

/**
 * Sets how open the relationship is. `commander`: the player's choice (also her `commanderPref`); moving toward her preference is
 * `listened`, away from it `dismissed`, both minor. `claimed` (P9c's claim) and `revealed` (the reveal roll) change the level and
 * nothing else on her. Going `public` while she leads makes the others react once and writes a public fact. Throws when she has no
 * publicity (not in a romantic-tier state). Draws no rng.
 */
export function setPublicity(
  draft: CampaignState, reg: Registries, unitId: string, level: Publicity, opts: { cause: 'commander' | 'claimed' | 'revealed' },
): EngineEvent[] {
  const rel = draft.relations[unitId];
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!rel?.publicity || !unit || !isLiving(unit)) throw new Error('She is not in a romantic relationship with the commander.');
  if (opts.cause === 'commander' && rel.stateId === 'secret_affair') throw new Error('This romance is concealed: it comes out only by being discovered.'); // P3 owns it
  if (opts.cause === 'commander' && !intimacyOf(draft).romance) throw new Error('Romance is switched off.');
  if (!PUBLICITY_LEVELS.includes(level)) throw new Error(`Unknown publicity level "${String(level)}".`);
  const from = rel.publicity.level;
  if (opts.cause === 'commander') rel.publicity.commanderPref = level;
  if (from === level) return [];
  rel.publicity.level = level;
  rel.publicity.since = draft.day;
  const events: EngineEvent[] = [{ type: 'publicity_changed', unitId, from, to: level, cause: opts.cause }];
  if (opts.cause === 'commander') events.push(...preferenceEvent(draft, reg, unitId, from, level), ...evaluateAutomatic(draft, reg, unitId));
  if (opts.cause === 'revealed') {
    events.push({ type: 'bond_revealed', unitId });
    addFact(draft, { about: [unitId, 'commander'], text: `It is out: ${unit.displayName} and the commander are together.`, tags: ['bond', 'revealed'], importance: 3, day: draft.day, knownBy: ['*'] });
  }
  if (level === 'public' && from !== 'public') {
    addFact(draft, { about: [unitId, 'commander'], text: `The squad knows: ${unit.displayName} and the commander.`, tags: ['bond', 'public'], importance: 3, day: draft.day, knownBy: ['*'] });
    if (sheLeads(draft, unitId)) events.push(...publicReactions(draft, unitId));
  }
  return events;
}

/**
 * Rolls for the reveal of every `secret` relationship (called at each scene end and DM exchange) of a unit who is present with at
 * least one other. The numbers are P3's discovery numbers without `partnerPresent`; a concealed romance keeps P3's own machinery
 * and is never rolled here. On success the level becomes `known`. Draws rng only for an eligible unit.
 */
export function rollReveal(draft: CampaignState, reg: Registries, rng: Rng, presentIds: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const T = TUNING.relations.affair;
  if (presentIds.length < 2 || !intimacyOf(draft).romance) return events; // romance off: no relationship news
  for (const unit of draft.squad) {
    const rel = draft.relations[unit.id];
    if (!rel?.publicity || rel.publicity.level !== 'secret' || rel.stateId === 'secret_affair' || !isLiving(unit) || !presentIds.includes(unit.id)) continue;
    if (rng.chance(T.base + T.perOther * (presentIds.length - 1))) events.push(...setPublicity(draft, reg, unit.id, 'known', { cause: 'revealed' }));
  }
  return events;
}
