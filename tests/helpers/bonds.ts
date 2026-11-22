import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries, RegistryName } from '../../src/content/types';
import { CONTENT_GATED_REGISTRIES, contentAllowed, rollRules } from '../../src/engine/bonds';
import { bookingKindsFor } from '../../src/engine/personal/bookings';
import { offeredStakes } from '../../src/engine/personal/wagers';
import { eligibleTemplates as dilemmaTemplates } from '../../src/engine/dilemma/flow';
import { DILEMMA_CONTEXTS } from '../../src/engine/dilemma/types';
import { measureList, openDemand } from '../../src/engine/discipline';
import { Rng, seedRng } from '../../src/engine/rng';
import { practiceCategories } from '../../src/engine/dynamic/profile';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { pickSeeds } from '../../src/engine/practice/seeds';
import { PRACTICE_KINDS } from '../../src/engine/practice/state';
import type { Bond, CampaignState } from '../../src/engine/state/types';
import { buildDigest } from '../../src/engine/world';
import { checkOffer } from '../../src/engine/world/missions';
import { eventPool } from '../../src/engine/world/expedition';
import { seedWorld } from '../../src/engine/world/state';
import { allowedHabits } from '../../src/engine/development/habits';
import { allowedRules } from '../../src/engine/development/rules';
import { buildCampaign } from '../../src/engine/setup';
import { pickPunishment, wardenOf } from '../../src/engine/warden';
import { unitSetup } from './world';

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
  wagerStakes: { ids: ['gate_stake'], category: 'restraint' },
  developmentRules: { ids: ['gate_dev_rule'], category: 'restraint' },
  habits: { ids: ['gate_habit'], category: 'restraint' },
  commanderPunishments: { ids: ['gate_cmd_punish'], category: 'humiliation' },
  // P15a
  worshipTargets: { ids: ['gate_target'], category: 'worship' },
  blockingContacts: { ids: ['gate_contact'], category: 'restraint' },
  blockingItems: { ids: ['gate_item'], category: 'pain_rough' },
  blockingActivities: { ids: ['gate_activity'], category: 'humiliation' },
  momentSources: { ids: ['gate_source'], category: 'jealousy_games' },
  contactPhysics: { ids: ['gate_physics'], category: 'breath_play' },
  stimulusKinds: { ids: ['gate_stimulus'], category: 'bodily_fluids' },
  // P15
  dynamicMilestones: { ids: ['gate_milestone'], category: 'restraint' },
  aftermaths: { ids: ['gate_aftermath'], category: 'humiliation' },
  // P16
  practiceSeeds: { ids: ['gate_seed'], category: 'pain_rough' },
  holderPunishments: { ids: ['gate_holder_punishment'], category: 'jealousy_games' },
  implements: { ids: ['gate_implement'], category: 'breath_play' },
  bookingKinds: { ids: ['gate_booking'], category: 'restraint' },
};

/** The ids of a registry the content gate lets through for `state` (the P15a registries until the blocking vocabulary reads them). */
function vocabularyIds(state: CampaignState, reg: Registries, name: RegistryName): string[] {
  return [...reg[name].values()].filter((e) => contentAllowed(state, reg, e)).map((e) => e.id);
}

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
  // a stake is offered to a unit who passes the wager gate (a balanced lead and some Affinity)
  wagerStakes: (state, reg) => {
    const s = structuredClone(state);
    for (const u of s.squad.filter((x) => x.kind === 'named')) {
      withBond(s, u.id, { leadStyle: 'balanced' });
      s.relations[u.id].affinity = 40;
    }
    return s.squad.filter((u) => u.kind === 'named').flatMap((u) => offeredStakes(s, reg, u.id).map((x) => String(x.id)));
  },
  // P14b: the rules and habits the development code would use (matchRules and checkHabits start from these)
  developmentRules: (state, reg) => allowedRules(state, reg).map((r) => r.id),
  habits: (state, reg) => allowedHabits(state, reg).map((h) => h.id),
  // P13: what the warden would pick, at every severity and every turn of the rotation (a LEASHSWAP campaign with this state's consent)
  commanderPunishments: (state, reg) => {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed: 9 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const s = out.state;
    if (state.content) s.content = structuredClone(state.content);
    const seen = new Set<string>();
    for (let n = 0; n < 8; n++) {
      wardenOf(s)!.punishLog = Array.from({ length: n }, () => ({ punishmentId: 'reprimand', day: 1, severity: 1 }));
      for (let sev = 1; sev <= 4; sev++) { const id = pickPunishment(s, reg, sev); if (id) seen.add(id); }
    }
    return [...seen];
  },
  // P15a: the vocabulary a live scene offers (Task 7 routes these through `blockingVocabulary`; until then every entry the gate lets through)
  worshipTargets: (state, reg) => vocabularyIds(state, reg, 'worshipTargets'),
  blockingContacts: (state, reg) => vocabularyIds(state, reg, 'blockingContacts'),
  blockingItems: (state, reg) => vocabularyIds(state, reg, 'blockingItems'),
  blockingActivities: (state, reg) => vocabularyIds(state, reg, 'blockingActivities'),
  momentSources: (state, reg) => vocabularyIds(state, reg, 'momentSources'),
  contactPhysics: (state, reg) => vocabularyIds(state, reg, 'contactPhysics'),
  stimulusKinds: (state, reg) => vocabularyIds(state, reg, 'stimulusKinds'),
  // P15: until the milestone offer and the aftermath pick read them (Tasks 21 and 30), every entry the gate lets through
  dynamicMilestones: (state, reg) => vocabularyIds(state, reg, 'dynamicMilestones'),
  aftermaths: (state, reg) => vocabularyIds(state, reg, 'aftermaths'),
  // P16: the seeds come through the real pick (`pickSeeds`, run over 50 days); until the punishment pick reads them (a later task of the package) the others are every entry the gate lets through; the bookings are the ones a named unit could be offered
  practiceSeeds: (state, reg) => {
    // a holder at play who practises every category the dynamic is about, with each track level high enough for any tier (the gate under test is the content one)
    const s = structuredClone(state);
    const holder = s.squad.find((u) => u.kind === 'named')!;
    const cats = practiceCategories(reg);
    s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'service'])] };
    withBond(s, holder.id, { leadStyle: 'dominant' });
    holder.bond!.practice = {
      categories: Object.fromEntries(cats.map((c) => [c, { as: 'enjoys' as const, witness: 'indifferent' as const }])), style: { primary: 'cold' as const }, audience: 'indifferent',
      inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    };
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    s.relations[holder.id].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 30, tracks: Object.fromEntries([...reg.dynamicTracks.keys()].map((t) => [t, { xp: 150, level: 5 as const }])) };
    s.relations[holder.id].stateId = 'lover';
    const seen = new Set<string>();
    for (let day = 1; day <= 50; day++) {
      s.day = day;
      for (const kind of PRACTICE_KINDS) for (const id of pickSeeds(s, reg, holder.id, kind)) seen.add(id);
    }
    return [...seen];
  },
  holderPunishments: (state, reg) => vocabularyIds(state, reg, 'holderPunishments'),
  implements: (state, reg) => vocabularyIds(state, reg, 'implements'),
  bookingKinds: (state, reg) => state.squad.filter((u) => u.kind === 'named').flatMap((u) => bookingKindsFor(state, reg, u.id).map((k) => String(k.id))),
  clocks: (state, reg) => {
    const s = structuredClone(state);
    s.world.seeded = false;
    s.world.clocks = [];
    seedWorld(s, reg);
    return s.world.clocks.map((c) => c.id);
  },
};
