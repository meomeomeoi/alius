import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import { buildCampaign, type UnitSetup } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';

// Importing these registers the actions under test.
import '../../src/engine/actions/calendar';

export async function loadCore(): Promise<Registries> {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  if (r.errors.length > 0) throw new Error(JSON.stringify(r.errors));
  return r.registries;
}

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
export const unitSetup = (name: string, over: Partial<UnitSetup> = {}): UnitSetup => ({
  cardRef: `${name.toLowerCase()}.png`, displayName: name, roleId: 'assault',
  signature: { templateId: 'sig_last_stand', name: 'Last Stand', description: 'She holds the line.' },
  defects: [{ id: 'echo_bleed', origin: 'Heard things.' }],
  values: { ...ZERO }, likes: [], dislikes: [], triggers: [],
  baseline: { trust: 20, affinity: 0, attraction: 0 }, ...over,
});

/** A P1-built campaign (no P2 fields set by hand): `n` named units, Vesper start, mutiny crime. */
export function campaign(reg: Registries, n = 4, opts: { crimeId?: string; startId?: string } = {}): CampaignState {
  const names = ['Ann', 'Bea', 'Cat', 'Dee', 'Eve', 'Fay'];
  const r = buildCampaign(
    {
      commanderName: 'Vale', startId: opts.startId ?? 'start_vesper', crimeId: opts.crimeId ?? 'mutiny',
      units: names.slice(0, n).map((nm) => unitSetup(nm)),
    },
    reg, { desireBondDefects: false, seed: 11 },
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
}

export function run(state: CampaignState, reg: Registries, action: Action): { state: CampaignState; events: EngineEvent[] } {
  return dispatch(state, action, reg);
}

export const errors = (events: EngineEvent[]) => events.filter((e) => e.type === 'error');
export const ofType = (events: EngineEvent[], type: string) => events.filter((e) => e.type === type);
