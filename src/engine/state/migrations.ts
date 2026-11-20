import { z } from 'zod';
import { createCampaign } from './create';
import type { CampaignState } from './types';

export const CURRENT_VERSION = 1;

export type MigrateResult =
  | { ok: true; state: CampaignState; migratedFrom: number }
  | { ok: false; reason: 'invalid' | 'future_version'; version?: number; detail: string };

type Raw = Record<string, unknown>;

/** migrations[n] upgrades a version-n object to version n+1. */
const migrations: Array<(raw: Raw) => Raw> = [
  // v0 -> v1: early prototype saved only day, slot and seed.
  (v0) => {
    const seed = typeof v0.seed === 'number' ? v0.seed : 1;
    const base = createCampaign({ seed, commanderName: '' });
    return {
      ...base,
      day: v0.day as number,
      slot: v0.slot as string,
    } as unknown as Raw;
  },
];

const obj = z.record(z.unknown());
const arr = z.array(z.unknown());

// Light structural check only; deep validation is each package's concern.
const v1Shape = z.object({
  version: z.literal(1),
  rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  day: z.number().int().min(1),
  slot: z.enum(['morning', 'afternoon', 'evening', 'night']),
  difficulty: z.string(),
  settings: obj,
  commander: obj,
  squad: arr,
  roster: obj,
  relations: obj,
  resources: z.object({ credits: z.number(), supplies: z.number(), plyx: z.number() }),
  base: obj,
  inventory: arr,
  world: obj,
  missions: obj,
  rumors: arr,
  dms: obj,
  memory: obj,
  calendar: obj,
  leash: obj,
});

const isRun = (r: unknown): boolean =>
  Array.isArray(r) && r.length === 2 && Number.isSafeInteger(r[0]) && Number.isSafeInteger(r[1]) && (r[0] as number) >= 0 && (r[0] as number) <= (r[1] as number);

/**
 * Fields a save controls that leave the engine for the host are cleaned here, on every load: `memory.hidden` becomes the
 * arguments of `/unhide`, so only well-formed index runs are kept (a shared chat file must not run slash commands).
 */
function sanitize(cur: Raw): Raw {
  const memory = cur.memory as Raw;
  if (!('hidden' in memory)) return cur;
  const runs = Array.isArray(memory.hidden) ? memory.hidden.filter(isRun) : [];
  const { hidden: _drop, ...rest } = memory;
  return { ...cur, memory: runs.length > 0 ? { ...rest, hidden: runs } : rest };
}

const invalid = (detail: string): MigrateResult => ({ ok: false, reason: 'invalid', detail });

export function migrate(raw: unknown): MigrateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid('campaign state must be an object');
  }
  let cur = raw as Raw;
  const from = cur.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 0) {
    return invalid('campaign state has no valid version');
  }
  if (from > CURRENT_VERSION) {
    return {
      ok: false,
      reason: 'future_version',
      version: from,
      detail: `state version ${from} is newer than supported version ${CURRENT_VERSION}`,
    };
  }
  for (let v = from; v < CURRENT_VERSION; v++) cur = migrations[v](cur);

  const checked = v1Shape.safeParse(cur);
  if (!checked.success) {
    const detail = checked.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return invalid(detail);
  }
  return { ok: true, state: sanitize(cur) as unknown as CampaignState, migratedFrom: from };
}
