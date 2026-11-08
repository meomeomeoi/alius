import type { CallTypeId } from './callTypes';

export interface LlmLogEntry {
  at: number;
  callType: CallTypeId;
  /** Connection profile id, or 'main'. */
  profile: string;
  maxTokens: number;
  prompt: string;
  raw: string;
  parsed?: unknown;
  ok: boolean;
  ms: number;
}

const CAPACITY = 50;

/** Ring buffer of the most recent LLM calls, oldest first. */
class LlmLog {
  private items: LlmLogEntry[] = [];

  push(e: LlmLogEntry): void {
    this.items.push(e);
    if (this.items.length > CAPACITY) this.items.shift();
  }

  entries(): LlmLogEntry[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}

export const llmLog = new LlmLog();
