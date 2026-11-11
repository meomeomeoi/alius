import type { Registries } from '../../content/types';
import { intimacyOf } from '../../engine/relations/gain';
import { ROMANTIC_PROPOSALS } from '../../engine/relations/vocab';
import type { CampaignState, Unit } from '../../engine/state/types';
import type { SceneController, SceneUiEvent } from '../../scene/sceneController';
import type { AliusSettings } from '../../settings';
import type { ChatMessage, StAdapter } from '../../st/adapter';
import { h } from '../dom';
import { drawProposalChips, kindLabel } from '../proposalChips';
import { cutIn } from './cutIn';

export interface SceneScreenCtx {
  controller: SceneController;
  getState: () => CampaignState | null;
  registries: Registries;
  st: StAdapter;
  settings: () => AliusSettings;
  /** Called after [END TRANSMISSION] finished (the app returns to the PDA). */
  onEnded: () => void;
  /** Resolves an asset path of a location background against the extension folder. */
  assetUrl?: (path: string) => string;
  /** P6: rolls a unit's refusal before the next message goes out (the ORDER toggle). Returns whether she refused. */
  onOrder?: (unitId: string) => boolean;
  /** P6: forces her refused order through the Leash. */
  onCompel?: (unitId: string) => void;
}

export interface SceneScreen {
  /** Reacts to what the scene controller reports. */
  handle(e: SceneUiEvent): void;
  refresh(): void;
  dispose(): void;
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

interface Segment { text: string; em: boolean }
/** Splits `*emphasis*` out of model text; nothing here ever becomes markup. */
function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\*([^*\n]+)\*/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), em: false });
    out.push({ text: m[1], em: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), em: false });
  return out;
}

function fillText(el: HTMLElement, text: string, visible: number): void {
  el.replaceChildren();
  let left = visible;
  for (const seg of segments(text)) {
    if (left <= 0) break;
    const part = seg.text.slice(0, left);
    left -= part.length;
    if (seg.em) {
      const em = h('em', { class: 'alius-glitch' });
      em.textContent = part;
      el.append(em);
    } else el.append(document.createTextNode(part));
  }
}
const visibleLength = (text: string): number => segments(text).reduce((n, s) => n + s.text.length, 0);

export function renderSceneScreen(host: HTMLElement, ctx: SceneScreenCtx): SceneScreen {
  const { controller, registries, st } = ctx;
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

  let bg: HTMLElement;
  let spriteHost: HTMLElement;
  let hud: HTMLElement;
  let log: HTMLElement;
  let chips: HTMLElement;
  let banner: HTMLElement;
  let busyHost: HTMLElement;
  let caption: HTMLElement;
  let input: HTMLInputElement;
  let sceneKey = '';
  let orderOn = false;
  let orderToggle: HTMLButtonElement | null = null;
  let orderWho: HTMLSelectElement | null = null;

  const state = (): CampaignState | null => ctx.getState();
  const present = (s: CampaignState): Unit[] => (s.scene?.participants ?? []).map((id) => s.squad.find((u) => u.id === id)).filter((u): u is Unit => u !== undefined);

  function locationName(s: CampaignState, units: Unit[]): string {
    const loc = registries.locations.get(s.scene!.locationId);
    return loc?.perUnit === true && units[0] ? `${units[0].displayName}'s quarters` : String(loc?.name ?? s.scene!.locationId);
  }

  function drawBackground(s: CampaignState): void {
    const loc = registries.locations.get(s.scene!.locationId);
    caption.textContent = locationName(s, present(s)).toUpperCase();
    bg.replaceChildren();
    bg.style.backgroundImage = '';
    const night = s.slot === 'night' ? (loc?.backgroundNight as string | undefined) : undefined;
    const image = night ?? (loc?.background as string | undefined);
    if (image) bg.style.backgroundImage = `url("${(ctx.assetUrl ?? ((p) => p))(image)}")`;
    else {
      const art = h('pre', { class: 'alius-ascii', 'aria-hidden': 'true' });
      art.textContent = ((loc?.ascii as string[] | undefined) ?? []).join('\n');
      bg.append(art);
    }
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

  function drawSprites(s: CampaignState, speakerAvatar: string | undefined): void {
    const units = present(s);
    const positions = units.length === 1 ? ['pos-center'] : units.length === 2 ? ['pos-left', 'pos-right'] : ['pos-left', 'pos-center', 'pos-right'];
    spriteHost.replaceChildren(...units.map((u, i) => {
      const img = h('img', { alt: u.displayName, class: 'alius-sprite-img' });
      return h('div', { class: `alius-sprite ${positions[i]}${u.cardRef && u.cardRef === speakerAvatar ? ' is-speaking' : ''}`, 'data-unit': u.id }, img);
    }));
    for (const u of units) setSprite(u, labels.get(u.id) ?? 'neutral');
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
    drawProposalChips(chips, s, (p) => p.channel === 'scene' && ids.has(p.unitId), (id, answer) => controller.answer(id, answer));
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

  function drawLog(s: CampaignState): void {
    const messages: ChatMessage[] = controller.transcript();
    const lastIndex = messages.length > 0 ? messages[messages.length - 1].index : -1;
    const speed = ctx.settings().typingSpeed;
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

    const boxHadFocus = document.activeElement instanceof HTMLTextAreaElement && log.contains(document.activeElement);
    log.replaceChildren(...messages.map((m) => {
      const speaker = h('span', { class: 'alius-speaker' });
      speaker.textContent = `${(m.isUser ? s.commander.name : m.name).toUpperCase()} //`;
      if (editing && editing.index === m.index) {
        const e = editing;
        const box = h('textarea', { class: 'alius-edit-box', rows: '3', 'aria-label': 'Edit message' }) as HTMLTextAreaElement;
        box.value = e.value;
        box.addEventListener('input', () => { e.value = box.value; });
        box.addEventListener('keydown', (ev) => {
          const k = ev as KeyboardEvent;
          if (k.key === 'Escape') cancelEdit(s);
          else if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) saveEdit(s);
        });
        return h('div', { class: `alius-line${m.isUser ? ' is-user' : ''} is-editing`, 'data-index': m.index }, speaker, ' ', h('div', { class: 'alius-edit-form' }, box,
          h('button', { type: 'button', class: 'alius-btn', 'data-action': 'edit-save', onclick: () => saveEdit(s) }, '[SAVE]'),
          h('button', { type: 'button', class: 'alius-btn', 'data-action': 'edit-cancel', onclick: () => cancelEdit(s) }, '[CANCEL]')));
      }
      const text = h('span', { class: 'alius-text' });
      fillText(text, m.text, m.index === animating ? progress.get(m.index) ?? 0 : Infinity);
      const edit = h('button', {
        type: 'button', class: 'alius-edit', 'data-edit': m.index, 'aria-label': 'Edit message', title: 'Edit this message', disabled: pending,
        onclick: () => {
          editing = { index: m.index, value: m.text, focus: true };
          drawLog(s);
        },
      }, '✎');
      return h('div', { class: `alius-line${m.isUser ? ' is-user' : ''}`, 'data-index': m.index }, speaker, ' ', text, ' ', edit);
    }));
    const box = log.querySelector<HTMLTextAreaElement>('textarea.alius-edit-box');
    if (box && (editing?.focus || boxHadFocus)) {
      box.focus();
      if (editing) editing.focus = false;
    } else log.scrollTop = log.scrollHeight;

    if (animating !== null && !timer) {
      timer = setInterval(() => {
        const idx = animating;
        const msg = idx === null ? undefined : messages.find((m) => m.index === idx) ?? controller.transcript().find((m) => m.index === idx);
        if (idx === null || !msg) return stopTyping();
        const total = visibleLength(msg.text);
        const shown = Math.min(total, Math.floor(((Date.now() - started) * ctx.settings().typingSpeed) / 1000));
        progress.set(idx, shown);
        const el = log.querySelector<HTMLElement>(`.alius-line[data-index="${idx}"] .alius-text`);
        if (el) fillText(el, msg.text, shown);
        if (shown >= total) {
          progress.delete(idx);
          stopTyping();
        }
      }, TICK_MS);
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
      h('button', { type: 'button', class: 'alius-btn', 'data-action': 'stop', 'aria-label': 'Stop the generation', onclick: () => controller.stop() }, '[STOP]')));
    busyTimer = setInterval(() => {
      text.textContent = `AWAITING REPLY… ${Math.floor((Date.now() - busyStarted) / 1000)}s`;
      const s = state();
      if (s?.scene) drawLog(s);
    }, BUSY_TICK_MS);
  }

  function build(s: CampaignState): void {
    const units = present(s);
    sceneKey = s.scene!.id;
    bg = h('div', { class: 'alius-scene-bg' });
    spriteHost = h('div', { class: 'alius-sprites' });
    hud = h('div', { class: 'alius-hud' });
    log = h('div', { class: 'alius-transcript', role: 'log', 'aria-live': 'polite', tabindex: '0' });
    chips = h('div', { class: 'alius-chips' });
    banner = h('div', { class: 'alius-pacing-host' });
    busyHost = h('div', { class: 'alius-busy-host' });
    caption = h('div', { class: 'alius-stage-caption' });
    input = h('input', { type: 'text', name: 'cmd', class: 'alius-input', autocomplete: 'off', 'aria-label': 'Command line' }) as HTMLInputElement;
    input.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key !== 'Enter' || pending) return;
      const text = input.value.trim();
      if (text === '') return;
      const order = orderOn && ctx.onOrder !== undefined ? ctx.onOrder(orderWho?.value || present(state()!)[0]?.id || '') : false;
      void order; // the engine rolled her answer and set her directive: the message goes out either way
      pending = true;
      input.disabled = true;
      editing = null;
      lock(true);
      setBusy(true);
      void controller.send(text).finally(() => {
        pending = false;
        if (disposed) return;
        orderOn = false;
        syncOrder();
        setBusy(false);
        lock(false);
        input.disabled = false;
        input.value = '';
        input.focus();
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
      }, '[ORDER]') as HTMLButtonElement;
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

    root.replaceChildren(
      h('div', { class: 'alius-scene-header' },
        h('span', {}, locationName(s, units)),
        h('span', { class: 'alius-dim' }, ` // DAY ${String(s.day).padStart(3, '0')} // ${s.slot.toUpperCase()} // ${s.scene!.mode === 'group' ? 'GROUP' : 'PRIVATE'}`),
        h('span', { class: 'alius-scene-tools' },
          act('swipe-left', '‹', () => ignore(st.swipeLast('left')), 'Previous reply'),
          act('regenerate', '↻', () => ignore(st.regenerateLast()), 'Regenerate the last reply'),
          act('swipe-right', '›', () => ignore(st.swipeLast('right')), 'Next reply'),
          act('end', '[END TRANSMISSION]', () => void controller.end().then(() => { if (!disposed) ctx.onEnded(); }), 'End the conversation')),
      ),
      banner,
      busyHost,
      h('div', { class: 'alius-stage' }, bg, spriteHost, caption),
      hud,
      log,
      chips,
      h('div', { class: 'alius-cmd' }, h('span', { class: 'alius-prompt' }, 'CMD>'), input, orderToggle, orderWho, propose, who),
    );
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
      sceneKey = '';
      stopTyping();
      return;
    }
    if (sceneKey !== s.scene.id || !root.querySelector('.alius-stage')) {
      seen = -1;
      progress = new Map();
      stopTyping();
      build(s);
    } else drawBackground(s);
    const messages = controller.transcript();
    const lastReply = [...messages].reverse().find((m) => !m.isUser);
    drawSprites(s, lastReply?.avatar);
    drawHud(s);
    drawLog(s);
    drawChips(s);
    drawBanner();
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
        case 'transcript':
          refresh();
          break;
      }
    },
    dispose() {
      disposed = true;
      stopTyping();
      if (busyTimer) clearInterval(busyTimer);
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
    },
  };
  refresh();
  return screen;
}
