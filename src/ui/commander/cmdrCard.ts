import type { Registries } from '../../content/types';
import { commanderProfile, descriptor } from '../../engine/commander/profile';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h, type Child } from '../dom';

export interface CmdrCardCtx {
  state: CampaignState;
  registries: Registries;
  /** "Show raw values": the numbers join the descriptors. */
  raw: boolean;
}

/**
 * The CMDR dossier (P7): crime, body, expression, seasoning, build and traits, as descriptors; numbers only with raw
 * values. Text from content goes in as text. The reputation slot stays empty until P9 fills it.
 */
export function renderCmdrCard(host: HTMLElement, ctx: CmdrCardCtx): void {
  const { state, registries: reg, raw } = ctx;
  const p = commanderProfile(state);
  const word = (kind: 'strength' | 'endurance' | 'reflexes' | 'expression' | 'seasoning', value: number): string =>
    `${descriptor(kind, value)}${raw ? ` (${value})` : ''}`;
  const stat = (label: string, address: string, text: string): Child[] => [
    `${label} `, h('span', { class: 'alius-stat', ...analyzeAttrs(address) }, text),
  ];
  const crime = state.commander.crimeId ? reg.crimes.get(state.commander.crimeId) : undefined;
  const traitIds = [...p.traits.regular, ...(p.traits.special !== undefined ? [p.traits.special] : [])];

  host.append(
    h('section', { class: 'alius-section alius-cmdr' },
      h('h2', {}, `CMDR — ${state.commander.name}`),
      crime
        ? h('p', {}, 'CRIME: ', h('span', { class: 'alius-chip', ...analyzeAttrs(`crimes:${crime.id}`) }, String(crime.name)))
        : null,
      h('p', { class: 'alius-cmdr-stats' },
        ...stat('STRENGTH', 'glossary:body_strength', word('strength', p.body.strength)), ' · ',
        ...stat('ENDURANCE', 'glossary:body_endurance', word('endurance', p.body.endurance)), ' · ',
        ...stat('REFLEXES', 'glossary:body_reflexes', word('reflexes', p.body.reflexes))),
      h('p', {},
        ...stat('EXPRESSION', 'glossary:expression', word('expression', p.expression)), ' · ',
        ...stat('SEASONING', 'glossary:seasoning', word('seasoning', p.seasoning)), ' · BUILD ',
        h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:archetype') }, p.archetype)),
      h('p', {}, 'TRAITS: ', ...(traitIds.length === 0
        ? ['NONE']
        : traitIds.flatMap((id, i): Child[] => [
          i === 0 ? '' : ' · ',
          h('span', { class: 'alius-chip', ...analyzeAttrs(`commanderTraits:${id}`) }, String(reg.commanderTraits.get(id)?.name ?? id)),
        ]))),
      h('p', { class: 'alius-dim' }, 'REPUTATION — NONE ON FILE')),
  );
}
