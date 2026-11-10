import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import { completeMission } from '../../../src/engine/world/missions';
import {
  beatReady, checkProposal, completeBeat, currentBeat, isOpenEnded, proposeBeat, spineOf,
} from '../../../src/engine/world/spine';
import { campaign, ctxOf, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const COOLDOWN = TUNING.director.beatCooldownDays;
const at = (over: (s: CampaignState) => void): CampaignState => {
  const s = structuredClone(base);
  over(s);
  return s;
};
const propose = (s: CampaignState, beatId: string, framing = 'Framing text.') => {
  const draft = structuredClone(s);
  const events = proposeBeat(draft, ctxOf(draft, reg), beatId, framing);
  return { draft, events };
};
function activate(draft: CampaignState, spineBeat: string) {
  const i = draft.missions.offered.findIndex((m) => m.spineBeat === spineBeat);
  const [m] = draft.missions.offered.splice(i, 1);
  m.status = 'active';
  draft.missions.active.push(m);
  return m;
}
const beat = (s: CampaignState, i: number) => spineOf(s, reg)[i];

describe('spine reading', () => {
  it('spineOf is the start spine, empty without a start; currentBeat follows spineProgress', () => {
    expect(spineOf(base, reg).map((b) => b.id)).toEqual(['beat_1', 'beat_2', 'beat_3', 'beat_4', 'beat_5', 'beat_6']);
    expect(spineOf(at((s) => { delete s.world.startId; }), reg)).toEqual([]);
    expect(currentBeat(base, reg)?.id).toBe('beat_1');
    expect(currentBeat(at((s) => { s.world.spineProgress = 3; }), reg)?.id).toBe('beat_4');
    expect(currentBeat(at((s) => { delete s.world.startId; }), reg)).toBeNull();
  });

  it('a beat is not ready before its minDay, flags and clearance', () => {
    const s = at((x) => { x.world.spineProgress = 3; x.day = 5; });
    const b4 = beat(s, 3); // minDay 12, clearanceMin 1
    expect(beatReady(s, reg, b4)).toBe(false);
    s.day = 12;
    expect(beatReady(s, reg, b4)).toBe(false); // clearance still 0
    s.world.clearanceTier = 1;
    expect(beatReady(s, reg, b4)).toBe(true);
    // beat_1 has no conditions at all
    expect(beatReady(base, reg, beat(base, 0))).toBe(true);
  });

  it('flagsAll, flagsNone and threads are read from world and commander flags and thread states', () => {
    const b = { id: 'x', title: 't', goal: 'g', conditions: { flagsAll: ['evidence_buried'], flagsNone: ['evidence_sold_aurum'], threads: [{ id: 't1', status: 'resolved' as const }] } };
    const s = structuredClone(base);
    expect(beatReady(s, reg, b)).toBe(false);
    s.commander.flags.push('evidence_buried');
    expect(beatReady(s, reg, b)).toBe(false); // thread missing
    s.world.threads.push({ id: 't1', title: 'T', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
    expect(beatReady(s, reg, b)).toBe(false);
    s.world.threads[0].status = 'resolved';
    expect(beatReady(s, reg, b)).toBe(true);
    s.world.flags.push('evidence_sold_aurum');
    expect(beatReady(s, reg, b)).toBe(false);
  });
});

describe('proposals', () => {
  it('proposing a beat that is not the current one, or not ready, is refused', () => {
    expect(checkProposal(base, reg, 'beat_1', COOLDOWN)).toBeNull();
    expect(checkProposal(base, reg, 'beat_2', COOLDOWN)).toMatch(/current/i);
    expect(checkProposal(base, reg, 'ghost', COOLDOWN)).toMatch(/current/i);
    const s = at((x) => { x.world.spineProgress = 1; x.day = 2; });
    expect(checkProposal(s, reg, 'beat_2', COOLDOWN)).toMatch(/ready|condition/i);
    s.day = 4;
    expect(checkProposal(s, reg, 'beat_2', COOLDOWN)).toBeNull();
    expect(() => propose(base, 'beat_2')).toThrow();
  });

  it('a beat already proposed cannot be proposed again', () => {
    const p = propose(base, 'beat_1');
    expect(checkProposal(p.draft, reg, 'beat_1', 0)).toMatch(/already/i);
  });

  it('a second proposal within 3 days is refused and allowed on day 4', () => {
    expect(COOLDOWN).toBe(3);
    const s = at((x) => { x.world.spineProgress = 1; x.day = 3; x.world.spine = { lastProposalDay: 1 }; });
    s.day = 3; // beat_2 needs day 4 anyway: use a beat without minDay to isolate the cooldown
    const free = at((x) => { x.world.spineProgress = 0; x.world.spine = { lastProposalDay: 1 }; x.day = 3; });
    expect(checkProposal(free, reg, 'beat_1', COOLDOWN)).toMatch(/cooldown|days/i);
    free.day = 4;
    expect(checkProposal(free, reg, 'beat_1', COOLDOWN)).toBeNull();
    expect(checkProposal(s, reg, 'beat_2', 0)).toMatch(/ready|condition/i);
  });

  it('proposing opens the spine thread, stores the framing as a fact and offers the story mission', () => {
    const p = propose(base, 'beat_1', 'The first sample waits in the east wing. Vesper wants it.');
    const d = p.draft;
    expect(d.world.spine).toEqual({ proposed: 'beat_1', proposedDay: d.day, lastProposalDay: d.day });
    const thread = d.world.threads.find((t) => t.id === 'spine:beat_1')!;
    expect(thread).toMatchObject({ title: beat(base, 0).title, status: 'open', createdDay: d.day });
    const fact = d.memory.facts.find((f) => f.text.startsWith('The first sample waits'))!;
    expect(fact).toMatchObject({ about: [], importance: 4, tags: ['spine'], knownBy: ['*'] });
    expect(d.memory.chronicle.some((c) => c.text.startsWith('The first sample waits'))).toBe(true);
    expect(d.missions.offered).toHaveLength(1);
    expect(d.missions.offered[0]).toMatchObject({
      source: 'story', templateId: 'tpl_vesper_beat_1', regionId: 'quarantine_d7', spineBeat: 'beat_1', threadId: 'spine:beat_1',
    });
    expect(d.missions.offered[0].deadlineDay).toBeUndefined();
    expect(ofType(p.events, 'beat_proposed')).toEqual([{ type: 'beat_proposed', beatId: 'beat_1', framing: 'The first sample waits in the east wing. Vesper wants it.' }]);
    expect(ofType(p.events, 'mission_offered')).toHaveLength(1);
  });

  it('framing is cut to 60 words; an empty one becomes the beat goal', () => {
    const long = Array.from({ length: 90 }, (_, i) => `w${i}`).join(' ');
    const cut = propose(base, 'beat_1', long);
    const framing = String(ofType(cut.events, 'beat_proposed')[0].framing);
    expect(framing.split(' ')).toHaveLength(TUNING.director.framingWords);
    expect(cut.draft.memory.chronicle.some((c) => c.text === framing)).toBe(true);
    // the fact keeps the usual fact-length cap
    expect(cut.draft.memory.facts.find((f) => f.tags.includes('spine'))!.text.length).toBeLessThanOrEqual(TUNING.memory.factTextMax);
    const empty = propose(base, 'beat_1', '   ');
    expect(empty.draft.memory.facts.find((f) => f.tags.includes('spine'))!.text).toBe(beat(base, 0).goal);
  });

  it('does not offer the story mission twice when one is already on the board or active', () => {
    const first = propose(base, 'beat_1');
    const draft = first.draft;
    draft.world.spine = {};
    expect(ofType(proposeBeat(draft, ctxOf(draft, reg), 'beat_1', 'Again.'), 'mission_offered')).toEqual([]);
    expect(draft.missions.offered).toHaveLength(1);
  });
});

describe('completion', () => {
  it('completing the story mission completes the beat, runs onComplete and advances spineProgress', () => {
    const p = propose(base, 'beat_1');
    const d = p.draft;
    const m = activate(d, 'beat_1');
    expect(d.world.clearanceTier ?? 0).toBe(0);
    const events = completeMission(d, ctxOf(d, reg), m.id);
    expect(d.world.spineProgress).toBe(1);
    expect(d.world.spine!.proposed).toBeUndefined();
    expect(d.world.clearanceTier).toBe(1); // beat_1 onComplete
    expect(d.world.threads.find((t) => t.id === 'spine:beat_1')!.status).toBe('resolved');
    expect(ofType(events, 'beat_completed')).toEqual([{ type: 'beat_completed', beatId: 'beat_1', progress: 1 }]);
    expect(currentBeat(d, reg)?.id).toBe('beat_2');
    // a failed mission does not complete the beat
    const q = propose(base, 'beat_1');
    expect(q.draft.world.spineProgress).toBe(0);
  });

  it('a mission without a spine beat does not touch the spine', () => {
    const d = propose(base, 'beat_1').draft;
    d.missions.active.push({ ...structuredClone(d.missions.offered[0]), id: 'side1', spineBeat: undefined, templateId: 'tpl_sweep', source: 'command', status: 'active' });
    completeMission(d, ctxOf(d, reg), 'side1');
    expect(d.world.spineProgress).toBe(0);
  });

  it('a flag-kind beat completes when the flag is set by an event option', () => {
    const s = at((x) => { x.world.spineProgress = 4; x.day = 16; x.world.spine = { lastProposalDay: 1 }; });
    expect(beat(s, 4).completion).toMatchObject({ kind: 'flag' });
    const p = propose(s, 'beat_5');
    const d = p.draft;
    expect(d.world.spineProgress).toBe(4); // none of the three flags is set yet
    expect(d.world.spine!.proposed).toBe('beat_5');
    expect(d.missions.offered).toEqual([]); // flag beats offer no mission
    const events = applyWorldEffects(d, ctxOf(d, reg), [{ type: 'flag', flagId: 'evidence_buried' }], { kind: 'event', id: 'evt_vesper_choice' });
    expect(d.world.spineProgress).toBe(5);
    expect(d.world.clearanceTier).toBe(3); // beat_5 onComplete
    expect(ofType(events, 'beat_completed')).toHaveLength(1);
    // setting another flag later does not complete anything twice
    expect(ofType(applyWorldEffects(d, ctxOf(d, reg), [{ type: 'flag', flagId: 'evidence_sold_aurum' }], { kind: 'event', id: 'x' }), 'beat_completed')).toEqual([]);
    expect(d.world.spineProgress).toBe(5);
  });

  it('a flag-kind beat whose flag is already set completes when it is proposed', () => {
    const s = at((x) => { x.world.spineProgress = 4; x.day = 16; x.world.flags = ['evidence_buried']; });
    const p = propose(s, 'beat_5');
    expect(p.draft.world.spineProgress).toBe(5);
    expect(ofType(p.events, 'beat_completed')).toHaveLength(1);
  });

  it('an auto beat completes on proposal', () => {
    const s = at((x) => { x.world.spineProgress = 5; x.day = 30; });
    const p = propose(s, 'beat_6');
    expect(p.draft.world.spineProgress).toBe(6);
    expect(ofType(p.events, 'beat_completed')).toEqual([{ type: 'beat_completed', beatId: 'beat_6', progress: 6 }]);
  });

  it('after the last beat currentBeat is null and isOpenEnded is true', () => {
    const s = at((x) => { x.world.spineProgress = 6; });
    expect(currentBeat(s, reg)).toBeNull();
    expect(isOpenEnded(s, reg)).toBe(true);
    expect(isOpenEnded(base, reg)).toBe(false);
    expect(isOpenEnded(at((x) => { delete x.world.startId; }), reg)).toBe(false);
    expect(checkProposal(s, reg, 'beat_6', 0)).toMatch(/current/i);
  });

  it('beats cannot be skipped: completing beat_3 while beat_2 is current throws', () => {
    const s = at((x) => { x.world.spineProgress = 1; x.world.spine = { proposed: 'beat_2' }; });
    const draft = structuredClone(s);
    expect(() => completeBeat(draft, ctxOf(draft, reg), 'beat_3')).toThrow();
    expect(() => completeBeat(structuredClone(base), ctxOf(structuredClone(base), reg), 'beat_1')).toThrow(); // current but not proposed
  });

  it('onComplete of a beat that sets its own flag cannot recurse', () => {
    const s = at((x) => { x.world.spineProgress = 4; x.day = 16; x.world.flags = ['evidence_buried']; });
    expect(() => propose(s, 'beat_5')).not.toThrow();
  });

  it('beat_3 completion offers an incoming unit', () => {
    const s = at((x) => { x.world.spineProgress = 2; x.day = 8; });
    const d = propose(s, 'beat_3').draft;
    const m = activate(d, 'beat_3');
    completeMission(d, ctxOf(d, reg), m.id);
    expect(d.world.incomingUnits).toBe(1);
    expect(d.world.spineProgress).toBe(3);
  });
});
