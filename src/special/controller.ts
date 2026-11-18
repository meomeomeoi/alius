import type { EngineEvent } from '../engine/dispatch';
import { fallbackFragment, interceptGist } from '../engine/special/frequency/fragments';
import { generateFragment } from '../llm/calls/flavor';
import type { SpecialDeps } from './deps';

export type { SpecialDeps } from './deps';

export interface SpecialController {
  /** Reads the events of one dispatch: a new frequency intercept is worded (the model, or the template) and stored; a discovery and a burn are toasted. */
  onEvents(events: EngineEvent[]): void;
}

/**
 * The special-trait half of the app (P12): it words what the engine decided and nothing else. The engine decides what was
 * overheard and whether it was true; the model only puts the gist into a broken thought (setting `fragmentWording`), and its
 * answer is never read for a number or a truth. An answer for another chat is dropped.
 */
export function createSpecial(deps: SpecialDeps): SpecialController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = () => deps.app.current().state;

  /** Words one intercept that has no text yet. A chat that changed meanwhile drops it (the chip falls back to the template). */
  async function word(interceptId: string, expect: string | undefined): Promise<void> {
    const s = state();
    const x = s?.special?.frequency?.intercepts.find((y) => y.id === interceptId);
    if (!s || !x || x.text !== undefined) return;
    const reg = deps.registries();
    const name = s.squad.find((u) => u.id === x.unitId)?.displayName ?? x.unitId;
    let text = fallbackFragment(reg, x, name);
    if (deps.settings().fragmentWording) {
      try {
        const worded = await generateFragment(
          { name, kind: x.kind, gist: interceptGist(s, reg, x), partial: x.partial },
          { st: deps.st, settings: deps.settings(), contentLine: deps.contentLine },
        );
        if (worded !== null) text = worded;
      } catch {
        // a failed call never blocks the fragment: the template stands
      }
    }
    if (chatId() !== expect) return;
    deps.app.dispatch({ type: 'frequency/word', payload: { id: interceptId, text } }, { expectChatId: expect });
  }

  const nameOf = (id: unknown): string => state()?.squad.find((u) => u.id === id)?.displayName ?? 'A soldier';

  return {
    onEvents(events) {
      const expect = chatId();
      for (const e of events) {
        if (e.type === 'frequency_intercept') void word(String(e.interceptId), expect).catch(() => {});
        // the commander is told: she knows and she confronts (AUTHOR TO WRITE: the wording). Names her only, never what any fragment was.
        else if (e.type === 'frequency_discovered') {
          deps.notice?.('warn', `${nameOf(e.unitId)} found out about the frequency. Expect her to confront you.`, 'FREQUENCY');
          deps.cutIn?.('FOUND OUT');
        } else if (e.type === 'implant_burned') deps.notice?.('info', 'The implant is burned out. The fragments stop for good.', 'FREQUENCY');
      }
    },
  };
}
