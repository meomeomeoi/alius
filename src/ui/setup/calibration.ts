import type { Entry, Registries } from '../../content/types';
import { SETUP_LIMITS, normalizeTag } from '../../engine/setup';
import { VALUE_AXES } from '../../engine/state/types';
import { ALL_SECTIONS, type ImportSection } from '../../llm/calls/profileImport';
import { manualOptions, type UnitDraft } from '../../setup/wizard';
import { h } from '../dom';

type Choice = UnitDraft['choice'];
export type CalibrationPatch = Partial<Choice> & { secondDefect?: boolean };

export interface CalibrationCtx {
  draft: UnitDraft;
  registries: Registries;
  desireBondDefects: boolean;
  /** Limits the sections shown (used by re-sync). Default: all. */
  sections?: ImportSection[];
  onUpdate: (patch: CalibrationPatch) => void;
  onRegenerate: (section: ImportSection) => void;
  onManual: () => void;
}

const TAG_FIELDS = [
  ['likes', 'Likes', SETUP_LIMITS.likes],
  ['dislikes', 'Dislikes', SETUP_LIMITS.dislikes],
  ['triggers', 'Triggers (hard lines)', SETUP_LIMITS.triggers],
] as const;

const BASELINE_FIELDS = ['trust', 'affinity', 'attraction'] as const;
const nameOf = (e: Entry | undefined, id: string) => (e ? String(e.name) : `UNKNOWN ${id}`);

function pickCard(cls: string, id: string, selected: boolean, onClick: () => void, ...children: Array<HTMLElement | string>): HTMLElement {
  return h('button', { type: 'button', class: `alius-card ${cls}`, 'data-id': id, 'aria-pressed': String(selected), onclick: onClick }, ...children);
}

function slider(
  label: string, attrs: Record<string, string>, min: number, max: number, value: number, commit: (n: number) => void,
): HTMLElement {
  const shown = h('span', { class: 'alius-slider-value' }, String(value));
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(value), ...attrs }) as HTMLInputElement;
  input.addEventListener('input', () => (shown.textContent = input.value)); // live number while dragging
  input.addEventListener('change', () => commit(Math.round(Number(input.value)))); // commit on release / key step
  return h('label', { class: 'alius-slider' }, h('span', { class: 'alius-slider-label' }, label), input, shown);
}

export function renderCalibration(host: HTMLElement, ctx: CalibrationCtx): void {
  const { draft, registries: reg, onUpdate } = ctx;
  const shown = new Set<ImportSection>(ctx.sections ?? ALL_SECTIONS);
  const manual = draft.status === 'manual';
  const cand = draft.candidates;
  const ch = draft.choice;
  host.replaceChildren();

  // --- status line
  const status =
    draft.status === 'loading' ? 'CALIBRATING…'
    : draft.status === 'idle' ? 'PENDING'
    : manual ? `MANUAL — ${draft.notice ?? 'choose everything from the lists.'}`
    : draft.notice ?? 'CALIBRATED';
  host.append(
    h(
      'div',
      { class: 'alius-calib-head' },
      h('p', { class: 'alius-status', role: 'status' }, status),
      // also while the import is still running, so a slow or hung call can be skipped
      draft.status === 'ready' || draft.status === 'loading'
        ? h('button', { type: 'button', class: 'alius-btn', 'data-action': 'manual', onclick: ctx.onManual }, '[ MANUAL ]')
        : null,
    ),
  );
  if (draft.status === 'loading' || draft.status === 'idle') return;

  const options = manualOptions(reg, ctx.desireBondDefects);
  const section = (id: ImportSection, title: string, ...body: Array<HTMLElement | null>): HTMLElement =>
    h(
      'section',
      { class: 'alius-section alius-calib-section', 'data-section': id },
      h(
        'div',
        { class: 'alius-calib-title' },
        h('h3', {}, title),
        // in manual mode too: after a failed import the AI can be retried section by section
        draft.status === 'ready' || draft.status === 'manual'
          ? h('button', { type: 'button', class: 'alius-btn', 'data-regenerate': id, onclick: () => ctx.onRegenerate(id) }, '[ REGENERATE ]')
          : null,
      ),
      ...body,
    );

  // --- role
  if (shown.has('role')) {
    const fromCandidates = !manual && cand && cand.roleCandidates.length > 0;
    const list = fromCandidates
      ? cand.roleCandidates.map((c) => ({ id: c.roleId, reason: c.reason }))
      : options.roles.map((r) => ({ id: r.id, reason: '' }));
    host.append(
      section('role', 'ROLE', h('div', { class: 'alius-cards' }, ...list.map(({ id, reason }) => {
        const role = reg.roles.get(id);
        return pickCard('alius-role-card', id, ch.roleId === id, () => onUpdate({ roleId: id }),
          h('strong', {}, nameOf(role, id)),
          h('span', {}, role ? ` — ${String(role.summary)}` : ''),
          reason ? h('em', {}, ` ${reason}`) : '');
      }))),
    );
  }

  // --- signature
  if (shown.has('signature')) {
    const fromCandidates = !manual && cand && cand.signatureCandidates.length > 0;
    const list = fromCandidates
      ? cand.signatureCandidates
      : options.signatures.map((s) => ({ templateId: s.id, name: String(s.name), description: String(s.mechanic) }));
    const cur = ch.signature;
    const tpl = cur ? reg.signatures.get(cur.templateId) : undefined;
    host.append(
      section('signature', 'SIGNATURE SKILL',
        h('div', { class: 'alius-cards' }, ...list.map((c) =>
          pickCard('alius-sig-card', c.templateId, cur?.templateId === c.templateId,
            () => onUpdate({ signature: { templateId: c.templateId, name: c.name, description: c.description } }),
            h('strong', {}, c.name), h('span', {}, ` — ${c.description}`)))),
        cur
          ? h('div', { class: 'alius-sig-edit' },
              h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, 'Skill name'),
                textInput('sig-name', cur.name, 40, (v) => onUpdate({ signature: { ...cur, name: v } }))),
              h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, 'Description'),
                textArea('sig-desc', cur.description, 240, (v) => onUpdate({ signature: { ...cur, description: v } }))),
              h('p', { class: 'alius-dim' }, `Template: ${nameOf(tpl, cur.templateId)} — ${tpl ? String(tpl.mechanic) : ''}`))
          : null),
    );
  }

  // --- defects
  if (shown.has('defects')) {
    const fromCandidates = !manual && cand && cand.defectCandidates.length > 0;
    const list = fromCandidates
      ? cand.defectCandidates.map((c) => ({ id: c.defectId, origin: c.origin }))
      : options.defects.map((d) => ({ id: d.id, origin: '' }));
    const max = draft.secondDefect ? SETUP_LIMITS.maxDefects : 1;
    const pick = (id: string, origin: string) => {
      const cur = ch.defects;
      if (cur.some((d) => d.id === id)) return onUpdate({ defects: cur.filter((d) => d.id !== id) });
      const next = cur.length >= max ? [...cur.slice(0, max - 1), { id, origin }] : [...cur, { id, origin }];
      onUpdate({ defects: next });
    };
    const toggle = h('input', { type: 'checkbox', 'data-action': 'second-defect', checked: draft.secondDefect }) as HTMLInputElement;
    toggle.addEventListener('change', () => onUpdate({ secondDefect: toggle.checked }));
    host.append(
      section('defects', 'DEFECTS',
        h('label', { class: 'alius-check' }, toggle, ' Add second defect'),
        h('div', { class: 'alius-cards' }, ...list.map(({ id, origin }) => {
          const d = reg.defects.get(id);
          return pickCard('alius-defect-card', id, ch.defects.some((x) => x.id === id), () => pick(id, origin),
            h('strong', {}, nameOf(d, id)),
            h('span', { class: 'alius-dim' }, d ? ` [${String(d.category)}]` : ''),
            ...(d ? defectLines(d) : []),
            origin ? h('p', {}, `Origin: ${origin}`) : '');
        })),
        ...ch.defects.map((sel) =>
          h('label', { class: 'alius-field' },
            h('span', { class: 'alius-field-label' }, `Origin — ${nameOf(reg.defects.get(sel.id), sel.id)}`),
            textArea(`origin-${sel.id}`, sel.origin, 300, (v) =>
              onUpdate({ defects: ch.defects.map((d) => (d.id === sel.id ? { ...d, origin: v } : d)) })))),
      ),
    );
  }

  // --- values
  if (shown.has('values')) {
    host.append(
      section('values', 'VALUES',
        h('div', { class: 'alius-sliders' }, ...VALUE_AXES.map((axis) =>
          slider(axis.toUpperCase(), { 'data-axis': axis }, SETUP_LIMITS.value[0], SETUP_LIMITS.value[1], ch.values[axis],
            (n) => onUpdate({ values: { ...ch.values, [axis]: n } }))))),
    );
  }

  // --- tags
  if (shown.has('tags')) {
    host.append(
      section('tags', 'TAGS', ...TAG_FIELDS.map(([key, label, cap]) => {
        const list = ch[key];
        const add = () => {
          const t = normalizeTag(input.value);
          if (t === null || list.includes(t) || list.length >= cap) return;
          onUpdate({ [key]: [...list, t] } as CalibrationPatch);
        };
        const input = h('input', {
          type: 'text', class: 'alius-input', 'data-tags': key, 'data-key': `tag-${key}`, 'aria-label': `Add ${label.toLowerCase()}`,
          placeholder: list.length >= cap ? `max ${cap}` : 'add…', disabled: list.length >= cap,
        }) as HTMLInputElement;
        input.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key !== 'Enter') return;
          e.preventDefault();
          add();
        });
        return h('div', { class: 'alius-tags' },
          h('span', { class: 'alius-field-label' }, `${label} (${list.length}/${cap})`),
          h('div', { class: 'alius-chips' }, ...list.map((t) =>
            h('span', { class: 'alius-chip' }, t,
              h('button', { type: 'button', 'aria-label': `Remove ${t}`, onclick: () => onUpdate({ [key]: list.filter((x) => x !== t) } as CalibrationPatch) }, '×')))),
          input,
          h('button', { type: 'button', class: 'alius-btn', 'data-add-tag': key, onclick: add }, 'Add'));
      })),
    );
  }

  // --- baseline
  if (shown.has('baseline')) {
    host.append(
      section('baseline', 'STARTING AXES',
        h('div', { class: 'alius-sliders' }, ...BASELINE_FIELDS.map((k) => {
          const [lo, hi] = SETUP_LIMITS.baseline[k];
          return slider(k.toUpperCase(), { 'data-baseline': k }, lo, hi, ch.baseline[k],
            (n) => onUpdate({ baseline: { ...ch.baseline, [k]: n } }));
        }))),
    );
  }

  if (cand?.notes) host.append(h('p', { class: 'alius-notes' }, `NOTES: ${cand.notes}`));
}

function defectLines(d: Entry): HTMLElement[] {
  const line = (label: string, text: unknown) => h('p', { class: 'alius-defect-line' }, `${label}: ${String(text)}`);
  const bd = d.breakdown as { name: string; text: string };
  const arc = d.arc as { cure: string; manage: string; embrace: string };
  return [
    line('Lore', d.lore),
    line('Upside', d.upside),
    line('Downside', d.downside),
    line('Breakdown', `${bd.name} — ${bd.text}`),
    line('Social', d.social),
    line('Arc', `Cure: ${arc.cure} · Manage: ${arc.manage} · Embrace: ${arc.embrace}`),
  ];
}

function textInput(key: string, value: string, max: number, commit: (v: string) => void): HTMLInputElement {
  const el = h('input', { type: 'text', class: 'alius-input', 'data-key': key, maxlength: String(max) }) as HTMLInputElement;
  el.value = value;
  el.addEventListener('input', () => commit(el.value));
  return el;
}

function textArea(key: string, value: string, max: number, commit: (v: string) => void): HTMLTextAreaElement {
  const el = h('textarea', { class: 'alius-input', 'data-key': key, maxlength: String(max), rows: '3' }) as HTMLTextAreaElement;
  el.value = value;
  el.addEventListener('input', () => commit(el.value));
  return el;
}
