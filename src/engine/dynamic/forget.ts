/**
 * What the dynamic drops when a unit leaves the squad for good (P15, plan R7): by `removeFromService` (deserted, terminated, reassigned)
 * and by the dead-unit sweep of the day step. A leaf for the leash and personal layers: it imports only types.
 */
import type { EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';

/** Whether anything of hers is left for `forgetDynamic` to drop (the sweep runs only for those). */
export function holdsDynamic(state: Pick<CampaignState, 'dynamic' | 'relations'>, unitId: string): boolean {
  const x = state.dynamic;
  const rel = state.relations[unitId]?.dynamic;
  if (rel !== undefined && (rel.domains.length > 0 || rel.aftermath !== undefined || rel.probes.pending !== undefined || rel.leashBlock !== undefined)) return true;
  if (x === undefined) return false;
  return x.open.claims.some((c) => c.unitId === unitId) || x.open.milestones.some((m) => m.unitId === unitId) || x.open.offers.some((o) => o.unitId === unitId)
    || x.open.returnOffer?.unitId === unitId || x.open.exits?.some((e) => e.unitId === unitId) === true || x.queue.includes(unitId) || x.override?.unitId === unitId
    || x.oversight?.threat?.unitId === unitId || x.oversight?.holderId === unitId || x.oversight?.requests?.some((r) => r.unitId === unitId) === true
    || x.knowledge[unitId] !== undefined || Object.values(x.knowledge).some((row) => row[unitId] !== undefined);
}

/**
 * Drops what the dynamic holds of a unit who left: her open claims, milestones, exits and offers and the return offer that was hers, the knowledge
 * rows with her as observer or as holder, her place in the probe queue, an override that is hers, her domains and her block on the Leash;
 * an aftermath of hers ends (`aftermath_ended { reason: 'gone' }`). Her own `Relation.dynamic` stays as history (hold, frame, milestones).
 * Starts nothing for anyone (no `successor`), draws nothing, and changes nothing for a campaign without the dynamic.
 */
export function forgetDynamic(draft: CampaignState, unitId: string): EngineEvent[] {
  const events: EngineEvent[] = [];
  const x = draft.dynamic;
  if (x !== undefined) {
    x.open.claims = x.open.claims.filter((c) => c.unitId !== unitId);
    x.open.milestones = x.open.milestones.filter((m) => m.unitId !== unitId);
    x.open.offers = x.open.offers.filter((o) => o.unitId !== unitId);
    if (x.open.returnOffer?.unitId === unitId) delete x.open.returnOffer;
    if (x.open.exits !== undefined) x.open.exits = x.open.exits.filter((e) => e.unitId !== unitId);
    delete x.knowledge[unitId];
    for (const [observer, row] of Object.entries(x.knowledge)) {
      delete row[unitId];
      if (Object.keys(row).length === 0) delete x.knowledge[observer];
    }
    x.queue = x.queue.filter((id) => id !== unitId);
    if (x.noted !== undefined) { // what Regard kept of her (Task 36, 37): the span of her fall, her disappointment and the question put to her
      delete x.noted.regardMark?.[unitId];
      delete x.noted.regardFell?.[unitId];
      delete x.noted.disappointed?.[unitId];
      delete x.noted.question?.by[unitId];
    }
    if (x.override?.unitId === unitId) delete x.override;
    const o = x.oversight; // oversight's threat, requests and the block it was counting are hers
    if (o !== undefined) {
      if (o.threat?.unitId === unitId) delete o.threat;
      if (o.holderId === unitId) delete o.holderId;
      if (o.requests !== undefined) o.requests = o.requests.filter((r) => r.unitId !== unitId);
      if (o.requests?.length === 0) delete o.requests;
      if (o.pass?.unitId === unitId) delete o.pass;
    }
  }
  const rel = draft.relations[unitId]?.dynamic;
  if (rel !== undefined) {
    rel.domains = [];
    delete rel.probes.pending;
    delete rel.leashBlock;
    if (rel.aftermath !== undefined) {
      events.push({ type: 'aftermath_ended', unitId, id: rel.aftermath.id, kind: rel.aftermath.kind, reason: 'gone' });
      delete rel.aftermath;
    }
  }
  return events;
}
