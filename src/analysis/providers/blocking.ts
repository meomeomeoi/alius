import { COMMANDER, WORN_SLOTS, type StagingSnapshot } from '../../engine/blocking';
import type { ResponseType } from '../../engine/blocking';
import { momentsOf } from '../../engine/moments/state';
import { commanderSkill } from '../../engine/physics/skill';
import type { CampaignState } from '../../engine/state/types';
import type { Subject } from '../subject';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';

/**
 * The live reading of the scene blocking (P15a): for a posture, a place, a contact, an item or an activity that is set in the open scene,
 * who has it and who set it (the game, a chip or the reading of the scene) and in which exchange. It reads only the open scene (the
 * staging log), never the vocabulary's numbers; an entry that is not set shows only its description. Nothing here is a number the
 * player may not see, and nothing names a feeling of the commander.
 */
const BY = { engine: 'the game', chip: 'a chip', reading: 'the reading of the scene' } as const;
const FIELD = { postures: 'posture', anchors: 'anchor', contacts: 'contact', items: 'worn', activities: 'activity' } as const;
const VERB: Record<string, string> = { posture: 'is in it', anchor: 'is there', contact: 'is in it', worn: 'wears it', activity: 'is doing it' };

type Kind = 'posture' | 'anchor' | 'contact' | 'worn' | 'activity';

/** Who holds this value in the open scene, in participant order, then the commander. */
function holders(state: CampaignState, kind: Kind, id: string): string[] {
  const blocking = state.scene?.blocking ?? {};
  const out: string[] = [];
  for (const person of [...(state.scene?.participants ?? []), COMMANDER]) {
    const b = blocking[person];
    if (!b) continue;
    const has =
      kind === 'posture' ? b.posture === id : kind === 'anchor' ? b.anchor?.id === id : kind === 'activity' ? b.activity === id
        : kind === 'contact' ? b.contact?.id === id : WORN_SLOTS.some((s) => b.worn?.[s]?.id === id);
    if (has) out.push(person);
  }
  return out;
}

/** The newest log entry that names this change, or `undefined` (the game set it when the scene began). */
function entryFor(state: CampaignState, kind: Kind, id: string, person: string): StagingSnapshot | undefined {
  const log = state.scene?.stagingLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.field !== kind) continue;
    if (kind === 'posture' || kind === 'anchor' ? e.person === person && e.value === id : kind === 'activity' ? e.person === person && e.value === id : e.value === id) return e;
  }
  return undefined;
}

function reading(kind: Kind) {
  return (subject: Subject, env: AnalyzeEnv): { lines: string[] } | null => {
    const state = env.state;
    if (!state?.scene) return null;
    const who = holders(state, kind, subject.id);
    if (who.length === 0) return null;
    const name = (p: string): string => (p === COMMANDER ? 'the commander' : state.squad.find((u) => u.id === p)?.displayName ?? p);
    const parts = who.map((p) => {
      const e = entryFor(state, kind, subject.id, p);
      const how = e === undefined ? 'set by the game at the start' : `set by ${BY[e.source ?? 'engine']} in exchange ${e.exchange ?? 0}`;
      return `${name(p)} ${VERB[kind]}, ${how}`;
    });
    return { lines: [`In the scene: ${parts.join('; ')}.`] };
  };
}

/** What each kind of answer to a moment is, in words (never which one she expects, and never a number). */
const ANSWER_KIND: Record<ResponseType, string> = {
  yielded: 'goes along with her',
  resisted: 'pushes back',
  returned: 'takes the lead back',
  deflected: 'turns it aside',
};

/**
 * The reading of a moment's option while that moment is open (`data-analyze-ctx` carries the option's key): what kind of answer it is, and
 * whether those present will remember it. It reads only the open moment and the source's static `remember` list; her expected option, the gap
 * and the escalation never reach it (they are the engine's own).
 */
function momentOption(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const open = momentsOf(env.state?.scene).open;
  const key = typeof subject.data.key === 'string' ? subject.data.key : undefined;
  if (!open || open.sourceId !== subject.id || key === undefined) return null;
  const option = open.options.find((o) => o.key === key);
  if (!option) return null;
  const lines = [`This answer ${ANSWER_KIND[option.type]}.`];
  const remember = env.registries.momentSources.get(open.sourceId)?.remember as Array<{ option: number }> | undefined;
  if (['0', '1', '2'].includes(key) && remember?.some((r) => String(r.option) === key)) lines.push('Those present will remember it.');
  return { lines };
}

/** The words of the commander's endurance level (0–5); the xp behind them is never shown. */
export const ENDURANCE_WORDS = ['not yet', 'first steps', 'steady', 'seasoned', 'enduring', 'hardened'] as const;
const INPUT_TEXT: Record<string, string> = {
  breathe: 'Catch the gap she gives: the air comes back when you catch it.',
  hold: 'Keep still while she presses; letting go costs strength.',
  gap_breath: 'Breathe through a gap in her seal: a little air, but she may notice.',
  shift_weight: 'Shift her weight back: a little strength, but she may notice.',
  mouth_breath: 'Breathe through the mouth: less of it, but she may notice.',
  part: 'Choose the next part to work.',
  ask_rest: 'Ask for a rest.',
  wait: 'Let the beat pass.',
};

/**
 * The reading of a contact physics (a hold): what a button of it does and, for a physics the body can train, the commander's OWN endurance
 * for it in words. Never her rhythm, her expectations, her skills or the plan of the segment.
 */
function contactPhysicsReading(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const phys = env.registries.contactPhysics.get(subject.id);
  const lines: string[] = [];
  const input = typeof subject.data.input === 'string' ? INPUT_TEXT[subject.data.input] : undefined;
  if (input !== undefined) lines.push(input);
  if (phys?.skill === true && env.state) lines.push(`Your endurance for this: ${ENDURANCE_WORDS[commanderSkill(env.state, subject.id)]}.`);
  return lines.length > 0 ? { lines } : null;
}

/** Registers the P15a readings (called from `registerCoreProviders`). */
export function registerBlockingProviders(): void {
  registerAnalyzeProvider('blockingPostures', reading(FIELD.postures));
  registerAnalyzeProvider('blockingAnchors', reading(FIELD.anchors));
  registerAnalyzeProvider('blockingContacts', reading(FIELD.contacts));
  registerAnalyzeProvider('blockingItems', reading(FIELD.items));
  registerAnalyzeProvider('blockingActivities', reading(FIELD.activities));
  registerAnalyzeProvider('momentSources', momentOption);
  registerAnalyzeProvider('contactPhysics', contactPhysicsReading);
}

