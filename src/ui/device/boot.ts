import { h } from '../dom';

/** Four beats of 150 ms: three lines, then the fade. The whole boot is 600 ms. */
const STEP_MS = 150;

/**
 * The PDA boot: three lines typed over the screen, then a fade. Any key or press ends it at once; `reduced` skips it
 * (nothing is drawn). Resolves when it is gone.
 */
export function playBoot(screen: HTMLElement, opts: { reduced: boolean; skinLabel: string }): Promise<void> {
  if (opts.reduced) return Promise.resolve();
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'alius-boot', 'aria-hidden': 'true' });
    screen.append(overlay);
    const lines = [`${opts.skinLabel} // BOOT`, 'LINK ........ OK', 'CCP OVERSIGHT HANDSHAKE ........ OK'];
    const show = (i: number): void => void overlay.append(h('div', { class: 'alius-boot-line' }, lines[i]));
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', finish);
      document.removeEventListener('pointerdown', finish);
      overlay.remove();
      resolve();
    };
    show(0);
    timers.push(setTimeout(() => show(1), STEP_MS));
    timers.push(setTimeout(() => show(2), STEP_MS * 2));
    timers.push(setTimeout(() => overlay.classList.add('alius-boot-fade'), STEP_MS * 3));
    timers.push(setTimeout(finish, STEP_MS * 4));
    document.addEventListener('keydown', finish);
    document.addEventListener('pointerdown', finish);
  });
}
