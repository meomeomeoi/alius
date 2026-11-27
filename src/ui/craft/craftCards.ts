/**
 * P16b Task 26 (gate G3): the craft's cards in the scene's language (`docs/prototypes/cards.html`, "P16b additions", normative): the drill, the exam, the sentence, her note and the
 * lesson, each built with `sceneCard` (her name and every line of hers in her hand, the engine's value in her stronger ink, the commander's answers as plain pills), and `[ANTICIPATE]`
 * in the chip row. A card is a restyle of nothing that existed: its words are `cardVoice` (card-voice.md section 18) read by kind and style, its values the engine's.
 *
 * What a card never shows: the exam's pass mark, the echo of a sentence before it has acted (`landed`), a care that was not noticed or has not landed, the lesson before her reply has passed,
 * what a slip added. Cards that the commander settles in the scene (`not now`, `understood`, `keep it`) are remembered by scene (module memory, forgotten by `resetCraftCards` on a chat switch).
 * No pronoun for the commander. Every card, answer and chip carries `data-analyze`.
 */
import type { Registries } from '../../content/types';
import { plainDraft } from '../../content/draft';
import { anticipateShown } from '../../engine/craft/anticipate';
import { craftHolders } from '../../engine/craft/gate';
import { drillPendingOf } from '../../engine/craft/drillScene';
import { daysLeft, echoOf, sentenceOf } from '../../engine/craft/programmes/vindictive';
import { drillOf } from '../../engine/craft/programmes/drill';
import { enduranceOf, spanText } from '../../engine/craft/state';
import { practiceOf } from '../../engine/dynamic/profile';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { cardWhen } from '../scene/cards/when';
import { gistOf } from '../scene/cards/gist';
import { herLook, scenePill, sceneCard, type SceneCondition } from '../scene/cards/sceneCard';
import { voiceLine, voiceLines, type VoiceKind } from '../scene/cards/voice';
import { onStageReset } from '../scene/stage/index';
import { lineOf } from './craftBlock';

/** What a surface does with the craft's cards: the drill begins (`craft/drill_start`), the commander asks for time (focus the input), `[ANTICIPATE]` is staged. */
export interface CraftCardHandlers {
  begin: (unitId: string) => void;
  askForTime: () => void;
  anticipate: (unitId: string) => void;
  /** Called after a card was settled or a lesson's time ran out: the screen redraws. */
  redraw?: () => void;
}

export type CraftCardKind = 'drill' | 'exam' | 'sentence' | 'note' | 'lesson';

/** A card of the craft, in the prototype's shape (cards.html `KINDS`): what the draw function and the gist read. */
export interface CraftCard {
  kind: CraftCardKind;
  /** `kind:unit[:what]`: stable across redraws, the key of what was settled. */
  key: string;
  /** Whose card it is: the holder who speaks (the first craft-live holder for a drill with another woman). */
  unitId: string;
  /** The woman whose drill waits for the scene (a drill or an exam): what `craft/drill_start` is told. */
  target?: string;
  /** The drill's name and the other woman (a drill with her companion who is not a holder). */
  drill?: string;
  other?: string;
  slots?: number;
  /** The exam's norms as `[what, how much]` in fiction time (never the pass mark) and when it is. */
  norms?: Array<[string, string]>;
  when?: string;
  /** The sentence's days left, the crime in words, the echo in her words (once it has acted) and what a slip adds. */
  days?: number;
  crime?: string;
  echo?: string;
  add?: string;
  /** Her note's object, the lesson's point. */
  what?: string;
  point?: string;
}

/** What the commander settled in this scene (`key`s), by scene id. Forgotten on a chat switch. */
const settled = new Set<string>();
/** When each lesson card first showed (ms of `now`), so a redraw resumes its fade instead of restarting it. */
const lessonSince = new Map<string, number>();
export function resetCraftCards(): void {
  settled.clear();
  lessonSince.clear();
}
onStageReset(resetCraftCards);

/** The seconds a lesson card stays (cards.html: gone by itself after 7 s). */
export const LESSON_MS = 7000;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** The drill's name: the physics' label ("Weight drill"), a discipline's own name otherwise. */
function drillName(reg: Registries, key: string): string {
  const physics = enduranceOf(key);
  const word = physics !== null ? String(reg.contactPhysics.get(physics)?.label ?? physics) : key;
  return `${cap(word.toLowerCase())} drill`;
}

/** Her style (a drill's, an exam's: the holder's), read through `practiceOf`. */
const styleOf = (state: CampaignState, reg: Registries, unitId: string): string | undefined => practiceOf(state, reg, unitId)?.style.primary;

/** Does the style have a line of its own of this kind (a way of her own, not neutral's)? Read by the registry. */
const hasOwn = (reg: Registries, kind: VoiceKind, style: string | undefined): boolean => {
  if (style === undefined) return false;
  for (const e of reg.cardVoice.values()) if (e.kind === kind && e.style === style && (e.lines as string[]).length > 0) return true;
  return false;
};

/** The cards of the craft for the units present, in the order the dock deals them: the sentence, the exam or the drill, her note, the lesson. Pure; reads only what the player may see. */
export function craftCardsOf(state: CampaignState, reg: Registries, present: readonly string[]): CraftCard[] {
  const scene = state.scene;
  if (scene === undefined) return [];
  const out: CraftCard[] = [];
  const holders = craftHolders(state, reg);
  for (const unitId of present) {
    const unit = state.squad.find((u) => u.id === unitId);
    if (unit === undefined || unit.kind !== 'named') continue;
    const craft = state.relations[unitId]?.craft;
    // the sentence she set: its term, why, what a slip adds, and the echo only once it has acted
    const sentence = sentenceOf(state, unitId);
    if (sentence !== undefined && holders.includes(unitId)) {
      const echo = sentence.landed === true ? echoOf(reg, sentence.crimeId)?.line : undefined;
      out.push({
        kind: 'sentence', key: `sentence:${unitId}`, unitId, days: daysLeft(state, sentence),
        crime: String(reg.crimes.get(sentence.crimeId)?.name ?? sentence.crimeId).toLowerCase(),
        ...(echo !== undefined ? { echo: plainDraft(echo) } : {}),
        add: `${NUMBER_WORDS[TUNING.craft.sentence.extend] ?? TUNING.craft.sentence.extend} days`,
      });
    }
    // a drill waiting for its scene, or the exam she runs: a drill with her is hers, with another woman it is said by a holder (the first)
    const pending = scene.participants.includes(unitId) && scene.physics === undefined ? drillPendingOf(state, unitId) : undefined;
    if (pending !== undefined && pending.runId === undefined) {
      if (pending.exam === true) {
        const norms = drillOf(state, unitId)?.norms ?? {};
        const rows: Array<[string, string]> = TUNING.craft.drill.keys.filter((k) => norms[k] !== undefined).map((k) => {
          const physics = enduranceOf(k);
          const where = lineOf(reg, `where.${physics ?? k}`) ?? lineOf(reg, 'where.default') ?? drillName(reg, k);
          return [cap(where), spanText(norms[k]!)];
        });
        out.push({ kind: 'exam', key: `exam:${unitId}`, unitId, target: unitId, norms: rows, when: cardWhen({ day: state.day }, state.day) ?? 'today' });
      } else {
        const speaker = holders.includes(unitId) ? unitId : holders[0];
        if (speaker !== undefined) {
          out.push({
            kind: 'drill', key: `drill:${unitId}`, unitId: speaker, target: unitId, drill: drillName(reg, pending.key), slots: 1,
            ...(speaker !== unitId ? { other: nameOf(state, unitId) } : {}),
          });
        }
      }
    }
    // her note: a care she noticed and showed in this scene, for a woman whose way of noticing one is a note (a style with a line of her own)
    for (const c of craft?.cares ?? []) {
      if (c.voiced !== true || c.scene !== scene.id || !holders.includes(unitId) || !hasOwn(reg, 'noted', styleOf(state, reg, unitId))) continue;
      out.push({ kind: 'note', key: `note:${unitId}:${c.careId}:${c.day}`, unitId, what: String(reg.blockingActivities.get(c.careId)?.label ?? c.careId) });
    }
    // the lesson: her one word for the point, once her reply has passed
    const lesson = craft?.lesson;
    if (lesson !== undefined && holders.includes(unitId) && lesson.scene === scene.id && scene.exchanges > lesson.exchange) {
      out.push({ kind: 'lesson', key: `lesson:${unitId}:${lesson.exchange}`, unitId, point: plainDraft(lesson.words) });
    }
  }
  return out.filter((c) => !settled.has(`${scene.id}|${c.key}`));
}

/** The kind word of the head line (cards.html `title`). */
const TITLE: Record<CraftCardKind, string> = { drill: 'drill', exam: 'exam', sentence: 'sentence', note: 'a note', lesson: 'lesson' };
/** The glossary entry of each kind (its card, its answers). */
const GLOSSARY: Record<CraftCardKind, string> = { drill: 'craft_drill', exam: 'craft_exam', sentence: 'craft_sentence', note: 'craft_care', lesson: 'craft_lesson' };

/** The gist of a collapsed craft card (cards.html `gistOf`). */
export function craftGist(c: CraftCard): string {
  return gistOf({ kind: c.kind, drill: c.drill, other: c.other, norms: c.norms, when: c.when, days: c.days, what: c.what, point: c.point }) ?? '';
}

/** Draws one craft card (cards.html `bodyOf`, the P16b cases). */
export function renderCraftCard(host: HTMLElement, state: CampaignState, reg: Registries, c: CraftCard, handlers: CraftCardHandlers, now: () => number): void {
  const scene = state.scene;
  const unit = state.squad.find((u) => u.id === c.unitId);
  if (scene === undefined || unit === undefined) return;
  const style = styleOf(state, reg, unit.id);
  const live = { unitId: unit.id };
  const address = `glossary:${GLOSSARY[c.kind]}`;
  const settle = (): void => { settled.add(`${scene.id}|${c.key}`); handlers.redraw?.(); };
  const conditions: SceneCondition[] = [];
  const cond = (kind: VoiceKind, vals: Record<string, string>, dry: string, then?: Node[]): void => { conditions.push({ runs: voiceLine(reg, kind, style, c.key, vals), dry, analyze: address, ctx: live, ...(then !== undefined ? { then } : {}) }); };
  const pill = (word: string, onclick: () => void, attrs: Record<string, string>): HTMLElement => scenePill(word, onclick, { ...attrs, 'data-craft-card': c.key, ...analyzeAttrs(address, live) });
  const answers: HTMLElement[] = [];
  const lead: Node[] = [];
  /** Her words are plain in her hand: a value in them is not underlined (cards.html: `.v` is styled in the conditions only). */
  const plain = (runs: ReturnType<typeof voiceLine>): string => runs.map((r) => r.text).join('');
  let words: undefined | string;
  switch (c.kind) {
    case 'drill': {
      const slots = c.slots === 1 ? 'one slot' : `${c.slots} slots`;
      if (c.other !== undefined) cond('drillOther', { drill: c.drill!.toLowerCase(), other: c.other }, `${c.drill} with ${c.other}: x1.2; she hears of it.`);
      else cond('drillWhat', { drill: c.drill! }, `${c.drill} with her: x1.5, her verdict.`);
      cond('drillCost', { slots }, `Takes ${c.slots} slot.`);
      answers.push(pill('begin', () => handlers.begin(c.target ?? c.unitId), { 'data-craft-answer': 'begin' }), pill('not now', settle, { 'data-craft-answer': 'not_now' }));
      break;
    }
    case 'exam': {
      cond('examWhen', { when: c.when! }, `Exam: ${c.when}.`);
      cond('examNorms', {}, 'The norms:', [h('ul', { class: 'alius-scard-norms', ...analyzeAttrs('glossary:craft_norm', live) }, ...c.norms!.map(([what, much]) => h('li', { 'data-craft-norm': '' }, `${what}: `, h('span', { class: 'alius-scard-v' }, much))))]);
      cond('examFail', {}, 'Failing books drills on free slots.');
      answers.push(pill('begin', () => handlers.begin(c.target ?? c.unitId), { 'data-craft-answer': 'begin' }), pill('ask for time', () => handlers.askForTime(), { 'data-craft-focus': '' }));
      break;
    }
    case 'sentence': {
      lead.push(h('div', { class: 'alius-scard-term', 'data-craft-term': '', ...analyzeAttrs(address, live) }, voiceLine(reg, 'term', style, c.key, { days: String(c.days) }).map((r) => r.text).join('')));
      cond('termWhy', { crime: c.crime! }, `The crime: ${c.crime}.`);
      if (c.echo !== undefined) cond('termEcho', { echo: c.echo }, `While it runs: ${c.echo.toLowerCase()}`);
      cond('termGrow', { add: c.add! }, `Each slip: +${c.add}.`);
      answers.push(pill('understood', settle, { 'data-craft-answer': 'understood' }));
      break;
    }
    case 'note': {
      words = plain(voiceLine(reg, 'noted', style, c.key, { what: c.what! }));
      answers.push(pill('keep it', settle, { 'data-craft-answer': 'keep' }));
      break;
    }
    case 'lesson': {
      words = plain(voiceLine(reg, 'lesson', style, c.key, { point: c.point! }));
      break;
    }
  }
  const card = sceneCard({
    her: herLook(state, reg, unit.id), kind: TITLE[c.kind], kindId: c.kind, ...(words !== undefined ? { words } : {}), conditions, answers, lead, gist: craftGist(c),
  });
  card.classList.add('alius-craft-card', `alius-craft-${c.kind}`);
  card.setAttribute('data-craft-card', c.key);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName}: ${TITLE[c.kind]}`);
  for (const [k, v] of Object.entries(analyzeAttrs(address, live))) card.setAttribute(k, v);
  if (c.kind === 'note') card.classList.add('alius-scard-paper');
  if (c.kind === 'lesson') {
    // it goes by itself after 7 s (cards.html `.card.lesson`): a redraw resumes the fade where it was
    const k = `${scene.id}|${c.key}`;
    if (!lessonSince.has(k)) lessonSince.set(k, now());
    const gone = now() - lessonSince.get(k)!;
    if (gone >= LESSON_MS) { settled.add(k); return; }
    card.style.animationDelay = `-${Math.max(0, gone)}ms`;
  }
  host.append(card);
}

/** Draws the craft's cards of the units present into `host` (replacing what it held). Nothing without an open scene. */
export function drawCraftCards(host: HTMLElement, state: CampaignState, reg: Registries, present: readonly string[], handlers: CraftCardHandlers, now: () => number = () => Date.now()): void {
  host.replaceChildren();
  for (const c of craftCardsOf(state, reg, present)) renderCraftCard(host, state, reg, c, handlers, now);
  // a lesson card goes by itself: redraw when the oldest one is due
  const due = [...lessonSince.entries()].filter(([k]) => k.startsWith(`${state.scene?.id ?? ''}|`)).map(([, t]) => LESSON_MS - (now() - t)).filter((ms) => ms > 0);
  if (due.length > 0 && handlers.redraw !== undefined) {
    const redraw = handlers.redraw;
    setTimeout(redraw, Math.min(...due) + 50);
  }
}

/** Her words of the style for the anticipate answer (cards.html `ANTIC.her`): a line, by a hash of the scene (no rng). */
export function anticipateAnswer(reg: Registries, state: CampaignState, unitId: string): string {
  const style = styleOf(state, reg, unitId);
  const key = `${state.scene?.id ?? ''}|${unitId}`;
  const runs = voiceLine(reg, 'anticipate', style, key, {});
  return runs.map((r) => r.text).join('') || (voiceLines(reg, 'anticipate', undefined)[0] ?? '');
}

/**
 * `[ANTICIPATE]` in the chip row (cards.html `drawChips`): a round chip with a dashed border, one for each woman present for whom the engine shows it (her reading's axes allow it, not yet used in
 * the scene: `anticipateShown`). A click hands her to the screen, which stages the act and writes her answer.
 */
export function drawAnticipateChips(host: HTMLElement, state: CampaignState, reg: Registries, present: readonly string[], onAnticipate: (unitId: string) => void): void {
  host.replaceChildren();
  for (const id of present) {
    if (!anticipateShown(state, reg, id)) continue;
    const name = nameOf(state, id);
    host.append(h('button', {
      type: 'button', class: 'alius-btn alius-chip alius-chip-anticipate', 'data-craft-anticipate': id, 'aria-label': `Anticipate ${name}: do what she was about to ask`, ...analyzeNative('glossary:craft_anticipate', { unitId: id }),
      onclick: () => onAnticipate(id),
    }, present.filter((p) => anticipateShown(state, reg, p)).length > 1 ? `anticipate ${name}` : 'anticipate her'));
  }
}
