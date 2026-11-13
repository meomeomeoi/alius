import type { Registries } from '../content/types';
import { BODY_STATS, DESCRIPTORS, defaultCommanderSetup, poolSpent, type CommanderSetup, type DescriptorKind } from '../engine/commander/profile';
import { TUNING } from '../engine/tuning';
import '../llm/calls/commanderImport'; // registers the call type
import type { CommanderImportInput } from '../llm/calls/commanderImport';
import { callLlm } from '../llm/orchestrator';
import type { AliusSettings } from '../settings';
import type { StAdapter } from '../st/adapter';

/** Persona text is cut to this many characters before it is sent. */
const PERSONA_CHARS = 6000;

export interface ImportedCommander {
  setup: CommanderSetup;
  /** Why the model picked each trait, by trait id. */
  reasons: Record<string, string>;
  notes: string;
}
export type CommanderImportOutcome = { kind: 'ok'; result: ImportedCommander } | { kind: 'manual'; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cap = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim().slice(0, max) : '');

/** A descriptor word (case-insensitive) → its value 1–5, or null for anything else (a number is not a descriptor). */
function valueOf(kind: DescriptorKind, v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const i = DESCRIPTORS[kind].findIndex((d) => d.toLowerCase() === v.trim().toLowerCase());
  return i < 0 ? null : i + 1;
}

/** Order in which a stat is lowered when the pool is exceeded and several are the highest. */
const LOWER_ORDER = ['reflexes', 'endurance', 'strength'] as const;

/**
 * Turns whatever the model returned into a commander the creation rules accept: descriptors → values (unknown → the
 * default), each body stat at most 4, then the highest stat is lowered until the pool of 7 is respected; traits are
 * known, regular, unique, at most 2, and the first of an exclusive pair wins. Never throws.
 */
export function sanitizeCommanderImport(raw: unknown, reg: Registries): ImportedCommander {
  const src = isObj(raw) ? raw : {};
  const setup = defaultCommanderSetup();
  for (const k of BODY_STATS) {
    const v = valueOf(k, src[k]);
    if (v !== null) setup.body[k] = Math.min(TUNING.commander.creationMax, v);
  }
  while (poolSpent(setup.body) > TUNING.commander.pool) {
    const top = Math.max(...BODY_STATS.map((k) => setup.body[k]));
    const k = LOWER_ORDER.find((x) => setup.body[x] === top)!;
    setup.body[k] -= 1;
  }
  setup.expression = valueOf('expression', src.expression) ?? setup.expression;
  setup.seasoning = valueOf('seasoning', src.seasoning) ?? setup.seasoning;

  const reasons: Record<string, string> = {};
  for (const item of Array.isArray(src.traits) ? src.traits : []) {
    if (setup.traits.regular.length >= TUNING.commander.maxRegular) break;
    const id = isObj(item) && typeof item.id === 'string' ? item.id : null;
    const t = id === null ? undefined : reg.commanderTraits.get(id);
    if (!id || !t || t.kind !== 'regular' || setup.traits.regular.includes(id)) continue;
    const excluded = setup.traits.regular.some((kept) => ((t.exclusiveWith as string[] | undefined) ?? []).includes(kept)
      || ((reg.commanderTraits.get(kept)?.exclusiveWith as string[] | undefined) ?? []).includes(id));
    if (excluded) continue;
    setup.traits.regular.push(id);
    reasons[id] = cap((item as Record<string, unknown>).reason, 200);
  }
  return { setup, reasons, notes: cap(src.notes, 300) };
}

/** Whether the model's answer said anything usable (a recognised descriptor or a trait). */
const usable = (raw: unknown, result: ImportedCommander): boolean =>
  isObj(raw) && (['strength', 'endurance', 'reflexes', 'expression', 'seasoning'] as const).some((k) => valueOf(k, raw[k]) !== null)
  || result.setup.traits.regular.length > 0;

/** Persona → candidate commander. Any failure becomes `manual` (the wizard then offers the form); never throws. */
export async function importCommander(
  st: StAdapter, deps: { settings: AliusSettings; registries: Registries },
): Promise<CommanderImportOutcome> {
  const { settings, registries } = deps;
  try {
    const description = st.getPersonaDescription().trim().slice(0, PERSONA_CHARS);
    if (description === '') return { kind: 'manual', reason: 'the persona has no description' };
    const input: CommanderImportInput = {
      persona: { name: st.getPersonaName(), description },
      traits: [...registries.commanderTraits.values()]
        .filter((t) => t.kind === 'regular')
        .map((t) => ({ id: String(t.id), upside: String(t.upside), downside: String(t.downside) })),
    };
    const r = await callLlm<unknown>('commander_import', input, { st, settings });
    if (!r.ok) return { kind: 'manual', reason: r.detail || r.reason };
    const result = sanitizeCommanderImport(r.value, registries);
    if (!usable(r.value, result)) return { kind: 'manual', reason: "no usable commander profile in the model's answer" };
    return { kind: 'ok', result };
  } catch (e) {
    return { kind: 'manual', reason: e instanceof Error ? e.message : String(e) };
  }
}
