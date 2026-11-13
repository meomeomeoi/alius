import { describe, expect, it } from 'vitest';
import { ledgerFor, ledgerLabel } from '../../src/analysis/ledger';
import { createCampaign } from '../../src/engine/state/create';
import type { LedgerEntry } from '../../src/engine/state/types';

describe('ledger reads', () => {
  it('labels an action by its prefix', () => {
    const cases: Record<string, string> = {
      'activity/do': 'activity', 'calendar/consume_slot': 'day end', 'scene/exchange': 'conversation', 'intents/apply': 'conversation',
      'dm/send': 'DMs', 'night/open': 'night', 'combat/accept': 'combat', 'expedition/return': 'expedition', 'item/craft': 'workshop',
      'base/upgrade': 'base', 'leash/compel': 'the Leash', 'loyalty/yield': 'loyalty', 'dilemma/choose': 'decision', 'arc/decide': 'defect arc',
      'director/apply': 'world', 'debug/roll': 'other', 'mystery': 'other', '': 'other',
    };
    for (const [action, label] of Object.entries(cases)) expect(ledgerLabel(action), action).toBe(label);
  });

  it('ledgerFor filters by key and day and returns the newest first', () => {
    const s = createCampaign({ seed: 1, commanderName: 'V' });
    const e = (day: number, key: string, delta: number): LedgerEntry => ({ day, slot: 'morning', action: 'x', key, delta });
    s.ledger = [e(1, 'res:credits', 1), e(3, 'res:credits', 2), e(3, 'res:plyx', 9), e(5, 'res:credits', 3)];
    expect(ledgerFor(s, 'res:credits', 3).map((x) => x.delta)).toEqual([3, 2]);
    expect(ledgerFor(s, 'res:credits', 0).map((x) => x.delta)).toEqual([3, 2, 1]);
    expect(ledgerFor(s, 'res:nothing', 0)).toEqual([]);
    delete s.ledger;
    expect(ledgerFor(s, 'res:credits', 0)).toEqual([]);
  });
});
