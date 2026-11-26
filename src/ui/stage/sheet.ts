import type { Registries } from '../../content/types';
import { TUNING } from '../../engine/tuning';
import type { StAdapter } from '../../st/adapter';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { stageSetupSchema, type StageSetup } from './load';
import { renderLookEditor } from './lookEditor';
import type { StageCtx } from './section';
import { renderSlotList } from './slotEditor';

/**
 * P10e-f: her page, a full-screen sheet over the shell (z 2: above the scene's device, below the shell's toasts, which come after it in
 * the DOM at the same z, its modals and the analysis panel). Her sprites, how she stands and her face point, her hand, her accent; her slots (`renderSlotList`, in `.alius-stage-slots-host`).
 * The edits are a draft: SAVE writes `stage.json` (a slot saves itself), closing with unsaved edits asks once, a chat switch closes it at
 * once and saves nothing. Setup data about a card, outside any campaign: nothing here dispatches, saves a campaign or draws an rng.
 */

/** The label her scene sprite shows when nothing else is asked (the scene's `faceOf` default). */
const DEFAULT_FACE = 'neutral';

/**
 * The expression labels the instruments ask for: the scene's default face, then every label of the slap's table
 * (`TUNING.practice.slap.faces`, each style's `before`, `keep` and `after`), read by field, in the table's order. The frame
 * (`her_activity`) has no table of its own: it shows her face now (`faceOf`), whose default is `neutral`.
 */
export function facesWanted(_reg?: Registries): string[] {
  const out = new Set<string>([DEFAULT_FACE]);
  for (const face of Object.values(TUNING.practice.slap.faces)) {
    out.add(face.before);
    for (const k of face.keep) out.add(k);
    for (const a of Object.values(face.after)) out.add(a);
  }
  return [...out];
}

/**
 * What stands in for a missing label: the slap keeps her face now when it is in her style's `keep` set, so the first found label of the
 * `keep` sets of the styles that ask for it; else `neutral` when she has it; else null (her sprite stays as it is).
 */
export function standInFor(label: string, found: ReadonlySet<string>): string | null {
  for (const face of Object.values(TUNING.practice.slap.faces)) {
    const asks = face.before === label || face.keep.includes(label) || Object.values(face.after).includes(label);
    if (!asks) continue;
    const hit = face.keep.find((k) => k !== label && found.has(k));
    if (hit !== undefined) return hit;
  }
  return label !== DEFAULT_FACE && found.has(DEFAULT_FACE) ? DEFAULT_FACE : null;
}

/** Uploads her `stage.json` (`stage` + `json`), then reloads the stage folders. False when the upload failed (nothing reloads). */
export async function saveStageSetup(st: StAdapter, avatar: string, setup: StageSetup, refresh?: () => Promise<void>): Promise<boolean> {
  const blob = new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' });
  const ok = await st.uploadStageFile(avatar, 'stage', blob, 'json').catch(() => false);
  if (ok && refresh) await refresh().catch(() => {});
  return ok;
}

/** The sheet open now, closed without asking on a chat switch (one listener per adapter). */
let current: { st: StAdapter; close: () => void } | null = null;
const watched = new WeakSet<StAdapter>();
function watch(st: StAdapter): void {
  if (watched.has(st)) return;
  watched.add(st);
  st.on('chat_changed', () => { if (current?.st === st) current.close(); });
}

/** Closes the open sheet without asking (and without saving). */
export function closeStageSheet(): void {
  current?.close();
}

const same = (a: StageSetup, b: StageSetup): boolean => JSON.stringify(a) === JSON.stringify(b);

export function openStageSheet(unitId: string, ctx: StageCtx): () => void {
  watch(ctx.st);
  current?.close(); // one sheet at a time
  const state = ctx.getState();
  const unit = state?.squad.find((u) => u.id === unitId && u.kind === 'named');
  const avatar = unit?.cardRef;
  if (!unit || !avatar) {
    ctx.toast('warn', 'She has no character card: nothing to set up.');
    return () => {};
  }
  const reg = ctx.getRegistries();
  const chatId = ctx.st.getActiveChat()?.chatId ?? null;
  let saved: StageSetup = structuredClone(ctx.folders().get(avatar)?.setup ?? {});
  const draft: StageSetup = structuredClone(saved);
  let closed = false;
  let asking = false;

  const status = h('span', { class: 'alius-stage-status', role: 'status' });
  const saveBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'save', ...analyzeNative('glossary:stage_setup') }, '[ SAVE ]') as HTMLButtonElement;
  const closeBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'close', ...analyzeNative('glossary:stage_setup') }, '[ CLOSE ]');
  let slots: { dirty(): boolean; drop(): void } | null = null;
  const markDirty = (): void => {
    const dirty = !same(draft, saved);
    saveBtn.disabled = !dirty;
    status.textContent = dirty ? 'unsaved changes' : '';
  };

  const spritesBlock = h('section', { class: 'alius-stage-block alius-stage-sprites-block', ...analyzeAttrs('glossary:stage_sprites') }, h('h3', {}, 'Her sprites'), h('p', { class: 'alius-dim' }, 'checking…'));
  const lookHost = h('div', { class: 'alius-stage-look' });
  const slotsHost = h('div', { class: 'alius-stage-slots-host', 'data-unit': unitId });
  const sheet = h(
    'div',
    { class: 'alius-stage-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Stage setup: ${unit.displayName}`, 'data-unit': unitId, tabindex: '-1' },
    h('div', { class: 'alius-stage-sheet-head' }, h('h2', {}, `[ STAGE // ${unit.displayName.toUpperCase()} ]`), status, saveBtn, closeBtn),
    h('div', { class: 'alius-stage-sheet-body' }, spritesBlock, lookHost, slotsHost),
  );

  const drawLook = (spriteUrl: string | null): void => {
    if (closed) return;
    renderLookEditor(lookHost, draft, { spriteUrl, name: unit.displayName, hands: [...reg.handFonts.values()], campaignHand: unit.hand, onChange: markDirty });
  };
  drawLook(null);
  markDirty();
  slots = renderSlotList(slotsHost, unitId, avatar, ctx);

  // her sprites: the labels found, the ones the instruments ask for and what stands in for a missing one
  void ctx.st.listSprites(avatar).catch(() => [] as string[]).then(async (labels) => {
    if (closed) return;
    const found = new Set(labels);
    const wanted = facesWanted(reg);
    const rows = wanted.map((label) => {
      const has = found.has(label);
      const stand = has ? null : standInFor(label, found);
      return h('li', { 'data-label': label, 'data-found': String(has) }, `${label}: ${has ? 'found' : `missing — ${stand === null ? 'her sprite stays as it is' : `stands in: ${stand}`}`}`);
    });
    spritesBlock.replaceChildren(
      h('h3', {}, 'Her sprites'),
      labels.length === 0
        ? h('p', { class: 'alius-stage-no-sprites' }, 'No sprites found. Her expressions folder is empty or missing; the first picture saved here creates its alius subfolder.')
        : h('p', { class: 'alius-stage-found' }, `Found: ${labels.join(', ')}`),
      h('p', { class: 'alius-dim' }, 'Asked for by the instruments:'),
      h('ul', { class: 'alius-stage-wanted' }, ...rows),
    );
    const first = found.has(DEFAULT_FACE) ? DEFAULT_FACE : labels[0];
    const url = first === undefined ? null : await ctx.st.getSpriteUrl(avatar, first).catch(() => null);
    drawLook(url);
  });

  const host = (typeof document !== 'undefined' ? document.getElementById('alius-shell') : null) ?? document.body;
  const finish = (): void => {
    if (closed) return;
    closed = true;
    slots?.drop(); // a slot's draft is dropped, nothing is saved
    sheet.remove();
    if (current?.close === finish) current = null;
  };
  const requestClose = async (): Promise<void> => {
    if (closed || asking) return;
    const slotDirty = slots?.dirty() === true;
    if (same(draft, saved) && !slotDirty) { finish(); return; }
    asking = true;
    const answer = await ctx.modal({
      title: 'UNSAVED CHANGES',
      body: `${same(draft, saved) ? 'A slot has' : slotDirty ? 'Her look and a slot have' : 'Her look has'} changes that are not saved. Close and drop them?`,
      actions: [{ label: '[ DROP THEM ]', value: 'drop', analyze: 'glossary:stage_setup' }, { label: '[ KEEP EDITING ]', value: 'keep', analyze: 'glossary:stage_setup' }],
    });
    asking = false;
    if (answer === 'drop') finish();
  };

  saveBtn.addEventListener('click', async () => {
    const parsed = stageSetupSchema.safeParse(draft);
    if (!parsed.success) { ctx.toast('warn', 'Her look could not be saved: a value is out of range.'); return; }
    saveBtn.disabled = true;
    const ok = await saveStageSetup(ctx.st, avatar, parsed.data, ctx.refresh);
    if (closed || (ctx.st.getActiveChat()?.chatId ?? null) !== chatId) return;
    if (ok) { saved = structuredClone(draft); ctx.toast('info', `Saved: ${unit.displayName}'s look.`); }
    else ctx.toast('warn', 'Her look could not be saved (the server refused the file).');
    markDirty();
  });
  closeBtn.addEventListener('click', () => { void requestClose(); });
  sheet.addEventListener('keydown', (e) => {
    // the shell's keys (Esc, Tab, the number keys) do not reach the device behind; `?` still reaches the analysis tool
    if (e.key === 'Escape' || e.key === 'Tab' || /^[0-8]$/.test(e.key)) e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); void requestClose(); }
  });

  // before the toast host: the sheet and the toasts share z 2, so the later one in the DOM (the toasts it raises) lies on top
  host.insertBefore(sheet, host.querySelector(':scope > .alius-toasts'));
  current = { st: ctx.st, close: finish };
  sheet.focus();
  return () => { void requestClose(); };
}
