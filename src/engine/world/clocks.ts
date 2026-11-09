import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { applyWorldEffects } from './effects';
import { clockById } from './state';
import type { WorldEffect } from './types';

/**
 * Moves a clock by `by` (clamped to 0…segments). Reaching `segments` fills it once: `clock_filled`, the content
 * entry's `onFill` effects run, and a `repeat` clock starts over. A full clock that does not repeat ignores
 * every further advance. `depth` is the nesting of the effect chain that led here (see `applyWorldEffects`).
 */
export function advanceClock(
  draft: CampaignState, ctx: EngineCtx, clockId: string, by: number, reason: string, depth = 0,
): EngineEvent[] {
  const clock = clockById(draft, clockId);
  if (!clock) return [];
  const def = ctx.registries.clocks.get(clockId);
  const repeat = def?.repeat === true;
  if (clock.filled >= clock.segments && !repeat) return [];
  const next = Math.min(clock.segments, Math.max(0, clock.filled + by));
  const delta = next - clock.filled;
  if (delta === 0) return [];
  clock.filled = next;
  const events: EngineEvent[] = [{ type: 'clock_advanced', clockId, filled: next, by: delta, reason }];
  if (next < clock.segments) return events;

  clock.filledDay = draft.day;
  events.push({ type: 'clock_filled', clockId, label: clock.label });
  // reset first: a chain of effects that reaches this clock again must find it empty, not full
  if (repeat) clock.filled = 0;
  const onFill = (def?.onFill as WorldEffect[] | undefined) ?? [];
  events.push(...applyWorldEffects(draft, ctx, onFill, { kind: 'clock', id: clockId, depth: depth + 1, label: clock.label }));
  return events;
}
