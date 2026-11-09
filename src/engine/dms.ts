import type { Registries } from '../content/types';
import { isLiving } from './economy';
import { nextId } from './memory';
import type { Rng } from './rng';
import { availableStates } from './relations/graph';
import { intimacyOf } from './relations/gain';
import type { CampaignState, DmMessage } from './state/types';
import { TUNING } from './tuning';

export const threadOf = (state: CampaignState, unitId: string): DmMessage[] => state.dms[unitId] ?? [];

/** Appends a message to the unit's thread and trims the thread to `threadMax`. */
export function pushMessage(draft: CampaignState, unitId: string, m: Omit<DmMessage, 'id'>): DmMessage {
  const msg: DmMessage = { ...m, id: nextId(draft, 'm') };
  const thread = (draft.dms[unitId] ??= []);
  thread.push(msg);
  if (thread.length > TUNING.comms.threadMax) thread.splice(0, thread.length - TUNING.comms.threadMax);
  return msg;
}

/** How many commander messages reached this unit today (her "social battery"). */
export const sentToday = (state: CampaignState, unitId: string): number => {
  const meta = state.dmMeta?.[unitId];
  return meta && meta.day === state.day ? meta.sent : 0;
};

/** Counts one commander message sent today. */
export function countSent(draft: CampaignState, unitId: string): void {
  const meta = (draft.dmMeta ??= {});
  meta[unitId] = { day: draft.day, sent: sentToday(draft, unitId) + 1 };
}

/** What she does with the message just counted: answer, snap at it, or leave it on read. */
export function dmMode(state: CampaignState, unitId: string): 'reply' | 'snap' | 'ignore' {
  const n = sentToday(state, unitId);
  return n <= TUNING.comms.snapAfter ? 'reply' : n <= TUNING.comms.battery ? 'snap' : 'ignore';
}

/** Messages from units the commander has not opened yet. */
export function unreadCount(state: CampaignState): number {
  return Object.values(state.dms).reduce((n, thread) => n + thread.filter((m) => m.from !== 'commander' && !m.read).length, 0);
}

const isNamedLiving = (state: CampaignState, id: string): boolean => {
  const u = state.squad.find((x) => x.id === id);
  return u !== undefined && u.kind === 'named' && isLiving(u);
};

/** Per slot transition: state `dmChance` × the initiative setting, plus defect bonuses; romantic states count 0 with romance off. */
export function initiativeChance(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  if (!unit || !rel) return 0;
  const { romance, initiative } = intimacyOf(state);
  const st = reg.relationshipStates.get(rel.stateId);
  const base = st && !(st.romance === true && !romance) ? (st.dmChance as number) * TUNING.comms.initiativeMult[initiative] : 0;
  const bonus = unit.defects.reduce((n, d) => n + ((reg.defects.get(d.id)?.dmChanceBonus as number | undefined) ?? 0), 0);
  return Math.min(1, Math.max(0, base + bonus));
}

const waiting = (state: CampaignState, unitId: string): boolean => {
  const last = threadOf(state, unitId).at(-1);
  return last !== undefined && last.from === unitId && last.initiated === true;
};

/** Which units start a DM now: at most `maxInitiatedPerSlot`, never a unit still waiting on an unanswered message. */
export function rollInitiative(draft: CampaignState, reg: Registries, rng: Rng): string[] {
  const ok = new Set(availableStates(draft, reg).map((s) => s.id));
  const hits: string[] = [];
  for (const u of draft.squad) {
    if (!isNamedLiving(draft, u.id) || !ok.has(draft.relations[u.id]?.stateId) || waiting(draft, u.id)) continue;
    if (rng.chance(initiativeChance(draft, reg, u.id))) hits.push(u.id);
  }
  for (let i = hits.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [hits[i], hits[j]] = [hits[j], hits[i]];
  }
  return hits.slice(0, TUNING.comms.maxInitiatedPerSlot);
}
