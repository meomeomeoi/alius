import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { applyLifeEvent, closeNews, enqueue, grantMilestone, lifeDayStep, startHobby, writeLifeFact } from '../../../src/engine/life';
import { hobbyUntold, toldMilestones } from '../../../src/engine/life/known';
import { sweepUntold } from '../../../src/engine/life/news';
import { newLife } from '../../../src/engine/life/state';
import type { LifeEventEntry } from '../../../src/engine/life/types';
import { addFact } from '../../../src/engine/memory';
import { foldDue } from '../../../src/engine/memory/fold';
import type { CampaignState, HobbyState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const mine = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [], ...over });
const event = (id: string) => reg.lifeEvents.get(id) as unknown as LifeEventEntry;

function world(hobbies: HobbyState[] = []): CampaignState {
  const s = campaign(reg, 4);
  s.day = 30;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.settings.unitDms = true;
  s.life = newLife(7);
  if (hobbies.length > 0) mine(s).hobbies = hobbies;
  return s;
}

describe('R13: telling one item of a hobby tells what came before it', () => {
  it('a hobby a friend gave her whose item went stale is shown once a later item of it is told', () => {
    const s = world();
    startHobby(s, reg, ANN, 'chess', 20, 'friend');
    expect(hobbyUntold(s, ANN, 'chess')).toBe(true);
    s.life!.queue = []; // the started item went stale and was dropped; its fact stays hers
    expect(hobbyUntold(s, ANN, 'chess')).toBe(true);
    grantMilestone(s, reg, ANN, 'chess', 0, {});
    const item = s.life!.queue[0];
    expect(item).toMatchObject({ kind: 'hobby', ref: 'chess', what: 'milestone' });
    closeNews(s, item.id);
    expect(hobbyUntold(s, ANN, 'chess')).toBe(false);
    expect(toldMilestones(s, ANN, mine(s).hobbies![0])).toHaveLength(1);
  });

  it('the items still waiting for what is now known go too (nothing is told twice)', () => {
    const s = world();
    startHobby(s, reg, ANN, 'chess', 20, 'friend');
    grantMilestone(s, reg, ANN, 'chess', 0, {});
    grantMilestone(s, reg, ANN, 'chess', 1, {});
    const [started, first, second] = s.life!.queue;
    s.life!.outbox.push({ itemId: started.id, unitId: ANN, channel: 'dm', day: 20 });
    s.life!.news.push({ itemId: first.id, unitId: ANN, until: 40 });
    closeNews(s, second.id);
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.outbox).toEqual([]);
    expect(s.life!.news).toEqual([]);
    expect(hobbyUntold(s, ANN, 'chess')).toBe(false);
    expect(toldMilestones(s, ANN, mine(s).hobbies![0])).toHaveLength(2);
  });

  it('only what is earlier: a later milestone stays untold, and so does another hobby', () => {
    const s = world();
    startHobby(s, reg, ANN, 'chess', 20, 'friend');
    startHobby(s, reg, ANN, 'cards', 20, 'friend');
    grantMilestone(s, reg, ANN, 'chess', 0, {});
    grantMilestone(s, reg, ANN, 'chess', 1, {});
    const first = s.life!.queue.find((q) => q.milestoneId === mine(s).hobbies![0].milestones[0])!;
    closeNews(s, first.id);
    expect(hobbyUntold(s, ANN, 'chess')).toBe(false);
    expect(hobbyUntold(s, ANN, 'cards')).toBe(true);
    expect(toldMilestones(s, ANN, mine(s).hobbies![0])).toHaveLength(1); // the second is still hers
  });

  it('an unshared event that starts a hobby queues its own hobby item, which can be told', () => {
    let s: CampaignState | null = null;
    for (let salt = 1; salt < 400 && s === null; salt++) {
      const t = world();
      t.life!.salt = salt;
      applyLifeEvent(t, reg, ANN, event('stray_found'), 30);
      if (!t.life!.queue.some((q) => q.kind === 'event')) s = t;
    }
    expect(s).not.toBeNull();
    const item = s!.life!.queue.find((q) => q.kind === 'hobby')!;
    expect(item).toMatchObject({ ref: 'animals', what: 'started' });
    expect(hobbyUntold(s!, ANN, 'animals')).toBe(true);
    closeNews(s!, item.id);
    expect(hobbyUntold(s!, ANN, 'animals')).toBe(false);
  });

  it('a shared event that starts a hobby is told with the event, as before', () => {
    let s: CampaignState | null = null;
    for (let salt = 1; salt < 400 && s === null; salt++) {
      const t = world();
      t.life!.salt = salt;
      applyLifeEvent(t, reg, ANN, event('stray_found'), 30);
      if (t.life!.queue.some((q) => q.kind === 'event')) s = t;
    }
    expect(s).not.toBeNull();
    expect(s!.life!.queue.every((q) => q.kind === 'event')).toBe(true);
    expect(hobbyUntold(s!, ANN, 'animals')).toBe(true);
    closeNews(s!, s!.life!.queue[0].id);
    expect(hobbyUntold(s!, ANN, 'animals')).toBe(false);
  });

  it('the mastery is revealed only when it, or a later item of the hobby, is told', () => {
    const s = world([take('reading', { milestones: ['first_book', 'shelf', 'favourite'] })]);
    grantMilestone(s, reg, ANN, 'reading', 3, {});
    const mastered = s.memory.facts.find((f) => f.tags.includes('mastered'))!;
    expect(mastered.hiddenFromCommander).toBe(true);
    s.life!.queue.push({ id: 'ln90', unitId: ANN, kind: 'hobby', ref: 'reading', what: 'dropped', category: 'hobby', day: 31, factId: writeLifeFact(s, ANN, 'Ann has put reading away.', ['hobby', 'reading', 'dropped'], 1).id });
    closeNews(s, 'ln90'); // a later item of the hobby
    expect(s.memory.facts.find((f) => f.id === mastered.id)!.hiddenFromCommander).toBeUndefined();
  });
});

describe('R14: no DMs, no DM', () => {
  it('life/share_done sends nothing while the commander\'s DMs are off: the item becomes news for her next scene', () => {
    const s = world();
    const fact = writeLifeFact(s, ANN, 'Ann: a coin.', ['life'], 1);
    enqueue(s, { unitId: ANN, kind: 'event', ref: 'found_something', what: 'event', factId: fact.id, category: 'things', day: 30 });
    const id = s.life!.queue[0].id;
    s.life!.outbox.push({ itemId: id, unitId: ANN, channel: 'dm', day: 30 });
    for (const off of [false, undefined]) {
      const t = structuredClone(s);
      if (off === undefined) delete t.settings.unitDms; else t.settings.unitDms = off;
      const r = run(t, reg, { type: 'life/share_done', payload: { itemId: id, text: 'Hello.' } });
      expect(errors(r.events)).toEqual([]);
      expect(r.state.dms[ANN] ?? []).toEqual([]);
      expect(r.state.life!.outbox).toEqual([]);
      expect(r.state.life!.news).toEqual([{ itemId: id, unitId: ANN, until: 30 + TUNING.life.newsDays }]);
      expect(r.state.life!.queue).toHaveLength(1); // still hers to tell
      expect(r.state.memory.facts.find((f) => f.id === fact.id)!.hiddenFromCommander).toBe(true);
    }
    expect(errors(run(s, reg, { type: 'life/share_done', payload: { itemId: id, text: 'Hello.' } }).events)).toEqual([]);
  });
});

describe('R12: untold facts do not drive the memory caps, and do not pile up', () => {
  const untold = (s: CampaignState, n: number, day = 1): void => {
    for (let i = 0; i < n; i++) writeLifeFact(s, ANN, `Ann: day ${day} ${i} thing.`, ['nightmare'], 1);
    for (const f of s.memory.facts) if (f.tags.includes('untold') && f.day === s.day) f.day = day;
  };

  it('a hundred untold facts do not make a fold due on the short preset', () => {
    const s = world();
    s.memory.config = { preset: 'short' } as never;
    s.memory.facts.push({ id: 'p1', about: [BEA], text: 'Bea laughed.', tags: [], importance: 5, day: 1, knownBy: ['*'] });
    s.day = 40;
    untold(s, 100, 5);
    expect(s.memory.facts.length).toBeGreaterThan(80);
    expect(foldDue(s)).toBeNull();
  });

  it('the hard ceiling never deletes an untold fact, and counts only the others', () => {
    const s = world();
    s.memory.config = { preset: 'short' } as never;
    untold(s, 200, 5);
    for (let i = 0; i < 5; i++) addFact(s, { about: [BEA], text: `Bea said ${i}.`, tags: [], importance: 1, day: 30, knownBy: ['*'] });
    expect(s.memory.facts.filter((f) => f.tags.includes('untold'))).toHaveLength(200);
    expect(s.memory.facts.filter((f) => !f.tags.includes('untold'))).toHaveLength(5);
  });

  it('the sweep deletes an old untold fact nobody carries, keeps a carried one, a hobby one and the newest ten kept ones', () => {
    const s = world();
    const keeps = [...reg.lifeEvents.values()].find((e) => (e as unknown as LifeEventEntry).share === 'keeps') as unknown as LifeEventEntry;
    const old = writeLifeFact(s, ANN, 'Ann: an old thing.', ['nightmare'], 1);
    const carried = writeLifeFact(s, ANN, 'Ann: a carried thing.', ['nightmare'], 1);
    const hobby = writeLifeFact(s, ANN, 'Ann has taken up chess.', ['hobby', 'chess', 'started'], 1);
    const dropped = writeLifeFact(s, ANN, 'Ann has put chess away.', ['hobby', 'chess', 'dropped'], 1);
    const young = writeLifeFact(s, ANN, 'Ann: a young thing.', ['nightmare'], 1);
    young.day = 25;
    const kept: string[] = [];
    for (let i = 0; i < 14; i++) kept.push(writeLifeFact(s, ANN, `Ann: ${keeps.id} ${i}.`, [keeps.id], 1).id);
    for (const f of s.memory.facts) if (f !== young) f.day = 1;
    enqueue(s, { unitId: ANN, kind: 'event', ref: 'x', what: 'event', factId: carried.id, category: 'things', day: 29 });
    sweepUntold(s, reg, 1 + TUNING.life.untoldKeepDays);
    const ids = new Set(s.memory.facts.map((f) => f.id));
    expect(ids.has(old.id)).toBe(false);
    expect(ids.has(dropped.id)).toBe(false);
    expect(ids.has(carried.id)).toBe(true);
    expect(ids.has(hobby.id)).toBe(true);
    expect(ids.has(young.id)).toBe(true);
    expect(kept.filter((id) => ids.has(id))).toEqual(kept.slice(-TUNING.life.keepsMax));
  });

  it('120 days at normal frequency with five women: the untold facts stay bounded and the fold is not driven by them', () => {
    const s = campaign(reg, 5);
    for (const u of s.squad) u.status = 'active';
    s.day = 1;
    s.world.clocks = [];
    s.settings.lifeEvents = 'normal';
    s.settings.unitDms = false;
    s.life = newLife(3);
    s.memory.config = { preset: 'short' } as never;
    s.memory.facts.push({ id: 'p1', about: [BEA], text: 'Bea laughed.', tags: [], importance: 5, day: 0, knownBy: ['*'] }); // one ordinary fact the fold could take
    let most = 0;
    for (let d = 1; d <= 120; d++) {
      s.day = d;
      lifeDayStep(s, ctxOf(s, reg));
      s.life!.outbox.length = 0; // nothing tells: the worst case
      most = Math.max(most, s.memory.facts.filter((f) => f.tags.includes('untold')).length);
      expect(foldDue(s)).toBeNull();
    }
    const left = s.memory.facts.filter((f) => f.tags.includes('untold'));
    expect(most).toBeLessThan(60); // ten kept facts a woman at most, a month of the rest
    expect(left.length).toBeLessThan(60);
    const sweepable = left.filter((f) => !f.tags.includes('hobby') && !f.tags.some((t) => (reg.lifeEvents.get(t) as unknown as LifeEventEntry | undefined)?.share === 'keeps'));
    expect(sweepable.every((f) => 120 - f.day < TUNING.life.untoldKeepDays + 1 || s.life!.queue.some((q) => q.factId === f.id))).toBe(true);
  });
});
