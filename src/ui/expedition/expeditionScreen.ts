import type { Registries } from '../../content/types';
import { canAutoResolve, defaultEnemyName } from '../../engine/combat';
import { unitStats } from '../../engine/combat/stats';
import type { CampaignState } from '../../engine/state/types';
import { ableParty, eventOptions } from '../../engine/world/expedition';
import { mapRows, visibleTypes } from '../../engine/world/nodeMap';
import type { AliusSettings } from '../../settings';
import type { ExpeditionController } from '../../world/expeditionController';
import { bar } from '../combat/bars';
import { dilemmaOptions } from '../../engine/dilemma/flow';
import type { RoutePick } from '../../engine/commander/checks';
import { renderDilemma } from '../dilemma/dilemmaPanel';
import { renderRoutePicker } from '../dilemma/routePicker';
import { h } from '../dom';
import { renderNodeMap } from './nodeMapView';
import { newDraft, renderPlanner, type PlannerDraft } from './planner';
import { renderReport } from './report';

export interface ExpeditionScreenCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  settings: () => AliusSettings;
  controller: ExpeditionController;
  onClose: () => void;
  /** True while a recap has been asked for and has not arrived (the report shows COMPILING…). */
  recapPending?: () => boolean;
  /** P6: the player's pick of a generated dilemma for the pending event node. */
  onDilemmaChoose?: (index: number, route?: RoutePick) => void;
}

export interface ExpeditionScreen {
  refresh(): void;
  dispose(): void;
}

const LOG_LINES = 8;

/** The expedition screen: picks the planner, the run, the report or an empty stub from the campaign state. */
export function renderExpeditionScreen(host: HTMLElement, ctx: ExpeditionScreenCtx): ExpeditionScreen {
  const { registries: reg, controller } = ctx;
  let disposed = false;
  let draft: PlannerDraft = newDraft();
  let planKey = '';
  const debriefPick: string[] = [];
  let confirming = false;
  let cover = '';

  const unitName = (id: string): string => ctx.getState()?.squad.find((u) => u.id === id)?.displayName ?? id;

  function runView(root: HTMLElement, state: CampaignState): void {
    const exp = state.expedition!;
    const travel = exp.phase === 'travel';
    const visible = visibleTypes(exp.map, exp.at, exp.reveal);
    const labels: Record<string, string> = {};
    const types: Record<string, string> = {};
    for (const id of visible) {
      const n = exp.map.nodes[id];
      labels[id] = String(reg.nodeTypes.get(n.resolvedType ?? n.type)?.name ?? n.type);
      types[id] = n.resolvedType ?? n.type;
    }
    const rows = mapRows(exp.map, { at: exp.at, visible, reg });
    // only a calm party can walk on: the options are plain text while something is pending
    const shown = travel ? rows : rows.map((col) => col.map((c) => (c.state === 'option' ? { ...c, state: 'ahead' as const } : c)));
    root.append(h('h2', {}, `[ EXPEDITION ] ${String(reg.regions.get(exp.regionId)?.name ?? exp.regionId)}`));
    renderNodeMap(root, { rows: shown, edges: {}, onMove: (id) => controller.move(id), labels, types });

    root.append(h('p', {}, `SUPPLIES ${exp.supplies} · LOOT ${exp.loot.length}`));
    const strip = h('div', { class: 'alius-party' });
    const able = new Set(ableParty(state));
    for (const id of exp.party) {
      const u = state.squad.find((x) => x.id === id);
      if (!u) continue;
      const max = unitStats(state, reg, u).hp;
      const inFront = exp.formation.front.includes(id);
      const rowText = exp.formation.front.includes(id) || exp.formation.back.includes(id) ? (inFront ? 'FRONT' : 'BACK') : 'OUT';
      const line = h('div', { class: 'alius-party-unit', 'data-party': id },
        h('span', {}, `${u.displayName} · HP ${bar(u.currentHp, max, 6)} · ST ${bar(u.stress, 100, 5)} · ${rowText}${u.breakdown ? ' [BREAKDOWN]' : ''}${u.status === 'injured' ? ' [INJURED]' : ''} `),
      );
      if (able.has(id)) {
        const noSupplies = !travel || exp.supplies < 1;
        line.append(
          h('button', { type: 'button', class: 'alius-btn', 'data-treat': 'patch', 'data-unit': id, disabled: noSupplies, onclick: () => controller.treat(id, 'patch') }, '[ PATCH 1 SUPPLY ]'),
          h('button', { type: 'button', class: 'alius-btn', 'data-treat': 'calm', 'data-unit': id, disabled: noSupplies || u.breakdown !== undefined, onclick: () => controller.treat(id, 'calm') }, '[ CALM 1 SUPPLY ]'),
          h('button', {
            type: 'button', class: 'alius-btn', 'data-swap': id, disabled: !travel,
            onclick: () => {
              const f = exp.formation;
              controller.setFormation(inFront
                ? { front: f.front.filter((x) => x !== id), back: [...f.back, id] }
                : { front: [...f.front, id], back: f.back.filter((x) => x !== id) });
            },
          }, '[ ROW ]'),
        );
      }
      strip.append(line);
    }
    root.append(strip);

    if (exp.phase === 'combat') combatPanel(root, state);
    if (exp.phase === 'event') eventPanel(root, state);

    root.append(h('div', { class: 'alius-log' }, ...exp.log.slice(-LOG_LINES).map((l) => h('p', { class: 'alius-dim' }, l.text))));

    const actions = h('div', { class: 'alius-run-actions' });
    if (confirming) {
      actions.append(
        h('p', { class: 'alius-banner' }, 'Unbanked loot will be lost.'),
        h('button', { type: 'button', class: 'alius-btn', onclick: () => { confirming = false; controller.retreat(); } }, '[ CONFIRM RETREAT ]'),
        h('button', { type: 'button', class: 'alius-btn', onclick: () => { confirming = false; render(); } }, '[ KEEP GOING ]'),
      );
    } else {
      if (exp.objectiveDone && travel) actions.append(h('button', { type: 'button', class: 'alius-btn', onclick: () => controller.return() }, '[ RETURN TO BASE ]'));
      if (!state.combat) actions.append(h('button', { type: 'button', class: 'alius-btn', onclick: () => { confirming = true; render(); } }, '[ RETREAT ]'));
    }
    root.append(actions);
  }

  function combatPanel(root: HTMLElement, state: CampaignState): void {
    const exp = state.expedition!;
    if (exp.pending?.kind !== 'combat') return;
    const panel = h('section', { class: 'alius-section alius-fight' }, h('h3', {}, 'CONTACT'));
    root.append(panel);
    if (state.combat) {
      panel.append(h('p', {}, 'FIGHT IN PROGRESS'));
      return;
    }
    const decided = state.lastCombat !== undefined && state.lastCombat.id !== exp.pending.prevCombatId;
    if (decided) {
      panel.append(h('p', {}, 'FIGHT DECIDED'), h('button', { type: 'button', class: 'alius-btn', onclick: () => controller.afterCombat() }, '[ CONTINUE ]'));
      return;
    }
    const enc = exp.pending.encounter;
    panel.append(h('div', { 'data-enemies': '' }, ...enc.enemies.map((e) => h('p', {}, `${defaultEnemyName(reg, e.enemyId, e.affixes)} · LVL ${e.level}`))));
    const needsCover = enc.exposesCommander === true;
    if (needsCover) {
      const select = h('select', { name: 'cover', 'aria-label': 'Cover unit' },
        h('option', { value: '' }, '— choose a cover unit —'),
        ...[...ableParty(state)].map((id) => h('option', { value: id, selected: id === cover }, state.squad.find((u) => u.id === id)?.displayName ?? id)),
      ) as HTMLSelectElement;
      select.value = cover;
      select.addEventListener('change', () => { cover = select.value; render(); });
      panel.append(h('p', { class: 'alius-banner' }, 'The commander is exposed: someone must cover him.'), select);
    }
    const coverId = needsCover && cover !== '' ? cover : undefined;
    const blocked = needsCover && coverId === undefined;
    panel.append(h('button', { type: 'button', class: 'alius-btn', disabled: blocked, onclick: () => controller.fight({ coverId, auto: false }) }, '[ FIGHT ]'));
    const payload = { encounter: enc, formation: exp.formation, ...(coverId ? { coverId } : {}) };
    if (canAutoResolve(state, reg, payload)) {
      panel.append(h('button', { type: 'button', class: 'alius-btn', disabled: blocked, onclick: () => controller.fight({ coverId, auto: true }) }, '[ AUTO ]'));
    }
  }

  function eventPanel(root: HTMLElement, state: CampaignState): void {
    const pending = state.expedition!.pending;
    if (pending?.kind !== 'event') return;
    const fixed = reg.dilemmaTemplates.get(pending.templateId)?.fixed as { title: string; setup: string } | undefined;
    const panel = h('section', { class: 'alius-section alius-event' }, h('h3', {}, fixed?.title ?? 'EVENT'), h('p', {}, fixed?.setup ?? ''));
    const generated = state.dilemmas?.open;
    if (ctx.onDilemmaChoose && generated && generated.context === 'expedition_event' && generated.templateId === pending.templateId) {
      // a generated (or authored-fallback) dilemma replaces the fixed options of the pending node
      const slot = h('div', { class: 'alius-dilemma-host' });
      panel.replaceChildren(slot);
      renderDilemma(slot, {
        title: generated.title ?? fixed?.title ?? 'EVENT', setup: generated.setup ?? fixed?.setup ?? '', scale: generated.scale,
        waiting: generated.status === 'requested', options: dilemmaOptions(state, reg), onChoose: ctx.onDilemmaChoose, unitName,
      });
      root.append(panel);
      return;
    }
    const options = eventOptions(state, reg);
    if (options.length === 0) {
      // the event was removed from the pack under this save: the node resolves as nothing
      panel.append(h('button', { type: 'button', class: 'alius-btn', onclick: () => controller.choose(0) }, '[ CONTINUE ]'));
    }
    let picked = false;
    for (const o of options) {
      // P7: a routed option asks how first; the rest choose at once
      const picker = o.routes && o.disabled === null
        ? renderRoutePicker({ routes: o.routes, unitName, locked: () => picked, onPick: (pick) => { picked = true; controller.choose(o.index, pick); }, unlock: () => { picked = false; } })
        : null;
      if (picker) picker.hidden = true;
      panel.append(h('div', {},
        h('button', {
          type: 'button', class: 'alius-btn', 'data-option': String(o.index), disabled: o.disabled !== null,
          onclick: () => {
            if (o.disabled !== null) return;
            if (picker) picker.hidden = !picker.hidden;
            else controller.choose(o.index);
          },
        }, `[ ${o.label} ]${picker ? ' — CHOOSE HOW' : ''}${o.disabled ? ` — ${o.disabled}` : ''}`),
        picker,
      ));
    }
    root.append(panel);
  }

  function render(): void {
    if (disposed) return;
    host.replaceChildren();
    const root = h('div', { class: 'alius-expedition' });
    host.append(root);
    const state = ctx.getState();
    if (!state) {
      root.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
      return;
    }
    if (state.expedition) {
      runView(root, state);
      return;
    }
    if (state.lastExpedition && !state.lastExpedition.acknowledged) {
      renderReport(root, { state, registries: reg, controller, recapPending: ctx.recapPending?.() ?? false, onClose: ctx.onClose, redraw: render, debriefPick });
      return;
    }
    const target = controller.planning();
    if (target) {
      const key = JSON.stringify(target);
      if (key !== planKey) { planKey = key; draft = newDraft(); }
      renderPlanner(root, { state, registries: reg, target, draft, controller, onClose: ctx.onClose, redraw: render });
      return;
    }
    root.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO EXPEDITION'), h('button', { type: 'button', class: 'alius-btn', onclick: ctx.onClose }, '[ BACK ]')));
  }

  render();
  return {
    refresh: render,
    dispose() {
      disposed = true;
      host.replaceChildren();
    },
  };
}
