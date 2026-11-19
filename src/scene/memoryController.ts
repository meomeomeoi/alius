import type { Registries } from '../content/types';
import { disabledCategories } from '../engine/bonds';
import { fallbackFold, foldDue, WORLD } from '../engine/memory/fold';
import { hideCandidates } from '../engine/memory/scenes';
import { memoryConfig } from '../engine/memory/config';
import { affinityBand, stressBand, trustBand } from '../engine/relations/bands';
import type { CampaignState, Fact } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import { foldMemory } from '../llm/calls/memoryFold';
import { retellRumor } from '../llm/calls/rumorRetell';
import { readDigest, type SceneDigest, type SceneSummaryInput } from '../llm/calls/sceneSummary';
import type { Envelope } from '../llm/envelope';
import { estTokens } from '../llm/text';
import type { SceneDeps } from './sceneController';

export type MemoryDeps = Pick<SceneDeps, 'st' | 'app' | 'settings'> & { registries: () => Registries; /** P14: the envelope; the memory binds its sites on creation. */ generations: Envelope };

export interface MemoryController {
  /**
   * What the memory owes after a dispatch settled: one due fold (a model writes the dossier, or the text is joined and cut when there is
   * no answer), in `model` rumor mode one retelling per fact that is still spreading, and (chunk c) the hiding of old scenes. Never
   * throws; every answer is dispatched with the chat id it was asked under, so one that arrives after a chat switch is dropped.
   */
  run(): Promise<void>;
  /** In a scene whose unsummarized transcript (before the last 4 messages) is over 2500 tokens: one `scene_summary` digest. Skipped when the call fails. */
  digestIfDue(): Promise<void>;
  /** Resolves when nothing is in flight (the scene waits for it before it summarizes). */
  idle(): Promise<void>;
}

/** Retellings per run: a long list of rumors is told over several dispatches, not in one burst. */
const RETELLS_PER_RUN = 3;

export function createMemoryController(deps: MemoryDeps): MemoryController {
  const { st, app } = deps;
  const state = (): CampaignState | null => app.current().state;
  const chatId = (): string | undefined => st.getActiveChat()?.chatId;
  const inflight = new Set<Promise<void>>();
  let folding = false;
  let digesting = false;
  /** Facts a retelling was already asked for (one call per fact, answered or not); forgotten when another chat opens. */
  let tried = new Set<string>();
  let triedChat: string | undefined;

  const track = (p: Promise<void>): Promise<void> => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
    return p;
  };
  const nameOf = (s: CampaignState, id: string): string => s.squad.find((u) => u.id === id)?.displayName ?? id;
  const texts = (facts: Fact[]): string[] => facts.map((f) => f.text);

  async function foldOnce(expect: string | undefined): Promise<void> {
    const s = state();
    const due = s ? foldDue(s) : null;
    if (!s || !due) return;
    const prev = s.memory.dossiers?.[due.target];
    const own = prev?.own ?? '';
    const shared = prev?.shared ?? '';
    const answer = await foldMemory({
      name: due.target === WORLD ? 'the squad as a whole' : nameOf(s, due.target), own, shared, ownFacts: texts(due.own), sharedFacts: texts(due.shared),
    }, { st, settings: deps.settings() });
    // a part that gets no new facts keeps what it was; without an answer the new texts are joined to the old paragraph and cut
    const next = {
      own: due.own.length === 0 ? own : answer?.own ?? fallbackFold(own, due.own, TUNING.memory.dossierOwnMax),
      shared: due.shared.length === 0 ? shared : answer?.shared ?? fallbackFold(shared, due.shared, TUNING.memory.dossierSharedMax),
    };
    app.dispatch({ type: 'memory/fold', payload: { target: due.target, ...next, factIds: [...due.own, ...due.shared].map((f) => f.id) } }, { expectChatId: expect });
  }

  async function retell(expect: string | undefined): Promise<void> {
    if (triedChat !== expect) {
      tried = new Set();
      triedChat = expect;
    }
    for (let n = 0; n < RETELLS_PER_RUN; n++) {
      const s = state();
      if (!s || memoryConfig(s).rumorMode !== 'model' || chatId() !== expect) return;
      const fact = s.memory.facts.find((f) => f.spread !== undefined && f.rumor === undefined && !tried.has(f.id));
      if (!fact) return;
      tried.add(fact.id);
      const teller = s.squad.find((u) => u.kind === 'named' && fact.knownBy.includes(u.id) && s.relations[u.id] !== undefined);
      if (!teller) continue;
      const rel = s.relations[teller.id];
      const text = await retellRumor({
        teller: teller.displayName, text: fact.text,
        bands: `trust ${trustBand(rel.trust)}, affinity ${affinityBand(rel.affinity)}, stress ${stressBand(teller.stress)}`,
      }, { st, settings: deps.settings() });
      if (text !== null) app.dispatch({ type: 'memory/rumor_text', payload: { factId: fact.id, text } }, { expectChatId: expect });
    }
  }

  /** Hides the messages of old summarized scenes (`hideScenesAfter` = N > 0), or, with N back at 0, unhides exactly what was hidden. */
  async function hideStep(expect: string | undefined): Promise<void> {
    const s = state();
    if (!s || chatId() !== expect) return;
    const n = memoryConfig(s).hideScenesAfter;
    if (n === 0) {
      const ranges = s.memory.hidden;
      if (!ranges || ranges.length === 0) return;
      await st.unhideMessages(ranges);
      app.dispatch({ type: 'memory/hidden', payload: { clear: true } }, { expectChatId: expect });
      return;
    }
    for (const scene of hideCandidates(s, n)) {
      if (chatId() !== expect) return;
      const runs = await st.hideMessages(scene.from, scene.to);
      if (runs.length > 0) app.dispatch({ type: 'memory/hidden', payload: { add: runs } }, { expectChatId: expect });
    }
  }

  // the `scene.digest` site (key `<sceneId>:<upTo>`): the digest of the scene so far, up to the message `upTo`
  deps.generations.bind<SceneSummaryInput, SceneDigest>('scene.digest', {
    build(key) {
      const m = /^(.*):(\d+)$/.exec(key);
      const s = state();
      const scene = s?.scene;
      if (!m || !s || !scene || scene.id !== m[1]) return { expired: 'The scene is over.' };
      const upTo = Number(m[2]);
      if (scene.digest && scene.digest.upTo >= upTo) return { expired: 'A later digest covers it.' };
      const from = scene.digest ? scene.digest.upTo + 1 : scene.startIndex;
      const slice = st.getChatMessages(Math.min(from, st.chatLength())).filter((x) => x.index <= upTo);
      if (slice.length === 0) return { expired: 'Those lines are no longer in the chat.' };
      const flagged = new Set((scene.violations ?? []).map((v) => v.index));
      const excluded = disabledCategories(s, deps.registries());
      return {
        location: String(deps.registries().locations.get(scene.locationId)?.name ?? scene.locationId),
        participants: scene.participants.map((id) => ({ id, name: nameOf(s, id) })),
        transcript: slice.map((x) => ({ speaker: x.isUser ? s.commander.name : x.name, text: x.text, ...(flagged.has(x.index) ? { flagged: true as const } : {}) })),
        ...(excluded.length > 0 ? { excluded } : {}),
        ...(scene.digest ? { previous: scene.digest.text } : {}),
        mode: 'digest' as const,
      };
    },
    parse: (raw, input) => readDigest(raw as never, input),
    apply(key, result) {
      const upTo = Number(/(\d+)$/.exec(key)?.[1]);
      const events = app.dispatch({ type: 'scene/digest', payload: { text: result.digest, upTo, facts: result.facts } }, { expectChatId: chatId() });
      return events.some((e) => e.type === 'error') ? { stale: true } : 'ok';
    },
  });

  return {
    run() {
      if (folding) return Promise.resolve();
      folding = true;
      return track((async () => {
        try {
          const expect = chatId();
          // a combat or an expedition accepts only its own actions: the memory waits for the next dispatch after it
          if (state()?.combat || state()?.expedition) return;
          await foldOnce(expect);
          await retell(expect);
          await hideStep(expect);
        } catch (e) {
          console.warn('[Alius] memory run failed', e);
        } finally {
          folding = false;
        }
      })());
    },

    digestIfDue() {
      if (digesting) return Promise.resolve();
      digesting = true;
      return track((async () => {
        try {
          const expect = chatId();
          const s = state();
          const scene = s?.scene;
          if (!s || !scene) return;
          const from = scene.digest ? scene.digest.upTo + 1 : scene.startIndex;
          const all = st.getChatMessages(Math.min(from, st.chatLength()));
          const slice = all.slice(0, Math.max(0, all.length - TUNING.memory.digestKeep));
          if (slice.length === 0) return;
          const line = (m: (typeof slice)[number]): { speaker: string; text: string } => ({ speaker: m.isUser ? s.commander.name : m.name, text: m.text });
          if (slice.reduce((n, m) => n + estTokens(`${line(m).speaker}: ${line(m).text}`), 0) <= TUNING.memory.digestThresholdTokens) return;
          // the call, the record of a failure and the dispatch are the envelope's; a failed digest is quiet and the next exchange tries again
          await deps.generations.generate('scene.digest', `${scene.id}:${slice[slice.length - 1].index}`);
        } catch (e) {
          console.warn('[Alius] scene digest failed', e);
        } finally {
          digesting = false;
        }
      })());
    },

    async idle() {
      while (inflight.size > 0) await Promise.allSettled([...inflight]);
    },
  };
}
