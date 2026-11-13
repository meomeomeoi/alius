import type { Registries } from '../../content/types';
import { facilityEffect } from '../../engine/economy';
import type { CampaignState } from '../../engine/state/types';
import { checkDeparture } from '../../engine/world/expedition';
import type { Mission, Rumor } from '../../engine/world/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';

export interface MissionBoardCtx {
  registries: Registries;
  onPlan?: (missionId: string) => void;
  onDismiss?: (missionId: string) => void;
  onFollowRumor?: (rumorId: string) => void;
  onIntake?: () => void;
  /** Offered while the last expedition's report has not been acknowledged. */
  onOpenReport?: () => void;
}

const SOURCE_TAG: Record<string, string> = { command: 'COMMAND', story: 'STORY', rumor: 'RUMOR', side: 'SIDE' };

/** A stable three-digit handle for a rumor's author line, from its id. */
export function anonHandle(rumorId: string): string {
  const n = Number.parseInt(rumorId.replace(/\D/g, '') || '0', 10);
  return String((n * 137 + 11) % 1000).padStart(3, '0');
}

function missionCard(m: Mission, state: CampaignState, ctx: MissionBoardCtx): HTMLElement {
  const reg = ctx.registries;
  const region = reg.regions.get(m.regionId);
  const node = reg.nodeTypes.get(m.objective.node);
  const tierRank = reg.rewardTiers.get(m.rewardsTier)?.rank;
  const deadline = m.deadlineDay === undefined ? 'NO DEADLINE' : `D-${Math.max(0, m.deadlineDay - state.day)}`;
  const reason = checkDeparture(state, reg, { missionId: m.id });
  const chip = (text: string, address: string): Child => h('span', { class: 'alius-chip', ...analyzeAttrs(address) }, text);
  const stat = (text: string, address: string): Child => h('span', { class: 'alius-stat', ...analyzeAttrs(address) }, text);
  const card = h('article', { class: 'alius-mission', 'data-mission-card': m.id },
    h('h3', {}, `[${SOURCE_TAG[m.source] ?? m.source.toUpperCase()}] ${m.title}`),
    h('p', { class: 'alius-dim' },
      region ? chip(String(region.name), `regions:${m.regionId}`) : m.regionId,
      ' · ', stat(`DANGER ${m.danger}`, 'glossary:danger'),
      ' · OBJECTIVE: ', node ? chip(String(node.name), `nodeTypes:${m.objective.node}`) : m.objective.node, ` (${m.objective.condition}) · `,
      stat(deadline, 'glossary:mission_deadline')),
    h('p', {}, m.brief),
    h('p', { class: 'alius-dim' }, stat(`REWARD: TIER ${String(tierRank ?? m.rewardsTier)}`, 'glossary:reward_tier')),
  );
  if (ctx.onPlan) {
    card.append(h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-plan': m.id, ...analyzeNative('glossary:expedition'), disabled: reason !== null, title: reason ?? '',
      onclick: () => { if (reason === null) ctx.onPlan!(m.id); },
    }, '[ PLAN ]'));
    if (reason) card.append(h('p', { class: 'alius-dim alius-reason' }, reason));
  }
  if (ctx.onDismiss && (m.source === 'side' || m.source === 'rumor')) {
    card.append(h('button', { type: 'button', class: 'alius-btn alius-option', 'data-dismiss': m.id, ...analyzeNative('glossary:mission_board'), onclick: () => ctx.onDismiss!(m.id) }, '[ DISMISS ]'));
  }
  return card;
}

function rumorPost(r: Rumor, ctx: MissionBoardCtx): HTMLElement {
  const day = `DAY ${String(r.day).padStart(3, '0')}`;
  const post = h('article', { class: 'alius-rumor', 'data-rumor': r.id },
    h('p', { class: 'alius-dim' }, `> anon_${anonHandle(r.id)} // ${day}`),
    h('p', {}, r.text),
  );
  if (r.tags.length > 0) post.append(h('p', { class: 'alius-dim' }, r.tags.map((t) => `#${t}`).join(' ')));
  if (r.status === 'followed') post.append(h('p', { class: 'alius-dim' }, 'FOLLOWED'));
  else if (r.leadsTo !== 'none' && ctx.onFollowRumor) {
    post.append(h('button', { type: 'button', class: 'alius-btn alius-option', 'data-follow': r.id, ...analyzeNative('glossary:rumor'), onclick: () => ctx.onFollowRumor!(r.id) }, '[ FOLLOW ]'));
  }
  return post;
}

/** The mission board and the RUMOR MILL (and the intake banner) of the OPS tab. */
export function renderMissionBoard(host: HTMLElement, state: CampaignState, ctx: MissionBoardCtx): void {
  const size = facilityEffect(state, ctx.registries, 'comms', 'missionBoardSize');
  const offered = state.missions.offered;
  const board = h('section', { class: 'alius-section alius-board' }, h('h2', {}, h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:mission_board') }, `MISSION BOARD ${offered.length}/${size}`)));
  if ((state.world.incomingUnits ?? 0) > 0) {
    board.append(h('p', { class: 'alius-banner' },
      'INTAKE PENDING: a new unit is waiting. ',
      ...(ctx.onIntake ? [h('button', { type: 'button', class: 'alius-btn', 'data-intake': '', onclick: ctx.onIntake }, '[ REVIEW ]')] : []),
    ));
  }
  if (state.lastExpedition && !state.lastExpedition.acknowledged && ctx.onOpenReport) {
    board.append(h('p', { class: 'alius-banner' }, 'REPORT READY: the last expedition has an after-action report. ',
      h('button', { type: 'button', class: 'alius-btn', onclick: ctx.onOpenReport }, '[ OPEN REPORT ]')));
  }
  if (offered.length === 0) board.append(h('p', { class: 'alius-dim' }, 'NO MISSIONS POSTED'));
  for (const m of offered) board.append(missionCard(m, state, ctx));

  const mill = h('section', { class: 'alius-section alius-rumor-mill' }, h('h2', {}, 'RUMOR MILL'));
  if (state.rumors.length === 0) mill.append(h('p', { class: 'alius-dim' }, 'NOTHING OVERHEARD'));
  for (const r of [...state.rumors].reverse()) mill.append(rumorPost(r, ctx));
  host.append(board, mill);
}
