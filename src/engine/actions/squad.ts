import type { Entry } from '../../content/types';
import { registerAction } from '../dispatch';
import { ensureDevelopment } from '../development/state';
import { applyFirstImpression } from '../commander/presence';
import { generateGrunt, gruntRelation } from '../grunts';
import { applyDispositionStart } from '../worldOptions';
import { livingUnits } from '../economy';
import {
  crimeEffectsOf, crimeKnownByDefault, initialRelation, makeNamedUnit, startingTrustAdjust, validateIncomingUnit, validateUnitProfile, type UnitSetup,
} from '../setup';
import { seedLife, takeUpHobbies } from '../life/hobbies';
import { TUNING } from '../tuning';
import { refundTree } from '../progression';
import { temperamentOf } from '../life/state';
import type { Bond, CampaignState, Insight, Temperament, WorldStance } from '../state/types';
import type { DefectInstance } from '../state/types';

// Importing this module registers the squad actions.

/** Sections a re-sync can replace. The baseline is excluded: relationship axes are engine truth once the campaign runs. */
export const RESYNC_SECTIONS = ['role', 'values', 'tags', 'signature', 'defects', 'tastes', 'disposition', 'stances', 'bond', 'development', 'temperament', 'hobbies', 'opinions'] as const;
export type ResyncSection = (typeof RESYNC_SECTIONS)[number];

export type ResyncPatch = Partial<Pick<UnitSetup, 'roleId' | 'values' | 'likes' | 'dislikes' | 'triggers' | 'signature' | 'defects'>> & {
  /** P7: replaces the unit's taste ids (an empty list clears them). Never changes an axis. */
  commanderTastes?: string[];
  /** P8: the unit's offset from the world level (0 clears it), its reason ('' clears it) and its stances ({} clears them). Never changes an axis. */
  dispositionOffset?: number;
  dispositionReason?: string;
  worldStances?: Record<string, WorldStance>;
  /** P9d: replaces the bond profile (lead style, attachment, desire, caretaker, her own limits, her publicity preference). Never touches Want or publicity of the relation. */
  bond?: Bond;
  /** P14b: the axes her card states strongly and how well she reads people. Never touches drift, accumulators or facts. */
  anchors?: string[];
  insight?: Insight;
  /** P14c: replaces her temperament fields (some or all); a field she has locked keeps its word. */
  temperament?: Partial<Temperament>;
  /** P14c: hobbies she should have (the missing ones are added at skill 0; a hobby she has keeps all its progress) and her aptitudes (replaced). */
  hobbies?: string[];
  aptitudes?: { high: string[]; low: string[] };
  /** P14c: the card's strong opinions; they replace only a `strong` opinion she never voiced and never moved. */
  opinions?: Record<string, { position: string; text?: string }>;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const SECTION_OF: Record<keyof ResyncPatch, ResyncSection> = {
  roleId: 'role', values: 'values', likes: 'tags', dislikes: 'tags', triggers: 'tags', signature: 'signature', defects: 'defects',
  commanderTastes: 'tastes', dispositionOffset: 'disposition', dispositionReason: 'disposition', worldStances: 'stances', bond: 'bond', anchors: 'development', insight: 'development', temperament: 'temperament',
  hobbies: 'hobbies', aptitudes: 'hobbies', opinions: 'opinions',
};

registerAction('squad/resync', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || !isObj(payload.patch)) {
    throw new Error('squad/resync needs { unitId, patch }');
  }
  const unit = draft.squad.find((u) => u.id === payload.unitId);
  if (!unit) throw new Error(`squad/resync: unknown unit "${payload.unitId}"`);
  const patch = payload.patch as ResyncPatch;
  const keys = (Object.keys(SECTION_OF) as Array<keyof ResyncPatch>).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) throw new Error('squad/resync: the patch has no re-syncable field');

  const next = {
    cardRef: unit.cardRef ?? '',
    displayName: unit.displayName,
    roleId: patch.roleId ?? unit.roleId,
    signature: patch.signature ?? unit.signatureSkill,
    defects: patch.defects ?? unit.defects.map((d) => ({ id: d.id, origin: d.origin ?? '' })),
    values: patch.values ?? unit.values,
    likes: patch.likes ?? unit.likes,
    dislikes: patch.dislikes ?? unit.dislikes,
    triggers: patch.triggers ?? unit.triggers,
    tastes: patch.commanderTastes ?? unit.commanderTastes,
    dispositionOffset: patch.dispositionOffset ?? unit.dispositionOffset,
    dispositionReason: patch.dispositionReason ?? unit.dispositionReason,
    worldStances: patch.worldStances ?? unit.worldStances,
    bond: patch.bond ?? unit.bond,
    anchors: patch.anchors ?? unit.development?.anchors,
    insight: patch.insight ?? unit.insight,
    temperament: patch.temperament as Temperament | undefined, // P14c: only the patch is checked (the words); a partial block is fine here
    hobbies: patch.hobbies, // P14c: only the patch is checked
    aptitudes: patch.aptitudes,
    opinions: patch.opinions,
  };
  const errors = validateUnitProfile(next, unit.displayName, ctx.registries, {
    desireBondDefects: draft.settings.desireBondDefects === true,
    inactiveHobbies: (unit.hobbies ?? []).filter((h) => h.state !== 'active').map((h) => h.id),
  });
  if (errors.length > 0) throw new Error(errors.join('; '));

  const extra: Array<{ type: string; [k: string]: unknown }> = [];
  if (patch.roleId !== undefined && patch.roleId !== unit.roleId) {
    // the old role's nodes are not in the new tree: give their points back first, free (a role change is not a paid respec)
    if (unit.unlockedNodes.length > 0 || unit.loadout !== undefined) {
      const refunded = refundTree(ctx.registries, unit);
      extra.push({ type: 'unit_respec', unitId: unit.id, refunded });
    }
    const stats = (ctx.registries.roles.get(patch.roleId) as Entry).baseStats as typeof unit.baseStats;
    unit.roleId = patch.roleId;
    unit.baseStats = { ...stats };
    unit.currentHp = stats.hp;
  }
  if (patch.values) unit.values = { ...patch.values };
  if (patch.likes) unit.likes = [...patch.likes];
  if (patch.dislikes) unit.dislikes = [...patch.dislikes];
  if (patch.triggers) unit.triggers = [...patch.triggers];
  if (patch.signature) unit.signatureSkill = { ...patch.signature };
  if (patch.commanderTastes) {
    if (patch.commanderTastes.length > 0) unit.commanderTastes = [...patch.commanderTastes];
    else delete unit.commanderTastes;
  }
  if (patch.dispositionOffset !== undefined) {
    if (patch.dispositionOffset !== 0) unit.dispositionOffset = patch.dispositionOffset;
    else delete unit.dispositionOffset;
  }
  if (patch.dispositionReason !== undefined) {
    if (patch.dispositionReason !== '') unit.dispositionReason = patch.dispositionReason;
    else delete unit.dispositionReason;
  }
  if (patch.worldStances !== undefined) {
    if (Object.keys(patch.worldStances).length > 0) unit.worldStances = structuredClone(patch.worldStances);
    else delete unit.worldStances;
  }
  if (patch.bond !== undefined) unit.bond = structuredClone(patch.bond);
  // P14b: "Reset development" starts her over; anchors and insight come from the card, drift and facts never do
  if (payload.resetDevelopment === true) delete unit.development;
  if (patch.anchors !== undefined) {
    if (patch.anchors.length > 0) ensureDevelopment(unit).anchors = [...patch.anchors];
    else if (unit.development) unit.development.anchors = [];
  }
  if (patch.insight !== undefined) {
    if (patch.insight === 'mid') delete unit.insight;
    else unit.insight = patch.insight;
  }
  if (patch.temperament !== undefined) {
    // P14c: a locked field keeps the word she has; the others take the patch
    const locked = unit.temperamentLocks ?? [];
    const kept = Object.fromEntries(Object.entries(patch.temperament).filter(([f]) => !locked.includes(f as keyof Temperament)));
    unit.temperament = { ...temperamentOf(draft, unit.id), ...kept };
  }
  // P14c: "Reset life" starts her life over (her hobbies, her opinions and what is kept of her days); the card still says who she is
  if (payload.resetLife === true) {
    delete unit.hobbies;
    delete unit.opinions;
    delete draft.life?.units[unit.id];
  }
  if (patch.aptitudes !== undefined) {
    if (patch.aptitudes.high.length > 0 || patch.aptitudes.low.length > 0) unit.aptitudes = { high: [...patch.aptitudes.high], low: [...patch.aptitudes.low] };
    else delete unit.aptitudes;
  }
  if (patch.hobbies !== undefined && unit.kind === 'named') {
    // a re-sync adds starting hobbies (past three active the coolest goes to cooling); it never deletes a hobby or its progress
    const added = patch.hobbies.filter((id) => !(unit.hobbies ?? []).some((h) => h.id === id));
    extra.push(...takeUpHobbies(unit, added, draft.day));
    if (added.length > 0) seedLife(draft, ctx.registries, { unitId: unit.id, hobbyIds: added });
  }
  if (patch.opinions !== undefined && unit.kind === 'named') {
    // only a strong opinion that was never voiced and never moved is the card's to replace; the rest is hers now
    const mine = unit.opinions ?? {};
    const kept = Object.fromEntries(Object.entries(mine).filter(([, o]) => o.strength !== 'strong' || o.voicedDay !== undefined || (o.history?.length ?? 0) > 0));
    for (const [topicId, o] of Object.entries(patch.opinions)) {
      if (topicId in kept) continue;
      kept[topicId] = { position: o.position, strength: 'strong', ...(o.text ? { text: o.text } : {}), formedDay: draft.day };
    }
    if (Object.keys(kept).length > 0) unit.opinions = kept;
    else delete unit.opinions;
  }
  if (patch.defects) {
    unit.defects = patch.defects.map((d): DefectInstance => {
      const kept = unit.defects.find((x) => x.id === d.id); // keeps arc progress of a defect that stays
      return { ...kept, id: d.id, origin: d.origin };
    });
  }

  const sections = RESYNC_SECTIONS.filter((s) => keys.some((k) => SECTION_OF[k] === s));
  return [{ type: 'unit_resynced', unitId: unit.id, sections }, ...extra];
});

// ---------------------------------------------------------------------------------------------
// P5: incoming named units (a story outcome offers one; the player imports a card or a grunt joins instead)

/** Why nobody can join now, or `null`. */
export function checkIncoming(state: CampaignState): string | null {
  if ((state.world.incomingUnits ?? 0) < 1) return 'No unit is waiting for intake.';
  if (livingUnits(state).length >= state.roster.capacity) return 'No free bed: upgrade the barracks or let someone go.';
  return null;
}

registerAction('squad/add_named', (draft, payload, ctx) => {
  const reason = checkIncoming(draft);
  if (reason) throw new Error(reason);
  const u = isObj(payload) ? (payload.unit as UnitSetup | undefined) : undefined;
  if (!isObj(u)) throw new Error('squad/add_named needs { unit }');
  const problems = validateIncomingUnit(u as UnitSetup, ctx.registries, { desireBondDefects: draft.settings.desireBondDefects === true });
  if (draft.squad.some((x) => x.cardRef !== undefined && x.cardRef === u.cardRef)) problems.push(`Card "${String(u.cardRef)}" is already in the squad`);
  if (problems.length > 0) throw new Error(problems.join('; '));

  const reg = ctx.registries;
  const unit = makeNamedUnit(u as UnitSetup, reg, new Set(draft.squad.map((x) => x.id)), draft.day);
  const crime = reg.crimes.get(draft.commander.crimeId ?? '');
  const start = reg.starts.get(draft.world.startId ?? '');
  const setup = u as UnitSetup;
  draft.relations[unit.id] = initialRelation({
    trust: setup.baseline.trust + (crime ? startingTrustAdjust(crimeEffectsOf(crime), setup.values) : 0),
    affinity: setup.baseline.affinity,
    attraction: setup.baseline.attraction,
    knowsCrime: crime ? crimeKnownByDefault(crime, start) : false,
    since: draft.day,
  });
  applyDispositionStart(draft, reg, unit, draft.relations[unit.id]); // P8: before the first impression, which re-bases the band
  applyFirstImpression(draft, reg, unit, draft.relations[unit.id]);
  // dead units leave the active list first, as when a grunt is recruited
  const active = draft.roster.activeIds.filter((id) => draft.squad.some((x) => x.id === id && x.status !== 'dead'));
  if (active.length < TUNING.rosterActiveMax) {
    active.push(unit.id);
  } else {
    unit.status = 'reserve';
  }
  draft.roster.activeIds = active;
  draft.squad.push(unit);
  seedLife(draft, reg, { unitId: unit.id }); // P14c: her starting skills, when life is on (a no-op otherwise); nobody else's
  draft.world.incomingUnits = (draft.world.incomingUnits ?? 0) - 1;
  return [{ type: 'unit_joined', unitId: unit.id, kind: 'named' }];
});

registerAction('squad/decline_incoming', (draft, _payload, ctx) => {
  const reason = checkIncoming(draft);
  if (reason) throw new Error(reason);
  const grunt = generateGrunt(draft, ctx.registries, ctx.rng);
  draft.squad.push(grunt);
  draft.relations[grunt.id] = gruntRelation(draft, ctx.registries, grunt);
  if (grunt.status === 'active') draft.roster.activeIds.push(grunt.id);
  draft.world.incomingUnits = (draft.world.incomingUnits ?? 0) - 1;
  return [{ type: 'unit_joined', unitId: grunt.id, kind: 'grunt' }];
});
