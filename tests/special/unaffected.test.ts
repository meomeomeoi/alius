import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import type { Action } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { loadCore, run, unitSetup } from '../helpers/world';
import { buildCampaign } from '../../src/engine/setup';
import { ANN, BEA, CAT } from '../helpers/special';
import { defaultFormation } from '../../src/engine/combat/stats';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const fresh = (): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    commander: { body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: ['insomniac'] } },
  }, reg, { desireBondDefects: false, seed: 17 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};

/** The scripted week: scenes, DMs, a combat and the day ends between them. */
function week(start: CampaignState): CampaignState {
  let s = start;
  const step = (a: Action): void => {
    const r = run(s, reg, a);
    if (!r.events.some((e) => e.type === 'error')) s = r.state;
  };
  for (let day = 0; day < 7; day++) {
    const who = [ANN, BEA, CAT][day % 3];
    step({ type: 'scene/start', payload: { locationId: 'mess_hall', participants: [who], origin: 'event', startIndex: day } });
    step({ type: 'scene/exchange', payload: {} });
    step({ type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'praised', actor: 'commander', targets: [who], severity: 'minor', evidence: 'well done', confidence: 0.9 }] } } });
    step({ type: 'scene/end', payload: {} });
    step({ type: 'dm/receive', payload: { unitId: who, text: `day ${day}` } });
    step({ type: 'dm/receive', payload: { unitId: BEA, text: 'again' } });
    if (day === 3) {
      step({ type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true }, formation: defaultFormation(s, reg, s.roster.activeIds), coverId: s.roster.activeIds[0] } });
      step({ type: 'combat/auto', payload: { on: true } });
    }
    s = endDay(s, reg);
  }
  return s;
}

/** The state as the week left it, without the parts the plan sets aside (the ledger and the commander's stress). */
const comparable = (s: CampaignState): unknown => {
  const c = structuredClone(s) as unknown as Record<string, unknown>;
  delete c.ledger;
  delete c.special;
  delete (c.commander as Record<string, unknown>).stress;
  return c;
};

describe('a campaign without a special trait is unaffected (acceptance 5, Review Focus 1)', () => {
  it('a seeded week of day ends, scenes, DMs and a combat is identical with and without an empty special block', () => {
    const plain = week(fresh());
    const withBlock = fresh();
    withBlock.special = {};
    const empty = week(withBlock);
    expect(plain.day).toBeGreaterThan(7);
    expect(plain.lastCombat).toBeDefined(); // the combat really ran
    expect(JSON.stringify(comparable(empty))).toBe(JSON.stringify(comparable(plain)));
    expect(empty.rng).toEqual(plain.rng);
  });

  it('draws nothing of its own: the whole week leaves no special state behind', () => {
    const s = week(fresh());
    expect(s.special).toBeUndefined();
    expect(Object.keys(s.commander).includes('stress') ? (s.commander.stress ?? 0) : 0).toBeLessThanOrEqual(10); // only a downed commander moves it
    expect(new Rng(s.rng).state).toEqual(s.rng);
  });
});
