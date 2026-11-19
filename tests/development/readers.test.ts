import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAW_MARK } from '../../src/engine/development/profile';

/**
 * P14b: every system that reads a profile field reads the effective one (`valuesOf`, `likesOf`, `dislikesOf`, `tastesOf`, `bondOf`,
 * `effectiveValues`). A raw read plays the woman her card says, not the one she became. A line that must stay raw (setup, re-sync,
 * import) carries `// P14b: raw profile`.
 */
const ALLOWED = [/^src\/engine\/development\//, /^src\/engine\/setup\.ts$/, /^src\/engine\/actions\/squad\.ts$/, /^src\/setup\//, /^src\/ui\/setup\//];
/** Files Task 3 still lists; Task 4 empties this. */
const PENDING: string[] = [
  'src/app.ts',
  'src/engine/activities.ts',
  'src/engine/arcs.ts',
  'src/engine/bonds/publicity.ts',
  'src/engine/commander/presence.ts',
  'src/engine/dilemma/flow.ts',
  'src/engine/dilemma/validate.ts',
  'src/engine/discipline/demands.ts',
  'src/engine/discipline/perception.ts',
  'src/engine/discipline/reputation.ts',
  'src/engine/headStart/moments.ts',
  'src/engine/hub.ts',
  'src/engine/items.ts',
  'src/engine/leash/use.ts',
  'src/engine/memory/crime.ts',
  'src/engine/personal/reactions.ts',
  'src/engine/power/ballot.ts',
  'src/engine/relations/deltas.ts',
  'src/engine/warden/agenda.ts',
  'src/engine/warden/intrigue.ts',
  'src/engine/warden/leash.ts',
  'src/engine/warden/removal.ts',
  'src/engine/warden/select.ts',
  'src/llm/calls/intentExtract.ts',
  'src/scene/comms.ts',
  'src/scene/memoryContext.ts',
  'src/scene/sceneController.ts',
  'src/ui/device/marks.ts',
  'src/ui/squad/squadTab.ts',
  'src/warden/controller.ts',
];

const FIELD = /\b(unit|u|her|other|companion|w|warden|a|b|subject|target)\??\.(values|likes|dislikes|commanderTastes)\b/;
const BOND = /\.bond\??\.(leadStyle|attachment|desire|caretaker)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('readers guard', () => {
  it('no source line reads a raw profile field outside the allowed places', () => {
    const offenders: string[] = [];
    for (const f of files('src')) {
      if (ALLOWED.some((re) => re.test(f)) || PENDING.includes(f)) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes(RAW_MARK) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (FIELD.test(line) || BOND.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
