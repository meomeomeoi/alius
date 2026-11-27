// The craft's tests stand on the practices' world: Ann holds at `play` (craft-live), Bea and Cat are squad members with no profile.
export { ANN, BEA, CAT, holderBond, unitOf, withBea, withService, world } from '../practice/world';

import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, setBlocking } from '../../../src/engine/blocking';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { errors, run } from '../../helpers/world';
import { ANN as HOLDER, world as holderWorld } from '../practice/world';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/scene';

void Rng;

/**
 * Ann holds at `play` (craft-live) and a scene with her is open in the commander's quarters with the commander under her feet (`footrest`), ready for a
 * weight run: the P15a blocking is live (she is a confidant, the categories are on). The marathon settings are the caller's.
 */
export function holdScene(reg: Registries, opts: { pace?: 'short' | 'normal' | 'long'; realtime?: boolean } = {}): CampaignState {
  registerFrameReader(() => 'play');
  const s = holderWorld(reg, 'play');
  s.relations[HOLDER].stateId = 'confidant';
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'restraint', 'service', 'objectification', 'humiliation'])] };
  s.slot = 'afternoon';
  s.settings.marathonPace = opts.pace ?? 'normal';
  s.settings.physicsRealtime = opts.realtime ?? false;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [HOLDER], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: HOLDER, field: 'contact', value: 'footrest', with: COMMANDER }, { at: 3, source: 'chip' });
  delete st.scene!.physics;
  st.scene!.physicsCount = 0;
  return st;
}

/** Starts a weight run (a marathon of `hours` when given) from the footrest. */
export function startWeight(s: CampaignState, reg: Registries, hours?: number): CampaignState {
  const r = run(s, reg, { type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: HOLDER, ...(hours !== undefined ? { duration: { hours } } : {}) } });
  if (errors(r.events).length > 0) throw new Error(JSON.stringify(r.events));
  return r.state;
}

/** Plays the run to its end with the player holding every beat (a marathon takes `endure` between phases). Returns the final state and every event. */
export function playOut(s: CampaignState, reg: Registries, seed = 1): { state: CampaignState; events: Array<{ type: string; [k: string]: unknown }> } {
  let cur = structuredClone(s);
  cur.rng = seedRng(seed);
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for (let g = 0; g < 400 && cur.scene?.physics; g++) {
    const p = cur.scene.physics;
    if (p.marathon?.waiting) { const r = run(cur, reg, { type: 'physics/skip', payload: { strategy: 'endure' } }); events.push(...r.events); cur = r.state; continue; }
    const a = run(cur, reg, { type: 'physics/next_segment', payload: { runId: p.id } });
    events.push(...a.events);
    const n = a.state.scene!.physics!.segment.plan!.beats.length;
    const b = run(a.state, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: a.state.scene!.physics!.segment.n, inputs: Array.from({ length: n }, (_, beat) => ({ beat, kind: 'hold' })) } });
    events.push(...b.events);
    cur = b.state;
  }
  return { state: cur, events };
}
