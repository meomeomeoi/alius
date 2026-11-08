import { z } from 'zod';

export const CALL_TYPE_IDS = [
  'profile_import', 'intent_extract', 'scene_summary', 'dilemma_generate', 'director_tick',
  'flavor', 'dm_reply', 'expedition_recap', 'emotion_pick', 'ping',
] as const;

export type CallTypeId = (typeof CALL_TYPE_IDS)[number];

export interface CallType<T = unknown> {
  id: CallTypeId;
  profile: 'main' | 'mechanic';
  /** True if the answer is JSON validated by `schema`; false for free text. */
  json: boolean;
  system(input: unknown): string;
  prompt(input: unknown): string;
  schema?: z.ZodType<T>;
}

const registry = new Map<CallTypeId, CallType<any>>();

export function registerCallType<T>(ct: CallType<T>): void {
  if (registry.has(ct.id)) throw new Error(`Duplicate call type: ${ct.id}`);
  registry.set(ct.id, ct);
}

export function getCallType(id: CallTypeId): CallType<any> | undefined {
  return registry.get(id);
}

// P0 registers only the test call type; later packages register the rest.
const PingSchema = z.object({ pong: z.literal(true), echo: z.string() });

registerCallType<z.infer<typeof PingSchema>>({
  id: 'ping',
  profile: 'mechanic',
  json: true,
  system: () => 'You are a JSON-only responder. Reply with a single JSON object and nothing else.',
  prompt: (input) => `Return {"pong": true, "echo": ${JSON.stringify(String(input ?? ''))}}`,
  schema: PingSchema,
});
