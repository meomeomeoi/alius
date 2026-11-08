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
export interface ProfileInfo { id: string; name: string; api: string; model: string }

export type StEvent = 'chat_changed' | 'message_sent' | 'message_received' | 'generation_started';

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
  setExpression(avatar: string, label: string): void;
  /** extensionSettings.alius (created if missing). */
  getSettings(): Record<string, unknown>;
  saveSettings(): void;
  toast(kind: 'info' | 'warn' | 'error', text: string): void;
}
