import type { Registries } from '../content/types';
import { blockingLive, COMMANDER, deviceLocked, personEffects } from '../engine/blocking';
import type { EngineEvent } from '../engine/dispatch';
import { INTERACTION_TOGGLES, sceneSettingsOf, type SceneSettings } from '../engine/moments/settings';
import type { CampaignState } from '../engine/state/types';

/** The tabs the shell shows as locked: the ones already locked (the prologue's), and every tab while the device is out of reach (P15a). */
export function deviceTabLocks(state: CampaignState | null, reg: Registries, allTabs: readonly string[], base: ReadonlySet<string>): Set<string> {
  return state !== null && deviceLocked(state, reg) ? new Set(allTabs) : new Set(base);
}

/** True while the commander bears a `sound { muffle }` effect (a hood): every UI sound plays at a fraction of its gain. */
export function muffled(state: CampaignState | null, reg: Registries): boolean {
  return state !== null && blockingLive(state, reg) && personEffects(state, reg, COMMANDER).some((e) => e.type === 'sound' && e.muffle === true);
}

/** The sounds a batch of events rings: a `blocking_changed` of a person who wears an item with `sound { id }` (a bell on every move). */
export function bellsFor(events: readonly EngineEvent[], state: CampaignState | null, reg: Registries): string[] {
  if (state === null || !blockingLive(state, reg)) return [];
  const out: string[] = [];
  for (const e of events) {
    if (e.type !== 'blocking_changed' || typeof e.person !== 'string') continue;
    const bell = personEffects(state, reg, e.person).find((x): x is Extract<ReturnType<typeof personEffects>[number], { type: 'sound' }> => x.type === 'sound' && typeof x.id === 'string');
    if (bell?.id !== undefined) out.push(bell.id);
  }
  return out;
}

/** The scene settings the campaign's mirror must take (`campaign/set_scene_settings`), or `null` when it already holds them. */
export function sceneSettingsPatch(state: CampaignState, settings: SceneSettings): SceneSettings | null {
  const mine = sceneSettingsOf(state);
  const same = mine.momentFrequency === settings.momentFrequency && mine.momentExplicit === settings.momentExplicit && mine.physicsRealtime === settings.physicsRealtime
    && mine.marathonPace === settings.marathonPace && INTERACTION_TOGGLES.every((k) => mine.physicsInteractions[k] === settings.physicsInteractions[k]);
  return same ? null : { ...settings, physicsInteractions: { ...settings.physicsInteractions } };
}
