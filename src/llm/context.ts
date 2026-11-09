import type { CampaignState, Slot } from '../engine/state/types';
import type { StAdapter } from '../st/adapter';
import { estTokens } from './text';

export interface ContextProvider {
  id: string;
  /** Higher is kept first when the block is trimmed to the token cap. */
  priority: number;
  render(state: CampaignState): string | null;
}

export interface Directive {
  id: string;
  text: string;
  expiresAfter: 'next_reply' | 'scene' | 'manual';
}

const BLOCK_TITLE = '[ALIUS CONTEXT]';
const DIRECTIVES_TITLE = '[ALIUS DIRECTIVES — hard constraints, follow them]';

const SLOT_LABEL: Record<Slot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const headerProvider: ContextProvider = {
  id: 'header',
  priority: 100,
  render: (s) => `[ALIUS] Day ${s.day}, ${SLOT_LABEL[s.slot]}.`,
};

/** Collects provider output into one block for the main model, within a token cap. */
export class ContextBuilder {
  private providers: ContextProvider[] = [headerProvider];
  private directives = new Map<string, Directive>();

  register(p: ContextProvider): void {
    this.providers.push(p);
  }

  setDirective(d: Directive): void {
    this.directives.set(d.id, d);
  }

  clearDirective(id: string): void {
    this.directives.delete(id);
  }

  /** Call when a main-model reply arrives: drops `next_reply` directives (except those `keep` says must outlive this reply). */
  onReplyReceived(keep?: (d: Directive) => boolean): void {
    for (const [id, d] of this.directives) if (d.expiresAfter === 'next_reply' && !keep?.(d)) this.directives.delete(id);
  }

  /** Drops every directive `match` accepts (e.g. all `proposal:*` ones when a scene ends or the chat changes). */
  clearMatching(match: (d: Directive) => boolean): void {
    for (const [id, d] of this.directives) if (match(d)) this.directives.delete(id);
  }

  build(state: CampaignState, capTokens: number): { block: string; directives: string } {
    const sorted = [...this.providers].sort((a, b) => b.priority - a.priority); // stable: ties keep registration order
    const lines: string[] = [];
    for (const p of sorted) {
      const text = p.render(state);
      if (!text) continue;
      // Strict priority: once one provider does not fit, nothing below it is kept either.
      if (estTokens([BLOCK_TITLE, ...lines, text].join('\n')) > capTokens) break;
      lines.push(text);
    }
    const block = lines.length ? [BLOCK_TITLE, ...lines].join('\n') : '';
    const dirs = [...this.directives.values()];
    const directives = dirs.length ? [DIRECTIVES_TITLE, ...dirs.map((d) => `- ${d.text}`)].join('\n') : '';
    return { block, directives };
  }

  apply(st: StAdapter, state: CampaignState | null, capTokens: number): void {
    if (state === null) {
      st.setInjection('ctx', '', 'in_prompt', 0);
      st.setInjection('dir', '', 'in_chat', 1);
      return;
    }
    const { block, directives } = this.build(state, capTokens);
    st.setInjection('ctx', block, 'in_prompt', 0);
    st.setInjection('dir', directives, 'in_chat', 1);
  }
}
