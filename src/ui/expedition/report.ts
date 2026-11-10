import type { Registries } from '../../content/types';
import { reportLines } from '../../engine/world/expedition';
import type { CampaignState } from '../../engine/state/types';
import type { ExpeditionController } from '../../world/expeditionController';
import { h } from '../dom';

export interface ReportCtx {
  state: CampaignState;
  registries: Registries;
  controller: ExpeditionController;
  /** A recap has been requested and not arrived yet. */
  recapPending: boolean;
  onClose: () => void;
  redraw: () => void;
  debriefPick: string[];
}

const DEBRIEF_MAX = 3;

/** The AFTER-ACTION REPORT: the deterministic lines, the recap when there is one, debrief and close. */
export function renderReport(host: HTMLElement, ctx: ReportCtx): void {
  const { state, controller } = ctx;
  const report = state.lastExpedition;
  if (!report) return;
  const lines = reportLines({ ...report, recap: undefined }, state, ctx.registries);
  const root = h('section', { class: 'alius-section alius-report' }, h('h2', {}, lines[0] ?? 'AFTER-ACTION REPORT'));
  if (report.recap) root.append(h('p', { class: 'alius-recap' }, report.recap));
  else if (ctx.recapPending) root.append(h('p', { class: 'alius-dim' }, 'COMPILING…'));
  for (const line of lines.slice(1)) root.append(h('p', { class: 'alius-report-line' }, line));

  if (state.slot !== 'night' && !report.debriefed) {
    const candidates = report.party
      .map((id) => state.squad.find((u) => u.id === id))
      .filter((u): u is NonNullable<typeof u> => u !== undefined && u.kind === 'named' && u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated');
    const full = ctx.debriefPick.length >= DEBRIEF_MAX;
    const section = h('div', { class: 'alius-debrief' }, h('h3', {}, 'DEBRIEF'));
    for (const u of candidates) {
      const on = ctx.debriefPick.includes(u.id);
      const box = h('input', { type: 'checkbox', 'data-debrief': u.id, checked: on, disabled: !on && full }) as HTMLInputElement;
      box.checked = on;
      box.addEventListener('change', () => {
        const i = ctx.debriefPick.indexOf(u.id);
        if (box.checked && i < 0) ctx.debriefPick.push(u.id);
        if (!box.checked && i >= 0) ctx.debriefPick.splice(i, 1);
        ctx.redraw();
      });
      section.append(h('label', { class: 'alius-check' }, box, ` ${u.displayName} `));
    }
    section.append(h('button', {
      type: 'button', class: 'alius-btn', disabled: ctx.debriefPick.length === 0,
      onclick: () => { if (ctx.debriefPick.length > 0) void controller.debrief([...ctx.debriefPick]); },
    }, '[ DEBRIEF ]'));
    root.append(section);
  }
  root.append(h('button', { type: 'button', class: 'alius-btn', onclick: () => { controller.acknowledge(); ctx.onClose(); } }, '[ CLOSE ]'));
  host.append(root);
}
