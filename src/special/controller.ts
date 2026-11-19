import type { EngineEvent } from '../engine/dispatch';
import { handlerLine } from '../engine/special/debts/handler';
import { premonitionLine } from '../engine/special/paranoia/premonitions';
import { nightmareLine } from '../engine/special/paranoia/nightmares';
import { fallbackFragment, interceptGist } from '../engine/special/frequency/fragments';
import { sanitizeFragment, type FragmentFlavorInput } from '../llm/calls/flavor';
import type { SpecialDeps } from './deps';

export type { SpecialDeps } from './deps';

export interface SpecialController {
  /** Reads the events of one dispatch: a new frequency intercept is worded (the model, or the template) and stored; a discovery and a burn are toasted. */
  onEvents(events: EngineEvent[]): void;
  /** The commander's answer to the handler's visit (one answer for every item). Dispatched with the chat it was asked in; toasts and resolves false when the engine refuses or the chat changed. */
  answerVisit(visitId: string, answers: Record<string, string>): Promise<boolean>;
}

/**
 * The special-trait half of the app (P12): it words what the engine decided and nothing else. The engine decides what was
 * overheard and whether it was true; the model only puts the gist into a broken thought (setting `fragmentWording`), and its
 * answer is never read for a number or a truth. An answer for another chat is dropped.
 */
export function createSpecial(deps: SpecialDeps): SpecialController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = () => deps.app.current().state;

  const interceptOf = (id: string) => state()?.special?.frequency?.intercepts.find((y) => y.id === id);
  const nameFor = (s: NonNullable<ReturnType<typeof state>>, unitId: string): string => s.squad.find((u) => u.id === unitId)?.displayName ?? unitId;

  // the `flavor.frequency_fragment` site (key: the intercept's id): never a record or a chip (a record would be a trace of what she overheard:
  // hidden truth); a failure puts the template fragment in
  deps.generations.bind<FragmentFlavorInput, string>('flavor.frequency_fragment', {
    build(interceptId) {
      const s = state();
      const x = interceptOf(interceptId);
      if (!s || !x || x.text !== undefined) return { expired: 'It is worded already.' };
      return { kind: 'frequency_fragment', name: nameFor(s, x.unitId), candidate: x.kind, gist: interceptGist(s, deps.registries(), x), partial: x.partial };
    },
    parse: (raw) => sanitizeFragment((raw as { text?: unknown })?.text),
    apply(interceptId, text) {
      const events = deps.app.dispatch({ type: 'frequency/word', payload: { id: interceptId, text } }, { expectChatId: chatId() });
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
    fallback(interceptId) {
      const s = state();
      const x = interceptOf(interceptId);
      if (!s || !x) return false;
      const events = deps.app.dispatch({ type: 'frequency/word', payload: { id: interceptId, text: fallbackFragment(deps.registries(), x, nameFor(s, x.unitId)) } }, { expectChatId: chatId() });
      return !events.some((e) => e.type === 'error');
    },
  });

  /** Words one intercept that has no text yet. A chat that changed meanwhile drops it (the chip falls back to the template). */
  async function word(interceptId: string, expect: string | undefined): Promise<void> {
    const s = state();
    const x = interceptOf(interceptId);
    if (!s || !x || x.text !== undefined || chatId() !== expect) return;
    if (deps.settings().fragmentWording) {
      await deps.generations.generate('flavor.frequency_fragment', interceptId);
      return;
    }
    deps.app.dispatch({ type: 'frequency/word', payload: { id: interceptId, text: fallbackFragment(deps.registries(), x, nameFor(s, x.unitId)) } }, { expectChatId: expect });
  }

  const nameOf = (id: unknown): string => state()?.squad.find((u) => u.id === id)?.displayName ?? 'A soldier';

  /** The nightmare of last night, shown when the morning comes. */
  let dreamt: string | null = null;

  const handlerId = (): string => state()?.special?.debts?.handlerId ?? '';
  const CONSEQUENCE_WORDS: Record<string, string> = {
    plan: 'The rival knew where the squad was going.', base: 'Something at the base was tampered with.',
    mission_done: 'The rival is using what it learned about the squad\'s work.', spine: 'The rival is using what it learned about the squad\'s work.',
    squad: 'The rival is using what it learned about a soldier.',
  };

  return {
    async answerVisit(visitId, answers) {
      const expect = chatId();
      if (state() === null || chatId() !== expect) return false;
      const events = deps.app.dispatch({ type: 'debts/answer_visit', payload: { visitId, answers } }, { expectChatId: expect });
      const bad = events.find((e) => e.type === 'error');
      if (bad) {
        if (bad.code !== 'chat_changed') deps.toast('error', String(bad.message ?? bad.code));
        return false;
      }
      deps.refreshContext();
      return true;
    },
    onEvents(events) {
      const expect = chatId();
      for (const e of events) {
        if (e.type === 'frequency_intercept') void word(String(e.interceptId), expect).catch(() => {});
        // the commander is told: she knows and she confronts (AUTHOR TO WRITE: the wording). Names her only, never what any fragment was.
        else if (e.type === 'frequency_discovered') {
          deps.notice?.('warn', `${nameOf(e.unitId)} found out about the frequency. Expect her to confront you.`, 'FREQUENCY', 'frequency');
          deps.cutIn?.('FOUND OUT');
        } else if (e.type === 'implant_burned') deps.notice?.('info', 'The implant is burned out. The fragments stop for good.', 'FREQUENCY', 'frequency');
        else if (e.type === 'premonition') {
          // the same toast for a real and a false warning: the wording is picked by the id, nothing here reads the truth
          const p = state()?.special?.paranoia?.premonitions.find((x) => x.id === e.premonitionId);
          if (p) deps.notice?.('warn', premonitionLine(deps.registries(), p, nameOf(p.unitId)), 'PREMONITION', 'premonition');
        } else if (e.type === 'handler_threat') deps.notice?.('warn', handlerLine(deps.registries(), handlerId(), 'threat'), 'HANDLER', 'handler');
        else if (e.type === 'handler_leak') {
          deps.notice?.('warn', handlerLine(deps.registries(), handlerId(), 'leak'), 'HANDLER', 'handler');
          deps.cutIn?.('EXPOSED');
        } else if (e.type === 'debts_consequence') deps.notice?.('warn', CONSEQUENCE_WORDS[String(e.kind)] ?? 'Something you sold came back.', 'HANDLER', 'handler');
        else if (e.type === 'debts_discovered') deps.notice?.('warn', `${nameOf(e.unitId)} found out about the handler.`, 'HANDLER', 'handler');
        else if (e.type === 'defector_arc') deps.notice?.('warn', 'The dealings with the rival corporation are out. This is the defector arc now.', 'HANDLER', 'handler');
        else if (e.type === 'bloom_nightmare') dreamt = nightmareLine(Number(e.day));
        else if (e.type === 'day_started' && dreamt !== null) {
          deps.notice?.('info', dreamt, 'BLOOM', 'premonition');
          dreamt = null;
        }
      }
    },
  };
}
