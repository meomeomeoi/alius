import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { eligibleTemplates } from '../../../src/engine/dilemma/flow';
import { buildDigest, fallbackOutput } from '../../../src/engine/world/director';
import { eventPool } from '../../../src/engine/world/expedition';
import { checkOffer } from '../../../src/engine/world/missions';
import { campaign, loadCore } from '../../helpers/world';

/**
 * The tutorial patrol and its event exist only for the prologue's tutorial step. Until that step launches them (P11 Task 7),
 * nothing else in the world may draw, offer or describe them to the director.
 */
let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
});

describe('tutorial content stays out of the ordinary world', () => {
  it('checkOffer refuses a tutorial template in each of its own regions', () => {
    expect(reg.missionTemplates.get('tutorial_patrol')?.tutorial).toBe(true);
    for (const regionId of ['quarantine_d7', 'kestrel_corridor']) {
      expect(checkOffer(state, reg, { templateId: 'tutorial_patrol', regionId, source: 'command' }), regionId).toMatch(/tutorial/i);
      expect(checkOffer(state, reg, { templateId: 'tutorial_patrol', regionId, source: 'command' }), regionId).not.toMatch(/Unknown|not known|not used/);
    }
  });

  it('the director digest does not list the tutorial template', () => {
    expect(buildDigest(state, reg).templates.map((t) => t.id)).not.toContain('tutorial_patrol');
  });

  it('the no-model fallback never offers the tutorial', () => {
    const offered = Array.from({ length: 60 }, (_, i) => fallbackOutput(state, reg, new Rng(seedRng(i + 1))).missionOffers.map((o) => o.templateId)).flat();
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).not.toContain('tutorial_patrol');
  });

  it('the tutorial event is not drawn at random on any map', () => {
    expect(reg.dilemmaTemplates.has('evt_tutorial_choice')).toBe(true);
    for (const region of reg.regions.keys()) expect(eventPool(state, reg, region).map((t) => t.id), region).not.toContain('evt_tutorial_choice');
  });

  it('pacing never picks the tutorial event for a dilemma', () => {
    expect(eligibleTemplates(state, reg, ['expedition_event', 'base', 'director']).map((t) => t.id)).not.toContain('evt_tutorial_choice');
  });
});
