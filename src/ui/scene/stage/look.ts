/**
 * P10e §1: looking around. Rooms are drawn wider than the screen; the right mouse button held on the frame and dragged moves
 * the view (`--alius-pan` 0…1 on the scene root), a double right-click centres it. The mouse is busy with the dial and the
 * mini-games, so this replaces P10c's pointer-follow pan outright. The position is kept per scene id in this module (never
 * saved), survives a redraw, and is forgotten by `resetSceneStage()` (new scene ids repeat across campaigns).
 * The context menu is suppressed on the frame only; a cards' or a button's menu is untouched.
 */
const memory = new Map<string, number>();
const DOUBLE_MS = 300;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function resetLook(): void {
  memory.clear();
}

export interface LookOpts {
  sceneId(): string;
  /** Reduced motion: dragging still works, the view just does not ease. Read again on every press. */
  reduced(): boolean;
  /** Called once the view is first moved (the hint goes away). */
  onUse?(): void;
}

/** Wires the right button on `frame`; returns the detach function. */
export function attachLook(frame: HTMLElement, root: HTMLElement, opts: LookOpts): () => void {
  const id = opts.sceneId();
  let pan = memory.get(id) ?? 0.5;
  let drag: { x: number; pan: number; moved: boolean } | null = null;
  let lastClick = -Infinity;
  const apply = (): void => {
    root.style.setProperty('--alius-pan', String(Math.round(pan * 10000) / 10000));
    memory.set(id, pan);
  };
  const still = (): void => {
    root.classList.toggle('alius-look-still', opts.reduced());
  };
  root.style.setProperty('--alius-pan', String(pan));
  still();

  const down = (e: Event): void => {
    const ev = e as PointerEvent;
    if (ev.button !== 2) return;
    still();
    if (Date.now() - lastClick <= DOUBLE_MS) {
      lastClick = -Infinity;
      drag = null;
      pan = 0.5;
      apply();
      return;
    }
    drag = { x: ev.clientX, pan, moved: false };
    root.classList.add('alius-looking'); // no easing while the view follows the pointer
    try {
      frame.setPointerCapture?.(ev.pointerId);
    } catch {
      /* a synthetic pointer has nothing to capture */
    }
  };
  const stop = (): void => {
    drag = null;
    root.classList.remove('alius-looking');
  };
  const move = (e: Event): void => {
    if (!drag) return;
    if (((e as PointerEvent).buttons & 2) === 0) { // the button was let go where no pointerup reached the frame (outside the window, an Alt-Tab)
      stop();
      return;
    }
    const width = frame.getBoundingClientRect().width;
    if (width <= 0) return;
    const dx = drag.x - (e as PointerEvent).clientX;
    if (dx === 0 && !drag.moved) return;
    if (!drag.moved) opts.onUse?.();
    drag.moved = true;
    pan = clamp01(drag.pan + dx / width);
    apply();
  };
  const up = (e: Event): void => {
    if (!drag || (e as PointerEvent).button !== 2) return;
    if (!drag.moved) lastClick = Date.now(); // a press without a drag: the first half of a double click
    stop();
  };
  // a cancelled pointer or a lost capture ends the drag whatever the button says (it is -1 there)
  const menu = (e: Event): void => e.preventDefault();

  frame.addEventListener('pointerdown', down);
  frame.addEventListener('pointermove', move);
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', stop);
  frame.addEventListener('lostpointercapture', stop);
  frame.addEventListener('contextmenu', menu);
  return () => {
    frame.removeEventListener('pointerdown', down);
    frame.removeEventListener('pointermove', move);
    frame.removeEventListener('pointerup', up);
    frame.removeEventListener('pointercancel', stop);
    frame.removeEventListener('lostpointercapture', stop);
    frame.removeEventListener('contextmenu', menu);
    root.classList.remove('alius-looking');
  };
}
