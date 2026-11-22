/**
 * P10e §7: the posture dial, bottom right of the scene: a dark glass circle with a thin ticked ring that shows the commander's
 * body as the three-quarter mannequin (`mannequinSvg`: posture only, no air, no strength, no other tracker). Under it the
 * posture's name (her own name for it when a holder present named it, P16) and a second dim line when relevant (EYES DOWN).
 * A click on the centre opens a fan of what the blocking offers now: the commander's moves, each as a small mannequin with
 * its name, then the places, contacts and items the scene allows as lists. It is the BLOCKING strip's model (`blockingChoices`):
 * what is offered, the reasons a gate refuses, the actions sent — nothing about the rules changes. Drawn only while the blocking
 * is live. The figure is drawn from point states, never from pictures; the label is HTML (the SVG holds no text).
 */
import { buildKnowledge } from '../../../analysis/knowledge';
import type { Registries } from '../../../content/types';
import { blockingOf, COMMANDER, checkChange } from '../../../engine/blocking';
import type { Action } from '../../../engine/dispatch';
import type { CampaignState } from '../../../engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../settings';
import { analyzeAttrs, analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';
import { blockingChoices, setBlocking, type BlockingAdd } from '../blockingStrip';
import { mannequinSvg } from './draw';
import { poseOf, type DialPose } from './points';

export interface PostureDialCtx {
  state: CampaignState | null;
  registries: Registries;
  /** A choice's action (the scene controller's `stage`, as the strip's chips). */
  onStage(action: Action): void;
  reduced: boolean;
  /** Settings for the reading of her names (default: the defaults). */
  settings?: AliusSettings;
}

const EYES: Record<string, string> = { down: 'EYES DOWN', closed: 'EYES CLOSED', at_her: 'EYES ON HER' };

/** The pose the dial draws: the base posture the commander holds (standing while none is set). */
export function dialPoseOf(state: CampaignState): DialPose {
  const id = state.scene ? blockingOf(state.scene, COMMANDER).posture : undefined;
  return (id !== undefined ? poseOf(id) : null) ?? poseOf('standing')!;
}

export function renderPostureDial(host: HTMLElement, ctx: PostureDialCtx): void {
  const { state, registries: reg } = ctx;
  const wasOpen = host.querySelector<HTMLDetailsElement>('details.alius-dial-fan')?.open === true;
  const wasWith = host.querySelector<HTMLSelectElement>('select[name="dial-with"]')?.value;
  const choices = blockingChoices(state, reg);
  if (state === null || choices === null) {
    host.replaceChildren();
    return;
  }
  const pose = dialPoseOf(state);
  const postureId = pose.base;
  const stage = (change: Parameters<typeof setBlocking>[0]): void => ctx.onStage(setBlocking(change));

  // the label: her name for it when a holder present named this posture, else the registry's label
  const knowledge = buildKnowledge(state, ctx.settings ?? DEFAULT_SETTINGS);
  const herName = (state.scene?.participants ?? []).map((id) => knowledge.practice(id, reg).postures.find((p) => p.postureId === postureId)?.name).find((n) => n !== undefined);
  const label = (herName ?? choices.label('blockingPostures', postureId)).toUpperCase();
  const eyes = EYES[pose.points.gaze ?? 'straight'];

  // the fan
  const units = choices.units;
  const who = units.length > 1
    ? (h('select', { name: 'dial-with', class: 'alius-select', 'aria-label': 'With' }, ...units.map((u) => h('option', { value: u }, choices.name(u)))) as HTMLSelectElement)
    : null;
  if (who !== null && wasWith !== undefined && units.includes(wasWith)) who.value = wasWith;
  const unit = (): string => who?.value || units[0]!;
  const fan = h('details', { class: 'alius-dial-fan' }) as HTMLDetailsElement;

  const moveOption = (m: (typeof choices.moves)[number]): HTMLElement => {
    const thumb = poseOf(m.posture);
    return h('button', {
      type: 'button', class: 'alius-btn alius-option alius-dial-option', 'data-move': m.move, 'aria-disabled': m.why !== null ? 'true' : null, title: m.why ?? m.label,
      ...analyzeNative(`blockingPostures:${m.posture}`),
      onclick: () => {
        if (m.why !== null) return;
        fan.open = false;
        stage(m.change);
      },
    }, thumb ? mannequinSvg(thumb, { size: 56 }) : null, h('span', { class: 'alius-dial-option-name' }, m.label.toUpperCase()));
  };
  const addOption = (e: BlockingAdd): HTMLElement => {
    const why = e.why(unit());
    return h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-group': e.group, 'data-id': e.id, ...(e.direction !== undefined ? { 'data-direction': e.direction } : {}),
      'aria-disabled': why !== null ? 'true' : null, title: why ?? null, ...analyzeNative(`${e.registry}:${e.id}`),
      onclick: () => {
        const c = e.change(unit());
        if (checkChange(state, reg, c) === null) stage(c);
      },
    }, e.label);
  };
  const list = (title: string, g: BlockingAdd['group']): HTMLElement | null => {
    const items = choices.add.filter((e) => e.group === g).map(addOption);
    return items.length === 0 ? null : h('div', { class: 'alius-blocking-group alius-dial-list', 'data-list': g }, h('strong', { class: 'alius-dim' }, title), ...items);
  };

  const open = h('summary', {
    class: 'alius-dial-open', 'data-dial-open': '', 'aria-label': `Posture: ${label}. Choose a posture`, ...analyzeAttrs('glossary:posture_dial'),
  }, h('span', { class: 'alius-dial-face' }, mannequinSvg(pose)));
  // jsdom and every browser: the centre toggles the fan (no native summary behaviour, so the click is the same everywhere)
  open.addEventListener('click', (ev) => {
    ev.preventDefault();
    fan.open = !fan.open;
  });
  fan.append(open, h('div', { class: 'alius-dial-menu' },
    h('div', { class: 'alius-dial-moves', 'data-list': 'posture' }, h('strong', { class: 'alius-dim' }, 'POSTURE'), ...choices.moves.map(moveOption)),
    who, list('PLACE', 'anchor'), list('CONTACT', 'contact'), list('WEARING', 'worn')));
  if (wasOpen) fan.open = true;

  const name = h('span', { class: 'alius-dial-name' });
  name.textContent = label;
  host.replaceChildren(h('div', { class: 'alius-dial', 'data-reduced': String(ctx.reduced) },
    fan,
    h('div', { class: 'alius-dial-label' }, name, eyes ? h('span', { class: 'alius-dial-sub alius-dim' }, eyes) : null)));
}
