import type { Registries } from '../../content/types';
import {
  BODY_STATS, DESCRIPTORS, archetypeOf, descriptor, poolSpent, traitBlockReason, type CommanderSetup,
} from '../../engine/commander/profile';
import { TUNING } from '../../engine/tuning';
import type { BodyStat } from '../../engine/state/types';
import type { CommanderImportState } from '../../setup/wizard';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What the form asks its owner to change; the owner (wizard or review modal) applies and re-renders. */
export type CommanderPatch =
  | { kind: 'body'; stat: BodyStat; value: number }
  | { kind: 'expression'; value: number }
  | { kind: 'seasoning'; value: number }
  | { kind: 'trait'; id: string };

export interface CommanderFileCtx {
  value: CommanderSetup;
  registries: Registries;
  desireBondDefects: boolean;
  onChange: (patch: CommanderPatch) => void;
  /** Absent = no PREFILL FROM PERSONA button. */
  onPrefill?: () => void;
  /** Absent = no RANDOM COMMANDER button. */
  onRandom?: () => void;
  importStatus?: CommanderImportState;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The COMMANDER FILE form, shared by the setup wizard and the review modal of an old campaign (P7). Everything about
 * the commander is shown as a descriptor; the only number is the creation budget (`POINTS LEFT`), which is not a stat.
 * All text from content goes in as text.
 */
export function renderCommanderFile(host: HTMLElement, ctx: CommanderFileCtx): void {
  const { value: c, registries: reg, onChange } = ctx;
  host.replaceChildren();

  // --- body
  const spent = poolSpent(c.body);
  const left = TUNING.commander.pool - spent;
  const row = (stat: BodyStat): HTMLElement => {
    const v = c.body[stat];
    const step = (sign: '+' | '-', next: number, disabled: boolean) =>
      h('button', {
        type: 'button', class: 'alius-btn alius-step-btn', 'data-body': stat, 'data-step': sign, disabled,
        'aria-label': `${sign === '+' ? 'Raise' : 'Lower'} ${stat}`,
        onclick: () => onChange({ kind: 'body', stat, value: next }),
      }, sign === '+' ? '+' : '−');
    return h('div', { class: 'alius-cmdr-row' },
      h('span', { class: 'alius-cmdr-label' }, cap(stat)),
      step('-', v - 1, v <= 1),
      h('span', { class: 'alius-stat', ...analyzeAttrs(`glossary:body_${stat}`) }, descriptor(stat, v)),
      step('+', v + 1, v >= TUNING.commander.creationMax || left <= 0));
  };
  const archetype = archetypeOf(c.body);
  host.append(
    h('section', { class: 'alius-section alius-cmdr-body' },
      h('h3', {}, 'BODY'),
      ...BODY_STATS.map(row),
      h('p', { class: 'alius-hint' }, `POINTS LEFT ${left}`),
      h('p', {}, 'BUILD: ', h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:archetype') }, archetype))),
  );

  // --- expression and seasoning
  const picker = (kind: 'expression' | 'seasoning', current: number): HTMLElement =>
    h('div', { class: 'alius-cmdr-pick' }, ...DESCRIPTORS[kind].map((word, i) =>
      h('button', {
        type: 'button', class: 'alius-btn alius-option', [`data-${kind}`]: String(i + 1), 'aria-pressed': String(current === i + 1),
        ...analyzeNative(`glossary:${kind}`), onclick: () => onChange({ kind, value: i + 1 }),
      }, word)));
  host.append(
    h('section', { class: 'alius-section' }, h('h3', {}, 'EXPRESSION'), picker('expression', c.expression)),
    h('section', { class: 'alius-section' }, h('h3', {}, 'SEASONING'), picker('seasoning', c.seasoning)),
  );

  // --- traits
  const chosen = new Set([...c.traits.regular, ...(c.traits.special !== undefined ? [c.traits.special] : [])]);
  const reasons = ctx.importStatus?.reasons ?? {};
  const card = (id: string): HTMLElement => {
    const t = reg.commanderTraits.get(id)!;
    const blocked = traitBlockReason(reg, c.traits, id, { desireBondDefects: ctx.desireBondDefects });
    const on = chosen.has(id);
    return h('button', {
      type: 'button', class: `alius-card alius-option alius-trait-card${t.kind === 'special' ? ' alius-trait-special' : ''}`,
      // soft-disabled (aria-disabled, not `disabled`): a greyed card stays focusable and hoverable for the analysis panel
      'data-trait': id, 'aria-pressed': String(on), 'aria-disabled': blocked !== null ? 'true' : null, title: blocked,
      ...analyzeNative(`commanderTraits:${id}`), onclick: () => { if (blocked === null) onChange({ kind: 'trait', id }); },
    },
      h('strong', {}, String(t.name)),
      t.kind === 'special' ? h('span', { class: 'alius-dim' }, ' SPECIAL') : null,
      h('p', {}, `UP: ${String(t.upside)}`),
      h('p', {}, `DOWN: ${String(t.downside)}`),
      on && reasons[id] ? h('p', { class: 'alius-dim' }, `Why: ${reasons[id]}`) : null);
  };
  const all = [...reg.commanderTraits.values()];
  host.append(
    h('section', { class: 'alius-section' },
      h('h3', {}, 'TRAITS'),
      h('p', { class: 'alius-hint' }, `Up to ${TUNING.commander.maxRegular} regular traits and one special. A trait changes how the commander plays, not how strong the commander is.`),
      h('div', { class: 'alius-cards' }, ...all.filter((t) => t.kind === 'regular').map((t) => card(t.id))),
      all.some((t) => t.kind === 'special') ? h('h4', {}, 'SPECIAL') : null,
      h('div', { class: 'alius-cards' }, ...all.filter((t) => t.kind === 'special').map((t) => card(t.id)))),
  );

  // --- prefill and random
  const st = ctx.importStatus;
  if (ctx.onPrefill || ctx.onRandom) {
    host.append(
      h('div', { class: 'alius-row alius-cmdr-actions' },
        ctx.onPrefill
          ? h('button', { type: 'button', class: 'alius-btn', 'data-action': 'prefill', disabled: st?.status === 'loading', onclick: ctx.onPrefill }, 'PREFILL FROM PERSONA')
          : null,
        ctx.onRandom ? h('button', { type: 'button', class: 'alius-btn', 'data-action': 'random', onclick: ctx.onRandom }, 'RANDOM COMMANDER') : null),
    );
  }
  const note = (text: string): HTMLElement => h('p', { class: 'alius-status', role: 'status' }, text);
  if (st?.status === 'loading') host.append(note('READING THE PERSONA…'));
  else if (st?.status === 'manual') host.append(note(`MANUAL — ${st.notice ?? 'fill the form by hand.'}`));
  else if (st?.status === 'ready') {
    host.append(note(`PREFILLED${st.source ? ` from the persona "${st.source}"` : ''} — check every field.`));
    if (st.notes) host.append(h('p', { class: 'alius-hint' }, `Note: ${st.notes}`));
  }
}
