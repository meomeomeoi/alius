// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../src/engine/actions/dynamic';
import '../src/engine/actions/warden';
import '../src/engine/actions/scene';
import { DRAFT_MARKER, plainDraft } from '../src/content/draft';
import type { Registries } from '../src/content/types';
import { dynamicDirectives, offerDirective, offerReplyLine } from '../src/dynamic/directives';
import type { EngineEvent } from '../src/engine/dispatch';
import { addCompromat } from '../src/engine/dynamic/compromat';
import { reactToDynamic } from '../src/engine/dynamic/reactions';
import { addSign, knowInstantly } from '../src/engine/dynamic/knowledge';
import { blankDynamic, newDynamicCampaign } from '../src/engine/dynamic/state';
import type { Frame, ProfileStyle, Witness } from '../src/engine/dynamic/types';
import { addFact } from '../src/engine/memory/facts';
import { rememberEvents } from '../src/engine/memory/remember';
import { Rng, seedRng } from '../src/engine/rng';
import { buildCampaign } from '../src/engine/setup';
import type { CampaignState, Fact } from '../src/engine/state/types';
import { startRemoval, wardenOf } from '../src/engine/warden';
import { wardenDirectives } from '../src/warden/directives';
import { h } from '../src/ui/dom';
import { dynamicNotices, oversightNotice } from '../src/ui/dynamic/notices';
import { renderClaimCard, renderExitCard, renderMilestoneCard, renderReturnCard } from '../src/ui/dynamic/cards';
import { wardenNotice } from '../src/ui/warden/notices';
import { loadCore, unitSetup } from './helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const MARKER = /AUTHOR TO WRITE/i;
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

describe('plainDraft', () => {
  it('strips a leading marker, case-insensitive, with the whitespace around it', () => {
    expect(plainDraft('AUTHOR TO WRITE: She waits.')).toBe('She waits.');
    expect(plainDraft('  author to write:   She waits. ')).toBe('She waits.');
    expect(plainDraft('Author To Write:\n{name} waits.')).toBe('{name} waits.');
    expect(DRAFT_MARKER).toBe('AUTHOR TO WRITE:');
  });

  it('strips the marker of a part inside a composed text, and leaves any other text untouched', () => {
    expect(plainDraft('AUTHOR TO WRITE: Ann knows. AUTHOR TO WRITE: She is drawn to it.')).toBe('Ann knows. She is drawn to it.');
    expect(plainDraft('  no marker here ')).toBe('  no marker here ');
    expect(plainDraft('')).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------
// The state: a LEASHSWAP campaign (Bea holds the controller) with a dynamic holder (Ann) and everything a directive or a fact can come from

const practise = (s: CampaignState, id: string, over: { witness?: Witness; style?: ProfileStyle; lead?: 'dominant' | 'balanced' | 'yielding' } = {}): void => {
  unitOf(s, id).bond = {
    leadStyle: over.lead ?? 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: over.witness ?? 'indifferent' } }, style: { primary: over.style ?? 'cold' }, audience: 'indifferent',
      inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
};

function swap(seed = 4): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
}

/** Ann holds at `frame` with every domain; the others practise too. A scene with `present` is open. */
function world(frame: Frame = 'role', present: string[] = [ANN, BEA, CAT]): CampaignState {
  const s = swap();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  practise(s, ANN, { style: 'possessive' });
  practise(s, BEA, { witness: 'dislikes', lead: 'balanced' });
  practise(s, CAT, { witness: 'drawn', lead: 'balanced' });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: 70, domains: [...reg.dynamicDomains.keys()].map((id) => ({ id, since: s.day })), refusals: [s.day] };
  s.scene = { id: 's1', participants: present, day: s.day, slot: s.slot, locationId: 'comms_room', mode: 'private', origin: 'event', consumesSlot: false, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
  return s;
}

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(seedRng(3)), state: s });

describe('directives', () => {
  /** Every directive a model can be given by the dynamic (P15) or the warden (P13): derived ones from a state each, event-driven ones from their events. */
  function allDirectives(): Array<{ id: string; text: string }> {
    const out: Array<{ id: string; text: string }> = [];
    // holder (milestone waiting, her compromat, a refusal), command, leash block, witness at both levels, regard, aftermath, disappointed
    const s = world();
    s.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: [...reg.dynamicMilestones.keys()][0], day: s.day, form: 'scene' });
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged in front of the mess hall.', []);
    s.memory.facts.push({ id: 'legacy', about: ['commander'], text: 'AUTHOR TO WRITE: a fact an older save kept with the marker.', tags: ['compromat', 'holder:unit_ann'], importance: 4, day: s.day, knownBy: [ANN], hiddenFromCommander: true } as Fact);
    s.relations[BEA].regard = 25;
    s.relations[CAT].regard = 5;
    s.dynamic!.noted = { disappointed: { [CAT]: s.day } };
    for (let i = 0; i < 3; i++) addSign(s, ctxOf(s), BEA, ANN, 'protocol_slip');
    knowInstantly(s, ctxOf(s), CAT, ANN, 'holder_tells');
    unitOf(s, BEA).bond = unitOf(s, BEA).bond; // (Bea only suspects)
    out.push(...dynamicDirectives(s, reg, [ANN, BEA, CAT]), ...wardenDirectives(s, reg));
    // her aftermath (stage 0), on a woman who has left
    const left = world('equal', [CAT]);
    left.relations[CAT].dynamic = { ...blankDynamic(left.day), aftermath: { id: 'da1', kind: 'grief', stage: 0, untilDay: left.day + 20 } };
    out.push(...dynamicDirectives(left, reg, [CAT]));
    // the other reactions a woman who knows may have: respects and competes (by her manner), indifferent
    for (const [style, witness, frame] of [['ritual', 'indifferent', 'play'], ['possessive', 'indifferent', 'play'], ['cold', 'indifferent', 'equal']] as const) {
      const r = world('role', [ANN, CAT]);
      practise(r, CAT, { style, witness, lead: 'dominant' });
      r.relations[CAT].dynamic = { ...blankDynamic(r.day), frame, hold: 40 };
      knowInstantly(r, ctxOf(r), CAT, ANN, 'holder_tells');
      out.push(...dynamicDirectives(r, reg, [ANN, CAT]));
    }
    const drawn = world('role', [CAT]);
    for (const w of ['dislikes', 'indifferent'] as const) {
      practise(drawn, CAT, { witness: w });
      knowInstantly(drawn, ctxOf(drawn), CAT, ANN, 'holder_tells');
      out.push(...dynamicDirectives(drawn, reg, [CAT]));
    }
    // a probe
    const probe = world('equal', [ANN]);
    probe.relations[ANN].dynamic!.probes = { pending: { axis: [...reg.probeAxes.keys()][0], tier: 1, day: probe.day }, lastDay: probe.day, answers: [], issued: 1 };
    probe.dynamic!.queue = [ANN];
    out.push(...dynamicDirectives(probe, reg, [ANN]));
    // the offer lines, for every answer the engine can give, and the line of a DM reply
    const o = world('role', [ANN]);
    for (const answer of ['accepted', 'corrected', 'mocked', 'refused', 'tonight']) {
      for (const extra of [{}, { conditions: true }, { kind: true }, { corrected: [...reg.worshipTargets.keys()][0] }]) {
        const d = offerDirective({ type: 'offer_made', unitId: ANN, answer, what: 'a gift', ...extra }, o, reg);
        if (d !== null) out.push(d);
      }
    }
    o.dynamic!.open.offers.push({ id: 'do1', unitId: ANN, day: o.day, composition: [], answer: 'accepted', dmAt: 0 });
    o.dms[ANN] = [{ from: 'commander', text: 'x' } as never];
    const reply = offerReplyLine(o, reg, ANN);
    if (reply !== null) out.push({ id: 'dm_reply', text: reply });
    // the warden's lines: romance, warning (final), argue
    const w = world('equal', [BEA]);
    w.relations[BEA].stateId = String([...reg.relationshipStates.values()].find((st) => st.bondTier === 'romantic')!.id);
    wardenOf(w)!.warnings.push({ level: 1, day: w.day }, { level: 2, day: w.day });
    wardenOf(w)!.defiance = 80;
    wardenOf(w)!.override = { id: 'ov1', order: { kind: 'activity', activityId: 'train', companionId: ANN }, altLabel: 'Train with Bea', day: w.day, slot: w.slot, context: 'base', arguing: 's1' } as never;
    out.push(...wardenDirectives(w, reg));
    // oversight runs the controller: no warden
    const remote = swap();
    startRemoval(remote, ctxOf(remote), 'hack');
    out.push(...wardenDirectives(remote, reg));
    return out;
  }

  it('the fixture reaches every kind of directive of the dynamic and the warden', () => {
    const ids = allDirectives().map((d) => d.id);
    for (const prefix of ['dynamic:unit_', 'dynamic:probe:', 'dynamic:aftermath:', 'dynamic:leash_block:', 'dynamic:command:', 'dynamic:witness:', 'dynamic:disappointed:', 'dynamic:regard:', 'dynamic:offer:']) {
      expect(ids.some((id) => id.startsWith(prefix)), prefix).toBe(true);
    }
    for (const id of ['warden:reveal', 'warden:argue', 'warden:romance', 'warden:warning', 'warden:remote', 'dm_reply']) expect(ids, id).toContain(id);
  });

  it('no directive carries the draft marker', () => {
    const all = allDirectives();
    expect(all.length).toBeGreaterThan(15);
    for (const d of all) expect(d.text, d.id).not.toMatch(MARKER);
  });
});

// ---------------------------------------------------------------------------------------------

describe('notices', () => {
  const eventsOf = (): EngineEvent[] => [
    { type: 'frame_changed', unitId: ANN, from: 'equal', to: 'play', milestoneId: 'first_yes' },
    ...[...reg.aftermaths.keys()].map((kind): EngineEvent => ({ type: 'aftermath_started', unitId: ANN, id: 'da1', kind })),
    { type: 'aftermath_started', unitId: ANN, id: 'da1', kind: 'grief', forced: true },
    { type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'contest' },
    { type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'force' },
    { type: 'domain_lost', unitId: ANN, domainId: 'device', reason: 'slip' },
    { type: 'sworn', unitId: ANN },
    { type: 'leash_blocked', holderId: ANN },
    { type: 'compromat_revealed', unitId: ANN },
    { type: 'compromat_told', unitId: ANN, audience: 'squad' },
    { type: 'compromat_told', unitId: ANN, audience: 'outside' },
    { type: 'oversight_inquiry', stage: 'notice', filled: 3 },
    { type: 'oversight_inquiry', stage: 'notice', filled: 5 },
    ...['reprimand', 'transfer_threat', 'forced_leash', 'reassigned', 'lifted'].map((stage): EngineEvent => ({ type: 'oversight_inquiry', stage, unitId: ANN })),
  ];

  it('a toast and a cut-in of the dynamic and of oversight never show the marker', () => {
    const s = world();
    const events = eventsOf();
    for (const hidden of [false, true]) {
      const notices = dynamicNotices(events, s, reg, { hidden });
      expect(notices.length).toBeGreaterThanOrEqual(15);
      for (const n of notices) {
        expect(n.text, n.title).not.toMatch(MARKER);
        expect(n.cutIn?.text ?? '', n.title).not.toMatch(MARKER);
      }
    }
    for (const e of events) expect(oversightNotice(e, s)?.text ?? '').not.toMatch(MARKER);
  });

  it('the warden\'s notices are plain too', () => {
    const s = world();
    const wardenEvents: EngineEvent[] = [
      { type: 'warden_warning', level: 1 }, { type: 'warden_warning', level: 2 },
      ...[...reg.commanderPunishments.keys()].map((punishmentId): EngineEvent => ({ type: 'commander_punished', punishmentId })),
      { type: 'commander_leashed', kind: 'suppress' }, { type: 'commander_leashed', kind: 'compel' },
      { type: 'leash_cosign_denied' }, { type: 'remote_control_started' },
      { type: 'verdict', outcome: 'cleared' }, { type: 'verdict', outcome: 'convicted' }, { type: 'commander_terminated' },
    ];
    let seen = 0;
    for (const e of wardenEvents) {
      const n = wardenNotice(e, s, reg);
      if (n === null) continue;
      seen++;
      expect(n.text, e.type).not.toMatch(MARKER);
    }
    expect(seen).toBe(wardenEvents.length);
  });
});

// ---------------------------------------------------------------------------------------------

describe('cards', () => {
  it('the milestone, claim, return and exit cards never show the marker', () => {
    const s = world('equal');
    const host = h('div');
    document.body.append(host);
    for (const m of reg.dynamicMilestones.keys()) {
      renderMilestoneCard(host, { state: s, reg, milestone: { id: 'dm1', unitId: ANN, milestoneId: m, day: s.day, form: 'scene' }, onAnswer: vi.fn() });
    }
    for (const d of [undefined, ...reg.dynamicDomains.keys()]) {
      renderClaimCard(host, { state: s, reg, claim: d === undefined ? { id: 'dc1', unitId: ANN, submit: true, day: s.day } : { id: 'dc1', unitId: ANN, domainId: d, day: s.day }, onAnswer: vi.fn() });
    }
    for (const terms of ['lower_band', 'after_punishment'] as const) renderReturnCard(host, { state: s, reg, offer: { id: 'dr1', unitId: ANN, terms, day: s.day }, onAnswer: vi.fn() });
    const exit = h('div');
    renderExitCard(exit, { state: world('role'), reg, unitId: ANN, onExit: vi.fn() });
    host.append(exit);
    expect(host.querySelectorAll('.alius-milestone-text').length).toBe(reg.dynamicMilestones.size);
    expect(host.querySelectorAll('[data-claim]').length).toBeGreaterThan(0);
    expect(host.querySelector('.alius-return-text')).not.toBeNull();
    expect(host.querySelector('.alius-exit-text')).not.toBeNull();
    expect(host.innerHTML).not.toMatch(MARKER); // text and attributes alike
  });
});

// ---------------------------------------------------------------------------------------------

describe('facts', () => {
  /** An event for each memory rule whose text is still a draft, with what its resolver needs. */
  const eventOf = (): Readonly<Record<string, EngineEvent>> => ({
    warden_defied: { type: 'override_answered', overrideId: 'ov1', answer: 'defy', context: 'base' },
    warden_defied_witnessed: { type: 'override_answered', overrideId: 'ov1', answer: 'defy', context: 'combat' },
    warden_punished_commander: { type: 'commander_punished', punishmentId: 'pain_burst', severity: 3 },
    warden_leashed_commander: { type: 'commander_leashed', kind: 'suppress' },
    warden_warned: { type: 'warden_warning', level: 1 },
    warden_removed_hack: { type: 'warden_removed', unitId: BEA, route: 'hack' },
    warden_removed_report: { type: 'warden_removed', unitId: BEA, route: 'report' },
    warden_removed_death: { type: 'warden_removed', unitId: BEA, route: 'death' },
    verdict_cleared: { type: 'verdict', outcome: 'cleared' },
    verdict_convicted: { type: 'verdict', outcome: 'convicted' },
    ally_won: { type: 'ally_won', unitId: CAT },
    dynamic_frame_play: { type: 'frame_changed', unitId: ANN, from: 'equal', to: 'play' },
    dynamic_frame_role: { type: 'frame_changed', unitId: ANN, from: 'play', to: 'role' },
    dynamic_frame_rule: { type: 'frame_changed', unitId: ANN, from: 'role', to: 'rule' },
    dynamic_sworn: { type: 'sworn', unitId: ANN },
    dynamic_milestone_refused: { type: 'milestone_refused', unitId: ANN },
    dynamic_domain_yielded: { type: 'domain_yielded', unitId: ANN, domainId: [...reg.dynamicDomains.keys()][0] },
    dynamic_break: { type: 'dynamic_exit', unitId: ANN, sworn: true },
    dynamic_ended: { type: 'dynamic_exit', unitId: ANN, sworn: false },
    leash_bypass_found: { type: 'leash_bypassed', unitId: ANN, discovered: true },
    aftermath_return_refused: { type: 'aftermath_ended', unitId: ANN, reason: 'refused', kind: 'grief' },
    disappointed: { type: 'disappointed', unitId: ANN },
    offer_mocked: { type: 'offer_made', unitId: ANN, answer: 'mocked', what: 'a gift' },
    offer_corrected: { type: 'offer_made', unitId: ANN, answer: 'corrected', what: 'a gift' },
    zone_revealed: { type: 'zone_revealed', unitId: ANN, targetId: 'feet', what: 'her feet', attitude: 'craves' },
    practice_signed: { type: 'practice_signed', taskId: 'pt1', unitId: ANN, summary: 'carry the roster' },
    false_report_found: { type: 'task_broken', taskId: 'pt1', unitId: ANN, falseReport: true, summary: 'keep Bea off the run' },
    punishment_given: { type: 'punishment_answered', punishmentId: 'pp1', unitId: ANN, answer: 'accept', summary: 'a day without messages' },
    punishment_public: { type: 'punishment_answered', punishmentId: 'pp1', unitId: ANN, answer: 'accept', public: true, present: [ANN, BEA], summary: 'read out before her friends' },
  });

  const draftRules = () => [...reg.memoryRules.values()].filter((r) => MARKER.test(String(r.text)));

  it('every rule whose text is still a draft is covered, and keeps the marker in the data', () => {
    const rules = draftRules();
    expect(rules.length).toBeGreaterThanOrEqual(25);
    expect(rules.map((r) => String(r.id)).sort()).toEqual(Object.keys(eventOf()).sort());
  });

  it('the fact a rule writes never carries the marker', () => {
    for (const rule of draftRules()) {
      const s = world();
      s.scene = { id: 's1', participants: [ANN, BEA], day: s.day } as never;
      const before = s.memory.facts.length;
      rememberEvents(s, [eventOf()[String(rule.id)]], reg);
      const written = s.memory.facts.slice(before).filter((f) => f.tags.some((t) => (rule.tags as string[]).includes(t)));
      expect(written.length, String(rule.id)).toBeGreaterThan(0);
      for (const f of written) expect(f.text, String(rule.id)).not.toMatch(MARKER);
    }
  });

  it('the facts the dynamic writes at its own sites are plain: knowledge, reactions, compromat, offers, the rumor', () => {
    const s = world();
    for (let i = 0; i < 3; i++) addSign(s, ctxOf(s), BEA, ANN, 'protocol_slip');
    knowInstantly(s, ctxOf(s), BEA, ANN, 'holder_tells');
    const rival = world('role', [ANN, CAT]);
    practise(rival, CAT, { style: 'possessive', lead: 'dominant' });
    rival.relations[CAT].dynamic = { ...blankDynamic(rival.day), frame: 'play', hold: 45 };
    reactToDynamic(rival, ctxOf(rival), CAT, ANN);
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander begged.', [BEA]);
    addFact(s, { about: [ANN], text: 'plain', tags: [], importance: 1, day: s.day, knownBy: [ANN] });
    for (const f of [...s.memory.facts, ...rival.memory.facts].filter((x) => x.tags.some((t) => ['dynamic_knowledge', 'reaction', 'compromat'].includes(t)))) expect(f.text).not.toMatch(MARKER);
    expect(s.memory.facts.some((f) => f.tags.includes('dynamic_knowledge'))).toBe(true);
    expect(rival.memory.facts.some((f) => f.tags.includes('reaction'))).toBe(true);
  });
});
