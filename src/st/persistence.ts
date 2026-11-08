import { createCampaign } from '../engine/state/create';
import { migrate, type MigrateResult } from '../engine/state/migrations';
import type { CampaignState } from '../engine/state/types';
import type { StAdapter } from './adapter';

export const METADATA_KEY = 'alius';

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; state: CampaignState; chatId: string }
  | { kind: 'readonly'; reason: string; chatId: string };

/** A chat is an Alius campaign iff its metadata has the `alius` key. */
export function loadCampaign(st: StAdapter): LoadResult {
  const chat = st.getActiveChat();
  if (!chat) return { kind: 'none' };
  const raw = st.readMetadata(METADATA_KEY);
  if (raw === undefined) return { kind: 'none' };
  const r = migrate(raw);
  if (r.ok) return { kind: 'ok', state: r.state, chatId: chat.chatId };
  return { kind: 'readonly', reason: r.detail, chatId: chat.chatId };
}

type TargetProblem = 'no_chat' | 'not_group' | 'exists' | 'chat_changed';

/** Can a new campaign be written into the open chat? `expectChatId` also pins which chat that must be. */
function checkNewCampaignTarget(st: StAdapter, expectChatId?: string): TargetProblem | null {
  const chat = st.getActiveChat();
  if (!chat) return 'no_chat';
  if (expectChatId !== undefined && chat.chatId !== expectChatId) return 'chat_changed';
  if (!chat.isGroup) return 'not_group';
  if (st.readMetadata(METADATA_KEY) !== undefined) return 'exists';
  return null;
}

export function initCampaign(
  st: StAdapter,
  opts: { seed: number; commanderName: string },
): { ok: true; state: CampaignState } | { ok: false; reason: 'not_group' | 'exists' | 'no_chat' } {
  const problem = checkNewCampaignTarget(st) as 'no_chat' | 'not_group' | 'exists' | null;
  if (problem) return { ok: false, reason: problem };
  const state = createCampaign(opts);
  st.writeMetadata(METADATA_KEY, state);
  st.saveMetadata().catch((e) => console.warn('[Alius] saving new campaign failed', e));
  return { ok: true, state };
}

/**
 * Writes a finished campaign into the chat it was built for and waits until ST has saved it.
 * Refuses a chat that is not `expectChatId`, is not a group, or already has Alius data.
 * If the save fails the state is removed again and the error is rethrown.
 */
export async function writeNewCampaign(
  st: StAdapter,
  state: CampaignState,
  expectChatId: string,
): Promise<{ ok: true } | { ok: false; reason: TargetProblem }> {
  const problem = checkNewCampaignTarget(st, expectChatId);
  if (problem) return { ok: false, reason: problem };
  st.writeMetadata(METADATA_KEY, state);
  try {
    await st.saveMetadata();
  } catch (e) {
    st.writeMetadata(METADATA_KEY, undefined);
    throw e;
  }
  return { ok: true };
}

/**
 * Debounced writer bound to one chat. A pending write is dropped (never redirected)
 * if the open chat changed, and a campaign that failed to load is never overwritten.
 */
export function createSaver(
  st: StAdapter,
  chatId: string,
  debounceMs = 500,
): { save(state: CampaignState): void; flush(): Promise<void>; dispose(): void } {
  let pending: CampaignState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = async (): Promise<void> => {
    clearTimer();
    const state = pending;
    pending = null;
    if (!state) return;
    if (st.getActiveChat()?.chatId !== chatId) {
      console.warn(`[Alius] dropped pending save: chat ${chatId} is no longer open`);
      return;
    }
    if (loadCampaign(st).kind === 'readonly') {
      console.warn('[Alius] refused to save: campaign metadata is read-only (corrupt or from a newer version)');
      return;
    }
    st.writeMetadata(METADATA_KEY, state);
    await st.saveMetadata();
  };

  return {
    save(state) {
      pending = structuredClone(state);
      clearTimer();
      timer = setTimeout(() => {
        flush().catch((e) => console.warn('[Alius] save failed', e));
      }, debounceMs);
    },
    flush,
    dispose() {
      clearTimer();
      pending = null;
    },
  };
}

export function exportCampaign(state: CampaignState): string {
  return JSON.stringify(state, null, 2);
}

export function importCampaign(text: string): MigrateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'invalid', detail: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  return migrate(raw);
}
