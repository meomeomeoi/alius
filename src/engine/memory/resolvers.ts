import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import type { EngineEvent } from '../dispatch';
import { voteSubjectLabel } from '../power/ballot';
import { spanText } from '../craft/state';
import { scapegoatOptionId } from '../power/scapegoat';
import { wardenOf } from '../warden/state';
import { isLiving } from '../economy';
import { momentTag } from '../headStart/tag';
import { zoneTag } from '../dynamic/zones';
import type { CampaignState, VoteKind } from '../state/types';

/**
 * What a remembered event is about, as the code reads it (P3b). A resolver is the closed vocabulary behind the `memoryRules`
 * registry: one per event type, returning named id groups and string vars. A pack adds rules for these types only.
 * Booleans become the vars `'yes'` / `''`.
 */
export interface MemoryResolution {
  ids: Record<string, string[]>;
  vars: Record<string, string>;
  /** P11b: tags the fact carries besides its rule's (a head start moment's own kind); none by default. */
  tags?: string[];
}
export type MemoryResolver = (draft: CampaignState, event: EngineEvent, reg: Registries) => MemoryResolution | null;
/** The id groups and vars a resolver can return: what a rule's `about`, `audience`, `when` and `{text}` may name. */
export interface ResolverShape {
  ids: string[];
  vars: string[];
}

const resolvers = new Map<string, MemoryResolver>();
/** Read by the content check (`memoryRules`). */
export const RESOLVER_SHAPES: Record<string, ResolverShape> = {};

export function registerMemoryResolver(type: string, fn: MemoryResolver, shape: ResolverShape): void {
  if (resolvers.has(type)) throw new Error(`Duplicate memory resolver: ${type}`);
  resolvers.set(type, fn);
  RESOLVER_SHAPES[type] = { ids: [...shape.ids], vars: [...shape.vars] };
}

export function memoryResolverFor(type: string): MemoryResolver | undefined {
  return resolvers.get(type);
}

// ---------------------------------------------------------------------------------------------
// helpers (a dead unit's name still resolves)

const nameOf = (draft: CampaignState, id: string): string => draft.squad.find((u) => u.id === id)?.displayName ?? id;
const yes = (b: boolean): string => (b ? 'yes' : '');
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** "Ann", "Ann and Bea", "Ann, Bea and Cat". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const regionNameOf = (reg: Registries, regionId: string | undefined): string | undefined => {
  if (regionId === undefined) return undefined;
  const r = reg.regions.get(regionId);
  return r ? String(r.name) : regionId;
};

/** A unit the event names; null when the event names none (the resolver then returns null). */
const subjectOf = (draft: CampaignState, id: unknown): { id: string; name: string } | null => {
  const unitId = str(id);
  return unitId === undefined ? null : { id: unitId, name: nameOf(draft, unitId) };
};

// ---------------------------------------------------------------------------------------------
// runs and combat

registerMemoryResolver('expedition_ended', (draft, event, reg) => {
  const rep = draft.lastExpedition;
  if (!rep || rep.id !== event.reportId) return null;
  return {
    ids: { party: [...rep.party], dead: [...rep.deaths], injured: [...rep.injuries] },
    vars: {
      region: regionNameOf(reg, rep.regionId) ?? rep.regionId, mission: rep.missionTitle, outcome: rep.outcome,
      dead: yes(rep.deaths.length > 0), injured: yes(rep.injuries.length > 0),
    },
  };
}, { ids: ['party', 'dead', 'injured'], vars: ['region', 'mission', 'outcome', 'dead', 'injured'] });

/** Who was in the field when a combat event fired: the run's party, else the open fight's squad side, else the last result's. */
function fieldParty(draft: CampaignState, unitId: string): string[] {
  if (draft.expedition) return [...draft.expedition.party];
  const side = draft.combat?.combatants.filter((c) => c.side === 'squad' && c.unitId !== undefined).map((c) => c.unitId!);
  if (side && side.length > 0) return side;
  if (draft.lastCombat && draft.lastCombat.participants.includes(unitId)) return [...draft.lastCombat.participants];
  return [unitId];
}

const combatShape: ResolverShape = { ids: ['subject', 'party'], vars: ['name', 'region'] };
const inTheField: MemoryResolver = (draft, event, reg) => {
  const subject = subjectOf(draft, event.unitId);
  if (!subject) return null; // an enemy or the commander: nobody in the squad to remember
  return {
    ids: { subject: [subject.id], party: fieldParty(draft, subject.id) },
    vars: { name: subject.name, region: regionNameOf(reg, draft.expedition?.regionId) ?? 'the field' },
  };
};
registerMemoryResolver('breakdown', inTheField, combatShape);
registerMemoryResolver('order_refused', inTheField, combatShape);

// ---------------------------------------------------------------------------------------------
// disloyalty

const aboutOneUnit: MemoryResolver = (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  return subject ? { ids: { subject: [subject.id] }, vars: { name: subject.name } } : null;
};
for (const type of ['mutiny_started', 'mutiny_subdued', 'unit_deserted', 'deserter_returned']) {
  registerMemoryResolver(type, aboutOneUnit, { ids: ['subject'], vars: ['name'] });
}

// ---------------------------------------------------------------------------------------------
// power

registerMemoryResolver('vote_overruled', (draft, event) => {
  const against = strs(event.against);
  if (against.length === 0) return null;
  return { ids: { against }, vars: { names: joinNames(against.map((id) => nameOf(draft, id))) } };
}, { ids: ['against'], vars: ['names'] });

registerMemoryResolver('vote_carried', (draft, event, reg) => {
  // a vote the commander overruled is spent by the action it was overruled for: that is `vote_overruled`'s fact, not a carry
  if (event.overruled === true) return null;
  const kind = str(event.kind) as VoteKind | undefined;
  const subject = str(event.subject);
  if (kind === undefined || subject === undefined) return null;
  return { ids: {}, vars: { subject: String(reg.voteKinds.get(kind)?.label ?? kind), what: voteSubjectLabel(draft, reg, kind, subject) } };
}, { ids: [], vars: ['subject', 'what'] });

registerMemoryResolver('countermanded', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  const leader = subjectOf(draft, event.leaderId);
  if (!subject || !leader) return null;
  return { ids: { subject: [subject.id], leader: [leader.id] }, vars: { name: subject.name, leader: leader.name } };
}, { ids: ['subject', 'leader'], vars: ['name', 'leader'] });

registerMemoryResolver('rations_set', (_draft, event) => {
  const mode = str(event.mode);
  return mode === undefined ? null : { ids: {}, vars: { mode } };
}, { ids: [], vars: ['mode'] });

// ---------------------------------------------------------------------------------------------
// dilemmas, discipline, the Leash

registerMemoryResolver('dilemma_resolved', (draft, event) => {
  if (event.nothing === true) return null;
  const answer = scapegoatOptionId({ id: str(event.optionId) } as { id: string });
  const subject = subjectOf(draft, event.subjectId);
  return {
    ids: { affected: strs(event.affected), units: strs(event.units), subject: subject ? [subject.id] : [] },
    vars: {
      title: str(event.title) ?? '', option: str(event.label) ?? '', scapegoat: answer === 'take_blame' ? 'take' : answer === 'shift_blame' ? 'shift' : '',
      name: subject?.name ?? '',
    },
  };
}, { ids: ['affected', 'units', 'subject'], vars: ['title', 'option', 'scapegoat', 'name'] });

registerMemoryResolver('demand_resolved', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  if (!subject) return null;
  return { ids: { subject: [subject.id] }, vars: { name: subject.name, answer: str(event.answer) ?? '', expired: yes(event.expired === true), postponed: yes(event.postponed === true) } };
}, { ids: ['subject'], vars: ['name', 'answer', 'expired', 'postponed'] });

registerMemoryResolver('leash_used', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  if (!subject || event.outcome !== 'done') return null; // a denied or failed request forced nobody
  if (event.by === 'oversight') return null; // oversight's own forced Leash on a holder: what is remembered is her exit (`dynamic_exit`), not a Leash the commander used
  return { ids: { subject: [subject.id] }, vars: { name: subject.name, kind: str(event.kind) ?? '' } };
}, { ids: ['subject'], vars: ['name', 'kind'] });

// ---------------------------------------------------------------------------------------------
// P9c personal pressure

registerMemoryResolver('decor_removed_by_commander', aboutOneUnit, { ids: ['subject'], vars: ['name'] });

registerMemoryResolver('token_taken_off', (draft, event) => {
  const giver = subjectOf(draft, event.giverId);
  return giver ? { ids: { giver: [giver.id] }, vars: { name: giver.name } } : null;
}, { ids: ['giver'], vars: ['name'] });

registerMemoryResolver('booking_cancelled', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  return subject ? { ids: { subject: [subject.id] }, vars: { name: subject.name, lost: yes(event.lost === true) } } : null;
}, { ids: ['subject'], vars: ['name', 'lost'] });

/** A game or stake a content category switched off (or her own limits) never names itself. */
const wagerWord = (draft: CampaignState, reg: Registries, entry: Entry | undefined, unitId: string, field: 'label' | 'text'): string => {
  if (!entry || !contentAllowed(draft, reg, entry, unitId)) return 'a wager';
  return String(entry[field] ?? 'a wager');
};

registerMemoryResolver('wager_resolved', (draft, event, reg) => {
  const subject = subjectOf(draft, event.unitId);
  if (!subject || (event.winner !== 'unit' && event.winner !== 'commander')) return null; // a void wager changed nothing
  return {
    ids: { subject: [subject.id] },
    vars: {
      name: subject.name, result: event.winner === 'unit' ? 'won' : 'lost',
      game: wagerWord(draft, reg, reg.wagerGames.get(String(event.gameId)), subject.id, 'label'),
      stake: wagerWord(draft, reg, reg.wagerStakes.get(String(event.stakeId)), subject.id, 'text'),
    },
  };
}, { ids: ['subject'], vars: ['name', 'result', 'game', 'stake'] });

registerMemoryResolver('intercept_resolved', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  return subject ? { ids: { subject: [subject.id] }, vars: { name: subject.name, keep: yes(event.keep === true) } } : null;
}, { ids: ['subject'], vars: ['name', 'keep'] });

// ---------------------------------------------------------------------------------------------
// activities

registerMemoryResolver('activity_done', (draft, event, reg) => {
  const companion = str(event.companionId);
  const activityId = str(event.activityId);
  if (activityId === undefined) return null;
  return {
    ids: { subject: companion !== undefined ? [companion] : [] },
    vars: {
      name: companion !== undefined ? nameOf(draft, companion) : '',
      activity: String(reg.activities.get(activityId)?.name ?? activityId), slot: str(event.slot) ?? draft.slot,
      // an activity that opens a scene (a talk) is remembered by that scene's summary, not by this rule
      scene: yes(reg.activities.get(activityId)?.startsScene === true),
    },
  };
}, { ids: ['subject'], vars: ['name', 'activity', 'slot', 'scene'] });

// ---------------------------------------------------------------------------------------------
// P13 LEASHSWAP

/** The warden at the time of the event (her unit stays in the squad when she is removed, and her state is read while she still holds the leash). */
const holderOf = (draft: CampaignState): { id: string; name: string } | null => {
  const w = wardenOf(draft);
  return w ? { id: w.unitId, name: nameOf(draft, w.unitId) } : null;
};

registerMemoryResolver('override_answered', (draft, event) => {
  if (event.source === 'holder') return null; // P15: a holder's override is not the warden's; what it costs her is her own (hold, favour, the overrode_her event)
  const her = holderOf(draft);
  if (!her) return null;
  return { ids: { subject: [her.id] }, vars: { name: her.name, answer: str(event.answer) ?? '', witnessed: yes(event.context === 'combat') } };
}, { ids: ['subject'], vars: ['name', 'answer', 'witnessed'] });

registerMemoryResolver('commander_punished', (draft, event, reg) => {
  const her = holderOf(draft);
  if (!her || event.remote === true) return null; // remote control has nobody to remember
  const severity = Number(event.severity);
  return { ids: { subject: [her.id] }, vars: { name: her.name, label: String(reg.commanderPunishments.get(String(event.punishmentId))?.label ?? 'a punishment'), heavy: yes(severity >= 3) } };
}, { ids: ['subject'], vars: ['name', 'label', 'heavy'] });

registerMemoryResolver('commander_leashed', (draft, event) => {
  const her = holderOf(draft);
  return her ? { ids: { subject: [her.id] }, vars: { name: her.name, kind: str(event.kind) ?? '' } } : null;
}, { ids: ['subject'], vars: ['name', 'kind'] });

registerMemoryResolver('warden_warning', (draft, event) => {
  const her = holderOf(draft);
  return her ? { ids: { subject: [her.id] }, vars: { name: her.name, level: String(event.level ?? '') } } : null;
}, { ids: ['subject'], vars: ['name', 'level'] });

registerMemoryResolver('warden_removed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const route = str(event.route);
  if (!her || route === undefined) return null;
  const allies = draft.squad.filter((u) => u.kind === 'named' && isLiving(u) && draft.relations[u.id]?.flags.includes('warden_ally')).map((u) => u.id);
  return { ids: { subject: [her.id], commander: ['commander'], allies }, vars: { name: her.name, route } };
}, { ids: ['subject', 'commander', 'allies'], vars: ['name', 'route'] });

registerMemoryResolver('verdict', (_draft, event) => {
  const outcome = str(event.outcome);
  return outcome === undefined ? null : { ids: {}, vars: { outcome } };
}, { ids: [], vars: ['outcome'] });

registerMemoryResolver('ally_won', aboutOneUnit, { ids: ['subject'], vars: ['name'] });

// ---------------------------------------------------------------------------------------------
// head start (P11b): one remembered moment of the weeks before day 1; `head_start_applied` is bookkeeping and has no rule

registerMemoryResolver('head_start_moment', (draft, event) => {
  const subject = subjectOf(draft, event.unitId);
  const text = str(event.text);
  if (!subject || text === undefined || !draft.squad.some((u) => u.id === subject.id)) return null;
  return {
    ids: { unit: [subject.id] },
    vars: { text, kind: str(event.kind) ?? '', importance: String(event.importance ?? '') },
    ...(str(event.kind) !== undefined ? { tags: [momentTag(str(event.kind)!)] } : {}),
  };
}, { ids: ['unit'], vars: ['text', 'kind', 'importance'] });

// ---------------------------------------------------------------------------------------------
// her opinions (P14c): she changed her mind; her other opinion events are bookkeeping, or facts written at their sites

registerMemoryResolver('opinion_changed', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const topic = reg.opinionTopics.get(String(event.topicId));
  return her && topic ? { ids: { her: [her.id] }, vars: { name: her.name, topic: String(topic.label) } } : null;
}, { ids: ['her'], vars: ['name', 'topic'] });

// ---------------------------------------------------------------------------------------------
// moments (P15a): what is said at a point of tension is remembered by those who were there

registerMemoryResolver('moment_answered', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  if (!her) return null;
  const present = strs(event.present);
  const visitorId = str(event.visitorId);
  const type = str(event.responseType) ?? '';
  const key = str(event.key) ?? '';
  return {
    ids: { her: [her.id], present: present.length > 0 ? present : [her.id], visitor: visitorId !== undefined ? [visitorId] : [] },
    vars: {
      name: her.name, source: str(event.sourceId) ?? '', key, type, visitor: visitorId !== undefined ? nameOf(draft, visitorId) : 'someone',
      // she was seen: the commander did not hide (a locked door is not being seen)
      exposed: yes(type !== 'yielded' && key !== 'lock'),
    },
  };
}, { ids: ['her', 'present', 'visitor'], vars: ['name', 'source', 'key', 'type', 'visitor', 'exposed'] });

// ---------------------------------------------------------------------------------------------
// holds (P15a): how a contact physics ended, and being caught cheating; the pair remembers (the commander is not a unit)

const holder: MemoryResolver = (draft, event) => {
  const her = subjectOf(draft, event.holderId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, result: str(event.result) ?? '', physics: str(event.physicsId) ?? '' } } : null;
};
registerMemoryResolver('physics_outcome', holder, { ids: ['her'], vars: ['name', 'result', 'physics'] });
registerMemoryResolver('physics_caught', holder, { ids: ['her'], vars: ['name', 'result', 'physics'] });
// P10e-e R20: a lie under her scent that the body gave away; she remembers it (her question and a right answer are bookkeeping)
registerMemoryResolver('scent_lie_caught', (draft, event) => {
  const her = subjectOf(draft, event.holderId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name } } : null;
}, { ids: ['her'], vars: ['name'] });

// P10e-e R28: her frame. She forgot the commander posed and left (a fact of hers only); someone came in and found the commander posed (the finder
// remembers it, and it spreads as a squad rumor)
registerMemoryResolver('forgotten_end', (draft, event) => {
  const her = subjectOf(draft, event.holderId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name } } : null;
}, { ids: ['her'], vars: ['name'] });
registerMemoryResolver('found_posed', (draft, event) => {
  const her = subjectOf(draft, event.holderId);
  const finder = subjectOf(draft, event.finderId);
  return her && finder ? { ids: { her: [her.id], finder: [finder.id] }, vars: { name: her.name, finder: finder.name } } : null;
}, { ids: ['her', 'finder'], vars: ['name', 'finder'] });

// the body layer (P15a): a stage that a stimulus of hers has reached for the commander, while she was there
registerMemoryResolver('stimulus_stage_changed', (draft, event, reg) => {
  const her = subjectOf(draft, event.holderId);
  const kind = reg.stimulusKinds.get(String(event.kind));
  return her && kind ? { ids: { her: [her.id] }, vars: { name: her.name, to: str(event.to) ?? '', herPresent: yes(event.herPresent === true), what: String(kind.label).toLowerCase() } } : null;
}, { ids: ['her'], vars: ['name', 'to', 'herPresent', 'what'] });

// ---------------------------------------------------------------------------------------------
// what she taught the commander (P14c): the first time a hobby is taught; her other hobby events are facts written at their sites

registerMemoryResolver('hobby_taught', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const hobby = reg.hobbies.get(String(event.hobbyId));
  return her && hobby ? { ids: { her: [her.id] }, vars: { name: her.name, hobby: String(hobby.label) } } : null;
}, { ids: ['her'], vars: ['name', 'hobby'] });

// a first between her and the commander (P14c): six rules, one per kind (`when.kind`); the row and the journal phrase belong to the event's row
registerMemoryResolver('first_moment_kept', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const kind = str(event.kind);
  return her && kind !== undefined ? { ids: { her: [her.id] }, vars: { name: her.name, kind } } : null;
}, { ids: ['her'], vars: ['name', 'kind'] });

// ---------------------------------------------------------------------------------------------
// the dynamic (P15): where she now reads the commander's position; hers alone, never shown to the commander as a reading of the commander's heart

registerMemoryResolver('position_shifted', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const label = (id: unknown): string => String(reg.positionRegions.get(String(id))?.label ?? id);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, from: label(event.from), to: label(event.to) } } : null;
}, { ids: ['her'], vars: ['name', 'from', 'to'] });

// the dynamic (P15): the frame she holds over the commander moved up, and the vow; the pair's own (a cooling or a lost command is not written)

registerMemoryResolver('frame_changed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const rank = (f: unknown): number => ['equal', 'play', 'role', 'rule'].indexOf(String(f));
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, to: String(event.to), from: String(event.from), up: yes(rank(event.to) > rank(event.from)) } } : null;
}, { ids: ['her'], vars: ['name', 'to', 'from', 'up'] });

registerMemoryResolver('sworn', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name } } : null;
}, { ids: ['her'], vars: ['name'] });

// the dynamic (P15, user ruling 2026-11-22): the commander refused the next step she asked for (card or words alike); hers to remember
registerMemoryResolver('milestone_refused', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name } } : null;
}, { ids: ['her'], vars: ['name'] });

// the dynamic (P15b, spec §12.2): the commander's answer to her what-if; hers alone, she may quote it later ("you said you would"). The answer is the extractor's short paraphrase (pronoun-checked when it was read), never the raw words
registerMemoryResolver('hypothetical_answered', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const answer = str(event.answer);
  return her && answer !== undefined ? { ids: { her: [her.id] }, vars: { name: her.name, answer } } : null;
}, { ids: ['her'], vars: ['name', 'answer'] });

// the craft (P16b, plan Task 3): a new best in fiction time, kept by the pair (hers alone; she may bring it up). `what` is the physics' label; the seconds are the engine's, as words
registerMemoryResolver('record_set', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const seconds = Number(event.seconds);
  const key = str(event.key);
  if (!her || key === undefined || !(seconds > 0)) return null;
  // a posture's record is keyed `posture:<preset>` (P16b, Task 12): "the kneel open posture"
  const posture = key.startsWith('posture:') ? reg.servicePostures.get(key.slice('posture:'.length)) : undefined;
  const what = posture !== undefined ? `the ${String(posture.label).toLowerCase()} posture` : String(reg.contactPhysics.get(key)?.label ?? key.replace(/_/g, ' ')).toLowerCase();
  return { ids: { her: [her.id] }, vars: { name: her.name, what, time: spanText(seconds) } };
}, { ids: ['her'], vars: ['name', 'what', 'time'] });

// the craft (P16b, plan Task 15): she saw what the commander did for her unasked (the care's own words, `what`); hers alone, she may bring it up
registerMemoryResolver('care_noticed', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const careId = str(event.careId);
  const what = careId === undefined ? undefined : str(reg.blockingActivities.get(careId)?.promptHint);
  return her && what !== undefined ? { ids: { her: [her.id] }, vars: { name: her.name, what } } : null;
}, { ids: ['her'], vars: ['name', 'what'] });

// the dynamic (P15): the commander left what she held; a vow makes it a break (`sworn`), the route and the severity are the event's own
registerMemoryResolver('dynamic_exit', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, sworn: yes(event.sworn === true) } } : null;
}, { ids: ['her'], vars: ['name', 'sworn'] });

// the dynamic (P15): the holder found out the commander went around her hold on the Leash requests (the event's unit is the holder; an undiscovered one is no rule)
registerMemoryResolver('leash_bypassed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, discovered: yes(event.discovered === true) } } : null;
}, { ids: ['her'], vars: ['name', 'discovered'] });

// the dynamic (P15): an aftermath ended; the reason says how (a return offer refused is the pair's to remember)
registerMemoryResolver('aftermath_ended', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, reason: String(event.reason ?? ''), kind: String(event.kind ?? '') } } : null;
}, { ids: ['her'], vars: ['name', 'reason', 'kind'] });

// the dynamic (P15): the commander let her have a domain (a claim yielded, or the command at the handover); the pair's own. The submit card is no domain and writes nothing.
registerMemoryResolver('domain_yielded', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const domain = reg.dynamicDomains.get(String(event.domainId));
  return her && domain ? { ids: { her: [her.id] }, vars: { name: her.name, domain: String(domain.label), partial: yes(event.partial === true) } } : null;
}, { ids: ['her'], vars: ['name', 'domain', 'partial'] });

// the dynamic (P15, shame without a narrator): a woman who is not a holder lost respect for the commander and said nothing; hers alone, hidden from the commander
registerMemoryResolver('disappointed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name } } : null;
}, { ids: ['her'], vars: ['name'] });

// the dynamic (P15, offering yourself): what the commander offered her and how she answered; mocked is the present's to remember, a correction is the pair's
registerMemoryResolver('offer_made', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, answer: str(event.answer) ?? '', what: str(event.what) ?? 'something' } } : null;
}, { ids: ['her'], vars: ['name', 'answer', 'what'] });

// the dynamic (P15): a worship zone of hers the commander has been shown (by an offer, or by what the commander has learned of her); the fact carries the zone's own tag, which the body map reads
const ATTITUDE_WORDS: Readonly<Record<string, string>> = { craves: 'she craves it', enjoys: 'she enjoys it', indifferent: 'it leaves her cold', dislikes: 'she dislikes it' };
registerMemoryResolver('zone_revealed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const target = str(event.targetId);
  if (!her || target === undefined) return null;
  return { ids: { her: [her.id] }, vars: { name: her.name, what: str(event.what) ?? target, attitude: ATTITUDE_WORDS[str(event.attitude) ?? ''] ?? '' }, tags: [zoneTag(target)] };
}, { ids: ['her'], vars: ['name', 'what', 'attitude'] });

// the practices (P16, R6): a severe or sealed task was signed (the record's line); the holder's alone, the summary is the task's own words (pronoun-checked when it was written)
registerMemoryResolver('practice_signed', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, what: str(event.summary) ?? 'something' } } : null;
}, { ids: ['her'], vars: ['name', 'what'] });

// the practices (P16, R6): a task was broken; only a false report that was found out is remembered (`falseReport`), an honest break is bookkeeping (the journal carries it)
registerMemoryResolver('task_broken', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, what: str(event.summary) ?? 'something', falseReport: yes(event.falseReport === true) } } : null;
}, { ids: ['her'], vars: ['name', 'what', 'falseReport'] });

// the practices (P16, R8): her discipline was issued. Only the shape here (Task 12); the rule that remembers an unfair one (hidden from the commander) is written with the unfairness (Task 32).
registerMemoryResolver('punishment_issued', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, unfair: yes(event.unfair === true) } } : null;
}, { ids: ['her'], vars: ['name', 'unfair'] });

// the practices (P16, R8): the commander answered her discipline. A taken punishment is the pair's to remember; one carried out in public is the audience's too (`present` is her and who watched)
registerMemoryResolver('punishment_answered', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  if (!her) return null;
  const present = strs(event.present);
  return { ids: { her: [her.id], present: present.length > 0 ? present : [her.id] }, vars: { name: her.name, answer: str(event.answer) ?? '', public: yes(event.public === true), what: str(event.summary) ?? 'something' } };
}, { ids: ['her', 'present'], vars: ['name', 'answer', 'public', 'what'] });

// the practices (P16, R8): the commander took a punishment instead of the soldier she ordered it for; the ones present and the spared soldier remember it, and it spreads slowly
registerMemoryResolver('punishment_taken_for', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  const spared = subjectOf(draft, event.sparedId);
  if (!her || !spared) return null;
  const present = strs(event.present);
  return { ids: { her: [her.id], spared: [spared.id], present: present.length > 0 ? present : [her.id, spared.id] }, vars: { name: her.name, spared: spared.name, what: str(event.summary) ?? 'something' } };
}, { ids: ['her', 'spared', 'present'], vars: ['name', 'spared', 'what'] });

// the practices (P16, R9): a demonstration was staged (the scene ended). The audience is the units that watched, on the card or narrated; a humbling one spreads slowly (it is the one seen outside), the other stays with them
registerMemoryResolver('demonstration_staged', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  if (!her) return null;
  const audience = strs(event.audienceIds);
  return {
    ids: { her: [her.id], audience: audience.length > 0 ? audience : [her.id] },
    vars: { name: her.name, what: str(event.summary) ?? 'something', humbling: yes(event.humbling === true), watchers: joinNames(audience.map((id) => nameOf(draft, id))) },
  };
}, { ids: ['her', 'audience'], vars: ['name', 'what', 'humbling', 'watchers'] });

// the practices (P16, R12): a duty came while the commander was held. Only two answers are remembered: the squad left without command (`run`: the keep that a run then followed), and a late release (the party
// waited; the squad when no run was named). The party is the units a launch named; the commander's own answers to a keep (`phase`) carry a different shape and no rule.
registerMemoryResolver('hold_alarm', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  if (!her) return null;
  const party = strs(event.party);
  const squad = draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);
  return { ids: { her: [her.id], party: party.length > 0 ? party : squad }, vars: { name: her.name, answer: str(event.answer) ?? '', run: yes(event.run === true), phase: str(event.phase) ?? '' } };
}, { ids: ['her', 'party'], vars: ['name', 'answer', 'run', 'phase'] });

// the practices (P16, R15): the commander asked her for a task or a punishment and she answered. Only a mocked ask is remembered (by those in the room); a yes lands as a request and a refusal is minor
registerMemoryResolver('ask_answered', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, answer: str(event.answer) ?? '', what: str(event.what) === 'punishment' ? 'a punishment' : 'a task' } } : null;
}, { ids: ['her'], vars: ['name', 'answer', 'what'] });

// the practices (P16, R21): a holder struck the commander (the slap's outcome). Only one before others is remembered, by those present (`present` is her and who saw it)
registerMemoryResolver('slap_dealt', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  if (!her) return null;
  const present = strs(event.present);
  return { ids: { her: [her.id], present: present.length > 0 ? present : [her.id] }, vars: { name: her.name, public: yes(event.public === true), result: str(event.result) ?? '' } };
}, { ids: ['her', 'present'], vars: ['name', 'public', 'result'] });

// the practices (P16, R17): the commander put the device, the key or the calendar in a holder's hands; the pair's to remember (what was given and for how long, as words)
const HANDED_WORDS: Readonly<Record<string, string>> = { device: 'the device', key: 'the key to the quarters', calendar: 'the calendar' };
registerMemoryResolver('handover_given', (draft, event) => {
  const her = subjectOf(draft, event.unitId);
  return her ? { ids: { her: [her.id] }, vars: { name: her.name, what: HANDED_WORDS[str(event.kind) ?? ''] ?? 'something' } } : null;
}, { ids: ['her'], vars: ['name', 'what'] });
