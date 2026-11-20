import { h } from '../dom';

/**
 * Runs a renderer into its host; when it throws (a broken save can hold data no screen expects), the host shows a fault line instead
 * of staying empty or half drawn, and the rest of the shell (SYS above all) keeps working. The error goes to the console.
 */
export function guarded(host: HTMLElement, what: string, render: (host: HTMLElement) => void): void {
  try {
    render(host);
  } catch (e) {
    console.error(`[Alius] ${what} failed to render`, e);
    const message = e instanceof Error ? e.message : String(e);
    host.replaceChildren(h('pre', { class: 'alius-stub alius-fault', role: 'alert' },
      `MODULE FAULT // ${what.toUpperCase()}\n${message}\nThe other tabs and SYS still work.`));
  }
}
