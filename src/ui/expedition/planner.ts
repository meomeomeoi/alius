import type { Registries } from '../../content/types';
import { activeLoadout, loadoutSize } from '../../engine/combat/skills';
import { defaultFormation } from '../../engine/combat/stats';
import { isLiving } from '../../engine/economy';
import type { CampaignState, Unit } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { checkExpedition, type StartExpedition } from '../../engine/world/expedition';
import type { ExpeditionController, PlanTarget } from '../../world/expeditionController';
import { h } from '../dom';

/** What the commander has picked so far; kept by the screen so a refresh does not lose it. */
export interface PlannerDraft {
  picked: string[];
  rows: Record<string, 'front' | 'back'>;
  supplies: number;
}
export const newDraft = (): PlannerDraft => ({ picked: [], rows: {}, supplies: 3 });

export interface PlannerCtx {
  state: CampaignState;
  registries: Registries;
  target: PlanTarget;
  draft: PlannerDraft;
  controller: ExpeditionController;
  onClose: () => void;
  /** Redraws the planner after the draft changed. */
  redraw: () => void;
}

const SLOT_INDEX = { morning: 0, afternoon: 1, evening: 2, night: 3 } as const;

function describeTarget(ctx: PlannerCtx): { title: string; regionId: string; danger: number; objective: string; slots: number } | null {
  const { state, registries: reg, target } = ctx;
  if ('missionId' in target) {
    const m = state.missions.offered.find((x) => x.id === target.missionId);
    const region = m ? reg.regions.get(m.regionId) : undefined;
    if (!m || !region) return null;
    return {
      title: m.title, regionId: m.regionId, danger: m.danger, slots: region.travelSlots as number,
      objective: `${String(reg.nodeTypes.get(m.objective.node)?.name ?? m.objective.node)} (${m.objective.condition})`,
    };
  }
  const region = reg.regions.get(target.poi.regionId);
  const poi = (region?.pointsOfInterest as Array<{ id: string; name: string; templateId: string }> | undefined)?.find((p) => p.id === target.poi.poiId);
  if (!region || !poi) return null;
  const tpl = reg.missionTemplates.get(poi.templateId);
  const node = (tpl?.objectives as Array<{ node: string; condition: string }> | undefined)?.[0];
  return {
    title: poi.name, regionId: String(region.id), danger: region.danger as number, slots: region.travelSlots as number,
    objective: node ? `${String(reg.nodeTypes.get(node.node)?.name ?? node.node)} (${node.condition})` : 'Scavenge',
  };
}

/** Why a living unit cannot go, or `null`. */
function unitReason(state: CampaignState, u: Unit): string | null {
  if (u.status === 'injured') return 'Injured';
  if (u.status === 'reserve') return 'In reserve';
  if (u.status !== 'active') return `Not available (${u.status})`;
  if (u.breakdown) return 'In breakdown';
  if (!state.roster.activeIds.includes(u.id)) return 'Not on the active roster';
  return null;
}

const gearText = (state: CampaignState, u: Unit): string =>
  (['weapon', 'upper', 'lower'] as const).map((slot) => {
    const uid = u.equipment[slot];
    const item = uid ? state.inventory.find((i) => i.uid === uid) : undefined;
    return item ? String(item.itemId) : `STANDARD ISSUE ${slot}`;
  }).join(', ');

/** The departure planner: mission, squad, rows, loadout check, supplies. */
export function renderPlanner(host: HTMLElement, ctx: PlannerCtx): void {
  const { state, registries: reg, draft } = ctx;
  const info = describeTarget(ctx);
  const root = h('section', { class: 'alius-section alius-planner' });
  host.append(root);
  if (!info) {
    root.append(h('p', {}, 'THAT MISSION IS NO LONGER AVAILABLE'), h('button', { type: 'button', class: 'alius-btn', onclick: () => { ctx.controller.cancelPlan(); ctx.onClose(); } }, '[ BACK ]'));
    return;
  }
  const region = reg.regions.get(info.regionId);
  const end = SLOT_INDEX[state.slot] + info.slots === 2 ? 'returns in the Evening' : 'returns the next morning';
  root.append(
    h('h2', {}, `[ PLAN ] ${info.title}`),
    h('p', {}, `${String(region?.name ?? info.regionId)} · DANGER ${info.danger} · OBJECTIVE: ${info.objective}`),
    h('p', {}, `DURATION ${info.slots} SLOTS (${end})`),
  );

  const living = state.squad.filter(isLiving);
  draft.picked = draft.picked.filter((id) => living.some((u) => u.id === id));
  const full = draft.picked.length >= TUNING.expedition.partyMax;
  const defaults = defaultFormation(state, reg, draft.picked);
  const rowOf = (id: string): 'front' | 'back' => draft.rows[id] ?? (defaults.front.includes(id) ? 'front' : 'back');

  root.append(h('h3', {}, 'SQUAD'));
  for (const u of living) {
    const reason = unitReason(state, u);
    const picked = draft.picked.includes(u.id);
    const box = h('input', {
      type: 'checkbox', 'data-unit': u.id, checked: picked, disabled: reason !== null || (!picked && full),
    }) as HTMLInputElement;
    box.checked = picked;
    box.addEventListener('change', () => {
      draft.picked = box.checked ? [...draft.picked, u.id] : draft.picked.filter((id) => id !== u.id);
      ctx.redraw();
    });
    const row = h('div', { class: 'alius-planner-unit', 'data-unit-row': u.id },
      h('label', { class: 'alius-check' }, box, ` ${u.displayName}`),
    );
    if (reason) row.append(h('span', { class: 'alius-dim alius-reason' }, ` ${reason}`));
    else {
      row.append(h('span', { class: 'alius-dim' }, ` SKILLS ${activeLoadout(reg, u).length}/${loadoutSize(reg, u)} · ${gearText(state, u)} `));
      if (picked) {
        row.append(h('button', {
          type: 'button', class: 'alius-btn', 'data-row': u.id,
          onclick: () => { draft.rows[u.id] = rowOf(u.id) === 'front' ? 'back' : 'front'; ctx.redraw(); },
        }, rowOf(u.id) === 'front' ? '[ FRONT ]' : '[ BACK ]'));
      }
    }
    root.append(row);
  }

  const maxSupplies = Math.min(state.resources.supplies, TUNING.expedition.suppliesMax);
  draft.supplies = Math.max(0, Math.min(maxSupplies, Math.trunc(draft.supplies) || 0));
  const rest = reg.nodeTypes.get('rest')?.rest as { suppliesPerUnit: number } | undefined;
  const supplies = h('input', { type: 'number', name: 'supplies', min: '0', max: String(maxSupplies), step: '1', value: String(draft.supplies), 'aria-label': 'Supplies to bring' }) as HTMLInputElement;
  supplies.addEventListener('change', () => {
    const n = Math.trunc(Number(supplies.value));
    draft.supplies = Math.max(0, Math.min(maxSupplies, Number.isFinite(n) ? n : 0));
    ctx.redraw();
  });
  root.append(
    h('h3', {}, 'SUPPLIES'),
    h('label', {}, 'Bring ', supplies, ` of ${state.resources.supplies} `),
    h('p', { class: 'alius-dim' }, `REST NEEDS ${(rest?.suppliesPerUnit ?? 1) * Math.max(1, draft.picked.length)} PER STOP`),
  );

  const formation = {
    front: draft.picked.filter((id) => rowOf(id) === 'front'),
    back: draft.picked.filter((id) => rowOf(id) === 'back'),
  };
  const payload: StartExpedition = { ...('missionId' in ctx.target ? { missionId: ctx.target.missionId } : { poi: ctx.target.poi }), unitIds: [...draft.picked], formation, supplies: draft.supplies };
  const reason = checkExpedition(state, reg, payload);
  root.append(
    h('button', {
      type: 'button', class: 'alius-btn', disabled: reason !== null, title: reason ?? '',
      onclick: () => { if (reason === null) ctx.controller.launch({ unitIds: payload.unitIds, formation, supplies: payload.supplies }); },
    }, '[ DEPART ]'),
    ' ',
    h('button', { type: 'button', class: 'alius-btn', onclick: () => { ctx.controller.cancelPlan(); ctx.onClose(); } }, '[ CANCEL ]'),
    ...(reason ? [h('p', { class: 'alius-dim alius-reason' }, reason)] : []),
  );
}
