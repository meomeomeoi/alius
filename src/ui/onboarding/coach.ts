import type { CoachHint } from '../../engine/onboarding';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/** What a screen needs to show the tutorial's tips: the unseen hints of that screen, and how to dismiss one. */
export interface CoachCtx {
  hints(screen: CoachHint['screen']): CoachHint[];
  onSeen(hintId: string): void;
}

/**
 * The coach strip (P11): one dismissible terminal card per unseen hint, each explained by its glossary entry (`?` on it).
 * Draws nothing for an empty list, so a screen can call it unconditionally.
 */
export function renderCoach(host: HTMLElement, hints: readonly CoachHint[], onSeen: (hintId: string) => void): void {
  for (const hint of hints) {
    const body = h('div', { class: 'alius-coach-body' },
      h('p', { class: 'alius-coach-text' }, hint.text),
      h('p', { class: 'alius-dim' }, 'Focus anything and press ? for more.'),
      h('button', { type: 'button', class: 'alius-btn', 'data-action': 'got-it', ...analyzeNative('glossary:coach_hint'), onclick: () => onSeen(hint.id) }, '[ GOT IT ]'));
    const card = renderVoiceCard({ voice: VOICE_OF.toast, title: 'TIP', level: 3, body });
    card.classList.add('alius-coach', 'alius-stat');
    card.setAttribute('data-hint', hint.id);
    for (const [k, v] of Object.entries(analyzeAttrs(`glossary:${hint.glossaryId}`))) card.setAttribute(k, v);
    host.append(card);
  }
}

/** The strip for one screen, ready to put first in its root; `null` when there is nothing to say. */
export function coachStrip(ctx: CoachCtx | undefined, screen: CoachHint['screen']): HTMLElement | null {
  if (!ctx) return null;
  const strip = h('div', { class: 'alius-coach-host' });
  renderCoach(strip, ctx.hints(screen), ctx.onSeen);
  return strip.childElementCount > 0 ? strip : null;
}
