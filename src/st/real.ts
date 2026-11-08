// The only file (besides index.ts) that touches SillyTavern.
import { editGroup } from 'st:group-chats';
import { answerText } from '../llm/text';
import type {
  CardInfo, ChatInfo, InjectionPosition, MemberInfo, ProfileInfo, StAdapter, StEvent,
} from './adapter';
import { reasoningPayload } from './reasoning';

/** The slice of SillyTavern.getContext() that Alius uses. */
interface StContext {
  chatId?: string;
  groupId?: string | null;
  groups: Array<{ id: string; members: string[]; disabled_members?: string[] }>;
  characters: Array<Record<string, any>>;
  chatMetadata: Record<string, unknown>;
  saveMetadata(): Promise<void>;
  extensionSettings: Record<string, any>;
  saveSettingsDebounced(): void;
  eventSource: { on(event: string, fn: (...a: unknown[]) => void): void };
  eventTypes: Record<string, string>;
  setExtensionPrompt(key: string, value: string, position: number, depth: number, scan?: boolean, role?: number): void;
  generateRawData(opts: { prompt: string; systemPrompt?: string; responseLength?: number }): Promise<unknown>;
  ConnectionManagerRequestService: {
    sendRequest(
      profileId: string,
      messages: Array<{ role: string; content: string }>,
      maxTokens: number,
      custom: Record<string, unknown>,
      overridePayload?: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

const ctx = (): StContext => (globalThis as any).SillyTavern.getContext() as StContext;

const POSITION: Record<InjectionPosition, number> = { in_prompt: 0, in_chat: 1, before_prompt: 2 };
const EVENT: Record<StEvent, string> = {
  chat_changed: 'CHAT_CHANGED',
  message_sent: 'MESSAGE_SENT',
  message_received: 'MESSAGE_RECEIVED',
  generation_started: 'GENERATION_STARTED',
};

function currentGroup(c: StContext) {
  return c.groupId ? c.groups.find((g) => g.id === c.groupId) : undefined;
}

export class RealStAdapter implements StAdapter {
  getActiveChat(): ChatInfo | null {
    const c = ctx();
    if (!c.chatId) return null;
    return c.groupId ? { chatId: c.chatId, isGroup: true, groupId: c.groupId } : { chatId: c.chatId, isGroup: false };
  }

  getGroupMembers(): MemberInfo[] {
    const c = ctx();
    const g = currentGroup(c);
    if (!g) return [];
    const disabled = new Set(g.disabled_members ?? []);
    return g.members.map((avatar) => ({
      avatar,
      name: c.characters.find((ch) => ch.avatar === avatar)?.name ?? avatar,
      active: !disabled.has(avatar),
    }));
  }

  async setMembersActive(activeAvatars: string[]): Promise<void> {
    const g = currentGroup(ctx());
    if (!g) return;
    const active = new Set(activeAvatars);
    const nextDisabled = g.members.filter((m) => !active.has(m));
    const prev = g.disabled_members ?? [];
    const same = prev.length === nextDisabled.length && nextDisabled.every((m) => prev.includes(m));
    if (same) return;
    g.disabled_members = nextDisabled;
    await editGroup(g.id, true, false);
  }

  readMetadata(key: string): unknown {
    return ctx().chatMetadata?.[key];
  }

  writeMetadata(key: string, value: unknown): void {
    const meta = ctx().chatMetadata;
    if (meta) meta[key] = value;
  }

  async saveMetadata(): Promise<void> {
    await ctx().saveMetadata();
  }

  on(event: StEvent, fn: (...a: unknown[]) => void): void {
    const c = ctx();
    c.eventSource.on(c.eventTypes[EVENT[event]], fn);
  }

  setInjection(id: string, text: string, position: InjectionPosition, depth: number): void {
    ctx().setExtensionPrompt(`alius_${id}`, text, POSITION[position], depth, false, 0);
  }

  async generateMain(req: { prompt: string; systemPrompt?: string; maxTokens: number }): Promise<string> {
    const res = await ctx().generateRawData({
      prompt: req.prompt,
      systemPrompt: req.systemPrompt,
      responseLength: req.maxTokens,
    });
    return answerText(res);
  }

  async generateWithProfile(req: {
    profileId: string;
    system?: string;
    prompt: string;
    maxTokens: number;
    think: 'min' | 'low' | 'auto';
  }): Promise<string> {
    const c = ctx();
    const api = this.listConnectionProfiles().find((p) => p.id === req.profileId)?.api ?? '';
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      { role: 'user', content: req.prompt },
    ];
    const opts = { stream: false, extractData: true, includePreset: false, includeInstruct: false };
    const send = (payload: Record<string, unknown>) =>
      c.ConnectionManagerRequestService.sendRequest(req.profileId, messages, req.maxTokens, opts, payload);

    const payload = reasoningPayload(api, req.think);
    try {
      return answerText(await send(payload));
    } catch (e) {
      if (Object.keys(payload).length === 0) throw e;
      // Some providers reject the reasoning override: retry once without it.
      return answerText(await send({}));
    }
  }

  listConnectionProfiles(): ProfileInfo[] {
    const profiles = ctx().extensionSettings?.connectionManager?.profiles;
    if (!Array.isArray(profiles)) return [];
    return profiles.map((p: Record<string, any>) => ({
      id: String(p.id),
      name: String(p.name ?? p.id),
      api: String(p.api ?? ''),
      model: String(p.model ?? ''),
    }));
  }

  getCharacterCard(avatar: string): CardInfo | null {
    const ch = ctx().characters.find((x) => x.avatar === avatar);
    if (!ch) return null;
    return {
      avatar,
      name: String(ch.name ?? ''),
      description: String(ch.description ?? ch.data?.description ?? ''),
      personality: String(ch.personality ?? ch.data?.personality ?? ''),
      scenario: String(ch.scenario ?? ch.data?.scenario ?? ''),
      creatorNotes: String(ch.data?.creator_notes ?? ch.creatorcomment ?? ''),
    };
  }

  setExpression(avatar: string, label: string): void {
    // Not wired in P0: no verified ST API yet, and nothing calls it. Expressions land with P3.
    console.warn(`[Alius] setExpression(${avatar}, ${label}) is not implemented yet`);
  }

  getSettings(): Record<string, unknown> {
    const c = ctx();
    c.extensionSettings.alius ??= {};
    return c.extensionSettings.alius as Record<string, unknown>;
  }

  saveSettings(): void {
    ctx().saveSettingsDebounced();
  }

  toast(kind: 'info' | 'warn' | 'error', text: string): void {
    const t = (globalThis as any).toastr;
    const fn = t?.[kind === 'warn' ? 'warning' : kind];
    if (typeof fn === 'function') fn.call(t, text, 'Alius');
    else console[kind === 'info' ? 'info' : kind === 'warn' ? 'warn' : 'error'](`[Alius] ${text}`);
  }
}
