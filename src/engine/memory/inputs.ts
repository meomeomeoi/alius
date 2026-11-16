import type { Registries } from '../../content/types';
import type { CampaignState, Fact } from '../state/types';
import { factLine } from './audience';
import { memoryConfig } from './config';
import { retrieveFacts } from './facts';
import { journalLines } from './journal';
import { recentLines } from './scenes';

/**
 * What the calls outside a scene (a DM reply, a vignette, a demand wording, the director) are told about memory (P3b §6, "other
 * calls"). Pure reads, so every layer may use them. Each is private to the one unit it is about, or public: nothing of one unit's
 * own dossier or journal reaches a call about another.
 */

/** Her dossier as one paragraph: what only she and the commander know, then what the squad knows. Empty when nothing was folded. */
export function herDossier(state: CampaignState, unitId: string): string {
  const d = state.memory.dossiers?.[unitId];
  return d ? [d.own, d.shared].map((t) => t.trim()).filter(Boolean).join(' ') : '';
}

/** The relation journal lines of one unit, `journalLines` of the config; the evidence only where the player does not read it as story. */
export function herJournal(state: CampaignState, reg: Registries, unitId: string, evidence: boolean): string[] {
  return journalLines(state, reg, unitId, { n: memoryConfig(state).journalLines, evidence });
}

/** The facts she knows that matter now: half of a scene's retrieval (rounded up), as a DM is a smaller prompt. */
export function herFacts(state: CampaignState, unitId: string, tags: string[]): Fact[] {
  return retrieveFacts(state, { participants: [unitId], tags }, Math.ceil(memoryConfig(state).retrievalK / 2));
}

const VIGNETTE_FACTS = 2;

/** Two facts about her (as she would know them) and her journal, as plain lines for the vignette prompt. */
export function vignetteMemory(state: CampaignState, reg: Registries, unitId: string, tags: string[]): string[] {
  const facts = retrieveFacts(state, { participants: [unitId], tags }, VIGNETTE_FACTS).map((f) => factLine(state, f, [unitId]).replace(/^- /, ''));
  return [...facts, ...herJournal(state, reg, unitId, false)];
}

/** The chronicle lines the whole squad knows, for the director. */
export function publicRecent(state: CampaignState): string[] {
  return recentLines(state, 'public', memoryConfig(state));
}

/** What the whole squad remembers of the world (the `shared` part of the world dossier). */
export function worldDossier(state: CampaignState): string {
  return state.memory.dossiers?.['*']?.shared.trim() ?? '';
}
