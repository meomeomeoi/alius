import { h } from '../dom';

export interface ConfrontationCtx {
  kind: 'desertion' | 'mutiny' | 'return';
  unitName: string;
  framing: string;
  talkTried: boolean;
  ranks: { authority: number; empathy: number };
  leashLeft: number;
  /** A loyal unit is able to stand with the commander (mutiny). */
  canFight: boolean;
  /** Why she cannot be taken back (no free bed), or `null`. */
  canTakeBack: string | null;
  onTalk(stat: 'authority' | 'empathy'): void;
  onLetGo(): void;
  onSuppress(): void;
  onFight(): void;
  onYield(): void;
  onTakeBack(): void;
  onTurnAway(): void;
}

const TITLE: Record<ConfrontationCtx['kind'], string> = { desertion: 'DESERTION', mutiny: 'MUTINY', return: 'AT THE GATE' };

/** A night that cannot be ignored: fixed answers only. One answer is final, so every button locks once one is pressed. */
export function renderConfrontation(host: HTMLElement, ctx: ConfrontationCtx): void {
  host.replaceChildren();
  const buttons: HTMLButtonElement[] = [];
  let answered = false;
  const add = (list: HTMLElement, label: string, run: () => void, disabledReason: string | null = null): void => {
    const b = h('button', {
      type: 'button', class: 'alius-btn', disabled: disabledReason !== null, title: disabledReason ?? undefined,
      onclick: () => {
        if (answered || disabledReason !== null) return;
        answered = true;
        for (const x of buttons) x.disabled = true;
        run();
      },
    }, label) as HTMLButtonElement;
    buttons.push(b);
    list.append(b);
    if (disabledReason !== null) list.append(h('span', { class: 'alius-dilemma-reason' }, disabledReason));
  };
  const actions = h('div', { class: 'alius-confrontation-actions' });
  const noLeash = ctx.leashLeft < 1 ? 'NO AUTHORIZATIONS REMAIN THIS WEEK' : null;

  if (ctx.kind === 'desertion') {
    if (!ctx.talkTried) {
      add(actions, `[TALK HER DOWN — AUTHORITY ${ctx.ranks.authority}]`, () => ctx.onTalk('authority'));
      add(actions, `[TALK HER DOWN — EMPATHY ${ctx.ranks.empathy}]`, () => ctx.onTalk('empathy'));
    }
    add(actions, '[LET HER GO]', ctx.onLetGo);
    add(actions, '[SUPPRESS]', ctx.onSuppress, noLeash);
  } else if (ctx.kind === 'mutiny') {
    if (ctx.canFight) add(actions, '[FIGHT]', ctx.onFight);
    else add(actions, '[YIELD]', ctx.onYield);
    add(actions, '[SUPPRESS]', ctx.onSuppress, noLeash);
  } else {
    add(actions, '[TAKE HER BACK]', ctx.onTakeBack, ctx.canTakeBack);
    add(actions, '[TURN HER AWAY]', ctx.onTurnAway);
  }
  host.append(h('div', { class: 'alius-confrontation' },
    h('h3', {}, `${TITLE[ctx.kind]} // ${ctx.unitName}`),
    h('p', { class: 'alius-dilemma-setup' }, ctx.framing),
    actions));
}
