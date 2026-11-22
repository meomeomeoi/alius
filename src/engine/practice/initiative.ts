/**
 * The commander's initiative (P16, plan R15): asking a unit for a task, or for a punishment. Her answer is the engine's and is the same every time for the same state (`askAnswer`:
 * her style, her hold, her favour); a yes writes a request now (the model words it) and raises her hold (which starts a dynamic for an eligible unit), a mock raises her Record, is
 * remembered by those present (the memory rule `ask_mocked`) and is seen by each other participant, and a refusal is minor (`affectionate` kindly, `possessive` as an opening). One
 * ask a day per woman. Draws nothing: no `rng`, no `practiceRoll`.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { canHold, dynamicOn, herPracticeLive } from '../dynamic/gate';
import { addHold } from '../dynamic/hold';
import { addSign } from '../dynamic/knowledge';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, practiceHolders, practiceLive } from './gate';
import { pickHolderPunishment, punishmentOpen, severityOf, severityOfEntry } from './offences';
import { requestPractice } from './request';
import { pickSeeds } from './seeds';
import { taskRoom } from './tasks';

export type AskWhat = 'task' | 'punishment';
export type AskResult = 'accepted' | 'mocked' | 'refused';

/** Her answer to being asked: the word, and for a refusal whether she is kind about it or takes it as an opening. */
export interface AskAnswer { answer: AskResult; kind?: true; opening?: true }

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * May the commander ask her for anything at all (the chips): the dynamic is on, she is a living named soldier who practises something that is switched on, and she holds (live) or could
 * (`canHold`: not an aftermath, not the cap, not an inclination of none). Reads only.
 */
export function askable(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicOn(state, reg)) return false;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !herPracticeLive(state, unitId)) return false;
  return practiceLive(state, reg, unitId) || canHold(state, reg, unitId) === null;
}

/** Whether she holds the commander (a frame of `play` or beyond), as opposed to being someone who could. */
const holds = (state: CampaignState, unitId: string): boolean => {
  const dyn = dynamicOf(state, unitId);
  return dyn !== undefined && frameRank(dyn.frame) >= frameRank('play');
};

/**
 * Why the commander cannot ask her now, or `null`: she cannot be asked at all, the open scene is without her, she was asked today already, or the commander is held by a holder who has not
 * let the commander turn to others (P15's `others` domain: the capability `relation_rules`) and she is not that holder. Reads only.
 */
export function askRefusal(state: CampaignState, reg: Registries, unitId: string, _what: AskWhat): string | null {
  const name = nameOf(state, unitId);
  if (!askable(state, reg, unitId)) return `${name} cannot be asked now.`;
  if (state.scene !== undefined && !state.scene.participants.includes(unitId)) return `${name} is not here: the commander is in a scene without her.`;
  if (state.practices?.askedOn?.[unitId] === state.day) return `${name} has answered already today.`;
  const keeper = practiceHolders(state, reg).find((id) => id !== unitId && !hasCapability(state, reg, id, 'relation_rules'));
  if (keeper !== undefined) return `The commander is held by ${nameOf(state, keeper)}: turning to others is hers to allow, and she has not.`;
  return null;
}

/**
 * Her answer (R15, no draw): a favour at the refusal line or below mocks whatever else she is; else a hold at `acceptHold` or more says yes, as do the styles that give orders as a matter of
 * course (`ritual`, `drill`, `regal`); else `cruel` and `cold` mock, and so does a `playful` one while her hold is low; the rest refuse, `affectionate` kindly and `possessive` as an opening to
 * claim later. A unit with no dynamic yet has a hold of nothing.
 */
export function askAnswer(state: CampaignState, reg: Registries, unitId: string, _what: AskWhat): AskAnswer {
  const T = TUNING.practice.ask;
  const dyn = dynamicOf(state, unitId);
  const hold = dyn?.hold ?? 0;
  const favour = dyn?.favour ?? 0;
  const style = practiceOf(state, reg, unitId)?.style.primary;
  if (favour <= TUNING.practice.refusalAt) return { answer: 'mocked' };
  if (hold >= T.acceptHold || (style !== undefined && T.accepts.includes(style))) return { answer: 'accepted' };
  if ((style !== undefined && T.mocks.includes(style)) || (style === 'playful' && hold < T.playfulBelow)) return { answer: 'mocked' };
  if (style === 'affectionate') return { answer: 'refused', kind: true };
  if (style === 'possessive') return { answer: 'refused', opening: true };
  return { answer: 'refused' };
}

/** The named living soldiers in the open scene besides her: who sees the commander ask. Nobody in a DM or in a scene without her. */
function witnessesOf(state: CampaignState, unitId: string): string[] {
  const scene = state.scene;
  if (scene === undefined || !scene.participants.includes(unitId)) return [];
  return scene.participants.filter((id) => id !== unitId && state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
}

/**
 * `practice/ask { unitId, what }`: the commander asks her for a task or a punishment. Throws with `askRefusal`'s reason, and when she would say yes and has nothing to give (no seed stands, her
 * tasks are at their cap, a punishment of hers is open or none can be picked). A yes writes a request now (`asked: true`; a punishment carries the offence `asked` at `minor`, no repeat
 * entered) for a live holder and raises her hold, which starts the dynamic of an eligible unit; a mock raises her Record and every other participant sees it; a refusal moves nothing but
 * for `possessive`: `opening` joins her recent forms and her hold rises by a little. Emits `ask_answered` first.
 */
export function ask(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, what: AskWhat): EngineEvent[] {
  const reg = ctx.registries;
  const why = askRefusal(draft, reg, unitId, what);
  if (why !== null) throw new Error(why);
  const live = practiceLive(draft, reg, unitId);
  const result = askAnswer(draft, reg, unitId, what);
  const T = TUNING.practice.ask;
  const events: EngineEvent[] = [];
  let request: EngineEvent[] = [];
  if (result.answer === 'accepted' && live) {
    if (what === 'task') {
      if (!taskRoom(draft, reg, unitId) || pickSeeds(draft, reg, unitId, 'task').length === 0) throw new Error(`${nameOf(draft, unitId)} has nothing to ask of the commander now.`);
      request = requestPractice(draft, ctx, unitId, 'task', { asked: true });
    } else {
      const severity = severityOf(draft, reg, unitId, { stakes: 'minor' });
      const entryId = punishmentOpen(draft, unitId) ? null : pickHolderPunishment(draft, reg, unitId, severity);
      if (entryId === null) throw new Error(`${nameOf(draft, unitId)} has nothing to give the commander now.`);
      request = requestPractice(draft, ctx, unitId, 'punishment', { asked: true, offence: { kind: 'asked', stakes: 'minor', day: draft.day }, severity: severityOfEntry(reg, entryId) ?? severity, entryId });
    }
  }
  const present: string[] = [];
  if (result.answer === 'accepted') events.push(...addHold(draft, ctx, unitId, T.hold, 'asked'), ...request);
  if (result.answer === 'mocked') {
    events.push(...addRecord(draft, unitId, T.mockRecord, 'ask_mocked'));
    const watchers = witnessesOf(draft, unitId);
    if (watchers.length > 0) present.push(unitId, ...watchers);
    for (const w of watchers) events.push(...addSign(draft, ctx, w, unitId, 'protocol_public'));
  }
  if (result.answer === 'refused' && result.opening === true) {
    const dyn = dynamicOf(draft, unitId);
    if (dyn !== undefined) {
      dyn.recent.push('opening');
      while (dyn.recent.length > TUNING.probes.recentMax) dyn.recent.shift();
    }
    events.push(...addHold(draft, ctx, unitId, T.openingHold, 'asked'));
  }
  (ensurePractices(draft).askedOn ??= {})[unitId] = draft.day;
  events.unshift({ type: 'ask_answered', unitId, holderId: unitId, what, answer: result.answer, ...(result.kind === true ? { kind: true } : {}), ...(result.opening === true ? { opening: true } : {}), ...(present.length > 0 ? { present } : {}) });
  return events;
}

/** The words the model is told for her next reply: the engine's answer word and nothing of what moved it. */
export function askWords(event: Readonly<Record<string, unknown>>): string | undefined {
  const W = TUNING.practice.ask.words;
  if (event.answer === 'accepted') return W.accepted;
  if (event.answer === 'mocked') return W.mocked;
  if (event.answer !== 'refused') return undefined;
  return event.kind === true ? W.kind : event.opening === true ? W.opening : W.refused;
}
