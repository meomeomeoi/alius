import type { Entry, Registries } from '../content/types';
import type { DmBehaviourKind, DmBehaviourWhen } from '../content/schemas';
import { bondOf } from './bonds/profile';
import { effectiveWant, wantBand } from './bonds/want';
import { slotIndex } from './calendar';
import { isLiving } from './economy';
import { fnv1a } from './hub';
import type { CampaignState, DmMessage, Slot } from './state/types';
import { conflictWithin } from './vitals';

export { slotIndex } from './calendar';

/**
 * Living DMs (P10b §2): what a soldier's messenger does around the text the model wrote, decided from state and registry
 * `dmBehaviours`. Nothing here rolls: a "chance" is `fnv1a(key) % 1000 < chance × 1000` over a stable key (the message id and
 * the entry id), so the same message and state always give the same answer and no rng is drawn. Rules are read by `kind` and
 * `when`, never by entry id.
 */

interface Behaviour { id: string; kind: DmBehaviourKind; chance: number; when?: DmBehaviourWhen }
const behaviours = (reg: Registries): Behaviour[] => [...reg.dmBehaviours.values()].map((e: Entry) => ({
  id: String(e.id), kind: e.kind as DmBehaviourKind, chance: Number(e.chance), ...(e.when !== undefined ? { when: e.when as DmBehaviourWhen } : {}),
}));

/** The hash that replaces a roll. */
export const passes = (key: string, chance: number): boolean => fnv1a(key) % 1000 < Math.round(chance * 1000);

const namedLiving = (state: CampaignState, unitId: string) => {
  const u = state.squad.find((x) => x.id === unitId);
  return u !== undefined && u.kind === 'named' && isLiving(u) ? u : null;
};

/** The sum of her affinity losses recorded today (positive). */
function affinityLostToday(state: CampaignState, unitId: string): number {
  return (state.ledger ?? []).filter((e) => e.key === `axis:${unitId}:affinity` && e.day === state.day && e.delta < 0).reduce((n, e) => n - e.delta, 0);
}

/** Do all the conditions of `when` hold for her now? `ctx.slot` is the slot of the message (default: now). */
export function whenHolds(state: CampaignState, reg: Registries, unitId: string, when: DmBehaviourWhen, ctx: { initiated: boolean; slot?: Slot }): boolean {
  const unit = namedLiving(state, unitId);
  const rel = state.relations[unitId];
  if (!unit || !rel) return false;
  if (when.minWant !== undefined && effectiveWant(state, reg, unitId) < when.minWant) return false;
  if (when.wantBands !== undefined && !when.wantBands.includes(wantBand(effectiveWant(state, reg, unitId)))) return false;
  if (when.attachment !== undefined && !when.attachment.includes(bondOf(unit)!.attachment)) return false;
  if (when.stateGroups !== undefined && !when.stateGroups.includes(reg.relationshipStates.get(rel.stateId)?.group as never)) return false;
  if (when.states !== undefined && !when.states.includes(rel.stateId)) return false;
  if (when.afterConflictSlots !== undefined && !conflictWithin(state, unitId, when.afterConflictSlots)) return false;
  if (when.affinityDrop !== undefined && affinityLostToday(state, unitId) < when.affinityDrop) return false;
  if (when.slots !== undefined && !when.slots.includes(ctx.slot ?? state.slot)) return false;
  if (when.initiated !== undefined && when.initiated !== ctx.initiated) return false;
  return true;
}

/** The id the next message of the thread will get (`dm/send` and `dm/receive` take ids from `memory.nextId`). */
const nextMessageId = (state: CampaignState): string => `m${(state.memory.nextId ?? 0) + 1}`;

/** The first `curt` entry that holds for her and passes its hash for this message id. */
function curtFor(state: CampaignState, reg: Registries, unitId: string, messageId: string): Behaviour | undefined {
  return behaviours(reg).find((b) => b.kind === 'curt' && (b.when === undefined || whenHolds(state, reg, unitId, b.when, { initiated: false })) && passes(`${messageId}|${b.id}`, b.chance));
}

/**
 * The entries stamped on a message of hers when it arrives, at most one per kind (the first in registry order). A `hesitate` is
 * never stamped (it is a live indicator, `hesitates`) and a `curt` only when the reply was asked for in that mode
 * (`opts.curt`, the entry that decided it; the first `curt` entry if state moved since). A stamp is never rewritten.
 */
export function stampBehaviours(
  state: CampaignState, reg: Registries, unitId: string, msg: Pick<DmMessage, 'id' | 'initiated' | 'slot'>, opts: { curt?: boolean } = {},
): string[] {
  if (!namedLiving(state, unitId)) return [];
  const initiated = msg.initiated === true;
  const out: string[] = [];
  const taken = new Set<DmBehaviourKind>();
  for (const b of behaviours(reg)) {
    if (b.kind === 'hesitate' || b.kind === 'curt' || taken.has(b.kind)) continue;
    if (b.when !== undefined && !whenHolds(state, reg, unitId, b.when, { initiated, slot: msg.slot })) continue;
    if (!passes(`${msg.id}|${b.id}`, b.chance)) continue;
    taken.add(b.kind);
    out.push(b.id);
  }
  if (opts.curt === true) {
    const curt = curtFor(state, reg, unitId, msg.id) ?? behaviours(reg).find((b) => b.kind === 'curt');
    if (curt) out.push(curt.id);
  }
  return out;
}

/**
 * How she is asked to answer, decided before the model call: `curt` replaces an ordinary `reply` when a `curt` entry holds and
 * passes its hash for the id of the message she is about to send. A `snap` stays a snap.
 */
export function replyModeFor(state: CampaignState, reg: Registries, unitId: string, base: 'reply' | 'snap'): 'reply' | 'snap' | 'curt' {
  if (base !== 'reply' || !namedLiving(state, unitId)) return base;
  return curtFor(state, reg, unitId, nextMessageId(state)) ? 'curt' : 'reply';
}

/**
 * She started to answer and stopped: only while the open thread ends with a commander message nobody answered, and keyed by
 * that message (the same message always gives the same answer).
 */
export function hesitates(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!namedLiving(state, unitId)) return false;
  const last = (state.dms[unitId] ?? []).at(-1);
  if (!last || last.from !== 'commander') return false;
  return behaviours(reg).some((b) => b.kind === 'hesitate' && (b.when === undefined || whenHolds(state, reg, unitId, b.when, { initiated: false })) && passes(`${last.id}|${b.id}`, b.chance));
}

export type Receipt = { status: 'delivered' | 'read' | 'left_on_read'; slotsAgo?: number };

/**
 * What became of a commander message, derived (the game has no clock, so slots): `read` once a later message of hers exists
 * (`slotsAgo` since that message), `left_on_read` when she has not answered a slot or more later (`slotsAgo` since it was sent),
 * `delivered` otherwise.
 */
export function receiptOf(state: CampaignState, unitId: string, msg: Pick<DmMessage, 'id' | 'day' | 'slot'>): Receipt {
  const now = slotIndex(state.day, state.slot);
  const thread = state.dms[unitId] ?? [];
  const at = thread.findIndex((m) => m.id === msg.id);
  const answer = thread.slice(at + 1).find((m) => m.from !== 'commander');
  if (answer) return { status: 'read', slotsAgo: Math.max(0, now - slotIndex(answer.day, answer.slot)) };
  const age = now - slotIndex(msg.day, msg.slot);
  return age >= 1 ? { status: 'left_on_read', slotsAgo: age } : { status: 'delivered' };
}
