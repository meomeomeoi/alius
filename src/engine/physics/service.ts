/**
 * P10e-e Task 25: foot service under the desk, the engine's half (`docs/prototypes/her_activity.html`, the game inside `service`; P16b §8).
 *
 * - Her signals (`signalsOf`): the prototype's `herSignals` (the three foot acts and two of closer / still / enough, each on a motion of hers),
 *   shuffled by `fnv1a` of her id (the prototype hashes the session and the style; the engine keeps them hers, so the commander can learn them).
 * - Her pace (`servicePaceOf`): the prototype's drafts of her profile (`SVC_STYLE`, by her lead style), her patience bounded by the plan, and her
 *   grain and order of zones (`herGrain` / `herOrder`) hashed per her; her own words of how she likes her feet (P15 `how`) tilt them. Hidden:
 *   it never reaches an event, a toast, a panel, a label, a prompt or a reading.
 * - Her verdict (`verdictOf`): a session's mean quality by the prototype's threshold (`q ≥ 0.6` her good line).
 *
 * Nothing here draws: `shuffleBy` is the prototype's LCG on a hash.
 */
import type { Registries } from '../../content/types';
import { bend } from '../bend';
import { expectationsOf } from '../dynamic/expectations';
import { fnv1a } from '../hub';
import type { Verdict } from '../practice/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { leadStyle, physicsMannerOf, physicsStyleOf } from './style';

/** A deterministic shuffle (her_activity.html `shuffleBy`: the engine hashes, it does not draw). */
export function shuffleBy<T>(list: readonly T[], seed: number): T[] { const a = list.slice(); let x = seed >>> 0 || 1; for (let i = a.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

export type FootMotion = (typeof TUNING.physics.footSignals.motions)[number];
export type FootMeaning = (typeof TUNING.physics.footSignals.foot)[number] | (typeof TUNING.physics.footSignals.desk)[number];
export interface FootSignal { motion: FootMotion; meaning: FootMeaning }

/** Her pairs of motion → meaning (the three foot acts always among them), hers and stable. */
export function signalsOf(_state: Pick<CampaignState, 'squad'>, holderId: string): FootSignal[] {
  const F = TUNING.physics.footSignals;
  const h = fnv1a(`${holderId}|foot_signals`);
  const mo = shuffleBy(F.motions, h), rest = shuffleBy(F.desk, h >>> 5);
  return [...F.foot, ...rest.slice(0, F.deskCount)].map((m, i) => ({ motion: mo[i]!, meaning: m }));
}

/** The zones each act asks for (her_activity.html `ZONES_OF`). */
export const ZONES_OF = { kiss: ['toes', 'ball', 'arch', 'heel'], clean: ['toes', 'ball', 'arch', 'heel', 'edge'], rub: ['ball', 'arch', 'heel'] };
export type FootAct = keyof typeof ZONES_OF;
/* her patience for an answer, her kiss, her tempo, her grain, by style (drafts for the engine: her expectation profile, P15 `how`) */
export const SVC_STYLE = {
  neutral:      { patience: 4.5, kiss: [0.7, 1.5], tempo: 1.0, every: 1 },
  affectionate: { patience: 6,   kiss: [1.0, 2.2], tempo: 0.8, every: 1.2 },
  playful:      { patience: 3.5, kiss: [0.4, 1.1], tempo: 1.2, every: 0.9 },
  possessive:   { patience: 4,   kiss: [1.0, 1.9], tempo: 0.9, every: 0.65 },
  cold:         { patience: 4,   kiss: [0.6, 1.2], tempo: 1.0, every: 1.1 },
  cruel:        { patience: 2.5, kiss: [0.55, 1.0], tempo: 1.4, every: 0.6 },
  clinical:     { patience: 4,   kiss: [0.85, 1.15], tempo: 1.0, every: 1 },
  ritual:       { patience: 4.5, kiss: [0.8, 1.2], tempo: 1.0, every: 1 },
} as Record<string, { patience: number; kiss: number[]; tempo: number; every: number }>;

/** How she wants her foot served: hidden, read only by the instrument. */
export interface ServicePace {
  /** Seconds she waits for an answer to her signal. */
  patience: number;
  /** A kiss she likes lasts this long (seconds). */
  kiss: [number, number];
  /** Circles a second of a rub she likes. */
  tempo: number;
  /** How often she signals (a factor on the wait between bouts). */
  every: number;
  /** 1: toes to heel; −1: heel to toes. */
  grain: 1 | -1;
  /** Her order of the zones, per act. */
  order: Record<FootAct, string[]>;
}

const ZONE_WORD = /\b(toes?|ball|arch|heel|edge)\b/g;

/** Her own words of how she likes her feet (P15 `how` of the targets at her feet, read by the body map's zone, never by id). */
function howOfFeet(state: Pick<CampaignState, 'squad' | 'content'>, reg: Registries, holderId: string): string {
  const worship = expectationsOf(state, reg, holderId).worship ?? {};
  const atFeet = (id: string): boolean => {
    const zone = reg.worshipTargets.get(id)?.zone as Record<string, { y?: number }> | undefined;
    return Object.values(zone ?? {}).some((z) => typeof z?.y === 'number' && z.y >= TUNING.physics.footService.footZoneY);
  };
  return Object.entries(worship).filter(([id, w]) => atFeet(id) && w.attitude !== 'dislikes' && typeof w.how === 'string').map(([, w]) => w.how!.toLowerCase()).join(' ');
}

/** Her pace of foot service (patience, kiss, tempo, how often, grain, order): her style's draft, her words, her hash. */
export function servicePaceOf(state: CampaignState, reg: Registries, holderId: string): ServicePace {
  const P = TUNING.physics.footService;
  const style = leadStyle(physicsStyleOf(state, holderId, reg)).key;
  const row = SVC_STYLE[style] ?? SVC_STYLE.neutral!;
  const patience = style === 'cruel' ? row.patience : Math.min(P.patience[1], Math.max(P.patience[0], row.patience));
  const how = howOfFeet(state, reg, holderId);
  const tilt = /\bslow/.test(how) ? P.slow : /\b(quick|fast|brisk)/.test(how) ? P.quick : { kiss: 1, tempo: 1 };
  const named = [...new Set([...how.matchAll(ZONE_WORD)].map((m) => (m[1]!.startsWith('toe') ? 'toes' : m[1]!)))];
  const heel = how.indexOf('heel'), toe = how.search(/\btoe/);
  const grain: 1 | -1 = heel >= 0 && toe >= 0 ? (heel < toe ? -1 : 1) : fnv1a(`${holderId}|grain`) % 2 ? 1 : -1;
  const order = Object.fromEntries((Object.keys(ZONES_OF) as FootAct[]).map((act) => {
    const hashed = shuffleBy(ZONES_OF[act], fnv1a(`${holderId}|order|${act}`));
    const first = named.filter((z) => hashed.includes(z));
    return [act, [...first, ...hashed.filter((z) => !first.includes(z))]];
  })) as Record<FootAct, string[]>;
  // P15b: her manner moves the pace after her style and her words have set it: her patience by `warmth`, the time of a kiss and the wait between bouts by `tempo`
  // (+ = quicker = shorter), the circles a second of a rub by `tempo` (+ = more). With no manner, or at 0, every number is the one above.
  const m = physicsMannerOf(state, holderId, reg);
  const k = TUNING.manner.scale;
  const tempo = m?.tempo ?? 0, warmth = m?.warmth ?? 0;
  return {
    patience: bend(patience, warmth, { scale: k }), kiss: [bend(row.kiss[0]! * tilt.kiss, tempo, { scale: -k }), bend(row.kiss[1]! * tilt.kiss, tempo, { scale: -k })],
    tempo: bend(row.tempo * tilt.tempo, tempo, { scale: k }), every: bend(row.every, tempo, { scale: -k }), grain, order,
  };
}

/** Her verdict on a session of foot service from its mean quality (0–1), by the prototype's threshold. */
export function verdictOf(quality: number): Verdict {
  const V = TUNING.physics.footService.verdict;
  if (!Number.isFinite(quality)) return 'displeased';
  return quality >= V.pleased ? 'pleased' : quality >= V.adequate ? 'adequate' : 'displeased';
}
