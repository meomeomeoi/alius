/**
 * HER POSTURES (P16b, plan Task 22b, ruling 26; PDA surface): the block of her DYNAMIC section that lists the postures she has named, and only those (`Knowledge.practice`). Each row is her name in her hand, the
 * dial's mannequin of the preset, the points the preset fixes with the keys 1 to 7 and their states, how well the commander knows it as a word (`Knowledge.craft`: never the xp), and `[ PRACTISE ]`, a posture drill alone on that
 * preset (the slot is spent). An option that cannot be done now is `aria-disabled` with the engine's reason beside it. Every row carries `data-analyze`. Nothing is drawn in immersive mode, for a woman
 * who is not live, or with no named posture. No pronoun for the commander.
 */
import type { Knowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import { checkActivity } from '../../engine/activities';
import { presetOf } from '../../engine/blocking';
import { POSTURE_POINTS } from '../../engine/craft/posture';
import { practiceLive } from '../../engine/practice/gate';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { endSlotBlock } from '../hub/model';
import { setHand } from '../notes/note';
import { mannequinSvg } from '../scene/dial/draw';
import { presetPoseOf, type PointStates } from '../scene/dial/points';
import { herHand } from '../stage/look';

/** The activity request `[ PRACTISE ]` makes: the posture drill of `train`, alone, on her preset. */
export const practiseRequest = (unitId: string, presetId: string) => ({ activityId: 'train', focus: 'drill_posture', holderId: unitId, presetId });

const words = (state: string): string => state.replace(/_/g, ' ');

/** Why the commander cannot practise it now (the engine's reason, then whatever stops the slot from being spent), or `null`. */
export function practiseBlock(state: CampaignState, reg: Registries, unitId: string, presetId: string): string | null {
  return checkActivity(state, reg, practiseRequest(unitId, presetId)) ?? endSlotBlock(state, reg);
}

/**
 * The block, or `null` when there is nothing to show. `onPractise` is the app's (it dispatches `activity/do` for the request above); without it the list is read-only, with no button.
 */
export function herPosturesBlock(
  state: CampaignState, reg: Registries, knowledge: Knowledge, unitId: string, hidden: boolean, onPractise?: (unitId: string, presetId: string) => void,
): HTMLElement | null {
  if (hidden || !practiceLive(state, reg, unitId)) return null;
  const named = knowledge.practice(unitId, reg).postures;
  if (named.length === 0) return null;
  const live = { unitId };
  const hand = herHand(state, reg, unitId);
  const words7 = knowledge.craft(reg).pairs.find((p) => p.unitId === unitId)?.postureWords ?? {};
  const rows = named.map((p) => {
    const preset = presetOf(reg, p.postureId);
    const nameEl = h('span', { class: 'alius-her-posture-name', 'data-posture-name': '' }, p.name);
    setHand(nameEl, hand);
    const know = (preset !== undefined ? words7[String(preset.id)] : undefined) ?? 'untrained';
    const points = preset === undefined ? [] : POSTURE_POINTS.flatMap((point, i) => {
      const value = (preset.points as PointStates | undefined)?.[point];
      return value === undefined ? [] : [h('li', { class: 'alius-her-posture-point', 'data-point': point }, h('kbd', {}, String(i + 1)), ` ${point.toUpperCase()} ${words(String(value))}`)];
    });
    const why = preset === undefined ? null : practiseBlock(state, reg, unitId, String(preset.id));
    const practise = onPractise !== undefined && preset !== undefined
      ? [h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-action': 'practise-posture', ...(why !== null ? { 'aria-disabled': 'true' } : {}), ...analyzeNative('glossary:her_postures', live),
        onclick: () => { if (why === null) onPractise(unitId, String(preset.id)); },
      }, '[ PRACTISE ]'), ...(why !== null ? [h('span', { class: 'alius-dim alius-reason' }, why)] : [])]
      : [];
    return h('div', { class: 'alius-her-posture', 'data-her-posture': p.postureId, ...analyzeAttrs('glossary:her_postures', live) },
      nameEl,
      preset !== undefined ? mannequinSvg(presetPoseOf({
        base: String(preset.base), points: preset.points as PointStates, ...(preset.item !== undefined ? { item: preset.item as 'tray' } : {}), ...(preset.hint !== undefined ? { hint: preset.hint as 'wall' } : {}), ...(preset.hogtie === true ? { hogtie: true as const } : {}),
      }), { size: 72 }) : null,
      h('ul', { class: 'alius-her-posture-points' }, ...points),
      h('span', { class: 'alius-chip', 'data-knowledge': '', ...analyzeAttrs('glossary:her_postures', live) }, know.toUpperCase()),
      ...practise);
  });
  return h('div', { class: 'alius-her-postures', 'data-her-postures': unitId }, h('h5', {}, 'HER POSTURES'), ...rows);
}
