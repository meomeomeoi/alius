import type { Entry, Registries } from '../../content/types';
import { checkRecruit, checkUpgrade, facilityLevel, facilityLevels, isLiving } from '../../engine/economy';
import { rationsOf, rationsVotable, RATION_MODES, votingOn } from '../../engine/power';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { LoadResult } from '../../st/persistence';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface BaseTabCtx {
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  onUpgrade: (facilityId: string) => void;
  onRecruit: () => void;
  onSetRoster: (activeIds: string[]) => void;
  /** P9b: the RATIONS row. Optional so a host that has no ration control still renders the tab. */
  onSetRations?: (mode: (typeof RATION_MODES)[number]) => void;
}

const BOX_INNER = 16;
const PER_ROW = 3;

const pendingOf = (state: CampaignState, id: string) => (state.base.upgrades ?? []).find((u) => u.facilityId === id);

/** ASCII schematic of the outpost: one box per facility with its level and a marker while it is being upgraded. */
export function schematic(state: CampaignState, reg: Registries): string {
  const boxes = [...reg.facilities.values()].map((f) => {
    const levels = facilityLevels(reg, f.id);
    const pending = pendingOf(state, f.id);
    const head = ` ${String(f.name).toUpperCase()}`.padEnd(BOX_INNER).slice(0, BOX_INNER);
    const level = ` L${facilityLevel(state, f.id)}/${levels.length}${pending ? `  ^ ${pending.daysLeft}d` : ''}`.padEnd(BOX_INNER).slice(0, BOX_INNER);
    const rule = `+${'-'.repeat(BOX_INNER)}+`;
    return [rule, `|${head}|`, `|${level}|`, rule];
  });
  const width = PER_ROW * (BOX_INNER + 2) + (PER_ROW - 1);
  const lines: string[] = [];
  for (let i = 0; i < boxes.length; i += PER_ROW) {
    const row = boxes.slice(i, i + PER_ROW);
    for (let k = 0; k < 4; k++) lines.push(row.map((b) => b[k]).join(' ').padEnd(width));
  }
  return lines.join('\n');
}

function facilityCard(state: CampaignState, f: Entry, ctx: BaseTabCtx): HTMLElement {
  const levels = facilityLevels(ctx.registries, f.id);
  const level = facilityLevel(state, f.id);
  const pending = pendingOf(state, f.id);
  const card = h('article', { class: 'alius-facility', 'data-facility': f.id }, h('h3', {}, `${String(f.name)} — `, h('span', { class: 'alius-stat', ...analyzeAttrs(`facilities:${f.id}`) }, `LEVEL ${level}/${levels.length}`)), h('p', { class: 'alius-dim' }, String(f.summary)));
  if (pending) card.append(h('p', {}, `UPGRADING TO L${pending.toLevel} ^ ${pending.daysLeft}d`));
  if (level >= levels.length) {
    card.append(h('p', { class: 'alius-dim' }, 'MAX LEVEL'));
    return card;
  }
  const up = levels[level].upgrade!;
  const reason = checkUpgrade(state, ctx.registries, f.id);
  card.append(
    h('p', {}, `NEXT: ${up.credits} CR · ${up.plyx} PLYX · ${up.days} DAYS`),
    ...(reason ? [h('p', { class: 'alius-dim alius-reason' }, reason)] : []),
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-upgrade': f.id, ...analyzeNative(`facilities:${f.id}`), disabled: reason !== null, onclick: () => ctx.onUpgrade(f.id) }, '[ UPGRADE ]'),
  );
  return card;
}

function roster(state: CampaignState, ctx: BaseTabCtx): HTMLElement {
  const living = state.squad.filter(isLiving);
  const active = state.roster.activeIds.filter((id) => living.some((u) => u.id === id));
  const section = h(
    'section',
    { class: 'alius-section' },
    h('h2', {}, 'ROSTER'),
    h('p', {}, `UNITS ${living.length}/${state.roster.capacity} · ACTIVE ${active.length}/${TUNING.rosterActiveMax}`),
  );
  for (const u of living) {
    const on = active.includes(u.id);
    const full = !on && active.length >= TUNING.rosterActiveMax;
    const role = u.kind === 'grunt' ? `GRUNT ${u.designation ?? ''}`.trim() : String(ctx.registries.roles.get(u.roleId)?.name ?? u.roleId);
    section.append(
      h(
        'div',
        { class: 'alius-roster-row' },
        h('span', {}, `${u.displayName} · ${role} · LVL ${u.level}${u.status === 'injured' ? ' · INJURED' : ''} `),
        h(
          'button',
          {
            type: 'button', class: 'alius-btn alius-option', 'data-roster-toggle': u.id, ...analyzeNative('glossary:roster'), disabled: full,
            title: full ? `The active roster is full (${TUNING.rosterActiveMax})` : '',
            onclick: () => ctx.onSetRoster(on ? active.filter((id) => id !== u.id) : [...active, u.id]),
          },
          on ? '[ACTIVE]' : '[RESERVE]',
        ),
      ),
    );
  }
  const reason = checkRecruit(state);
  section.append(
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-recruit': '', ...analyzeNative('glossary:grunt'), disabled: reason !== null, onclick: ctx.onRecruit }, `[ RECRUIT GRUNT (${TUNING.recruit.credits} CR) ]`),
    ...(reason ? [h('p', { class: 'alius-dim alius-reason' }, reason)] : []),
  );
  return section;
}

const RATION_LABEL: Record<(typeof RATION_MODES)[number], string> = { equal: 'EQUAL', fighters_first: 'FIGHTERS FIRST', commander_short: 'COMMANDER SHORT' };

/** P9b: how a shortage is shared out, three modes; while squad votes are on and a shortage is on or coming, a change goes to a vote. */
function rations(state: CampaignState, ctx: BaseTabCtx): HTMLElement {
  const current = rationsOf(state);
  const section = h('section', { class: 'alius-section alius-rations', 'data-rations': '' }, h('h2', {}, h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:rations') }, 'RATIONS')));
  section.append(h('div', { class: 'alius-rations-modes' }, ...RATION_MODES.map((mode) =>
    h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-rations-mode': mode, 'aria-pressed': String(mode === current),
      ...analyzeNative('glossary:rations', { mode }), onclick: () => ctx.onSetRations?.(mode),
    }, `[ ${RATION_LABEL[mode]} ]`))));
  if (votingOn(state, ctx.registries) && rationsVotable(state, ctx.registries)) {
    section.append(h('p', { class: 'alius-dim', 'data-rations-vote': '' }, 'A shortage is on or coming: a change goes to a squad vote.'));
  }
  return section;
}

/** The BASE tab: outpost schematic, facility upgrades, roster and grunt recruitment. */
export function renderBaseTab(host: HTMLElement, ctx: BaseTabCtx): void {
  host.replaceChildren();
  const load = ctx.getLoad();
  const state = ctx.getState();
  if (load.kind === 'readonly') {
    host.append(h('section', { class: 'alius-section' }, h('p', { class: 'alius-banner' }, `READ-ONLY: ${load.reason}`)));
    return;
  }
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  host.append(
    h('section', { class: 'alius-section' }, h('h2', {}, 'OUTPOST'), h('pre', { class: 'alius-schematic' }, schematic(state, ctx.registries))),
    h('section', { class: 'alius-section' }, h('h2', {}, 'FACILITIES'), ...[...ctx.registries.facilities.values()].map((f) => facilityCard(state, f, ctx))),
    rations(state, ctx),
    roster(state, ctx),
  );
}
