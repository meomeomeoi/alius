import type { Entry } from '../../content/types';
import { registerAction } from '../dispatch';
import { validateUnitProfile, type UnitSetup } from '../setup';
import type { DefectInstance } from '../state/types';

// Importing this module registers the squad actions.

/** Sections a re-sync can replace. The baseline is excluded: relationship axes are engine truth once the campaign runs. */
export const RESYNC_SECTIONS = ['role', 'values', 'tags', 'signature', 'defects'] as const;
export type ResyncSection = (typeof RESYNC_SECTIONS)[number];

export type ResyncPatch = Partial<Pick<UnitSetup, 'roleId' | 'values' | 'likes' | 'dislikes' | 'triggers' | 'signature' | 'defects'>>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const SECTION_OF: Record<keyof ResyncPatch, ResyncSection> = {
  roleId: 'role', values: 'values', likes: 'tags', dislikes: 'tags', triggers: 'tags', signature: 'signature', defects: 'defects',
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
  if (patch.defects) {
    unit.defects = patch.defects.map((d): DefectInstance => {
      const kept = unit.defects.find((x) => x.id === d.id); // keeps arc progress of a defect that stays
      return { ...kept, id: d.id, origin: d.origin };
    });
  }

  const sections = RESYNC_SECTIONS.filter((s) => keys.some((k) => SECTION_OF[k] === s));
  return [{ type: 'unit_resynced', unitId: unit.id, sections }];
});
