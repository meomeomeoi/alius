import type { CampaignState, GenerationRecord } from '../../engine/state/types';
import { generationSite, type GenerationSurface } from '../../llm/sites';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

// P14: the failure chip, the REROLL button and the list of chips a surface shows. Text only (`h` / `textContent`).

export interface ChipHandlers {
  /** What the site generates ("After-action recap"); generic, never a hidden value. */
  label: string;
  /** `describeFailure(...)`: `<label>: <why>.` */
  text: string;
  onRetry(): void;
  /** The `[⋯]` button: the retry menu. */
  onMenu(): void;
  /** Offered by a site that holds a fallback back (the director's plan). */
  onUseFallback?(): void;
  /** DROP: the only button of an expired chip. */
  onDrop?(): void;
  /** A retry is running: every button waits. */
  pending?: boolean;
  /** An open chip shows `[DROP]` too (the SYS list; elsewhere DROP is in the menu). */
  showDrop?: boolean;
}

/**
 * The chip under a failed generation: `<label>: <why>.` with `[RETRY]`, `[⋯]` and, where the site allows it, `[USE FALLBACK]`.
 * An expired record (the moment passed) shows why and only `[DROP]`. It shares the look of the content violation mark.
 * Appends to `host` and returns the chip.
 */
export function drawGenerationChip(host: HTMLElement, rec: GenerationRecord, hd: ChipHandlers): HTMLElement {
  const expired = rec.status === 'expired';
  const chip = h('span', {
    class: `alius-chip alius-genfail${expired ? ' alius-genfail-expired' : ''}`, 'data-record': rec.id, 'data-site': rec.siteId, role: 'note',
    ...analyzeAttrs('glossary:generation_failed', { recordId: rec.id }),
  }, h('span', { class: 'alius-genfail-text' }, `⚠ ${hd.text}`));
  const button = (action: string, label: string, aria: string, onclick: () => void) => h('button', {
    type: 'button', class: 'alius-btn alius-option', 'data-action': `generation-${action}`, 'aria-label': aria, disabled: hd.pending === true,
    ...analyzeNative('glossary:generation_failed', { recordId: rec.id }), onclick,
  }, label);
  if (expired) {
    if (hd.onDrop) chip.append(' ', button('drop', '[DROP]', `Remove this note about ${hd.label}`, hd.onDrop));
  } else {
    chip.append(' ', button('retry', '[RETRY]', `Retry ${hd.label}`, hd.onRetry));
    if (hd.onUseFallback) chip.append(' ', button('fallback', '[USE FALLBACK]', `Use the plain version of ${hd.label}`, hd.onUseFallback));
    chip.append(' ', button('menu', '[⋯]', `More ways to retry ${hd.label}`, hd.onMenu));
    if (hd.showDrop && hd.onDrop) chip.append(' ', button('drop', '[DROP]', `Give up ${hd.label}`, hd.onDrop));
  }
  host.append(chip);
  return chip;
}

/**
 * `[REROLL]`: ask the model again for a result that was already given. Disabled it is `aria-disabled` with the reason as its title (still
 * analyzable: the reading gives the reason); `pending` locks it while a call runs. Appends to `host` and returns the button.
 */
export function drawReroll(
  host: HTMLElement, state: { enabled: boolean; reason?: string }, onReroll: () => void, pending = false,
): HTMLElement {
  const off = !state.enabled;
  const ctx = off && state.reason !== undefined ? { reason: state.reason } : undefined;
  const btn = h('button', {
    type: 'button', class: 'alius-btn alius-option alius-reroll', 'data-action': 'generation-reroll', 'aria-label': 'Reroll: ask the model again',
    disabled: pending, 'aria-disabled': off ? 'true' : null, title: off ? state.reason : null,
    ...analyzeNative('glossary:generation_reroll', ctx), onclick: () => { if (!off) onReroll(); },
  }, '[REROLL]');
  host.append(btn);
  return btn;
}

/**
 * The records a surface draws: open and expired ones of the sites that record `full` and sit on `surface`, oldest first.
 * A `quiet` site shows in SYS only, so it never appears here.
 */
export function chipsFor(state: CampaignState, surface: GenerationSurface, filter?: (r: GenerationRecord) => boolean): GenerationRecord[] {
  return (state.generations?.records ?? []).filter((r) => {
    const site = generationSite(r.siteId);
    return site !== undefined && site.record === 'full' && site.surface === surface && (filter === undefined || filter(r));
  });
}
