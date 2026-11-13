import type { CampaignState, LedgerEntry } from '../engine/state/types';

/** What caused a ledger entry, in words (by the prefix of the action type). */
const LABELS: Array<[prefix: string, label: string]> = [
  ['activity/', 'activity'],
  ['calendar/', 'day end'],
  ['scene/', 'conversation'],
  ['intents/', 'conversation'],
  ['dm/', 'DMs'],
  ['night/', 'night'],
  ['combat/', 'combat'],
  ['expedition/', 'expedition'],
  ['item/', 'workshop'],
  ['base/', 'base'],
  ['leash/', 'the Leash'],
  ['loyalty/', 'loyalty'],
  ['dilemma/', 'decision'],
  ['arc/', 'defect arc'],
  ['director/', 'world'],
  ['world/', 'world'],
  ['rumor/', 'world'],
  ['mission/', 'mission'],
  ['squad/', 'squad'],
  ['roster/', 'roster'],
  ['proposal/', 'proposal'],
  ['relations/', 'relationships'],
  ['commander/', 'commander'],
  ['memory/', 'conversation'],
];

export function ledgerLabel(action: string): string {
  return LABELS.find(([prefix]) => action.startsWith(prefix))?.[1] ?? 'other';
}

/** The entries for one key from `sinceDay` on, newest first. */
export function ledgerFor(state: CampaignState, key: string, sinceDay: number): LedgerEntry[] {
  return (state.ledger ?? []).filter((e) => e.key === key && e.day >= sinceDay).reverse();
}
