import { styleOf } from '../dynamic/profile';
import type { MannerAxis, Practice } from '../dynamic/types';
import type { Development, Unit } from '../state/types';
import { mannerKey } from './mannerKeys';

/**
 * Her manner drift and her style pair as the scenes have carried them (P15b, review fix): what a dossier shows, as `buildKnowledge.development` shows her lines. A drift step or a turn
 * is quiet and reaches the dossier only once the scene that stamped it has ended (`shownDay`), and a REROLL that retracts one never showed it. Starts from the state now and takes back,
 * newest first, every manner moment that is not shown yet: a step puts its axis back to its `from`, a turn puts back the overlay it recorded (`priorPractice`; a turn without one, from before
 * it was recorded, takes back the whole practice overlay). Pure.
 */
export function mannerAsShown(unit: Pick<Unit, 'bond' | 'development'>): { manner: Partial<Record<MannerAxis, number>> | undefined; style: Practice['style'] | undefined } {
  const dev = unit.development;
  let overlay: NonNullable<Development['practice']> = structuredClone(dev?.practice ?? {});
  const stored = unit.bond?.practice?.manner; // P14b: raw profile
  for (const m of [...(dev?.moments ?? [])].reverse()) {
    if (m.shownDay !== undefined) continue;
    const key = mannerKey(m.axis);
    if (key === null) continue;
    if (key.kind === 'axis') {
      const diff = Number(m.from) - (stored?.[key.axis] ?? 0);
      const manner = (overlay.manner ??= {});
      if (diff === 0) delete manner[key.axis]; else manner[key.axis] = diff;
      if (Object.keys(manner).length === 0) delete overlay.manner;
    } else if (key.kind === 'turn') {
      overlay = m.priorPractice !== undefined ? structuredClone(m.priorPractice) : {};
    }
  }
  return { manner: overlay.manner, style: styleOf({ bond: unit.bond, development: { ...(dev as Development), practice: overlay } }) };
}
