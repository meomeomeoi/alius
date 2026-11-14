/** True for a field the player types into: global keys must not fire while it has the focus. */
export function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true;
}

const CONTROL_TAGS = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'];
const CONTROL_ROLES = ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option'];

/**
 * True inside the device (its screen, panel and tab bar) and inside a dialog such as the analysis panel. `Tab` there walks
 * through the controls like anywhere else: toggling the device from inside it would make its own contents unreachable by
 * keyboard (the panel itself is focusable and not a control).
 */
export function isInsideOverlay(t: EventTarget | null): boolean {
  const el = t as Element | null;
  return !!el && typeof el.closest === 'function' && el.closest('.alius-device, [role="dialog"], .alius-analyze') !== null;
}

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
