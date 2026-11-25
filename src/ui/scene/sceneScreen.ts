import type { Registries } from '../../content/types';
import type { SampleSound } from '../sound/samples';
import { sceneBackdrop, slotLight } from '../../engine/backdrops';
import { intimacyOf } from '../../engine/relations/gain';
import { ROMANTIC_PROPOSALS } from '../../engine/relations/vocab';
import type { CampaignState, Unit } from '../../engine/state/types';
import type { SceneController, SceneUiEvent } from '../../scene/sceneController';
import type { AliusSettings } from '../../settings';
import type { ChatMessage, StAdapter } from '../../st/adapter';
import { h } from '../dom';
import { drawLeadChips, drawRuleChips, drawViolation, violationLabels } from '../bonds/chips';
import { motionReduced } from '../motion';
import { cssUrl } from '../fx';
import { drawProposalChips, kindLabel } from '../proposalChips';
import { drawDemandChips, drawDisciplineChips } from '../discipline/chips';
import { drawClaimCards, drawMilestoneCards, drawReturnCards, type ClaimAnswer, type ReturnAnswer } from '../dynamic/cards';
import { drawDemonstrationCards, type DemonstrationAnswer } from '../practice/demonstrationCard';
import { cancelPostureCalls, drawPostureCall } from '../practice/postureCall';
import { clearSlapOverlay, renderSlapOverlay } from '../practice/slapOverlay';
import type { SlapResult } from '../../engine/practice/state';
import { practiceLive } from '../../engine/practice/gate';
import { drawPunishmentCards, type PunishmentAnswer, type TakeInsteadAnswer } from '../practice/punishmentCard';
import { drawTaskCards, type TaskAnswer } from '../practice/taskCard';
import { drawFrameChips } from '../dynamic/frameChip';
import { drawOfferChips } from '../dynamic/offerComposer';
import { drawInitiativeChips, type InitiativeHandlers } from '../practice/initiativeChips';
import type { OfferComposition } from '../../engine/dynamic/offer';
import { renderDisciplineMenu } from '../discipline/menu';
import { renderFreqChip } from '../special/freqChip';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import { cutIn } from './cutIn';
import { lifeMode } from '../../engine/life/state';
import { renderLetsMenu } from '../life/lifeViews';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import type { Action } from '../../engine/dispatch';
import { renderPostureDial } from './dial/dial';
import { renderMomentCard } from './momentCard';
import { panelBeat, renderPhysicsPanel, type PhysicsPanelStaging } from './physicsPanel';
import { inputGauge, type InputGauge } from './stage/gauge';
import { buildLayers, type StageLayers } from './stage/layers';
import { CHIP_SLOTS, createChipRow, type ChipRow } from './stage/chipRow';
import { createCurtain, type Curtain } from './stage/curtain';
import { DOCK_SLOTS, createDock, type Dock } from './stage/dock';
import { flashLine } from './stage/flash';
import { attachLook, type LookHandle } from './stage/look';
import { panToCentre, spriteSlots } from './stage/sprites';
import { markHintUsed, renderTopLine } from './stage/topLine';
import { fillProse, proseLength, sentenceRunIndex } from './stage/prose';
import { REPLY_MAX_LINES, measureReply, renderReply, replyView } from './stage/reply';
import { unitAccent } from '../voice/voiceCard';

export interface SceneScreenCtx {
  controller: SceneController;
  getState: () => CampaignState | null;
  registries: Registries;
  st: StAdapter;
  settings: () => AliusSettings;
  /** P10: the typing tick while a reply is typed out (rate-limited by the player). */
  sound?: { play(id: 'typing' | 'alert'): void };
  /** P10e-e: the recorded sounds the instruments play (one per app, beside `sound`). Absent = the instruments are silent. */
  samples?: SampleSound;
  /** Called after [END TRANSMISSION] finished (the app returns to the PDA). */
  onEnded: () => void;
  /** P10e: the × of the top line (the shell's own close is hidden on the scene screen). Absent = no button. */
  onClose?: () => void;
  /** Resolves an asset path of a location background against the extension folder. */
  assetUrl?: (path: string) => string;
  /** P10c: whether an image URL loads (default: an `Image`); a failure falls to the next candidate. Injected by tests. */
  loadImage?: (url: string) => Promise<boolean>;
  /** P6: rolls a unit's refusal before the next message goes out (the ORDER toggle). Returns whether she refused. */
  onOrder?: (unitId: string) => boolean;
  /** P6: forces her refused order through the Leash. */
  onCompel?: (unitId: string) => void;
  /** P9: the DISCIPLINE menu of each unit in the scene, and UNDO on a chip (the app dispatches the engine actions). */
  onPunish?: (unitId: string, measure: string, days?: number) => void;
  onUndoDiscipline?: (id: string) => void;
  /** P9: [GRANT] / [REFUSE] on the demand of a unit in the scene. */
  onAnswerDemand?: (demandId: string, answer: 'grant' | 'refuse') => void;
  /** P15: [ACCEPT] / [REFUSE] on the open milestone of a unit in the scene (the open id). */
  onAnswerMilestone?: (milestoneId: string, answer: 'accept' | 'refuse') => void;
  /** P15: [YIELD] / [REFUSE] / [TALK] on the open claim of a unit in the scene (the open id). */
  onAnswerClaim?: (claimId: string, answer: ClaimAnswer) => void;
  /** P15: [ACCEPT] / [REFUSE] on the return offer of a unit in the scene (the only one open). */
  onAnswerReturn?: (answer: ReturnAnswer) => void;
  /** P16: ACCEPT / REFUSE / TALK on a task of a unit in the scene (the task's id); the signature of a signed one. */
  onAnswerTask?: (taskId: string, answer: TaskAnswer) => void;
  onSignTask?: (taskId: string) => void;
  /** P16: ACCEPT / NEGOTIATE / REFUSE on her discipline (the punishment's id), DO IT / TAKE IT INSTEAD / REFUSE on her order about a soldier, and UNDO of an answer. */
  onAnswerPunishment?: (punishmentId: string, answer: PunishmentAnswer) => void;
  onTakeInstead?: (punishmentId: string, answer: TakeInsteadAnswer) => void;
  onUndoPunishment?: (punishmentId: string) => void;
  /** P16: a chip step of her ceremony, or the number of its number step. */
  onCeremonyStep?: (punishmentId: string, step: string, number?: number) => void;
  /** P16: GO / REFUSE on a demonstration of a unit in the scene (the demonstration's id): GO opens the group scene the engine describes. */
  onAnswerDemonstration?: (demonstrationId: string, answer: DemonstrationAnswer) => void;
  /** P16: the answer to the slap that is open (`practice/slap_answer`): the id and none, braced or flinched. Absent = the overlay is not drawn. */
  onSlap?: (slapId: string, result: SlapResult) => void;
  /** P16: the commander's own chips beside the offer chips: ASK FOR A TASK / FOR PUNISHMENT, I DIDN'T, ASK PERMISSION. Absent = none drawn. */
  initiative?: InitiativeHandlers;
  /** P15: `[ OFFER MYSELF ]` sent from the composer (the app's `dynamic.offer`: staged through the scene controller). Absent = no chip. */
  onOffer?: (unitId: string, composition: OfferComposition, askInReturn: boolean) => void;
  /** P9d: [ACCEPT] / [NEGOTIATE] / [REFUSE] on a rule proposed by a unit in the scene. */
  onAnswerRule?: (ruleId: string, answer: 'accept' | 'negotiate' | 'refuse') => void;
  /** P14: the failure chips of the scene's readings and REROLL of the last exchange. Absent = none drawn. */
  generation?: GenerationUi;
  /** P14c: the `[ LET'S … ]` of a private scene with one named woman: she and the pastime picked (the app dispatches `life/pastime_in_scene`). Absent = no menu. */
  onPastime?: (unitId: string, pastimeId: string) => void;
  /** P15a: a BLOCKING chip's action (the app passes the scene controller's `stage`). Absent: the controller's own `stage`. */
  onStage?: (action: Action) => void;
  /** P15a: the staging controller under the physics panel (its inputs, cues and stop word) and the tap. Absent: no panel is drawn. */
  physics?: PhysicsPanelStaging & { keystroke(): void; typed(chars: number, beat?: number): unknown; onTap(): void };
}

export interface SceneScreen {
  /** Reacts to what the scene controller reports. */
  handle(e: SceneUiEvent): void;
  refresh(): void;
  dispose(): void;
  /** P10e §5: the input line as a gauge surface for mini-games (null while no scene is drawn). */
  gauge(): InputGauge | null;
  /** P10e §5a: the short "The device is out of reach." line over the frame (Tab refused while the hands are busy). */
  flashDeviceOut(): void;
}

/**
 * P10c: what each backdrop URL did when it was tried (a redraw shows a known image at once). A success is kept for the
 * session; a failure for `RETRY_MS` (an extension update or a hiccup should not hide a picture until the page reloads).
 */
const loaded = new Map<string, { ok: boolean; at: number }>();
const loading = new Map<string, Promise<boolean>>();
const RETRY_MS = 30_000;
const knownResult = (url: string): boolean | undefined => {
  const r = loaded.get(url);
  if (!r) return undefined;
  if (!r.ok && Date.now() - r.at > RETRY_MS) {
    loaded.delete(url);
    return undefined;
  }
  return r.ok;
};

/** Tests only: forgets every result. */
export function resetBackdropCache(): void {
  loaded.clear();
  loading.clear();
}

function defaultLoadImage(url: string): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Tries a URL with the given loader; the result is remembered (`knownResult`) and a rejecting loader counts as a failure. */
function tryLoad(url: string, load: (url: string) => Promise<boolean>): Promise<boolean> {
  const known = knownResult(url);
  if (known !== undefined) return Promise.resolve(known);
  let p = loading.get(url);
  if (!p) {
    p = Promise.resolve().then(() => load(url)).catch(() => false).then((ok) => {
      loaded.set(url, { ok, at: Date.now() });
      loading.delete(url);
      return ok;
    });
    loading.set(url, p);
  }
  return p;
}

const PULSE_MS = 1500;
const TICK_MS = 50;
const NON_ROMANTIC_KINDS = ['friendship_deepen', 'confide', 'rivalry', 'reconcile', 'break_up'] as const;
const ALL_KINDS = [...NON_ROMANTIC_KINDS, ...ROMANTIC_PROPOSALS] as const;
const label = kindLabel;
/** One line of what each proposal means, shown in the PROPOSE menu. */
const KIND_HINT: Record<string, string> = {
  friendship_deepen: 'ask to be friends', confide: 'tell her a secret', rivalry: 'declare a rivalry', reconcile: 'make peace',
  break_up: 'end the relationship', date: 'ask her out', fwb: 'propose something casual', romance: 'propose a relationship',
  exclusive: 'ask for exclusivity', secret_affair: 'propose a secret relationship',
};
const BUSY_TICK_MS = 500;

export function renderSceneScreen(host: HTMLElement, ctx: SceneScreenCtx): SceneScreen {
  const { controller, registries, st } = ctx;
  /** Characters per second; instant (0) under reduced motion. */
  const typingSpeed = (): number => (motionReduced(ctx.settings()) ? 0 : ctx.settings().typingSpeed);
  host.replaceChildren();
  const root = h('div', { class: 'alius-scene' });
  host.append(root);

  let pacing = false;
  let pending = false;
  let disposed = false;
  let seen = -1;
  let animating: number | null = null;
  let progress = new Map<number, number>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let started = 0;
  let editing: { index: number; value: string; focus: boolean } | null = null;
  let busyTimer: ReturnType<typeof setInterval> | null = null;
  let busyStarted = 0;
  const labels = new Map<string, string>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();

  let layers: StageLayers;
  let chipResizer: ResizeObserver | null = null;
  /** P10e: looking around is wired per built scene (its position is remembered by scene id, see stage/look.ts). */
  let detachLook: LookHandle | null = null;
  /** The newest reply the view was already turned for (null until the first draw of a scene: what is there at the start turns nothing). */
  let spokenIndex: number | null = null;
  let bg: HTMLElement;
  /** P10c: the full-bleed image layer behind the whole scene (the ASCII art stays in `bg`, inside the stage). */
  let backdrop: HTMLElement;
  let backdropKey = '';
  let backdropToken = 0;
  let spriteHost: HTMLElement;
  let hud: HTMLElement;
  let curtain: Curtain;
  /** The whole input line (the field, ORDER, PROPOSE): it moves into the curtain while that is open. */
  let inputLine: HTMLElement;
  /** The newest reply whose length was already judged (null until the first draw of a scene). */
  let wordsChecked: number | null = null;
  /** P10e: the reply block (the last replies as prose subtitles); the whole transcript is the curtain's. */
  let replyHost: HTMLElement;
  let chips: HTMLElement;
  let disciplineChips: HTMLElement;
  let demandChips: HTMLElement;
  let milestoneCards: HTMLElement;
  let claimCards: HTMLElement;
  let offerHost: HTMLElement;
  let offerInner: HTMLElement;
  let initiativeInner: HTMLElement;
  let returnCards: HTMLElement;
  let taskCards: HTMLElement;
  let punishmentCards: HTMLElement;
  let demonstrationCards: HTMLElement;
  let postureCall: HTMLElement;
  let slapHost: HTMLElement;
  let freqChips: HTMLElement;
  let genChips: HTMLElement;
  let genTools: HTMLElement;
  let leadChips: HTMLElement;
  let ruleChips: HTMLElement;
  let disciplineMenus: HTMLElement;
  let letsHost: HTMLElement;
  let banner: HTMLElement;
  let chipRow: ChipRow;
  let dock: Dock;
  /** P15a: the BLOCKING strip (drawn only while the blocking is live). */
  let blockingHost: HTMLElement;
  /** P10e A1: the stop word's pill, in the dial's corner (it shows with or without the dial). */
  let stopHost: HTMLElement;
  let momentHost: HTMLElement;
  let physicsHost: HTMLElement;
  let busyHost: HTMLElement;
  let caption: HTMLElement;
  let input: HTMLInputElement;
  let sceneKey = '';
  let orderOn = false;
  let orderToggle: HTMLButtonElement | null = null;
  let orderWho: HTMLSelectElement | null = null;

  const state = (): CampaignState | null => ctx.getState();
  /** The command line takes the focus, unless the device is raised over the scene (the shell makes the scene inert then and gives the focus back to the line when it is lowered). */
  const focusInput = (): void => {
    if (root.closest('[inert]') === null) input.focus();
  };
  const present = (s: CampaignState): Unit[] => (s.scene?.participants ?? []).map((id) => s.squad.find((u) => u.id === id)).filter((u): u is Unit => u !== undefined);

  function locationName(s: CampaignState, units: Unit[]): string {
    const loc = registries.locations.get(s.scene!.locationId);
    return loc?.perUnit === true && units[0] ? `${units[0].displayName}'s quarters` : String(loc?.name ?? s.scene!.locationId);
  }

  function showAscii(s: CampaignState): void {
    const loc = registries.locations.get(s.scene!.locationId);
    root.dataset.backdrop = 'ascii';
    delete root.dataset.light;
    backdrop.style.backgroundImage = '';
    const art = h('pre', { class: 'alius-ascii', 'aria-hidden': 'true' });
    art.textContent = ((loc?.ascii as string[] | undefined) ?? []).join('\n');
    bg.replaceChildren(art);
  }

  function showImage(url: string, light: string | null): void {
    root.dataset.backdrop = 'image';
    if (light) root.dataset.light = light;
    else delete root.dataset.light;
    backdrop.style.backgroundImage = cssUrl(url);
    bg.replaceChildren();
  }

  /**
   * P10c: the candidates of `sceneBackdrop`, tried in order (art never gates anything: all failing ends at the ASCII stage,
   * with no toast). A redraw with the same candidates and slot does nothing.
   */
  function drawBackground(s: CampaignState): void {
    caption.textContent = locationName(s, present(s)).toUpperCase();
    const owner = present(s)[0]?.id ?? null;
    const resolve = ctx.assetUrl ?? ((p: string) => p);
    const candidates = sceneBackdrop(s, registries, s.scene!.locationId, owner).map((c) => ({ url: resolve(c.file), light: c.slotted ? null : slotLight(s.slot) }));
    const key = `${s.slot}|${candidates.map((c) => c.url).join('|')}`;
    if (key === backdropKey) return;
    backdropKey = key;
    const token = ++backdropToken;
    if (candidates.length === 0) {
      showAscii(s);
      return;
    }
    const load = ctx.loadImage ?? defaultLoadImage;
    // a known image is shown at once (no flash on a redraw); otherwise the ASCII stage shows until the first one loads
    const known = candidates.find((c) => knownResult(c.url) !== false);
    if (known && knownResult(known.url) === true) {
      showImage(known.url, known.light);
      return;
    }
    showAscii(s);
    void (async () => {
      for (const c of candidates) {
        const ok = await tryLoad(c.url, load);
        if (token !== backdropToken || disposed) return;
        if (ok) {
          showImage(c.url, c.light);
          return;
        }
      }
    })();
  }

  function setSprite(unit: Unit, labelText: string): void {
    const img = spriteHost.querySelector<HTMLImageElement>(`.alius-sprite[data-unit="${unit.id}"] img`);
    if (!img || !unit.cardRef) return;
    labels.set(unit.id, labelText);
    const thumb = st.getAvatarUrl(unit.cardRef);
    img.setAttribute('src', thumb);
    void st.getSpriteUrl(unit.cardRef, labelText).then((url) => {
      if (!disposed && url && labels.get(unit.id) === labelText) img.setAttribute('src', url);
    }).catch(() => {});
  }

  /**
   * P10e A2: the sprites stand in room space: each is placed on the panorama (`stage/sprites.ts`), and the panorama moves with the view
   * (`--alius-pan`), as the backdrop does. One stands at the centre, two within the central view, three or more across the whole width.
   */
  function drawSprites(s: CampaignState, speakerAvatar: string | undefined): void {
    const units = present(s);
    spriteHost.dataset.count = String(units.length);
    if (units.length >= 4) spriteHost.dataset.crowd = 'true';
    else delete spriteHost.dataset.crowd;
    const slots = spriteSlots(units.length);
    const pano = h('div', { class: 'alius-sprite-pano' }, ...units.map((u, i) => {
      const img = h('img', { alt: u.displayName, class: 'alius-sprite-img' });
      const el = h('div', { class: `alius-sprite ${slots[i].cls}${u.cardRef && u.cardRef === speakerAvatar ? ' is-speaking' : ''}`, 'data-unit': u.id }, img);
      el.style.setProperty('--alius-sprite-x', `${slots[i].x}cqh`);
      return el;
    }));
    spriteHost.replaceChildren(pano);
    for (const u of units) setSprite(u, labels.get(u.id) ?? 'neutral');
  }

  /** P10e A2: the view turns to the woman whose reply just landed (unless the commander turned it by hand a moment ago; reduced motion jumps). */
  function turnToSpeaker(s: CampaignState, reply: ChatMessage | undefined): void {
    if (!detachLook) return;
    const newest = reply?.index ?? -1;
    if (spokenIndex === null) { spokenIndex = newest; return; } // what is there when the scene opens turns nothing
    if (!reply || newest <= spokenIndex) return;
    spokenIndex = newest;
    const units = present(s);
    const at = units.findIndex((u) => (u.cardRef !== undefined && u.cardRef === reply.avatar) || u.displayName === reply.name);
    if (at < 0) return;
    const frame = layers.frame.getBoundingClientRect();
    const pan = panToCentre(spriteSlots(units.length)[at].x, frame.width, frame.height);
    if (pan !== null) detachLook.turnTo(pan);
  }

  function drawHud(s: CampaignState): void {
    const pulses = new Map<string, HTMLElement>();
    for (const old of hud.querySelectorAll<HTMLElement>('.alius-hud-unit')) pulses.set(old.dataset.unit!, old.querySelector('.alius-pulses')!);
    hud.replaceChildren(...present(s).map((u) => {
      const st0 = registries.relationshipStates.get(s.relations[u.id]?.stateId ?? '');
      const keep = pulses.get(u.id);
      const holder = keep ?? h('span', { class: 'alius-pulses' });
      const glyph = h('span', { class: 'alius-glyph', title: String(st0?.name ?? '') });
      glyph.textContent = String(st0?.glyph ?? '?');
      const refused = ctx.onCompel !== undefined && (s.scene?.refusals ?? []).some((r) => r.unitId === u.id);
      return h('div', { class: 'alius-hud-unit', 'data-unit': u.id }, glyph, h('span', { class: 'alius-hud-name' }, u.displayName), holder,
        refused ? h('span', { class: 'alius-refused-mark' }, 'REFUSED') : null,
        refused ? h('button', {
          type: 'button', class: 'alius-btn', 'data-action': 'compel', 'data-unit': u.id, disabled: s.leash.authorizationsLeft < 1,
          title: s.leash.authorizationsLeft < 1 ? 'No Leash authorization is left this week.' : 'Force the order through the Leash.',
          onclick: () => ctx.onCompel!(u.id),
        }, '[ COMPEL ]') : null);
    }));
  }

  function drawChips(s: CampaignState): void {
    const ids = new Set(s.scene?.participants ?? []);
    drawProposalChips(chips, s, (p) => p.channel === 'scene' && ids.has(p.unitId), (id, answer, condition) => (condition === undefined ? controller.answer(id, answer) : controller.answer(id, answer, condition)), registries);
    // P9d: FOLLOW / ASK / SET A LIMIT while a romantic scene has a lead (never with romance off)
    drawLeadChips(leadChips, intimacyOf(s).romance ? s.scene : undefined, {
      follow: () => controller.follow?.(), ask: () => controller.ask?.(), limit: (text) => controller.limit?.(text),
    }, pending);
    drawFrameChips(leadChips, s, registries, (id) => ids.has(id), ctx.settings().dynamicHidden === true); // P15: the frame of a woman present who holds, beside the lead chips
    // P15: `[ OFFER MYSELF ]` beside the lead chips, and her answer once the reply is in (nothing without a handler, nothing while the dynamic is off)
    if (ctx.onOffer) drawOfferChips(offerInner, { state: s, reg: registries, pick: (id) => ids.has(id), onOffer: ctx.onOffer, answered: () => controller.replyPending?.() !== true });
    else offerInner.replaceChildren();
    if (ctx.initiative) drawInitiativeChips(initiativeInner, { state: s, reg: registries, pick: (id) => ids.has(id), ...ctx.initiative }); // P16: ask for a task or a punishment, I didn't, ask permission
    else initiativeInner.replaceChildren();
    drawRuleChips(ruleChips, s, registries, (c) => ids.has(c.unitId), {
      accept: (id) => ctx.onAnswerRule?.(id, 'accept'), negotiate: (id) => ctx.onAnswerRule?.(id, 'negotiate'), refuse: (id) => ctx.onAnswerRule?.(id, 'refuse'),
      generation: ctx.generation,
    });
  }

  /** P12: the newest frequency fragment of each unit present (nothing without the trait). */
  function drawFreq(s: CampaignState): void {
    freqChips.replaceChildren();
    for (const u of present(s)) renderFreqChip(freqChips, s, registries, u.id);
  }

  /** P9: what the game understood of the commander's words (always shown) and the DISCIPLINE menu of everybody present. */
  function drawDiscipline(s: CampaignState): void {
    const ids = new Set(s.scene?.participants ?? []);
    drawDemandChips(demandChips, s, registries, (c) => ids.has(c.unitId), { grant: (id) => ctx.onAnswerDemand?.(id, 'grant'), refuse: (id) => ctx.onAnswerDemand?.(id, 'refuse'), generation: ctx.generation });
    drawMilestoneCards(milestoneCards, s, registries, (c) => ids.has(c.unitId), (id, answer) => ctx.onAnswerMilestone?.(id, answer)); // P15: her step
    drawClaimCards(claimCards, s, registries, (c) => ids.has(c.unitId), (id, answer) => ctx.onAnswerClaim?.(id, answer)); // P15: her claim
    drawReturnCards(returnCards, s, registries, (c) => ids.has(c.unitId), (answer) => ctx.onAnswerReturn?.(answer)); // P15: her offer to begin again
    drawTaskCards(taskCards, s, registries, (c) => ids.has(c.unitId), { answer: (id, answer) => { ctx.onAnswerTask?.(id, answer); if (answer === 'talk') focusInput(); }, sign: (id) => ctx.onSignTask?.(id), focusInput, generation: ctx.generation }); // P16: her task
    drawPunishmentCards(punishmentCards, s, registries, (c) => ids.has(c.unitId), { answer: (id, answer) => { ctx.onAnswerPunishment?.(id, answer); if (answer === 'negotiate') focusInput(); }, takeInstead: (id, answer) => ctx.onTakeInstead?.(id, answer), undo: (id) => ctx.onUndoPunishment?.(id), ceremony: (id, step, number) => ctx.onCeremonyStep?.(id, step, number), generation: ctx.generation }); // P16: her discipline
    drawDemonstrationCards(demonstrationCards, s, registries, (c) => ids.has(c.unitId), { answer: (id, answer) => ctx.onAnswerDemonstration?.(id, answer), generation: ctx.generation }); // P16: her demonstration
    // P16: her call of a named posture: the choices, and (with the order interaction on) the window; the answer is staged like a chip so a swipe takes the posture back
    drawPostureCall(postureCall, s, registries, (c) => ids.has(c.unitId), {
      timed: ctx.settings().physicsInteractions?.order !== false, reduced: motionReduced(ctx.settings()),
      take: (callId, postureId, late) => { (ctx.onStage ?? ((a) => void controller.stage(a)))({ type: 'practice/take_posture', payload: { callId, ...(postureId !== undefined ? { postureId } : {}), late } }); if (!disposed) refresh(); },
    });
    drawSlap(s); // P16: her hand is raised: the time allowed and the one key
    drawDisciplineChips(disciplineChips, s, registries, (c) => ids.has(c.unitId) && (c.channel !== 'scene' || c.sceneId === s.scene?.id), (id) => ctx.onUndoDiscipline?.(id));
    if (!ctx.onPunish) return;
    // an open menu stays open across a redraw
    const open = new Set([...disciplineMenus.querySelectorAll<HTMLDetailsElement>('details[open]')].map((d) => d.dataset.disciplineMenu));
    disciplineMenus.replaceChildren(...present(s).filter((u) => u.kind === 'named').map((u) => {
      const menu = renderDisciplineMenu({ state: s, registries, unitId: u.id, onPunish: (measure, days) => ctx.onPunish!(u.id, measure, days) }) as HTMLDetailsElement;
      if (open.has(u.id)) menu.open = true;
      // P10e: one chip per woman; her name in front when more than one is present; the menu opens over the row
      const many = present(s).filter((x) => x.kind === 'named').length > 1;
      return h('div', { class: 'alius-discipline-unit', 'data-discipline-chip': u.id }, many ? h('span', { class: 'alius-dim alius-discipline-name' }, u.displayName) : null, menu);
    }));
  }

  /** P16: the slap that is open in this scene: the overlay, once; nothing when there is none, it is another scene's or she is not holding. The answer is sent after the draw (a redraw must not start inside its own). */
  function drawSlap(s: CampaignState): void {
    const slap = s.practices?.slap;
    if (!ctx.onSlap || slap === undefined || slap.sceneId !== s.scene?.id || !practiceLive(s, registries, slap.holderId)) {
      clearSlapOverlay(slapHost);
      return;
    }
    renderSlapOverlay(slapHost, { state: s, reg: registries, slap, settings: ctx.settings(), sound: ctx.sound, onResult: (result) => { queueMicrotask(() => { if (!disposed) ctx.onSlap?.(slap.id, result); }); } });
  }

  /** P14c: `[ LET'S … ]` (the pastimes that fit this place and slot) in a private scene with one named woman; once one is set, a chip says so. */
  function drawLets(s: CampaignState): void {
    const open = letsHost.querySelector('details[open]') !== null;
    letsHost.replaceChildren();
    const sc = s.scene;
    const named = present(s).filter((u) => u.kind === 'named');
    if (!sc || !ctx.onPastime || lifeMode(s) === 'off' || sc.mode !== 'private' || named.length !== 1) return;
    const unit = named[0];
    if (sc.pastime) {
      const p = registries.pastimes.get(sc.pastime.id);
      if (p) letsHost.append(h('span', { class: 'alius-chip', 'data-quiet-hour': sc.pastime.id, ...analyzeAttrs(`pastimes:${p.id}`) }, `TIME TOGETHER: ${String(p.label).toUpperCase()}`));
      return;
    }
    renderLetsMenu(letsHost, { state: s, registries, unitId: unit.id, at: { locationId: sc.locationId, slot: sc.slot }, open, onPick: (id) => ctx.onPastime!(unit.id, id) });
  }

  function stopTyping(): void {
    if (timer) clearInterval(timer);
    timer = null;
    animating = null;
  }

  function cancelEdit(s: CampaignState): void {
    editing = null;
    drawLog(s);
  }

  function saveEdit(s: CampaignState): void {
    const e = editing;
    editing = null;
    const original = controller.transcript().find((m) => m.index === e?.index)?.text;
    drawLog(s);
    if (!e || e.value.trim() === '' || e.value === original) return;
    void controller.edit(e.index, e.value).catch(() => {});
  }

  /** The accent of the speaker of a message: the unit whose card spoke it, else the one with that name. */
  function accentOf(s: CampaignState, name: string, avatar?: string): string | null {
    const u = s.squad.find((x) => x.cardRef !== undefined && x.cardRef === avatar) ?? s.squad.find((x) => x.displayName === name);
    return u ? unitAccent(u.id) : null;
  }

  /** P9d: a reply the reading flagged as depicting content that is switched off (in the reply block and in the history). */
  function flagViolation(s: CampaignState, line: HTMLElement, index: number): void {
    const flagged = s.scene?.violations?.find((v) => v.index === index);
    if (flagged) drawViolation(line, violationLabels(registries, flagged.categories), () => void st.regenerateLast().catch(() => {}), pending);
  }

  /** P10e §3: a reply longer than `curtainWords` words opens the history by itself when it arrives (never for what was there when the scene opened). */
  function checkWords(messages: ChatMessage[]): void {
    const lastReply = [...messages].reverse().find((m) => !m.isUser);
    if (wordsChecked === null) {
      wordsChecked = lastReply?.index ?? -1;
      return;
    }
    if (pending || !lastReply || lastReply.index <= wordsChecked) return;
    wordsChecked = lastReply.index;
    const limit = ctx.settings().curtainWords;
    if (limit > 0 && lastReply.text.trim().split(/\s+/).filter(Boolean).length > limit) curtain.open();
  }

  /** P10e §3: the last replies as prose subtitles (the typing reveal and the streaming highlight live here). */
  function drawReply(s: CampaignState, messages: ChatMessage[]): void {
    const view = replyView(messages);
    const speed = typingSpeed();
    // the newest sentence is highlighted while a reply streams in or is typed out (never with speed 0 or reduced motion)
    const streaming = pending && view.replies.length > 0 ? view.replies[view.replies.length - 1].index : null;
    const lit = (index: number): number | undefined => {
      if (speed <= 0) return undefined;
      const text = view.replies.find((r) => r.index === index)?.text ?? '';
      if (index === animating) return sentenceRunIndex(text, progress.get(index) ?? 0);
      return index === streaming ? sentenceRunIndex(text, Infinity) : undefined;
    };
    renderReply(replyHost, view, {
      maxLines: REPLY_MAX_LINES,
      visibleOf: (index) => (index === animating ? progress.get(index) ?? 0 : Infinity),
      newestFrom: lit,
      accentOf: (r) => accentOf(s, r.name, r.avatar),
      flag: (line, index) => flagViolation(s, line, index),
      onMore: () => curtain.open(),
    });
    // an empty scene waits for the commander: say so, or nobody knows what to do (the prologue's scenes are the first the player sees)
    if (messages.length === 0) {
      const prologue = s.scene?.origin === 'prologue';
      replyHost.replaceChildren(h('p', { class: 'alius-dim alius-scene-hint' }, prologue
        ? 'The squad is about to speak first. Answer them below (Enter sends); ‹ ↻ › at the top right swap their last reply. Talk for a few exchanges; the game will offer to move on, and [ END TRANSMISSION ] closes the scene whenever you like.'
        : 'Nobody speaks until you do. Type below and press Enter to say something to them; the replies appear here. [ END TRANSMISSION ] closes the scene.'));
    }
  }

  function drawLog(s: CampaignState): void {
    const messages: ChatMessage[] = controller.transcript();
    const lastIndex = messages.length > 0 ? messages[messages.length - 1].index : -1;
    const speed = typingSpeed();
    if (pending) {
      // the reply is streaming in: show it as it grows and do not type it out again afterwards
      stopTyping();
      if (lastIndex > seen) seen = lastIndex;
    } else {
      const fresh = seen < 0 ? [] : messages.filter((m) => m.index > seen);
      const newest = [...fresh].reverse().find((m) => !m.isUser);
      if (newest && speed > 0 && !progress.has(newest.index)) {
        animating = newest.index;
        progress.set(newest.index, 0);
        started = Date.now();
      }
      if (seen < 0 || lastIndex > seen) seen = lastIndex;
    }

    curtain.draw(messages, {
      commanderName: s.commander.name, pending, editing,
      onEdit: (index) => {
        const m = messages.find((x) => x.index === index);
        if (!m) return;
        editing = { index, value: m.text, focus: true };
        drawLog(s);
      },
      onSave: () => saveEdit(s),
      onCancel: () => cancelEdit(s),
      onSwipe: (dir) => void st.swipeLast(dir).catch(() => {}),
      onRegenerate: () => void st.regenerateLast().catch(() => {}),
      flag: (line, index) => flagViolation(s, line, index),
      accentOf: (name, avatar) => accentOf(s, name, avatar),
    });
    drawReply(s, messages);
    checkWords(messages);

    if (animating !== null && !timer) {
      timer = setInterval(() => {
        const idx = animating;
        const msg = idx === null ? undefined : messages.find((m) => m.index === idx) ?? controller.transcript().find((m) => m.index === idx);
        if (idx === null || !msg) return stopTyping();
        const total = proseLength(msg.text);
        const shown = Math.min(total, Math.floor(((Date.now() - started) * typingSpeed()) / 1000));
        if (shown > (progress.get(idx) ?? 0)) ctx.sound?.play('typing');
        progress.set(idx, shown);
        const el = replyHost.querySelector<HTMLElement>(`.alius-reply-line[data-index="${idx}"] .alius-reply-text`);
        if (el) fillProse(el, msg.text, shown, { newestFrom: shown >= total ? undefined : sentenceRunIndex(msg.text, shown) });
        measureReply(replyHost);
        if (shown >= total) {
          progress.delete(idx);
          stopTyping();
        }
      }, TICK_MS);
    }
  }

  /** P14: a failed reading of this scene's exchanges, and REROLL of the last exchange's reading. */
  function drawGeneration(s: CampaignState): void {
    const ui = ctx.generation;
    genChips.replaceChildren();
    genTools.replaceChildren();
    if (!ui || !s.scene) return;
    const prefix = `${s.scene.id}:`;
    drawGenerationChips(genChips, ui, s, 'scene', (r) => r.key.startsWith(prefix));
    const state = controller.rerollState();
    // REROLL shows once there is a reading to replace (the controller says "Nothing was read yet." before that)
    if (state.enabled || state.reason !== 'Nothing was read yet.') drawSiteReroll(genTools, ui, 'scene.intents', 'last', () => controller.rerollLast(), state);
  }

  /** P10e §7: the posture dial (and its fan, the BLOCKING strip's model); a choice dispatches through `stage` and the screen redraws. */
  function drawBlocking(s: CampaignState): void {
    renderPostureDial(blockingHost, {
      state: s, registries, settings: ctx.settings(), reduced: motionReduced(ctx.settings()),
      onStage: (action) => { (ctx.onStage ?? ((a) => void controller.stage(a)))(action); if (!disposed) refresh(); },
    });
  }

  /** P15a: the open moment as chips (or one dim line in immersive mode); a chip answers through `stage`. */
  function drawMoment(s: CampaignState): void {
    renderMomentCard(momentHost, {
      state: s, registries, chips: ctx.settings().momentChips,
      onStage: (action) => { (ctx.onStage ?? ((a) => void controller.stage(a)))(action); if (!disposed) refresh(); },
    });
  }

  /**
   * P15a: the hold panel (nothing without a run or without the staging controller). P10e A1: the stop word is not in the card; a small pill at the
   * posture dial calls the same handler, whenever the panel would offer the stop word (a run, or anything that holds the commander).
   */
  function drawPhysics(s: CampaignState): void {
    if (!ctx.physics) { physicsHost.replaceChildren(); stopHost.replaceChildren(); return; }
    const staging = ctx.physics;
    const offered = renderPhysicsPanel(physicsHost, { state: s, registries, settings: ctx.settings(), staging, stopWord: false, onTap: () => { staging.onTap(); if (!disposed) refresh(); } });
    if (!offered) stopHost.replaceChildren();
    else if (stopHost.querySelector('[data-stop-word]') === null) {
      stopHost.replaceChildren(h('button', { type: 'button', class: 'alius-stop-pill', 'data-stop-word': '', 'aria-label': 'Stop word', ...analyzeNative('glossary:stop_word'), onclick: () => { staging.stopWord(); } }, 'STOP WORD'));
    }
  }

  function drawBanner(): void {
    banner.replaceChildren();
    if (pacing) banner.append(h('div', { class: 'alius-pacing', role: 'status' }, 'TIME IS PASSING'));
  }

  /** While an exchange is being read, END, swipe/regenerate, editing and PROPOSE stay off (they would race the extraction). */
  function lock(on: boolean): void {
    for (const el of root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button[data-action]:not([data-action="stop"]), button.alius-edit, select')) el.disabled = on;
  }

  /** The "waiting" line with a STOP button; the transcript follows the reply while it streams in. */
  function setBusy(on: boolean): void {
    if (busyTimer) clearInterval(busyTimer);
    busyTimer = null;
    busyHost.replaceChildren();
    if (!on) return;
    busyStarted = Date.now();
    const text = h('span', { class: 'alius-busy-text' }, 'AWAITING REPLY… 0s');
    busyHost.append(h('div', { class: 'alius-busy', role: 'status' }, text,
      h('button', { type: 'button', class: 'alius-btn', 'data-action': 'stop', 'aria-label': 'Stop the generation', onclick: () => controller.stop() }, 'Stop')));
    busyTimer = setInterval(() => {
      text.textContent = `AWAITING REPLY… ${Math.floor((Date.now() - busyStarted) / 1000)}s`;
      const s = state();
      if (s?.scene) drawLog(s);
    }, BUSY_TICK_MS);
  }

  /** Moves the input line (the same nodes, so the text and the focus survive) between its host and the curtain. */
  function moveInput(to: HTMLElement): void {
    const focused = document.activeElement === input;
    to.append(inputLine);
    if (focused) focusInput();
  }

  /** Esc closes the history (an edit box takes its own Esc first; a modal that took the key already is left alone). */
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && curtain?.isOpen() && !e.defaultPrevented) {
      e.preventDefault();
      curtain.close();
    }
  };
  document.addEventListener('keydown', onDocKey);

  function build(s: CampaignState): void {
    const units = present(s);
    sceneKey = s.scene!.id;
    layers = buildLayers(root);
    curtain?.destroy();
    delete root.dataset.curtain; // a new scene starts with the history down (the old curtain's close hook is gone)
    wordsChecked = null;
    spokenIndex = null;
    curtain = createCurtain(layers.curtain, {
      onOpen: () => {
        markHintUsed('history');
        root.dataset.curtain = 'open';
        moveInput(curtain.inputSlot);
      },
      onClose: () => {
        delete root.dataset.curtain;
        moveInput(layers.hosts.input);
      },
    });
    detachLook?.();
    detachLook = attachLook(layers.frame, root, { sceneId: () => s.scene!.id, reduced: () => motionReduced(ctx.settings()), onUse: () => markHintUsed('look') });
    bg = h('div', { class: 'alius-scene-bg' });
    backdrop = layers.backdrop;
    backdrop.classList.add('alius-scene-backdrop');
    backdropKey = '';
    backdropToken++; // a load still running for the previous scene must not paint this one
    delete root.dataset.backdrop;
    delete root.dataset.light;
    spriteHost = layers.sprites;
    spriteHost.classList.add('alius-sprites');
    hud = h('div', { class: 'alius-hud' });
    replyHost = layers.hosts.reply;
    replyHost.setAttribute('role', 'log'); // a screen reader hears each reply
    replyHost.setAttribute('aria-live', 'polite');
    chips = h('div', { class: 'alius-chips' });
    leadChips = h('div', { class: 'alius-chips alius-lead-host' });
    offerInner = h('div', { class: 'alius-offer-chips-host' });
    initiativeInner = h('div', { class: 'alius-initiative-host' }); // P16: inside the offer surface, so the scene gains no host of its own
    offerHost = h('div', { class: 'alius-offer-surface' }, offerInner, initiativeInner);
    ruleChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    disciplineChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    demandChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    slapHost = h('div', { class: 'alius-slap-host' }); // an overlay: it lives in the full-screen moment layer and takes no room
    freqChips = h('div', { class: 'alius-chips alius-freq-chips' });
    genChips = h('div', { class: 'alius-generation-chips' });
    genTools = h('span', { class: 'alius-scene-reroll' });
    disciplineMenus = h('div', { class: 'alius-discipline-units' });
    letsHost = h('div', { class: 'alius-lets-host' });
    banner = h('div', { class: 'alius-pacing-host' });
    busyHost = h('div', { class: 'alius-busy-host' });
    caption = h('div', { class: 'alius-stage-caption' });
    input = h('input', { type: 'text', name: 'cmd', class: 'alius-input', autocomplete: 'off', 'aria-label': 'Command line' }) as HTMLInputElement;
    input.addEventListener('input', () => ctx.physics?.keystroke()); // P15a: typing under load lets maintenance lapse (real time)
    input.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'ArrowUp' && input.value === '' && !pending) {
        ev.preventDefault();
        curtain.open(); // ↑ in an empty line, as a terminal's history
        return;
      }
      if ((ev as KeyboardEvent).key !== 'Enter' || pending) return;
      const text = input.value.trim();
      if (text === '') return;
      const order = orderOn && ctx.onOrder !== undefined ? ctx.onOrder(orderWho?.value || present(state()!)[0]?.id || '') : false;
      void order; // the engine rolled her answer and set her directive: the message goes out either way
      ctx.physics?.typed(text.length, panelBeat(physicsHost)); // P15a: a long message uses up beats of a running hold (turn-based)
      pending = true;
      input.disabled = true;
      editing = null;
      lock(true);
      setBusy(true);
      let sent = false;
      void controller.send(text).then((ok) => { sent = ok; }, () => {}).finally(() => {
        pending = false;
        if (disposed) return;
        orderOn = false;
        syncOrder();
        setBusy(false);
        lock(false);
        input.disabled = false;
        if (sent) input.value = ''; // a message that did not go out (the scene is busy, or it closed) stays in the line
        focusInput();
        const s0 = state();
        if (s0?.scene) checkWords(controller.transcript()); // the reply that streamed in while the line was busy
      });
    });

    const romance = intimacyOf(s).romance;
    const kinds = ALL_KINDS.filter((k) => romance || !(ROMANTIC_PROPOSALS as readonly string[]).includes(k));
    const propose = h('select', {
      name: 'propose', class: 'alius-select', 'aria-label': 'Propose',
      title: 'Make a formal proposal. The rules decide how she answers; the model plays it out.',
    }, h('option', { value: '' }, 'PROPOSE ▾'), ...kinds.map((k) => h('option', { value: k }, `${label(k)} — ${KIND_HINT[k] ?? ''}`))) as HTMLSelectElement;
    const who = units.length > 1
      ? (h('select', { name: 'propose-unit', class: 'alius-select', 'aria-label': 'Propose to' }, ...units.map((u) => h('option', { value: u.id }, u.displayName))) as HTMLSelectElement)
      : null;
    propose.addEventListener('change', () => {
      const kind = propose.value;
      if (kind === '') return;
      propose.value = '';
      controller.propose(kind, who?.value || units[0]?.id);
    });
    if (ctx.onOrder) {
      orderToggle = h('button', {
        type: 'button', class: 'alius-btn', 'data-action': 'order', 'aria-pressed': 'false',
        title: 'Give the next message as an order: the rules decide whether she complies.',
        onclick: () => { orderOn = !orderOn; syncOrder(); },
      }, '[ ORDER ]') as HTMLButtonElement;
      orderWho = units.length > 1
        ? (h('select', { name: 'order-unit', class: 'alius-select', 'aria-label': 'Order for' }, ...units.map((u) => h('option', { value: u.id }, u.displayName))) as HTMLSelectElement)
        : null;
      orderOn = false;
    } else {
      orderToggle = null;
      orderWho = null;
    }
    const act = (action: string, text: string, onclick: () => void, aria: string) =>
      h('button', { type: 'button', class: 'alius-btn', 'data-action': action, 'aria-label': aria, onclick }, text);
    const ignore = (p: Promise<void>): void => void p.catch(() => {});

    const { hosts } = layers;
    layers.ascii.append(bg, caption);
    layers.moment.append(slapHost);
    // P10e: the hosts the later tasks redraw (top line, reply, chip row, dock, dial) hold today's elements until each is replaced
    renderTopLine(hosts.topLine, {
      place: locationName(s, units), when: `DAY ${String(s.day).padStart(3, '0')} · ${s.slot.toUpperCase()}`, mode: s.scene!.mode === 'group' ? 'GROUP' : 'PRIVATE',
      units: [hud],
      tools: [
        act('swipe-left', '‹', () => ignore(st.swipeLast('left')), 'Previous reply'),
        act('regenerate', '↻', () => ignore(st.regenerateLast()), 'Regenerate the last reply'),
        genTools,
        act('swipe-right', '›', () => ignore(st.swipeLast('right')), 'Next reply'),
      ],
      onHistory: () => (curtain.isOpen() ? curtain.close() : curtain.open()),
      onEnd: () => void controller.end().then(() => { if (!disposed) ctx.onEnded(); }),
      ...(ctx.onClose ? { onClose: ctx.onClose } : {}),
    });
    hosts.status.append(banner, busyHost);
    chipRow = createChipRow(hosts.chipRow, CHIP_SLOTS);
    for (const [slot, el] of [['generation', genChips], ['proposals', chips], ['lead', leadChips], ['offer', offerHost], ['rules', ruleChips], ['demands', demandChips], ['discipline', disciplineChips], ['discipline-menus', disciplineMenus], ['freq', freqChips], ['lets', letsHost]] as const) chipRow.slot(slot).append(el);
    if (typeof ResizeObserver !== 'undefined') {
      chipResizer?.disconnect();
      chipResizer = new ResizeObserver(() => chipRow.layout());
      chipResizer.observe(chipRow.element);
    }
    inputLine = h('div', { class: 'alius-input-line alius-stage-cmd' }, h('span', { class: 'alius-prompt' }, 'CMD>'), input, h('div', { class: 'alius-input-tools' }, orderToggle, orderWho, propose, who));
    hosts.input.append(inputLine);
    // P10e §6: her hand: every card host is a slot of the dock (the host keeps its old class, the draw functions are unchanged)
    dock = createDock(hosts.dock, DOCK_SLOTS);
    const cards = (slot: string, cls: string): HTMLElement => {
      const el = dock.slot(slot);
      el.classList.add(cls);
      return el;
    };
    momentHost = cards('moment', 'alius-moment-host');
    postureCall = cards('posture-call', 'alius-posture-call-host');
    physicsHost = cards('physics', 'alius-physics-host');
    punishmentCards = cards('punishment', 'alius-punishment-cards');
    taskCards = cards('task', 'alius-task-cards');
    demonstrationCards = cards('demonstration', 'alius-demonstration-cards');
    milestoneCards = cards('milestone', 'alius-milestone-cards');
    claimCards = cards('claim', 'alius-claim-cards');
    returnCards = cards('return', 'alius-return-cards');
    // the posture dial's corner: the stop word's pill (above the dial, alone in the corner when there is no dial) and the dial
    stopHost = h('div', { class: 'alius-stop-host' });
    blockingHost = h('div', { class: 'alius-dial-host' });
    hosts.dial.append(stopHost, blockingHost);
    // the wheel up over the frame or the reply lets the history down
    const wheelUp = (ev: Event): void => { if ((ev as WheelEvent).deltaY < 0) curtain.open(); };
    layers.frame.addEventListener('wheel', wheelUp);
    hosts.reply.addEventListener('wheel', wheelUp);
    drawBackground(s);
  }

  function syncOrder(): void {
    if (!orderToggle) return;
    orderToggle.setAttribute('aria-pressed', String(orderOn));
    orderToggle.classList.toggle('alius-skill-selected', orderOn);
  }

  function refresh(): void {
    if (disposed) return;
    const s = state();
    if (!s?.scene) {
      root.replaceChildren(h('div', { class: 'alius-stub' }, 'NO SCENE OPEN'));
      delete root.dataset.stage;
      sceneKey = '';
      backdropKey = '';
      backdropToken++;
      delete root.dataset.backdrop;
      delete root.dataset.light;
      stopTyping();
      return;
    }
    if (sceneKey !== s.scene.id || !root.querySelector('.alius-layer-sprites')) {
      seen = -1;
      progress = new Map();
      stopTyping();
      build(s);
    } else drawBackground(s);
    const messages = controller.transcript();
    const lastReply = [...messages].reverse().find((m) => !m.isUser);
    drawSprites(s, lastReply?.avatar);
    turnToSpeaker(s, lastReply);
    drawHud(s);
    drawLog(s);
    drawChips(s);
    drawDiscipline(s);
    drawLets(s);
    drawFreq(s);
    drawGeneration(s);
    drawBanner();
    drawBlocking(s);
    drawMoment(s);
    drawPhysics(s);
    dock.layout(s.scene.id);
    chipRow.layout();
  }

  function pulse(e: Extract<SceneUiEvent, { type: 'pulse' }>): void {
    const holder = hud.querySelector(`.alius-hud-unit[data-unit="${e.unitId}"] .alius-pulses`);
    if (!holder) return;
    const raw = ctx.settings().showRawValues;
    const el = h('span', { class: `alius-pulse ${e.up ? 'is-up' : 'is-down'}` });
    el.textContent = `${e.up ? '▲' : '▼'} ${e.axis.toUpperCase()}${raw ? ` ${e.delta > 0 ? '+' : ''}${e.delta}` : ''}`;
    holder.append(el);
    const t = setTimeout(() => { timeouts.delete(t); el.remove(); }, PULSE_MS);
    timeouts.add(t);
  }

  const screen: SceneScreen = {
    refresh,
    flashDeviceOut: () => { if (layers) flashLine(layers.moment, 'The device is out of reach.', 'glossary:device_out_of_reach'); }, // P10e §5a: shown when Tab is refused (the app/shell calls it)
    gauge: () => (layers && root.dataset.stage === 'frame' ? inputGauge(layers.hosts.input) : null),
    handle(e) {
      if (disposed) return;
      switch (e.type) {
        case 'pulse': pulse(e); break;
        case 'sprite': {
          const unit = state()?.squad.find((u) => u.id === e.unitId);
          if (unit) setSprite(unit, e.label);
          break;
        }
        case 'cut_in':
          cutIn(root, e.kind, e.kind.startsWith('state:') ? `RELATIONSHIP // ${label(e.kind.slice(6))}` : label(e.kind));
          break;
        case 'pacing':
          pacing = true;
          if (banner) drawBanner();
          break;
        case 'chips':
        case 'discipline':
        case 'transcript':
          refresh();
          break;
      }
    },
    dispose() {
      disposed = true;
      chipResizer?.disconnect();
      document.removeEventListener('keydown', onDocKey);
      curtain?.destroy();
      detachLook?.();
      cancelPostureCalls(); // no late slip for a call whose scene is gone (P16)
      clearSlapOverlay(slapHost); // and no late answer to a slap whose scene is gone
      backdropToken++;
      stopTyping();
      if (busyTimer) clearInterval(busyTimer);
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
    },
  };
  refresh();
  return screen;
}
