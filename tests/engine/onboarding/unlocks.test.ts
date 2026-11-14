import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { lockedTabs, unlockedBetween } from '../../../src/engine/onboarding';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const sorted = (s: Set<string>) => [...s].sort();
const prologue = () => campaign(reg, 4, { onboarding: 'prologue' });

describe('lockedTabs', () => {
  it('prologue day 1: squad, comms open; ops, map, base, inv locked', () => {
    expect(sorted(lockedTabs(prologue(), reg))).toEqual(['base', 'inv', 'map', 'ops']);
  });

  it('log and sys have no row, so they are never locked', () => {
    const locked = lockedTabs(prologue(), reg);
    expect(locked.has('log')).toBe(false);
    expect(locked.has('sys')).toBe(false);
  });

  it('skipping or finishing the tutorial opens ops and map', () => {
    const skipped = prologue();
    skipped.onboarding!.skipped.push('tutorial');
    expect(sorted(lockedTabs(skipped, reg))).toEqual(['base', 'inv']);
    const finished = prologue();
    finished.onboarding!.completed.push('tutorial');
    expect(sorted(lockedTabs(finished, reg))).toEqual(['base', 'inv']);
  });

  it('day 2 opens base and inv by date alone', () => {
    const s = prologue();
    s.day = 2;
    expect(sorted(lockedTabs(s, reg))).toEqual(['map', 'ops']);
    s.day = 3;
    expect(sorted(lockedTabs(s, reg))).toEqual(['map', 'ops']);
  });

  it('done opens all', () => {
    const s = prologue();
    s.onboarding!.done = true;
    expect(lockedTabs(s, reg).size).toBe(0);
  });

  it('old save locks nothing', () => {
    expect(lockedTabs(campaign(reg, 4), reg).size).toBe(0);
  });

  it('no onboarding locks nothing, even with unlock rows in the content', () => {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    delete s.onboarding;
    expect(reg.uiUnlocks.size).toBeGreaterThan(0);
    expect(lockedTabs(s, reg).size).toBe(0);
  });

  it('a tab needs every row of it to hold', () => {
    const copy = { ...reg, uiUnlocks: new Map(reg.uiUnlocks) } as Registries;
    copy.uiUnlocks.set('extra', { id: 'extra', target: { tab: 'squad' }, condition: { minDay: 5 }, notice: 'x' });
    expect(lockedTabs(prologue(), copy).has('squad')).toBe(true);
    const later = prologue();
    later.day = 5;
    expect(lockedTabs(later, copy).has('squad')).toBe(false);
  });

  it('a row with both conditions needs both', () => {
    const copy = { ...reg, uiUnlocks: new Map() } as Registries;
    copy.uiUnlocks.set('both', { id: 'both', target: { tab: 'ops' }, condition: { minDay: 2, afterStep: 'tutorial' }, notice: 'x' });
    const s = prologue();
    s.day = 2;
    expect(lockedTabs(s, copy).has('ops')).toBe(true);
    s.onboarding!.completed.push('tutorial');
    expect(lockedTabs(s, copy).has('ops')).toBe(false);
  });
});

describe('unlockedBetween', () => {
  const tabs = (before: CampaignState, after: CampaignState) => unlockedBetween(before, after, reg).map((e) => (e.target as { tab: string }).tab).sort();

  it('lists ops and map after the tutorial', () => {
    const before = prologue();
    const after = structuredClone(before);
    after.onboarding!.completed.push('tutorial');
    expect(tabs(before, after)).toEqual(['map', 'ops']);
    expect(unlockedBetween(before, after, reg)[0].notice).toMatch(/MODULE ONLINE/);
  });

  it('lists base and inv when day 2 begins', () => {
    const before = prologue();
    const after = structuredClone(before);
    after.day = 2;
    expect(tabs(before, after)).toEqual(['base', 'inv']);
  });

  it('lists everything still locked when the prologue ends', () => {
    const before = prologue();
    const after = structuredClone(before);
    after.onboarding!.done = true;
    expect(tabs(before, after)).toEqual(['base', 'inv', 'map', 'ops']);
  });

  it('is empty when nothing changed, and for a campaign without a prologue', () => {
    const s = prologue();
    expect(tabs(s, structuredClone(s))).toEqual([]);
    const old = campaign(reg, 4);
    expect(tabs(old, structuredClone(old))).toEqual([]);
  });

  it('does not list a tab that was open before', () => {
    const before = prologue();
    before.day = 2;
    const after = structuredClone(before);
    after.onboarding!.completed.push('tutorial');
    expect(tabs(before, after)).toEqual(['map', 'ops']);
  });
});
