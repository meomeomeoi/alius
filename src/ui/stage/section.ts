import type { Registries } from '../../content/types';
import { isLiving } from '../../engine/economy';
import type { CampaignState, Unit } from '../../engine/state/types';
import { updateSettings, type AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import type { ArtSlots } from '../scene/art';
import type { SampleSound } from '../sound/samples';
import type { ModalOpts } from '../shell/modal';
import type { ToastKind } from '../shell/toast';
import type { StageFolder } from './load';
import { SLOT_INFO, SLOT_STATE_WORD, slotState, slotsFilled, visibleSlotKeys, visibleSlots } from './slots';

/**
 * P10e-f: SYS › STAGE. The squad's women with her sprites found or missing and her slots filled (`n / 12`), the list of every slot
 * (women × slot keys, each cell its state) and the toggle of the explicit slot. Setup data about a card, outside any campaign: nothing
 * here dispatches, saves a campaign or draws an rng.
 */
/** What the app gives SYS › STAGE (through the shell): the rest of `StageCtx` is the SYS tab's own. */
export interface StageDeps {
  art: () => ArtSlots;
  folders: () => ReadonlyMap<string, StageFolder>;
  refresh: () => Promise<void>;
  /** Resolves an extension asset path (the preview's backdrops and the instruments' pictures); absent = the path as given. */
  assetUrl?: (path: string) => string;
  /** The instruments' recorded sounds (the preview plays them as play does); absent = the preview is silent. */
  samples?: SampleSound;
}

export interface StageCtx {
  st: StAdapter;
  getState: () => CampaignState | null;
  getRegistries: () => Registries;
  /** The art slots as the scene reads them (her folder first, then `art.json`). */
  art: () => ArtSlots;
  /** Her stage folder per card (`loadStageFolders`). */
  folders: () => ReadonlyMap<string, StageFolder>;
  /** Opens her page (`openStageSheet`). */
  openSheet(unitId: string): void;
  settings: () => AliusSettings;
  /** Writes a setting the way the SYS tab does (the shell restyles); absent = `updateSettings` alone. */
  setSetting?: (patch: Partial<AliusSettings>) => void;
  /** Reloads every stage folder and redraws (`AliusApp.refreshStage`). */
  refresh: () => Promise<void>;
  toast: (kind: ToastKind, text: string) => void;
  modal: (opts: ModalOpts) => Promise<string | null>;
  /** CHECK (the preview): extension asset paths and the instruments' sounds, as the scene gets them. */
  assetUrl?: (path: string) => string;
  samples?: SampleSound;
}

/** The women the section lists: named, living, with a card. */
export const stageUnits = (state: CampaignState): Unit[] =>
  state.squad.filter((u) => u.kind === 'named' && isLiving(u) && typeof u.cardRef === 'string' && u.cardRef !== '');

/** The section drawn last, redrawn for the new squad on a chat switch (one listener per adapter). */
let drawn: { host: HTMLElement; ctx: StageCtx } | null = null;
const watched = new WeakSet<StAdapter>();
/** A draw counter per host: an answer of `listSprites` for an older draw writes nothing. */
const draws = new WeakMap<HTMLElement, number>();

function watch(st: StAdapter): void {
  if (watched.has(st)) return;
  watched.add(st);
  st.on('chat_changed', () => {
    const last = drawn;
    if (last !== null && last.ctx.st === st && last.host.isConnected) renderStageSection(last.host, last.ctx);
  });
}

export function renderStageSection(host: HTMLElement, ctx: StageCtx): void {
  watch(ctx.st);
  drawn = { host, ctx };
  const mine = (draws.get(host) ?? 0) + 1;
  draws.set(host, mine);
  const settings = ctx.settings();
  const showExplicit = settings.showExplicitSlots;

  const toggle = h('input', { type: 'checkbox', name: 'showExplicitSlots', checked: showExplicit }) as HTMLInputElement;
  toggle.addEventListener('change', () => {
    if (ctx.setSetting) ctx.setSetting({ showExplicitSlots: toggle.checked });
    else updateSettings(ctx.st, { showExplicitSlots: toggle.checked });
    renderStageSection(host, ctx);
  });
  const section = h(
    'section',
    { class: 'alius-section alius-stage-setup' },
    h('h2', { ...analyzeAttrs('glossary:stage_setup') }, '[ STAGE ]'),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('setting:showExplicitSlots') }, h('span', { class: 'alius-field-label' }, 'Show explicit slots'), toggle),
  );
  host.replaceChildren(section);

  const state = ctx.getState();
  if (state === null) {
    section.append(h('p', { class: 'alius-dim alius-stage-none' }, 'No campaign is open: the squad\'s women are listed once one is.'));
    return;
  }
  const units = stageUnits(state);
  if (units.length === 0) {
    section.append(h('p', { class: 'alius-dim alius-stage-none' }, 'No woman of the squad has a character card.'));
    return;
  }
  const art = ctx.art();
  const folders = ctx.folders();
  const total = visibleSlots(showExplicit).length;
  const keys = visibleSlotKeys(showExplicit);

  const list = h('ul', { class: 'alius-stage-list' }, ...units.map((u) => {
    const folder = folders.get(u.cardRef!);
    const sprites = h('span', { class: 'alius-stage-sprites', 'data-sprites': 'checking' }, 'sprites: checking…');
    void ctx.st.listSprites(u.cardRef!).catch(() => [] as string[]).then((labels) => {
      if (draws.get(host) !== mine) return;
      const found = labels.length > 0;
      sprites.dataset.sprites = found ? 'found' : 'missing';
      sprites.textContent = found ? `sprites: found (${labels.length})` : 'sprites: missing';
    });
    return h(
      'li',
      { class: 'alius-stage-woman', 'data-unit': u.id },
      h('button', { type: 'button', class: 'alius-btn alius-option', ...analyzeNative('glossary:stage_setup'), onclick: () => ctx.openSheet(u.id) }, `[ ${u.displayName} ]`),
      sprites,
      h('span', { class: 'alius-stage-filled' }, `${slotsFilled(folder, art, u.id, showExplicit)} / ${total}`),
    );
  }));

  const table = h(
    'table',
    { class: 'alius-stage-slots' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), ...keys.map((k) => h('th', { scope: 'col', 'data-slot': k, title: k }, SLOT_INFO[k].label)))),
    h('tbody', {}, ...units.map((u) => {
      const folder = folders.get(u.cardRef!);
      return h('tr', { 'data-unit': u.id }, h('th', { scope: 'row' }, u.displayName), ...keys.map((k) => {
        const s = slotState(folder, art, u.id, k);
        return h('td', { class: 'alius-stat alius-stage-cell', 'data-slot': k, 'data-state': s, ...analyzeAttrs('glossary:stage_slot_state') }, SLOT_STATE_WORD[s]);
      }));
    })),
  );
  section.append(list, h('div', { class: 'alius-stage-table-wrap' }, table));
}
