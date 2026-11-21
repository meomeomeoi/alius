import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import type { EngineEvent } from '../dispatch';
import { voteSubjectLabel } from '../power/ballot';
import { scapegoatOptionId } from '../power/scapegoat';
import { wardenOf } from '../warden/state';
import { isLiving } from '../economy';
import { momentTag } from '../headStart/tag';
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

// the dynamic (P15): the commander let her have a domain (a claim yielded, or the command at the handover); the pair's own. The submit card is no domain and writes nothing.
registerMemoryResolver('domain_yielded', (draft, event, reg) => {
  const her = subjectOf(draft, event.unitId);
  const domain = reg.dynamicDomains.get(String(event.domainId));
  return her && domain ? { ids: { her: [her.id] }, vars: { name: her.name, domain: String(domain.label), partial: yes(event.partial === true) } } : null;
}, { ids: ['her'], vars: ['name', 'domain', 'partial'] });
