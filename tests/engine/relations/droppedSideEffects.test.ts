import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
});

const at = (level: string): CampaignState => {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), disposition: level };
  return s;
};
const ev = (type: string, confidence: number, over: Record<string, unknown> = {}) => ({
  type, actor: 'commander', targets: [ANN], severity: 'major', evidence: 'x', confidence, ...over,
});
const apply = (s: CampaignState, events: unknown[]) => run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events } } });

describe('an event dropped for a unit has none of its side effects (P8)', () => {
  it('a crime_revealed below her floors reveals nothing; at hazardous the same event lands', () => {
    expect(base.relations[ANN].flags).not.toContain('knows_crime');
    const guarded = apply(at('guarded'), [ev('crime_revealed', 0.45)]);
    expect(errors(guarded.events)).toEqual([]);
    expect(guarded.state.relations[ANN].flags).not.toContain('knows_crime');
    expect(guarded.state.relations[ANN].flags).not.toContain('crime_reaction_done');
    const hazardous = apply(at('hazardous'), [ev('crime_revealed', 0.45)]);
    expect(hazardous.state.relations[ANN].flags).toContain('knows_crime');
    // the control: at guarded a believed event still reveals
    expect(apply(at('guarded'), [ev('crime_revealed', 0.6)]).state.relations[ANN].flags).toContain('knows_crime');
  });

  it('a shared_secret below her floors sets no flag', () => {
    const secret = ev('shared_secret', 0.45, { actor: ANN, targets: [] });
    expect(apply(at('guarded'), [secret]).state.relations[ANN].flags).not.toContain('shared_secret');
    expect(apply(at('hazardous'), [secret]).state.relations[ANN].flags).toContain('shared_secret');
  });

  it('intents_applied lists the types that landed, so the UI shows no cut-in for a dropped event', () => {
    const r = apply(at('guarded'), [ev('crime_revealed', 0.45, { severity: 'extreme' }), ev('praised', 0.8, { severity: 'extreme' })]);
    expect(ofType(r.events, 'intents_applied')[0]).toMatchObject({ landed: ['praised'] });
    const h = apply(at('hazardous'), [ev('crime_revealed', 0.45)]);
    expect(ofType(h.events, 'intents_applied')[0].landed).toEqual(['crime_revealed']);
  });
});
