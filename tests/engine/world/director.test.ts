import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import {
  applyDirectorOutput, emptyOutput, fallbackOutput, openRequest, validateDirectorOutput, type DirectorOutput,
} from '../../../src/engine/world/director';
import { completeMission, offerMission } from '../../../src/engine/world/missions';
import { clockById } from '../../../src/engine/world/state';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const COOLDOWN = TUNING.director.beatCooldownDays;
const validate = (raw: unknown, s: CampaignState = base, opts: { cooldownDays?: number; only?: 'rumors' } = {}) =>
  validateDirectorOutput(s, reg, raw, { cooldownDays: opts.cooldownDays ?? COOLDOWN, only: opts.only });
const at = (f: (s: CampaignState) => void): CampaignState => { const s = structuredClone(base); f(s); return s; };
const rich = (): CampaignState => at((s) => { s.base.facilities.comms = 3; });
const offer = (over: Record<string, unknown> = {}) => ({ templateId: 'tpl_sweep', regionId: 'quarantine_d7', ...over });
const rejectedParts = (r: { rejected: Array<{ part: string }> }) => r.rejected.map((x) => x.part);

/** A state with an open request, as the day-end step leaves it. */
function requested(s: CampaignState = base, reason: 'day_end' | 'expedition' | 'scout' = 'day_end'): CampaignState {
  const d = structuredClone(s);
  openRequest(d, reason);
  return d;
}
const apply = (s: CampaignState, output: unknown, extra: Record<string, unknown> = {}, requestId = s.world.director?.pending?.id) =>
  run(s, reg, { type: 'director/apply', payload: { requestId, output, ...extra } });

describe('request lifecycle', () => {
  it('openRequest is a no-op while one is open and numbers requests', () => {
    const d = structuredClone(base);
    const first = openRequest(d, 'day_end');
    expect(first).toEqual([{ type: 'director_requested', id: 'd1', reason: 'day_end' }]);
    expect(d.world.director!.pending).toEqual({ id: 'd1', reason: 'day_end', day: d.day });
    expect(openRequest(d, 'scout')).toEqual([]);
    expect(d.world.director!.pending!.reason).toBe('day_end');
    delete d.world.director!.pending;
    expect(openRequest(d, 'expedition')[0]).toMatchObject({ id: 'd2', reason: 'expedition' });
  });

  it('director/request opens a scout request and nothing else', () => {
    const r = run(base, reg, { type: 'director/request', payload: { reason: 'scout' } });
    expect(ofType(r.events, 'director_requested')).toEqual([{ type: 'director_requested', id: 'd1', reason: 'scout' }]);
    expect(errors(run(base, reg, { type: 'director/request', payload: { reason: 'day_end' } }).events)).toHaveLength(1);
    expect(errors(run(base, reg, { type: 'director/request', payload: {} }).events)).toHaveLength(1);
  });
});

describe('validation: limits', () => {
  it('a third mission offer and a fourth rumor are dropped', () => {
    const s = rich();
    const r = validate({
      missionOffers: [offer(), offer({ regionId: 'kestrel_corridor' }), offer({ regionId: 'ashway' })],
      rumors: [1, 2, 3, 4].map((i) => ({ text: `Rumor ${i}.`, tags: [] })),
    }, s);
    expect(r.output.missionOffers).toHaveLength(2);
    expect(r.output.rumors).toHaveLength(3);
    expect(rejectedParts(r)).toEqual(expect.arrayContaining(['missionOffers[2]', 'rumors[3]']));
    expect(TUNING.director).toMatchObject({ maxOffers: 2, maxRumors: 3 });
  });

  it('rumors beyond today\'s room are dropped', () => {
    const r = validate({ rumors: [{ text: 'One.', tags: [] }, { text: 'Two.', tags: [] }] }); // comms level 1: room 1
    expect(r.output.rumors).toHaveLength(1);
    expect(rejectedParts(r)).toEqual(['rumors[1]']);
  });

  it('unknown template, region, tier, thread and clock ids are rejected with a reason and nothing else is lost', () => {
    const s = rich();
    s.world.threads.push({ id: 't1', title: 'T', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
    const r = validate({
      missionOffers: [offer({ templateId: 'ghost' }), offer({ regionId: 'ghost' }), offer({ rewardsTier: 'ghost' }), offer({ threadId: 'ghost' }), offer({ regionId: 'ashway', rewardsTier: 'tier_2', threadId: 't1' })],
      rumors: [{ text: 'A good rumor.', tags: ['d7'] }],
      threadUpdates: [{ threadId: 'ghost', status: 'resolved' }, { threadId: 't1', status: 'dormant' }],
      clockAdvances: [{ clockId: 'ghost', by: 1, reason: 'x' }, { clockId: 'bloom_d7', by: 1, reason: 'spores' }],
    }, s);
    expect(r.rejected.every((x) => typeof x.reason === 'string' && x.reason.length > 0)).toBe(true);
    // only the first two offers are looked at; the last (valid) one is beyond the limit, so use a separate check below
    expect(rejectedParts(r)).toEqual(expect.arrayContaining(['missionOffers[0]', 'missionOffers[1]', 'threadUpdates[0]', 'clockAdvances[0]']));
    expect(r.output.rumors).toHaveLength(1);
    expect(r.output.threadUpdates).toEqual([{ threadId: 't1', status: 'dormant' }]);
    expect(r.output.clockAdvances).toEqual([{ clockId: 'bloom_d7', by: 1, reason: 'spores' }]);
    const offers = validate({ missionOffers: [offer({ rewardsTier: 'ghost' }), offer({ regionId: 'ashway', rewardsTier: 'tier_2', threadId: 't1' })] }, s);
    expect(offers.output.missionOffers).toHaveLength(1);
    expect(offers.output.missionOffers[0]).toMatchObject({ templateId: 'tpl_sweep', regionId: 'ashway', rewardsTier: 'tier_2', threadId: 't1' });
    expect(rejectedParts(offers)).toEqual(['missionOffers[0]']);
  });

  it('credits or reward amounts in an offer are ignored and the tier decides', () => {
    const r = validate({ missionOffers: [offer({ rewardsTier: 'tier_1', credits: 99999, plyx: 5000, rewards: { credits: 1 }, amount: 7 })], clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r', filled: 8, amount: 50 }] });
    expect(r.output.missionOffers).toHaveLength(1);
    expect(Object.keys(r.output.missionOffers[0]).sort()).not.toEqual(expect.arrayContaining(['credits']));
    for (const k of ['credits', 'plyx', 'rewards', 'amount']) expect(r.output.missionOffers[0]).not.toHaveProperty(k);
    expect(r.output.clockAdvances[0]).not.toHaveProperty('amount');
    expect(r.output.clockAdvances[0]).not.toHaveProperty('filled');
    const d = structuredClone(base);
    applyDirectorOutput(d, ctxOf(d, reg), r.output);
    expect(d.missions.offered[0].rewardsTier).toBe('tier_1');
    // paying out stays with the tier table
    expect(d.resources).toEqual(base.resources);
  });

  it('danger must be an integer 1 to 5; deadlines are clamped to 5 to 14 days', () => {
    expect(validate({ missionOffers: [offer({ danger: 2 })] }).output.missionOffers[0].danger).toBe(2);
    for (const bad of [0, 6, 2.5, 'high', null]) expect(validate({ missionOffers: [offer({ danger: bad })] }).output.missionOffers, String(bad)).toHaveLength(0);
    expect(validate({ missionOffers: [offer({ deadlineDays: 1 })] }).output.missionOffers[0].deadlineDays).toBe(5);
    expect(validate({ missionOffers: [offer({ deadlineDays: 99 })] }).output.missionOffers[0].deadlineDays).toBe(14);
    expect(validate({ missionOffers: [offer({ deadlineDays: 9 })] }).output.missionOffers[0].deadlineDays).toBe(9);
  });

  it('the offer source is command or side, whichever the template allows first; two identical offers do not both pass', () => {
    const side = validate({ missionOffers: [offer({ templateId: 'tpl_hunt', regionId: 'ashway' })] });
    expect(side.output.missionOffers).toHaveLength(1);
    const twice = validate({ missionOffers: [offer(), offer()] });
    expect(twice.output.missionOffers).toHaveLength(1);
    expect(rejectedParts(twice)).toEqual(['missionOffers[1]']);
    // a story-only template is not available without a beat
    expect(validate({ missionOffers: [offer({ templateId: 'tpl_vesper_beat_1' })] }).output.missionOffers).toHaveLength(0);
  });

  it('a rumor lead needs a valid mission lead; tags go through normalizeTag; long text is cut to 40 words', () => {
    const lead = { templateId: 'tpl_recover', regionId: 'ashway' };
    const r = validate({
      rumors: [{ text: 'Lead rumor.', leadsTo: 'mission', lead, tags: ['Ashway Camp', '  ', 5, 'x'.repeat(80)] }],
    }, rich());
    expect(r.output.rumors[0].leadsTo).toBe('mission');
    expect(r.output.rumors[0].lead).toEqual(lead);
    expect(r.output.rumors[0].tags).toEqual(['ashway camp', 'x'.repeat(32)]);
    const bad = validate({ rumors: [{ text: 'No lead.', leadsTo: 'mission' }, { text: 'Bad lead.', leadsTo: 'mission', lead: { templateId: 'ghost', regionId: 'ashway' } }, { text: 'Fact.', leadsTo: 'fact' }] }, rich());
    expect(bad.output.rumors.map((x) => x.text)).toEqual(['Fact.']);
    expect(bad.output.rumors.map((x) => x.leadsTo)).toEqual(['fact']);
    expect(rejectedParts(bad)).toEqual(['rumors[0]', 'rumors[1]']);
    expect(validate({ rumors: [{ text: 'Whatever.', leadsTo: 'weird' }] }).output.rumors[0].leadsTo).toBe('none');
    const long = validate({ rumors: [{ text: Array.from({ length: 70 }, (_, i) => `w${i}`).join(' '), tags: [] }] }).output.rumors[0].text;
    expect(long.split(' ')).toHaveLength(TUNING.director.rumorWords);
    expect(validate({ rumors: [{ text: '   ', tags: [] }] }).output.rumors).toHaveLength(0);
  });
});

describe('validation: clocks', () => {
  it('by: 5 and by: 0 are rejected', () => {
    const r = validate({ clockAdvances: [5, 0, 1.5, -1, '2', null].map((by) => ({ clockId: 'bloom_d7', by, reason: 'r' })) });
    expect(r.output.clockAdvances).toEqual([]);
    expect(r.rejected).toHaveLength(6);
    expect(validate({ clockAdvances: [{ clockId: 'bloom_d7', by: 2, reason: 'r' }] }).output.clockAdvances).toHaveLength(1);
  });

  it('three advances of 2 keep the total within 3; later ones are rejected', () => {
    const adv = (clockId: string, by: number) => ({ clockId, by, reason: 'r' });
    const r = validate({ clockAdvances: [adv('bloom_d7', 2), adv('corridor_quota', 2), adv('sable_operation', 2)] });
    expect(r.output.clockAdvances.map((a) => a.clockId)).toEqual(['bloom_d7']);
    expect(rejectedParts(r)).toEqual(['clockAdvances[1]', 'clockAdvances[2]']);
    const ones = validate({ clockAdvances: ['bloom_d7', 'corridor_quota', 'sable_operation', 'garden_wake'].map((c) => adv(c, 1)) });
    expect(ones.output.clockAdvances.reduce((n, a) => n + a.by, 0)).toBe(TUNING.director.maxClockTotal);
    expect(rejectedParts(ones)).toEqual(['clockAdvances[3]']);
    // at most 2 on one clock
    const same = validate({ clockAdvances: [adv('bloom_d7', 1), adv('bloom_d7', 2)] });
    expect(same.output.clockAdvances).toHaveLength(1);
  });

  it('a full non-repeating clock cannot be advanced; reasons are cut to 120 characters', () => {
    const s = at((x) => { clockById(x, 'bloom_d7')!.filled = 8; });
    expect(validate({ clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r' }] }, s).output.clockAdvances).toEqual([]);
    const long = validate({ clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'x'.repeat(300) }] }).output.clockAdvances[0].reason;
    expect(long).toHaveLength(TUNING.director.reasonMax);
  });
});

describe('validation: spine', () => {
  const propose = (beatId = 'beat_1', framing = 'The first sample waits.') => ({ storyBeatProposal: { beatId, framing } });

  it('a beat that is not current, not ready or inside the cooldown is rejected', () => {
    expect(validate(propose('beat_1')).output.storyBeatProposal).toEqual({ beatId: 'beat_1', framing: 'The first sample waits.' });
    expect(validate(propose('beat_2')).output.storyBeatProposal).toBeUndefined();
    expect(validate(propose('ghost')).rejected[0].part).toBe('storyBeatProposal');
    const early = at((s) => { s.world.spineProgress = 1; s.day = 2; });
    expect(validate(propose('beat_2'), early).output.storyBeatProposal).toBeUndefined();
    const cooling = at((s) => { s.world.spine = { lastProposalDay: s.day - 1 }; });
    expect(validate(propose('beat_1'), cooling).output.storyBeatProposal).toBeUndefined();
    expect(validate(propose('beat_1'), cooling, { cooldownDays: 1 }).output.storyBeatProposal).toBeDefined();
    expect(validate({ storyBeatProposal: 'beat_1' }).output.storyBeatProposal).toBeUndefined();
  });

  it('framing is plain text cut to 60 words', () => {
    const long = Array.from({ length: 90 }, (_, i) => `w${i}`).join(' ');
    expect(validate(propose('beat_1', long)).output.storyBeatProposal!.framing.split(' ')).toHaveLength(TUNING.director.framingWords);
    expect(validate(propose('beat_1', '')).output.storyBeatProposal!.framing).toBe('');
  });

  it('a story offer for a beat that was not proposed is rejected', () => {
    const story = offer({ templateId: 'tpl_vesper_beat_1', spineBeat: 'beat_1' });
    expect(validate({ missionOffers: [story] }).output.missionOffers).toHaveLength(0);
    // proposed earlier (state)
    const proposed = at((s) => { s.world.spine = { proposed: 'beat_1', proposedDay: 1, lastProposalDay: 1 }; });
    expect(validate({ missionOffers: [story] }, proposed).output.missionOffers).toHaveLength(1);
    // proposed in the same answer
    const same = validate({ ...propose('beat_1'), missionOffers: [story] });
    expect(same.output.missionOffers).toHaveLength(1);
    expect(same.output.missionOffers[0].spineBeat).toBe('beat_1');
    // a beat that is not the current one
    expect(validate({ missionOffers: [offer({ templateId: 'tpl_vesper_beat_2', spineBeat: 'beat_2' })] }, proposed).output.missionOffers).toHaveLength(0);
  });
});

describe('validation: threads', () => {
  const thread = (id: string, flags = 0, status: 'open' | 'dormant' = 'open') => ({
    id, title: id, status, flags: Array.from({ length: flags }, (_, i) => ({ id: `thread:${id}:f${i}`, description: 'd' })), relatedUnits: [], relatedRegions: [], createdDay: 1,
  });

  it('a "new" thread needs a title and respects the limit of 6', () => {
    expect(validate({ threadUpdates: [{ threadId: 'new', title: 'Strange lights' }] }).output.threadUpdates).toEqual([{ threadId: 'new', title: 'Strange lights' }]);
    expect(validate({ threadUpdates: [{ threadId: 'new' }] }).output.threadUpdates).toEqual([]);
    expect(validate({ threadUpdates: [{ threadId: 'new', title: '   ' }] }).output.threadUpdates).toEqual([]);
    const five = at((s) => { for (let i = 1; i <= 5; i++) s.world.threads.push(thread(`t${i}`)); });
    expect(validate({ threadUpdates: [{ threadId: 'new', title: 'A' }] }, five).output.threadUpdates).toHaveLength(1);
    const six = at((s) => { for (let i = 1; i <= 6; i++) s.world.threads.push(thread(`t${i}`)); });
    const r = validate({ threadUpdates: [{ threadId: 'new', title: 'A' }] }, six);
    expect(r.output.threadUpdates).toEqual([]);
    expect(r.rejected[0].reason).toMatch(/open threads|limit/i);
    // spine threads and dormant/resolved ones do not count towards the limit
    const spiny = at((s) => { for (let i = 1; i <= 5; i++) s.world.threads.push(thread(`t${i}`)); s.world.threads.push(thread('spine:beat_1'), thread('old', 0, 'dormant')); });
    expect(validate({ threadUpdates: [{ threadId: 'new', title: 'A' }] }, spiny).output.threadUpdates).toHaveLength(1);
    // at most one new thread per tick; long titles are cut to 60
    const two = validate({ threadUpdates: [{ threadId: 'new', title: 'A' }, { threadId: 'new', title: 'B' }] });
    expect(two.output.threadUpdates).toHaveLength(1);
    expect(validate({ threadUpdates: [{ threadId: 'new', title: 'x'.repeat(100) }] }).output.threadUpdates[0].title).toHaveLength(60);
  });

  it('status must be a known one', () => {
    const s = at((x) => { x.world.threads.push(thread('t1')); });
    expect(validate({ threadUpdates: [{ threadId: 't1', status: 'closed' }] }, s).output.threadUpdates).toEqual([]);
    expect(validate({ threadUpdates: [{ threadId: 't1', status: 'failed' }] }, s).output.threadUpdates).toEqual([{ threadId: 't1', status: 'failed' }]);
  });

  it('dynamic flags are namespaced and capped', () => {
    const s = at((x) => { x.world.threads.push(thread('t1', 10)); });
    const r = validate({ threadUpdates: [{ threadId: 't1', addFlags: ['Saw the Signal!', { slug: 'Door open', description: 'The east door is open.' }, 'third one', 'fourth one'] }] }, s);
    // only the first three are looked at, and only 2 more fit under the cap of 12
    expect(r.output.threadUpdates[0].addFlags).toEqual([
      { slug: 'saw_the_signal', description: 'Saw the Signal!' },
      { slug: 'door_open', description: 'The east door is open.' },
    ]);
    expect(rejectedParts(r).some((p) => p.startsWith('threadUpdates[0].addFlags'))).toBe(true);
    const free = validate({ threadUpdates: [{ threadId: 'new', title: 'T', addFlags: ['a b', 'c d', 'e f', 'g h'] }] });
    expect(free.output.threadUpdates[0].addFlags).toHaveLength(3);
    // a slug with nothing usable is dropped
    expect(validate({ threadUpdates: [{ threadId: 'new', title: 'T', addFlags: ['!!!'] }] }).output.threadUpdates[0]?.addFlags ?? []).toEqual([]);
  });

  it('a spine thread cannot be closed by the director', () => {
    const s = at((x) => { x.world.threads.push(thread('spine:beat_1')); });
    const r = validate({ threadUpdates: [{ threadId: 'spine:beat_1', status: 'resolved' }, { threadId: 'spine:beat_1', addFlags: ['x'] }] }, s);
    expect(r.output.threadUpdates).toEqual([]);
    expect(r.rejected).toHaveLength(2);
  });

  it('markup in titles is kept as text and cut to 60 characters', () => {
    const title = `<b>${'x'.repeat(80)}</b>`;
    const r = validate({ missionOffers: [offer({ title, brief: '<script>alert(1)</script>' })] });
    expect(r.output.missionOffers[0].title).toHaveLength(60);
    expect(r.output.missionOffers[0].title?.startsWith('<b>')).toBe(true);
    const d = structuredClone(base);
    applyDirectorOutput(d, ctxOf(d, reg), r.output);
    expect(d.missions.offered[0].title).toBe(r.output.missionOffers[0].title);
    expect(d.missions.offered[0].brief).toBe('<script>alert(1)</script>');
  });
});

describe('validation: garbage', () => {
  it('garbage input (null, a string, arrays of numbers) gives an empty output', () => {
    for (const raw of [null, undefined, 'a string', 42, true, [1, 2, 3], {}, { missionOffers: 'x', rumors: 5, threadUpdates: {}, clockAdvances: null }, { missionOffers: [1, null, 'a', []], rumors: [1, null, []], threadUpdates: [7, null], clockAdvances: [[], 3] }]) {
      const r = validate(raw);
      expect(r.output, JSON.stringify(raw)).toEqual(emptyOutput());
    }
    expect(validate(null).rejected.length).toBeGreaterThan(0);
  });

  it('only: rumors keeps nothing but rumors', () => {
    const r = validate({ missionOffers: [offer()], rumors: [{ text: 'Kept.', tags: [] }], clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r' }], threadUpdates: [{ threadId: 'new', title: 'T' }], storyBeatProposal: { beatId: 'beat_1', framing: '' } }, base, { only: 'rumors' });
    expect(r.output.rumors).toHaveLength(1);
    expect(r.output.missionOffers).toEqual([]);
    expect(r.output.clockAdvances).toEqual([]);
    expect(r.output.threadUpdates).toEqual([]);
    expect(r.output.storyBeatProposal).toBeUndefined();
  });
});

describe('application', () => {
  it('applies thread updates, the beat, offers, rumors and clocks and reports counts', () => {
    const s = requested(rich());
    s.world.threads.push({ id: 't1', title: 'Old', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
    const filled = clockById(s, 'bloom_d7')!.filled;
    const out: DirectorOutput = {
      missionOffers: [{ templateId: 'tpl_sweep', regionId: 'ashway', danger: 2, title: 'Clear the road', brief: 'Clear it.', objectiveNode: 'combat', deadlineDays: 6, rewardsTier: 'tier_2' }],
      rumors: [{ text: 'Somebody saw lights.', tags: ['d7'], leadsTo: 'none' }],
      threadUpdates: [{ threadId: 't1', status: 'resolved', addFlags: [{ slug: 'done', description: 'It is done.' }] }, { threadId: 'new', title: 'Lights over D7', addFlags: [{ slug: 'seen', description: 'Seen twice.' }] }],
      clockAdvances: [{ clockId: 'bloom_d7', by: 2, reason: 'spores' }],
      storyBeatProposal: { beatId: 'beat_1', framing: 'The first sample waits in the east wing.' },
    };
    const r = apply(s, out);
    expect(errors(r.events)).toEqual([]);
    const d = r.state;
    const t1 = d.world.threads.find((t) => t.id === 't1')!;
    expect(t1.status).toBe('resolved');
    expect(t1.flags).toEqual([{ id: 'thread:t1:done', description: 'It is done.' }]);
    const created = d.world.threads.find((t) => t.title === 'Lights over D7')!;
    expect(created).toMatchObject({ status: 'open', createdDay: d.day });
    expect(created.id).toMatch(/^t\d+$/);
    expect(created.flags).toEqual([{ id: `thread:${created.id}:seen`, description: 'Seen twice.' }]);
    expect(d.world.spine!.proposed).toBe('beat_1');
    expect(d.missions.offered.map((m) => m.templateId).sort()).toEqual(['tpl_sweep', 'tpl_vesper_beat_1']);
    expect(d.missions.offered.find((m) => m.templateId === 'tpl_sweep')).toMatchObject({ title: 'Clear the road', danger: 2, rewardsTier: 'tier_2', regionId: 'ashway' });
    expect(d.rumors.map((x) => x.text)).toEqual(['Somebody saw lights.']);
    expect(clockById(d, 'bloom_d7')!.filled).toBe(filled + 2);
    expect(ofType(r.events, 'director_applied')).toEqual([{ type: 'director_applied', offers: 2, rumors: 1, threads: 2, clocks: 1, beat: 'beat_1' }]);
    expect(d.world.director!.pending).toBeUndefined();
    expect(d.world.director!.lastTickDay).toBe(d.day);
    expect(ofType(r.events, 'director_rejected')).toEqual([]);
  });

  it('apply needs the open request id', () => {
    const s = requested();
    expect(String(errors(apply(s, {}, {}, 'd9').events)[0].message)).toBe('Stale director answer.');
    expect(String(errors(apply(base, {}, {}, 'd1').events)[0].message)).toBe('Stale director answer.');
    expect(errors(apply(s, {}).events)).toEqual([]);
    expect(errors(run(s, reg, { type: 'director/apply', payload: { output: {} } }).events)).toHaveLength(1);
  });

  it('a second apply for the same request is refused and changes nothing', () => {
    const s = requested();
    const out = { rumors: [{ text: 'Once only.', tags: [] }], clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r' }] };
    const first = apply(s, out, {}, 'd1');
    expect(errors(first.events)).toEqual([]);
    const again = apply(first.state, out, {}, 'd1');
    expect(String(errors(again.events)[0].message)).toBe('Stale director answer.');
    expect(again.state).toBe(first.state);
    expect(first.state.rumors).toHaveLength(1);
  });

  it('a rejected-everything answer still closes the request', () => {
    const s = requested();
    const r = apply(s, { missionOffers: [offer({ templateId: 'ghost' })], clockAdvances: [{ clockId: 'ghost', by: 9, reason: 'x' }] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.world.director!.pending).toBeUndefined();
    const rejected = ofType(r.events, 'director_rejected')[0].rejected as Array<{ part: string; reason: string }>;
    expect(rejected.map((x) => x.part)).toEqual(['missionOffers[0]', 'clockAdvances[0]']);
    const garbage = apply(requested(), 'nonsense');
    expect(garbage.state.world.director!.pending).toBeUndefined();
    expect(ofType(garbage.events, 'director_rejected')).toHaveLength(1);
    // a new request can follow
    expect(ofType(run(garbage.state, reg, { type: 'director/request', payload: { reason: 'scout' } }).events, 'director_requested')).toHaveLength(1);
  });

  it('scout requests apply only rumors', () => {
    const s = requested(base, 'scout');
    const r = apply(s, { missionOffers: [offer()], rumors: [{ text: 'A scout heard this.', tags: [] }], clockAdvances: [{ clockId: 'bloom_d7', by: 1, reason: 'r' }], storyBeatProposal: { beatId: 'beat_1', framing: '' } });
    expect(r.state.rumors).toHaveLength(1);
    expect(r.state.missions.offered).toEqual([]);
    expect(clockById(r.state, 'bloom_d7')!.filled).toBe(clockById(base, 'bloom_d7')!.filled);
    expect(r.state.world.spine?.proposed).toBeUndefined();
    expect(r.state.world.director!.pending).toBeUndefined();
  });

  it('invalid output never mutates state (deep-equal apart from the closed request)', () => {
    const s = requested();
    const bad = {
      missionOffers: [offer({ templateId: 'ghost' }), { templateId: 5 }], rumors: [{ text: 5 }], threadUpdates: [{ threadId: 'x' }, { threadId: 'new' }],
      clockAdvances: [{ clockId: 'bloom_d7', by: 7, reason: 'r' }], storyBeatProposal: { beatId: 'beat_6', framing: 'x' }, credits: 1e9,
    };
    const r = apply(s, bad);
    const after = structuredClone(r.state);
    expect(after.world.director!.pending).toBeUndefined();
    expect(after.world.director!.lastTickDay).toBe(s.day);
    after.world.director = structuredClone(s.world.director);
    expect(after).toEqual(s);
    // the rng is not touched by a rejected answer either
    expect(r.state.rng).toEqual(s.rng);
  });

  it('beatCooldownDays in the payload is clamped to 1…14', () => {
    const s = requested(at((x) => { x.world.spine = { lastProposalDay: x.day - 1 }; }));
    const out = { storyBeatProposal: { beatId: 'beat_1', framing: 'Go.' } };
    expect(apply(s, out).state.world.spine!.proposed).toBeUndefined(); // default cooldown 3
    expect(apply(s, out, { beatCooldownDays: 1 }).state.world.spine!.proposed).toBe('beat_1');
    expect(apply(s, out, { beatCooldownDays: 0 }).state.world.spine!.proposed).toBe('beat_1'); // clamped up to 1
    expect(apply(s, out, { beatCooldownDays: 99 }).state.world.spine!.proposed).toBeUndefined();
  });
});

describe('fallback director', () => {
  const out = (s: CampaignState, seed = 1) => fallbackOutput(s, reg, new Rng(seedRng(seed)));

  it('fallback output is valid through the same validator', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = at((x) => { x.day = 1 + (seed % 20); x.base.facilities.comms = 2; });
      const o = out(s, seed);
      const r = validateDirectorOutput(s, reg, o, { cooldownDays: COOLDOWN });
      expect(r.rejected, `seed ${seed}`).toEqual([]);
      expect(r.output).toEqual(o);
    }
  });

  const isCommand = (templateId: string): boolean => (reg.missionTemplates.get(templateId)!.sources as string[]).includes('command');

  it('offers a command mission every third day and never a duplicate', () => {
    const s = structuredClone(base);
    const first = out(s);
    expect(first.missionOffers.filter((o) => isCommand(o.templateId))).toHaveLength(1);
    const d = structuredClone(s);
    applyDirectorOutput(d, ctxOf(d, reg), first);
    expect(d.missions.offered.filter((m) => m.source === 'command')).toHaveLength(1);
    // a command mission is on the board: no second one
    for (let seed = 1; seed <= 30; seed++) expect(out(d, seed).missionOffers.filter((o) => isCommand(o.templateId))).toEqual([]);
    // it leaves the board on day 2: still too early, and on day 4 a new one comes
    const gone = structuredClone(d);
    for (const m of gone.missions.offered.filter((x) => x.source === 'command')) gone.missions.completed.push({ ...m, status: 'completed' });
    gone.missions.offered = gone.missions.offered.filter((m) => m.source !== 'command');
    gone.day = 2;
    expect(out(gone, 4).missionOffers.filter((o) => isCommand(o.templateId))).toEqual([]);
    gone.day = 1 + TUNING.world.commandEveryDays;
    expect(out(gone, 5).missionOffers.filter((o) => isCommand(o.templateId))).toHaveLength(1);
    // never a duplicate of something already on the board or under way
    for (let seed = 1; seed <= 100; seed++) {
      const busy = structuredClone(d);
      busy.day = 10;
      for (const m of out(busy, seed).missionOffers) {
        expect(busy.missions.offered.some((x) => x.templateId === m.templateId && x.regionId === m.regionId), `seed ${seed}`).toBe(false);
      }
    }
  });

  it('never offers the scavenging template on the board', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = at((x) => { x.day = 1 + (seed % 9); x.base.facilities.comms = 3; });
      expect(out(s, seed).missionOffers.some((o) => o.templateId === 'tpl_scavenge'), `seed ${seed}`).toBe(false);
    }
  });

  it('proposes the current beat once its conditions hold', () => {
    expect(out(base).storyBeatProposal).toEqual({ beatId: 'beat_1', framing: '' });
    const early = at((s) => { s.world.spineProgress = 1; s.day = 2; s.world.spine = { lastProposalDay: 1 }; });
    expect(out(early).storyBeatProposal).toBeUndefined();
    const ready = at((s) => { s.world.spineProgress = 1; s.day = 4; s.world.spine = { lastProposalDay: 1 }; });
    expect(out(ready).storyBeatProposal).toEqual({ beatId: 'beat_2', framing: '' });
    const proposed = at((s) => { s.world.spine = { proposed: 'beat_1', lastProposalDay: 1 }; });
    expect(out(proposed).storyBeatProposal).toBeUndefined();
  });

  it('keeps offering missions and advancing clocks after the last beat', () => {
    const s = at((x) => { x.world.spineProgress = 6; x.day = 20; });
    const o = out(s);
    expect(o.storyBeatProposal).toBeUndefined();
    expect(o.missionOffers.length).toBeGreaterThan(0);
    expect(o.clockAdvances).toHaveLength(1); // an even day
    expect(o.clockAdvances[0].by).toBe(1);
    expect(reg.clocks.get(o.clockAdvances[0].clockId)!.regionId).toBeDefined();
    expect(out(at((x) => { x.world.spineProgress = 6; x.day = 21; })).clockAdvances).toEqual([]);
    expect(o.rumors).toHaveLength(1);
    expect(o.rumors[0].leadsTo).toBe('none');
    // the rumor line is one of the authored lines of a known region
    const lines = [...reg.regions.values()].flatMap((r) => r.rumors as string[]);
    expect(lines).toContain(o.rumors[0].text);
  });

  it('is seeded: the same state and seed give the same output', () => {
    const s = at((x) => { x.day = 6; });
    expect(out(s, 9)).toEqual(out(s, 9));
    expect(JSON.stringify(out(s, 9))).not.toBe(JSON.stringify(out(s, 10)));
  });

  it('director/fallback answers an open request with the fallback', () => {
    const s = requested();
    const r = run(s, reg, { type: 'director/fallback', payload: { requestId: 'd1' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.world.director!.pending).toBeUndefined();
    expect(r.state.world.spine!.proposed).toBe('beat_1');
    expect(r.state.missions.offered.length).toBeGreaterThan(0);
    expect(String(errors(run(r.state, reg, { type: 'director/fallback', payload: { requestId: 'd1' } }).events)[0].message)).toBe('Stale director answer.');
    // a scout request is answered with rumors only
    const scout = run(requested(base, 'scout'), reg, { type: 'director/fallback', payload: { requestId: 'd1' } });
    expect(scout.state.rumors.length).toBeLessThanOrEqual(1);
    expect(scout.state.missions.offered).toEqual([]);
  });
});

describe('day end', () => {
  const evening = (s: CampaignState): CampaignState => { const t = structuredClone(s); t.slot = 'evening'; return t; };
  const endDay = (s: CampaignState) => run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });

  it('the day end opens a director request', () => {
    const r = endDay(evening(base));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'director_requested')).toEqual([{ type: 'director_requested', id: 'd1', reason: 'day_end' }]);
    expect(r.state.world.director!.pending).toEqual({ id: 'd1', reason: 'day_end', day: base.day });
  });

  it('an unanswered request is answered by the fallback at the next day end', () => {
    const one = endDay(evening(base)).state;
    expect(one.world.director!.pending!.id).toBe('d1');
    const two = endDay(evening(one));
    const applied = ofType(two.events, 'director_applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ fallback: true });
    expect(ofType(two.events, 'director_requested')).toEqual([{ type: 'director_requested', id: 'd2', reason: 'day_end' }]);
    expect(two.state.world.director!.pending!.id).toBe('d2');
    expect(two.state.world.spine!.proposed).toBe('beat_1');
    // an answered request is not answered again
    const answered = run(one, reg, { type: 'director/apply', payload: { requestId: 'd1', output: {} } }).state;
    const three = endDay(evening(answered));
    expect(ofType(three.events, 'director_applied')).toEqual([]);
    expect(ofType(three.events, 'director_requested')).toHaveLength(1);
  });

  it('thirty days of fallback-only play reach the open-ended phase when every story mission is completed on offer', () => {
    let s = structuredClone(base);
    const ctxFor = (st: CampaignState) => ctxOf(st, reg);
    for (let day = 1; day <= 30 && s.world.spineProgress < 6; day++) {
      // answer last night's request with the fallback, then complete whatever story mission is on offer
      if (s.world.director?.pending) s = run(s, reg, { type: 'director/fallback', payload: { requestId: s.world.director.pending.id } }).state;
      const draft = structuredClone(s);
      for (const m of [...draft.missions.offered].filter((x) => x.source === 'story')) {
        draft.missions.offered = draft.missions.offered.filter((x) => x.id !== m.id);
        m.status = 'active';
        draft.missions.active.push(m);
        // beat 4 is decided by an event option that sets one of three flags
        if (m.spineBeat === 'beat_4') applyWorldEffects(draft, ctxFor(draft), [{ type: 'flag', flagId: 'evidence_buried' }], { kind: 'event', id: 'evt' });
        completeMission(draft, ctxFor(draft), m.id);
      }
      s = draft;
      expect(s.day).toBe(day);
      // spend the whole day
      s = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 3, reason: 'test' } }).state;
    }
    expect(s.world.spineProgress).toBe(6);
    expect(s.world.clearanceTier).toBe(3);
    expect(s.day).toBeLessThanOrEqual(30);
    // after the spine the world keeps moving: the fallback still offers things
    const after = structuredClone(s);
    after.missions.offered = [];
    after.day += 3;
    expect(fallbackOutput(after, reg, new Rng(seedRng(3))).missionOffers.length).toBeGreaterThan(0);
  });

  it('a day-end step that fails does not stop the day', () => {
    const s = evening(base);
    s.world.director = { pending: { id: 'd1', reason: 'day_end', day: 1 } };
    const broken = { ...reg, regions: new Map() } as Registries;
    const r = run(s, broken, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(ofType(r.events, 'day_started')).toHaveLength(1);
  });
});
