// The only file (besides index.ts) that touches SillyTavern.
import { editGroup, openGroupById } from 'st:group-chats';
import { newWorldInfoEntryTemplate } from 'st:world-info';
import { answerText } from '../llm/text';
import type {
  CardInfo, CharacterSummary, ChatInfo, InjectionPosition, Lorebook, MemberInfo, ProfileInfo, StAdapter, StEvent,
} from './adapter';
import { toStLorebook } from './lorebook';
import { pickSprite, spriteFolder } from './sprites';
import { connectionProfiles } from './profiles';
import { reasoningPayload } from './reasoning';

/** The slice of SillyTavern.getContext() that Alius uses. */
interface StContext {
  chatId?: string;
  name1?: string;
  getThumbnailUrl(type: string, file: string): string;
  getRequestHeaders(): Record<string, string>;
  getCharacters(): Promise<void>;
  unshallowCharacter(index: number): Promise<void>;
  getWorldInfoNames(): string[];
  saveWorldInfo(name: string, data: unknown, immediately?: boolean): Promise<void>;
  updateWorldInfoList(): Promise<void>;
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
    const c = ctx();
    return connectionProfiles(c.extensionSettings, !!c.ConnectionManagerRequestService);
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

  getPersonaName(): string {
    return String(ctx().name1 ?? '');
  }

  listCharacters(): CharacterSummary[] {
    return ctx().characters.map((c) => ({ avatar: String(c.avatar ?? ''), name: String(c.name ?? '') }));
  }

  async loadCharacterCard(avatar: string): Promise<CardInfo | null> {
    const c = ctx();
    const index = c.characters.findIndex((x) => x.avatar === avatar);
    if (index < 0) return null;
    if (c.characters[index].shallow) await c.unshallowCharacter(index);
    return this.getCharacterCard(avatar);
  }

  getAvatarUrl(avatar: string): string {
    return ctx().getThumbnailUrl('avatar', avatar);
  }

  async getSpriteUrl(avatar: string, label: string): Promise<string | null> {
    const c = ctx();
    const ch = c.characters.find((x) => x.avatar === avatar);
    if (!ch) return null;
    const folder = spriteFolder(avatar, String(ch.name ?? ''), c.extensionSettings.expressionOverrides);
    try {
      const res = await fetch(`/api/sprites/get?name=${encodeURIComponent(folder)}`, { headers: c.getRequestHeaders() });
      if (!res.ok) return null;
      return pickSprite(await res.json(), label);
    } catch {
      return null;
    }
  }

  async createGroupChat(req: { name: string; members: string[] }): Promise<string> {
    const c = ctx();
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: c.getRequestHeaders(),
      body: JSON.stringify({
        name: req.name,
        members: req.members,
        avatar_url: 'img/ai4.png',
        allow_self_responses: false,
        activation_strategy: 0,
        generation_mode: 0,
        disabled_members: [],
        fav: false,
      }),
    });
    if (!res.ok) throw new Error(`group creation failed (HTTP ${res.status})`);
    const group = (await res.json()) as { id?: string };
    if (!group.id) throw new Error('group creation returned no id');
    await c.getCharacters(); // also reloads the groups list
    return String(group.id);
  }

  async openGroup(groupId: string): Promise<boolean> {
    await openGroupById(groupId);
    return ctx().groupId === groupId;
  }

  async addGroupMembers(avatars: string[]): Promise<void> {
    const g = currentGroup(ctx());
    if (!g) return;
    const missing = avatars.filter((a) => !g.members.includes(a));
    if (missing.length === 0) return;
    g.members.push(...missing);
    await editGroup(g.id, true, false);
  }

  listLorebooks(): string[] {
    return [...ctx().getWorldInfoNames()];
  }

  async saveLorebook(book: Lorebook): Promise<void> {
    const c = ctx();
    await c.saveWorldInfo(book.name, toStLorebook(book, newWorldInfoEntryTemplate), true);
    await c.updateWorldInfoList();
  }

  setChatLorebook(name: string): void {
    this.writeMetadata('world_info', name);
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
