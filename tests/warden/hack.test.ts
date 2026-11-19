import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineCtx, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { hackProblem, hackStep, setRemovalStarter, wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
/** Ann is a plain assault soldier, Bea the warden, Cat a specialist (the role with the know-how). */
function swap(over: (s: CampaignState) => void = () => {}, ready = true): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
    units: [unitSetup('Ann'), unitSetup('Bea'), unitSetup('Cat', { roleId: 'specialist' })],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  const s = out.state;
  if (ready) {
    s.base.facilities.workshop = 3;
    s.base.facilities.medbay = 3;
    s.resources.plyx = 50;
    s.relations[ID.cat].flags.push('warden_ally');
  }
  over(s);
  return s;
}
class Fixed extends Rng {
  constructor(state: ReturnType<typeof seedRng>, private readonly answer: boolean) { super(state); }
  override chance(): boolean { return this.answer; }
}
const chancing = (answer: boolean, seed = 3): EngineCtx => ({ registries: reg, rng: new Fixed(seedRng(seed), answer) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const step = (s: CampaignState, ctx: EngineCtx, ally = ID.cat): EngineEvent[] => { s.slot = 'morning'; return hackStep(s, ctx, ally); };

describe('hackProblem', () => {
  it('names every missing gate', () => {
    const s = swap((x) => { x.resources.plyx = 0; }, false);
    const p = hackProblem(s, reg, undefined)!;
    expect(p).toMatch(/Workshop level 3/);
    expect(p).toMatch(/Medbay level 3/);
    expect(p).toMatch(/5 plyx/);
    expect(p).toMatch(/ally with the know-how/);
  });

  it('is null when the facilities, the plyx and a tech ally are there', () => {
    expect(hackProblem(swap(), reg, ID.cat)).toBeNull();
  });

  it('reads the know-how by field: a role with `tech`, or a defect with `tech`', () => {
    const noTech = swap((x) => { x.relations[ID.ann].flags.push('warden_ally'); });
    expect(hackProblem(noTech, reg, ID.ann)).toMatch(/know-how/);
    expect(hackProblem(noTech, reg, ID.cat)).toBeNull(); // Cat is the specialist
    const viaDefect = swap((x) => {
      x.relations[ID.ann].flags.push('warden_ally');
      x.squad.find((u) => u.id === ID.ann)!.defects = [{ id: 'sensor_ghosting', origin: 'x' } as never];
    });
    expect(hackProblem(viaDefect, reg, ID.ann)).toBeNull();
    expect(reg.roles.get('assault')?.tech).toBeUndefined();
  });

  it('a unit who is not an ally is not enough, and nothing can be done with nobody holding the leash', () => {
    const s = swap((x) => { x.relations[ID.cat].flags = []; });
    expect(hackProblem(s, reg, ID.cat)).toMatch(/know-how/);
    expect(hackProblem(swap((x) => { x.leashswap!.status = 'free'; }), reg, ID.cat)).toBe('Nobody holds the leash.');
  });
});

describe('hackStep', () => {
  it('a clean step pays 5 plyx, spends a slot, adds noise 20 and counts', () => {
    const s = swap();
    s.slot = 'morning';
    const events = hackStep(s, chancing(false), ID.cat);
    expect(types(events)).toContain('hack_step');
    expect(events.find((e) => e.type === 'hack_step')).toMatchObject({ step: 1, failed: false });
    expect(s.resources.plyx).toBe(50 - TUNING.warden.hack.plyx);
    expect(s.slot).toBe('afternoon');
    expect(s.leashswap!.intrigue.hack.step).toBe(1);
    expect(s.leashswap!.intrigue.suspicion).toBe(TUNING.warden.hack.noise);
  });

  it('three clean steps make the controller dark and start the hack route', () => {
    const s = swap();
    const routes: string[] = [];
    setRemovalStarter((_d, _c, route) => { routes.push(route); return [{ type: 'removal_started_stub' }]; });
    try {
      const ctx = chancing(false);
      expect(types(step(s, ctx))).not.toContain('controller_dark');
      expect(types(step(s, ctx))).not.toContain('controller_dark');
      const last = step(s, ctx);
      expect(types(last)).toEqual(expect.arrayContaining(['controller_dark', 'removal_started_stub']));
      expect(s.commander.flags).toContain('commander_implant_dark');
      expect(routes).toEqual(['hack']);
    } finally {
      setRemovalStarter(() => []);
    }
  });

  it('until the removal exists the third step only sets the flag', () => {
    const s = swap();
    const ctx = chancing(false);
    step(s, ctx); step(s, ctx);
    expect(types(step(s, ctx))).toContain('controller_dark');
    expect(s.commander.flags).toContain('commander_implant_dark');
  });

  it('a discovered step costs a pain burst, resets the progress and carries the discovery consequences', () => {
    const s = swap((x) => { x.leashswap!.intrigue.hack.step = 2; wardenOf(x)!.satisfaction = 70; });
    const stress = s.commander.stress ?? 0;
    const events = step(s, chancing(true));
    expect(types(events)).toEqual(expect.arrayContaining(['intrigue_discovered', 'warden_betrayed', 'commander_punished']));
    expect(events.filter((e) => e.type === 'commander_punished')).toHaveLength(1); // one punishment: the pain burst, not two
    expect(events.find((e) => e.type === 'commander_punished')).toMatchObject({ severity: 3 });
    expect(events.find((e) => e.type === 'hack_step')).toMatchObject({ failed: true });
    expect(s.leashswap!.intrigue.hack.step).toBe(0);
    expect(s.commander.stress ?? 0).toBeGreaterThan(stress);
    expect(wardenOf(s)!.satisfaction).toBeLessThan(70);
    expect(s.commander.flags).not.toContain('commander_implant_dark');
    expect(s.resources.plyx).toBe(45); // the step's cost is not refunded
    expect(s.relations[ID.cat].flags).toContain('warden_knows_ally');
  });

  it('the pain burst is applied even with no Leash authorization left', () => {
    const s = swap((x) => { wardenOf(x)!.leashLeft = 0; });
    expect(types(step(s, chancing(true)))).toContain('commander_punished');
  });

  it('throws with the problem and changes nothing', () => {
    const s = swap((x) => { x.resources.plyx = 1; });
    expect(() => hackStep(s, chancing(false), ID.cat)).toThrow(/5 plyx/);
  });

  it('the action: needs a unit, is refused in a scene, and runs through dispatch', () => {
    const s = swap();
    const r = dispatch(s, { type: 'intrigue/act', payload: { action: 'hack_step', unitId: ID.cat } }, reg);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    expect(r.state.leashswap!.intrigue.hack.step + r.state.leashswap!.intrigue.discovered).toBeGreaterThan(0);
    expect(dispatch(s, { type: 'intrigue/act', payload: { action: 'hack_step' } }, reg).events.find((e) => e.type === 'error')).toBeDefined();
  });

  it('no event carries a suspicion value or the discovery chance', () => {
    const s = swap();
    s.slot = 'morning';
    const text = JSON.stringify(hackStep(s, chancing(false), ID.cat)).toLowerCase();
    expect(text).not.toContain('suspicion');
    expect(text).not.toContain('chance');
  });
});
