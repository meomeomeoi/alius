import type { StAdapter } from '../../st/adapter';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { sidecarSchema, type ArtSidecar } from '../scene/art';
import { panelOf } from './fit';
import type { Lookup } from './fit/panel';
import type { StageCtx } from './section';
import { SLOT_INFO, SLOT_STATE_WORD, slotState, visibleSlotKeys, type SlotKey } from './slots';
import { openPreview, previewRefusal } from './preview';
import { markZones, stopMarking } from './zones';

/**
 * P10e-f: her slots on her page. The list of her slot keys with their state, and the editor of one slot: LOAD (an image file, kept as a
 * draft until SAVE), the fit (the slot's prototype panel, ported: `fit/`), the zones (the prototypes' marker, `zones.ts`), SAVE (the picture, then its sidecar `<key>.fit.json`),
 * CHECK (the draft tried in its mini-game: `preview.ts`) and REMOVE. Setup data about a card, outside any campaign: nothing here dispatches, saves a campaign or draws an rng.
 */

/** A slot being edited: the picture chosen (not uploaded yet), the URL drawn (the chosen file's or her folder's) and the sidecar. */
export interface SlotDraft {
  file?: File;
  url: string | null;
  sidecar: ArtSidecar;
}

/** The largest picture accepted (Global Constraints). */
export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;
const MIME_EXT: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif' };

/** The extension a picture is saved with: its own name's when ST lists that type, else its MIME type's; null = a type ST does not list. */
export function imageExt(file: File): string | null {
  const own = /\.(png|webp|jpe?g|gif|avif)$/i.exec(file.name)?.[1];
  return own !== undefined ? own.toLowerCase() : MIME_EXT[file.type] ?? null;
}

/** Why a file is refused (null = accepted): only `image/*` up to 20 MB, of a type ST's sprite list returns. */
export function refusal(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Not a picture: only image files can be loaded.';
  if (file.size > MAX_PICTURE_BYTES) return 'The picture is larger than 20 MB.';
  if (imageExt(file) === null) return 'That picture type is not listed by SillyTavern: use png, webp, jpg, gif or avif.';
  return null;
}

/** A panel's copy as a sidecar: nulls dropped (`zones: null` before any marking), unknown keys (`slot`, `kind`) dropped by the schema. */
function toSidecar(raw: unknown): ArtSidecar {
  const clean = Object.fromEntries(Object.entries((raw ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined));
  return sidecarSchema.parse(clean);
}

/** Uploads the picture (only when a file was chosen: `<key>.<ext>`), then the sidecar (`<key>.fit` + `json`), then reloads. False when an upload failed. */
export async function saveSlot(st: StAdapter, avatar: string, key: SlotKey, draft: SlotDraft, refresh?: () => Promise<void>): Promise<boolean> {
  if (draft.file !== undefined) {
    const ext = imageExt(draft.file);
    if (ext === null) return false;
    const ok = await st.uploadStageFile(avatar, key, draft.file, ext).catch(() => false);
    if (!ok) return false;
  }
  const blob = new Blob([JSON.stringify(draft.sidecar, null, 2)], { type: 'application/json' });
  const ok = await st.uploadStageFile(avatar, `${key}.fit`, blob, 'json').catch(() => false);
  if (ok && refresh) await refresh().catch(() => {});
  return ok;
}

/**
 * The picture of an `art.json` slot as a file for her folder (`<key>.<ext>`): fetched through its asset URL from the ST server, its type
 * from the URL's extension, else the answer's MIME type. Null when it cannot be read or its type is not one ST lists.
 */
export async function manifestPictureFile(st: StAdapter, url: string, key: SlotKey): Promise<File | null> {
  const blob = await st.fetchAsset(url).catch(() => null);
  if (blob === null) return null;
  const own = /\.(png|webp|jpe?g|gif|avif)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  const ext = own ?? MIME_EXT[blob.type];
  if (ext === undefined) return null;
  const type = blob.type !== '' ? blob.type : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return new File([blob], `${key}.${ext}`, { type });
}

/** Deletes the picture (`<key>`, any type) and its sidecar (`<key>.fit`), then reloads. */
export async function removeSlot(st: StAdapter, avatar: string, key: SlotKey, refresh?: () => Promise<void>): Promise<boolean> {
  const a = await st.deleteStageFile(avatar, key).catch(() => false);
  const b = await st.deleteStageFile(avatar, `${key}.fit`).catch(() => false);
  if (refresh) await refresh().catch(() => {});
  return a && b;
}

/** What the slot list gives the editor beyond `StageCtx` (all optional for a bare editor). */
export interface SlotEditorHooks {
  draft: SlotDraft;
  /** After each edit (the list's unsaved mark). */
  onChange?: () => void;
  /** After a save or a removal went through (the list redraws its states). */
  onStored?: () => void;
  /** CLOSE (the list drops the editor). */
  onClose?: () => void;
}

/** The editor open now: its teardown (the chosen file's URL revoked), whether it has unsaved edits. */
interface OpenEditor { key: SlotKey; dirty: () => boolean; drop: () => void }
let openEditor: OpenEditor | null = null;

/**
 * Draws the editor of slot `key` of her into `host` (replacing what is there). The draft is edited in place; nothing is uploaded until
 * SAVE. CHECK (beside SAVE, in `.alius-stage-slot-actions`) opens the preview with the draft as it is.
 */
export function openSlotEditor(host: HTMLElement, unitId: string, key: SlotKey, ctx: StageCtx & SlotEditorHooks): void {
  openEditor?.drop();
  const { draft } = ctx;
  const info = SLOT_INFO[key];
  const avatar = ctx.getState()?.squad.find((u) => u.id === unitId)?.cardRef ?? null;
  const chatId = ctx.st.getActiveChat()?.chatId ?? null;
  const panel = panelOf(key);
  let saved = JSON.stringify(draft.sidecar);
  let ownUrl: string | null = null; // a URL this editor made (revoked when it goes)
  let dropped = false;

  // --- the preview frame
  const img = h('img', { class: 'alius-stage-slot-img', alt: info.label, draggable: 'false' }) as HTMLImageElement;
  const empty = h('span', { class: 'alius-dim alius-stage-slot-empty' }, 'no picture');
  const drawPicture = (): void => {
    if (draft.url === null) { img.removeAttribute('src'); img.hidden = true; empty.hidden = false; return; }
    img.src = draft.url; img.hidden = false; empty.hidden = true;
  };
  const canvas = info.zones ? h('canvas', { class: 'alius-stage-zones', 'aria-hidden': 'true' }) as HTMLCanvasElement : null;
  const frame = h('div', { class: 'alius-stage-slot-frame', 'data-slot': key }, img, empty, canvas);
  drawPicture();

  // --- LOAD
  const file = h('input', { type: 'file', name: 'load', accept: 'image/*' }) as HTMLInputElement;
  const load = h('label', { class: 'alius-field alius-option alius-stage-load', ...analyzeNative('glossary:stage_load') }, h('span', { class: 'alius-field-label' }, '[ LOAD ] a picture'), file);

  // --- the fit: the prototype's controls, bound by the prototype's own code
  panel.load(key, draft.sidecar);
  const ids = panel.ids(key);
  const rows = ids.map((id) => {
    const c = panel.controls[id]!;
    const value = String(panel.value(id));
    const writes = (panel.writes[id] ?? []).join(' ');
    const field = c.type === 'range'
      ? h('input', { type: 'range', 'data-proto': id, 'data-fit': writes, name: id, min: String(c.min), max: String(c.max), step: String(c.step), value })
      : h('select', { 'data-proto': id, 'data-fit': writes, name: id }, ...c.options.map(([v, t]) => h('option', { value: v }, t)));
    (field as HTMLInputElement).value = value;
    return h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:stage_fit') },
      h('span', { class: 'alius-field-label' }, c.label), field,
      c.type === 'range' ? h('span', { class: 'alius-stage-value', 'data-proto': `${id}V` }, value) : null);
  });
  const note = panel.note(key);
  const fit = h('div', { class: 'alius-stage-fit', 'data-prototype': panel.prototype }, ...rows, note === null ? null : h('p', { class: 'alius-dim' }, note));
  const detached = new Map<string, HTMLInputElement>();
  const $: Lookup = (selector: string) => {
    const id = selector.replace(/^#/, '');
    const own = fit.querySelector(`[data-proto="${id}"]`);
    if (own) return own;
    // the prototype's page parts the editor does not show (other slots' controls, its pictures, its notes): detached stand-ins
    let el = detached.get(id);
    if (!el) { el = document.createElement('input'); el.value = id in panel.controls ? String(panel.value(id)) : ''; detached.set(id, el); }
    return el;
  };
  if (ids.length > 0) panel.bind($);

  // --- the actions
  const status = h('span', { class: 'alius-stage-status', role: 'status' });
  const saveBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'save', ...analyzeNative('glossary:stage_fit') }, '[ SAVE ]') as HTMLButtonElement;
  const removeBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'remove', ...analyzeNative('glossary:stage_remove') }, '[ REMOVE ]') as HTMLButtonElement;
  const closeBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'close', ...analyzeNative('glossary:stage_setup') }, '[ CLOSE ]');
  // the zones: the prototypes' marker on the picture (shown only while marking)
  const zonesBtn = canvas === null ? null : h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'zones', ...analyzeNative('glossary:stage_zones') }, '[ MARK ZONES ]') as HTMLButtonElement;
  zonesBtn?.addEventListener('click', () => {
    if (canvas === null || draft.url === null) return;
    markZones(canvas, img, key, draft.sidecar, (zones) => { draft.sidecar = { ...draft.sidecar, zones }; edited(); });
  });
  // CHECK: the slot tried in its mini-game on a demo state, with the draft as it is now (nothing saved first; `preview.ts`)
  const checkBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'check', ...analyzeNative('glossary:stage_preview') }, '[ CHECK ]') as HTMLButtonElement;
  checkBtn.addEventListener('click', () => {
    if (draft.url === null || !stillHere()) return;
    // the open campaign has a scene: refused with its reason (the button shows it soft-disabled)
    const refused = previewRefusal(ctx);
    if (refused !== null) { ctx.toast('warn', refused); mark(); return; }
    stopMarking();
    openPreview(unitId, key, draft, ctx);
  });
  const actions = h('div', { class: 'alius-stage-slot-actions' }, zonesBtn, saveBtn, checkBtn, removeBtn, closeBtn, status);

  const dirty = (): boolean => draft.file !== undefined || JSON.stringify(draft.sidecar) !== saved;
  const inFolder = (): boolean => avatar !== null && ctx.folders().get(avatar)?.slots.has(key) === true;
  const mark = (): void => {
    saveBtn.disabled = !dirty() || avatar === null;
    if (zonesBtn) zonesBtn.disabled = draft.url === null;
    checkBtn.disabled = draft.url === null;
    const refused = previewRefusal(ctx); // soft-disabled (`aria-disabled`, still analyzable) with the reason as its title
    if (refused !== null) { checkBtn.setAttribute('aria-disabled', 'true'); checkBtn.title = refused; }
    else { checkBtn.removeAttribute('aria-disabled'); checkBtn.removeAttribute('title'); }
    removeBtn.disabled = !inFolder();
    status.textContent = dirty() ? 'unsaved' : '';
  };
  const edited = (): void => { mark(); ctx.onChange?.(); };
  const stillHere = (): boolean => !dropped && (ctx.st.getActiveChat()?.chatId ?? null) === chatId;

  // after the prototype's handler (on the control itself), the copy of the fit becomes the draft's sidecar
  const refit = (e: Event): void => {
    if (!(e.target instanceof HTMLElement) || e.target.dataset.proto === undefined) return;
    draft.sidecar = toSidecar(panel.copy(key));
    edited();
  };
  fit.addEventListener('input', refit);
  fit.addEventListener('change', refit);

  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    const why = refusal(chosen);
    if (why !== null) { ctx.toast('warn', why); return; }
    stopMarking(); // the zones are marked on the picture shown
    if (ownUrl !== null) URL.revokeObjectURL(ownUrl);
    ownUrl = URL.createObjectURL(chosen);
    draft.file = chosen;
    draft.url = ownUrl;
    drawPicture();
    edited();
  });

  saveBtn.addEventListener('click', async () => {
    if (!dirty() || avatar === null) return;
    saveBtn.disabled = true;
    // the picture is the manifest's (an `art.json`-only slot): it is copied into her folder first, so the folder holds the picture and
    // its sidecar together and wins (a sidecar alone is never read); unreadable, nothing is saved
    if (draft.file === undefined && draft.url !== null && !inFolder()) {
      const copy = await manifestPictureFile(ctx.st, draft.url, key);
      if (!stillHere()) return;
      if (copy === null) { ctx.toast('warn', `${info.label} could not be saved: the picture of art.json could not be read.`); mark(); return; }
      draft.file = copy;
    }
    const ok = await saveSlot(ctx.st, avatar, key, draft, ctx.refresh);
    if (!stillHere()) return;
    if (ok) {
      delete draft.file;
      saved = JSON.stringify(draft.sidecar);
      ctx.toast('info', `Saved: ${info.label}.`);
      ctx.onStored?.();
    } else ctx.toast('warn', `${info.label} could not be saved (the server refused the file).`);
    mark();
  });
  removeBtn.addEventListener('click', async () => {
    if (avatar === null || !inFolder()) return;
    const answer = await ctx.modal({
      title: 'REMOVE THIS SLOT',
      body: `Delete the picture of ${info.label} and its fit from her folder?`,
      actions: [{ label: '[ REMOVE ]', value: 'remove', analyze: 'glossary:stage_remove' }, { label: '[ KEEP ]', value: 'keep', analyze: 'glossary:stage_remove' }],
    });
    if (answer !== 'remove' || !stillHere()) return;
    const ok = await removeSlot(ctx.st, avatar, key, ctx.refresh);
    if (!stillHere()) return;
    if (!ok) ctx.toast('warn', `${info.label} could not be removed.`);
    stopMarking();
    if (ownUrl !== null) { URL.revokeObjectURL(ownUrl); ownUrl = null; }
    delete draft.file;
    draft.url = null;
    draft.sidecar = {};
    saved = JSON.stringify(draft.sidecar);
    drawPicture();
    mark();
    ctx.onStored?.();
  });
  closeBtn.addEventListener('click', () => { ctx.onClose?.(); });

  const root = h(
    'section',
    { class: 'alius-stage-slot-editor', 'data-slot': key, ...analyzeAttrs('glossary:stage_fit') },
    h('h3', {}, info.label),
    h('div', { class: 'alius-stage-slot-row' }, frame, h('div', { class: 'alius-stage-slot-side' }, load, fit)),
    actions,
  );
  mark();
  host.replaceChildren(root);
  const self: OpenEditor = {
    key,
    dirty,
    drop: () => {
      if (dropped) return;
      dropped = true;
      stopMarking();
      if (ownUrl !== null) URL.revokeObjectURL(ownUrl);
      ownUrl = null;
      if (openEditor === self) openEditor = null;
    },
  };
  openEditor = self;
}

/** A fresh draft of her slot: her folder's picture and sidecar (or the manifest's), copied. */
export function draftOf(ctx: StageCtx, unitId: string, avatar: string, key: SlotKey): SlotDraft {
  const own = ctx.folders().get(avatar)?.slots.get(key);
  if (own) return { url: own.url, sidecar: structuredClone(own.sidecar) };
  const info = SLOT_INFO[key];
  const art = key === info.slot ? ctx.art().get(unitId, info.slot, { explicit: true }) : null;
  return art && !art.pair ? { url: art.url, sidecar: structuredClone(art.sidecar) } : { url: null, sidecar: {} };
}

/** Her slots on her page: every visible slot key with its state and EDIT; the editor opens below the list. */
export interface SlotList {
  /** An editor has unsaved edits. */
  dirty(): boolean;
  /** Closes the editor and drops its draft (the sheet closes, the chat changed). */
  drop(): void;
}

export function renderSlotList(host: HTMLElement, unitId: string, avatar: string, ctx: StageCtx & { onChange?: () => void }): SlotList {
  const list = h('ul', { class: 'alius-stage-slot-list' });
  const editHost = h('div', { class: 'alius-stage-slot-edit-host' });
  let current: SlotKey | null = null;
  const drawList = (): void => {
    const folder = ctx.folders().get(avatar);
    const art = ctx.art();
    list.replaceChildren(...visibleSlotKeys(ctx.settings().showExplicitSlots).map((key) => {
      const state = slotState(folder, art, unitId, key);
      const edit = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'edit', 'aria-pressed': String(current === key), ...analyzeNative('glossary:stage_fit') }, '[ EDIT ]');
      edit.addEventListener('click', () => open(key));
      return h('li', { 'data-slot': key },
        h('span', { class: 'alius-stage-slot-label' }, SLOT_INFO[key].label),
        h('span', { class: 'alius-stage-slot-state', 'data-state': state, ...analyzeAttrs('glossary:stage_slot_state') }, SLOT_STATE_WORD[state]),
        edit);
    }));
  };
  const close = (): void => {
    openEditor?.drop();
    current = null;
    editHost.replaceChildren();
    drawList();
    ctx.onChange?.();
  };
  const open = (key: SlotKey): void => {
    current = key;
    openSlotEditor(editHost, unitId, key, { ...ctx, draft: draftOf(ctx, unitId, avatar, key), onChange: ctx.onChange, onStored: drawList, onClose: close });
    drawList();
    ctx.onChange?.();
  };
  drawList();
  host.replaceChildren(h('section', { class: 'alius-stage-block alius-stage-her-slots' }, h('h3', {}, 'Her slots'), list, editHost));
  return {
    dirty: () => current !== null && openEditor?.dirty() === true,
    drop: () => { openEditor?.drop(); current = null; editHost.replaceChildren(); },
  };
}
