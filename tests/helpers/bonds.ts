import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { CONTENT_GATED_REGISTRIES, rollRules } from '../../src/engine/bonds';
import { eligibleTemplates as dilemmaTemplates } from '../../src/engine/dilemma/flow';
import { DILEMMA_CONTEXTS } from '../../src/engine/dilemma/types';
import { measureList, openDemand } from '../../src/engine/discipline';
import { Rng, seedRng } from '../../src/engine/rng';
import type { Bond, CampaignState } from '../../src/engine/state/types';
import { buildDigest } from '../../src/engine/world';
import { checkOffer } from '../../src/engine/world/missions';
import { eventPool } from '../../src/engine/world/expedition';
import { seedWorld } from '../../src/engine/world/state';

// Importing this registers the P9d actions under test.
import '../../src/engine/actions/bonds';

export * from './discipline';

/** The core pack plus the fixture pack that carries one tagged entry per gated registry. */
export async function loadGate(): Promise<Registries> {
  const r = await loadPacks(['content/core', 'tests/fixtures/packs/p9d_gate'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  if (r.errors.length > 0) throw new Error(JSON.stringify(r.errors));
  return r.registries;
}

/** The ids of the fixture pack's tagged entries, per gated registry, and the category each carries. */
export const GATE_FIXTURE: Record<string, { ids: string[]; category: string }> = {
  relationshipRuleTemplates: { ids: ['gate_rule'], category: 'public_humiliation' },
  demandTemplates: { ids: ['gate_demand'], category: 'humiliation' },
  punishments: { ids: ['gate_punish'], category: 'degrading_language' },
  dilemmaTemplates: { ids: ['gate_dilemma', 'gate_event'], category: 'restraint' },
  missionTemplates: { ids: ['gate_mission'], category: 'pain_rough' },
  clocks: { ids: ['gate_clock'], category: 'jealousy_games' },
};

/** Turns categories on in place (and returns the state). */
export function enable(state: CampaignState, ...ids: string[]): CampaignState {
  state.content = { enabled: [...ids] };
  return state;
}

/** Writes a bond profile on a unit (in place). */
export function withBond(state: CampaignState, unitId: string, bond: Partial<Bond>): CampaignState {
  const u = state.squad.find((x) => x.id === unitId);
  if (!u) throw new Error(`no unit ${unitId}`);
  u.bond = { leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', ...bond };
  return state;
}

/**
 * Per gated registry: the ids of that registry's entries the engine would hand out for `state` — through the function that
 * picks from it. Random pickers are run over 50 seeds. A registry that joins `CONTENT_GATED_REGISTRIES` needs a probe here.
 */
export const GATE_PROBES: Record<(typeof CONTENT_GATED_REGISTRIES)[number], (state: CampaignState, reg: Registries) => string[]> = {
  relationshipRuleTemplates: (state, reg) => {
    // an assertive lover is the one unit that can be proposed to; the roll is seeded, so run it over 50 seeds
    const s = structuredClone(state);
    s.relations[s.squad[0].id].stateId = 'lover';
    withBond(s, s.squad[0].id, { leadStyle: 'dominant' });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const d = structuredClone(s);
      rollRules(d, { registries: reg, rng: new Rng(seedRng(seed)) });
      for (const r of d.bonds?.rules ?? []) seen.add(r.templateId);
    }
    return [...seen];
  },
  demandTemplates: (state, reg) => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      for (const u of state.squad.filter((x) => x.kind === 'named')) {
        const s = structuredClone(state);
        const opened = openDemand(s, { registries: reg, rng: new Rng(seedRng(seed)) }, u.id);
        if (opened) seen.add(opened.demand.templateId);
      }
    }
    return [...seen];
  },
  punishments: (state, reg) => measureList(reg, state),
  dilemmaTemplates: (state, reg) => [
    ...dilemmaTemplates(state, reg, [...DILEMMA_CONTEXTS]).map((t) => String(t.id)),
    ...[...reg.regions.keys()].flatMap((rid) => eventPool(state, reg, rid).map((t) => String(t.id))),
  ],
  missionTemplates: (state, reg) => [
    ...buildDigest(state, reg).templates.map((t) => t.id),
    ...[...reg.missionTemplates.keys()].filter((id) => checkOffer(state, reg, { templateId: id, regionId: 'quarantine_d7', source: 'command' } as never) === null),
  ],
  clocks: (state, reg) => {
    const s = structuredClone(state);
    s.world.seeded = false;
    s.world.clocks = [];
    seedWorld(s, reg);
    return s.world.clocks.map((c) => c.id);
  },
};
