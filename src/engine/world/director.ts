import type { Entry, Registries } from '../../content/types';
import { advanceClock } from './clocks';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { nextId } from '../memory';
import type { Rng } from '../rng';
import { normalizeTag } from '../setup';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import {
  boardRoom, checkOffer, offerMission, postRumor, rumorCap, rumorPostedEvent, type MissionOffer,
} from './missions';
import { checkProposal, currentBeat, beatReady, isOpenEnded, proposeBeat, spineOf } from './spine';
import { knownRegions } from './state';
import { THREAD_STATUSES, type DirectorRequest, type MissionSource, type Thread, type ThreadStatus } from './types';

// ---------------------------------------------------------------------------------------------
// Digest: what the mechanic model is shown (no numbers of the relationship layer, no unit ids)

export interface Digest {
  day: number;
  phase: 'spine' | 'open';
  beat?: { id: string; title: string; goal: string; ready: boolean; proposed: boolean };
  threads: Array<{ id: string; title: string; status: string; flags: string[] }>;
  clocks: Array<{ id: string; label: string; filled: number; segments: number; regionId?: string }>;
  factions: Record<string, number>;
  flags: string[];
  squad: Array<{ name: string; state: string }>;
  board: Array<{ id: string; source: string; title: string; regionId: string; danger: number; daysLeft?: number }>;
  boardRoom: number;
  rumorRoom: number;
  regions: Array<{ id: string; name: string; danger: number }>;
  templates: Array<{ id: string; sources: string[]; regions?: string[]; objectives: string[]; tiers: string[] }>;
  lastExpedition?: { regionId: string; outcome: string; missionTitle: string };
}

/** Flags shown per thread (the newest ones) — the digest has to stay small. */
const DIGEST_THREAD_FLAGS = 4;

export function rumorRoom(state: CampaignState, reg: Registries): number {
  return Math.max(0, rumorCap(state, reg) - state.rumors.filter((r) => r.day === state.day).length);
}

export function buildDigest(state: CampaignState, reg: Registries): Digest {
  const spine = spineOf(state, reg);
  const beat = currentBeat(state, reg);
  const digest: Digest = {
    day: state.day,
    phase: spine.length > 0 && !isOpenEnded(state, reg) ? 'spine' : 'open',
    threads: state.world.threads
      .filter((t, _i, all) => t.status === 'open' || (t.status === 'dormant' && all.filter((x) => x.status === 'dormant').slice(-6).includes(t)))
      .map((t) => ({ id: t.id, title: t.title, status: t.status, flags: t.flags.slice(-DIGEST_THREAD_FLAGS).map((f) => f.id) })),
    clocks: state.world.clocks.map((c) => ({
      id: c.id, label: c.label, filled: c.filled, segments: c.segments, ...(c.regionId !== undefined ? { regionId: c.regionId } : {}),
    })),
    factions: { ...state.world.factions },
    flags: state.world.flags.slice(-TUNING.director.digestFlags),
    squad: state.squad
      .filter((u) => u.kind === 'named' && u.status !== 'dead' && u.status !== 'deserted' && u.status !== 'terminated')
      .map((u) => ({ name: u.displayName, state: String(reg.relationshipStates.get(state.relations[u.id]?.stateId ?? '')?.name ?? 'Unknown') })),
    board: state.missions.offered.map((m) => ({
      id: m.id, source: m.source, title: m.title, regionId: m.regionId, danger: m.danger,
      ...(m.deadlineDay !== undefined ? { daysLeft: m.deadlineDay - state.day } : {}),
    })),
    boardRoom: boardRoom(state, reg),
    rumorRoom: rumorRoom(state, reg),
    regions: knownRegions(state, reg).map((r) => ({ id: String(r.id), name: String(r.name), danger: r.danger as number })),
    templates: [...reg.missionTemplates.values()]
      .filter((t) => (t.sources as string[]).some((s) => s !== 'story'))
      .map((t) => ({
        id: String(t.id), sources: [...(t.sources as string[])], ...(t.regions ? { regions: [...(t.regions as string[])] } : {}),
        objectives: (t.objectives as Array<{ node: string }>).map((o) => o.node), tiers: [...(t.tiers as string[])],
      })),
  };
  if (beat && digest.phase === 'spine') {
    digest.beat = { id: beat.id, title: beat.title, goal: beat.goal, ready: beatReady(state, reg, beat), proposed: state.world.spine?.proposed === beat.id };
  }
  if (state.lastExpedition) {
    const e = state.lastExpedition;
    digest.lastExpedition = { regionId: e.regionId, outcome: e.outcome, missionTitle: e.missionTitle };
  }
  return digest;
}

// ---------------------------------------------------------------------------------------------
// Output and validation

export interface DirectorOffer {
  templateId: string;
  regionId: string;
  danger?: number;
  title?: string;
  brief?: string;
  objectiveNode?: string;
  deadlineDays?: number;
  rewardsTier?: string;
  threadId?: string;
  spineBeat?: string;
}

export interface DirectorOutput {
  missionOffers: DirectorOffer[];
  rumors: Array<{ text: string; leadsTo: 'mission' | 'fact' | 'none'; tags: string[]; lead?: { templateId: string; regionId: string } }>;
  threadUpdates: Array<{ threadId: string; title?: string; status?: ThreadStatus; addFlags?: Array<{ slug: string; description: string }> }>;
  clockAdvances: Array<{ clockId: string; by: 1 | 2; reason: string }>;
  storyBeatProposal?: { beatId: string; framing: string };
}

export const emptyOutput = (): DirectorOutput => ({ missionOffers: [], rumors: [], threadUpdates: [], clockAdvances: [] });

export interface Rejection { part: string; reason: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Model text kept as plain text (markup stays text): control characters out, whitespace collapsed, cut. */
function plain(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}
const words = (text: string, max: number): string => text.split(' ').filter(Boolean).slice(0, max).join(' ');
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32).replace(/_+$/g, '');

/**
 * What a director offer becomes: the single open `command` mission slot goes to the first command-capable offer, any
 * other offer is a `side` mission (which the board size limits); `null` when neither is possible.
 */
export function directorSource(state: CampaignState, reg: Registries, templateId: string, commandTaken: boolean): MissionSource | null {
  const sources = (reg.missionTemplates.get(templateId)?.sources as string[] | undefined) ?? [];
  const commandOpen = commandTaken || [...state.missions.offered, ...state.missions.active].some((m) => m.source === 'command');
  if (sources.includes('command') && !commandOpen) return 'command';
  return sources.includes('side') ? 'side' : null;
}

const openThreads = (state: CampaignState): number =>
  state.world.threads.filter((t) => t.status === 'open' && !t.id.startsWith('spine:')).length;

/**
 * Checks everything a director answer (model or fallback) says against the rules and the content. Never throws and
 * never changes state: what fails is dropped and listed in `rejected`. Amounts are never read from the answer.
 */
export function validateDirectorOutput(
  state: CampaignState, reg: Registries, raw: unknown, opts: { cooldownDays: number; only?: 'rumors' },
): { output: DirectorOutput; rejected: Rejection[] } {
  const output = emptyOutput();
  const rejected: Rejection[] = [];
  const reject = (part: string, reason: string): void => { rejected.push({ part, reason }); };
  if (!isObj(raw)) {
    reject('output', 'the answer is not an object');
    return { output, rejected };
  }
  const list = (key: string): unknown[] => {
    const v = raw[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) { reject(key, 'not a list'); return []; }
    return v;
  };
  const only = opts.only === 'rumors';
  let commandTaken = false;

  // spine beat first: an offer for it may come in the same answer
  let proposedNow: string | undefined;
  if (!only && raw.storyBeatProposal !== undefined) {
    const p = raw.storyBeatProposal;
    if (!isObj(p) || typeof p.beatId !== 'string') reject('storyBeatProposal', 'not a beat proposal');
    else {
      const problem = checkProposal(state, reg, p.beatId, opts.cooldownDays);
      if (problem) reject('storyBeatProposal', problem);
      else {
        output.storyBeatProposal = { beatId: p.beatId, framing: words(plain(p.framing, 600), TUNING.director.framingWords) };
        proposedNow = p.beatId;
      }
    }
  }
  const current = currentBeat(state, reg)?.id;
  const beatOpen = (id: string): boolean => id === current && (state.world.spine?.proposed === id || proposedNow === id);

  if (!only) {
    list('missionOffers').forEach((o, i) => {
      const part = `missionOffers[${i}]`;
      if (i >= TUNING.director.maxOffers) return reject(part, `more than ${TUNING.director.maxOffers} offers`);
      if (!isObj(o) || typeof o.templateId !== 'string' || typeof o.regionId !== 'string') return reject(part, 'not a mission offer');
      const offer: DirectorOffer = { templateId: o.templateId, regionId: o.regionId };
      let source: MissionSource | null;
      if (o.spineBeat !== undefined) {
        if (typeof o.spineBeat !== 'string' || !beatOpen(o.spineBeat)) return reject(part, 'that beat is not the proposed current beat');
        offer.spineBeat = o.spineBeat;
        source = 'story';
      } else {
        source = directorSource(state, reg, o.templateId, commandTaken);
        if (source === null) return reject(part, 'a command mission is already open and the template allows no side mission');
      }
      if (o.danger !== undefined) {
        if (typeof o.danger !== 'number' || !Number.isInteger(o.danger) || o.danger < 1 || o.danger > 5) return reject(part, 'danger must be an integer from 1 to 5');
        offer.danger = o.danger;
      }
      if (typeof o.deadlineDays === 'number' && Number.isFinite(o.deadlineDays)) {
        offer.deadlineDays = clamp(Math.round(o.deadlineDays), TUNING.world.deadlineMinDays, TUNING.world.deadlineMaxDays);
      }
      const title = plain(o.title, TUNING.director.titleMax);
      if (title !== '') offer.title = title;
      const brief = plain(o.brief, TUNING.director.briefMax);
      if (brief !== '') offer.brief = brief;
      for (const key of ['objectiveNode', 'rewardsTier', 'threadId'] as const) {
        if (o[key] === undefined) continue;
        if (typeof o[key] !== 'string') return reject(part, `${key} must be an id`);
        offer[key] = o[key] as string;
      }
      const problem = checkOffer(state, reg, { ...offer, source });
      if (problem) return reject(part, problem);
      if (output.missionOffers.some((x) => x.templateId === offer.templateId && x.regionId === offer.regionId)) return reject(part, 'the same offer twice');
      if (source === 'command') commandTaken = true;
      output.missionOffers.push(offer);
    });
  }

  let room = rumorRoom(state, reg);
  list('rumors').forEach((r, i) => {
    const part = `rumors[${i}]`;
    if (i >= TUNING.director.maxRumors) return reject(part, `more than ${TUNING.director.maxRumors} rumors`);
    if (!isObj(r)) return reject(part, 'not a rumor');
    const text = words(plain(r.text, 600), TUNING.director.rumorWords);
    if (text === '') return reject(part, 'the rumor has no text');
    if (room <= 0) return reject(part, 'no room for more rumors today');
    const tags: string[] = [];
    for (const t of Array.isArray(r.tags) ? r.tags : []) {
      const n = normalizeTag(t);
      if (n !== null && !tags.includes(n)) tags.push(n);
    }
    const leadsTo = r.leadsTo === 'mission' || r.leadsTo === 'fact' ? r.leadsTo : 'none';
    const rumor: DirectorOutput['rumors'][number] = { text, leadsTo, tags };
    if (leadsTo === 'mission') {
      const lead = r.lead;
      if (!isObj(lead) || typeof lead.templateId !== 'string' || typeof lead.regionId !== 'string') return reject(part, 'a mission lead needs a lead');
      const problem = checkOffer(state, reg, { templateId: lead.templateId, regionId: lead.regionId, source: 'rumor' });
      if (problem) return reject(part, `bad lead: ${problem}`);
      rumor.lead = { templateId: lead.templateId, regionId: lead.regionId };
    }
    room--;
    output.rumors.push(rumor);
  });
  if (only) return { output, rejected };

  let newThread = false;
  const statusNow = new Map<string, Thread['status']>(state.world.threads.map((t) => [t.id, t.status]));
  let openCount = openThreads(state);
  const flagCount = new Map<string, number>(state.world.threads.map((t) => [t.id, t.flags.length]));
  list('threadUpdates').forEach((u, i) => {
    const part = `threadUpdates[${i}]`;
    if (!isObj(u) || typeof u.threadId !== 'string') return reject(part, 'not a thread update');
    const isNew = u.threadId === 'new';
    const update: DirectorOutput['threadUpdates'][number] = { threadId: u.threadId };
    if (isNew) {
      const title = plain(u.title, 60);
      if (title === '') return reject(part, 'a new thread needs a title');
      if (newThread) return reject(part, 'at most one new thread per tick');
      if (openCount >= TUNING.world.threadsOpenMax) return reject(part, `already ${TUNING.world.threadsOpenMax} open threads (the limit)`);
      update.title = title;
    } else {
      if (u.threadId.startsWith('spine:')) return reject(part, 'spine threads belong to the story');
      if (!state.world.threads.some((t) => t.id === u.threadId)) return reject(part, `unknown thread "${u.threadId}"`);
    }
    if (u.status !== undefined) {
      if (typeof u.status !== 'string' || !(THREAD_STATUSES as readonly string[]).includes(u.status)) return reject(part, 'unknown thread status');
      const next = u.status as ThreadStatus;
      if (!isNew) {
        const was = statusNow.get(u.threadId);
        // reopening a closed thread uses an open slot like a new one
        if (was !== 'open' && next === 'open' && openCount >= TUNING.world.threadsOpenMax) return reject(part, `already ${TUNING.world.threadsOpenMax} open threads (the limit)`);
        if (was !== 'open' && next === 'open') openCount++;
        if (was === 'open' && next !== 'open') openCount--;
        statusNow.set(u.threadId, next);
      }
      update.status = next;
    }
    const base = isNew ? 0 : flagCount.get(u.threadId) ?? 0;
    let have = base;
    const flags: Array<{ slug: string; description: string }> = [];
    (Array.isArray(u.addFlags) ? u.addFlags : []).forEach((f, j) => {
      const fp = `${part}.addFlags[${j}]`;
      if (j >= 3) return reject(fp, 'at most 3 flags per update');
      const s = typeof f === 'string' ? slug(f) : isObj(f) && typeof f.slug === 'string' ? slug(f.slug) : '';
      const description = typeof f === 'string' ? plain(f, TUNING.director.reasonMax) : isObj(f) ? plain(f.description, TUNING.director.reasonMax) : '';
      if (s === '') return reject(fp, 'the flag has no usable name');
      if (have >= TUNING.world.threadFlagsMax) return reject(fp, `a thread holds at most ${TUNING.world.threadFlagsMax} flags`);
      have++;
      flags.push({ slug: s, description: description || s });
    });
    if (flags.length > 0) update.addFlags = flags;
    if (!isNew) flagCount.set(u.threadId, have);
    if (isNew) {
      newThread = true;
      if ((update.status ?? 'open') === 'open') openCount++;
    }
    output.threadUpdates.push(update);
  });

  let total = 0;
  const perClock = new Map<string, number>();
  list('clockAdvances').forEach((c, i) => {
    const part = `clockAdvances[${i}]`;
    if (!isObj(c) || typeof c.clockId !== 'string') return reject(part, 'not a clock advance');
    const clock = state.world.clocks.find((x) => x.id === c.clockId);
    if (!clock) return reject(part, `unknown clock "${c.clockId}"`);
    const repeat = reg.clocks.get(clock.id)?.repeat === true;
    if (clock.filled >= clock.segments && !repeat) return reject(part, 'the clock is full');
    if (c.by !== 1 && c.by !== 2) return reject(part, 'by must be exactly 1 or 2');
    const by = c.by;
    if ((perClock.get(clock.id) ?? 0) + by > TUNING.director.maxClockPerClock) return reject(part, `at most ${TUNING.director.maxClockPerClock} on one clock`);
    if (total + by > TUNING.director.maxClockTotal) return reject(part, `at most ${TUNING.director.maxClockTotal} clock segments in all`);
    perClock.set(clock.id, (perClock.get(clock.id) ?? 0) + by);
    total += by;
    output.clockAdvances.push({ clockId: clock.id, by, reason: plain(c.reason, TUNING.director.reasonMax) });
  });
  return { output, rejected };
}

// ---------------------------------------------------------------------------------------------
// Application

/** Metadata stays small: the newest 20 closed and 6 dormant threads are kept (spine and open threads never go). */
export function trimThreads(draft: CampaignState): void {
  const keep = (status: (t: Thread) => boolean, max: number): Set<Thread> => {
    const list = draft.world.threads.filter((t) => !t.id.startsWith('spine:') && status(t));
    return new Set(list.slice(Math.max(0, list.length - max)));
  };
  const closed = keep((t) => t.status === 'resolved' || t.status === 'failed', 20);
  const dormant = keep((t) => t.status === 'dormant', 6);
  draft.world.threads = draft.world.threads.filter((t) => {
    if (t.id.startsWith('spine:')) return true;
    if (t.status === 'resolved' || t.status === 'failed') return closed.has(t);
    if (t.status === 'dormant') return dormant.has(t);
    return true;
  });
}

export function applyDirectorOutput(draft: CampaignState, ctx: EngineCtx, out: DirectorOutput, opts: { fallback?: boolean } = {}): EngineEvent[] {
  const events: EngineEvent[] = [];
  let threads = 0;
  for (const u of out.threadUpdates) {
    let thread = draft.world.threads.find((t) => t.id === u.threadId);
    if (u.threadId === 'new') {
      thread = {
        id: nextId(draft, 't'), title: u.title ?? 'Untitled', status: u.status ?? 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: draft.day,
      };
      draft.world.threads.push(thread);
      events.push({ type: 'thread_changed', threadId: thread.id, status: thread.status });
    } else if (thread && u.status !== undefined && thread.status !== u.status) {
      thread.status = u.status;
      events.push({ type: 'thread_changed', threadId: thread.id, status: thread.status });
    }
    if (!thread) continue;
    for (const f of u.addFlags ?? []) {
      const id = `thread:${thread.id}:${f.slug}`;
      if (thread.flags.length >= TUNING.world.threadFlagsMax || thread.flags.some((x) => x.id === id)) continue;
      thread.flags.push({ id, description: f.description });
    }
    threads++;
  }

  trimThreads(draft);
  let beat: string | null = null;
  const proposal = out.storyBeatProposal;
  if (proposal && checkProposal(draft, ctx.registries, proposal.beatId, 0) === null) {
    events.push(...proposeBeat(draft, ctx, proposal.beatId, proposal.framing));
    beat = proposal.beatId;
  }

  let commandTaken = false;
  for (const o of out.missionOffers) {
    const source = o.spineBeat !== undefined ? 'story' : directorSource(draft, ctx.registries, o.templateId, commandTaken);
    if (source === null) continue;
    const made = offerMission(draft, ctx, { ...o, source });
    events.push(...made.events);
    if (made.mission && source === 'command') commandTaken = true;
  }
  const offers = events.filter((e) => e.type === 'mission_offered').length;

  let rumors = 0;
  for (const r of out.rumors) {
    const posted = postRumor(draft, ctx, r);
    if (!posted) continue;
    events.push(rumorPostedEvent(posted));
    rumors++;
  }

  let clocks = 0;
  for (const c of out.clockAdvances) {
    const moved = advanceClock(draft, ctx, c.clockId, c.by, c.reason || 'director');
    events.push(...moved);
    if (moved.some((e) => e.type === 'clock_advanced')) clocks++;
  }
  events.push({ type: 'director_applied', offers, rumors, threads, clocks, beat, ...(opts.fallback ? { fallback: true } : {}) });
  return events;
}

/** Validates, applies and closes the open request with `raw` (a model answer or the fallback). Throws on a stale id. */
export function answerRequest(
  draft: CampaignState, ctx: EngineCtx, requestId: string | undefined, raw: (pending: DirectorRequest) => unknown,
  opts: { cooldownDays?: number; fallback?: boolean } = {},
): EngineEvent[] {
  const pending = draft.world.director?.pending;
  if (!pending || pending.id !== requestId) throw new Error('Stale director answer.');
  const cooldownDays = Number.isFinite(opts.cooldownDays) ? clamp(Math.round(opts.cooldownDays!), 1, 14) : TUNING.director.beatCooldownDays;
  const { output, rejected } = validateDirectorOutput(draft, ctx.registries, raw(pending), {
    cooldownDays, only: pending.reason === 'scout' ? 'rumors' : undefined,
  });
  const events = applyDirectorOutput(draft, ctx, output, { fallback: opts.fallback });
  delete draft.world.director!.pending;
  draft.world.director!.lastTickDay = draft.day;
  if (rejected.length > 0) events.push({ type: 'director_rejected', rejected });
  return events;
}

/** Opens a request for the model unless one is already open. */
export function openRequest(draft: CampaignState, reason: DirectorRequest['reason']): EngineEvent[] {
  const director = (draft.world.director ??= {});
  if (director.pending) return [];
  director.seq = (director.seq ?? 0) + 1;
  director.pending = { id: `d${director.seq}`, reason, day: draft.day };
  return [{ type: 'director_requested', id: director.pending.id, reason }];
}

// ---------------------------------------------------------------------------------------------
// Fallback: the world keeps moving without a model

/** Region point-of-interest templates are standing runs, never board missions. */
function poiTemplates(reg: Registries): Set<string> {
  return new Set([...reg.regions.values()].flatMap((r) => (r.pointsOfInterest as Array<{ templateId: string }>).map((p) => p.templateId)));
}

const pairs = (state: CampaignState, reg: Registries, source: MissionSource, accept: (t: Entry) => boolean): MissionOffer[] => {
  const known = knownRegions(state, reg);
  const out: MissionOffer[] = [];
  for (const t of reg.missionTemplates.values()) {
    if (!accept(t)) continue;
    for (const region of known) {
      const offer: MissionOffer = { templateId: String(t.id), regionId: String(region.id), source };
      if (checkOffer(state, reg, offer) === null) out.push(offer);
    }
  }
  return out;
};

/**
 * What the director does with no model: a command mission every few days while none is open, one side mission when
 * the board has room, one authored rumor line, +1 on a region clock every second day and the current spine beat as
 * soon as it may start. Built only from registry ids and authored texts; deterministic for a given state and rng.
 */
export function fallbackOutput(state: CampaignState, reg: Registries, rng: Rng): DirectorOutput {
  const out = emptyOutput();
  const beat = currentBeat(state, reg);
  if (beat && checkProposal(state, reg, beat.id, TUNING.director.beatCooldownDays) === null) {
    out.storyBeatProposal = { beatId: beat.id, framing: '' };
  }

  const all = [...state.missions.offered, ...state.missions.active, ...state.missions.completed];
  const lastCommand = Math.max(-Infinity, ...all.filter((m) => m.source === 'command').map((m) => m.offeredDay));
  const commandOpen = [...state.missions.offered, ...state.missions.active].some((m) => m.source === 'command');
  const taken = new Set<string>();
  const take = (o: MissionOffer | undefined): void => {
    if (!o) return;
    taken.add(`${o.templateId}|${o.regionId}`);
    out.missionOffers.push({ templateId: o.templateId, regionId: o.regionId });
  };
  if (!commandOpen && state.day - lastCommand >= TUNING.world.commandEveryDays) {
    const options = pairs(state, reg, 'command', (t) => (t.sources as string[]).includes('command'));
    if (options.length > 0) take(rng.pick(options));
  }
  if (boardRoom(state, reg) - out.missionOffers.length > 0 && out.missionOffers.length < TUNING.director.maxOffers) {
    const pois = poiTemplates(reg);
    const options = pairs(state, reg, 'side', (t) => !pois.has(String(t.id)) && (t.sources as string[]).includes('side') && !(t.sources as string[]).includes('command'))
      .filter((o) => !taken.has(`${o.templateId}|${o.regionId}`));
    if (options.length > 0) take(rng.pick(options));
  }

  if (rumorRoom(state, reg) > 0) {
    const used = new Set(state.rumors.map((r) => r.text));
    const open = knownRegions(state, reg)
      .map((r) => ({ id: String(r.id), lines: (r.rumors as string[]).filter((l) => !used.has(l)) }))
      .filter((r) => r.lines.length > 0);
    if (open.length > 0) {
      const region = rng.pick(open);
      out.rumors.push({ text: rng.pick(region.lines), leadsTo: 'none', tags: [region.id] });
    }
  }

  if (state.day % 2 === 0) {
    const options = state.world.clocks.filter((c) => c.regionId !== undefined && c.filled < c.segments);
    if (options.length > 0) out.clockAdvances.push({ clockId: rng.pick(options).id, by: 1, reason: 'Pressure builds in the region.' });
  }
  return out;
}

