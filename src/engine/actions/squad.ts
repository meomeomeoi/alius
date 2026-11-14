import type { Entry } from '../../content/types';
import { registerAction } from '../dispatch';
import { applyFirstImpression } from '../commander/presence';
import { generateGrunt, gruntRelation } from '../grunts';
import { applyDispositionStart } from '../worldOptions';
import { livingUnits } from '../economy';
import {
  crimeEffectsOf, crimeKnownByDefault, initialRelation, makeNamedUnit, startingTrustAdjust, validateIncomingUnit, validateUnitProfile, type UnitSetup,
} from '../setup';
import { TUNING } from '../tuning';
import type { CampaignState, WorldStance } from '../state/types';
import type { DefectInstance } from '../state/types';

// Importing this module registers the squad actions.

/** Sections a re-sync can replace. The baseline is excluded: relationship axes are engine truth once the campaign runs. */
export const RESYNC_SECTIONS = ['role', 'values', 'tags', 'signature', 'defects', 'tastes', 'disposition', 'stances'] as const;
export type ResyncSection = (typeof RESYNC_SECTIONS)[number];

export type ResyncPatch = Partial<Pick<UnitSetup, 'roleId' | 'values' | 'likes' | 'dislikes' | 'triggers' | 'signature' | 'defects'>> & {
  /** P7: replaces the unit's taste ids (an empty list clears them). Never changes an axis. */
  commanderTastes?: string[];
  /** P8: the unit's offset from the world level (0 clears it), its reason ('' clears it) and its stances ({} clears them). Never changes an axis. */
  dispositionOffset?: number;
  dispositionReason?: string;
  worldStances?: Record<string, WorldStance>;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const SECTION_OF: Record<keyof ResyncPatch, ResyncSection> = {
  roleId: 'role', values: 'values', likes: 'tags', dislikes: 'tags', triggers: 'tags', signature: 'signature', defects: 'defects',
  commanderTastes: 'tastes', dispositionOffset: 'disposition', dispositionReason: 'disposition', worldStances: 'stances',
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
  };
  const errors = validateUnitProfile(next, unit.displayName, ctx.registries, {
    desireBondDefects: draft.settings.desireBondDefects === true,
  });
  if (errors.length > 0) throw new Error(errors.join('; '));

  if (patch.roleId !== undefined && patch.roleId !== unit.roleId) {
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
  if (patch.defects) {
    unit.defects = patch.defects.map((d): DefectInstance => {
      const kept = unit.defects.find((x) => x.id === d.id); // keeps arc progress of a defect that stays
      return { ...kept, id: d.id, origin: d.origin };
    });
  }

  const sections = RESYNC_SECTIONS.filter((s) => keys.some((k) => SECTION_OF[k] === s));
  return [{ type: 'unit_resynced', unitId: unit.id, sections }];
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
  const unit = makeNamedUnit(u as UnitSetup, reg, new Set(draft.squad.map((x) => x.id)));
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
