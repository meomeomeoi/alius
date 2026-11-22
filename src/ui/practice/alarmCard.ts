import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import type { AlarmAnswer, AlarmKind } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

/** What the card does: the commander's three answers to a keep, SEND THE SQUAD (a launch or a deadline), and closing a card that only tells (a release). */
export interface AlarmCardHandlers {
  accept: (alarmId: string) => void;
  argue: (alarmId: string) => void;
  defy: (alarmId: string) => void;
  sendSquad: (alarmId: string) => void;
  dismiss: () => void;
}

/** A release (or a late one) that is told as a card: her, what the duty was, her answer, and why the launch that followed it did not go (the departure check's own reason). */
export interface AlarmShown { holderId: string; kind: AlarmKind; answer: Exclude<AlarmAnswer, 'keep'>; reason?: string | null }

/** What she says to a duty that comes while she holds the commander, by her answer and the duty (drafts: `AUTHOR TO WRITE`, read through `plainDraft`; no pronoun for the commander). */
const LINES: Readonly<Record<AlarmAnswer, Readonly<Record<AlarmKind, string>>>> = {
  keep: {
    launch: 'AUTHOR TO WRITE: The squad can go without you. You stay where I put you.',
    deadline: 'AUTHOR TO WRITE: The mission will not wait for you, and neither will I. Send them, or let it fail.',
    night: 'AUTHOR TO WRITE: Let them knock. You are not leaving this room.',
  },
  release_late: {
    launch: 'AUTHOR TO WRITE: Go, then. They have waited long enough for you.',
    deadline: 'AUTHOR TO WRITE: Fine. The squad waited on you. Do not make it a habit.',
    night: 'AUTHOR TO WRITE: Answer your door. Whoever it is has waited.',
  },
  release: {
    launch: 'AUTHOR TO WRITE: Go. The squad needs you more than I do.',
    deadline: 'AUTHOR TO WRITE: This one cannot wait. Go.',
    night: 'AUTHOR TO WRITE: Go and see who it is.',
  },
};

const TITLES: Readonly<Record<AlarmKind, string>> = { launch: 'A LAUNCH WAITS', deadline: 'A MISSION IS DUE', night: 'A KNOCK AT THE DOOR' };

/**
 * The alarm as a card in her voice (P16, plan R12, R24): while the commander is held and a duty has come, her answer in her own line. A `keep` that was not accepted shows the three
 * answers ACCEPT, ARGUE (once: disabled after it) and DEFY, and for a launch or a deadline [ SEND THE SQUAD ]; a release is told with OK, and a late one that then fails its own departure
 * check says why. Built from the state (the open alarm) or from `shown` (what already happened), so a reload draws the same card. `null` when there is neither. No number, no pronoun for the commander.
 */
export function renderAlarmCard(state: CampaignState, reg: Registries, shown: AlarmShown | null, handlers: AlarmCardHandlers): HTMLElement | null {
  void reg;
  const alarm = state.practices?.alarm;
  const open = alarm !== undefined && alarm.answer === 'keep' && alarm.accepted !== true ? alarm : undefined;
  const holderId = open?.holderId ?? shown?.holderId;
  const kind = open?.kind ?? shown?.kind;
  const answer: AlarmAnswer | undefined = open !== undefined ? 'keep' : shown?.answer;
  const unit = holderId === undefined ? undefined : state.squad.find((u) => u.id === holderId);
  if (unit === undefined || kind === undefined || answer === undefined) return null;
  const ctx = { unitId: unit.id, kind };
  const line = h('p', { 'data-alarm-line': '', ...analyzeAttrs('glossary:alarm', ctx) }, plainDraft(LINES[answer][kind]));
  const body = h('div', { class: 'alius-alarm-body' }, line);
  if (open !== undefined) {
    const answers = h('div', { class: 'alius-alarm-answers' },
      h('button', { type: 'button', class: 'alius-btn alius-option', 'data-alarm-answer': 'accept', ...analyzeNative('glossary:alarm', ctx), onclick: () => handlers.accept(open.id) }, '[ ACCEPT ]'),
      h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-alarm-answer': 'argue', disabled: open.argued === true, ...analyzeNative('glossary:alarm', ctx), onclick: () => handlers.argue(open.id),
      }, '[ ARGUE ]'),
      h('button', { type: 'button', class: 'alius-btn alius-option', 'data-alarm-answer': 'defy', ...analyzeNative('glossary:alarm', ctx), onclick: () => handlers.defy(open.id) }, '[ DEFY ]'),
      kind === 'night' ? null : h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-alarm-send': '', ...analyzeNative('glossary:without_command', ctx), onclick: () => handlers.sendSquad(open.id),
      }, '[ SEND THE SQUAD ]'),
    );
    body.append(answers);
  } else {
    if (shown?.reason) body.append(h('p', { class: 'alius-banner', 'data-alarm-reason': '', ...analyzeAttrs('glossary:alarm', ctx) }, plainDraft(shown.reason)));
    body.append(h('button', { type: 'button', class: 'alius-btn alius-option', 'data-alarm-dismiss': '', ...analyzeNative('glossary:alarm', ctx), onclick: () => handlers.dismiss() }, '[ OK ]'));
  }
  const card = renderVoiceCard({ voice: VOICE_OF.practice, title: TITLES[kind], from: unit.displayName, body, accent: unitAccent(unit.id), level: 3 });
  card.classList.add('alius-alarm-card');
  card.setAttribute('data-alarm', open?.id ?? 'told');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} answers a duty`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:alarm', ctx))) card.setAttribute(k, v);
  return card;
}
