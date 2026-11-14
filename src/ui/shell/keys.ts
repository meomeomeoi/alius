/** True for a field the player types into: global keys must not fire while it has the focus. */
export function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true;
}

const CONTROL_TAGS = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
const CONTROL_ROLES = ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option'];

/**
 * True for something `Tab` should move focus past: a button, link, field, summary, contenteditable or an element that
 * says it is a control by role. The shell root, the hub background, the device screen, the panel container and the
 * document body are not controls, so `Tab` there toggles the device instead.
 */
export function isControl(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (CONTROL_TAGS.includes(el.tagName) || el.isContentEditable === true) return true;
  const role = el.getAttribute?.('role');
  return role !== null && role !== undefined && CONTROL_ROLES.includes(role);
}
