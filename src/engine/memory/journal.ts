import type { Registries } from '../../content/types';
import { INTERNAL_HISTORY_TYPES } from '../relations/vocab';
import type { CampaignState, Severity } from '../state/types';

const SEVERE: readonly Severity[] = ['moderate', 'major', 'extreme'];
/** Events of the last this-many days are shown whatever their severity. */
const RECENT_DAYS = 2;
const DETAIL_MAX = 100;

const humanize = (type: string): string => type.replace(/_/g, ' ');

/**
 * The recent story between the commander and one unit, as the main model reads it: the last `n` entries of her relation history of
 * kind `event` (never an internal mark like `stress_high`) with a severity of at least `moderate`, or from the last 2 days at any
 * severity, oldest first. Each is `{phrase} (day N)`, the phrase being the event delta's `journal` wording (the humanized id without
 * one); with `evidence` (a private scene only) the model's own evidence is appended: `{phrase} (day N): '{detail}'`.
 */
export function journalLines(state: CampaignState, reg: Registries, unitId: string, o: { n: number; evidence: boolean }): string[] {
  const history = state.relations[unitId]?.history ?? [];
  const internal: readonly string[] = INTERNAL_HISTORY_TYPES;
  const kept = history.filter((h) => h.kind === 'event' && !internal.includes(h.type) && ((h.severity !== undefined && SEVERE.includes(h.severity)) || h.day >= state.day - RECENT_DAYS));
  if (o.n <= 0) return [];
  return kept.slice(-o.n).map((h) => {
    const phrase = reg.eventDeltas.get(h.type)?.journal;
    const base = `${typeof phrase === 'string' && phrase !== '' ? phrase : humanize(h.type)} (day ${h.day})`;
    return o.evidence && h.detail ? `${base}: '${h.detail.slice(0, DETAIL_MAX)}'` : base;
  });
}
