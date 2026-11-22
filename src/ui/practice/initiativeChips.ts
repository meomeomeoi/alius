import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { permissionRuleOf } from '../../engine/practice/denial';
import { permissionLine } from '../../engine/practice/view';
import { practiceLive } from '../../engine/practice/gate';
import { askable, askRefusal, type AskWhat } from '../../engine/practice/initiative';
import { HANDOVER_KINDS, type HandoverKind } from '../../engine/practice/state';
import type { PermissionAnswer } from '../../engine/practice/state';
import { renderHandoverComposer } from './handoverComposer';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

/** What the chips do: the surface hands each to the app, which dispatches the engine action. */
export interface InitiativeHandlers {
  /** `[ ASK FOR A TASK ]` / `[ ASK FOR PUNISHMENT ]` (`practice/ask`). */
  onAsk: (unitId: string, what: AskWhat) => void;
  /** `[ I DIDN'T ]` on her routine (`practice/confess`). */
  onConfess: (taskId: string) => void;
  /** `[ ASK PERMISSION ]` while a rule of hers asks for it (`practice/ask_permission`). */
  onAskPermission: (holderId: string) => void;
  /** The composer of `[ GIVE HER … ]` was sent: the card the commander says yes to (`practice/hand_over`). Absent = no chip. */
  onHandOver?: (holderId: string, kind: HandoverKind, days: number) => void;
  /** `[ TAKE BACK … ]` on what stands (`practice/take_back`). Absent = no chip. */
  onTakeBack?: (handoverId: string) => void;
}

export interface InitiativeSurfaceCtx extends InitiativeHandlers {
  state: CampaignState;
  reg: Registries;
  /** Which women this surface is about (a scene's participants, the open thread). */
  pick: (unitId: string) => boolean;
  /** The element the composer's choice is kept on when `host` is rebuilt on every draw (the thread). Default: `host`. */
  memory?: HTMLElement;
}

/** The woman whose composer is open, per surface. */
const openFor = new WeakMap<HTMLElement, string>();
const TAKE_WORDS: Readonly<Record<HandoverKind, string>> = { device: 'THE DEVICE', key: 'THE KEY', calendar: 'THE CALENDAR' };

const LABEL: Readonly<Record<AskWhat, string>> = { task: 'ASK FOR A TASK', punishment: 'ASK FOR PUNISHMENT' };
const GLOSSARY: Readonly<Record<AskWhat, string>> = { task: 'glossary:ask_for_task', punishment: 'glossary:ask_for_punishment' };

/**
 * The commander's own chips beside the offer chips (P16, plan R15, R10, R13, R24): `[ ASK FOR A TASK ]` and `[ ASK FOR PUNISHMENT ]` for each woman `pick` chooses whom the commander may
 * ask (a holder, or an eligible unit); `[ I DIDN'T ]` for her open routine that was not told today; `[ ASK PERMISSION ]` while a permission rule of hers is in force, with her answer under it as a
 * line in her voice once she has given it. A chip the engine would refuse is `aria-disabled` and says why. Every chip is addressed by the glossary. Nothing while the dynamic is off. Replaces what `host` held.
 */
export function drawInitiativeChips(host: HTMLElement, ctx: InitiativeSurfaceCtx): void {
  host.replaceChildren();
  const { state, reg } = ctx;
  const key = ctx.memory ?? host; // what outlives a redraw: the composer's open woman and its choice
  if (!dynamicOn(state, reg)) return;
  const women = state.squad.filter((u) => u.kind === 'named' && ctx.pick(u.id));
  const several = women.filter((u) => askable(state, reg, u.id) || practiceLive(state, reg, u.id)).length > 1;
  const chips: Child[] = [];
  const lines: HTMLElement[] = [];
  const suffix = (name: string): string => (several ? ` > ${name.toUpperCase()}` : '');
  for (const unit of women) {
    const live = { unitId: unit.id };
    if (askable(state, reg, unit.id)) {
      for (const what of ['task', 'punishment'] as const) {
        const why = askRefusal(state, reg, unit.id, what);
        chips.push(h('button', {
          type: 'button', class: 'alius-btn alius-chip', 'data-action': `ask-${what}`, 'data-unit': unit.id, ...analyzeNative(GLOSSARY[what], live),
          ...(why !== null ? { 'aria-disabled': 'true', title: why } : {}), onclick: () => { if (why === null) ctx.onAsk(unit.id, what); },
        }, `[ ${LABEL[what]}${suffix(unit.displayName)} ]`));
      }
    }
    if (!practiceLive(state, reg, unit.id)) continue;
    for (const task of state.practices?.tasks ?? []) {
      if (task.holderId !== unit.id || task.routine !== true || task.status !== 'open' || task.brokenDay === state.day) continue;
      chips.push(h('button', {
        type: 'button', class: 'alius-btn alius-chip', 'data-action': 'confess', 'data-unit': unit.id, 'data-task': task.id, ...analyzeNative('glossary:confess', live), onclick: () => ctx.onConfess(task.id),
      }, "[ I DIDN'T ]"));
    }
    if (ctx.onHandOver !== undefined) {
      chips.push(h('button', {
        type: 'button', class: 'alius-btn alius-chip', 'data-action': 'give', 'data-unit': unit.id, 'aria-expanded': String(openFor.get(key) === unit.id), ...analyzeNative('glossary:handover', live),
        onclick: () => { if (openFor.get(key) === unit.id) openFor.delete(key); else openFor.set(key, unit.id); drawInitiativeChips(host, ctx); },
      }, `[ GIVE HER …${suffix(unit.displayName)} ]`));
    }
    for (const h2 of state.practices?.handovers ?? []) {
      if (h2.holderId !== unit.id || ctx.onTakeBack === undefined || !(HANDOVER_KINDS as readonly string[]).includes(h2.kind)) continue;
      chips.push(h('button', { type: 'button', class: 'alius-btn alius-chip', 'data-action': 'take-back', 'data-handover': h2.id, 'data-unit': unit.id, ...analyzeNative('glossary:handover', live), onclick: () => ctx.onTakeBack!(h2.id) }, `[ TAKE BACK ${TAKE_WORDS[h2.kind]} ]`));
    }
    if (permissionRuleOf(state, reg, unit.id) !== undefined) {
      chips.push(h('button', {
        type: 'button', class: 'alius-btn alius-chip', 'data-action': 'ask-permission', 'data-unit': unit.id, ...analyzeNative('glossary:ask_permission', live), onclick: () => ctx.onAskPermission(unit.id),
      }, `[ ASK PERMISSION${suffix(unit.displayName)} ]`));
      const answer = permissionLine(state, unit.id);
      if (answer !== null) {
        const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('p', { class: 'alius-permission-line', 'data-permission-answer': answer, ...analyzeAttrs('glossary:ask_permission', live) }, plainDraft(TUNING.practice.permission.lines[answer])), accent: unitAccent(unit.id) });
        card.classList.add('alius-permission-answer');
        lines.push(card);
      }
    }
  }
  if (chips.length === 0) return;
  host.append(h('div', { class: 'alius-chips alius-initiative-chips' }, ...chips), ...lines);
  const open = openFor.get(key);
  if (open !== undefined && ctx.onHandOver !== undefined && practiceLive(state, reg, open) && ctx.pick(open)) {
    const composerHost = h('div', { class: 'alius-handover-host' }) as HTMLElement;
    host.append(composerHost);
    renderHandoverComposer(composerHost, {
      state, reg, unitId: open, memory: key,
      onSend: (kind, days) => { openFor.delete(key); drawInitiativeChips(host, ctx); ctx.onHandOver!(open, kind, days); },
      onClose: () => { openFor.delete(key); drawInitiativeChips(host, ctx); },
    });
  } else if (open !== undefined) openFor.delete(key);
}
