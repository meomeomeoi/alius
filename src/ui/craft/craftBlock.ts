/**
 * CMDR › CRAFT (P16b, plan Task 5): the commander's disciplines as words, then for each woman what the commander has learnt of her: her rhythm as a word, the postures known, the foot
 * signals she has named, and her records as margin lines in her hand ("Day 12 — 3 minutes under my weight."), composed from the `craftLines` registry. Every value comes through
 * `Knowledge.craft` (the xp only with raw values); every chip carries `data-analyze`. No pronoun for the commander: her lines are in the first person.
 */
import type { CraftLineEntry } from '../../content/schemas';
import type { Registries } from '../../content/types';
import { plainDraft } from '../../content/draft';
import { spanText } from '../../engine/craft/state';
import type { CraftView } from '../../engine/craft/view';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h, type Child } from '../dom';
import { setHand } from '../notes/note';
import { herHand } from '../stage/look';

/** The line template of a kind (`record.noTap`, `where.weight`, `signal.stamp`), as a player reads it (the draft marker stripped); `undefined` when there is none. */
export function lineOf(reg: Registries, kind: string): string | undefined {
  for (const row of reg.craftLines.values() as IterableIterator<CraftLineEntry>) if (row.kind === kind) return plainDraft(row.text);
  return undefined;
}

/** A record as her margin line: the kind's template with the day, the time in fiction and where. */
export function recordLine(reg: Registries, r: CraftView['pairs'][number]['records'][number]): string {
  const where = lineOf(reg, `where.${r.key}`) ?? lineOf(reg, 'where.default') ?? '';
  const template = lineOf(reg, `record.${r.kind}`) ?? 'Day {day} — {span} {where}.';
  return template.replace('{day}', String(r.day)).replace('{span}', spanText(r.seconds)).replace('{where}', where);
}

const labelOf = (reg: Registries, key: string): string => {
  const physics = key.startsWith('endurance:') ? reg.contactPhysics.get(key.slice('endurance:'.length)) : undefined;
  return String(physics !== undefined ? physics.label : key).toUpperCase();
};

/** The addresses of the chips: a discipline has its glossary entry, the endurance of a physics the physics' own reading (as HOLDS does). */
const addressOf = (key: string): string => (key.startsWith('endurance:') ? `contactPhysics:${key.slice('endurance:'.length)}` : `glossary:craft_${key}`);

export interface CraftBlockCtx {
  state: CampaignState;
  registries: Registries;
  /** `Knowledge.craft(reg)`: the only source of what is shown. */
  view: CraftView;
  /** The physics HOLDS already lists as chips: CRAFT does not repeat them. */
  skip?: readonly string[];
}

/** The block: the disciplines' line, then a line for each pair with her margin lines under it. */
export function renderCraftBlock(ctx: CraftBlockCtx): HTMLElement {
  const { state, registries: reg, view } = ctx;
  const skip = new Set(ctx.skip ?? []);
  const shown = view.disciplines.filter((d) => !(d.key.startsWith('endurance:') && skip.has(d.key.slice('endurance:'.length))));
  const name = (unitId: string): string => state.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  return h('div', { class: 'alius-craft', 'data-craft': '' },
    h('p', { 'data-craft-disciplines': '', ...analyzeAttrs('glossary:craft') }, 'CRAFT — ', ...shown.flatMap((d, i): Child[] => [
      i === 0 ? '' : ' · ',
      h('span', { class: 'alius-chip', 'data-craft-discipline': d.key, ...analyzeAttrs(addressOf(d.key)) }, `${labelOf(reg, d.key)}: ${d.word.toUpperCase()}${d.xp !== undefined ? ` (${d.xp})` : ''}`),
    ])),
    ...view.pairs.flatMap((p): Child[] => {
      const bits: Child[] = [h('span', { class: 'alius-chip', 'data-craft-rhythm': '', ...analyzeAttrs('glossary:craft_rhythm', { unitId: p.unitId }) }, `RHYTHM: ${p.rhythm.toUpperCase()}`)];
      if (p.postures.length > 0) bits.push(' · ', h('span', { class: 'alius-chip', 'data-craft-postures': '', ...analyzeAttrs('glossary:craft_posture', { unitId: p.unitId }) }, `POSTURES: ${p.postures.length}`));
      if (p.signals.length > 0) {
        bits.push(' · ', h('span', { class: 'alius-chip', 'data-craft-signals': '', ...analyzeAttrs('glossary:craft_memory', { unitId: p.unitId }) },
          `SIGNALS: ${p.signals.map((m) => lineOf(reg, `signal.${m}`) ?? m).join(', ').toUpperCase()}`));
      }
      return [
        h('p', { 'data-craft-pair': p.unitId }, `${name(p.unitId).toUpperCase()} — `, ...bits),
        ...p.records.map((r) => {
          const line = h('p', { class: 'alius-craft-margin', 'data-craft-record': p.unitId, ...analyzeAttrs('glossary:craft_record', { unitId: p.unitId, key: r.key }) }, recordLine(reg, r));
          setHand(line, herHand(state, reg, p.unitId));
          return line;
        }),
      ];
    }));
}
