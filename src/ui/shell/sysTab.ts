import { migrate } from '../../engine/state/migrations';
import type { CampaignState } from '../../engine/state/types';
import type { ContentError, Registries } from '../../content/types';
import { missingDescriptions } from '../../analysis/describe';
import { CALL_TYPE_IDS } from '../../llm/callTypes';
import { llmLog } from '../../llm/log';
import { getSettings, updateSettings, type AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { exportCampaign, importCampaign, type LoadResult } from '../../st/persistence';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { renderContentSection } from '../bonds/content';
import type { BuildStats } from '../../llm/context';
import { renderMemoryBlock } from '../memory/memoryBlock';
import { renderMemorySection } from '../memory/memorySection';
import type { GenerationUi } from '../generation/surface';
import { renderGenerationsSection } from './generationsSection';
import { worldChoice } from '../../engine/worldOptions';
import { pickSkin } from '../device/skins';
import { developmentMode } from '../../engine/development/state';
import { LIFE_MODES, lifeMode } from '../../engine/life/state';
import { h } from '../dom';
import type { ModalOpts } from './modal';
import type { ToastKind } from './toast';

export interface SysCtx {
  st: StAdapter;
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  replaceState?: (state: CampaignState) => void;
  getContentErrors?: () => ContentError[];
  /** P7a: lets SYS › Debug list player-visible entries without a description. */
  getRegistries?: () => Registries;
  /** Dispatches an engine action (used for the per-campaign difficulty). */
  dispatch?: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  debugTools?: Array<{ label: string; run: () => void }>;
  /** P3b: what the last context block spent, for the MEMORY fill indicator. */
  lastBuild?: () => BuildStats;
  toast: (kind: ToastKind, text: string) => void;
  modal: (opts: ModalOpts) => Promise<string | null>;
  /** Called after a setting changed so the shell can restyle itself. */
  onSettingsChanged: () => void;
  /** P14: the GENERATIONS list; absent = the section is not drawn. */
  generation?: GenerationUi;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One settings row; `setting` is the key the analysis tool explains (`setting:<key>`). */
function field(label: string, control: HTMLElement, setting: keyof AliusSettings | 'difficulty'): HTMLElement {
  return h('label', { class: 'alius-field alius-option', ...analyzeNative(`setting:${setting}`) }, h('span', { class: 'alius-field-label' }, label), control);
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

  /** P14b: how far soldiers change from what they live through; a campaign without the setting (an old save) reads `off`. Goes through the engine. */
  const developmentSelect = (): HTMLElement => {
    const state = ctx.getState();
    const value = state ? developmentMode(state) : 'off';
    const el = h(
      'select',
      { name: 'characterDevelopment', class: 'alius-input', disabled: !state || !ctx.dispatch },
      ...(['off', 'slow', 'normal'] as const).map((v) => h('option', { value: v, selected: v === value }, v)),
    ) as HTMLSelectElement;
    el.value = value;
    el.addEventListener('change', () => {
      const events = ctx.dispatch?.({ type: 'development/set_mode', payload: { mode: el.value } }) ?? [];
      const err = events.find((e) => e.type === 'error');
      if (err) {
        ctx.toast('warn', String(err.message ?? 'The setting could not be changed.'));
        const now = ctx.getState();
        el.value = now ? developmentMode(now) : 'off';
      }
    });
    return el;
  };

  /** P14c: how often her days off-screen bring something (off, rare, normal, often); a campaign without the setting (an old save) reads `off`. Goes through the engine. */
  const lifeSelect = (): HTMLElement => {
    const state = ctx.getState();
    const value = state ? lifeMode(state) : 'off';
    const el = h(
      'select',
      { name: 'lifeEvents', class: 'alius-input', disabled: !state || !ctx.dispatch },
      ...LIFE_MODES.map((v) => h('option', { value: v, selected: v === value }, v)),
    ) as HTMLSelectElement;
    el.value = value;
    el.addEventListener('change', () => {
      const events = ctx.dispatch?.({ type: 'life/set_frequency', payload: { mode: el.value } }) ?? [];
      const err = events.find((e) => e.type === 'error');
      if (err) {
        ctx.toast('warn', String(err.message ?? 'The setting could not be changed.'));
        const now = ctx.getState();
        el.value = now ? lifeMode(now) : 'off';
      }
    });
    return el;
  };

  /** P8: every world option read-only with its lock; a live one is a select that goes through the engine. */
  const worldOptionRows = (): HTMLElement[] => {
    const state = ctx.getState();
    const reg = ctx.getRegistries?.();
    if (!state || !reg || reg.worldOptions.size === 0) return [h('p', { class: 'alius-dim' }, 'World options are set when a campaign is started.')];
    return [...reg.worldOptions.values()].map((option) => {
      const id = String(option.id);
      const current = worldChoice(state, reg, id)!.choice;
      const live = option.live === true;
      let control: HTMLElement;
      if (live && ctx.dispatch) {
        const el = h('select', { name: `world:${id}`, class: 'alius-input' },
          ...(option.choices as Array<{ id: string; label: string }>).map((c) => h('option', { value: c.id, selected: c.id === current.id }, c.label))) as HTMLSelectElement;
        el.value = current.id;
        el.addEventListener('change', () => {
          const events = ctx.dispatch?.({ type: 'world/set_option', payload: { optionId: id, choiceId: el.value } }) ?? [];
          const err = events.find((e) => e.type === 'error');
          if (err) {
            ctx.toast('warn', String(err.message ?? 'The option could not be changed.'));
            el.value = ctx.getState() ? worldChoice(ctx.getState()!, reg, id)!.choice.id : current.id;
          }
        });
        control = el;
      } else control = h('span', { class: 'alius-world-value' }, String(current.label));
      return h('div', { class: 'alius-field alius-option alius-world-row', 'data-option': id, ...analyzeAttrs(`worldOptions:${id}`) },
        h('span', { class: 'alius-field-label' }, String(option.label)), control,
        h('span', { class: 'alius-lock', 'data-live': String(live) }, live ? 'CHANGEABLE LATER' : 'LOCKED AT START'));
    });
  };

  /** P9d: every content category of the campaign; a toggle goes through the engine and applies from the next generation. */
  const contentRows = (): HTMLElement[] => {
    const state = ctx.getState();
    const reg = ctx.getRegistries?.();
    if (!state || !reg || reg.contentCategories.size === 0 || !ctx.dispatch) return [h('p', { class: 'alius-dim' }, 'Content categories are set when a campaign is started.')];
    const holder = h('div', { class: 'alius-content-host' });
    renderContentSection(holder, {
      enabled: state.content?.enabled ?? [], registries: reg, title: 'Content',
      onChange: (enabled) => {
        const events = ctx.dispatch?.({ type: 'content/set_categories', payload: { enabled } }) ?? [];
        const err = events.find((e) => e.type === 'error');
        if (err) {
          ctx.toast('warn', String(err.message ?? 'The content choice could not be changed.'));
          const now = ctx.getState();
          renderContentSection(holder, { enabled: now?.content?.enabled ?? [], registries: reg, title: 'Content', onChange: () => {} });
        }
      },
    });
    return [holder];
  };

  // --- settings form
  const profiles = st.listConnectionProfiles();
  const profileOptions: Array<[string, string]> = [
    ['', '(none — use main model if fallback is on)'],
    ...profiles.map((p): [string, string] => [p.id, `${p.name} (${p.api}${p.model ? ' / ' + p.model : ''})`]),
  ];
  // P10: the casing of the PDA; empty follows the campaign's corporation
  const skinReg = ctx.getRegistries?.();
  const skinOptions: Array<[string, string]> = [
    ['', skinReg ? `Follow the campaign (${String(pickSkin(ctx.getState(), skinReg, '').name)})` : 'Follow the campaign'],
    ...[...(skinReg?.deviceSkins.values() ?? [])].map((s): [string, string] => [String(s.id), String(s.name)]),
  ];
  const budgetInputs = CALL_TYPE_IDS.map((id) =>
    field(
      id,
      numberInput(`budget:${id}`, settings.budgets[id], (n) => {
        const next = apply({ budgets: { ...getSettings(st).budgets, [id]: n } });
        return next.budgets[id];
      }),
      'budgets',
    ),
  );

  const form = h(
    'section',
    { class: 'alius-section' },
    h('h2', {}, '[ SETTINGS ]'),
    field('Mechanic profile', select('mechanicProfileId', profileOptions, settings.mechanicProfileId), 'mechanicProfileId'),
    field('Mechanic thinking', select('mechanicThink', [['min', 'minimal'], ['low', 'low'], ['auto', 'provider default']], settings.mechanicThink), 'mechanicThink'),
    field('Fall back to main model', checkbox('mechanicFallbackToMain', settings.mechanicFallbackToMain), 'mechanicFallbackToMain'),
    field('Request floor (tokens)', numberInput('requestFloor', settings.requestFloor, (n) => apply({ requestFloor: n }).requestFloor), 'requestFloor'),
    field('Context cap (tokens)', numberInput('contextTokenCap', settings.contextTokenCap, (n) => apply({ contextTokenCap: n }).contextTokenCap), 'contextTokenCap'),
    h('h3', {}, 'Output budgets (tokens)'),
    h('div', { class: 'alius-grid' }, ...budgetInputs),
    h('h3', {}, 'Generation'),
    field('Model timeout (seconds, 10–600)', numberInput('llmTimeoutMs', settings.llmTimeoutMs / 1000, (n) => apply({ llmTimeoutMs: n * 1000 }).llmTimeoutMs / 1000, { min: '10', max: '600', step: '1' }), 'llmTimeoutMs'),
    field('Automatic retries (0–2)', numberInput('autoRetry', settings.autoRetry, (n) => apply({ autoRetry: n as AliusSettings['autoRetry'] }).autoRetry, { min: '0', max: '2', step: '1' }), 'autoRetry'),
    h('h3', {}, 'Display'),
    field('Palette', select('palette', [['amber', 'amber'], ['green', 'green'], ['white', 'white']], settings.palette), 'palette'),
    field('Scanlines', checkbox('scanlines', settings.scanlines), 'scanlines'),
    field('CRT flicker', checkbox('flicker', settings.flicker), 'flicker'),
    field('Readable mode (no scanlines, flicker, dithering or glitch; larger text)', checkbox('readableMode', settings.readableMode), 'readableMode'),
    field('Reduce motion (also follows the system setting)', checkbox('reducedMotion', settings.reducedMotion), 'reducedMotion'),
    field('Dithered portraits (PDA)', checkbox('ditheredPortraits', settings.ditheredPortraits), 'ditheredPortraits'),
    field('Door timer (seconds a night knock waits, 0 = no timer)', numberInput('doorTimer', settings.doorTimer, (n) => apply({ doorTimer: n }).doorTimer, { min: '0', max: '60', step: '1' }), 'doorTimer'),
    field('Device skin', select('deviceSkin', skinOptions, skinOptions.some(([v]) => v === settings.deviceSkin) ? settings.deviceSkin : ''), 'deviceSkin'),
    h('h3', {}, 'Sound'),
    field('Volume (0–100)', numberInput('soundVolume', settings.soundVolume, (n) => apply({ soundVolume: n }).soundVolume, { min: '0', max: '100', step: '5' }), 'soundVolume'),
    field('Mute', checkbox('soundMuted', settings.soundMuted), 'soundMuted'),
    field('Ambient hum', checkbox('ambientHum', settings.ambientHum), 'ambientHum'),
    h('h3', {}, 'Campaign'),
    field('Desire/Bond defects', checkbox('desireBondDefects', settings.desireBondDefects), 'desireBondDefects'),
    field('Show raw values', checkbox('showRawValues', settings.showRawValues), 'showRawValues'),
    field('Companion vignettes (main model)', checkbox('activityFlavor', settings.activityFlavor), 'activityFlavor'),
    field('Generated grunt names', checkbox('gruntFlavor', settings.gruntFlavor), 'gruntFlavor'),
    field('Sprite mode', select('spriteMode', [['native', 'Native Expressions'], ['emotion_pick', 'Mechanic emotion pick']], settings.spriteMode), 'spriteMode'),
    h('h3', {}, 'Conversations'),
    field('Read the conversation', select('intentMode', [['exchange', 'after every exchange'], ['every_n', 'every N exchanges'], ['scene_end', 'at scene end only']], settings.intentMode), 'intentMode'),
    field('Every N exchanges (2–10)', numberInput('intentEveryN', settings.intentEveryN, (n) => apply({ intentEveryN: n }).intentEveryN, { min: '2', max: '10' }), 'intentEveryN'),
    field('Minimum confidence (0–1)', decimalInput('intentMinConfidence', settings.intentMinConfidence, { min: '0', max: '1' }), 'intentMinConfidence'),
    field('Scene pacing (exchanges, ≥5)', numberInput('scenePacing', settings.scenePacing, (n) => apply({ scenePacing: n }).scenePacing, { min: '5' }), 'scenePacing'),
    field('Typing speed (chars/s, 0 = instant)', numberInput('typingSpeed', settings.typingSpeed, (n) => apply({ typingSpeed: n }).typingSpeed), 'typingSpeed'),
    field('Units may start DMs', checkbox('unitDms', settings.unitDms), 'unitDms'),
    field('Compact the chronicle with the mechanic model', checkbox('chronicleCompaction', settings.chronicleCompaction), 'chronicleCompaction'),
    h('h3', {}, 'Combat'),
    field('Easy retry (rewind a lost combat)', checkbox('easyRetry', settings.easyRetry), 'easyRetry'),
    field('Generated names for affixed enemies', checkbox('enemyFlavor', settings.enemyFlavor), 'enemyFlavor'),
    field('Difficulty (this campaign)', difficultySelect(), 'difficulty'),
    h('h3', {}, 'World'),
    field('Story director (mechanic model)', checkbox('directorEnabled', settings.directorEnabled), 'directorEnabled'),
    field('Story beat cooldown (days, 1–14)', numberInput('beatCooldownDays', settings.beatCooldownDays, (n) => apply({ beatCooldownDays: n }).beatCooldownDays, { min: '1', max: '14' }), 'beatCooldownDays'),
    field('Expedition recap (main model)', checkbox('expeditionRecap', settings.expeditionRecap), 'expeditionRecap'),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:setting_life_events') }, h('span', { class: 'alius-field-label' }, 'Life events (this campaign)'), lifeSelect()), // P14c
    h('h3', {}, 'World options'),
    ...worldOptionRows(),
    h('h3', {}, 'Relationships'),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:character_development') }, h('span', { class: 'alius-field-label' }, 'Character development (this campaign)'), developmentSelect()), // P14b
    field('The mechanic model words soldiers\' demands', checkbox('demandWording', settings.demandWording), 'demandWording'),
    field('The mechanic model words soldiers\' rule proposals', checkbox('ruleWording', settings.ruleWording), 'ruleWording'),
    field('The mechanic model words the reasons on a squad vote', checkbox('ballotWording', settings.ballotWording), 'ballotWording'),
    field('The mechanic model words a soldier\'s edit of your message', checkbox('dmEditWording', settings.dmEditWording), 'dmEditWording'),
    field('The mechanic model words the habits soldiers form', checkbox('habitWording', settings.habitWording), 'habitWording'),
    field('The mechanic model words the fragments of the secret frequency', checkbox('fragmentWording', settings.fragmentWording), 'fragmentWording'),
    field('The mechanic model judges orders against the warden\'s personal expectations', checkbox('wardenJudge', settings.wardenJudge), 'wardenJudge'),
    field('First impression fades (days, 1–30)', numberInput('firstImpressionTau', settings.firstImpressionTau, (n) => apply({ firstImpressionTau: n }).firstImpressionTau, { min: '1', max: '30' }), 'firstImpressionTau'),
    h('h3', {}, 'Decisions'),
    field('Generated dilemmas (mechanic model; off: authored options)', checkbox('dilemmasEnabled', settings.dilemmasEnabled), 'dilemmasEnabled'),
    h('h3', {}, 'Analysis'),
    field('Analysis tool (hover, ? or long-press)', checkbox('analyzeEnabled', settings.analyzeEnabled), 'analyzeEnabled'),
    field('Analysis animation', select('analyzeAnimation', [['full', 'full'], ['short', 'short'], ['off', 'off']], settings.analyzeAnimation), 'analyzeAnimation'),
    field('Hover delay (ms, 100–1500)', numberInput('analyzeHoverDelay', settings.analyzeHoverDelay, (n) => apply({ analyzeHoverDelay: n }).analyzeHoverDelay, { min: '100', max: '1500', step: '50' }), 'analyzeHoverDelay'),
    h('h3', {}, 'Intimacy'),
    field('Romance', checkbox('romance', settings.romance), 'romance'),
    field('Romantic initiative', select('romanticInitiative', [['low', 'low'], ['med', 'medium'], ['high', 'high']], settings.romanticInitiative), 'romanticInitiative'),
    ...contentRows(),
    h('h3', {}, 'Developer'),
    field('Debug mode', checkbox('debug', settings.debug, true), 'debug'),
    field('Mechanics edit lock', checkbox('editLock', settings.editLock, true), 'editLock'),
  );

  // --- P3b: memory (a campaign is needed: presets and fill are the campaign's)
  const memoryHost = h('div', { class: 'alius-memory-host' });
  const drawMemory = (): void => {
    const state = ctx.getState();
    if (!state || !ctx.dispatch) {
      memoryHost.replaceChildren();
      return;
    }
    renderMemorySection(memoryHost, {
      state, settings: getSettings(st), dispatch: ctx.dispatch, lastBuild: ctx.lastBuild ?? (() => ({ memoryTokens: 0, otherTokens: 0, directiveTokens: 0 })),
      onChanged: drawMemory, toast: ctx.toast,
    });
    // the world's memory: its shared dossier and the facts about the world (the units' are in their dossiers in the SQUAD tab)
    const world = h('div', { class: 'alius-memory-host' });
    renderMemoryBlock(world, {
      state, settings: getSettings(st), target: '*', dispatch: ctx.dispatch, onChanged: drawMemory,
      confirm: async (text) => (await ctx.modal({ title: 'FORGET', body: text, actions: [{ label: '[ FORGET ]', value: 'yes' }, { label: '[ CANCEL ]', value: 'no' }] })) === 'yes',
    });
    memoryHost.append(world);
  };
  drawMemory();

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
    const registries = ctx.getRegistries?.();
    const missing = registries ? missingDescriptions(registries) : null;
    const warnings = missing === null
      ? []
      : [
          h('h3', {}, 'Content warnings'),
          missing.length
            ? h('ul', { class: 'alius-content-warnings' }, ...missing.map((m) => h('li', {}, `${m.registry} · ${m.id} — no description`)))
            : h('p', { class: 'alius-dim' }, 'Every player-visible entry has a description.'),
        ];
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
        ...warnings,
        h('h3', {}, 'LLM log (newest first)'),
        h('div', { class: 'alius-log' }, ...logList),
        h('h3', {}, 'Campaign state'),
        stateView,
      ),
    );
  }

  renderDebug();
  // --- P14: failed generations (a refresh of the shell redraws the tab, so the list follows the state)
  const generationsHost = h('div', { class: 'alius-generations-host' });
  if (ctx.generation) renderGenerationsSection(generationsHost, { state: ctx.getState(), ui: ctx.generation, debugLog: llmLog.entries() });
  host.append(form, generationsHost, memoryHost, backup, debugHost);
}
