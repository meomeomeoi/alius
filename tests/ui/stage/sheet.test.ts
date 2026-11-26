// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { handFamily, handScale } from '../../../src/engine/hand';
import { TUNING } from '../../../src/engine/tuning';
import type { CampaignState } from '../../../src/engine/state/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { createArtSlots } from '../../../src/ui/scene/art';
import { loadStageFolders, type StageFolder } from '../../../src/ui/stage/load';
import { HAND_SAMPLE_PX } from '../../../src/ui/stage/lookEditor';
import type { StageCtx } from '../../../src/ui/stage/section';
import { closeStageSheet, facesWanted, openStageSheet, saveStageSetup, standInFor } from '../../../src/ui/stage/sheet';
import { UNIT_ACCENTS } from '../../../src/ui/voice/voiceCard';
import { campaign, loadCore } from '../../helpers/world';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { markedWithout, markerCount, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { closeStageSheet(); document.body.innerHTML = ''; });

const json = (v: unknown) => new Blob([JSON.stringify(v)], { type: 'application/json' });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const blobJson = (b: Blob) => new Promise<unknown>((resolve) => { const r = new FileReader(); r.onload = () => resolve(JSON.parse(String(r.result))); r.readAsText(b); });

async function open(opts: { fill?: (st: FakeStAdapter, s: CampaignState) => void; modal?: StageCtx['modal'] } = {}) {
  const s = campaign(reg, 2);
  const her = s.squad[0];
  const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
  opts.fill?.(st, s);
  let folders: Map<string, StageFolder> = await loadStageFolders(st, s.squad.map((u) => ({ id: u.id, cardRef: u.cardRef })));
  const refresh = vi.fn(async () => { folders = await loadStageFolders(st, s.squad.map((u) => ({ id: u.id, cardRef: u.cardRef }))); });
  const modal = vi.fn(opts.modal ?? (async () => 'drop'));
  const toast = vi.fn();
  const ctx: StageCtx = {
    st, getState: () => s, getRegistries: () => reg,
    art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
    openSheet: () => {}, settings: () => getSettings(st), refresh, toast, modal,
  };
  const upload = vi.spyOn(st, 'uploadStageFile');
  const close = openStageSheet(her.id, ctx);
  await flush();
  const sheet = document.querySelector<HTMLElement>('.alius-stage-sheet')!;
  return { s, her, st, ctx, sheet, close, upload, modal, toast, refresh };
}

describe('her page: sprites, stand, hand, accent (P10e-f)', () => {
  it('facesWanted reads every label of the slap\'s table, neutral first', () => {
    const wanted = facesWanted(reg);
    expect(wanted[0]).toBe('neutral');
    for (const f of Object.values(TUNING.practice.slap.faces)) {
      for (const l of [f.before, ...f.keep, ...Object.values(f.after)]) expect(wanted).toContain(l);
    }
    expect(new Set(wanted).size).toBe(wanted.length);
    expect(standInFor('anger', new Set(['disapproval']))).toBe('disapproval'); // from the keep set of a style that asks for it
    expect(standInFor('love', new Set(['neutral']))).toBe('neutral');
    expect(standInFor('love', new Set())).toBeNull();
  });

  it('sprites: the labels found, each wanted one found or missing with its stand-in', async () => {
    const { sheet } = await open({ fill: (st, s) => { for (const l of ['neutral', 'disapproval']) st.sprites.set(`${s.squad[0].cardRef}:${l}`, `/s/${l}.png`); } });
    expect(sheet.querySelector('.alius-stage-found')!.textContent).toContain('neutral, disapproval');
    const row = (l: string) => sheet.querySelector<HTMLElement>(`.alius-stage-wanted li[data-label="${l}"]`)!;
    expect(row('neutral').dataset.found).toBe('true');
    expect(row('anger').dataset.found).toBe('false');
    expect(row('anger').textContent).toContain('stands in: disapproval');
    expect(row('love').textContent).toContain('stands in: neutral');
    expect(sheet.querySelector('.alius-stage-sprites-block')!.getAttribute('data-analyze')).toBe('glossary:stage_sprites');
    expect(sheet.querySelector<HTMLImageElement>('.alius-stage-figure-img')!.getAttribute('src')).toBe('/s/neutral.png');
  });

  it('stand: three sliders move the view drawn with the stage\'s classes; a click sets the face; SAVE uploads stage.json with only that', async () => {
    const { sheet, upload, her, refresh } = await open({
      fill: (st, s) => {
        st.sprites.set(`${s.squad[0].cardRef}:neutral`, '/s/n.png');
        st.stageFiles.set(s.squad[0].cardRef!, new Map([['stage.json', json({ hand: [...reg.handFonts.keys()][3], accent: '#123456' })]]));
      },
    });
    const sprite = sheet.querySelector<HTMLElement>('.alius-stage-look-view .alius-sprite.alius-has-stand')!;
    expect(sprite.querySelector('.alius-sprite-img')).not.toBeNull();
    const slider = (k: string) => sheet.querySelector<HTMLInputElement>(`input[name="stand.${k}"]`)!;
    expect([slider('scale').min, slider('scale').max, slider('x').min, slider('x').max, slider('y').min, slider('y').max]).toEqual(['0.5', '1.6', '-0.5', '0.5', '-0.5', '0.5']);
    slider('scale').value = '1.2'; slider('scale').dispatchEvent(new Event('input'));
    slider('y').value = '-0.1'; slider('y').dispatchEvent(new Event('input'));
    expect(sprite.style.getPropertyValue('--alius-sprite-scale')).toBe('1.2');
    expect(sprite.style.getPropertyValue('--alius-sprite-dy')).toBe('-0.1');
    const figure = sheet.querySelector<HTMLElement>('.alius-stage-figure')!;
    figure.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 400, right: 300, bottom: 450, x: 100, y: 50, toJSON() {} }) as DOMRect;
    figure.dispatchEvent(new MouseEvent('click', { clientX: 194, clientY: 118, bubbles: true }));
    expect(figure.getAttribute('data-analyze')).toBe('glossary:stage_face');
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
    const [avatar, base, blob, ext] = upload.mock.calls[0];
    expect([avatar, base, ext]).toEqual([her.cardRef, 'stage', 'json']);
    expect((blob as Blob).type).toBe('application/json');
    expect(await blobJson(blob as Blob)).toEqual({ hand: [...reg.handFonts.keys()][3], accent: '#123456', stand: { scale: 1.2, x: 0, y: -0.1 }, face: { x: 0.47, y: 0.17 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.disabled).toBe(true); // nothing left unsaved
  });

  it('the look view has a class of its own: CHECK\'s overlay class (`.alius-stage-preview`) is not on her page, and is styled once', async () => {
    const { sheet } = await open();
    expect(sheet.querySelector('.alius-stage-look-view')).not.toBeNull();
    expect(sheet.querySelector('.alius-stage-preview')).toBeNull();
    const css = readFileSync('css/75-stage-setup.css', 'utf8');
    expect(css.match(/\.alius-stage-preview\s*\{/g)?.length).toBe(1); // only the overlay's own rule
    expect(css).not.toMatch(/\.alius-stage-preview(\s+[.#\w]|\[)/); // no rule of the look view under the overlay's name
  });

  it('saveStageSetup writes stage.json and reloads', async () => {
    const st = new FakeStAdapter();
    const refresh = vi.fn(async () => {});
    expect(await saveStageSetup(st, 'Vex.png', { accent: '#abcdef' }, refresh)).toBe(true);
    expect([...st.stageFiles.get('Vex.png')!.keys()]).toEqual(['stage.json']);
    expect(refresh).toHaveBeenCalled();
  });

  it('hand: every hand in registry order at its own size; a pick sets it, "from the hash" clears it', async () => {
    const { sheet, upload } = await open();
    const samples = [...sheet.querySelectorAll<HTMLElement>('.alius-stage-hand')];
    const hands = [...reg.handFonts.values()];
    expect(hands).toHaveLength(48);
    expect(samples.map((b) => b.dataset.hand)).toEqual(hands.map((e) => e.id));
    for (const [i, b] of samples.entries()) {
      expect(b.style.fontFamily).toContain(handFamily(hands[i]));
      expect(b.style.fontSize).toBe(`${Math.round(HAND_SAMPLE_PX * handScale(hands[i]) * 100) / 100}px`);
      expect(b.getAttribute('data-analyze')).toBe('glossary:stage_hand');
    }
    samples[5].click();
    expect(samples[5].getAttribute('aria-pressed')).toBe('true');
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(await blobJson(upload.mock.calls[0][2] as Blob)).toEqual({ hand: hands[5].id });
    sheet.querySelector<HTMLButtonElement>('.alius-stage-hands [data-hand=""]')!.click();
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(await blobJson(upload.mock.calls[1][2] as Blob)).toEqual({});
  });

  it('accent: the palette and a colour of the author\'s; "from the hash" clears it', async () => {
    const { sheet, upload } = await open();
    const swatches = [...sheet.querySelectorAll<HTMLElement>('.alius-stage-swatch')];
    expect(swatches.map((b) => b.dataset.accent)).toEqual([...UNIT_ACCENTS]);
    swatches[2].click();
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(await blobJson(upload.mock.calls[0][2] as Blob)).toEqual({ accent: UNIT_ACCENTS[2] });
    const picker = sheet.querySelector<HTMLInputElement>('input[name="accent"]')!;
    picker.value = '#a1b2c3'; picker.dispatchEvent(new Event('input'));
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(await blobJson(upload.mock.calls[1][2] as Blob)).toEqual({ accent: '#a1b2c3' });
    sheet.querySelector<HTMLButtonElement>('.alius-stage-accent [data-accent=""]')!.click();
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(await blobJson(upload.mock.calls[2][2] as Blob)).toEqual({});
  });

  it('closing with unsaved edits asks once; KEEP EDITING keeps it open, DROP closes', async () => {
    let answer = 'keep';
    const { sheet, close, modal } = await open({ modal: async () => answer });
    sheet.querySelectorAll<HTMLButtonElement>('.alius-stage-hand')[1].click();
    close();
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
    expect(sheet.isConnected).toBe(true);
    answer = 'drop';
    sheet.querySelector<HTMLButtonElement>('[data-action="close"]')!.click();
    await flush();
    expect(modal).toHaveBeenCalledTimes(2);
    expect(sheet.isConnected).toBe(false);
  });

  it('a second close while the question is open asks nothing more (one question at a time)', async () => {
    let answer: (v: string) => void = () => {};
    const { sheet, close, modal } = await open({ modal: () => new Promise<string>((r) => { answer = r; }) });
    sheet.querySelectorAll<HTMLButtonElement>('.alius-stage-hand')[1].click();
    close();
    close();
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
    answer('keep');
    await flush();
    close(); // answered: the next close asks again
    await flush();
    expect(modal).toHaveBeenCalledTimes(2);
  });

  it('closing with only a slot\'s draft unsaved asks too (her look unchanged)', async () => {
    const { sheet, close, modal } = await open({ modal: async () => 'keep' });
    sheet.querySelector<HTMLButtonElement>('li[data-slot="over"] [data-action="edit"]')!.click();
    await flush();
    const ed = sheet.querySelector<HTMLElement>('.alius-stage-slot-editor[data-slot="over"]')!;
    const x = ed.querySelector<HTMLInputElement>('[data-proto="overX"]')!;
    x.value = '0.6';
    x.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    await flush();
    expect(modal).toHaveBeenCalledTimes(1);
    expect(String((modal.mock.calls[0]![0] as { body: string }).body)).toContain('A slot has');
    expect(sheet.isConnected).toBe(true);
  });

  it('in the shell it stands before the toast host (a toast it raises lies over it) and before the modal layer', async () => {
    const shell = document.createElement('div');
    shell.id = 'alius-shell';
    shell.innerHTML = '<div class="alius-frame"></div><div class="alius-toasts"></div><div class="alius-modal-layer"></div>';
    document.body.append(shell);
    const { sheet } = await open();
    expect(sheet.parentElement).toBe(shell);
    expect(sheet.nextElementSibling).toBe(shell.querySelector('.alius-toasts')); // same z (2): the later one in the DOM is on top
    const css = readFileSync('css/75-stage-setup.css', 'utf8');
    const z = (sel: string, file: string) => Number(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(readFileSync(file, 'utf8'))?.[1]);
    expect(z('.alius-stage-sheet', 'css/75-stage-setup.css')).toBe(z('.alius-toasts', 'css/10-shell.css'));
    expect(z('.alius-stage-sheet', 'css/75-stage-setup.css')).toBeLessThan(z('.alius-modal-backdrop', 'css/10-shell.css'));
    expect(css).not.toMatch(/z-index:\s*(1\d|[2-9]\d|\d{3,})/); // every z below the analysis panel's 10
  });

  it('closing with nothing changed does not ask', async () => {
    const { sheet, close, modal } = await open();
    close();
    await flush();
    expect(modal).not.toHaveBeenCalled();
    expect(sheet.isConnected).toBe(false);
  });

  it('a chat switch closes it without asking and saves nothing', async () => {
    const { sheet, st, modal, upload } = await open();
    sheet.querySelectorAll<HTMLButtonElement>('.alius-stage-hand')[1].click();
    st.switchChat({ chatId: 'c2', isGroup: true, groupId: 'g2' });
    await flush();
    expect(sheet.isConnected).toBe(false);
    expect(modal).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('a woman with no sprite folder: "no sprites found", and the page still works', async () => {
    const { sheet, upload } = await open();
    expect(sheet.querySelector('.alius-stage-no-sprites')!.textContent).toContain('No sprites found');
    expect(sheet.querySelector('.alius-stage-look-view')!.getAttribute('data-sprite')).toBe('none');
    sheet.querySelectorAll<HTMLButtonElement>('.alius-stage-swatch')[0].click();
    sheet.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('every control is marked, every address resolves and can be reached', async () => {
    const { sheet, s } = await open({ fill: (st, s) => st.sprites.set(`${s.squad[0].cardRef}:neutral`, '/s/n.png') });
    expect(markedWithout(sheet)).toEqual([]);
    expect(unresolved(sheet, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
    expect(unreachable(sheet)).toEqual([]);
    expect(markerCount(sheet)).toBeGreaterThan(48);
    expect(sheet.querySelectorAll('.alius-stage-slots-host li[data-slot]').length).toBeGreaterThan(0); // her slots (Task 6)
  });
});

describe('her page in the SYS tab (P10e-f)', () => {
  it('her name in SYS › STAGE opens her page; Esc closes it without reaching the shell', async () => {
    const { renderSysTab } = await import('../../../src/ui/shell/sysTab');
    const s = campaign(reg, 1);
    const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
    const host = document.createElement('div');
    document.body.append(host);
    renderSysTab(host, { st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c1' }), getRegistries: () => reg, toast: vi.fn(), modal: async () => null, onSettingsChanged: vi.fn() });
    host.querySelector<HTMLButtonElement>('.alius-stage-woman button')!.click();
    await flush();
    const sheet = document.querySelector<HTMLElement>('.alius-stage-sheet')!;
    expect(sheet.dataset.unit).toBe(s.squad[0].id);
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
    expect(sheet.isConnected).toBe(false);
  });
});
