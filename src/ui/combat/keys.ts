export interface CombatKeyHandlers {
  skill(index: number): void;
  cycleTarget(dir: 1 | -1): void;
  confirm(): void;
  guard(): void;
  swap(): void;
  pass(): void;
  order(index: number): void;
  auto(): void;
  cancel(): void;
  /** Compel the unit that just refused (P6). */
  compel?(): void;
}

/** Order hotkeys in registry order. */
export const ORDER_KEYS = ['q', 'w', 'e', 'r', 't'] as const;

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && typeof el.tagName === 'string' && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true);
};

/** Keyboard control of the combat screen (ignored while typing). Returns the remover. */
export function attachCombatKeys(h: CombatKeyHandlers): () => void {
  const onKey = (e: KeyboardEvent): void => {
    // the screen lives inside the open shell: with the shell closed the keys belong to SillyTavern
    if (!document.getElementById('alius-shell')) return;
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    if (k >= '1' && k <= '6') h.skill(Number(k) - 1);
    else if (k === 'ArrowLeft') h.cycleTarget(-1);
    else if (k === 'ArrowRight') h.cycleTarget(1);
    else if (k === 'Enter') h.confirm();
    else if (k === 'g') h.guard();
    else if (k === 's') h.swap();
    else if (k === 'p') h.pass();
    else if (k === 'a') h.auto();
    else if (k === 'c' && h.compel) h.compel();
    else if (k === 'Escape') h.cancel();
    else if ((ORDER_KEYS as readonly string[]).includes(k)) h.order((ORDER_KEYS as readonly string[]).indexOf(k));
    else handled = false;
    if (handled) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
