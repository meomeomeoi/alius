import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { dig, digProblem, kompromatOf, wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
function swap(over: (s: CampaignState) => void = () => {}, seed = 9): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  const w = wardenOf(out.state)!;
  w.expectations = w.expectations.map((x) => ({ ...x, known: true })); // so a dig finds a fact, not an expectation
  out.state.commander.socialStats.cunning = 1;
  over(out.state);
  return out.state;
}
/** A rng whose `chance` never hits, so the discovery draw after a dig stays quiet. */
class Quiet extends Rng { override chance(): boolean { return false; } }
const quiet = (seed = 3) => ({ registries: reg, rng: new Quiet(seedRng(seed)) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const ally = (s: CampaignState, id = ID.cat) => { s.relations[id].flags.push('warden_ally'); };
const hide = (s: CampaignState, text: string, day = s.day): void => {
  s.memory.facts.push({ id: `h_${text}`, about: [ID.bea], text, tags: [], importance: 3, day, knownBy: [ID.ann], hiddenFromCommander: true });
};

describe('dig', () => {
  it('reveals a hidden fact about her first (the newest) and tags it kompromat', () => {
    const s = swap((x) => { ally(x); hide(x, 'She hides a debt.', 1); hide(x, 'She forged a signature.', 2); });
    const events = dig(s, quiet(), ID.cat);
    const found = events.find((e) => e.type === 'kompromat_found') as unknown as { factId: string } | undefined;
    expect(found?.factId).toBe('h_She forged a signature.');
    const fact = s.memory.facts.find((f) => f.id === found!.factId)!;
    expect(fact.hiddenFromCommander).toBeUndefined();
    expect(fact.tags).toContain('kompromat');
    expect(s.memory.facts.find((f) => f.id === 'h_She hides a debt.')!.hiddenFromCommander).toBe(true); // only one a dig
    expect(kompromatOf(s)).toHaveLength(1);
  });

  it('then an authored line: a new pinned fact about her, tagged, known to the commander and the ally', () => {
    const s = swap((x) => ally(x));
    const events = dig(s, quiet(), ID.cat);
    const found = events.find((e) => e.type === 'kompromat_found') as unknown as { factId: string };
    const fact = s.memory.facts.find((f) => f.id === found.factId)!;
    expect(fact).toMatchObject({ about: [ID.bea], pinned: true, tags: ['kompromat'], knownBy: ['commander', ID.cat] });
    expect(TUNING.warden.kompromat.lines).toContain(fact.text);
    expect(fact.hiddenFromCommander).toBeUndefined();
    expect(kompromatOf(s)).toHaveLength(1);
  });

  it('each dig adds a different line until they run out, then there is nothing more to find', () => {
    const s = swap((x) => ally(x));
    const n = TUNING.warden.kompromat.lines.length;
    for (let i = 0; i < n; i++) { s.slot = 'morning'; dig(s, quiet(i + 1), ID.cat); }
    expect(kompromatOf(s)).toHaveLength(n);
    expect(new Set(kompromatOf(s).map((f) => f.text)).size).toBe(n);
    s.slot = 'morning';
    expect(types(dig(s, quiet(), ID.cat))).not.toContain('kompromat_found');
    expect(kompromatOf(s)).toHaveLength(n);
  });

  it('with an unknown expectation it is learned instead on a parity of the day and the counter (no draw)', () => {
    const outcomes = new Set<string>();
    for (let day = 1; day <= 12; day++) {
      const s = swap((x) => { ally(x); wardenOf(x)!.expectations[0].known = false; x.day = day; });
      const ctx = quiet();
      const rng = ctx.rng.state;
      const events = dig(s, ctx, ID.cat);
      outcomes.add(types(events).includes('expectation_learned') ? 'learned' : 'line');
      expect(ctx.rng.state).toEqual(rng); // the choice draws nothing (the discovery draw is silenced above)
      if (types(events).includes('expectation_learned')) expect(wardenOf(s)!.expectations[0].known).toBe(true);
    }
    expect([...outcomes].sort()).toEqual(['learned', 'line']);
  });

  it('needs an ally or Cunning 3', () => {
    const s = swap();
    expect(digProblem(s, reg)).toMatch(/Cunning 3/);
    expect(() => dig(s, quiet())).toThrow(/Cunning 3/);
    expect(() => dig(s, quiet(), ID.cat)).toThrow(/does not stand with/);
    s.commander.socialStats.cunning = 3;
    expect(digProblem(s, reg)).toBeNull();
    expect(types(dig(s, quiet()))).toContain('intrigue_action');
    const a = swap((x) => ally(x));
    expect(digProblem(a, reg, ID.cat)).toBeNull();
  });

  it('spends one slot and adds noise 15 (then the discovery draw)', () => {
    const s = swap((x) => ally(x));
    expect(s.slot).toBe('morning');
    dig(s, quiet(), ID.cat);
    expect(s.slot).toBe('afternoon');
    expect(s.leashswap!.intrigue.suspicion).toBe(TUNING.warden.intrigue.digNoise);
  });

  it('is refused in a scene, a run, a fight and without a warden (the action, through dispatch)', () => {
    const base = swap((x) => ally(x));
    const act = (s: CampaignState) => dispatch(s, { type: 'intrigue/act', payload: { action: 'dig', unitId: ID.cat } }, reg);
    expect(act(base).events.find((e) => e.type === 'error')).toBeUndefined();
    const inScene = dispatch(base, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.ann], origin: 'event', consumesSlot: false, startIndex: 0 } }, reg).state;
    expect(act(inScene).events.find((e) => e.type === 'error')).toBeDefined();
    expect(act(inScene).state).toBe(inScene);
    expect(act({ ...base, expedition: {} as never }).events.find((e) => e.type === 'error')).toMatchObject({ code: 'expedition_open' });
    expect(act({ ...base, combat: {} as never }).events.find((e) => e.type === 'error')).toMatchObject({ code: 'combat_open' });
    const free = swap((x) => { ally(x); x.leashswap!.status = 'free'; });
    expect(act(free).events.find((e) => e.type === 'error')).toBeDefined();
  });

  it('is refused while a decision waits and for an unknown action', () => {
    const s = swap((x) => { ally(x); x.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'major', context: 'base', day: 1, status: 'presented', attempts: 0, units: [], beatId: 'b', title: 'T', setup: 'S', options: [] } }; });
    expect(dispatch(s, { type: 'intrigue/act', payload: { action: 'dig', unitId: ID.cat } }, reg).events.find((e) => e.type === 'error')).toMatchObject({ code: 'dilemma_open' });
    const plain = swap((x) => ally(x));
    expect(dispatch(plain, { type: 'intrigue/act', payload: { action: 'burn' } }, reg).events.find((e) => e.type === 'error')).toBeDefined();
  });

  it('no event carries a suspicion value or the text of a fact', () => {
    const s = swap((x) => ally(x));
    const text = JSON.stringify(dig(s, quiet(), ID.cat));
    expect(text.toLowerCase()).not.toContain('suspicion');
    for (const line of TUNING.warden.kompromat.lines) expect(text).not.toContain(line);
  });
});
