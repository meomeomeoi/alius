import { buildKnowledge } from '../../analysis/knowledge';
import type { CampaignState, Fact } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { WORLD } from '../../engine/memory/fold';

export interface MemoryBlockCtx {
  state: CampaignState;
  settings: AliusSettings;
  /** A unit id, or `*` for the world. */
  target: string;
  dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  /** Asks before something is forgotten for good. */
  confirm: (text: string) => Promise<boolean>;
  /** Called after the engine took a change (the tab draws the block again). */
  onChanged?: () => void;
}

const about = (f: Fact, target: string): boolean => (target === WORLD ? f.about.length === 0 || f.about.includes('world') : f.about.includes(target));

/** SEEN: she was there; HEARD: it reached her as a rumor; PUBLIC: everyone knows. */
const audienceChip = (f: Fact): { id: 'seen' | 'heard' | 'public'; label: string; address: string } =>
  f.knownBy.includes('*') ? { id: 'public', label: 'PUBLIC', address: 'glossary:memory' }
    : f.heard !== undefined && Object.keys(f.heard).length > 0 ? { id: 'heard', label: 'HEARD', address: 'glossary:squad_rumor' }
      : { id: 'seen', label: 'SEEN', address: 'glossary:memory' };

/**
 * The MEMORY view (P3b §9): the dossier of one unit (or of the world) and the facts about her, newest first, through `Knowledge` (a fact
 * hidden from the commander is not listed). PIN / UNPIN and FORGET are always there; EDIT of a fact and of the dossier only with the
 * mechanics edit lock off. Text only.
 */
export function renderMemoryBlock(host: HTMLElement, ctx: MemoryBlockCtx): void {
  const { state, target } = ctx;
  const unlocked = !ctx.settings.editLock;
  const send = (action: { type: string; payload?: unknown }): void => {
    ctx.dispatch(action);
    ctx.onChanged?.();
  };
  const all = buildKnowledge(state, ctx.settings).facts().filter((f) => about(f, target));
  const order = new Map(state.memory.facts.map((f, i) => [f.id, i]));
  const list = [...all].sort((a, b) => b.day - a.day || order.get(b.id)! - order.get(a.id)!);
  const dossier = state.memory.dossiers?.[target];

  const dossierBlock = h('div', { class: 'alius-memory-dossier' });
  const drawDossier = (editing: boolean): void => {
    if (editing) {
      const own = h('textarea', { class: 'alius-input', rows: '3', 'aria-label': 'Private part of the dossier' }) as HTMLTextAreaElement;
      const shared = h('textarea', { class: 'alius-input', rows: '3', 'aria-label': 'Shared part of the dossier' }) as HTMLTextAreaElement;
      own.value = dossier?.own ?? '';
      shared.value = dossier?.shared ?? '';
      dossierBlock.replaceChildren(
        ...(target === WORLD ? [] : [h('label', {}, 'PRIVATE', own)]), h('label', {}, 'SHARED', shared),
        h('div', { class: 'alius-memory-actions' },
          h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'save-dossier', ...analyzeNative('glossary:dossier'), onclick: () => send({ type: 'memory/edit_dossier', payload: { target, ...(target === WORLD ? {} : { own: own.value }), shared: shared.value } }) }, '[ SAVE ]'),
          h('button', { type: 'button', class: 'alius-btn', onclick: () => drawDossier(false) }, '[ CANCEL ]')));
      return;
    }
    const hasText = dossier !== undefined && (dossier.own !== '' || dossier.shared !== '');
    dossierBlock.replaceChildren(
      h('p', { class: 'alius-stat', ...analyzeAttrs('glossary:dossier', target === WORLD ? {} : { unitId: target }) }, 'DOSSIER'),
      // the world's private part is never read (nothing in a prompt carries it), so it is not shown either
      ...(target !== WORLD && dossier?.own ? [h('p', { 'data-part': 'own' }, `PRIVATE: ${dossier.own}`)] : []),
      ...(dossier?.shared ? [h('p', { 'data-part': 'shared' }, `SHARED: ${dossier.shared}`)] : []),
      ...(hasText ? [] : [h('p', { class: 'alius-dim' }, 'Nothing folded yet.')]),
      ...(unlocked ? [h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'edit-dossier', ...analyzeNative('glossary:dossier'), onclick: () => drawDossier(true) }, '[ EDIT DOSSIER ]')] : []),
    );
  };
  drawDossier(false);

  const factRow = (f: Fact): HTMLElement => {
    const chip = audienceChip(f);
    const text = h('span', { 'data-role': 'text' }, f.text);
    const row = h('div', { class: 'alius-memory-fact', 'data-fact': f.id });
    const draw = (editing: boolean): void => {
      if (editing) {
        const ta = h('textarea', { class: 'alius-input', rows: '2', 'aria-label': 'Fact text' }) as HTMLTextAreaElement;
        ta.value = f.text;
        row.replaceChildren(ta, h('div', { class: 'alius-memory-actions' },
          h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'save', ...analyzeNative('glossary:memory'), onclick: () => send({ type: 'memory/edit', payload: { factId: f.id, text: ta.value } }) }, '[ SAVE ]'),
          h('button', { type: 'button', class: 'alius-btn', onclick: () => draw(false) }, '[ CANCEL ]')));
        return;
      }
      row.replaceChildren(
        h('div', { class: 'alius-memory-fact-head' },
          h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:memory') }, `DAY ${f.day}`), ' ',
          h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:memory') }, `IMPORTANCE ${f.importance}`), ' ',
          h('span', { class: 'alius-chip', 'data-chip': chip.id, ...analyzeAttrs(chip.address) }, chip.label), ' ',
          ...(f.pinned ? [h('span', { class: 'alius-chip', 'data-chip': 'pinned', ...analyzeAttrs('glossary:pinned_fact') }, 'PINNED')] : []),
          ...(f.edited ? [h('span', { class: 'alius-dim' }, 'edited')] : [])),
        text,
        h('div', { class: 'alius-memory-actions' },
          h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'pin', ...analyzeNative('glossary:pinned_fact'), onclick: () => send({ type: 'memory/pin', payload: { factId: f.id, pinned: f.pinned !== true } }) }, f.pinned ? '[ UNPIN ]' : '[ PIN ]'),
          h('button', {
            type: 'button', class: 'alius-btn alius-option', 'data-action': 'forget', ...analyzeNative('glossary:memory'),
            onclick: () => { void ctx.confirm('Forget this fact? It is removed from the squad\'s memory for good.').then((yes) => { if (yes) send({ type: 'memory/forget', payload: { factId: f.id } }); }); },
          }, '[ FORGET ]'),
          ...(unlocked ? [h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'edit', ...analyzeNative('glossary:memory'), onclick: () => draw(true) }, '[ EDIT ]')] : [])));
    };
    draw(false);
    return row;
  };

  host.replaceChildren(h('section', { class: 'alius-memory-block', 'data-memory-target': target },
    h('h4', {}, 'MEMORY'),
    dossierBlock,
    ...(list.length === 0 ? [h('p', { class: 'alius-dim' }, 'Nothing remembered yet.')] : list.map(factRow))));
}
