import type { Registries } from '../../content/types';
import { commanderProfile, descriptor } from '../../engine/commander/profile';
import { commanderHobbyWord } from '../../engine/life/meetings';
import { conditionsOf } from '../../engine/physics/conditions';
import { commanderSkill } from '../../engine/physics/skill';
import { ENDURANCE_WORDS } from '../../analysis/providers/blocking';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h, type Child } from '../dom';
import { commanderStressBand } from '../../engine/special/commanderStress';
import { renderTokens } from '../personal/tokens';
import { renderInterceptLog } from '../special/interceptLog';
import { renderDebtsBlock } from '../special/debtsBlock';
import { renderPremonitions } from '../special/premonitions';
import { renderVoiceCard } from '../voice/voiceCard';

export interface CmdrCardCtx {
  state: CampaignState;
  registries: Registries;
  /** "Show raw values": the numbers join the descriptors. */
  raw: boolean;
  /** P9c: WEAR / TAKE OFF on a token (the TOKENS block). */
  onWear?: (tokenId: string) => void;
  onTakeOff?: (tokenId: string) => void;
}

/**
 * The CMDR dossier (P7): crime, body, expression, seasoning, build and traits, as descriptors; numbers only with raw
 * values. Text from content goes in as text. The reputation line (P9) lists each nickname the squad has given as a chip.
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
  const reputation = state.commander.reputation?.active ?? [];
  const holds = [...reg.contactPhysics.values()].filter((e) => e.skill === true && ['breath', 'weight', 'jaw'].includes(String(e.id))).map((e) => String(e.id));
  const traitIds = [...p.traits.regular, ...(p.traits.special !== undefined ? [p.traits.special] : [])];

  // P14c: what the commander has learned from her, as words (never a number: it has no mechanical value)
  const learned = Object.entries(state.commander.hobbySkill ?? {}).filter(([id]) => reg.hobbies.has(id));
  const file = h('div', {},
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
        h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:archetype') }, p.archetype), ' · ',
        // P12: the commander's own stress, as a band (the number is in the analysis panel with raw values on)
        h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:commander_stress') }, `STRESS: ${commanderStressBand(state)}`)),
      h('p', {}, 'TRAITS: ', ...(traitIds.length === 0
        ? ['NONE']
        : traitIds.flatMap((id, i): Child[] => [
          i === 0 ? '' : ' · ',
          h('span', { class: 'alius-chip', ...analyzeAttrs(`commanderTraits:${id}`) }, String(reg.commanderTraits.get(id)?.name ?? id)),
        ]))),
      reputation.length === 0
        ? h('p', { class: 'alius-dim' }, 'REPUTATION — NONE ON FILE')
        : h('p', {}, 'REPUTATION — ', ...reputation.flatMap((a, i): Child[] => [
          i === 0 ? '' : ' · ',
          h('span', { class: 'alius-chip', ...analyzeAttrs(`reputations:${a.id}`) }, a.name),
        ])),
      learned.length === 0
        ? null
        : h('p', { 'data-commander-hobbies': '' }, 'HOBBIES — ', ...learned.flatMap(([id, skill], i): Child[] => {
          const word = commanderHobbyWord(skill);
          return [
            i === 0 ? '' : ' · ',
            h('span', { class: 'alius-chip', 'data-commander-hobby': id, ...analyzeAttrs('glossary:commander_hobby_skill', { hobbyId: id }) },
              `${String(reg.hobbies.get(id)!.label).toUpperCase()}: ${word === 'none' ? 'NOT YET' : word.toUpperCase()}`),
          ];
        })),
      // P15a: how long the commander lasts in each kind of hold, as words (never xp)
      holds.length === 0
        ? null
        : h('p', { 'data-commander-holds': '', ...analyzeAttrs('glossary:endurance_training') }, 'HOLDS — ', ...holds.flatMap((id, i): Child[] => [
          i === 0 ? '' : ' · ',
          h('span', { class: 'alius-chip', 'data-commander-hold': id, ...analyzeAttrs(`contactPhysics:${id}`) }, `${String(reg.contactPhysics.get(id)!.label).toUpperCase()}: ${ENDURANCE_WORDS[commanderSkill(state, id)]!.toUpperCase()}`),
        ])),
      // P15a: what the commander bears after a hold, as chips (until the day or the slot ends)
      conditionsOf(state).length === 0
        ? null
        : h('p', { 'data-commander-conditions': '' }, 'CONDITION — ', ...conditionsOf(state).flatMap((c, i): Child[] => [
          i === 0 ? '' : ' · ',
          h('span', { class: 'alius-chip', 'data-commander-condition': c.id, ...analyzeAttrs(`commanderConditions:${c.id}`) }, String(reg.commanderConditions.get(c.id)?.label ?? c.id).toUpperCase()),
        ])),
      renderTokens(state, reg, { onWear: (id) => ctx.onWear?.(id), onTakeOff: (id) => ctx.onTakeOff?.(id) }));
  renderInterceptLog(file, state, reg); // P12: nothing without the frequency
  renderPremonitions(file, state, reg); // P12: nothing without the paranoia
  renderDebtsBlock(file, state, reg); // P12: nothing without the debts
  host.append(h('section', { class: 'alius-section alius-cmdr' }, renderVoiceCard({ voice: 'paper', title: `CMDR — ${state.commander.name}`, body: file })));
}
