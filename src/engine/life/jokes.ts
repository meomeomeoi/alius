import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { countJoke } from '../development/habits';
import type { CampaignState, Fact } from '../state/types';
import { TUNING } from '../tuning';
import { unitOf } from './places';
import { UNTOLD_TAG, lifeChance, temperamentOf } from './state';

/**
 * Running jokes (P14c §6): something the commander and she have shared, brought back again. The model reports a `joke_returned` for a fact it
 * was offered; three returns inside 30 days make the joke theirs, and she may bring the newest one back in a later private scene (a hash, by
 * her sense of humor, never within five days of the last time). No rng is drawn: the chances are hashes of the life salt.
 */

/** A fact she may joke about: about her, known to her and not hidden from the commander, told (not `untold`), and at least `minAgeDays` old. */
const jokeable = (f: Fact, unitId: string, day: number): boolean =>
  f.about.includes(unitId) && f.knownBy.includes(unitId) && f.hiddenFromCommander !== true && !f.tags.includes(UNTOLD_TAG) && day - f.day >= TUNING.life.joke.minAgeDays;

/**
 * The facts the intent model may report as a joke that came back, at most `offerMax` (5), without repeats and in this order: the joke picked
 * for this scene (if it is still jokeable), then the facts that are already jokes of hers (a return within `windowDays`, the last return first), then the
 * newest of the rest she may joke about (a later fact first on the same day). A running joke is thus always offered, however many newer facts exist.
 */
export function jokeCandidates(state: Pick<CampaignState, 'memory' | 'squad' | 'life' | 'scene'>, unitId: string, day: number): Array<{ id: string; text: string }> {
  const unit = unitOf(state, unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return [];
  const mine = state.life?.units[unitId];
  const eligible = state.memory.facts.filter((f) => jokeable(f, unitId, day));
  const byId = new Map(eligible.map((f) => [f.id, f]));
  const picked = mine?.scene !== undefined && mine.scene.sceneId === state.scene?.id ? mine.scene.joke : undefined;
  const already = Object.entries(mine?.jokes ?? {}).filter(([, j]) => day - j.last <= TUNING.life.joke.windowDays).sort((a, b) => b[1].last - a[1].last || a[0].localeCompare(b[0])).map(([id]) => id);
  const newest = eligible.map((f, at) => ({ f, at })).sort((a, b) => b.f.day - a.f.day || b.at - a.at).map(({ f }) => f.id);
  const ids = [...new Set([...(picked !== undefined ? [picked] : []), ...already, ...newest])].filter((id) => byId.has(id)).slice(0, TUNING.life.joke.offerMax);
  return ids.map((id) => ({ id, text: byId.get(id)!.text }));
}

/**
 * The joke came back: its count in `jokes` goes up by one (and starts again at one when the last return is more than `windowDays` (30) old),
 * and, only when it is the joke picked for this scene, `jokeDay` is today and the pick is used up (any other return only counts), and the P14b counter `joke:<fact>` is bumped (the habit
 * `running_joke` forms while development runs). Nothing for a woman who is not named and living or a fact that is gone.
 */
export function returnJoke(draft: CampaignState, reg: Parameters<typeof countJoke>[1], unitId: string, factId: string, day: number): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const life = draft.life;
  if (!life || !unit || unit.kind !== 'named' || !isLiving(unit) || !draft.memory.facts.some((f) => f.id === factId)) return [];
  const mine = (life.units[unitId] ??= { last: {} });
  const jokes = (mine.jokes ??= {});
  const was = jokes[factId];
  jokes[factId] = { count: was !== undefined && day - was.last <= TUNING.life.joke.windowDays ? was.count + 1 : 1, last: day };
  if (mine.scene?.joke === factId) { // the joke she was going to bring back this scene: used up, and the day she last did
    mine.jokeDay = day;
    delete mine.scene.joke;
  }
  return [{ type: 'joke_counted', unitId }, ...countJoke(draft, reg, unitId, factId)];
}

/** Her running jokes (a count of `running` (3) or more, the last return within `windowDays`), the one brought back most recently first. */
export function runningJokes(state: Pick<CampaignState, 'life'>, unitId: string, day: number): string[] {
  const jokes = state.life?.units[unitId]?.jokes ?? {};
  return Object.entries(jokes)
    .filter(([, j]) => j.count >= TUNING.life.joke.running && day - j.last <= TUNING.life.joke.windowDays)
    .sort((a, b) => b[1].last - a[1].last || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/**
 * A private scene opens: she may bring back her newest running joke, once. Not when her humor is `none`, not within `gapDays` (5) of the last
 * time, and then by a hash of the scene and her (`base` 0.3 x warm 1, mocking 1, dry 0.6). The joke is stored on her `scene` (the directive
 * reads it) and its fact id is returned; null when she does not.
 */
export function pickJoke(draft: CampaignState, unitId: string, sceneId: string, day: number): string | null {
  const life = draft.life;
  const mine = life?.units[unitId];
  if (!life || !mine?.scene || mine.scene.sceneId !== sceneId) return null;
  const j = TUNING.life.joke;
  const weight = j.humor[temperamentOf(draft, unitId).humor];
  if (weight === 0 || (mine.jokeDay !== undefined && day - mine.jokeDay < j.gapDays)) return null;
  const [newest] = runningJokes(draft, unitId, day);
  if (newest === undefined || !draft.memory.facts.some((f) => f.id === newest)) return null;
  if (!lifeChance(life, `${sceneId}|joke|${unitId}`, j.base * weight)) return null;
  mine.scene.joke = newest;
  return newest;
}
