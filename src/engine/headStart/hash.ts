import { fnv1a } from '../hub';

/**
 * P11b: every chance and pick of the head start hashes `<campaign seed>|<unitId>|head_start|<key>`; nothing draws from the rng.
 * `headStartRaw` is the uint32, `headStartHash` a number in [0, 1).
 */
export const headStartRaw = (seed: number, unitId: string, key: string): number => fnv1a(`${seed}|${unitId}|head_start|${key}`);
export const headStartHash = (seed: number, unitId: string, key: string): number => headStartRaw(seed, unitId, key) / 2 ** 32;
