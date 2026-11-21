import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, LifeState, NewsItem } from '../state/types';
import { TUNING } from '../tuning';
import { revealFact } from './facts';
import { takesPart } from './places';
import { ensureLife, lifeChance, lifeHash, lifeMode, nextLifeId, temperamentOf } from './state';
import type { HobbyEntry } from './types';

/**
 * The news queue (P14c): what has happened to her and has not been told yet. An item waits in `queue` until it is told. When it is delivered
 * it also stands in `outbox` (a DM or a note the controller words) or in `news` (a directive for her next scene) and is no longer waiting. The
 * pacing (caps, variety, order), the channel and the staleness live here; the queue and its order are never shown. No rng is drawn.
 */

/** Puts an item at the end of the queue with the next id (`ln<n>`). The event carries no text and no ref: it can reach a toast. */
export function enqueue(draft: CampaignState, item: Omit<NewsItem, 'id'>): EngineEvent[] {
  const life = ensureLife(draft);
  const queued: NewsItem = { id: nextLifeId(life, 'ln'), ...item };
  life.queue.push(queued);
  return [{ type: 'news_queued', itemId: queued.id, unitId: queued.unitId }];
}

/** The `trace` of the milestone an item is about (`note`, `prop`, `opinion`), or undefined. */
function traceOf(reg: Pick<Registries, 'hobbies'>, item: NewsItem): string | undefined {
  if (item.kind !== 'hobby' || item.milestoneId === undefined) return undefined;
  const entry = reg.hobbies.get(item.ref) as HobbyEntry | undefined;
  return entry?.milestones.find((m) => m.id === item.milestoneId)?.trace;
}

/**
 * How she brings it: a milestone whose trace is a `note` is a note in her quarters; otherwise a DM when the commander's DMs are on
 * (`settings.unitDms`, mirrored by the app; unknown = off) and she is talkative, or close (Affinity of 40 or more) and a hash of the item
 * says so (half the time); everything else is a news directive for her next scene.
 */
export function channelFor(state: CampaignState, reg: Pick<Registries, 'hobbies'>, item: NewsItem): 'dm' | 'directive' | 'note' {
  if (traceOf(reg, item) === 'note') return 'note';
  if (state.settings.unitDms !== true || !state.life) return 'directive';
  if (temperamentOf(state, item.unitId).talkativeness === 'talkative') return 'dm';
  const close = (state.relations[item.unitId]?.affinity ?? 0) >= TUNING.life.shareAffinity;
  return close && lifeChance(state.life, `${item.id}|dm`, TUNING.life.dmChance) ? 'dm' : 'directive';
}

/** Items that were delivered (they stand in the outbox or in the news) are not waiting. */
const held = (life: LifeState): Set<string> => new Set([...life.outbox.map((o) => o.itemId), ...life.news.map((n) => n.itemId)]);

/** How many items the squad may be told on `day`: `perDay` at `normal` and `often`, and one on every other day (the odd ones) at `rare`. */
function perDayCap(draft: CampaignState, day: number): number {
  const mode = lifeMode(draft);
  if (mode === 'off') return 0;
  const per = TUNING.life.perDay[mode];
  return per >= 1 ? per : day % Math.round(1 / per) === 1 ? 1 : 0;
}

/** What she did not tell: the item goes (its fact stays hers, hidden), the news entry goes, `news_stale` says so. */
function drop(life: LifeState, itemId: string, unitId: string): EngineEvent[] {
  life.news = life.news.filter((n) => n.itemId !== itemId);
  life.queue = life.queue.filter((q) => q.id !== itemId);
  return [{ type: 'news_stale', itemId, unitId }];
}

/**
 * The end of the news that was not used: a news entry past its day is dropped (a directive after three days, a passing mention too), and an
 * item still waiting after more than seven days stops being news: it becomes a passing mention, a `news` entry she may drop into a talk and
 * that goes after her next scene or three days. Runs before delivery, so a stale item is never delivered.
 */
export function staleSweep(draft: CampaignState, day: number): EngineEvent[] {
  const life = draft.life;
  if (!life || lifeMode(draft) === 'off') return [];
  const events: EngineEvent[] = [];
  for (const n of [...life.news]) if (day >= n.until) events.push(...drop(life, n.itemId, n.unitId));
  const standing = held(life);
  for (const item of life.queue) {
    if (standing.has(item.id) || day - item.day <= TUNING.life.staleDays) continue;
    life.news.push({ itemId: item.id, unitId: item.unitId, until: day + TUNING.life.newsDays, passing: true });
  }
  return events;
}

/** A scene with her has ended: whatever she had to tell and did not is gone (a told item was closed already). Called from `scene/end`. */
export function endSceneNews(draft: CampaignState, unitIds: readonly string[]): EngineEvent[] {
  const life = draft.life;
  if (!life || life.news.length === 0) return [];
  const events: EngineEvent[] = [];
  for (const n of [...life.news]) if (unitIds.includes(n.unitId)) events.push(...drop(life, n.itemId, n.unitId));
  return events;
}

/** Delivers one item through its channel and records the delivery. */
function deliver(draft: CampaignState, reg: Registries, life: LifeState, item: NewsItem, day: number): EngineEvent[] {
  const channel = channelFor(draft, reg, item);
  if (channel === 'directive') life.news.push({ itemId: item.id, unitId: item.unitId, until: day + TUNING.life.newsDays });
  else life.outbox.push({ itemId: item.id, unitId: item.unitId, channel, day });
  life.delivered.push({ day, unitId: item.unitId, category: item.category, hobby: item.kind === 'hobby' });
  return [{ type: 'news_delivered', itemId: item.id, unitId: item.unitId, channel }];
}

/**
 * Tells the commander what has happened to her, paced: at most `perDay` items a day squad-wide (rare: one every other day), at most two
 * hobby items in any seven days (an item the commander caused counts), no woman twice within two days, and the category of the last item is
 * never repeated (when only that category waits, the day is skipped). The order is a notable item first, then the oldest, then the category
 * delivered longest ago, then a hash. An urgent item bypasses every cap on its day and still counts. Run after `staleSweep`.
 */
export function deliverNews(draft: CampaignState, reg: Registries, day: number): EngineEvent[] {
  const life = draft.life;
  if (!life || lifeMode(draft) === 'off') return [];
  life.delivered = life.delivered.filter((r) => day - r.day < TUNING.life.deliveredKeep);
  const t = TUNING.life;
  const events: EngineEvent[] = [];
  const inQueue = (): NewsItem[] => {
    const standing = held(life);
    return life.queue.filter((i) => !standing.has(i.id) && day - i.day <= t.staleDays && takesPart(draft, i.unitId));
  };
  const told = (): LifeState['delivered'] => life.delivered.filter((r) => r.caused !== true);
  const lastIndex = (category: string): number => told().map((r) => r.category).lastIndexOf(category);
  const order = (a: NewsItem, b: NewsItem): number =>
    Number(b.notable === true) - Number(a.notable === true) || a.day - b.day || lastIndex(a.category) - lastIndex(b.category) || lifeHash(life, a.id) - lifeHash(life, b.id);

  for (const item of inQueue().filter((i) => i.urgent === true).sort(order)) events.push(...deliver(draft, reg, life, item, day));

  const cap = perDayCap(draft, day);
  for (;;) {
    if (told().filter((r) => r.day === day).length >= cap) break;
    const last = told().at(-1);
    const pick = inQueue()
      .filter((i) => i.urgent !== true)
      .filter((i) => last === undefined || i.category !== last.category)
      .filter((i) => !told().some((r) => r.unitId === i.unitId && day - r.day < t.sameWomanDays))
      .filter((i) => i.kind !== 'hobby' || life.delivered.filter((r) => r.hobby && day - r.day < 7).length < t.hobbyWeek)
      .sort(order)[0];
    if (!pick) break;
    events.push(...deliver(draft, reg, life, pick, day));
  }
  return events;
}

/** What she has to tell, newest first is not wanted: her news entries with the text of their fact, the oldest item first. A fact that is gone leaves no line. */
export function pendingNews(state: Pick<CampaignState, 'life' | 'memory'>, unitId: string): Array<{ itemId: string; text: string; passing?: true }> {
  const life = state.life;
  if (!life) return [];
  const out: Array<{ itemId: string; text: string; passing?: true; day: number; at: number }> = [];
  for (const n of life.news) {
    if (n.unitId !== unitId) continue;
    const at = life.queue.findIndex((q) => q.id === n.itemId);
    const item = life.queue[at];
    const text = item?.factId === undefined ? undefined : state.memory.facts.find((f) => f.id === item.factId)?.text;
    if (item && text) out.push({ itemId: n.itemId, text, ...(n.passing === true ? { passing: true as const } : {}), day: item.day, at });
  }
  return out.sort((a, b) => a.day - b.day || a.at - b.at).map(({ itemId, text, passing }) => ({ itemId, text, ...(passing === true ? { passing: true as const } : {}) }));
}

/**
 * The commander has been told: the fact is revealed (no longer hidden or `untold`), the item leaves the queue, the outbox and the news, and
 * `life_noted` says so. Nothing for an item that is not there (it was told already).
 */
export function closeNews(draft: CampaignState, itemId: string): EngineEvent[] {
  const life = draft.life;
  const item = life?.queue.find((q) => q.id === itemId);
  if (!life || !item) return [];
  if (item.factId !== undefined) revealFact(draft, item.factId);
  life.queue = life.queue.filter((q) => q.id !== itemId);
  life.outbox = life.outbox.filter((o) => o.itemId !== itemId);
  life.news = life.news.filter((n) => n.itemId !== itemId);
  return [{ type: 'life_noted', unitId: item.unitId, itemId }];
}
