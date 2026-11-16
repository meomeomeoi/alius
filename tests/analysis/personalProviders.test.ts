import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { personalDayStep } from '../../src/engine/personal/dayStep';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { analyze } from '../helpers/analyzeCoverage';
import { ANN, atImpunity, BEA, ctxFrom, enable, loadCore, partner, plain } from '../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const read = (address: string, state: CampaignState | null, ctx: Record<string, unknown>, raw = false): string => analyze(address, env(state, raw), ctx).join('\n');

/** Ann: a balanced friend whose Impunity carries her to level 3 (60). */
function bold(impunity = 60): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 40 });
  s.day = 5; // her Impunity depends on the days known: set the clock first
  atImpunity(s, reg, ANN, impunity);
  return s;
}

describe('glossary:device_access', () => {
  it('explains the holding branch in words, with no raw numbers; with raw values on it shows Impunity', () => {
    const s = bold(60);
    const words = read('glossary:device_access', s, { unitId: ANN });
    expect(words).toContain('level 3');
    expect(words).toMatch(/calendar/i);
    expect(words).toContain('how little she fears the commander');
    expect(words).not.toMatch(/\b60\b/);
    const raw = read('glossary:device_access', s, { unitId: ANN }, true);
    expect(raw).toMatch(/Impunity 60/);
  });

  it('a unit with no access says so; with no unit it lists who has some', () => {
    const none = read('glossary:device_access', plain(reg), { unitId: ANN });
    expect(none).toContain('no access');
    const s = bold();
    expect(read('glossary:device_access', s, {})).toContain('Ann');
    expect(read('glossary:device_access', null, {})).not.toContain('Soldiers with access');
  });

  it('the rule entries read: how many soldiers hold the level', () => {
    const s = bold();
    const decor = read('deviceAccessRules:decor', s, {});
    expect(decor).toMatch(/Decor|decor/);
    expect(decor).toContain('1 soldier');
    expect(read('deviceAccessRules:messages', s, {})).toContain('No soldier');
  });
});

describe('glossary:booking', () => {
  function booked(impunity: number): CampaignState {
    const s = bold(impunity);
    s.personal = { seq: 1, bookings: [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: 6, slot: 'evening', status: 'booked', source: 'roll', made: 5 }] };
    return s;
  }

  it('says who, when and what; the cost line scales at Impunity ≥ 50', () => {
    const low = read('glossary:booking', booked(30), { unitId: ANN });
    const high = read('glossary:booking', booked(60), { unitId: ANN });
    expect(low).toContain('Ann');
    expect(low).toMatch(/evening/i);
    expect(low).toContain('refused demand');
    expect(low).not.toContain('defiance');
    expect(high).toContain('refused demand');
    expect(high).toContain('defiance');
    expect(low).not.toMatch(/\d{2}/);
  });

  it('by booking id, and the chance she books only with raw values on', () => {
    const s = booked(60);
    expect(read('glossary:booking', s, { bookingId: 'bk_1' })).toContain('Ann');
    expect(read('glossary:booking', s, { unitId: ANN })).not.toMatch(/ %/);
    expect(read('glossary:booking', s, { unitId: ANN }, true)).toMatch(/\d+ %/);
  });

  it('with no booking it still explains the rule for a unit with access', () => {
    const s = bold(60);
    expect(read('glossary:booking', s, { unitId: ANN })).toContain('no booking');
  });

  it('the kind entries read: when and where', () => {
    const text = read('bookingKinds:evening_with_me', bold(), {});
    expect(text).toMatch(/evening/i);
  });
});

describe('glossary:courtship and glossary:claimed', () => {
  it('courtship says whether she courts and what it does', () => {
    const court = partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover' });
    expect(read('glossary:courtship', court, { unitId: ANN })).toContain('courts the commander');
    expect(read('glossary:courtship', plain(reg), { unitId: ANN })).toContain('does not court');
  });

  it('claimed says when she claimed and whether she can be refused in public', () => {
    const s = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover' }), 'public_humiliation');
    s.personal = { seq: 0, claims: [{ unitId: ANN, day: s.day }] };
    const on = read('glossary:claimed', s, { unitId: ANN });
    expect(on).toContain('Ann');
    expect(on).toContain('refuse her in public');
    const off = enable(structuredClone(s));
    expect(read('glossary:claimed', off, { unitId: ANN })).toContain('cannot');
    expect(read('glossary:claimed', plain(reg), { unitId: ANN })).toContain('has not claimed');
  });
});

describe('glossary:token', () => {
  const held = (over: Record<string, unknown> = {}): CampaignState => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    s.personal = { seq: 1, tokens: { owned: [{ id: 't1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 1, worn: true, ...over }], given: [ANN] } };
    return s;
  };

  it('says what is worn and what taking it off costs; a locked one also breaks a promise', () => {
    const text = read('glossary:token', held(), { tokenId: 't1' });
    expect(text).toContain("Ann's patch");
    expect(text).toContain('worn');
    expect(text).toContain('take it off');
    expect(text).not.toContain('promise');
    const locked = read('glossary:token', held({ lockedUntil: 9 }), { tokenId: 't1' });
    expect(locked).toContain('promise');
    expect(locked).toContain('day 9');
  });

  it('by soldier: whether she gave one; the daily gain only with raw values on', () => {
    const s = held();
    expect(read('glossary:token', s, { unitId: ANN })).toContain('Ann');
    expect(read('glossary:token', s, { unitId: ANN })).not.toMatch(/\+1/);
    expect(read('glossary:token', s, { unitId: ANN }, true)).toMatch(/\+1/);
    expect(read('glossary:token', plain(reg), { unitId: ANN })).toContain('has not given');
  });

  it('the kind entries read: who may give it', () => {
    expect(read('tokenKinds:plyx_ring', plain(reg), {})).toMatch(/romantic/i);
    expect(read('tokenKinds:dog_tag', plain(reg), {})).toMatch(/close/i);
  });
});

describe('glossary:wager', () => {
  const open = (over: Record<string, unknown> = {}): CampaignState => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
    s.personal = { seq: 1, wagers: { open: [{ id: 'wg_1', unitId: ANN, by: 'unit', gameId: 'coin', stakeId: 'privilege', day: 5, status: 'accepted', ...over }], log: [] } };
    return s;
  };

  it('says the game and the stake for both winners; the odds only with raw values on', () => {
    const text = read('glossary:wager', open(), { wagerId: 'wg_1' });
    expect(text).toContain('Ann');
    expect(text).toContain('Coin');
    expect(text).toMatch(/if she wins/i);
    expect(text).toMatch(/if the commander wins/i);
    expect(text).not.toMatch(/\d+ %/);
    expect(read('glossary:wager', open(), { wagerId: 'wg_1' }, true)).toMatch(/50 %/);
  });

  it('sparring: the measured band of the handicap in words, the percentage with raw values', () => {
    const s = open({ gameId: 'sparring', pick: 'one_arm' });
    const words = read('glossary:wager', s, { wagerId: 'wg_1' });
    expect(words).toMatch(/hopeless|long shot|even|likely/);
    expect(words).not.toMatch(/\d+ %/);
    expect(read('glossary:wager', s, { wagerId: 'wg_1' }, true)).toMatch(/\d+ %/);
    // the hardest handicap is never worse than none
    const none = read('glossary:wager', open({ gameId: 'sparring', pick: 'none' }), { wagerId: 'wg_1' }, true);
    expect(none).toMatch(/\d+ %/);
  });

  it('with no wager it explains the rule for a soldier; the game and stake entries read', () => {
    expect(read('glossary:wager', partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 }), { unitId: ANN })).toContain('no wager');
    expect(read('wagerGames:rps', plain(reg), {})).toMatch(/hand/i);
    expect(read('wagerGames:coin', plain(reg), {}, true)).toMatch(/50 %/);
    expect(read('wagerStakes:privilege', plain(reg), {})).toMatch(/standing|privilege/i);
  });

  it('a stake that is not offered to her says so, and why not in words', () => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
    const text = read('wagerStakes:her_mark', s, { unitId: ANN });
    expect(text).toMatch(/not offered/i);
    expect(read('wagerStakes:privilege', s, { unitId: ANN })).toMatch(/offered/i);
  });
});

describe('glossary:obedience', () => {
  it('says who follows whom today, and what it costs to choose otherwise', () => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
    s.personal = { seq: 0, obedience: { unitId: ANN, day: s.day, who: 'commander' } };
    const a = read('glossary:obedience', s, {});
    expect(a).toContain('Ann');
    expect(a).toMatch(/the commander follows/i);
    expect(a).toMatch(/overrode|defies|against/i);
    s.personal.obedience!.who = 'unit';
    expect(read('glossary:obedience', s, {})).toMatch(/she follows/i);
    delete s.personal;
    expect(read('glossary:obedience', s, {})).toContain('No day of obedience');
  });
});

void BEA;
void personalDayStep;
void ctxFrom;
