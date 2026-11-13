// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AliusApp } from '../src/app';
import { loadPacks } from '../src/content/loader';
import { createCampaign } from '../src/engine/state/create';
import type { CampaignState } from '../src/engine/state/types';
import { FakeStAdapter } from '../src/st/fake';
import { METADATA_KEY } from '../src/st/persistence';
import type { ModalOpts } from '../src/ui/shell/modal';

const GROUP = { chatId: 'chat-a', isGroup: true, groupId: 'g1' };
let content: Awaited<ReturnType<typeof loadPacks>>;
beforeAll(async () => {
  content = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(content.errors).toEqual([]);
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** A shell whose modals are answered by `answer`, which may drive the modal's body first. */
function scriptedShell(answer: (o: ModalOpts) => string | null | Promise<string | null>) {
  const modals: ModalOpts[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const shell = {
    open() {}, close() {}, isOpen: () => true, showScreen() {}, showTab() {}, registerTab() {}, registerScreen() {}, setTabBadge() {},
    toast(kind: string, text: string) { toasts.push({ kind, text }); },
    async modal(o: ModalOpts) {
      modals.push(o);
      return answer(o);
    },
    setPalette() {}, refresh() {}, destroy() {},
  };
  return { shell, modals, toasts };
}

/** What a P6 save looks like: a campaign with no commander file. */
function oldCampaign(): CampaignState {
  const s = createCampaign({ seed: 5, commanderName: 'Old' });
  for (const k of ['body', 'bodyXp', 'expression', 'seasoning', 'traits', 'archetype', 'fileReviewed'] as const) delete s.commander[k];
  return s;
}
async function boot(st: FakeStAdapter, answer: (o: ModalOpts) => string | null | Promise<string | null>): Promise<{ app: AliusApp; modals: ModalOpts[]; toasts: Array<{ kind: string; text: string }> }> {
  const sh = scriptedShell(answer);
  const app = createApp(st, { loadContent: async () => content, shellFactory: () => sh.shell as never });
  await app.start();
  await vi.advanceTimersByTimeAsync(10);
  return { app, modals: sh.modals, toasts: sh.toasts };
}
const settle = () => vi.advanceTimersByTimeAsync(700);
const bodyOf = (o: ModalOpts): HTMLElement => o.body as HTMLElement;
const click = (root: HTMLElement, sel: string) => (root.querySelector(sel) as HTMLElement).click();

describe('review modal for an old campaign (P7)', () => {
  it('the review modal opens once and skip marks it reviewed', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, oldCampaign());
    const first = await boot(st, () => 'skip');
    expect(first.modals).toHaveLength(1);
    expect(first.modals[0].title).toBe('Commander file incomplete — review');
    expect(first.modals[0].actions.map((a) => a.value)).toEqual(['confirm', 'skip']);
    expect(first.app.current().state!.commander.fileReviewed).toBe(true);
    expect(first.app.current().state!.commander.body).toEqual({ strength: 3, endurance: 3, reflexes: 2 }); // the defaults stay
    await settle();
    // a later load of the same campaign never asks again
    const second = await boot(st, () => 'skip');
    expect(second.modals).toHaveLength(0);
    expect(second.app.current().state!.commander.fileReviewed).toBe(true);
  });

  it('the form is prefilled with the defaults and shows descriptors', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, oldCampaign());
    let text = '';
    await boot(st, (o) => { text = bodyOf(o).textContent ?? ''; return 'skip'; });
    expect(text).toContain('Average');
    expect(text).toContain('Slow');
    expect(text).toContain('Experienced');
    expect(text).toContain('POINTS LEFT 2');
  });

  it('confirm applies the profile', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, oldCampaign());
    const { app } = await boot(st, (o) => {
      const b = bodyOf(o);
      click(b, 'button[data-body="strength"][data-step="+"]');
      click(b, 'button[data-expression="2"]');
      click(b, 'button[data-trait="old_wound"]');
      return 'confirm';
    });
    const c = app.current().state!.commander;
    expect(c.body).toEqual({ strength: 4, endurance: 3, reflexes: 2 });
    expect(c.expression).toBe(2);
    expect(c.traits).toEqual({ regular: ['old_wound'] });
    expect(c.seasoning).toBe(4); // old_wound: +1 seasoning at start
    expect(c.archetype).toBe('average');
    expect(c.fileReviewed).toBe(true);
  });

  it('closing the modal without an answer keeps the file open for the next load, but never reopens it in this session', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, oldCampaign());
    const first = await boot(st, () => null);
    expect(first.modals).toHaveLength(1);
    expect(first.app.current().state!.commander.fileReviewed).toBe(false);
    st.switchChat({ chatId: 'other', isGroup: true, groupId: 'g2' });
    st.switchChat(GROUP); // a chat switch reloads the campaign in the same session
    await vi.advanceTimersByTimeAsync(10);
    expect(first.modals).toHaveLength(1);
    await settle();
    const second = await boot(st, () => 'skip');
    expect(second.modals).toHaveLength(1); // the next session asks again
  });

  it('a campaign started in the wizard is already reviewed and never asks', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, createCampaign({ seed: 2, commanderName: 'New' }));
    const { modals, app } = await boot(st, () => 'skip');
    expect(modals).toHaveLength(0);
    expect(app.current().state!.commander.fileReviewed).toBe(true);
  });
});

describe('toasts for the P7 events', () => {
  it('say what happened: body training and a quiet night', async () => {
    const st = new FakeStAdapter(GROUP);
    const c = createCampaign({ seed: 2, commanderName: 'New' });
    c.commander.traits = { regular: ['insomniac'] };
    c.slot = 'evening';
    st.writeMetadata(METADATA_KEY, c);
    const { app, toasts } = await boot(st, () => 'skip');
    const dispatch = (type: string, payload: unknown = {}) => app.dispatch({ type, payload } as never);
    dispatch('activity/do', { activityId: 'train', focus: 'body_strength' });
    expect(toasts.map((t) => t.text)).toContain('Body training: strength is a little better.');
    expect(app.current().state!.slot).toBe('night'); // the Evening ran out: nobody knocks, the insomniac stays up
    expect(toasts.map((t) => t.text)).toContain('A quiet night: nobody knocks. Sleep, or spend it awake.');
  });
});

describe('the review modal and other modals (final review)', () => {
  /** A P6 save with a decision waiting: the review and the decision both have to be offered, one after the other. */
  function withDecision(status: 'presented' | 'requested'): CampaignState {
    const s = oldCampaign();
    s.dilemmas = {
      seq: 1,
      open: {
        id: 'dl1', templateId: 'dil_rations', scale: 'minor', context: 'base', day: 1, status, attempts: 0, units: [], beatId: 'open',
        ...(status === 'presented'
          ? { title: 'Short rations', setup: 'The mess hall is short again.', source: 'fallback' as const, options: [
            { label: 'Cut portions', effects: [{ type: 'party_stress' as const, amount: 5 }], magnitudes: [] },
            { label: 'Buy on the black market', effects: [{ type: 'resource' as const, resource: 'credits' as const, amount: -5 }], magnitudes: [] },
          ] }
          : {}),
      },
    };
    return s;
  }
  const titles = (modals: ModalOpts[]) => modals.map((m) => m.title);

  it('a decision waiting in an old save is shown after the review, not cancelled by it', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, withDecision('presented'));
    const { modals } = await boot(st, () => 'skip');
    expect(titles(modals)).toEqual(['Commander file incomplete — review', 'DECISION']);
  });

  it('a decision that arrives while the review is open waits for it, and the review keeps the edits', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, withDecision('requested'));
    let finishReview!: (v: string) => void;
    const { app, modals } = await boot(st, (o) => {
      if (o.title !== 'Commander file incomplete — review') return 'skip';
      click(bodyOf(o), 'button[data-body="strength"][data-step="+"]');
      return new Promise<string>((r) => { finishReview = r; });
    });
    expect(titles(modals)).toEqual(['Commander file incomplete — review']);
    // the decision is written while the player is still editing the form
    app.dispatch({ type: 'dilemma/fallback', payload: { requestId: 'dl1' } } as never);
    await vi.advanceTimersByTimeAsync(10);
    expect(titles(modals)).toEqual(['Commander file incomplete — review']); // it did not cancel the form
    finishReview('confirm');
    await vi.advanceTimersByTimeAsync(10);
    expect(app.current().state!.commander.body!.strength).toBe(4); // the edit survived
    expect(titles(modals)).toEqual(['Commander file incomplete — review', 'DECISION']);
  });

  it('a decision waiting in an old save that the player closes the review on is still offered', async () => {
    const st = new FakeStAdapter(GROUP);
    st.writeMetadata(METADATA_KEY, withDecision('presented'));
    const { modals } = await boot(st, (o) => (o.title === 'DECISION' ? 'x' : null));
    expect(titles(modals)).toEqual(['Commander file incomplete — review', 'DECISION']);
  });
});
