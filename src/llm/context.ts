import type { CampaignState, Slot } from '../engine/state/types';
import type { StAdapter } from '../st/adapter';
import { estTokens } from './text';

export interface ContextProvider {
  id: string;
  /** Higher is kept first when the block is trimmed to the token cap. */
  priority: number;
  /**
   * P3b: `memory` providers share a guaranteed token budget (`memoryTokens`) and are trimmed inside it, in their own priority order;
   * everything else keeps the strict priority of the rest of the cap.
   */
  group?: 'memory';
  /** P3b: what the scene cannot do without (the header, the scene header, the units): the memory share never takes its room. */
  core?: true;
  /** A memory provider gets the tokens left in the share and should drop its lowest-ranked lines to fit (the builder cuts what it does not). */
  render(state: CampaignState, budget?: number): string | null;
}

/** What the last `build` spent (the SYS fill indicator reads it). */
export interface BuildStats {
  memoryTokens: number;
  otherTokens: number;
  directiveTokens: number;
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
  core: true,
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

  private last: BuildStats = { memoryTokens: 0, otherTokens: 0, directiveTokens: 0 };

  /** The token counts of the last `build` (a copy). */
  lastBuild(): BuildStats {
    return { ...this.last };
  }

  /**
   * One block for the main model within `capTokens`. The memory providers get up to `memoryTokens` of it (never more than what is
   * left after the core providers: header, scene header and units), each trimmed line by line, never dropped whole; the other
   * providers keep the strict priority of the rest, and whatever the memory did not use goes back to them. The block lists the
   * others first, then memory.
   */
  build(state: CampaignState, capTokens: number, memoryTokens = 0): { block: string; directives: string } {
    const byPriority = (a: ContextProvider, b: ContextProvider): number => b.priority - a.priority; // stable: ties keep registration order
    const others = this.providers.filter((p) => p.group !== 'memory').sort(byPriority);
    const memory = this.providers.filter((p) => p.group === 'memory').sort(byPriority);
    const rendered = new Map<ContextProvider, string | null>(others.map((p) => [p, p.render(state)]));

    // the memory share: what is asked, but never the room the core providers need
    const core = others.filter((p) => p.core === true).map((p) => rendered.get(p)).filter((t): t is string => !!t);
    const reserve = estTokens([BLOCK_TITLE, ...core].join('\n'));
    const share = memoryTokens > 0 && memory.length > 0 ? Math.min(memoryTokens, Math.max(0, capTokens - reserve)) : 0;

    const memLines: string[] = [];
    for (const p of memory) {
      const left = share - estTokens(memLines.join('\n'));
      if (left <= 0) break;
      const text = p.render(state, left);
      if (!text) continue;
      const fit = fitTo(text, (t) => estTokens([...memLines, t].join('\n')) <= share, left);
      if (fit) memLines.push(fit);
    }

    const lines: string[] = [];
    for (const p of others) {
      const text = rendered.get(p);
      if (!text) continue;
      // Strict priority: once one provider does not fit, nothing below it is kept either.
      if (estTokens([BLOCK_TITLE, ...lines, text, ...memLines].join('\n')) > capTokens) break;
      lines.push(text);
    }
    const all = [...lines, ...memLines];
    const block = all.length ? [BLOCK_TITLE, ...all].join('\n') : '';
    const dirs = [...this.directives.values()];
    const directives = dirs.length ? [DIRECTIVES_TITLE, ...dirs.map((d) => `- ${d.text}`)].join('\n') : '';
    this.last = {
      memoryTokens: memLines.length ? estTokens(memLines.join('\n')) : 0,
      otherTokens: lines.length ? estTokens([BLOCK_TITLE, ...lines].join('\n')) : 0,
      directiveTokens: directives ? estTokens(directives) : 0,
    };
    return { block, directives };
  }

  apply(st: StAdapter, state: CampaignState | null, capTokens: number, memoryTokens = 0): void {
    if (state === null) {
      st.setInjection('ctx', '', 'in_prompt', 0);
      st.setInjection('dir', '', 'in_chat', 1);
      return;
    }
    const { block, directives } = this.build(state, capTokens, memoryTokens);
    st.setInjection('ctx', block, 'in_prompt', 0);
    st.setInjection('dir', directives, 'in_chat', 1);
  }
}

/**
 * Cuts `text` to what `fits`: whole lines from the end first (a provider ranks its lines best first), then, if even the first line is
 * too long, its characters. Null only when nothing at all fits.
 */
function fitTo(text: string, fits: (t: string) => boolean, tokens: number): string | null {
  const lines = text.split('\n');
  while (lines.length > 1 && !fits(lines.join('\n'))) lines.pop();
  const first = lines.join('\n');
  if (fits(first)) return first;
  const cut = first.slice(0, Math.max(0, Math.floor(tokens * 3.6) - 1)).trimEnd();
  return cut !== '' && fits(cut) ? cut : null;
}
