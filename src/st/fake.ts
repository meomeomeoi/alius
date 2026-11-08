import type {
  CardInfo, ChatInfo, InjectionPosition, MemberInfo, ProfileInfo, StAdapter, StEvent,
} from './adapter';

export interface FakeCall {
  kind: 'main' | 'profile';
  maxTokens: number;
  think?: 'min' | 'low' | 'auto';
  profileId?: string;
  system?: string;
  prompt: string;
}

/** In-memory StAdapter for tests and development. */
export class FakeStAdapter implements StAdapter {
  chat: ChatInfo | null;
  metadataByChat = new Map<string, Record<string, unknown>>();
  injections = new Map<string, { text: string; position: InjectionPosition; depth: number }>();
  profiles: ProfileInfo[] = [];
  members: MemberInfo[] = [];
  cards = new Map<string, CardInfo>();
  mainReplies: string[] = [];
  profileReplies: (string | Error)[] = [];
  calls: FakeCall[] = [];
  expressions: Array<{ avatar: string; label: string }> = [];
  toasts: Array<{ kind: 'info' | 'warn' | 'error'; text: string }> = [];
  settings: Record<string, unknown> = {};
  metadataSaves = 0;
  settingsSaves = 0;
  private handlers = new Map<StEvent, Array<(...a: unknown[]) => void>>();

  constructor(chat: ChatInfo | null = null) {
    this.chat = chat;
  }

  /** Test helper: change the open chat and fire `chat_changed`. */
  switchChat(info: ChatInfo | null): void {
    this.chat = info;
    this.emit('chat_changed');
  }

  /** Test helper: fire an event to registered handlers. */
  emit(event: StEvent, ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }

  getActiveChat(): ChatInfo | null {
    return this.chat;
  }

  getGroupMembers(): MemberInfo[] {
    return this.members.map((m) => ({ ...m }));
  }

  async setMembersActive(activeAvatars: string[]): Promise<void> {
    const active = new Set(activeAvatars);
    this.members = this.members.map((m) => ({ ...m, active: active.has(m.avatar) }));
  }

  private meta(create: boolean): Record<string, unknown> | undefined {
    if (!this.chat) return undefined;
    let m = this.metadataByChat.get(this.chat.chatId);
    if (!m && create) {
      m = {};
      this.metadataByChat.set(this.chat.chatId, m);
    }
    return m;
  }

  readMetadata(key: string): unknown {
    return this.meta(false)?.[key];
  }

  writeMetadata(key: string, value: unknown): void {
    const m = this.meta(true);
    if (m) m[key] = value;
  }

  async saveMetadata(): Promise<void> {
    this.metadataSaves++;
  }

  on(event: StEvent, fn: (...a: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
  }

  setInjection(id: string, text: string, position: InjectionPosition, depth: number): void {
    if (text === '') this.injections.delete(id);
    else this.injections.set(id, { text, position, depth });
  }

  async generateMain(req: { prompt: string; systemPrompt?: string; maxTokens: number }): Promise<string> {
    this.calls.push({ kind: 'main', maxTokens: req.maxTokens, system: req.systemPrompt, prompt: req.prompt });
    const reply = this.mainReplies.shift();
    if (reply === undefined) throw new Error('FakeStAdapter: no main reply queued');
    return reply;
  }

  async generateWithProfile(req: {
    profileId: string;
    system?: string;
    prompt: string;
    maxTokens: number;
    think: 'min' | 'low' | 'auto';
  }): Promise<string> {
    this.calls.push({
      kind: 'profile',
      maxTokens: req.maxTokens,
      think: req.think,
      profileId: req.profileId,
      system: req.system,
      prompt: req.prompt,
    });
    if (this.profileReplies.length === 0) throw new Error('FakeStAdapter: no profile reply queued');
    const reply = this.profileReplies.shift()!;
    if (reply instanceof Error) throw reply;
    return reply;
  }

  listConnectionProfiles(): ProfileInfo[] {
    return this.profiles.map((p) => ({ ...p }));
  }

  getCharacterCard(avatar: string): CardInfo | null {
    return this.cards.get(avatar) ?? null;
  }

  setExpression(avatar: string, label: string): void {
    this.expressions.push({ avatar, label });
  }

  getSettings(): Record<string, unknown> {
    return this.settings;
  }

  saveSettings(): void {
    this.settingsSaves++;
  }

  toast(kind: 'info' | 'warn' | 'error', text: string): void {
    this.toasts.push({ kind, text });
  }
}
