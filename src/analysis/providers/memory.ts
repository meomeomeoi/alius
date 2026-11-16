import { registerKnowledgeRule } from '../knowledge';

/**
 * Memory readings (P3b). Chunk (b) adds the live readings; for now this registers the knowledge rule: a fact the commander
 * does not know (`hiddenFromCommander`, written by P12) is never shown by `Knowledge`, so no reading, MEMORY view or LOG lists it.
 * Called from `registerCoreProviders`.
 */
export function registerMemoryProviders(): void {
  registerKnowledgeRule({ fact: (f) => f.hiddenFromCommander !== true });
}
