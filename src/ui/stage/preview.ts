/**
 * P10e-f: CHECK — a slot tried in its mini-game (spec §16.3). The real scene screen runs in a sandbox overlay over the shell (z 3: above
 * her page and the toasts, below a modal (it stands before the modal layer) and the analysis panel) on a demo state built for the slot's instrument (`demo.ts`) with her as the holder:
 * - her real sprites (a `FakeStAdapter` that asks the app's adapter for her sprite and avatar URLs, and answers everything else itself);
 * - the slot's unsaved draft as its picture (an `ArtSlots` over her folder with the draft in place of the slot; the other slots read as
 *   in play);
 * - a dispatch that runs the engine on the sandbox's own clone, driven by its own staging controller and clock, with an envelope that never
 *   calls a model (every site runs its fallback).
 *
 * Both real-time gates are on inside the sandbox only: the demo state's mirror, and the settings the scene reads (the user's, with
 * `physicsRealtime` and every interaction on, never written back). Nothing reaches the open campaign, its save, its chat or the model.
 * Closing, Esc and a chat switch drop it at once: the clock stops, the staging goes dead, the screen is disposed and the scene stage is
 * reset, so no scene-keyed module memory of the demo (scene ids repeat) reaches the real scene.
 */
import type { Registries } from '../../content/types';
import type { Action, EngineEvent } from '../../engine/dispatch';
import { dispatch } from '../../engine/dispatch';
import { INTERACTION_TOGGLES } from '../../engine/moments/settings';
import type { CampaignState } from '../../engine/state/types';
import { createStaging, type StagingController } from '../../blocking/controller';
import type { Envelope, GenerationOutcome, SiteHandlers } from '../../llm/envelope';
import type { SceneController } from '../../scene/sceneController';
import type { AliusSettings } from '../../settings';
import { FakeStAdapter } from '../../st/fake';
import type { StAdapter } from '../../st/adapter';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { createArtSlots, type ArtSlots } from '../scene/art';
import { renderSceneScreen, type SceneScreen } from '../scene/sceneScreen';
import { resetSceneStage } from '../scene/stage';
import { demoStateFor } from './demo';
import type { StageCtx } from './section';
import type { SlotDraft } from './slotEditor';
import { SLOT_INFO, type SlotKey } from './slots';

/** How often the sandbox's clock drives its staging (the app's own clock runs at the same rate). */
const TICK_MS = 250;
const PREVIEW_CHAT = 'alius-stage-preview';

/**
 * An envelope that never calls a model: `generate` runs the site's own fallback (her cue pool from the registry, her placeholder lines)
 * and answers `failed`; nothing is recorded and nothing can be retried or rerolled.
 */
function offlineEnvelope(state: () => CampaignState | null): Envelope {
  const sites = new Map<string, SiteHandlers<unknown, unknown>>();
  return {
    bind(siteId, handlers) { sites.set(siteId, handlers as SiteHandlers<unknown, unknown>); },
    async generate<V>(siteId: string, key: string): Promise<GenerationOutcome<V>> {
      const site = sites.get(siteId);
      if (!site) return { kind: 'unbound' };
      let input: unknown;
      try {
        const s = state();
        input = s ? site.build(key) : undefined;
      } catch { input = undefined; }
      const ok = (() => {
        try { return (site as { fallback?: (k: string, i: unknown) => unknown }).fallback?.(key, input) === true; } catch { return false; }
      })();
      return { kind: 'failed', reason: 'adapter_error' as never, detail: 'the stage preview calls no model', fallbackApplied: ok };
    },
    async retry() { return { kind: 'stale' }; },
    async reroll() { return { kind: 'stale' }; },
    rerollState: () => ({ enabled: false, reason: 'The stage preview calls no model.' }),
    drop() {},
    async useFallback() {},
    takeSnapshot() {},
    clearSnapshots() {},
  };
}

/** The settings the sandbox's scene reads: the user's, with both of its gates open (real time and every interaction); never stored. */
function liveSettings(settings: AliusSettings): AliusSettings {
  return { ...settings, physicsRealtime: true, physicsInteractions: Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, true])) as AliusSettings['physicsInteractions'] };
}

/**
 * The file a slot is never drawn without: a shoe's close-up and its sole (the instrument needs both, else the card plays), the two
 * files of `legs_astride` as a pair. Null for the rest.
 */
export function partnerOf(key: SlotKey): SlotKey | null {
  const shoe = /^shoe_(close|sole)\.(boots|heels)$/.exec(key);
  if (shoe) return `shoe_${shoe[1] === 'close' ? 'sole' : 'close'}.${shoe[2]}` as SlotKey;
  if (key === 'legs_astride.left') return 'legs_astride.right';
  if (key === 'legs_astride.right') return 'legs_astride.left';
  return null;
}

/**
 * Her slots as the sandbox reads them: the draft in place of `key` (none while it has no picture), her folder and the manifest for the
 * rest. A partner file she does not have yet (`partnerOf`) is stood in for by the draft, so the slot can be checked before its partner
 * exists; `stoodIn` says so.
 */
function draftArt(ctx: StageCtx, unitId: string, avatar: string, key: SlotKey, draft: SlotDraft, sandboxKey: (id: string) => string | null): { art: ArtSlots; stoodIn: SlotKey | null } {
  const info = SLOT_INFO[key];
  const folder = ctx.folders().get(avatar);
  const slots = new Map(folder?.slots ?? []);
  const pic = draft.url === null ? null : { url: draft.url, sidecar: structuredClone(draft.sidecar) };
  if (pic === null) slots.delete(key);
  else slots.set(key, pic);
  const partner = partnerOf(key);
  const real = ctx.art();
  const partnerSlot = partner === null ? null : SLOT_INFO[partner].slot;
  // a pair file: her folder holds the other one, or the draft stands in; a shoe's partner: her art (folder, then manifest), or the draft
  let stoodIn: SlotKey | null = null;
  if (pic !== null && partner !== null && partnerSlot === info.slot && !slots.has(partner)) { slots.set(partner, pic); stoodIn = partner; }
  if (pic !== null && partner !== null && partnerSlot !== info.slot && partnerSlot !== null && real.get(unitId, partnerSlot) === null) stoodIn = partner;
  const own = createArtSlots(null, (p) => p, sandboxKey, new Map([[avatar, { slots, setup: folder?.setup ?? null }]]));
  const mine = (id: string): boolean => sandboxKey(id) === avatar;
  const art: ArtSlots = {
    get: (id, slot, gate) => {
      if (!mine(id)) return null;
      if (slot === info.slot) return own.get(id, slot, gate);
      if (stoodIn !== null && slot === partnerSlot && partnerSlot !== info.slot) return pic;
      return real.get(unitId, slot, gate);
    },
    face: (id) => (!mine(id) ? null : own.face(id) ?? real.face(unitId)),
  };
  return { art, stoodIn };
}

/** The sandbox's adapter: its own chat, settings and model (never called); her sprite and avatar URLs from the app's adapter. */
function sandboxSt(real: StAdapter): StAdapter {
  const fake = new FakeStAdapter({ chatId: PREVIEW_CHAT, isGroup: true, groupId: PREVIEW_CHAT });
  fake.getSpriteUrl = (avatar, label) => real.getSpriteUrl(avatar, label);
  fake.listSprites = (avatar) => real.listSprites(avatar);
  fake.getAvatarUrl = (avatar) => real.getAvatarUrl(avatar);
  return fake as unknown as StAdapter;
}

/** A scene controller with nothing behind it: the preview sends nothing and reads no reply. */
function deadController(stage: (a: Action) => EngineEvent[]): SceneController {
  return {
    start: async () => false, send: async () => false, opening: async () => {}, propose() {}, follow() {}, ask() {}, limit() {}, answer() {},
    end: async () => {}, rerollLast: async () => {}, rerollState: () => ({ enabled: false, reason: 'The stage preview has no chat.' }),
    rerollSummary: async () => {}, summaryRerollState: () => ({ enabled: false, reason: 'The stage preview has no chat.' }),
    edit: async () => {}, onEdited() {}, stop() {}, transcript: () => [], onSwipe() {}, stage, replyPending: () => false, resume() {},
    idle: async () => {}, dispose() {},
  } as unknown as SceneController;
}

/** The preview open now (one at a time), closed without asking on a chat switch (one listener per adapter). */
let current: { st: StAdapter; close: () => void } | null = null;
const watched = new WeakSet<StAdapter>();
function watch(st: StAdapter): void {
  if (watched.has(st)) return;
  watched.add(st);
  st.on('chat_changed', () => { if (current?.st === st) current.close(); });
}

/** Closes the open preview at once (nothing to save: it never wrote anything). */
export function closePreview(): void {
  current?.close();
}

/** Why CHECK is refused now (null = it can open): the open campaign has a scene, whose stage and instrument host the preview would share. */
export const SCENE_OPEN_REFUSAL = 'Close the scene to check it in the game.';
export function previewRefusal(ctx: Pick<StageCtx, 'getState'>): string | null {
  return ctx.getState()?.scene ? SCENE_OPEN_REFUSAL : null;
}

/**
 * Opens the preview of her slot `key` with the unsaved `draft` (its picture and sidecar). Returns its close. Refused with a toast when
 * she has no card, the slot's instrument has no demo state or the open campaign has a scene (the scene stage and the instrument host are
 * one per page: resetting them or starting the demo's instrument would stop the real scene's; `previewRefusal`).
 */
export function openPreview(unitId: string, key: SlotKey, draft: SlotDraft, ctx: StageCtx): () => void {
  const refused = previewRefusal(ctx);
  if (refused !== null) {
    ctx.toast('warn', refused);
    return () => {};
  }
  watch(ctx.st);
  current?.close();
  const unit = ctx.getState()?.squad.find((u) => u.id === unitId && u.kind === 'named');
  const avatar = unit?.cardRef;
  if (!unit || !avatar) {
    ctx.toast('warn', 'She has no character card: nothing to check.');
    return () => {};
  }
  const reg: Registries = ctx.getRegistries();
  const info = SLOT_INFO[key];
  const demo = demoStateFor(info.instrument, { id: unit.id, cardRef: avatar, displayName: unit.displayName }, reg, key);
  if (demo === null) {
    ctx.toast('warn', `${info.label}: its mini-game cannot be shown here.`);
    return () => {};
  }
  // the sandbox's own clone: both gates of real time open in its mirror; the explicit slot with its gate on
  let sandbox: CampaignState = structuredClone(demo);
  sandbox.settings = { ...sandbox.settings, physicsRealtime: true, physicsInteractions: Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, true])) };
  if (info.explicit === true) sandbox.content = { enabled: [...new Set([...(sandbox.content?.enabled ?? []), 'explicit_scenes'])] };
  const sandboxKey = (id: string): string | null => sandbox.squad.find((u) => u.id === id)?.cardRef ?? null;
  const settings = (): AliusSettings => liveSettings(ctx.settings());

  let closed = false;
  let screen: SceneScreen | null = null;
  let staging: StagingController | null = null;
  /** The engine on the sandbox's clone only; an error leaves it as it was. */
  const run = (action: Action): EngineEvent[] => {
    if (closed) return [];
    const r = dispatch(sandbox, action, reg);
    if (!r.events.some((e) => e.type === 'error')) sandbox = r.state;
    queueMicrotask(() => { if (!closed) screen?.refresh(); });
    return r.events;
  };
  /** A dispatch from the screen (not through the staging): the staging still hears its events, as the app's follow-ups do. */
  const act = (action: Action): EngineEvent[] => {
    const events = run(action);
    if (!closed) staging?.onEvents(events);
    return events;
  };
  staging = createStaging({
    app: { dispatch: (a) => run(a), current: () => ({ state: closed ? null : sandbox }) },
    registries: () => reg, settings, generations: offlineEnvelope(() => (closed ? null : sandbox)),
    scene: { replyPending: () => false, end: async () => { close(); } },
    now: () => Date.now(), toast: () => {}, // the sandbox says nothing outside itself
  });
  const clock = setInterval(() => { if (!closed) staging?.tick(Date.now()); }, TICK_MS);

  const drawn = draftArt(ctx, unitId, avatar, key, draft, sandboxKey);
  const view = h('div', { class: 'alius-stage-preview-view' });
  const closeBtn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'close', ...analyzeNative('glossary:stage_preview') }, '[ CLOSE ]');
  const overlay = h(
    'div',
    { class: 'alius-stage-preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Check: ${info.label}, ${unit.displayName}`, 'data-slot': key, 'data-unit': unitId, tabindex: '-1' },
    h('div', { class: 'alius-stage-preview-head' },
      h('span', { class: 'alius-stage-preview-title' }, `[ CHECK // ${unit.displayName.toUpperCase()} // ${info.label} ]`),
      h('span', { class: 'alius-dim' }, drawn.stoodIn === null ? 'a demo: nothing here is saved' : `a demo: nothing here is saved; this picture also stands in for ${SLOT_INFO[drawn.stoodIn].label}, which she does not have yet`), closeBtn),
    view,
  );

  function close(): void {
    if (closed) return;
    closed = true;
    clearInterval(clock);
    staging?.reset();
    screen?.dispose();
    screen = null;
    resetSceneStage(); // the demo's scene id repeats in every campaign: what the stage remembers by it goes with the sandbox
    overlay.remove();
    if (current?.close === close) current = null;
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => {
    // the shell's keys (Esc, Tab, the number keys) do not reach the device behind; `?` still reaches the analysis tool
    if (e.key === 'Escape' || e.key === 'Tab' || /^[0-8]$/.test(e.key)) e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  const host = (typeof document !== 'undefined' ? document.getElementById('alius-shell') : null) ?? document.body;
  // before the modal layer: the preview and the modal backdrop share z 3, so the later one in the DOM (a modal opened over it) lies on top
  host.insertBefore(overlay, host.querySelector(':scope > .alius-modal-layer'));
  current = { st: ctx.st, close };
  resetSceneStage(); // and nothing the real scene left by the same scene id reaches the demo
  const s = staging;
  screen = renderSceneScreen(view, {
    controller: deadController(act), getState: () => (closed ? null : sandbox), registries: reg, st: sandboxSt(ctx.st), settings,
    onEnded: close, onClose: close, art: drawn.art,
    ...(ctx.assetUrl ? { assetUrl: ctx.assetUrl } : {}), ...(ctx.samples ? { samples: ctx.samples } : {}),
    onOrder: () => false,
    onStage: (a) => { act(a); },
    onSlap: (slapId, result) => { act({ type: 'practice/slap_answer', payload: { slapId, result } }); },
    physics: {
      input: (i, o) => s.input(i, o), endSegment: () => s.endSegment(), stopWord: () => s.stopWord(), skip: (x) => s.skip(x), stimulus: (w, k, d) => s.stimulus(w, k, d),
      answer: (r, l, c) => s.answer(r, l, c), act: (k) => s.act(k), finishCounted: (n) => s.finishCounted(n), cue: (k, b) => s.cue(k, b), voiced: (k, b) => s.voiced(k, b),
      beat: () => s.beat(), clock: () => s.clock(), outcome: (runId) => s.outcome(runId), keystroke: () => s.keystroke(), typed: (chars, beat) => s.typed(chars, beat),
      relief: (r) => s.relief(r), decide: (k, ref) => s.decide(k, ref), service: (runId, v) => s.service(runId, v), signal: (runId, m, a) => s.signal(runId, m, a), spit: (b, a) => s.spit(b, a), restart: () => s.restart(),
      getUp: () => s.getUp(), found: (finderId) => s.found(finderId), woke: () => s.woke(), script: (phase) => s.script(phase),
      onTap: () => { act({ type: 'physics/signal', payload: {} }); },
    },
  });
  overlay.focus();
  return close;
}
