import type { CallTypeId } from './callTypes';
import type { FailReason } from './orchestrator';

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
  /** P14: why the attempt failed (absent on a success). */
  reason?: FailReason;
  /** P14: the answer arrived after the call had already timed out and was ignored. */
  late?: true;
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
