import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';
import type { DevelopmentRuleEntry } from './types';

/** The rules the content gate lets through: one tagged with a category that is switched off is ignored (P9d). Registry order. */
export function allowedRules(state: ContentHolder, reg: Registries): DevelopmentRuleEntry[] {
  return [...reg.developmentRules.values()].filter((r) => contentAllowed(state, reg, r)) as unknown as DevelopmentRuleEntry[];
}
