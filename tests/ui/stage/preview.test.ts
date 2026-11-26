// @vitest-environment jsdom
/**
 * P10e-f Task 8: CHECK in a slot's editor runs the slot's mini-game on a demo state in a sandbox over the shell: the real scene screen,
 * her real sprite, the unsaved draft as the slot's picture, a dispatch on the sandbox's own clone. The open campaign, its save, its chat
 * and the model are never touched; closing, Esc and a chat switch drop it at once and reset the scene stage.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// the app's actions and hooks, in the app's order (the sandbox runs the engine as the app has it)
import '../../../src/engine/actions/debug';
import '../../../src/engine/actions/squad';
import '../../../src/engine/actions/calendar';
import '../../../src/engine/actions/base';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/combat';
import '../../../src/engine/actions/progression';
import '../../../src/engine/actions/world';
import '../../../src/engine/actions/expedition';
import '../../../src/engine/actions/leash';
import '../../../src/engine/actions/loyalty';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/immersion';
import '../../../src/engine/actions/power';
import '../../../src/engine/actions/dilemma';
import '../../../src/engine/actions/arc';
import '../../../src/engine/actions/items';
import '../../../src/engine/actions/commander';
import '../../../src/engine/actions/onboarding';
import '../../../src/engine/actions/special';
import '../../../src/engine/actions/warden';
import '../../../src/engine/actions/generations';
import '../../../src/engine/actions/headStart';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/moments';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/practice';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { DEFAULT_SETTINGS, getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { createArtSlots } from '../../../src/ui/scene/art';
import { instrumentFor } from '../../../src/ui/scene/instruments';
import { onStageReset } from '../../../src/ui/scene/stage';
import { demoStateFor } from '../../../src/ui/stage/demo';
import type { StageFolder } from '../../../src/ui/stage/load';
import { closePreview, openPreview } from '../../../src/ui/stage/preview';
import type { StageCtx } from '../../../src/ui/stage/section';
import { openSlotEditor, type SlotDraft } from '../../../src/ui/stage/slotEditor';
import { SLOT_INFO, SLOT_KEYS } from '../../../src/ui/stage/slots';
import { campaign, loadCore } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom has no canvas: the instruments' stand-in context
});
afterEach(() => {
  closePreview();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup() {
  const s = campaign(reg, 2);
  const her = s.squad[0]!;
  const st = new FakeStAdapter({ chatId: 'c1', isGroup: true, groupId: 'g' });
  st.sprites.set(`${her.cardRef}:neutral`, '/characters/Ann/neutral.png');
  const shell = document.createElement('div');
  shell.id = 'alius-shell';
  document.body.append(shell);
  const folders = new Map<string, StageFolder>();
  const ctx: StageCtx = {
    st, getState: () => s, getRegistries: () => reg,
    art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
    openSheet: () => {}, settings: () => getSettings(st), refresh: vi.fn(async () => {}), toast: vi.fn(), modal: vi.fn(async () => null),
  };
  // every adapter (the app's and the sandbox's own) is watched: nothing may save, generate or reach the chat
  const save = vi.spyOn(FakeStAdapter.prototype, 'saveMetadata');
  const main = vi.spyOn(FakeStAdapter.prototype, 'generateMain');
  const profile = vi.spyOn(FakeStAdapter.prototype, 'generateWithProfile');
  const send = vi.spyOn(FakeStAdapter.prototype, 'sendUserMessage');
  const write = vi.spyOn(FakeStAdapter.prototype, 'writeMetadata');
  return { s, her, st, ctx, shell, spies: { save, main, profile, send, write } };
}

function editorWithCheck(ctx: StageCtx, unitId: string, key: Parameters<typeof openSlotEditor>[2], draft: SlotDraft) {
  const host = document.createElement('div');
  document.getElementById('alius-shell')!.append(host);
  openSlotEditor(host, unitId, key, { ...ctx, draft });
  return host.querySelector<HTMLButtonElement>('.alius-stage-slot-actions [data-action="check"]');
}

const overlay = () => document.querySelector<HTMLElement>('#alius-shell .alius-stage-preview');

describe('the preview in the mini-game (P10e-f Task 8)', () => {
  it('CHECK on `over` opens the weight instrument with the draft\'s picture', async () => {
    const { ctx, her } = setup();
    const check = editorWithCheck(ctx, her.id, 'over', { url: 'blob:test/over', sidecar: { fit: { height: 1.1, x: 0.5, sink: 0 } } });
    expect(check).not.toBeNull();
    check!.click();
    await flush();
    const o = overlay();
    expect(o).not.toBeNull();
    expect(o!.querySelector('[data-instrument="weight"]')).not.toBeNull();
    expect(o!.querySelector<HTMLImageElement>('.alius-weight-over')?.getAttribute('src')).toBe('blob:test/over');
  });

  it('her sprite is her real one (the app adapter\'s URL)', async () => {
    const { ctx, her, st } = setup();
    const sprite = vi.spyOn(st, 'getSpriteUrl');
    openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
    await flush();
    expect(sprite).toHaveBeenCalledWith(her.cardRef, expect.any(String));
  });

  it('the open campaign is deep-equal before and after; nothing saves, generates or reaches the chat', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, her, s, spies } = setup();
      const before = structuredClone(s);
      const close = openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
      await vi.advanceTimersByTimeAsync(100);
      expect(overlay()!.querySelector('[data-instrument="weight"]')).not.toBeNull();
      // the sandbox's own clock ends the segment: with nothing held the commander collapses and the run ends there, in the sandbox
      await vi.advanceTimersByTimeAsync(45_000);
      expect(overlay()!.querySelector('[data-instrument="weight"]')).toBeNull();
      close();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(s).toEqual(before);
      expect(ctx.getState()).toBe(s);
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the global settings are left as they were (both real-time gates are on inside the sandbox only)', async () => {
    const { ctx, her, st } = setup();
    const before = JSON.stringify(getSettings(st));
    openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
    await flush();
    expect(overlay()!.querySelector('[data-instrument="weight"]')).not.toBeNull();
    expect(JSON.stringify(getSettings(st))).toBe(before);
  });

  it('closing removes the overlay and resets the scene stage; Esc too', async () => {
    const { ctx, her } = setup();
    const reset = vi.fn();
    const off = onStageReset(reset);
    try {
      openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
      await flush();
      reset.mockClear();
      overlay()!.querySelector<HTMLButtonElement>('.alius-stage-preview-head [data-action="close"]')!.click();
      expect(overlay()).toBeNull();
      expect(reset).toHaveBeenCalled();

      openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
      await flush();
      overlay()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(overlay()).toBeNull();
    } finally {
      off();
    }
  });

  it('a chat switch closes it at once, resets the scene stage and dispatches nothing into the new campaign', async () => {
    const { ctx, her, st, s, spies } = setup();
    const before = structuredClone(s);
    const reset = vi.fn();
    const off = onStageReset(reset);
    try {
      openPreview(her.id, 'over', { url: 'blob:test/over', sidecar: {} }, ctx);
      await flush();
      reset.mockClear();
      st.switchChat({ chatId: 'c2', isGroup: true, groupId: 'g2' });
      expect(overlay()).toBeNull();
      expect(reset).toHaveBeenCalled();
      await flush();
      expect(s).toEqual(before);
      for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('CHECK and the preview\'s own controls carry `data-analyze` that resolves', async () => {
    const { ctx, her, s } = setup();
    const check = editorWithCheck(ctx, her.id, 'over', { url: 'blob:test/over', sidecar: {} });
    expect(check?.dataset.analyze).toBe('glossary:stage_preview');
    check!.click();
    await flush();
    const head = overlay()!.querySelector<HTMLElement>('.alius-stage-preview-head')!;
    expect(markedWithout(head)).toEqual([]);
    expect(unresolved(head, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
    expect(unreachable(head)).toEqual([]);
  });

  it('CHECK is disabled while the slot has no picture', () => {
    const { ctx, her } = setup();
    const check = editorWithCheck(ctx, her.id, 'over', { url: null, sidecar: {} });
    expect(check?.disabled).toBe(true);
  });

  it('every slot key has a demo state, and it starts the slot\'s own instrument', () => {
    const her = { id: 'unit_vex', cardRef: 'vex.png', displayName: 'Vex' };
    const on = { ...DEFAULT_SETTINGS, physicsRealtime: true };
    for (const key of SLOT_KEYS) {
      const info = SLOT_INFO[key];
      const d: CampaignState | null = demoStateFor(info.instrument, her, reg, key);
      expect(d, key).not.toBeNull();
      expect(d!.squad[0]!.cardRef, key).toBe('vex.png');
      if (info.instrument === 'slap') {
        expect(d!.practices?.slap?.holderId, key).toBe(d!.squad[0]!.id);
        continue;
      }
      const run = d!.scene!.physics!;
      expect(run.holderId, key).toBe(d!.squad[0]!.id);
      expect(instrumentFor(run, d!, reg, on)?.id, key).toBe(info.instrument);
    }
  });

  it('every slot key opens its own instrument in the preview, with the draft drawn in it', async () => {
    const { ctx, her, s } = setup();
    const showing = new Set<string>();
    // a picture drawn on a canvas is an `Image` that never enters the page: every src set is recorded
    const srcs: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement, v: string) { srcs.push(v); desc.set!.call(this, v); });
    for (const key of SLOT_KEYS) {
      const info = SLOT_INFO[key];
      const url = `blob:test/${key}`;
      const close = openPreview(her.id, key, { url, sidecar: {} }, ctx);
      await flush();
      const o = overlay();
      expect(o, key).not.toBeNull();
      if (info.instrument !== 'slap') expect(o!.querySelector(`[data-instrument="${info.instrument}"]`), key).not.toBeNull();
      const drawn = srcs.includes(url) || [...o!.querySelectorAll<HTMLImageElement>('img')].some((img) => img.getAttribute('src') === url)
        || [...o!.querySelectorAll<HTMLElement>('*')].some((el) => el.style.backgroundImage.includes(url));
      if (drawn) showing.add(key);
      close();
      expect(overlay(), key).toBeNull();
    }
    expect([...SLOT_KEYS].filter((k) => !showing.has(k))).toEqual([]);
    expect(s.scene).toBeUndefined();
  });

  it('the layout test\'s instrument fixtures are built from demo.ts (one copy)', () => {
    const src = readFileSync('tests/layout/mkstate.ts', 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/src\/ui\/stage\/demo'/);
    expect(src).not.toMatch(/function (breathing|weighting|scenting|jawing|framing|throning|servicing|shoeing|gulping|slapping)\(/);
  });
});
