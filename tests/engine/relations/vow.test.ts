import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Conditions } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { platonicThresholds } from '../../../src/engine/relations/graph';
import { intimacyOf, intimacySetting } from '../../../src/engine/relations/gain';
import { availableStates, evaluateAutomatic, stateForProposal } from '../../../src/engine/relations/graph';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';

const world = (vow: boolean): CampaignState => {
  const s = campaign(reg, 3);
  s.day = 40;
  s.commander.traits = vow ? { regular: [], special: 'vow_of_distance' } : { regular: [] };
  if (vow) s.settings.noRomance = true;
  return s;
};
const put = (s: CampaignState, stateId: string, axes: { trust?: number; affinity?: number; attraction?: number } = {}): CampaignState => {
  Object.assign(s.relations[ANN], { stateId, stateSince: 1, trust: 100, affinity: 100, attraction: 0, flags: [], ...axes });
  return s;
};

describe('no_romance', () => {
  it('the vow turns romance off whatever the setting says', () => {
    const s = world(true);
    s.settings.intimacy = { romance: true, initiative: 'high' };
    expect(intimacyOf(s).romance).toBe(false);
    expect(intimacyOf(s).initiative).toBe('high');
    expect(intimacySetting(s).romance).toBe(true); // the stored setting is untouched (the app compares against it)
    expect(intimacyOf(world(false)).romance).toBe(true);
  });

  it('buildCampaign mirrors the trait into the campaign', () => {
    const r = buildCampaign(
      { commanderName: 'V', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')], commander: { body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [], special: 'vow_of_distance' } } },
      reg, { desireBondDefects: false, seed: 1 },
    );
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(intimacyOf(r.state).romance).toBe(false);
    const plain = buildCampaign({ commanderName: 'V', startId: 'start_vesper', crimeId: 'mutiny', units: [] }, reg, { desireBondDefects: false, seed: 1 });
    if (!plain.ok) throw new Error('x');
    expect(intimacyOf(plain.state).romance).toBe(true);
  });

  it('with the vow no romantic state is reachable from any state', () => {
    const s = world(true);
    const romantic = new Set([...reg.relationshipStates.values()].filter((st) => st.romance === true).map((st) => st.id));
    expect(romantic.size).toBeGreaterThan(3);
    expect(availableStates(s, reg, ANN).some((st) => romantic.has(st.id))).toBe(false);
    expect(availableStates(s, reg).some((st) => romantic.has(st.id))).toBe(false);
    const kinds = [...new Set([...reg.relationshipStates.values()].flatMap((st) => ((st.entry as { proposals?: string[] }).proposals ?? [])))];
    for (const from of reg.relationshipStates.keys()) {
      const t = put(structuredClone(s), from);
      for (const kind of kinds) {
        const check = stateForProposal(t, reg, ANN, kind);
        if ('stateId' in check) expect(romantic.has(check.stateId), `${from} --${kind}--> ${check.stateId}`).toBe(false);
      }
      // automatic entry with every axis maxed: never into a romantic state
      if (romantic.has(from)) continue; // a unit cannot start in one with the vow; only entries are checked
      let cur = t;
      for (let i = 0; i < 6; i++) {
        cur = structuredClone(cur);
        cur.relations[ANN].attraction = 100;
        evaluateAutomatic(cur, reg, ANN);
        expect(romantic.has(cur.relations[ANN].stateId), `${from} -> ${cur.relations[ANN].stateId}`).toBe(false);
      }
    }
  });

  it('without the vow a romantic proposal still works', () => {
    const t = put(world(false), 'flirting', { trust: 80, affinity: 80, attraction: 80 });
    t.relations[ANN].flags = [];
    const check = stateForProposal(t, reg, ANN, 'romance');
    expect('stateId' in check && reg.relationshipStates.get(check.stateId)!.romance).toBe(true);
  });
});

describe('platonicThresholds', () => {
  const cond = (id: string): Conditions => (reg.relationshipStates.get(id)!.entry as { when: Conditions }).when;

  it('the vow lowers confidant to affinity 47 and kindred to 68', () => {
    expect(platonicThresholds(world(true), reg, 'confidant', cond('confidant')).axes?.affinity).toEqual([47, 100]);
    const kindred = platonicThresholds(world(true), reg, 'kindred', cond('kindred')).axes!;
    expect(kindred.affinity).toEqual([68, 100]);
    expect(kindred.attraction).toEqual([0, 29]); // a lower bound of 0 and every upper bound are untouched
  });

  it('other states and a commander without the vow are unchanged', () => {
    expect(platonicThresholds(world(false), reg, 'confidant', cond('confidant'))).toEqual(cond('confidant'));
    expect(platonicThresholds(world(true), reg, 'trusted', cond('trusted'))).toEqual(cond('trusted'));
  });

  it('works through anyOf and never mutates the content', () => {
    const before = structuredClone(cond('confidant'));
    const nested: Conditions = { anyOf: [{ axes: { affinity: [60, 100] } }, { axes: { trust: [80, 100] } }] };
    const out = platonicThresholds(world(true), reg, 'confidant', nested);
    expect(out.anyOf).toEqual([{ axes: { affinity: [51, 100] } }, { axes: { trust: [68, 100] } }]);
    expect(nested.anyOf![0].axes!.affinity).toEqual([60, 100]);
    expect(cond('confidant')).toEqual(before);
  });

  it('a friend at affinity 50 can confide with the vow and not without', () => {
    const ask = (vow: boolean) => stateForProposal(put(world(vow), 'friend', { trust: 80, affinity: 50 }), reg, ANN, 'confide');
    expect(ask(true)).toEqual({ stateId: 'confidant' });
    expect(ask(false)).toMatchObject({ fail: expect.any(String) });
  });

  it('a confidant at affinity 70 becomes kindred with the vow only', () => {
    const settle = (vow: boolean) => {
      const s = put(world(vow), 'confidant', { trust: 60, affinity: 70, attraction: 0 });
      evaluateAutomatic(s, reg, ANN);
      return s.relations[ANN].stateId;
    };
    expect(settle(true)).toBe('kindred');
    expect(settle(false)).toBe('confidant');
  });
});

describe('sworn', () => {
  const settle = (vow: boolean, axes = { trust: 80, affinity: 90, attraction: 0 }): string => {
    const s = put(world(vow), 'kindred', axes);
    evaluateAutomatic(s, reg, ANN);
    return s.relations[ANN].stateId;
  };

  it('sworn is unreachable without the vow and reachable from kindred with it', () => {
    expect(settle(true)).toBe('sworn');
    expect(settle(false)).toBe('kindred');
    expect(availableStates(world(false), reg, ANN).some((st) => st.id === 'sworn')).toBe(false);
    expect(availableStates(world(true), reg, ANN).some((st) => st.id === 'sworn')).toBe(true);
  });

  it('sworn needs the axes: trust 70 and affinity 85', () => {
    expect(settle(true, { trust: 69, affinity: 100, attraction: 0 })).toBe('kindred');
    expect(settle(true, { trust: 100, affinity: 84, attraction: 0 })).toBe('kindred');
    expect(settle(true, { trust: 70, affinity: 85, attraction: 0 })).toBe('sworn');
  });

  it('sworn is a platonic, non-romantic state with author placeholders', () => {
    const st = reg.relationshipStates.get('sworn')!;
    expect(st).toMatchObject({ group: 'platonic', romance: false, priority: 40, requiresTrait: 'vow_of_distance' });
    expect(String(st.description)).toContain('AUTHOR TO WRITE');
    expect(String(st.promptHint)).toContain('AUTHOR TO WRITE');
  });
});

describe('references', () => {
  const load = (patch: (states: Array<Record<string, unknown>>, traits: Array<Record<string, unknown>>) => void) =>
    loadPacks(['content/core'], async (p) => {
      const json = JSON.parse(await readFile(p, 'utf8'));
      if (p.endsWith('/relationshipStates.json')) patch(json, []);
      if (p.endsWith('/commanderTraits.json')) patch([], json);
      return json;
    });
  const text = (r: Awaited<ReturnType<typeof load>>) => r.errors.map((e) => JSON.stringify(e)).join('\n');

  it('requiresTrait must name a trait', async () => {
    const r = await load((states) => { const sw = states.find((x) => x.id === 'sworn'); if (sw) sw.requiresTrait = 'no_such_trait'; });
    expect(text(r)).toMatch(/no_such_trait/);
  });

  it('unlock_state must name a state', async () => {
    const r = await load((_s, traits) => {
      const t = traits.find((x) => x.id === 'vow_of_distance');
      if (t) (t.effects as Array<Record<string, unknown>>).push({ type: 'unlock_state', stateId: 'no_such_state' });
    });
    expect(text(r)).toMatch(/no_such_state/);
  });

  it('the core pack loads clean', async () => {
    const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
    expect(r.errors).toEqual([]);
    expect(r.registries.relationshipStates.get('sworn')).toBeDefined();
  });
});
