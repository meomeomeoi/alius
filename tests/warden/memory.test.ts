import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { EngineEvent } from '../../src/engine/dispatch';
import { rememberEvents } from '../../src/engine/memory/remember';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState, Fact } from '../../src/engine/state/types';
import { wardenOf } from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
function swap(over: (s: CampaignState) => void = () => {}): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 4 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  over(out.state);
  return out.state;
}
/** The facts a batch of events leaves, beyond what the state already held. */
function remember(s: CampaignState, events: EngineEvent[]): Fact[] {
  const before = s.memory.facts.length;
  rememberEvents(s, events, reg);
  return s.memory.facts.slice(before);
}

describe('memory rules write the facts with the audience of the check', () => {
  it('override_answered, defy: the present units; in a fight the whole squad; a comply is not remembered', () => {
    const base = swap();
    const [f] = remember(base, [{ type: 'override_answered', overrideId: 'ov1', answer: 'defy', context: 'base' }]);
    expect(f.about).toEqual([ID.bea]);
    expect(f.knownBy).toEqual([ID.bea]); // no scene is open: the units the fact is about
    expect(f.text).toMatch(/defied Bea/);
    expect(f.id).toMatch(/^fr/);

    const scene = swap();
    scene.scene = { id: 'sc1', participants: [ID.ann, ID.bea] } as never;
    expect(remember(scene, [{ type: 'override_answered', overrideId: 'ov1', answer: 'defy', context: 'base' }])[0].knownBy.sort()).toEqual([ID.ann, ID.bea]);

    const fight = swap();
    const [w] = remember(fight, [{ type: 'override_answered', overrideId: 'ov1', answer: 'defy', context: 'combat' }]);
    expect(w.knownBy.sort()).toEqual([ID.ann, ID.bea, ID.cat]);
    expect(w.text).toMatch(/in front of the squad/);

    expect(remember(swap(), [{ type: 'override_answered', overrideId: 'ov1', answer: 'comply', context: 'base' }])).toEqual([]);
    expect(remember(swap(), [{ type: 'override_answered', overrideId: 'ov1', answer: 'argue', context: 'combat' }])).toEqual([]);
  });

  it('commander_punished: public at severity 3 and up, nothing below, nothing under remote control', () => {
    const s = swap();
    const [f] = remember(s, [{ type: 'commander_punished', punishmentId: 'pain_burst', severity: 3 }]);
    expect(f.knownBy).toEqual(['*']);
    expect(f.about).toEqual([ID.bea]);
    expect(f.text).toMatch(/Bea punished the commander: Pain Burst/i);
    expect(remember(swap(), [{ type: 'commander_punished', punishmentId: 'reprimand', severity: 1 }])).toEqual([]);
    expect(remember(swap(), [{ type: 'commander_punished', punishmentId: 'confinement', severity: 3, remote: true }])).toEqual([]);
  });

  it('commander_leashed: the squad knows, and it spreads fast', () => {
    const [f] = remember(swap(), [{ type: 'commander_leashed', kind: 'suppress' }]);
    expect(f.knownBy.sort()).toEqual([ID.ann, ID.bea, ID.cat]);
    expect(f.spread).toBe('fast');
  });

  it('warden_warning: about the warden, known to her alone', () => {
    const [f] = remember(swap(), [{ type: 'warden_warning', level: 1 }]);
    expect(f.about).toEqual([ID.bea]);
    expect(f.knownBy).toEqual([ID.bea]);
    expect(f.spread).toBeUndefined();
  });

  it('warden_removed: the hack route is about the commander and known to the allies; report and death are public', () => {
    const s = swap((x) => { x.relations[ID.cat].flags.push('warden_ally'); });
    const [hack] = remember(s, [{ type: 'warden_removed', unitId: ID.bea, route: 'hack' }]);
    expect(hack.about).toEqual(['commander']);
    expect(hack.knownBy).toEqual([ID.cat]);
    const [report] = remember(swap(), [{ type: 'warden_removed', unitId: ID.bea, route: 'report' }]);
    expect(report).toMatchObject({ about: [ID.bea], knownBy: ['*'] });
    expect(report.text).toMatch(/reported to oversight/);
    const [death] = remember(swap(), [{ type: 'warden_removed', unitId: ID.bea, route: 'death' }]);
    expect(death).toMatchObject({ about: [ID.bea], knownBy: ['*'] });
    expect(death.text).toMatch(/gone from the squad/);
  });

  it('verdict: public, one fact for each outcome', () => {
    const [a] = remember(swap(), [{ type: 'verdict', outcome: 'cleared' }]);
    const [b] = remember(swap(), [{ type: 'verdict', outcome: 'convicted' }]);
    expect(a).toMatchObject({ about: ['world'], knownBy: ['*'] });
    expect(a.text).toMatch(/cleared/);
    expect(b.text).toMatch(/convicted/);
  });

  it('ally_won is known only to the ally, and does not spread', () => {
    const [f] = remember(swap(), [{ type: 'ally_won', unitId: ID.cat }]);
    expect(f).toMatchObject({ about: [ID.cat], knownBy: [ID.cat] });
    expect(f.spread).toBeUndefined();
    expect(f.text).toMatch(/stand with the commander/);
  });

  it('no rule for the events the check leaves out', () => {
    const excluded = ['warden_assigned', 'intrigue_action', 'hack_step', 'kompromat_found', 'leash_cosigned', 'leash_cosign_denied', 'expectation_learned', 'commander_died', 'campaign_ended'];
    const events = new Set([...reg.memoryRules.values()].map((r) => String(r.event)));
    for (const type of excluded) expect(events.has(type), type).toBe(false);
    const events2: EngineEvent[] = excluded.map((type) => ({ type, unitId: ID.cat, factId: 'x' }));
    expect(remember(swap(), events2)).toEqual([]);
  });

  it('no rule moves the id counter of the ordinary facts, and none draws (facts take fr ids)', () => {
    const s = swap();
    const before = s.memory.nextId;
    remember(s, [{ type: 'ally_won', unitId: ID.cat }, { type: 'verdict', outcome: 'cleared' }]);
    expect(s.memory.nextId).toBe(before);
    expect(wardenOf(s)).not.toBeNull();
  });
});
