import type { Registries } from '../../content/types';
import { restrictionReason } from '../../engine/discipline';
import { currentStep, livingNamed, type StepWithId } from '../../engine/onboarding';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';

/** What the card asks of the onboarding controller (the card never imports it). */
export interface OnboardingCardController {
  startLineup(): Promise<boolean>;
  talkFirstWords(unitId: string): Promise<boolean>;
  skipFirstWords(unitId: string): void;
  skipStep(): Promise<void>;
  resumeScene(): void;
  launchTutorial(): boolean;
  debriefTutorial(): Promise<boolean>;
  talkGuide(): Promise<boolean>;
}

export interface OnboardingCardCtx {
  state: CampaignState;
  registries: Registries;
  controller: OnboardingCardController;
  readOnly: boolean;
}

/** The glossary entry the buttons of a step explain: read from what the step is (a per-unit scene, a scene, a run), not from its id. */
function glossaryOf(step: StepWithId): string {
  if (step.kind === 'scene') return step.perUnit === true ? 'glossary:first_words' : step.participants === 'warden' ? 'glossary:warden' : 'glossary:lineup';
  if (step.kind === 'expedition') return 'glossary:tutorial_expedition';
  return 'glossary:prologue';
}

const button = (label: string, action: string, address: string, onclick: () => void, disabled?: string | boolean): HTMLElement =>
  h('button', {
    type: 'button', class: 'alius-btn alius-option', 'data-action': action, disabled: disabled !== undefined && disabled !== false,
    title: typeof disabled === 'string' ? disabled : null, ...analyzeNative(address), onclick,
  }, label);

/**
 * The hub's prologue card: the current step and what to press for it. Drawn nothing once the prologue is done (or in a
 * campaign without one); the engine decides which step is current, this only shows it.
 */
export function renderOnboardingCard(host: HTMLElement, ctx: OnboardingCardCtx): void {
  host.replaceChildren();
  const { state, registries: reg, controller } = ctx;
  if (ctx.readOnly) return;
  const step = currentStep(state, reg);
  if (!step) return;
  const address = glossaryOf(step);
  const scene = state.scene;
  const mine = scene?.origin === 'prologue';

  const body = h('div', { class: 'alius-onboarding-body' }, step.objective ? h('p', { class: 'alius-onboarding-objective' }, step.objective) : null);
  const skip = (): HTMLElement | null => (step.skippable ? button('[ SKIP ]', 'skip', address, () => void controller.skipStep(), scene !== undefined && !mine) : null);

  if (mine) {
    body.append(h('div', { class: 'alius-row' }, button('[ RESUME SCENE ]', 'resume', address, () => controller.resumeScene())));
  } else if (step.kind === 'scene' && step.perUnit === true) {
    const spoken = new Set(state.onboarding?.spoken ?? []);
    body.append(h('ul', { class: 'alius-onboarding-units' }, ...livingNamed(state).map((u) => {
      const done = spoken.has(u.id);
      const held = restrictionReason(state, reg, u.id, 'scene');
      return h('li', { class: 'alius-onboarding-unit', 'data-unit': u.id },
        h('span', { class: 'alius-onboarding-name' }, `${done ? '✓ ' : ''}${u.displayName}`),
        done ? null : button('[ TALK ]', 'talk', address, () => void controller.talkFirstWords(u.id), held ?? (scene !== undefined)),
        done ? null : button('[ SKIP ]', 'skip-unit', address, () => controller.skipFirstWords(u.id)),
        held && !done ? h('span', { class: 'alius-dim alius-reason' }, held) : null);
    })));
    body.append(h('div', { class: 'alius-row' }, skip()));
  } else if (step.kind === 'scene') {
    // P13: a scene held with the warden alone reads from the step's field, never its id
    const label = step.participants === 'warden' ? '[ MEET THE WARDEN ]' : '[ BEGIN LINE-UP ]';
    body.append(h('div', { class: 'alius-row' }, button(label, 'begin', address, () => void controller.startLineup(), scene !== undefined), skip()));
  } else if (step.kind === 'expedition') {
    const out = state.expedition !== undefined;
    body.append(h('div', { class: 'alius-row' },
      out
        ? button('[ RESUME PATROL ]', 'resume-run', address, () => controller.launchTutorial())
        : button('[ LAUNCH TUTORIAL ]', 'launch', address, () => controller.launchTutorial(), scene !== undefined),
      out ? null : skip()));
  } else if (step.kind === 'guided_slot' && step.completion === 'debriefed') {
    body.append(h('div', { class: 'alius-row' }, button('[ DEBRIEF ]', 'debrief', address, () => void controller.debriefTutorial(), scene !== undefined), skip()));
  } else if (step.kind === 'guided_slot') {
    const guide = state.squad.find((u) => u.id === state.onboarding?.guideUnitId);
    const here = guide !== undefined && livingNamed(state).some((u) => u.id === guide.id);
    body.append(h('div', { class: 'alius-row' },
      here ? h('span', { class: 'alius-onboarding-guide' }, `${guide.displayName} wants to talk.`) : null,
      here ? button('[ TALK ]', 'talk-guide', address, () => void controller.talkGuide(), scene !== undefined) : null,
      skip()));
  } else {
    body.append(h('div', { class: 'alius-row' }, skip()));
  }

  const card = renderVoiceCard({ voice: VOICE_OF.toast, title: step.title ?? 'PROLOGUE', meta: 'PROLOGUE', level: 3, body });
  card.classList.add('alius-onboarding', 'alius-stat');
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:prologue'))) card.setAttribute(k, v);
  host.append(card);
}
