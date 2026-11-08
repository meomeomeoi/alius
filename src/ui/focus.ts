const CONTROLS = 'input, button, select, textarea';
const KEYS = ['key', 'action', 'regenerate', 'addTag', 'axis', 'baseline', 'avatar', 'resync'] as const;

/** A stable name for a control that survives a re-render; null if it has none. Compared in JS, never put in a selector. */
function identity(el: HTMLElement): string | null {
  for (const k of KEYS) if (el.dataset[k]) return `${k}=${el.dataset[k]}`;
  if (el.dataset.id) return `id=${el.className}|${el.dataset.id}`;
  if (el instanceof HTMLInputElement && el.type === 'radio') return `radio=${el.name}|${el.value}`;
  const label = el.getAttribute('aria-label');
  return label ? `aria=${label}` : null;
}

const isText = (el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement =>
  (el instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(el.type)) ||
  el instanceof HTMLTextAreaElement;

/**
 * Runs `draw` (which rebuilds the children of `host`) and puts keyboard focus, and the caret of a text
 * field, back on the same control afterwards. The control is found by a stable data attribute or label,
 * else by its position among the host's controls.
 */
export function renderKeepingFocus(host: HTMLElement, draw: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  let id: string | null = null;
  let index = -1;
  let tag = '';
  let caret: [number | null, number | null] | null = null;
  if (active && host.contains(active) && active.matches(CONTROLS)) {
    index = [...host.querySelectorAll<HTMLElement>(CONTROLS)].indexOf(active);
    id = identity(active);
    tag = active.tagName;
    if (isText(active)) caret = [active.selectionStart, active.selectionEnd];
  }
  draw();
  if (index < 0) return;
  const controls = [...host.querySelectorAll<HTMLElement>(CONTROLS)];
  const byId = id ? controls.find((c) => identity(c) === id) : undefined;
  const byPosition = controls[index]?.tagName === tag ? controls[index] : undefined;
  const target = byId ?? byPosition;
  if (!target) return;
  target.focus();
  if (caret && isText(target) && caret[0] !== null && caret[1] !== null) {
    try {
      target.setSelectionRange(caret[0], caret[1]);
    } catch {
      /* not a text control */
    }
  }
}
