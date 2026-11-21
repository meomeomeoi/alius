/**
 * P15a: acts of the mouth (plan R13, spec §16.9): a direct act with its own body side, separate from breathing her in. A contact with `mouth: true`
 * offers them: a kiss (discrete: her reaction in the directive), counted kisses (she sets the number, the player counts and types it), a long
 * pressed kiss (a hold), licking (tongue work with a dryness gauge), as a pet (an opening every beat) and taking in the mouth (the jaw). Each act
 * is a taste of what the contact exposes, so it counts as a session and a seeking step for each taste kind.
 */
import type { Registries } from '../../content/types';
import { contactOf, blockingLive, COMMANDER } from '../blocking';
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { fnv1a } from '../hub';
import { sceneSettingsOf } from '../moments/settings';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { startPhysics } from './run';
import { applyWay, exposedKinds } from './stimuli';

export const ACT_KINDS = ['kiss', 'counted', 'long', 'lick', 'pet', 'mouth'] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/** What each act that runs a physics asks of it, by field: the interaction and, for the ones with an air or a strength, a capacity gauge. */
const RUNS: Partial<Record<ActKind, { interaction: string; gauge?: string }>> = {
  long: { interaction: 'hold', gauge: 'capacity' }, lick: { interaction: 'order' }, pet: { interaction: 'timing', gauge: 'capacity' }, mouth: { interaction: 'gesture' },
};

const holderOf = (state: CampaignState): string | undefined => {
  const scene = state.scene;
  const contact = scene ? contactOf(scene) : undefined;
  if (!scene || !contact) return undefined;
  return scene.participants.includes(contact.with) ? contact.with : Object.entries(scene.blocking ?? {}).find(([id, b]) => b.contact === contact && id !== COMMANDER)?.[0] ?? scene.participants[0];
};

/** The acts the commander's contact offers now: none unless it has a mouth, and `pet` only with pet play. In `ACT_KINDS` order. */
export function actsFor(state: CampaignState, reg: Registries): ActKind[] {
  const scene = state.scene;
  const contact = scene && blockingLive(state, reg) ? contactOf(scene) : undefined;
  if (!scene || !contact || reg.blockingContacts.get(contact.id)?.mouth !== true) return [];
  if (!contentAllowed(state, reg, { contentTags: ['worship'] })) return [];
  return ACT_KINDS.filter((k) => k !== 'pet' || contentAllowed(state, reg, { contentTags: ['pet_play'] }));
}

/** The number she sets for counted kisses: ten to a hundred by tens, a hash of the scene and the exchange (no draw; a swipe sets the same). */
export function countedTarget(state: CampaignState): number {
  const scene = state.scene!;
  return 10 + 10 * (fnv1a(`${scene.id}|${scene.exchanges}|counted`) % 10);
}

/** The first physics whose entry has the interaction (and gauge) an act asks for and may run here, in registry order. */
function physicsFor(state: CampaignState, reg: Registries, kind: ActKind, holderId: string): string | null {
  const want = RUNS[kind]!;
  for (const p of reg.contactPhysics.values()) {
    if (p.interaction !== want.interaction || (want.gauge !== undefined && (p.gauge as { kind: string }).kind !== want.gauge)) continue;
    if (!sceneSettingsOf(state).physicsInteractions[p.interaction as keyof ReturnType<typeof sceneSettingsOf>['physicsInteractions']]) continue;
    if (contentAllowed(state, reg, p) && contentAllowed(state, reg, p, holderId)) return String(p.id);
  }
  return null;
}

/**
 * Starts an act. A kiss is over at once; counted kisses wait for the commander's count (`finishCounted`); the others start the physics they run.
 * Throws with the reason when it cannot start. Draws nothing.
 */
export function startAct(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & { rng: Rng }, kind: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  if (!scene || !blockingLive(draft, reg)) throw new Error('physics/act: the blocking is not live in this scene');
  if (typeof kind !== 'string' || !(ACT_KINDS as readonly string[]).includes(kind)) throw new Error(`physics/act: kind is one of ${ACT_KINDS.join(', ')}`);
  const k = kind as ActKind;
  if (!actsFor(draft, reg).includes(k)) throw new Error('physics/act: this contact does not offer that');
  if (scene.physics) throw new Error('physics/act: a hold is running');
  if (scene.act) throw new Error('physics/act: the kisses are still being counted');
  const contact = contactOf(scene)!;
  const holder = holderOf(draft)!;
  const events: EngineEvent[] = [];
  // every act is a taste of what the contact exposes: a session and a seeking step for each taste kind
  for (const ex of exposedKinds(draft, reg).filter((e) => reg.stimulusKinds.get(e.kind)?.family === 'taste')) events.push(...applyWay(draft, ctx, 'taste', ex.kind));
  if (k === 'kiss') return [{ type: 'mouth_act', kind: k, unitId: holder }, ...events];
  if (k === 'counted') {
    const n = countedTarget(draft);
    scene.act = { kind: 'counted', n, since: scene.exchanges, tries: 0 };
    return [{ type: 'mouth_act', kind: k, unitId: holder, n }, ...events];
  }
  const physicsId = physicsFor(draft, reg, k, holder);
  if (physicsId === null) throw new Error('physics/act: that kind of interaction is switched off or not available here');
  return [{ type: 'mouth_act', kind: k, unitId: holder }, ...events, ...startPhysics(draft, ctx, { physicsId, sourceKind: 'contact', sourceId: contact.id, holderId: holder, act: k })];
}

/** The commander types the number she counted: the right one finishes the act, a wrong one starts the count again (the number stays). */
export function finishCounted(draft: CampaignState, _ctx: unknown, typed: unknown): EngineEvent[] {
  const act = draft.scene?.act;
  if (!act) throw new Error('physics/act_finish: no count is waiting');
  if (typeof typed !== 'number' || !Number.isFinite(typed)) throw new Error('physics/act_finish needs { typed } as a number');
  const holder = holderOf(draft) ?? draft.scene!.participants[0]!;
  if (Math.round(typed) === act.n) {
    delete draft.scene!.act;
    return [{ type: 'mouth_act_done', kind: 'counted', n: act.n, tries: act.tries, unitId: holder }];
  }
  act.tries += 1;
  return [{ type: 'mouth_act_restart', kind: 'counted', n: act.n, tries: act.tries, unitId: holder }];
}
