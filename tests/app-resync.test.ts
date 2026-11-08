// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import type { SetupResult } from '../src/engine/setup';
import { FakeStAdapter } from '../src/st/fake';
import { h } from '../src/ui/dom';
import type { ModalOpts } from '../src/ui/shell/modal';

const SOLO = { chatId: 'solo', isGroup: false };
const OTHER = { chatId: 'chat-other', isGroup: true, groupId: 'gx' };
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const flush = () => new Promise((r) => setTimeout(r, 0));

let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});

const IMPORT_REPLY = JSON.stringify({
  roleCandidates: [{ roleId: 'defender', reason: 'Protective.' }],
  values: { pragmatism: 1, autonomy: -1, ingroup: 3, mercy: -2, corporate: 0, sacrifice: 2 },
  likes: ['rain'], dislikes: ['smoke'], triggers: ['fire'],
  signatureCandidates: [{ templateId: 'sig_shared_pain', name: 'Carry It', description: 'She takes the blow.' }],
  defectCandidates: [{ defectId: 'echo_bleed', origin: 'Heard things.' }],
  notes: 'ok',
});

const setupResult = (): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
  units: [{
    cardRef: 'rhea.png', displayName: 'Rhea', roleId: 'assault',
    signature: { templateId: 'sig_last_stand', name: 'Litany', description: 'She reads names.' },
    defects: [{ id: 'threat_saturation', origin: 'Three tours.' }],
    values: { ...ZERO, mercy: 2 }, likes: ['tea'], dislikes: [], triggers: [],
    baseline: { trust: 20, affinity: 0, attraction: 0 },
  }],
});

/** A shell whose modals are scripted: each entry gets the options and returns the answer. */
function scriptedShell() {
  type Script = (opts: ModalOpts) => Promise<string | null>;
  const script: Script[] = [];
  const modals: ModalOpts[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const tabRenderers = new Map<string, (host: HTMLElement) => void>();
  const shell = {
    open() {}, close() {}, isOpen: () => false, showScreen() {}, showTab() {},
    registerTab(id: string, r: (host: HTMLElement) => void) { tabRenderers.set(id, r); },
    registerScreen() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(opts: ModalOpts) {
      modals.push(opts);
      const next = script.shift();
      return next ? next(opts) : null;
    },
    setPalette() {}, refresh() {}, destroy() {},
  };
  return { shell, script, modals, toasts, tabRenderers, factory: () => shell as never };
}

async function boot() {
  const st = new FakeStAdapter(SOLO);
  st.characters = [{ avatar: 'rhea.png', name: 'Rhea' }];
  st.cards.set('rhea.png', { avatar: 'rhea.png', name: 'Rhea', description: 'd', personality: 'p', scenario: '', creatorNotes: '' });
  const sh = scriptedShell();
  const app = createApp(st, { loadContent: async () => content, shellFactory: sh.factory });
  await app.start();
  expect(await app.deployCampaign(setupResult(), 'new_group')).toBe(true);
  st.settings.editLock = false;
  sh.toasts.length = 0;
  const startChat = st.getActiveChat()!;

  const clickResync = () => {
    const host = h('div');
    document.body.append(host);
    sh.tabRenderers.get('squad')!(host);
    const btn = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '[ RE-SYNC FROM CARD ]');
    if (!btn) throw new Error('no re-sync button');
    btn.click();
  };
  const settle = async (modalCount: number) => {
    await vi.waitFor(() => expect(sh.modals.length).toBe(modalCount));
    await flush();
    await flush();
  };
  return { st, app, startChat, clickResync, settle, ...sh };
}

const keepOnly = (...sections: string[]) => async (opts: ModalOpts): Promise<string | null> => {
  const body = opts.body as HTMLElement;
  for (const box of body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    box.checked = sections.includes(box.dataset.section!);
  }
  return 'go';
};
const applyAfterImport = (before?: () => void) => async (): Promise<string | null> => {
  await flush();
  await flush();
  before?.();
  return 'apply';
};

describe('re-sync flow', () => {
  it('imports the chosen sections and applies them through squad/resync', async () => {
    const t = await boot();
    const relationBefore = structuredClone(t.app.current().state!.relations.unit_rhea);
    t.st.mainReplies = [IMPORT_REPLY];
    t.script.push(async () => 'go', applyAfterImport());
    t.clickResync();
    await t.settle(2);

    expect(t.modals[0].title).toBe('Re-sync from card');
    expect(t.modals[1].title).toContain('Rhea');
    const u = t.app.current().state!.squad[0];
    expect(u.roleId).toBe('defender');
    expect(u.baseStats.hp).toBe(150);
    expect(u.values).toEqual({ pragmatism: 1, autonomy: -1, ingroup: 3, mercy: -2, corporate: 0, sacrifice: 2 });
    expect([u.likes, u.dislikes, u.triggers]).toEqual([['rain'], ['smoke'], ['fire']]);
    expect(u.signatureSkill.templateId).toBe('sig_shared_pain');
    expect(u.defects).toEqual([{ id: 'echo_bleed', origin: 'Heard things.' }]);
    expect(t.app.current().state!.relations.unit_rhea).toEqual(relationBefore);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'info' });
    // the import asked for the re-sync sections, never for the baseline
    const prompt = t.st.calls[0].prompt + (t.st.calls[0].system ?? '');
    expect(prompt).not.toContain('emotionalBaseline');
    expect(prompt).toContain('roleCandidates');
  });

  it('only the ticked sections are imported and changed', async () => {
    const t = await boot();
    t.st.mainReplies = [IMPORT_REPLY];
    t.script.push(keepOnly('values'), applyAfterImport());
    t.clickResync();
    await t.settle(2);
    const prompt = t.st.calls[0].prompt + (t.st.calls[0].system ?? '');
    expect(prompt).not.toContain('roleCandidates');
    const u = t.app.current().state!.squad[0];
    expect(u.roleId).toBe('assault');
    expect(u.values.ingroup).toBe(3);
    expect(u.likes).toEqual(['tea']);
  });

  it('resync flow dispatches with the starting chat id and is dropped after a chat switch', async () => {
    const t = await boot();
    t.st.mainReplies = [IMPORT_REPLY];
    t.script.push(async () => 'go', applyAfterImport(() => t.st.switchChat(OTHER)));
    t.clickResync();
    await t.settle(2);

    expect(t.toasts.at(-1)).toMatchObject({ kind: 'error', text: expect.stringMatching(/chat changed/i) });
    // nothing was applied or saved anywhere: back in the campaign chat the unit is untouched
    t.st.switchChat(t.startChat);
    const u = t.app.current().state!.squad[0];
    expect(u.roleId).toBe('assault');
    expect(u.values.mercy).toBe(2);
    expect(t.st.readMetadata('alius')).toMatchObject({ squad: [{ roleId: 'assault' }] });
  });

  it('Cancel in the calibration modal changes nothing', async () => {
    const t = await boot();
    t.st.mainReplies = [IMPORT_REPLY];
    t.script.push(async () => 'go', async () => { await flush(); await flush(); return 'cancel'; });
    t.clickResync();
    await t.settle(2);
    expect(t.app.current().state!.squad[0].roleId).toBe('assault');
    expect(t.toasts).toEqual([]);
  });

  it('closing the section modal does nothing; no section ticked warns and imports nothing', async () => {
    const t = await boot();
    t.script.push(async () => null);
    t.clickResync();
    await t.settle(1);
    expect(t.st.calls).toHaveLength(0);

    t.script.push(keepOnly());
    t.clickResync();
    await t.settle(2);
    expect(t.st.calls).toHaveLength(0);
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'warn' });
  });

  it('a failed import falls back to manual calibration in the same modal', async () => {
    const t = await boot(); // no main reply queued: the call fails
    let seen = '';
    t.script.push(async () => 'go', async (opts) => {
      await flush();
      await flush();
      seen = (opts.body as HTMLElement).textContent ?? '';
      return 'cancel';
    });
    t.clickResync();
    await t.settle(2);
    expect(seen).toContain('MANUAL');
    expect(t.app.current().state!.squad[0].roleId).toBe('assault');
  });

  it('Apply while the import is still running does nothing', async () => {
    const t = await boot();
    t.st.generateMain = () => new Promise<string>(() => {}); // never answers
    t.script.push(async () => 'go', async () => 'apply');
    t.clickResync();
    await t.settle(2);
    await flush();
    expect(t.toasts.at(-1)).toMatchObject({ kind: 'warn' });
    expect(t.app.current().state!.squad[0].roleId).toBe('assault');
  });

  it('typing in a re-sync text field does not lose focus', async () => {
    const t = await boot();
    t.st.mainReplies = [IMPORT_REPLY];
    let focusAfter: string | undefined;
    let valueAfter = '';
    t.script.push(async () => 'go', async (opts) => {
      await flush();
      await flush();
      const body = opts.body as HTMLElement;
      document.body.append(body); // a real modal lives in the document
      const input = body.querySelector<HTMLInputElement>('input[data-key="sig-name"]')!;
      input.focus();
      input.value = 'Renamed Skill';
      input.dispatchEvent(new Event('input'));
      focusAfter = (document.activeElement as HTMLElement | null)?.dataset?.key;
      valueAfter = (document.activeElement as HTMLInputElement | null)?.value ?? '';
      return 'cancel';
    });
    t.clickResync();
    await t.settle(2);
    expect(focusAfter).toBe('sig-name');
    expect(valueAfter).toBe('Renamed Skill');
  });
});
