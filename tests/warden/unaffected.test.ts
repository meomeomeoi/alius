import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
// the order of the day-end steps follows the order the action modules are evaluated, so `world` loads first, as it did when the golden was made
import { loadCore } from '../helpers/world';
import { runWeek } from '../helpers/unaffectedWeek';

/**
 * Review focus 1: a default-mode campaign plays exactly as it did before P13 (no `leashswap` block: no draw, no co-sign, no override, no
 * restriction, no death). The week (`helpers/unaffectedWeek.ts`) is run with every action module loaded, P13's included; its event log, final
 * rng and a hash of its final state are compared with the golden file `fixtures/unaffected-week.json`, which was made on the commit
 * BEFORE P13 existed. A change that moves it draws, or writes state, in a campaign that never asked for the mode: stop and find which hook did.
 *
 * Regenerate the golden only for a deliberate change to default-mode behaviour:  UPDATE_GOLDEN=1 npx vitest run tests/warden/unaffected.test.ts
 */
const GOLDEN = new URL('../fixtures/unaffected-week.json', import.meta.url);
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const summarize = (r: ReturnType<typeof runWeek>) => ({ log: r.log, rng: r.rng, stateSha: createHash('sha256').update(JSON.stringify(r.state)).digest('hex') });

describe('no leashswap: a seeded week of day ends, scenes, DMs, a dilemma, a combat and a squad Leash request is identical', () => {
  it('the week is deterministic and never touches the P13 state', () => {
    const a = runWeek(reg);
    const b = runWeek(reg);
    expect(summarize(a)).toEqual(summarize(b));
    expect(a.state.leashswap).toBeUndefined();
    expect(a.state.ended).toBeUndefined();
    expect(JSON.stringify(a.state)).not.toMatch(/leashswap|"warden"/);
    expect(a.log.some((l) => /warden|override|cosign|intrigue|investigation|verdict/.test(l))).toBe(false); // no P13 event in a default campaign
  });

  it('matches the week as it played before P13 (the golden): same events, same rng, same final state', () => {
    const now = summarize(runWeek(reg));
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as ReturnType<typeof summarize>;
    expect(now.log).toEqual(golden.log);
    expect(now.rng).toEqual(golden.rng);
    expect(now.stateSha).toBe(golden.stateSha);
  });
});
