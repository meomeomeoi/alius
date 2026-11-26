import type {
  GenAnswer, CardInfo, CharacterSummary, ChatInfo, ChatMessage, InjectionPosition, Lorebook, MemberInfo, ProfileInfo, StAdapter, StEvent,
} from './adapter';
import { hideRuns, unhideRuns } from './chat';

export interface ScriptedReply { avatar: string; name: string; text: string }

/** A queued reply that never answers: it settles only when the call's abort signal fires (see `hangNext`). */
const HANG = Symbol('hang');
type Hang = typeof HANG;

/** The fake's version of a request aborted by its signal (a real fetch rejects with the signal's reason). */
function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

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
  personaName = 'User';
  personaDescription = '';
  characters: CharacterSummary[] = [];
  groups = new Map<string, { name: string; members: string[] }>();
  lorebooks = new Map<string, Lorebook>();
  /** key `${avatar}:${label}` → url */
  sprites = new Map<string, string>();
  /** P10e-f: her stage folder per avatar: file name (with extension) → contents. Fill by hand to mimic files dropped there. */
  stageFiles = new Map<string, Map<string, Blob>>();
  private stageStamp = 0;
  failCreateGroup = false;
  failOpenGroup = false;
  /** Replies of `generateMain`, consumed in order: a string, a `GenAnswer` (`queueAnswer`) or a hang (`hangNext`). */
  mainReplies: Array<string | GenAnswer | Hang> = [];
  /** Replies of `generateWithProfile`; an `Error` makes the call throw. */
  profileReplies: Array<string | Error | GenAnswer | Hang> = [];
  calls: FakeCall[] = [];
  expressions: Array<{ avatar: string; label: string }> = [];
  toasts: Array<{ kind: 'info' | 'warn' | 'error'; text: string }> = [];
  settings: Record<string, unknown> = {};
  metadataSaves = 0;
  settingsSaves = 0;
  /** The chat the scene screen reads; filled by `sendUserMessage`. */
  chatMessages: Array<ChatMessage & { isSystem?: boolean }> = [];
  /** One entry per `sendUserMessage`: the replies the group gives, in order. */
  groupReplies: ScriptedReply[][] = [];
  /** Consumed by `swipeLast('right')` and `regenerateLast`. */
  swipeReplies: ScriptedReply[] = [];
  failSend = false;
  /** name or avatar → last expression label. */
  expressionsByName = new Map<string, string>();
  stopped = 0;
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

  /** Queues a structured answer (with a finish reason) for the main model, or for the mechanic profile when `profile` is true. */
  queueAnswer(a: GenAnswer, profile = false): void {
    (profile ? this.profileReplies : this.mainReplies).push(a);
  }

  /** Queues a call that never answers: it rejects with an `AbortError` when the call's signal fires, and hangs with no signal. */
  hangNext(profile = false): void {
    (profile ? this.profileReplies : this.mainReplies).push(HANG);
  }

  private settle(reply: string | Error | GenAnswer | Hang, signal?: AbortSignal): Promise<GenAnswer> {
    if (reply === HANG) {
      return new Promise<GenAnswer>((_, reject) => {
        if (signal?.aborted) return reject(abortError());
        signal?.addEventListener('abort', () => reject(abortError()), { once: true });
      });
    }
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(typeof reply === 'string' ? { text: reply } : reply);
  }

  async generateMain(req: { prompt: string; systemPrompt?: string; maxTokens: number; signal?: AbortSignal }): Promise<GenAnswer> {
    this.calls.push({ kind: 'main', maxTokens: req.maxTokens, system: req.systemPrompt, prompt: req.prompt });
    const reply = this.mainReplies.shift();
    if (reply === undefined) throw new Error('FakeStAdapter: no main reply queued');
    return this.settle(reply, req.signal);
  }

  async generateWithProfile(req: {
    profileId: string;
    system?: string;
    prompt: string;
    maxTokens: number;
    think: 'min' | 'low' | 'auto';
    signal?: AbortSignal;
  }): Promise<GenAnswer> {
    this.calls.push({
      kind: 'profile',
      maxTokens: req.maxTokens,
      think: req.think,
      profileId: req.profileId,
      system: req.system,
      prompt: req.prompt,
    });
    if (this.profileReplies.length === 0) throw new Error('FakeStAdapter: no profile reply queued');
    return this.settle(this.profileReplies.shift()!, req.signal);
  }

  listConnectionProfiles(): ProfileInfo[] {
    return this.profiles.map((p) => ({ ...p }));
  }

  getCharacterCard(avatar: string): CardInfo | null {
    return this.cards.get(avatar) ?? null;
  }

  getPersonaDescription(): string {
    return this.personaDescription;
  }

  getPersonaName(): string {
    return this.personaName;
  }

  listCharacters(): CharacterSummary[] {
    return this.characters.map((c) => ({ ...c }));
  }

  async loadCharacterCard(avatar: string): Promise<CardInfo | null> {
    return this.getCharacterCard(avatar);
  }

  getAvatarUrl(avatar: string): string {
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
  }

  async getSpriteUrl(avatar: string, label: string): Promise<string | null> {
    return this.sprites.get(`${avatar}:${label}`) ?? null;
  }

  async listSprites(avatar: string): Promise<string[]> {
    const prefix = `${avatar}:`;
    return [...this.sprites.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }

  async listStageFiles(avatar: string): Promise<Array<{ file: string; url: string }>> {
    const folder = this.stageFiles.get(avatar);
    if (folder === undefined) return [];
    const base = avatar.replace(/\.[^.]+$/, '');
    return [...folder.keys()]
      .filter((f) => /\.(png|webp|jpe?g|gif|avif)$/i.test(f)) // ST lists images only
      .map((f) => ({ file: f, url: `/characters/${base}/alius/${f}?t=${this.stageStamp}` }));
  }

  async fetchStageJson(avatar: string, file: string): Promise<unknown | null> {
    const blob = this.stageFiles.get(avatar)?.get(file);
    if (blob === undefined) return null;
    try { return JSON.parse(await blob.text()); } catch { console.warn(`[Alius] stage: ${file} of ${avatar} is not valid JSON, skipped`); return null; }
  }

  async uploadStageFile(avatar: string, baseName: string, data: Blob, ext: string): Promise<boolean> {
    let folder = this.stageFiles.get(avatar);
    if (folder === undefined) { folder = new Map(); this.stageFiles.set(avatar, folder); }
    this.dropStage(folder, baseName);
    folder.set(`${baseName}.${ext}`, data);
    this.stageStamp += 1;
    return true;
  }

  async deleteStageFile(avatar: string, baseName: string): Promise<boolean> {
    const folder = this.stageFiles.get(avatar);
    if (folder !== undefined) this.dropStage(folder, baseName);
    return true;
  }

  /** ST's replace rule: every file whose name without extension is `baseName`. */
  private dropStage(folder: Map<string, Blob>, baseName: string): void {
    for (const f of [...folder.keys()]) if (f.replace(/\.[^.]+$/, '') === baseName) folder.delete(f);
  }

  async createGroupChat(req: { name: string; members: string[] }): Promise<string> {
    if (this.failCreateGroup) throw new Error('FakeStAdapter: createGroupChat failed');
    const id = `g${this.groups.size + 1}`;
    this.groups.set(id, { name: req.name, members: [...req.members] });
    return id;
  }

  async openGroup(groupId: string): Promise<boolean> {
    const group = this.groups.get(groupId);
    if (this.failOpenGroup || !group) return false;
    this.members = group.members.map((avatar) => ({
      avatar, name: this.characters.find((c) => c.avatar === avatar)?.name ?? avatar, active: true,
    }));
    this.switchChat({ chatId: 'chat-' + groupId, isGroup: true, groupId });
    return true;
  }

  async addGroupMembers(avatars: string[]): Promise<void> {
    for (const avatar of avatars) {
      if (this.members.some((m) => m.avatar === avatar)) continue;
      const name = this.characters.find((c) => c.avatar === avatar)?.name ?? avatar;
      this.members.push({ avatar, name, active: true });
    }
  }

  listLorebooks(): string[] {
    return [...this.lorebooks.keys()];
  }

  async saveLorebook(book: Lorebook): Promise<void> {
    this.lorebooks.set(book.name, structuredClone(book));
  }

  setChatLorebook(name: string): void {
    this.writeMetadata('world_info', name);
  }

  setExpression(avatar: string, label: string): void {
    this.expressions.push({ avatar, label });
  }

  getChatMessages(from = 0): ChatMessage[] {
    // like the real chat: system (hidden) messages are skipped, indices stay the true ones
    return this.chatMessages.filter((m) => m.index >= from && m.isSystem !== true).map(({ isSystem: _s, ...m }) => m);
  }

  async hideMessages(from: number, to: number): Promise<Array<[number, number]>> {
    const runs = hideRuns(this.chatMessages.length, from, to, (i) => this.chatMessages[i]?.isSystem === true);
    for (const [a, b] of runs) for (let i = a; i <= b; i++) this.chatMessages[i].isSystem = true;
    return runs;
  }

  async unhideMessages(ranges: Array<[number, number]>): Promise<void> {
    // like `/unhide a-b`: every message of the (cut) range shows again, which is why callers pass only the runs they hid
    for (const [a, b] of unhideRuns(ranges, this.chatMessages.length)) for (let i = a; i <= b; i++) delete this.chatMessages[i].isSystem;
  }

  chatLength(): number {
    return this.chatMessages.length;
  }

  /** Consumes the next scripted group reply set without a user message. */
  async triggerReplies(): Promise<void> {
    if (this.failSend) throw new Error('FakeStAdapter: trigger failed');
    for (const r of this.groupReplies.shift() ?? []) {
      const index = this.chatMessages.length;
      this.chatMessages.push({ isUser: false, name: r.name, avatar: r.avatar, text: r.text, index, swipeId: 0 });
      this.emit('message_received', this.chatMessages[index]);
    }
    this.emit('group_wrapper_finished');
  }

  async sendUserMessage(text: string): Promise<void> {
    if (this.failSend) throw new Error('FakeStAdapter: send failed');
    const push = (m: Omit<ChatMessage, 'index' | 'swipeId'>): number => {
      const index = this.chatMessages.length;
      this.chatMessages.push({ ...m, index, swipeId: 0 });
      return index;
    };
    this.emit('message_sent', push({ isUser: true, name: this.personaName, text }));
    for (const r of this.groupReplies.shift() ?? []) {
      this.emit('message_received', push({ isUser: false, name: r.name, avatar: r.avatar, text: r.text }));
    }
    this.emit('group_wrapper_finished');
  }

  private lastReply(): ChatMessage | undefined {
    return [...this.chatMessages].reverse().find((m) => !m.isUser);
  }

  async regenerateLast(): Promise<void> {
    this.doSwipe('right');
  }

  async swipeLast(dir: 'left' | 'right'): Promise<void> {
    this.doSwipe(dir);
  }

  private doSwipe(dir: 'left' | 'right'): void {
    const last = this.lastReply();
    if (!last) return;
    const known = last.swipeCount ?? last.swipeId + 1; // an untouched reply has one swipe
    if (dir === 'right') {
      const next = this.swipeReplies.shift();
      if (!next) return;
      last.text = next.text;
      last.swipeId += 1;
      last.swipeCount = Math.max(known, last.swipeId + 1);
    } else {
      if (last.swipeId === 0) return;
      last.swipeId -= 1;
      last.swipeCount = known;
    }
    this.emit('message_swiped', last.index);
    this.emit('generation_ended');
  }

  stopGeneration(): void {
    this.stopped++;
  }

  async editMessage(index: number, text: string): Promise<void> {
    const m = this.chatMessages.find((x) => x.index === index);
    if (!m) throw new Error(`FakeStAdapter: no such message ${index}`);
    m.text = text;
    this.emit('message_edited', index);
  }

  async getLastExpression(name: string): Promise<string | null> {
    return this.expressionsByName.get(name) ?? null;
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
