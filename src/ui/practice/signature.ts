import { TUNING } from '../../engine/tuning';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What the card gives a signature: what to do when it is made, and the address its element answers to. */
export interface SignatureOpts {
  onSign: () => void;
  /** The analysis address of the element (a glossary entry). */
  analyze: string;
  ctx?: Record<string, unknown>;
  /** P10e-e: the scene's look (cards.html `signPill`): a pill whose fill grows left to right while it is held and falls back when let go. */
  look?: 'scene';
}
export type SignatureRenderer = (o: SignatureOpts) => HTMLElement;

let custom: SignatureRenderer | null = null;

/** P17e replaces the press-and-hold button with a drawn signature (P16 plan R1): the card asks `renderSignature` and draws whatever answers. */
export function registerSignature(fn: SignatureRenderer): void {
  custom = fn;
}

/** Tests: back to the default button. */
export function resetSignature(): void {
  custom = null;
}

/**
 * The default signature: `[ SIGN ]`, held for `TUNING.practice.sign.holdMs` (pointer or Enter / Space). Letting go early cancels; a held button fills (the class
 * `alius-signing`, which the reduced-motion rule stops moving). It is a native button, so it is reachable by keyboard.
 */
function holdButton(o: SignatureOpts): HTMLElement {
  const scene = o.look === 'scene';
  const button = h('button', {
    type: 'button', class: scene ? 'alius-pill alius-sign' : 'alius-btn alius-tagchip alius-sign', 'data-task-sign': '', 'aria-label': 'Sign: hold to sign',
    style: `--alius-sign-ms: ${TUNING.practice.sign.holdMs}ms`, ...analyzeNative(o.analyze, o.ctx),
  }, ...(scene ? [h('i', { class: 'alius-pill-fill', 'aria-hidden': 'true' }), h('span', {}, 'sign')] : ['[ SIGN ]']));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    button.classList.remove('alius-signing');
  };
  const start = (): void => {
    if (timer !== undefined) return;
    button.classList.add('alius-signing');
    timer = setTimeout(() => {
      timer = undefined;
      button.classList.remove('alius-signing');
      o.onSign();
    }, TUNING.practice.sign.holdMs);
  };
  button.addEventListener('pointerdown', start);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(type, stop);
  button.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } });
  button.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') stop(); });
  return button;
}

/** The signature element for a card: the registered replacement, or the press-and-hold button. */
export function renderSignature(o: SignatureOpts): HTMLElement {
  return custom !== null ? custom(o) : holdButton(o);
}
