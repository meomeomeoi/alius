/** The slice of toastr (ST's global toast library) that Alius uses. */
export interface Toastr {
  info?: (message: string, title: string, options?: Record<string, unknown>) => unknown;
  warning?: (message: string, title: string, options?: Record<string, unknown>) => unknown;
  error?: (message: string, title: string, options?: Record<string, unknown>) => unknown;
}

/**
 * Shows a toast through toastr, escaping its text: a toast can carry a unit name from a card or a model or an error message, and
 * ST's global `escapeHtml` option may have been turned off by someone else. False when toastr is not there (the caller logs).
 */
export function showToastr(t: Toastr | undefined, kind: 'info' | 'warn' | 'error', text: string): boolean {
  const fn = t?.[kind === 'warn' ? 'warning' : kind];
  if (typeof fn !== 'function') return false;
  fn.call(t, text, 'Alius', { escapeHtml: true });
  return true;
}
