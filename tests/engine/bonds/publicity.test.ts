import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bondsDayStep, publicityMismatch, rollReveal, setPublicity, syncPublicity } from '../../../src/engine/bonds';
import { evaluateAutomatic } from '../../../src/engine/relations/graph';
import { answerProposal, commanderProposal, offerProposal, rollDiscovery } from '../../../src/engine/relations/proposals';
import { Rng, seedRng } from '../../../src/engine/rng';
import { openDemand } from '../../../src/engine/discipline';
import type { CampaignState, Publicity } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { bondsDirectives } from '../../../src/bonds/directives';
import { ContextBuilder } from '../../../src/llm/context';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';
import '../../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

function world(pref: Publicity = 'known', state = 'lover'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 12;
  withBond(s, ANN, { publicity: pref, leadStyle: 'balanced' });
  setRelation(s, ANN, { stateId: state });
  return s;
}
const pub = (s: CampaignState) => s.relations[ANN].publicity;

describe('syncPublicity: entering and leaving the romantic tier', () => {
  it('entering lover takes the more private of her preference and the commander default (known)', () => {
    const cases: Array<[Publicity, Publicity]> = [['public', 'known'], ['known', 'known'], ['secret', 'secret']];
    for (const [her, level] of cases) {
      const s = world(her);
      expect(pub(s)).toBeUndefined();
      const events = syncPublicity(s, reg, ANN);
      expect(pub(s), her).toEqual({ level, since: 12 });
      expect(ofType(events, 'publicity_set')).toMatchObject([{ unitId: ANN, level }]);
      expect(syncPublicity(s, reg, ANN)).toEqual([]); // idempotent: a level that exists stays
    }
  });

  it('a state outside the romantic tier has none, and leaving the tier clears it', () => {
    const s = world('known', 'friend');
    expect(syncPublicity(s, reg, ANN)).toEqual([]);
    expect(pub(s)).toBeUndefined();
    const l = world();
    syncPublicity(l, reg, ANN);
    expect(pub(l)).toBeDefined();
    l.relations[ANN].stateId = 'resentful';
    syncPublicity(l, reg, ANN);
    expect(pub(l)).toBeUndefined();
  });

  it('secret_affair starts secret and is left to the P3 discovery', () => {
    const s = world('public', 'secret_affair');
    syncPublicity(s, reg, ANN);
    expect(pub(s)!.level).toBe('secret');
    // the reveal roll never picks it: P3's rollDiscovery owns it
    for (let seed = 1; seed <= 30; seed++) {
      const d = structuredClone(s);
      expect(rollReveal(d, reg, new Rng(seedRng(seed)), [ANN, BEA, CAT])).toEqual([]);
    }
  });

  /** The proposals test world: everyone a comrade, Ann a friend ready for a date. */
  const dateReady = (pref: Publicity): CampaignState => {
    const s = world(pref, 'friend');
    s.day = 30;
    for (const u of s.squad) {
      u.defects = [];
      Object.assign(s.relations[u.id], { stateId: 'comrade', trust: 40, affinity: 20, attraction: 0, stateSince: 1, flags: [], history: [] });
    }
    Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
    return s;
  };

  it('the proposal path hooks it: accepting a date into flirting sets her level', () => {
    const s = dateReady('secret');
    offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'scene' });
    answerProposal(s, reg, { proposalId: s.proposals![0].id, answer: 'accept' });
    expect(s.relations[ANN].stateId).toBe('flirting');
    expect(pub(s)).toMatchObject({ level: 'secret' });
  });

  it('the secret_affair proposal makes it secret; the discovery makes it known', () => {
    const s = dateReady('public');
    Object.assign(s.relations[ANN], { trust: 50, affinity: 40, attraction: 50 });
    Object.assign(s.relations[BEA], { stateId: 'lover', trust: 70, affinity: 70, attraction: 70, stateSince: 10 });
    commanderProposal(s, reg, { unitId: ANN, kind: 'secret_affair', channel: 'scene' });
    expect(s.relations[ANN].stateId).toBe('secret_affair');
    expect(pub(s)!.level).toBe('secret');
    for (let seed = 1; seed <= 60 && s.relations[ANN].stateId === 'secret_affair'; seed++) rollDiscovery(s, reg, new Rng(seedRng(seed)), [ANN, BEA, CAT]);
    expect(s.relations[ANN].stateId).not.toBe('secret_affair');
    expect(pub(s)!.level).toBe('known');
  });

  it('the automatic graph hooks leaving the tier', () => {
    const s = world('known', 'lover');
    syncPublicity(s, reg, ANN);
    Object.assign(s.relations[ANN], { trust: -60, affinity: -60, attraction: -60, stateSince: 1 });
    evaluateAutomatic(s, reg, ANN);
    expect(reg.relationshipStates.get(s.relations[ANN].stateId)?.bondTier).not.toBe('romantic');
    expect(pub(s)).toBeUndefined();
  });

  it('the day step repairs a missed hook', () => {
    const s = world();
    expect(pub(s)).toBeUndefined();
    const d = structuredClone(s);
    bondsDayStep(d, { registries: reg, rng: new Rng(d.rng) });
    expect(pub(d)).toBeDefined();
  });
});

describe('setPublicity', () => {
  const ready = (pref: Publicity, level: Publicity = 'known'): CampaignState => {
    const s = world(pref);
    s.relations[ANN].publicity = { level, since: 1 };
    return s;
  };
  const affinity = (s: CampaignState) => s.relations[ANN].affinity;

  it('against her preference applies dismissed; toward it applies listened', () => {
    const away = ready('secret', 'secret');
    const a0 = affinity(away);
    const events = setPublicity(away, reg, ANN, 'public', { cause: 'commander' });
    expect(pub(away)).toMatchObject({ level: 'public', commanderPref: 'public' });
    expect(ofType(events, 'publicity_changed')).toMatchObject([{ unitId: ANN, from: 'secret', to: 'public', cause: 'commander' }]);
    expect(affinity(away)).toBeLessThan(a0); // dismissed

    const toward = ready('secret', 'public');
    const t0 = affinity(toward);
    setPublicity(toward, reg, ANN, 'known', { cause: 'commander' });
    expect(affinity(toward)).toBeGreaterThan(t0); // listened: known is closer to secret
    const exact = ready('public', 'known');
    const e0 = affinity(exact);
    setPublicity(exact, reg, ANN, 'public', { cause: 'commander' });
    expect(affinity(exact)).toBeGreaterThan(e0);
  });

  it('the same level only records the commander preference', () => {
    const s = ready('known', 'known');
    expect(setPublicity(s, reg, ANN, 'known', { cause: 'commander' })).toEqual([]);
    expect(pub(s)!.commanderPref).toBe('known');
  });

  it('refuses a unit that is not in a romantic state', () => {
    const s = world('known', 'friend');
    expect(() => setPublicity(s, reg, ANN, 'public', { cause: 'commander' })).toThrow(/romantic/);
  });

  it('setPublicity with cause claimed forces public (acceptance 8) and touches no preference event', () => {
    const s = ready('secret', 'secret');
    const a0 = affinity(s);
    setPublicity(s, reg, ANN, 'public', { cause: 'claimed' });
    expect(pub(s)!.level).toBe('public');
    expect(affinity(s)).toBe(a0);
  });

  it('bonds/set_publicity validates and dispatches', () => {
    const s = ready('known');
    const ok = run(s, reg, { type: 'bonds/set_publicity', payload: { unitId: ANN, level: 'public' } });
    expect(errors(ok.events)).toEqual([]);
    expect(pub(ok.state)!.level).toBe('public');
    expect(errors(run(s, reg, { type: 'bonds/set_publicity', payload: { unitId: ANN, level: 'loud' } }).events)).toHaveLength(1);
    expect(errors(run(world('known', 'friend'), reg, { type: 'bonds/set_publicity', payload: { unitId: ANN, level: 'public' } }).events)).toHaveLength(1);
  });
});

describe('mismatch: demand and directive', () => {
  it('a mismatch enables publicity_talk and sets the directive while she is present', () => {
    const s = world('secret');
    s.relations[ANN].publicity = { level: 'public', since: 1 };
    expect(publicityMismatch(s, ANN)).toBe(true);
    const opened = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const d = structuredClone(s);
      const r = openDemand(d, { registries: reg, rng: new Rng(seedRng(seed)) }, ANN);
      if (r) opened.add(r.demand.templateId);
    }
    expect(opened.has('publicity_talk')).toBe(true);
    const calm = world('public');
    calm.relations[ANN].publicity = { level: 'public', since: 1 };
    expect(publicityMismatch(calm, ANN)).toBe(false);

    s.scene = { id: 's1', day: 12, slot: 'morning', locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as CampaignState['scene'];
    const b = new ContextBuilder();
    bondsDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain('Ann wants the relationship secret; it is public.');
    s.scene!.participants = [BEA];
    bondsDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('wants the relationship');
  });
});

describe('rollReveal', () => {
  const secretWorld = (): CampaignState => {
    const s = world('secret');
    s.relations[ANN].publicity = { level: 'secret', since: 1 };
    return s;
  };
  const reveals = (present: string[], seeds = 200): number => {
    let n = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const d = secretWorld();
      if (ofType(rollReveal(d, reg, new Rng(seedRng(seed)), present), 'bond_revealed').length > 0) n++;
    }
    return n;
  };

  it('a secret relation is revealed by the seeded roll with others present and becomes known', () => {
    const d = secretWorld();
    let events: ReturnType<typeof rollReveal> = [];
    for (let seed = 1; seed <= 200 && events.length === 0; seed++) {
      const t = secretWorld();
      events = rollReveal(t, reg, new Rng(seedRng(seed)), [ANN, BEA]);
      if (events.length > 0) Object.assign(d, t);
    }
    expect(ofType(events, 'bond_revealed')).toMatchObject([{ unitId: ANN }]);
    expect(pub(d)!.level).toBe('known');
    expect(d.memory.facts.some((f) => f.about.includes(ANN) && f.knownBy.includes('*') && /Ann/.test(f.text))).toBe(true);
  });

  it('uses the P3 numbers: 4 % + 4 % per other, nobody else present means no roll', () => {
    const T = TUNING.relations.affair;
    const two = reveals([ANN, BEA]);
    const four = reveals([ANN, BEA, CAT, 'unit_dee']);
    expect(two).toBeGreaterThan(0);
    expect(two / 200).toBeLessThan((T.base + T.perOther) * 2.5);
    expect(four).toBeGreaterThan(two);
    expect(reveals([ANN])).toBe(0);
    expect(reveals([BEA, CAT])).toBe(0); // she is not there
  });

  it('draws no rng when nobody is eligible (seeded tests do not move)', () => {
    const s = world('known');
    const rng = new Rng(seedRng(7));
    const before = JSON.stringify(rng.state);
    rollReveal(s, reg, rng, [ANN, BEA]);
    expect(JSON.stringify(rng.state)).toBe(before);
  });
});

describe('going public while she leads', () => {
  /** Ann leads (assertive); Bea corporate, Cat autonomous, Dee neither. */
  const stage = (): CampaignState => {
    const s = world('public');
    withBond(s, ANN, { publicity: 'public', leadStyle: 'assertive' });
    s.relations[ANN].publicity = { level: 'known', since: 1 };
    const set = (id: string, v: Partial<CampaignState['squad'][number]['values']>) => { Object.assign(s.squad.find((u) => u.id === id)!.values, { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 }, v); };
    set(BEA, { corporate: 2 });
    set(CAT, { autonomy: 2 });
    set('unit_dee', {});
    return s;
  };
  const rec = (s: CampaignState, id: string) => s.relations[id].impunityRecord ?? 0;

  it('moves the record of corporate units and the trust of autonomy units, once', () => {
    const s = stage();
    const trust = s.relations[CAT].trust;
    const events = setPublicity(s, reg, ANN, 'public', { cause: 'commander' });
    expect(rec(s, BEA)).toBe(TUNING.bonds.publicity.reactions.lostRespectRecord);
    expect(s.relations[CAT].trust).toBe(trust + TUNING.bonds.publicity.reactions.respectTrust);
    expect(rec(s, 'unit_dee')).toBe(0);
    expect(rec(s, ANN)).toBe(0); // the couple do not react to themselves
    expect(s.memory.facts.some((f) => f.knownBy.includes('*') && /The squad knows: Ann and the commander/.test(f.text))).toBe(true);
    expect(ofType(events, 'impunity_changed').length).toBeGreaterThan(0);
    // back to known and public again: nobody reacts twice
    setPublicity(s, reg, ANN, 'known', { cause: 'commander' });
    setPublicity(s, reg, ANN, 'public', { cause: 'commander' });
    expect(rec(s, BEA)).toBe(TUNING.bonds.publicity.reactions.lostRespectRecord);
    expect(s.relations[CAT].trust).toBe(trust + TUNING.bonds.publicity.reactions.respectTrust);
  });

  it('does not happen when she does not lead (yielding, or the commander leads her scene)', () => {
    const yielding = stage();
    withBond(yielding, ANN, { publicity: 'public', leadStyle: 'yielding' });
    setPublicity(yielding, reg, ANN, 'public', { cause: 'commander' });
    expect(rec(yielding, BEA)).toBe(0);
    const ledByCommander = stage();
    ledByCommander.scene = { id: 's1', day: 12, slot: 'morning', locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0, tone: 'romantic', lead: { by: 'commander', unitId: ANN, score: 20 } } as CampaignState['scene'];
    setPublicity(ledByCommander, reg, ANN, 'public', { cause: 'commander' });
    expect(rec(ledByCommander, BEA)).toBe(0);
  });
});

describe('who forgets publicity', () => {
  it('removing her from service forgets it', async () => {
    const { removeFromService } = await import('../../../src/engine/leash/use');
    const s = world();
    s.relations[ANN].publicity = { level: 'known', since: 1 };
    removeFromService(s, ANN, 'terminated');
    expect(pub(s)).toBeUndefined();
  });
});
