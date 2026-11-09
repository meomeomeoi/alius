import { z } from 'zod';
import { enemyNameKey, isEnemyName } from '../../engine/combat/spawn';
import { GENERATED_NAME, GRUNT_BIO_MAX } from '../../engine/grunts';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { registerCallType } from '../callTypes';
import { callLlm } from '../orchestrator';

export interface FlavorKind {
  system(input: unknown): string;
  prompt(input: unknown): string;
}

const kinds = new Map<string, FlavorKind>();

/** The `flavor` call type serves every "name or describe a generated thing" need; each package adds its kind. */
export function registerFlavorKind(kind: string, impl: FlavorKind): void {
  if (kinds.has(kind)) throw new Error(`Duplicate flavor kind: ${kind}`);
  kinds.set(kind, impl);
}

const kindOf = (input: unknown): FlavorKind | undefined => kinds.get(String((input as { kind?: unknown })?.kind));

registerCallType<Record<string, unknown>>({
  id: 'flavor',
  profile: 'mechanic',
  json: true,
  system: (input) => kindOf(input)?.system(input) ?? 'Reply with a single JSON object and nothing else.',
  prompt: (input) => kindOf(input)?.prompt(input) ?? '{}',
  schema: z.object({}).passthrough(),
});

/** Returns the model's JSON object, or null when the kind is unknown or the call failed. */
export async function generateFlavor<T extends { kind: string }>(
  input: T, deps: { st: StAdapter; settings: AliusSettings },
): Promise<Record<string, unknown> | null> {
  if (!kinds.has(input.kind)) return null;
  const r = await callLlm<Record<string, unknown>>('flavor', input, deps);
  return r.ok ? r.value : null;
}

// --- grunt kind -----------------------------------------------------------------------------

export interface GruntFlavorInput {
  kind: 'grunt';
  designation: string;
  roleName: string;
  defectName: string;
}

registerFlavorKind('grunt', {
  system: () =>
    [
      'You name a freshly recruited conscript soldier for a dark, near-future squad-command RPG.',
      'Reply with a single JSON object and nothing else: {"name": "<given name or call sign>", "bio": "<one sentence about her>"}',
      `The name is 1 to 2 words, letters only. The bio is at most ${GRUNT_BIO_MAX} characters. Write in English. Do not mention numbers or game stats.`,
    ].join('\n'),
  prompt: (raw) => {
    const i = raw as GruntFlavorInput;
    return `Designation: ${i.designation}\nRole: ${i.roleName}\nDefect: ${i.defectName}\nName her and give her a bio.`;
  },
});

/** Applies the same limits as `squad/set_flavor`; anything unusable → null. */
export function sanitizeGruntFlavor(raw: unknown): { name: string; bio: string } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!GENERATED_NAME.test(name)) return null;
  const bio = typeof r.bio === 'string' ? r.bio.replace(/\s+/g, ' ').trim().slice(0, GRUNT_BIO_MAX).trim() : '';
  return { name, bio };
}

export async function generateGruntFlavor(
  input: GruntFlavorInput, deps: { st: StAdapter; settings: AliusSettings },
): Promise<{ name: string; bio: string } | null> {
  return sanitizeGruntFlavor(await generateFlavor(input, deps));
}

// --- enemy kind (P4) ---------------------------------------------------------------------------

export interface EnemyFlavorInput {
  kind: 'enemy';
  archetypeName: string;
  categoryName: string;
  affixNames: string[];
}

export { enemyNameKey };

registerFlavorKind('enemy', {
  system: () =>
    [
      'You name an enemy for a dark, near-future squad-command RPG.',
      'Reply with a single JSON object and nothing else: {"name": "<enemy name>"}',
      'The name is 1 to 3 words of letters, spaces and hyphens, at most 32 characters. Write in English. Do not mention numbers or game stats.',
    ].join('\n'),
  prompt: (raw) => {
    const i = raw as EnemyFlavorInput;
    return `Archetype: ${i.archetypeName}\nCategory: ${i.categoryName}\nTraits: ${i.affixNames.join(', ') || 'none'}\nGive this enemy a fitting name.`;
  },
});

/** A usable name or null: anything with prose, digits or more than 32 characters fails soft. */
export function sanitizeEnemyFlavor(raw: unknown): { name: string } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const name = typeof (raw as Record<string, unknown>).name === 'string' ? ((raw as Record<string, unknown>).name as string).trim() : '';
  return isEnemyName(name) ? { name } : null;
}

export async function generateEnemyFlavor(
  input: EnemyFlavorInput, deps: { st: StAdapter; settings: AliusSettings },
): Promise<{ name: string } | null> {
  return sanitizeEnemyFlavor(await generateFlavor(input, deps));
}
