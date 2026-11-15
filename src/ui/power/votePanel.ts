import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../../engine/bonds';
import { voteSubjectLabel } from '../../engine/power/ballot';
import type { OverruleMeans } from '../../engine/power/votes';
import type { Ballot, CampaignState, Vote } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { renderVoiceCard } from '../voice/voiceCard';
import { VOICE_OF } from '../voice/sources';

export interface VotePanelHandlers {
  onCarry(): void;
  /** A failed vote accepted as it stands. */
  onDrop(): void;
  /** `punish` is set only for the means `punish`: one soldier who voted against and a measure from the discipline menu. */
  onOverrule(means: OverruleMeans, punish?: { unitId: string; measure: string }): void;
}

export interface VotePanelCtx extends VotePanelHandlers {
  state: CampaignState;
  registries: Registries;
}

const SIDE_WORD: Record<Ballot['vote'], string> = { for: 'FOR', against: 'AGAINST', abstain: 'ABSTAIN' };
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** The measures of the discipline ladder the overrule may use, lightest first (a registry measure; `leash` and `unspecified` are not measures here). */
function measures(state: CampaignState, reg: Registries): Entry[] {
  return [...reg.punishments.values()]
    .filter((e) => contentAllowed(state, reg, e))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(a.e.severity) - Number(b.e.severity) || a.i - b.i)
    .map((x) => x.e);
}

/**
 * The VOTE panel (P9b): one row per voter with her side, her weight and the reason in one line, the commander's row, the tally
 * and what the commander may do next. A vote that passed offers CARRY OUT. A vote that failed offers ACCEPT or an overrule by
 * order, punishment or the Leash (LEASH is soft-disabled with no authorization left). Everything is text.
 */
export function renderVotePanel(host: HTMLElement, vote: Vote, lines: Record<string, string>, ctx: VotePanelCtx): void {
  host.replaceChildren();
  const { state, registries: reg } = ctx;
  const nameOf = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  const kindLabel = String(reg.voteKinds.get(vote.kind)?.label ?? vote.kind);

  const rows = vote.ballots.map((b) =>
    h('li', { class: 'alius-ballot', 'data-ballot': b.unitId, 'data-side': b.vote },
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:vote', { unitId: b.unitId }) }, nameOf(b.unitId)),
      ` ${SIDE_WORD[b.vote]}${b.vote === 'abstain' ? '' : ` ×${num(b.weight)}`} `,
      h('span', { class: 'alius-dim' }, lines[b.unitId] ?? '')));
  const commander = h('li', { class: 'alius-ballot alius-ballot-commander', 'data-ballot-commander': '', 'data-side': 'for' },
    h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:vote') }, 'COMMANDER'), ` FOR ×${num(vote.commanderWeight)} `,
    h('span', { class: 'alius-dim' }, 'The commander picked it and always votes for it.'));
  const tally = h('p', { class: 'alius-vote-tally alius-stat', 'data-vote-tally': '', ...analyzeAttrs('glossary:vote') },
    `FOR ${num(vote.forWeight)} · AGAINST ${num(vote.againstWeight)} — ${vote.passed ? 'PASSED' : 'FAILED'}`);

  const body = h('div', { class: 'alius-votepanel', 'data-vote-panel': vote.id, 'data-vote-status': vote.status },
    h('p', {}, h('span', { class: 'alius-chip', ...analyzeAttrs(`voteKinds:${vote.kind}`) }, kindLabel.toUpperCase()), ` ${voteSubjectLabel(state, reg, vote.kind, vote.subject)}`),
    h('ul', { class: 'alius-ballots' }, commander, ...rows),
    tally,
  );

  const act = (id: string, label: string, onclick: () => void, extra: Record<string, unknown> = {}): HTMLElement =>
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-vote-act': id, ...analyzeNative('glossary:vote'), onclick, ...extra }, label);
  const actions: HTMLElement[] = [];
  if (vote.status === 'passed') {
    actions.push(act('carry', '[ CARRY OUT ]', ctx.onCarry));
  } else if (vote.status === 'failed') {
    const leashed = state.leash.authorizationsLeft < 1;
    const picker = h('div', { class: 'alius-vote-punish', hidden: true });
    const showPicker = (): void => {
      picker.hidden = false;
      if (picker.childElementCount > 0) return;
      const dissent = vote.ballots.filter((b) => b.vote === 'against' && state.squad.find((u) => u.id === b.unitId)?.kind === 'named'); // a punishment names a named soldier
      const who = h('select', { class: 'alius-select', 'data-punish-unit': '', 'aria-label': 'Soldier to punish' }, ...dissent.map((b) => h('option', { value: b.unitId }, nameOf(b.unitId)))) as HTMLSelectElement;
      const how = h('select', { class: 'alius-select', 'data-punish-measure': '', 'aria-label': 'Measure' }, ...measures(state, reg).map((e) => h('option', { value: String(e.id) }, String(e.label)))) as HTMLSelectElement;
      picker.append(who, how, act('punish-confirm', '[ CONFIRM ]', () => ctx.onOverrule('punish', { unitId: who.value, measure: how.value })));
    };
    actions.push(
      act('accept', '[ ACCEPT ]', ctx.onDrop),
      act('overrule-order', '[ OVERRULE: ORDER ]', () => ctx.onOverrule('order', undefined)),
      act('overrule-punish', '[ OVERRULE: PUNISH… ]', showPicker),
      act('overrule-leash', '[ OVERRULE: LEASH ]', () => { if (!leashed) ctx.onOverrule('leash', undefined); },
        leashed ? { 'aria-disabled': 'true', title: 'No Leash authorization is left this week.' } : {}),
      h('p', { class: 'alius-dim' }, 'Overruling costs Trust with every soldier who voted against, raises their Impunity and lets them push back openly until the day ends.'),
      picker,
    );
  }
  body.append(...actions);
  host.append(renderVoiceCard({ voice: VOICE_OF.squad_vote, title: 'SQUAD VOTE', meta: `Day ${String(vote.day).padStart(3, '0')}`, body, level: 3 }));
}
