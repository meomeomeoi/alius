import { migrate } from '../../engine/state/migrations';
import type { CampaignState } from '../../engine/state/types';
import type { ContentError } from '../../content/types';
import { CALL_TYPE_IDS } from '../../llm/callTypes';
import { llmLog } from '../../llm/log';
import { getSettings, updateSettings, type AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { exportCampaign, importCampaign, type LoadResult } from '../../st/persistence';
import { h } from '../dom';
import type { ModalOpts } from './modal';
import type { ToastKind } from './toast';

export interface SysCtx {
  st: StAdapter;
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  replaceState?: (state: CampaignState) => void;
  getContentErrors?: () => ContentError[];
  /** Dispatches an engine action (used for the per-campaign difficulty). */
  dispatch?: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  debugTools?: Array<{ label: string; run: () => void }>;
  toast: (kind: ToastKind, text: string) => void;
  modal: (opts: ModalOpts) => Promise<string | null>;
  /** Called after a setting changed so the shell can restyle itself. */
  onSettingsChanged: () => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, label), control);
}

export function renderSysTab(host: HTMLElement, ctx: SysCtx): void {
  const { st } = ctx;
  host.replaceChildren();
  const settings = getSettings(st);
  const debugHost = h('div', { class: 'alius-debug-host' });

  const apply = (patch: Partial<AliusSettings>): AliusSettings => {
    const next = updateSettings(st, patch);
    ctx.onSettingsChanged();
    return next;
  };

  const select = (name: keyof AliusSettings, options: Array<[string, string]>, value: string) => {
    const el = h(
      'select',
      { name, class: 'alius-input' },
      ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
    ) as HTMLSelectElement;
    el.value = value;
    el.addEventListener('change', () => apply({ [name]: el.value } as Partial<AliusSettings>));
    return el;
  };

  const checkbox = (name: keyof AliusSettings, checked: boolean, rerenderDebug = false) => {
    const el = h('input', { type: 'checkbox', name, checked }) as HTMLInputElement;
    el.addEventListener('change', () => {
      apply({ [name]: el.checked } as Partial<AliusSettings>);
      if (rerenderDebug) renderDebug();
    });
    return el;
  };

  const numberInput = (name: string, value: number, commit: (n: number) => number, attrs: Record<string, string> = {}) => {
    const el = h('input', { type: 'number', name, min: '0', step: '1', value: String(value), class: 'alius-input alius-num', ...attrs }) as HTMLInputElement;
    el.addEventListener('change', () => {
      const n = Number(el.value);
      el.value = String(Number.isFinite(n) ? commit(Math.trunc(n)) : commit(NaN));
    });
    return el;
  };

  /** A decimal setting (0.05 steps); a value the settings reject snaps back to what is stored. */
  const decimalInput = (name: keyof AliusSettings, value: number, attrs: Record<string, string>) => {
    const el = h('input', { type: 'number', name, step: '0.05', value: String(value), class: 'alius-input alius-num', ...attrs }) as HTMLInputElement;
    el.addEventListener('change', () => {
      const n = Number(el.value);
      const next = apply(Number.isFinite(n) ? ({ [name]: n } as Partial<AliusSettings>) : {});
      el.value = String(next[name]);
    });
    return el;
  };

  /** The campaign's combat difficulty; changing it goes through the engine (refused while a combat is open). */
  const difficultySelect = (): HTMLElement => {
    const state = ctx.getState();
    const value = state?.difficulty ?? 'normal';
    const el = h(
      'select',
      { name: 'difficulty', class: 'alius-input', disabled: !state || !ctx.dispatch },
      ...(['story', 'normal', 'hard'] as const).map((v) => h('option', { value: v, selected: v === value }, v)),
    ) as HTMLSelectElement;
    el.value = value;
    el.addEventListener('change', () => {
      const events = ctx.dispatch?.({ type: 'campaign/set_difficulty', payload: { difficulty: el.value } }) ?? [];
      const err = events.find((e) => e.type === 'error');
      if (err) {
        ctx.toast('warn', String(err.message ?? 'The difficulty could not be changed.'));
        el.value = ctx.getState()?.difficulty ?? 'normal';
      }
    });
    return el;
  };

  // --- settings form
  const profiles = st.listConnectionProfiles();
  const profileOptions: Array<[string, string]> = [
    ['', '(none — use main model if fallback is on)'],
    ...profiles.map((p): [string, string] => [p.id, `${p.name} (${p.api}${p.model ? ' / ' + p.model : ''})`]),
  ];
  const budgetInputs = CALL_TYPE_IDS.map((id) =>
    field(
      id,
      numberInput(`budget:${id}`, settings.budgets[id], (n) => {
        const next = apply({ budgets: { ...getSettings(st).budgets, [id]: n } });
        return next.budgets[id];
      }),
    ),
  );

  const form = h(
    'section',
    { class: 'alius-section' },
    h('h2', {}, '[ SETTINGS ]'),
    field('Mechanic profile', select('mechanicProfileId', profileOptions, settings.mechanicProfileId)),
    field('Mechanic thinking', select('mechanicThink', [['min', 'minimal'], ['low', 'low'], ['auto', 'provider default']], settings.mechanicThink)),
    field('Fall back to main model', checkbox('mechanicFallbackToMain', settings.mechanicFallbackToMain)),
    field('Request floor (tokens)', numberInput('requestFloor', settings.requestFloor, (n) => apply({ requestFloor: n }).requestFloor)),
    field('Context cap (tokens)', numberInput('contextTokenCap', settings.contextTokenCap, (n) => apply({ contextTokenCap: n }).contextTokenCap)),
    h('h3', {}, 'Output budgets (tokens)'),
    h('div', { class: 'alius-grid' }, ...budgetInputs),
    h('h3', {}, 'Display'),
    field('Palette', select('palette', [['amber', 'amber'], ['green', 'green'], ['white', 'white']], settings.palette)),
    field('Scanlines', checkbox('scanlines', settings.scanlines)),
    field('CRT flicker', checkbox('flicker', settings.flicker)),
    h('h3', {}, 'Campaign'),
    field('Desire/Bond defects', checkbox('desireBondDefects', settings.desireBondDefects)),
    field('Show raw values', checkbox('showRawValues', settings.showRawValues)),
    field('Companion vignettes (main model)', checkbox('activityFlavor', settings.activityFlavor)),
    field('Generated grunt names', checkbox('gruntFlavor', settings.gruntFlavor)),
    field('Sprite mode', select('spriteMode', [['native', 'Native Expressions'], ['emotion_pick', 'Mechanic emotion pick']], settings.spriteMode)),
    h('h3', {}, 'Conversations'),
    field('Read the conversation', select('intentMode', [['exchange', 'after every exchange'], ['every_n', 'every N exchanges'], ['scene_end', 'at scene end only']], settings.intentMode)),
    field('Every N exchanges (2–10)', numberInput('intentEveryN', settings.intentEveryN, (n) => apply({ intentEveryN: n }).intentEveryN, { min: '2', max: '10' })),
    field('Minimum confidence (0–1)', decimalInput('intentMinConfidence', settings.intentMinConfidence, { min: '0', max: '1' })),
    field('Scene pacing (exchanges, ≥5)', numberInput('scenePacing', settings.scenePacing, (n) => apply({ scenePacing: n }).scenePacing, { min: '5' })),
    field('Typing speed (chars/s, 0 = instant)', numberInput('typingSpeed', settings.typingSpeed, (n) => apply({ typingSpeed: n }).typingSpeed)),
    field('Units may start DMs', checkbox('unitDms', settings.unitDms)),
    field('Compact the chronicle with the mechanic model', checkbox('chronicleCompaction', settings.chronicleCompaction)),
    h('h3', {}, 'Combat'),
    field('Easy retry (rewind a lost combat)', checkbox('easyRetry', settings.easyRetry)),
    field('Generated names for affixed enemies', checkbox('enemyFlavor', settings.enemyFlavor)),
    field('Difficulty (this campaign)', difficultySelect()),
    h('h3', {}, 'World'),
    field('Story director (mechanic model)', checkbox('directorEnabled', settings.directorEnabled)),
    field('Story beat cooldown (days, 1–14)', numberInput('beatCooldownDays', settings.beatCooldownDays, (n) => apply({ beatCooldownDays: n }).beatCooldownDays, { min: '1', max: '14' })),
    field('Expedition recap (main model)', checkbox('expeditionRecap', settings.expeditionRecap)),
    h('h3', {}, 'Decisions'),
    field('Generated dilemmas (mechanic model; off: authored options)', checkbox('dilemmasEnabled', settings.dilemmasEnabled)),
    h('h3', {}, 'Analysis'),
    field('Analysis tool (hover, ? or long-press)', checkbox('analyzeEnabled', settings.analyzeEnabled)),
    field('Analysis animation', select('analyzeAnimation', [['full', 'full'], ['short', 'short'], ['off', 'off']], settings.analyzeAnimation)),
    field('Hover delay (ms, 100–1500)', numberInput('analyzeHoverDelay', settings.analyzeHoverDelay, (n) => apply({ analyzeHoverDelay: n }).analyzeHoverDelay, { min: '100', max: '1500', step: '50' })),
    h('h3', {}, 'Intimacy'),
    field('Romance', checkbox('romance', settings.romance)),
    field('Explicit scenes allowed', checkbox('explicitContent', settings.explicitContent)),
    field('Romantic initiative', select('romanticInitiative', [['low', 'low'], ['med', 'medium'], ['high', 'high']], settings.romanticInitiative)),
    h('h3', {}, 'Developer'),
    field('Debug mode', checkbox('debug', settings.debug, true)),
    field('Mechanics edit lock', checkbox('editLock', settings.editLock, true)),
  );

  // --- campaign export / import
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'alius-hidden', tabindex: '-1' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      return ctx.toast('error', `Import failed: ${errText(e)}`);
    }
    const r = importCampaign(text);
    if (!r.ok) return ctx.toast('error', `Import failed: ${r.detail}`);
    if (ctx.getState()) {
      const answer = await ctx.modal({
        title: 'Replace campaign?',
        body: 'The campaign in this chat will be replaced by the imported file.',
        actions: [{ label: 'Replace', value: 'yes' }, { label: 'Cancel', value: 'no' }],
      });
      if (answer !== 'yes') return;
    }
    if (!ctx.replaceState) return ctx.toast('error', 'Import is not available right now.');
    ctx.replaceState(r.state);
    ctx.toast('info', 'Campaign imported.');
  });

  const exportClick = () => {
    const state = ctx.getState();
    if (!state) return ctx.toast('warn', 'No campaign to export.');
    const url = URL.createObjectURL(new Blob([exportCampaign(state)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `alius-campaign-day${state.day}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const backup = h(
    'section',
    { class: 'alius-section' },
    h('h2', {}, '[ CAMPAIGN FILE ]'),
    h(
      'div',
      { class: 'alius-row' },
      h('button', { type: 'button', class: 'alius-btn', onclick: exportClick }, 'Export campaign'),
      h('button', { type: 'button', class: 'alius-btn', onclick: () => fileInput.click() }, 'Import campaign'),
      fileInput,
    ),
  );

  // --- debug panel
  function renderDebug(): void {
    debugHost.replaceChildren();
    const s = getSettings(st);
    if (!s.debug) return;

    const entries = [...llmLog.entries()].reverse();
    const logList = entries.length
      ? entries.map((e) =>
          h(
            'details',
            { class: 'alius-log-entry' },
            h(
              'summary',
              {},
              `${new Date(e.at).toLocaleTimeString()} ${e.callType} via ${e.profile} · ${e.ok ? 'ok' : 'FAILED'} · ${e.ms} ms · max ${e.maxTokens}`,
            ),
            h('pre', {}, `PROMPT:\n${e.prompt}\n\nRAW:\n${e.raw}\n\nPARSED:\n${e.parsed === undefined ? '(none)' : JSON.stringify(e.parsed, null, 2)}`),
          ),
        )
      : [h('p', { class: 'alius-dim' }, 'No LLM calls yet.')];

    const state = ctx.getState();
    let stateView: HTMLElement;
    if (!state) {
      stateView = h('p', { class: 'alius-dim' }, 'No campaign loaded.');
    } else if (s.editLock) {
      stateView = h(
        'div',
        {},
        h('pre', { class: 'alius-state-view' }, JSON.stringify(state, null, 2)),
        h('p', { class: 'alius-dim' }, 'Read-only. Turn off "Mechanics edit lock" to edit.'),
      );
    } else {
      const ta = h('textarea', { class: 'alius-state-editor alius-input', rows: '18', spellcheck: 'false', 'aria-label': 'Campaign state JSON' }) as HTMLTextAreaElement;
      ta.value = JSON.stringify(state, null, 2);
      const applyState = () => {
        let raw: unknown;
        try {
          raw = JSON.parse(ta.value);
        } catch (e) {
          return ctx.toast('error', `Invalid JSON: ${errText(e)}`);
        }
        const r = migrate(raw);
        if (!r.ok) return ctx.toast('error', `Invalid state: ${r.detail}`);
        if (!ctx.replaceState) return ctx.toast('error', 'Applying state is not available right now.');
        ctx.replaceState(r.state);
        ctx.toast('info', 'State applied.');
      };
      stateView = h('div', {}, ta, h('div', { class: 'alius-row' }, h('button', { type: 'button', class: 'alius-btn', onclick: applyState }, 'Apply')));
    }

    const contentErrors = ctx.getContentErrors?.() ?? [];
    const contentList = contentErrors.length
      ? h(
          'ul',
          { class: 'alius-content-errors' },
          ...contentErrors.map((e) => h('li', {}, `${e.pack} · ${e.file}${e.path ? ' · ' + e.path : ''} — ${e.message}`)),
        )
      : h('p', { class: 'alius-dim' }, 'Content packs loaded without errors.');
    const tools = ctx.debugTools?.length
      ? [
          h('h3', {}, 'Tools'),
          h(
            'div',
            { class: 'alius-row' },
            ...ctx.debugTools.map((t) => h('button', { type: 'button', class: 'alius-btn', onclick: t.run }, t.label)),
          ),
        ]
      : [];

    debugHost.append(
      h(
        'section',
        { class: 'alius-section alius-debug' },
        h('h2', {}, '[ DEBUG ]'),
        ...tools,
        h('h3', {}, 'Content errors'),
        contentList,
        h('h3', {}, 'LLM log (newest first)'),
        h('div', { class: 'alius-log' }, ...logList),
        h('h3', {}, 'Campaign state'),
        stateView,
      ),
    );
  }

  renderDebug();
  host.append(form, backup, debugHost);
}
