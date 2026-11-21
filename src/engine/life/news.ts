import type { EngineEvent } from '../dispatch';
import type { CampaignState, NewsItem } from '../state/types';
import { ensureLife, nextLifeId } from './state';

/**
 * The news queue (P14c): what has happened to her and has not been told yet. This module only appends; the pacing, the channels and the
 * staleness of delivery are the later tasks'. The queue and its order are never shown.
 */

/** Puts an item at the end of the queue with the next id (`ln<n>`). The event carries no text and no ref: it can reach a toast. */
export function enqueue(draft: CampaignState, item: Omit<NewsItem, 'id'>): EngineEvent[] {
  const life = ensureLife(draft);
  const queued: NewsItem = { id: nextLifeId(life, 'ln'), ...item };
  life.queue.push(queued);
  return [{ type: 'news_queued', itemId: queued.id, unitId: queued.unitId }];
}
