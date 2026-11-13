export type InjectionPosition = 'in_prompt' | 'in_chat' | 'before_prompt';
export interface ChatInfo { chatId: string; isGroup: boolean; groupId?: string }
export interface MemberInfo { avatar: string; name: string; active: boolean }
export interface CardInfo {
  avatar: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  creatorNotes: string;
}
export interface CharacterSummary { avatar: string; name: string }
export interface LorebookEntry { key: string[]; comment: string; content: string; constant: boolean; order?: number }
export interface Lorebook { name: string; entries: LorebookEntry[] }
export interface ProfileInfo { id: string; name: string; api: string; model: string }

/** One chat message as Alius sees it; `index` is the message's index in the ST chat. */
export interface ChatMessage {
  index: number;
  isUser: boolean;
  name: string;
  /** Avatar file of the speaking character (group chats); absent for the user. */
  avatar?: string;
  text: string;
  swipeId: number;
}

export type StEvent =
  | 'chat_changed' | 'message_sent' | 'message_received' | 'generation_started'
  | 'message_swiped' | 'message_deleted' | 'message_edited' | 'generation_ended' | 'group_wrapper_finished';

/** The only surface through which the rest of Alius touches SillyTavern. */
export interface StAdapter {
  getActiveChat(): ChatInfo | null;
  getGroupMembers(): MemberInfo[];
  setMembersActive(activeAvatars: string[]): Promise<void>;
  readMetadata(key: string): unknown;
  writeMetadata(key: string, value: unknown): void;
  saveMetadata(): Promise<void>;
  on(event: StEvent, fn: (...a: unknown[]) => void): void;
  /** Empty text clears the injection. */
  setInjection(id: string, text: string, position: InjectionPosition, depth: number): void;
  generateMain(req: { prompt: string; systemPrompt?: string; maxTokens: number }): Promise<string>;
  generateWithProfile(req: {
    profileId: string;
    system?: string;
    prompt: string;
    maxTokens: number;
    think: 'min' | 'low' | 'auto';
  }): Promise<string>;
  listConnectionProfiles(): ProfileInfo[];
  getCharacterCard(avatar: string): CardInfo | null;
  getPersonaName(): string;
  /** The active persona's description text (P7 `commander_import`); empty when there is none. */
  getPersonaDescription(): string;
  listCharacters(): CharacterSummary[];
  /** Like getCharacterCard, but loads a lazily-loaded (shallow) character first. */
  loadCharacterCard(avatar: string): Promise<CardInfo | null>;
  getAvatarUrl(avatar: string): string;
  getSpriteUrl(avatar: string, label: string): Promise<string | null>;
  /** Creates a group chat; resolves with the new group id. Rejects on failure. */
  createGroupChat(req: { name: string; members: string[] }): Promise<string>;
  /** Opens the group's current chat; resolves false if ST refused. */
  openGroup(groupId: string): Promise<boolean>;
  /** Adds avatars to the open group (no-op for avatars already in it). */
  addGroupMembers(avatars: string[]): Promise<void>;
  listLorebooks(): string[];
  saveLorebook(book: Lorebook): Promise<void>;
  /** Binds a lorebook to the open chat (metadata only; persisted by the next saveMetadata). */
  setChatLorebook(name: string): void;
  /**
   * Sets a character's expression through the Expressions extension. ST's command targets the speaker of the last
   * character message, so this only acts when that is `avatar`; Alius' own scene screen does not depend on it.
   */
  setExpression(avatar: string, label: string): void;
  /** Chat messages from index `from` (default 0); system messages are skipped. Message events pass the index. */
  getChatMessages(from?: number): ChatMessage[];
  /** Length of the ST chat array (the next message gets this index). */
  chatLength(): number;
  /** Adds the user message and resolves when the group's (or the character's) replies are done. Rejects on failure. */
  sendUserMessage(text: string): Promise<void>;
  /** Regenerates the last reply as a new swipe. */
  regenerateLast(): Promise<void>;
  swipeLast(dir: 'left' | 'right'): Promise<void>;
  stopGeneration(): void;
  /** Rewrites a chat message's text (the active swipe too), redraws it in ST, saves the chat and fires `message_edited`. Rejects for an unknown index. */
  editMessage(index: number, text: string): Promise<void>;
  /** The last expression label ST's Expressions extension set for a character (name or avatar key), or null. */
  getLastExpression(name: string): Promise<string | null>;
  /** extensionSettings.alius (created if missing). */
  getSettings(): Record<string, unknown>;
  saveSettings(): void;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
}
