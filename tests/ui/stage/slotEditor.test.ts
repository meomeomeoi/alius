// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { createArtSlots, sidecarSchema } from '../../../src/ui/scene/art';
import { loadStageFolders, type StageFolder } from '../../../src/ui/stage/load';
import type { StageCtx } from '../../../src/ui/stage/section';
import { closeStageSheet, openStageSheet } from '../../../src/ui/stage/sheet';
import { draftOf, openSlotEditor, removeSlot, saveSlot, type SlotDraft } from '../../../src/ui/stage/slotEditor';
import { SLOT_KEYS, type SlotKey } from '../../../src/ui/stage/slots';
import { campaign, loadCore } from '../../helpers/world';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { DEFAULT_SETTINGS } from '../../../src/settings';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
beforeEach(() => {
  let n = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => `blob:test/${++n}`);
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
});
afterEach(() => { closeStageSheet(); document.body.innerHTML = ''; });

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const blobJson = (b: Blob) => new Promise<unknown>((resolve) => { const r = new FileReader(); r.onload = () => resolve(JSON.parse(String(r.result))); r.readAsText(b); });
const png = (mb: number, type = 'image/png', name = 'her.png'): File => {
  const f = new File([new Uint8Array(16)], name, { type });
  Object.defineProperty(f, 'size', { value: Math.round(mb * 1024 * 1024) });
  return f;
};
const choose = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

async function setup(fill?: (st: FakeStAdapter, s: CampaignState) => void) {
  const s = campaign(reg, 2);
  const her = s.squad[0]!;
  const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
  fill?.(st, s);
  let folders: Map<string, StageFolder> = await loadStageFolders(st, s.squad.map((u) => ({ id: u.id, cardRef: u.cardRef })));
  const refresh = vi.fn(async () => { folders = await loadStageFolders(st, s.squad.map((u) => ({ id: u.id, cardRef: u.cardRef }))); });
  const toast = vi.fn();
  const modal = vi.fn(async () => 'remove');
  const ctx: StageCtx = {
    st, getState: () => s, getRegistries: () => reg,
    art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
    openSheet: () => {}, settings: () => getSettings(st), refresh, toast, modal,
  };
  const upload = vi.spyOn(st, 'uploadStageFile');
  const del = vi.spyOn(st, 'deleteStageFile');
  return { s, her, st, ctx, upload, del, toast, modal, refresh, avatar: her.cardRef! };
}

function editor(ctx: StageCtx, unitId: string, key: SlotKey, draft: SlotDraft = { url: null, sidecar: {} }) {
  const host = document.createElement('div');
  document.body.append(host);
  openSlotEditor(host, unitId, key, { ...ctx, draft });
  return { host, draft, root: host.querySelector<HTMLElement>('.alius-stage-slot-editor')! };
}

/** The sidecar paths a slot's controls write (`data-fit`, a space-separated list per control). */
const fitPaths = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('[data-fit]')].flatMap((el) => el.dataset.fit!.split(' ')).sort();
const control = (root: HTMLElement, id: string) => root.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-proto="${id}"]`)!;
const move = (el: HTMLInputElement | HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };

describe('a slot: load (P10e-f Task 6)', () => {
  it('a 1 MB png is accepted and drawn in the slot\'s preview frame', async () => {
    const { ctx, her } = await setup();
    const { root, draft } = editor(ctx, her.id, 'over');
    choose(root.querySelector<HTMLInputElement>('input[type=file]')!, png(1));
    await flush();
    const img = root.querySelector<HTMLImageElement>('.alius-stage-slot-frame img')!;
    expect(img.getAttribute('src')).toBe('blob:test/1');
    expect(draft.file?.name).toBe('her.png');
    expect(draft.url).toBe('blob:test/1');
  });

  it('a 21 MB file or a non-image is refused with a toast, and no upload is called', async () => {
    const { ctx, her, toast, upload } = await setup();
    const { root, draft } = editor(ctx, her.id, 'over');
    const input = root.querySelector<HTMLInputElement>('input[type=file]')!;
    choose(input, png(21));
    choose(input, png(0.1, 'text/plain', 'notes.txt'));
    await flush();
    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls.every((c) => c[0] === 'warn')).toBe(true);
    expect(draft.file).toBeUndefined();
    root.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
    await flush();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('a slot: fit (the prototype\'s panel controls)', () => {
  const expected: Partial<Record<SlotKey, string[]>> = {
    over: ['fit.height', 'fit.sink', 'fit.x'],
    over_explicit: ['fit.height', 'fit.sink', 'fit.x'],
    face_close: [],
    'legs_seated.rest': ['fit.bottom', 'fit.floorShade', 'fit.width'],
    'legs_seated.foot_raised': ['fit.bottom', 'fit.width'],
    feet_floor: ['fit.bottom', 'fit.tilt', 'fit.width'],
    sole_close: ['fit.height', 'fit.y'],
    legs_astride: ['feet', 'fit.height', 'fit.tilt', 'fit.top', 'fit.x', 'shown'],
    'legs_astride.left': ['feet', 'fit.height', 'fit.tilt', 'fit.top', 'fit.x', 'shown'],
    'legs_astride.right': [],
    'shoe_close.boots': ['feet', 'fit.fade', 'fit.height', 'fit.x', 'fit.xl', 'fit.xr', 'fit.y', 'shown'],
    'shoe_sole.heels': ['feet', 'fit.fade', 'fit.height', 'fit.x', 'fit.xl', 'fit.xr', 'fit.y', 'shown'],
  };
  it.each(Object.entries(expected))('%s: the controls write the prototype\'s keys', async (key, paths) => {
    const { ctx, her } = await setup();
    const { root } = editor(ctx, her.id, key as SlotKey);
    expect(fitPaths(root)).toEqual(paths);
  });

  it('every slot key opens an editor', async () => {
    const { ctx, her } = await setup();
    for (const key of SLOT_KEYS) expect(editor(ctx, her.id, key).root.dataset.slot).toBe(key);
  });

  it('over: weight.html\'s sliders with their ranges and defaults; moving one writes the draft\'s sidecar', async () => {
    const { ctx, her } = await setup();
    const { root, draft } = editor(ctx, her.id, 'over');
    const h = control(root, 'overH');
    expect([h.type, h.min, h.max, h.step, h.value]).toEqual(['range', '0.6', '1.8', '0.01', '1.04']);
    expect(draft.sidecar).toEqual({}); // nothing moved yet: the slot stays a bare picture
    move(h, '1.2');
    expect(draft.sidecar).toEqual({ fit: { height: 1.2, x: 0.5, sink: 0 } });
    expect(root.querySelector('[data-proto="overHV"]')!.textContent).toBe('1.2');
    expect(sidecarSchema.parse(draft.sidecar)).toEqual(draft.sidecar);
  });

  it('a slot opened with its sidecar shows its values', async () => {
    const { ctx, her } = await setup();
    const { root } = editor(ctx, her.id, 'over', { url: '/x/over.png', sidecar: { fit: { height: 1.5, x: 0.4, sink: 0.1 } } });
    expect(control(root, 'overH').value).toBe('1.5');
    expect(control(root, 'overSink').value).toBe('0.1');
    expect(root.querySelector<HTMLImageElement>('.alius-stage-slot-frame img')!.getAttribute('src')).toBe('/x/over.png');
  });

  it('legs_seated.rest carries floorShade; feet_floor its tilt (her_activity.html\'s panel, one sidecar per picture)', async () => {
    const { ctx, her } = await setup();
    const rest = editor(ctx, her.id, 'legs_seated.rest');
    move(control(rest.root, 'floorShade'), '0.8');
    expect(rest.draft.sidecar).toEqual({ fit: { width: 0.62, bottom: 0.9, floorShade: 0.8 } });
    const feet = editor(ctx, her.id, 'feet_floor');
    move(control(feet.root, 'feetTilt'), '12');
    expect(feet.draft.sidecar).toEqual({ fit: { width: 0.56, bottom: 0.86, tilt: 12 } });
  });

  it('legs_astride: the picture is her right leg → feet one, shown right (throne.html\'s copy)', async () => {
    const { ctx, her } = await setup();
    const { root, draft } = editor(ctx, her.id, 'legs_astride');
    move(control(root, 'astrideFeet'), 'right');
    expect(draft.sidecar).toEqual({ feet: 'one', shown: 'right', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } });
    move(control(root, 'astrideFeet'), 'two');
    expect(draft.sidecar).toEqual({ feet: 'two', fit: { height: 1, x: 0.08, top: -0.1, tilt: 8 } });
  });

  it('shoe_sole.boots: shoe.html\'s defaults of the sole; two feet write xr / xl and drop shown', async () => {
    const { ctx, her } = await setup();
    const { root, draft } = editor(ctx, her.id, 'shoe_sole.boots');
    expect(control(root, 'fitH').value).toBe('0.78'); // the sole's own default (S.fit.boots_sole)
    move(control(root, 'fitH'), '0.9');
    expect(draft.sidecar).toEqual({ feet: 'one', shown: 'right', fit: { height: 0.9, y: 0.5, x: 0, fade: 0.2 } });
    move(control(root, 'feetSel'), 'two');
    expect(draft.sidecar).toEqual({ feet: 'two', fit: { height: 0.9, y: 0.5, x: 0, fade: 0.2, xr: 0.38, xl: 0.62 } });
  });

  it('every control carries data-analyze and resolves', async () => {
    const { ctx, her, s } = await setup();
    for (const key of ['over', 'shoe_close.boots', 'legs_astride', 'sole_close'] as const) {
      const { root } = editor(ctx, her.id, key);
      const controls = [...root.querySelectorAll<HTMLElement>('input, select, button')];
      expect(controls.length).toBeGreaterThan(2);
      for (const c of controls) expect(c.closest('[data-analyze]'), `${key} ${c.outerHTML}`).not.toBeNull();
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
      expect(unreachable(root)).toEqual([]);
    }
  });
});

describe('a slot: save and remove', () => {
  it('SAVE uploads the picture, then <key>.fit with the draft\'s sidecar; only the fit changed uploads only <key>.fit', async () => {
    const { st, upload, avatar, refresh } = await setup();
    const file = png(1);
    expect(await saveSlot(st, avatar, 'over', { file, url: 'blob:x', sidecar: { fit: { height: 1.2, x: 0.5, sink: 0 } } }, refresh)).toBe(true);
    expect(upload.mock.calls.map((c) => [c[1], c[3]])).toEqual([['over', 'png'], ['over.fit', 'json']]);
    expect(upload.mock.calls[0]![2]).toBe(file);
    expect(await blobJson(upload.mock.calls[1]![2])).toEqual({ fit: { height: 1.2, x: 0.5, sink: 0 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    upload.mockClear();
    await saveSlot(st, avatar, 'over', { url: '/x', sidecar: { fit: { height: 1.3, x: 0.5, sink: 0 } } });
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['over.fit']);
  });

  it('a jpeg is saved as jpg; the type comes from the file\'s name, else its MIME type', async () => {
    const { st, upload, avatar } = await setup();
    await saveSlot(st, avatar, 'face_close', { file: png(1, 'image/jpeg', 'face.jpeg'), url: 'blob:x', sidecar: {} });
    await saveSlot(st, avatar, 'face_close', { file: png(1, 'image/webp', 'pasted'), url: 'blob:x', sidecar: {} });
    expect(upload.mock.calls.filter((c) => c[1] === 'face_close').map((c) => c[3])).toEqual(['jpeg', 'webp']);
  });

  it('after over.png was saved, loading and saving over.webp replaces it and leaves the sidecar', async () => {
    const { st, avatar } = await setup();
    await saveSlot(st, avatar, 'over', { file: png(1), url: 'blob:x', sidecar: { fit: { height: 1.2, x: 0.5, sink: 0 } } });
    await saveSlot(st, avatar, 'over', { file: png(1, 'image/webp', 'her.webp'), url: 'blob:y', sidecar: { fit: { height: 1.2, x: 0.5, sink: 0 } } });
    const folder = st.stageFiles.get(avatar)!;
    expect([...folder.keys()].sort()).toEqual(['over.fit.json', 'over.webp']);
    expect(await blobJson(folder.get('over.fit.json')!)).toEqual({ fit: { height: 1.2, x: 0.5, sink: 0 } });
    // the picture alone (ST's replace rule: `over` is not `over.fit`)
    await st.uploadStageFile(avatar, 'over', png(1), 'png');
    expect([...folder.keys()].sort()).toEqual(['over.fit.json', 'over.png']);
  });

  it('REMOVE deletes the picture and its sidecar', async () => {
    const { st, avatar, del } = await setup();
    await saveSlot(st, avatar, 'sole_close', { file: png(1), url: 'blob:x', sidecar: { fit: { height: 0.6, y: 0.5 } } });
    expect(await removeSlot(st, avatar, 'sole_close')).toBe(true);
    expect(del.mock.calls.map((c) => c[1])).toEqual(['sole_close', 'sole_close.fit']);
    expect([...st.stageFiles.get(avatar)!.keys()]).toEqual([]);
  });

  it('the editor\'s SAVE and REMOVE (REMOVE asks first)', async () => {
    const { ctx, her, upload, del, modal, avatar, st } = await setup();
    const { root } = editor(ctx, her.id, 'over');
    choose(root.querySelector<HTMLInputElement>('input[type=file]')!, png(1));
    move(control(root, 'overX'), '0.6');
    root.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
    await flush();
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['over', 'over.fit']);
    expect([...st.stageFiles.get(avatar)!.keys()].sort()).toEqual(['over.fit.json', 'over.png']);
    root.querySelector<HTMLButtonElement>('[data-action=remove]')!.click();
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
    expect(del.mock.calls.map((c) => c[1])).toEqual(['over', 'over.fit']);
  });
});

describe('a slot of art.json saved on her page (the fix wave)', () => {
  /** Her art comes from the manifest alone: `over` at `ext://content/local/art/ann/over.webp`, with a fit. */
  async function manifestSetup() {
    const base = await setup();
    const { ctx, her, avatar } = base;
    let folders = ctx.folders();
    const manifest = { [avatar]: { over: { file: 'ann/over.webp', sidecar: { fit: { height: 1.1, x: 0.5, sink: 0 } } } } };
    const unitKey = (id: string) => (id === her.id ? avatar : null);
    ctx.art = () => createArtSlots(manifest, (p) => `ext://${p}`, unitKey, folders);
    ctx.folders = () => folders;
    ctx.refresh = base.refresh;
    base.refresh.mockImplementation(async () => { folders = await loadStageFolders(base.st, base.s.squad.map((u) => ({ id: u.id, cardRef: u.cardRef }))); });
    return { ...base, manifestUrl: 'ext://content/local/art/ann/over.webp' };
  }

  it('SAVE copies the manifest\'s picture into her folder first, then the sidecar: the folder wins and keeps the fit after a reload', async () => {
    const { ctx, her, st, upload, avatar, manifestUrl } = await manifestSetup();
    const bytes = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    st.assets.set(manifestUrl, bytes);
    const fetchAsset = vi.spyOn(st, 'fetchAsset');
    const { root, draft } = editor(ctx, her.id, 'over', draftOf(ctx, her.id, avatar, 'over'));
    expect(draft.url).toBe(manifestUrl);
    move(control(root, 'overX'), '0.6');
    root.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
    await flush();
    expect(fetchAsset).toHaveBeenCalledWith(manifestUrl);
    expect(upload.mock.calls.map((c) => [c[1], c[3]])).toEqual([['over', 'webp'], ['over.fit', 'json']]);
    const folder = st.stageFiles.get(avatar)!;
    expect([...folder.keys()].sort()).toEqual(['over.fit.json', 'over.webp']);
    const read = await new Promise<ArrayBuffer>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.readAsArrayBuffer(folder.get('over.webp')!); });
    expect([...new Uint8Array(read)]).toEqual([1, 2, 3]);
    expect(folder.get('over.webp')!.type).toBe('image/webp');
    // reloaded: her folder holds the slot, with the fit that was saved
    const own = ctx.folders().get(avatar)!.slots.get('over')!;
    expect(own.url).toMatch(/^\/characters\/.*\/alius\/over\.webp/);
    expect((own.sidecar.fit as { x: number }).x).toBe(0.6);
    expect(ctx.toast).toHaveBeenCalledWith('info', expect.stringContaining('Saved'));
  });

  it('the manifest\'s picture cannot be read: refused with a toast, nothing is uploaded', async () => {
    const { ctx, her, upload, avatar } = await manifestSetup(); // no asset: fetchAsset answers null
    const { root } = editor(ctx, her.id, 'over', draftOf(ctx, her.id, avatar, 'over'));
    move(control(root, 'overX'), '0.6');
    root.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
    await flush();
    expect(upload).not.toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith('warn', expect.stringContaining('could not be read'));
    expect(root.querySelector<HTMLButtonElement>('[data-action=save]')!.disabled).toBe(false); // still unsaved
  });
});

describe('her slots on her page', () => {
  it('lists every visible slot with its state; EDIT opens its editor; a chat switch drops the draft and saves nothing', async () => {
    const { ctx, her, st, upload } = await setup();
    openStageSheet(her.id, ctx);
    await flush();
    const sheet = document.querySelector<HTMLElement>('.alius-stage-sheet')!;
    const rows = [...sheet.querySelectorAll<HTMLElement>('.alius-stage-slots-host li[data-slot]')].map((r) => r.dataset.slot);
    expect(rows).toEqual(SLOT_KEYS.filter((k) => k !== 'over_explicit'));
    const row = sheet.querySelector<HTMLElement>('li[data-slot="over"]')!;
    expect(row.querySelector('[data-analyze="glossary:stage_slot_state"]')!.textContent).toBe('—');
    row.querySelector<HTMLButtonElement>('[data-action=edit]')!.click();
    await flush();
    const ed = sheet.querySelector<HTMLElement>('.alius-stage-slot-editor[data-slot="over"]')!;
    choose(ed.querySelector<HTMLInputElement>('input[type=file]')!, png(1));
    st.switchChat({ chatId: 'c2', isGroup: true, groupId: 'g2' });
    await flush();
    expect(document.querySelector('.alius-stage-sheet')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
    expect(upload).not.toHaveBeenCalled();
  });

  it('a saved slot shows its new state in the list', async () => {
    const { ctx, her } = await setup();
    openStageSheet(her.id, ctx);
    await flush();
    const sheet = document.querySelector<HTMLElement>('.alius-stage-sheet')!;
    sheet.querySelector<HTMLButtonElement>('li[data-slot="over"] [data-action=edit]')!.click();
    await flush();
    const ed = sheet.querySelector<HTMLElement>('.alius-stage-slot-editor')!;
    choose(ed.querySelector<HTMLInputElement>('input[type=file]')!, png(1));
    move(control(ed, 'overH'), '1.1');
    ed.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
    await flush();
    expect(sheet.querySelector('li[data-slot="over"] .alius-stage-slot-state')!.textContent).toBe('fitted');
  });
});
