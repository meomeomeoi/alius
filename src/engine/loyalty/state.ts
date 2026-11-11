import type { EngineCtx, EngineEvent } from '../dispatch';
import { pushMessage } from '../dms';
import { addFact, nextId } from '../memory';
import { enqueueNight } from '../night';
import type { CampaignState, LoyaltyRecord } from '../state/types';
import { TUNING } from '../tuning';

const blank = (): LoyaltyRecord => ({ signs: [], attempts: 0 });

/** The unit's loyalty record, created on first use (mutates `draft`). */
export function loyaltyRecord(draft: CampaignState, unitId: string): LoyaltyRecord {
  const d = (draft.disloyalty ??= { units: {} });
  return (d.units[unitId] ??= blank());
}

/** Read-only access: `undefined` when the unit has no record. */
export function loyaltyOf(state: Pick<CampaignState, 'disloyalty'>, unitId: string): LoyaltyRecord | undefined {
  return state.disloyalty?.units[unitId];
}

// ---------------------------------------------------------------------------------------------
// Signs: the warnings that come before a refusal, a desertion or a mutiny

/** Night entry kinds that are confrontations: the knock actions refuse them, their own panel answers them. */
export const CONFRONTATION_KINDS = ['desertion', 'mutiny', 'deserter_return'] as const;

type SignAbout = LoyaltyRecord['signs'][number]['about'];

/**
 * Gives her one more warning sign, picked (seeded) from the `loyaltySigns` lines, preferring one not used for her yet.
 * `dm` is a message from her (named units only), `fact` a public fact, `talk` a "we need to talk" night knock. A grunt
 * always gets a fact. Lines may say `{name}`. The record keeps the newest 6.
 */
export function emitSign(draft: CampaignState, ctx: EngineCtx, unitId: string, about: SignAbout, level?: 1 | 2): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit) return [];
  const rec = loyaltyRecord(draft, unitId);
  const lines = [...ctx.registries.loyaltySigns.values()].filter((s) =>
    s.about === about && (about !== 'mutiny' || s.level === level) && (unit.kind === 'named' || s.kind === 'fact'));
  const fresh = lines.filter((s) => !rec.signs.some((r) => r.signId === s.id));
  const pool = fresh.length > 0 ? fresh : lines;
  if (pool.length === 0) return [];
  const line = ctx.rng.pick(pool);
  const kind = line.kind as 'dm' | 'fact' | 'talk';
  const text = String(line.text).replaceAll('{name}', unit.displayName);
  if (kind === 'dm') {
    pushMessage(draft, unitId, { from: unitId, text, day: draft.day, slot: draft.slot, read: false });
  } else if (kind === 'fact') {
    addFact(draft, { about: [unitId], text, tags: ['loyalty', about], importance: 3, day: draft.day, knownBy: ['*'] });
  } else {
    enqueueNight(draft, {
      id: nextId(draft, 'n'), unitId, kind: 'we_need_to_talk', priority: TUNING.disloyalty.night.talk, framing: text,
      ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: draft.day + TUNING.disloyalty.night.expiresInDays,
    });
  }
  rec.signs.push({ day: draft.day, about, kind, signId: String(line.id) });
  if (rec.signs.length > TUNING.disloyalty.signsMax) rec.signs.splice(0, rec.signs.length - TUNING.disloyalty.signsMax);
  return [{ type: 'loyalty_sign', unitId, about, kind }];
}
