/// <reference types="vite/client" />
import type { Registries } from '../../src/content/types';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, run, setRelation, startFight } from './loyalty';

// Register every action module that exists, in the order the app does not care about: this file also runs on an older checkout (before
// P13), where `actions/warden` does not exist, so the modules are found by glob instead of named.
import.meta.glob('../../src/engine/actions/*.ts', { eager: true });

/**
 * A seeded week of a default-mode campaign: day ends, activities with and without a companion, a roster change, a scene with a reading,
 * a DM, a dilemma, a squad Leash request and a combat with an order and a compel. Everything is recorded, errors included, and nothing
 * throws: the point is that the run is the same with the P13 modules loaded as it was before they existed (a golden file made on the
 * commit before P13). Returns the event types of every step, the final state and the rng.
 */
export function runWeek(reg: Registries, opts: {
  /** P14b: changes the campaign before the first step (the golden callers pass nothing). */
  tweak?: (s: CampaignState) => void;
  /** P14c: sets the frequency of her life (`life/set_frequency`) before the first step; absent (the golden callers) = the campaign as it was built, with no setting. */
  life?: 'off' | 'rare' | 'normal' | 'often';
} = {}): { log: string[]; rng: unknown; state: CampaignState } {
  let s = campaign(reg, 4);
  opts.tweak?.(s);
  if (opts.life !== undefined) s = run(s, reg, { type: 'life/set_frequency', payload: { mode: opts.life } }).state;
  s.rng = seedRng(21);
  const [ANN, BEA, CAT] = s.squad.map((u) => u.id);
  for (const u of s.squad) setRelation(s, u.id, { trust: 50, affinity: 20, stateId: 'comrade' });
  const log: string[] = [];
  const step = (type: string, payload?: unknown): ReturnType<typeof run> => {
    const r = run(s, reg, { type, payload });
    log.push(`${type}${errors(r.events).length > 0 ? ' !' : ''}: ${r.events.map((e) => e.type).join(',')}`);
    s = r.state;
    return r;
  };
  const dayEnd = (): void => {
    const start = s.day;
    for (let i = 0; i < 5 && s.day === start; i++) {
      if (s.dilemmas?.open) {
        const open = s.dilemmas.open;
        if (open.status === 'requested') step('dilemma/fallback', { requestId: open.id });
        step('dilemma/choose', { id: s.dilemmas.open!.id, index: 0 });
      }
      if (s.scene) step('scene/end', {});
      step('calendar/consume_slot', {});
    }
  };

  for (let day = 1; day <= 7; day++) {
    step('activity/do', { activityId: 'train', companionId: [ANN, BEA, CAT][day % 3] });
    step('roster/set_active', { activeIds: s.squad.slice(0, 2 + (day % 3)).map((u) => u.id) });
    step('activity/do', { activityId: 'rest' });
    step('dm/send', { unitId: CAT, text: `Day ${day}: report.` });
    step('scene/start', { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 });
    step('intents/apply', { channel: 'scene', intents: { events: [{ type: day % 2 === 0 ? 'praised' : 'insulted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said so', confidence: 1 }] } });
    if (day === 3 && s.scene) {
      s.scene.refusals = [{ unitId: ANN, exchange: 0 }]; // a refusal for the squad Leash request to stand on
      step('leash/compel', { unitId: ANN, context: 'scene' });
    }
    step('scene/end', {});
    if (day === 2) step('dilemma/request', { templateId: 'dil_rations', context: 'base' });
    if (day === 4) {
      s = startFight(s, reg);
      // every order, until one is accepted (each attempt is logged): the first that fits the open fight runs through the P13 hook
      for (const orderId of reg.orders.keys()) {
        const target = s.combat?.combatants.find((c) => c.side === 'enemy')?.cid;
        if (!errors(step('combat/order', { orderId, ...(target !== undefined ? { targetCid: target } : {}) }).events).length) break;
      }
      step('combat/compel', {});
      step('combat/auto', { on: true });
      step('combat/accept', {});
    }
    if (day === 5) step('leash/terminate', { unitId: CAT, context: 'desertion' });
    dayEnd();
  }
  return { log, rng: s.rng, state: s };
}
