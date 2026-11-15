import { bondOf, enabledCategories } from '../../engine/bonds';
import type { Registries } from '../../content/types';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';
import type { AnalyzeEnv } from '../model';

/**
 * Readings of the bond layer (P9d): which content categories are on, and a unit's bond profile. Everything here is the
 * player's own choice or her card's profile, shown as words; Want, lead and publicity readings come with their own tasks and
 * read through `Knowledge`.
 */

const orderedCategories = (reg: Registries) => [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order));
const link = (id: string, label: string) => `[[contentCategories:${id}|${label}]]`;
/** Text from a card or the player must never become a link. */
const plain = (t: string): string => t.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();

function categoryProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  if (!env.state || !env.registries.contentCategories.has(subject.id)) return null;
  return { lines: [enabledCategories(env.state).includes(subject.id) ? 'In this campaign: switched on.' : 'In this campaign: off. It is excluded from every generation.'] };
}

function categoriesGlossaryProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  if (!env.state) return null;
  const on = enabledCategories(env.state);
  const list = orderedCategories(env.registries).filter((c) => on.includes(String(c.id))).map((c) => link(String(c.id), String(c.label)));
  return { lines: [list.length === 0 ? 'Switched on: nothing. Every category is off.' : `Switched on: ${list.join(', ')}.`] };
}

function bondProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const unit = env.state && unitId !== null ? env.state.squad.find((u) => u.id === unitId) : undefined;
  const bond = unit ? bondOf(unit) : null;
  if (!bond) return null;
  const lines = [`Leads: ${bond.leadStyle}. Attaches: ${bond.attachment}. Desire: ${bond.desire}.`];
  if (bond.caretaker) lines.push('A caretaker: she looks after others at her own cost.');
  lines.push(`She wants a relationship to be: ${bond.publicity}.`);
  const cats = orderedCategories(env.registries).filter((c) => bond.ownLimits.categories.includes(String(c.id))).map((c) => link(String(c.id), String(c.label)));
  const note = plain(bond.ownLimits.note ?? '');
  if (cats.length > 0) lines.push(`She will not take part in: ${cats.join(', ')}.${note !== '' ? ` ${note}` : ''}`);
  else if (note !== '') lines.push(`Her own limit: ${note}`);
  return { lines };
}

/** Registers the P9d readings (called from `registerCoreProviders`). */
export function registerBondsProviders(): void {
  registerAnalyzeProvider('contentCategories', categoryProvider);
  registerAnalyzeProvider('glossary:content_categories', categoriesGlossaryProvider);
  registerAnalyzeProvider('glossary:bond_profile', bondProvider);
}
