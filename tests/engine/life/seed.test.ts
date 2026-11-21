import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/squad';
import { enqueue } from '../../../src/engine/life/news';
import { milestoneAt, seedLife } from '../../../src/engine/life/hobbies';
import { lifeMode } from '../../../src/engine/life/state';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const hobbyIds = () => [...reg.hobbies.keys()];
const topics = () => [...reg.opinionTopics.values()];
const positions = (t: Entry) => (t.positions as Array<{ id: string }>).map((p) => p.id);

/** Four units with life turned on at set-up (the salt is the seed) and Ann/Bea carrying hobbies. */
function lifeCampaign(life: 'normal' | null = 'normal', seed = 21, extra: Record<string, unknown> = {}): CampaignState {
  const [a, b, c, d] = hobbyIds();
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny',
    units: [
      unitSetup('Ann', { hobbies: [a, b, c], ...extra }), unitSetup('Bea', { hobbies: [a, d] }), unitSetup('Cat'),
    ],
    ...(life ? { lifeEvents: life } : {}),
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
}

describe('milestoneAt', () => {
  it('is within 15 percent of 10, 30, 60 and 100, and never above 100', () => {
    for (let i = 0; i < 20; i++) {
      [10, 30, 60, 100].forEach((base, n) => {
        const v = milestoneAt(21, `unit_${i}`, 'reading', n as 0 | 1 | 2 | 3);
        expect(v).toBeGreaterThanOrEqual(Math.round(base * 0.85));
        expect(v).toBeLessThanOrEqual(Math.min(100, Math.round(base * 1.15)));
      });
    }
  });

  it('is stable for the same salt and differs by unit, hobby and salt', () => {
    expect(milestoneAt(21, 'unit_ann', 'reading', 2)).toBe(milestoneAt(21, 'unit_ann', 'reading', 2));
    const vec = (salt: number, unit: string, hobby: string) => [0, 1, 2, 3].map((n) => milestoneAt(salt, unit, hobby, n as 0 | 1 | 2 | 3)).join(',');
    expect(new Set(['a', 'b', 'c'].map((u) => vec(21, `unit_${u}`, 'reading'))).size).toBeGreaterThan(1);
    expect(vec(21, 'unit_ann', 'reading')).not.toBe(vec(22, 'unit_ann', 'reading'));
  });

  it('gives no two of 20 units the same four thresholds on one hobby (pinned)', () => {
    const ids = ['ann', 'bea', 'cat', 'dee', 'eve', 'fay', 'gia', 'hal', 'ida', 'joy', 'kit', 'lou', 'mae', 'nia', 'ora', 'pia', 'quin', 'rue', 'sol', 'ula'].map((n) => `unit_${n}`);
    const vecs = ids.map((u) => [0, 1, 2, 3].map((n) => milestoneAt(21, u, 'reading', n as 0 | 1 | 2 | 3)));
    expect(new Set(vecs.map((v) => v.join(','))).size).toBe(20);
    expect(vecs[0]).toMatchInlineSnapshot(`
      [
        11,
        28,
        60,
        88,
      ]
    `);
  });
});

describe('seedLife', () => {
  it('gives each starting hobby a skill below its second milestone, silently', () => {
    const s = lifeCampaign();
    expect(lifeMode(s)).toBe('normal');
    for (const u of s.squad) for (const h of u.hobbies ?? []) {
      expect(h.skill).toBeLessThan(milestoneAt(s.life!.salt, u.id, h.id, 1));
      const passed = [0, 1].filter((n) => milestoneAt(s.life!.salt, u.id, h.id, n as 0 | 1) <= h.skill).length;
      expect(h.milestones).toHaveLength(passed);
      expect(h.state).toBe('active');
    }
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.nextId).toBe(0);
    expect(s.memory.facts.filter((f) => f.tags?.includes('life'))).toEqual([]);
  });

  it('is the same for the same salt, and different for another unit and another salt', () => {
    const a = lifeCampaign('normal', 21);
    const b = lifeCampaign('normal', 21);
    expect(a.squad.map((u) => u.hobbies)).toEqual(b.squad.map((u) => u.hobbies));
    const [ann, bea] = a.squad;
    const sameHobby = ann.hobbies!.find((h) => bea.hobbies!.some((x) => x.id === h.id))!;
    const skills = (s: CampaignState) => s.squad.slice(0, 2).map((u) => u.hobbies!.find((h) => h.id === sameHobby.id)!.skill);
    const seeds = [21, 22, 23, 24, 25, 26].map((n) => skills(lifeCampaign('normal', n)));
    expect(seeds.some(([x, y]) => x !== y)).toBe(true);
    expect(new Set(seeds.map((p) => p.join(','))).size).toBeGreaterThan(1);
  });

  it('is a no-op when life is off or absent, and idempotent when on', () => {
    const off = lifeCampaign(null);
    expect(off.squad[0].hobbies!.map((h) => h.skill)).toEqual([0, 0, 0]);
    const events = seedLife(off, reg);
    expect(events).toEqual([]);
    expect(off.squad[0].hobbies!.map((h) => h.skill)).toEqual([0, 0, 0]);
    const on = lifeCampaign();
    const before = structuredClone(on.squad);
    seedLife(on, reg);
    expect(on.squad).toEqual(before);
  });

  it('life/set_frequency seeds a campaign whose life was off', () => {
    const off = lifeCampaign(null);
    const r = run(off, reg, { type: 'life/set_frequency', payload: { mode: 'normal' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].hobbies!.some((h) => h.skill > 0)).toBe(true);
    for (const h of r.state.squad[0].hobbies!) expect(h.skill).toBeLessThan(milestoneAt(r.state.life!.salt, ANN, h.id, 1));
  });
});

describe('profile/set_hobbies', () => {
  const set = (s: CampaignState, hobbies: string[], aptitudes?: unknown) => run(s, reg, { type: 'profile/set_hobbies', payload: { unitId: ANN, hobbies, ...(aptitudes !== undefined ? { aptitudes } : {}) } });

  it('keeps the progress of a kept hobby and starts a new one at 0', () => {
    const s = lifeCampaign();
    const [a, b, , , e] = hobbyIds();
    const kept = structuredClone(s.squad[0].hobbies!.find((h) => h.id === a)!);
    kept.skill = 42;
    s.squad[0].hobbies!.find((h) => h.id === a)!.skill = 42;
    const r = set(s, [a, e]);
    expect(errors(r.events)).toEqual([]);
    const h = r.state.squad[0].hobbies!;
    expect(h.map((x) => x.id)).toEqual([a, e]);
    expect(h[0].skill).toBe(42);
    expect(h[1]).toMatchObject({ id: e, skill: 0, interest: 50, state: 'active', milestones: [] });
    expect(h.find((x) => x.id === b)).toBeUndefined();
    expect(ofType(r.events, 'hobbies_set')).toHaveLength(1);
  });

  it('refuses a fourth active, an unknown hobby and overlapping aptitudes', () => {
    const s = lifeCampaign();
    const [a, b, c, d] = hobbyIds();
    expect(errors(set(s, [a, b, c, d]).events)).toHaveLength(1);
    expect(errors(set(s, ['basket_weaving']).events)).toHaveLength(1);
    expect(errors(set(s, [a], { high: [a, b], low: [b, c] }).events)).toHaveLength(1);
    expect(errors(set(s, [a, a]).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'profile/set_hobbies', payload: { unitId: 'nobody', hobbies: [a] } }).events)).toHaveLength(1);
  });

  it('a cooling hobby does not count against the three, and aptitudes are replaced', () => {
    const s = lifeCampaign();
    const [a, b, c, d] = hobbyIds();
    s.squad[0].hobbies!.find((h) => h.id === c)!.state = 'cooling';
    const r = set(s, [a, b, c, d], { high: [a], low: [b] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].aptitudes).toEqual({ high: [a], low: [b] });
    expect(r.state.squad[0].hobbies!.find((h) => h.id === c)!.state).toBe('cooling');
  });
});

describe('profile/set_opinion', () => {
  const t = () => topics()[0];
  const set = (s: CampaignState, payload: Record<string, unknown>) => run(s, reg, { type: 'profile/set_opinion', payload: { unitId: ANN, topicId: t().id, ...payload } });

  it('adds an opinion strong by default, then edits its position and text', () => {
    const s = lifeCampaign();
    const added = set(s, { position: positions(t())[0], text: 'First.' });
    expect(errors(added.events)).toEqual([]);
    expect(added.state.squad[0].opinions![t().id]).toMatchObject({ position: positions(t())[0], strength: 'strong', text: 'First.', formedDay: s.day });
    const edited = set(added.state, { position: positions(t())[1], text: 'Second.', strength: 'held' });
    expect(edited.state.squad[0].opinions![t().id]).toMatchObject({ position: positions(t())[1], strength: 'held', text: 'Second.' });
    expect(ofType(edited.events, 'opinion_set')).toHaveLength(1);
  });

  it('refuses an unknown position, topic, strength or unit, and cuts the text to 200', () => {
    const s = lifeCampaign();
    expect(errors(set(s, { position: 'nope' }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'profile/set_opinion', payload: { unitId: ANN, topicId: 'nope', position: 'x' } }).events)).toHaveLength(1);
    expect(errors(set(s, { position: positions(t())[0], strength: 'mild' }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'profile/set_opinion', payload: { unitId: 'nobody', topicId: t().id, position: positions(t())[0] } }).events)).toHaveLength(1);
    expect(set(s, { position: positions(t())[0], text: 'x'.repeat(300) }).state.squad[0].opinions![t().id].text).toHaveLength(200);
  });
});

describe('squad/resync of hobbies and opinions', () => {
  const resync = (s: CampaignState, patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch, ...extra } });

  it('opinions replaces a strong opinion that was never voiced or moved, and keeps a voiced or moved one', () => {
    const [t0, t1, t2, t3] = topics();
    const s = lifeCampaign('normal', 21, {
      opinions: {
        [t0.id]: { position: positions(t0)[0], text: 'old' },
        [t1.id]: { position: positions(t1)[0], text: 'old' },
        [t2.id]: { position: positions(t2)[0], text: 'old' },
      },
    });
    const ann = s.squad[0];
    ann.opinions![t1.id].voicedDay = 3;
    ann.opinions![t2.id].history = [{ day: 4, from: positions(t2)[1], to: positions(t2)[0] }];
    ann.opinions![t0.id].strength = 'strong';
    const r = resync(s, { opinions: { [t3.id]: { position: positions(t3)[1], text: 'new' }, [t1.id]: { position: positions(t1)[1], text: 'new' }, [t2.id]: { position: positions(t2)[1], text: 'new' } } });
    expect(errors(r.events)).toEqual([]);
    const o = r.state.squad[0].opinions!;
    expect(o[t0.id]).toBeUndefined(); // strong, never voiced, never moved, and the card no longer says it
    expect(o[t1.id].text).toBe('old'); // voiced
    expect(o[t2.id].text).toBe('old'); // moved
    expect(o[t3.id]).toMatchObject({ position: positions(t3)[1], strength: 'strong', text: 'new' });
    expect(ofType(r.events, 'unit_resynced')[0].sections).toEqual(['opinions']);
  });

  it('a held or loose opinion is never replaced', () => {
    const [t0] = topics();
    const s = lifeCampaign('normal', 21, { opinions: { [t0.id]: { position: positions(t0)[0], text: 'mine' } } });
    s.squad[0].opinions![t0.id].strength = 'held';
    const r = resync(s, { opinions: { [t0.id]: { position: positions(t0)[1], text: 'card' } } });
    expect(r.state.squad[0].opinions![t0.id]).toMatchObject({ position: positions(t0)[0], text: 'mine', strength: 'held' });
  });

  it('hobbies replaces the aptitudes, adds a missing hobby and never deletes progress', () => {
    const s = lifeCampaign();
    const [a, b, c, d, e] = hobbyIds();
    s.squad[0].hobbies!.find((h) => h.id === a)!.skill = 55;
    const r = resync(s, { hobbies: [d], aptitudes: { high: [d, e], low: [a, b] } });
    expect(errors(r.events)).toEqual([]);
    const h = r.state.squad[0].hobbies!;
    expect(h.map((x) => x.id)).toEqual([a, b, c, d]);
    expect(h[0].skill).toBe(55);
    // she had three active: the fourth starts active and the one she cares least about is put to cooling (never more than three active)
    expect(h.filter((x) => x.state === 'active')).toHaveLength(3);
    expect(h[3]).toMatchObject({ id: d, state: 'active', skill: expect.any(Number) });
    expect(h.filter((x) => x.state === 'cooling')).toHaveLength(1);
    expect(ofType(r.events, 'hobby_cooling')).toHaveLength(1);
    expect(r.state.squad[0].aptitudes).toEqual({ high: [d, e], low: [a, b] });
    expect(ofType(r.events, 'unit_resynced')[0].sections).toEqual(['hobbies']);
  });

  it('a patch with a bad hobby or opinion throws and changes nothing', () => {
    const s = lifeCampaign();
    expect(errors(resync(s, { hobbies: ['nope'] }).events)).toHaveLength(1);
    expect(errors(resync(s, { opinions: { nope: { position: 'x' } } }).events)).toHaveLength(1);
  });

  it('Reset life deletes her hobbies, opinions and life block entry', () => {
    const [t0] = topics();
    const s = lifeCampaign('normal', 21, { opinions: { [t0.id]: { position: positions(t0)[0] } } });
    s.life!.units[ANN] = { last: { x: 3 } };
    const r = resync(s, { hobbies: [] }, { resetLife: true });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].hobbies).toBeUndefined();
    expect(r.state.squad[0].opinions).toBeUndefined();
    expect(r.state.life!.units[ANN]).toBeUndefined();
    expect(r.state.squad[1].hobbies).toBeDefined(); // she is not the only one
  });

  it('Reset life also drops her news (queue, outbox, directives, a waiting quiet hour) and leaves another woman\'s', () => {
    const s = lifeCampaign('normal', 21);
    const BEA = s.squad[1].id;
    for (const [i, unitId] of [ANN, ANN, BEA].entries()) {
      enqueue(s, { unitId, kind: 'event', ref: 'x', what: 'event', category: 'things', day: 20 });
      const id = s.life!.queue.at(-1)!.id;
      if (i === 0) s.life!.outbox.push({ itemId: id, unitId, channel: 'dm', day: 20 });
      else s.life!.news.push({ itemId: id, unitId, until: 23 });
    }
    s.life!.pending = { unitId: ANN, pastimeId: 'tidy_her_quarters', locationId: 'quarters_unit', day: 21, slot: 'morning' };
    const r = resync(s, { hobbies: [] }, { resetLife: true });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.life!.queue.map((q) => q.unitId)).toEqual([BEA]);
    expect(r.state.life!.outbox).toEqual([]);
    expect(r.state.life!.news.map((n) => n.unitId)).toEqual([BEA]);
    expect(r.state.life!.pending).toBeUndefined();
  });
});

it('a campaign built without life carries no new field', () => {
  const s = campaign(reg, 2);
  expect(s.life).toBeUndefined();
  for (const u of s.squad) for (const k of ['hobbies', 'aptitudes', 'opinions']) expect(k in u).toBe(false);
});

describe('only a starting hobby is seeded', () => {
  const [a, , , d, e] = [0, 1, 2, 3, 4].map((i) => () => hobbyIds()[i]);
  const addNamed = (s: CampaignState) => {
    s.world.incomingUnits = 1;
    return run(s, reg, { type: 'squad/add_named', payload: { unit: unitSetup('Fay', { hobbies: [d()] }) } });
  };

  it('a recruit is seeded alone: another woman\'s new hobby stays at 0 after squad/add_named', () => {
    const s = lifeCampaign();
    s.squad[1].hobbies!.push({ id: e(), skill: 0, interest: 50, state: 'cooling', since: 3, milestones: [] }); // taken up since, e.g. by an event
    s.squad[1].hobbies = s.squad[1].hobbies!.map((h) => (h.id === e() ? { ...h, state: 'active' as const } : h)).slice(0, 3);
    const r = addNamed(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[1].hobbies!.find((h) => h.id === e())).toMatchObject({ skill: 0, milestones: [] });
    const fay = r.state.squad.at(-1)!;
    expect(fay.hobbies![0].skill).toBeLessThan(milestoneAt(r.state.life!.salt, fay.id, d(), 1)); // she is seeded
    expect(fay.hobbies![0].id).toBe(d());
  });

  it('turning life off and on again does not seed a hobby taken up since', () => {
    const s = lifeCampaign();
    s.squad[1].hobbies!.push({ id: e(), skill: 0, interest: 50, state: 'cooling', since: 3, milestones: [] });
    const off = run(s, reg, { type: 'life/set_frequency', payload: { mode: 'off' } }).state;
    const on = run(off, reg, { type: 'life/set_frequency', payload: { mode: 'normal' } }).state;
    expect(on.squad[1].hobbies!.find((h) => h.id === e())).toMatchObject({ skill: 0, milestones: [] });
    expect(on.life!.salt).toBe(s.life!.salt);
  });

  it('a re-sync seeds only the hobby it adds', () => {
    const s = lifeCampaign();
    s.squad[0].hobbies = s.squad[0].hobbies!.slice(0, 1);
    s.squad[0].hobbies.push({ id: e(), skill: 0, interest: 50, state: 'active', since: 3, milestones: [] }); // taken up since
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { hobbies: [d()] } } });
    expect(errors(r.events)).toEqual([]);
    const h = r.state.squad[0].hobbies!;
    expect(h.find((x) => x.id === e())).toMatchObject({ skill: 0, milestones: [] });
    expect(h.find((x) => x.id === d())!.skill).toBeLessThan(milestoneAt(r.state.life!.salt, ANN, d(), 1));
    void a;
  });
});
