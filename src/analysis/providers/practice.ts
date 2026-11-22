/**
 * The practices' readings (P16, plan R24). Every reading goes through `Knowledge.practice`: her tasks and discipline by summary (a sealed one only as sealed, until it is opened), the steps of a
 * ceremony and never its number, the hold with no end while it is hidden, her favour as a word (`[[dynamic_felt]]` in immersive mode) and never the number, the forms she set, her routine, her answer to a
 * request for permission once given, her names for postures, what stands in her hands and the record. A sealed text, the unfair flag, a count, a false report, the alarm score, the routine's broken flag
 * and her asked picks are not in the view, so they have no reading. `practiceSeeds` (examples for the model) has none. No pronoun for the commander (lore §0).
 */
import { practiceHolders } from '../../engine/practice/gate';
import type { PracticeView } from '../../engine/practice/view';
import type { Registries } from '../../content/types';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

const FELT_LINE = '[[dynamic_felt]]';
const SLOT_WORDS: Readonly<Record<string, string>> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' };
const PERMISSION_WORDS: Readonly<Record<string, string>> = { grant: 'gave permission', deny: 'refused permission', wait: 'said not yet', earn: 'said it has to be earned first' };
const HANDOVER_WORDS: Readonly<Record<string, string>> = { device: 'the device', key: 'the key to the quarters', calendar: 'the calendar' };
const MARK_WORDS: Readonly<Record<number, string>> = { 1: 'a slot', 2: 'two slots', 3: 'three slots' };

const unitIdOf = (s: Subject): string | null => (typeof s.data.unitId === 'string' ? s.data.unitId : null);
const nameOf = (env: AnalyzeEnv, unitId: string): string => env.state?.squad.find((u) => u.id === unitId)?.displayName ?? 'She';
const STATUS_WORDS = { offered: 'waiting for an answer', open: 'accepted', negotiating: 'being talked over', accepted: 'accepted' } as const;

type Reader = (s: Subject, env: AnalyzeEnv, v: PracticeView, unitId: string, k: Knowledge) => string[];

/** A provider for the subject's unit (or, with none given, every holder): the view is built once each; no state, no reading. */
function viewed(read: Reader) {
  return (s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null => {
    if (!env.state) return null;
    const given = unitIdOf(s);
    const units = given !== null ? [given] : practiceHolders(env.state, env.registries);
    const lines = units.flatMap((id) => read(s, env, k.practice(id, env.registries), id, k));
    return lines.length > 0 ? { lines } : null;
  };
}

const taskLines: Reader = (_s, env, v, unitId) => v.tasks.map((t) => (t.summary === null
  ? `${nameOf(env, unitId)}: a sealed task, ${STATUS_WORDS[t.status]}.`
  : `${nameOf(env, unitId)}: ${t.summary}, ${STATUS_WORDS[t.status]}${t.noDuration ? ', until she decides' : ''}.`));

const punishmentLines = (orders: boolean | null): Reader => (_s, env, v, unitId) => v.punishments.filter((p) => orders === null || p.order === orders).flatMap((p) => {
  if (p.summary === null) return [`${nameOf(env, unitId)}: a sealed punishment, waiting for an answer.`];
  const out = [`${nameOf(env, unitId)}: ${p.summary}, ${STATUS_WORDS[p.status]}${p.public ? ', before others' : ''}.`];
  const next = p.ceremony?.find((c) => !c.done);
  if (p.ceremony !== undefined) out.push(`Done: ${p.ceremony.filter((c) => c.done).map((c) => c.label).join(', ') || 'nothing yet'}.${next !== undefined ? ` Next: ${next.label}.` : ''}`);
  return out;
});

const ceremonyLines: Reader = (_s, _env, v) => v.punishments.flatMap((p) => {
  if (p.ceremony === undefined || p.summary === null) return [];
  const next = p.ceremony.find((c) => !c.done);
  return [`${p.summary}: done ${p.ceremony.filter((c) => c.done).map((c) => c.label).join(', ') || 'nothing yet'}.${next !== undefined ? ` Next: ${next.label}.` : ' Every step is done.'}`];
});

const demonstrationLines: Reader = (_s, env, v, unitId) => v.demonstrations.map((d) => `${nameOf(env, unitId)}: ${d.summary}, ${d.status === 'offered' ? 'waiting for an answer' : 'under way'}.`);
const protocolLines: Reader = (_s, env, v, unitId) => v.protocol.map((p) => `${nameOf(env, unitId)} holds the commander to: ${p}.`);
const routineLines: Reader = (_s, env, v, unitId) => (v.routine !== null ? [`${nameOf(env, unitId)} keeps a routine: ${v.routine}.`] : []);

/** Her favour as a word; in immersive mode it is felt, not read. */
const favourLines: Reader = (_s, env, v, unitId, k) => {
  void k;
  if (v.favour === undefined) return env.settings.dynamicHidden === true && env.state !== null ? [FELT_LINE] : [];
  return [`${nameOf(env, unitId)} seems ${v.favour} toward the commander's service.`];
};

const permissionLines: Reader = (_s, env, v, unitId) => (v.permission !== null ? [`${nameOf(env, unitId)} ${PERMISSION_WORDS[v.permission]}.`] : []);

const dayWords = (untilDay: number, today: number): string => (untilDay <= today ? 'today' : untilDay === today + 1 ? 'tomorrow' : 'for some days');

const heldLines: Reader = (_s, env, v, unitId, k) => {
  if (v.held === null) return [];
  const name = nameOf(env, unitId);
  if (v.held.sensory) return [`Held in ${name}'s quarters.`];
  if (v.held.until === null) return [`Held in ${name}'s quarters. She has not said how long.`];
  const today = env.state!.day;
  const raw = k.raw(v.held.until.day);
  return [`Held in ${name}'s quarters until the end of ${v.held.until.day === today ? 'the' : "tomorrow's"} ${SLOT_WORDS[v.held.until.slot] ?? v.held.until.slot}${raw !== null && v.held.until.day !== today ? ` (day ${raw})` : ''}.`];
};

const postureLines: Reader = (_s, env, v, unitId) => v.postures.map((p) => `${nameOf(env, unitId)} calls it "${p.name}".`);
const handoverLines: Reader = (_s, env, v, unitId, k) => v.handovers.map((h) => `${HANDOVER_WORDS[h.kind] ?? h.kind} is in ${nameOf(env, unitId)}'s hands until ${dayWords(h.untilDay, env.state!.day)}${k.raw(h.untilDay) !== null ? ` (day ${k.raw(h.untilDay)})` : ''}.`);
const recordLines: Reader = (_s, _env, v) => v.records.map((r) => r.line);

/** `glossary:practice`: the whole of it in a few lines. */
const practiceLines: Reader = (s, env, v, unitId, k) => [
  ...taskLines(s, env, v, unitId, k), ...punishmentLines(null)(s, env, v, unitId, k), ...demonstrationLines(s, env, v, unitId, k), ...protocolLines(s, env, v, unitId, k), ...heldLines(s, env, v, unitId, k),
];

/** `holderPunishments:<id>`: whether she has this one open (a sealed one does not say which kind it is). */
const entryReading: Reader = (s, env, v, unitId) => v.punishments.filter((p) => p.entryId === s.id && p.summary !== null).map((p) => `${nameOf(env, unitId)} has this open: ${p.summary}, ${STATUS_WORDS[p.status]}.`);

/** `ceremonySteps:<id>`: done, or next, in a ceremony she is holding. */
const stepReading: Reader = (s, env, v, unitId) => v.punishments.flatMap((p) => {
  const steps = p.ceremony;
  if (steps === undefined || p.summary === null) return [];
  const step = steps.find((c) => c.id === s.id);
  if (step === undefined) return [];
  if (step.done) return [`${nameOf(env, unitId)}'s ceremony: done.`];
  return steps.find((c) => !c.done)?.id === s.id ? [`${nameOf(env, unitId)}'s ceremony: next.`] : [];
});

/** `implements:<id>`: what it leaves, from the entry (never the force). */
function implementReading(s: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const entry = (env.registries as Registries).implements.get(s.id) as { mark?: { kind?: string; slots?: number } } | undefined;
  if (entry?.mark?.kind === undefined) return null;
  return { lines: [`It leaves ${entry.mark.kind} for ${MARK_WORDS[entry.mark.slots ?? 1] ?? 'some slots'}.`] };
}

/** Registers the practices' readings (called from `registerCoreProviders`). */
export function registerPracticeProviders(): void {
  const on = (id: string, read: Reader): void => { registerAnalyzeProvider(`glossary:${id}`, viewed(read)); };
  on('practice', practiceLines);
  for (const id of ['practice_task', 'task_card', 'consent_ladder', 'accept_words', 'accept_signed']) on(id, taskLines);
  for (const id of ['holder_punishment', 'punishment_card']) on(id, punishmentLines(false));
  on('take_it_instead', punishmentLines(true));
  on('ceremony', ceremonyLines);
  on('demonstration', demonstrationLines);
  on('protocol', protocolLines);
  on('routine', routineLines);
  on('favour', favourLines);
  for (const id of ['denial', 'ask_permission']) on(id, permissionLines);
  for (const id of ['held', 'sensory_mode', 'ask_release']) on(id, heldLines);
  on('named_posture', postureLines);
  on('posture_call', postureLines);
  on('handover', handoverLines);
  on('practice_record', recordLines);
  registerAnalyzeProvider('holderPunishments', viewed(entryReading));
  registerAnalyzeProvider('ceremonySteps', viewed(stepReading));
  registerAnalyzeProvider('implements', implementReading);
}
