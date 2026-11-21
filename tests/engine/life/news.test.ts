import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { channelFor, closeNews, deliverNews, enqueue, lifeDayStep, pendingNews, staleSweep } from '../../../src/engine/life';
import { UNTOLD_TAG, newLife } from '../../../src/engine/life/state';
import { writeLifeFact } from '../../../src/engine/life';
import { notesFor, unreadNotes } from '../../../src/engine/notes';
import type { CampaignState, NewsItem } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const CATEGORIES = ['things', 'body', 'construct', 'people', 'service', 'luck'];

function world(mode: 'rare' | 'normal' | 'often' = 'normal', n = 4): CampaignState {
  const s = campaign(reg, n);
  s.day = 20;
  s.world.clocks = [];
  s.settings.lifeEvents = mode;
  s.settings.unitDms = true;
  s.life = newLife(7);
  return s;
}
type Spec = Partial<Omit<NewsItem, 'id'>> & { unitId: string };
/** An item in the queue with its own hidden fact (what an event or a milestone writes). */
function queue(s: CampaignState, spec: Spec): NewsItem {
  const fact = writeLifeFact(s, spec.unitId, `${s.squad.find((u) => u.id === spec.unitId)!.displayName}: something ${s.life!.nextId} happened.`, ['life', spec.category ?? 'things'], 1);
  enqueue(s, { kind: 'event', ref: 'found_something', what: 'event', factId: fact.id, category: 'things', day: s.day, ...spec });
  return s.life!.queue[s.life!.queue.length - 1];
}
const deliveredOn = (s: CampaignState, day: number) => s.life!.delivered.filter((r) => r.day === day && r.caused !== true);
const rows = (s: CampaignState, day: number, unitId: string, category: string, extra: Record<string, unknown> = {}) => s.life!.delivered.push({ day, unitId, category, hobby: false, ...extra });

describe('the news queue', () => {
  it('enqueue gives ln ids and an event with no text', () => {
    const s = world();
    const events = enqueue(s, { unitId: ANN, kind: 'event', ref: 'x', what: 'event', category: 'things', day: 20 });
    expect(events).toEqual([{ type: 'news_queued', itemId: 'ln0', unitId: ANN }]);
    expect(s.life!.queue.map((q) => q.id)).toEqual(['ln0']);
  });

  it('deliverNews does nothing with life off or without a block', () => {
    const off = world();
    queue(off, { unitId: ANN });
    off.settings.lifeEvents = 'off';
    const before = structuredClone(off);
    expect(deliverNews(off, reg, 20)).toEqual([]);
    expect(staleSweep(off, 20)).toEqual([]);
    expect(off).toEqual(before);
    const none = campaign(reg, 4);
    expect(deliverNews(none, reg, 20)).toEqual([]);
    expect(none.life).toBeUndefined();
  });
});

describe('the caps', () => {
  it('one a day at normal', () => {
    const s = world();
    for (const [i, u] of [ANN, BEA, CAT, DEE].entries()) queue(s, { unitId: u, category: CATEGORIES[i] });
    const events = deliverNews(s, reg, 20);
    expect(ofType(events, 'news_delivered')).toHaveLength(1);
    expect(deliveredOn(s, 20)).toHaveLength(1);
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered')).toEqual([]); // the same day again: nothing more
  });

  it('rare delivers every other day (the odd ones)', () => {
    const s = world('rare');
    for (let i = 0; i < 6; i++) queue(s, { unitId: [ANN, BEA, CAT, DEE][i % 4], category: CATEGORIES[i] });
    const days = [];
    for (let d = 21; d <= 26; d++) if (ofType(deliverNews(s, reg, d), 'news_delivered').length > 0) days.push(d);
    expect(days).toEqual([21, 23, 25]);
  });

  it('often delivers two a day, never the same woman or category twice', () => {
    const s = world('often');
    for (let i = 0; i < 6; i++) queue(s, { unitId: [ANN, BEA, CAT, DEE][i % 4], category: CATEGORIES[i] });
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered')).toHaveLength(2);
    const [a, b] = deliveredOn(s, 20);
    expect(a.unitId).not.toBe(b.unitId);
    expect(a.category).not.toBe(b.category);
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered')).toEqual([]);
  });

  it('at most two hobby items in any seven days, a player-caused breakthrough included', () => {
    const s = world();
    s.life!.delivered.push({ day: 18, unitId: CAT, category: 'hobby', hobby: true, caused: true }, { day: 19, unitId: CAT, category: 'luck', hobby: true });
    queue(s, { unitId: ANN, kind: 'hobby', ref: 'chess', what: 'milestone', category: 'hobby' });
    const other = queue(s, { unitId: BEA, category: 'body' });
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered').map((e) => e.itemId)).toEqual([other.id]); // the week holds two already
    for (let d = 21; d <= 24; d++) expect(deliverNews(s, reg, d)).toEqual([]);
    // on day 25 the caused one of day 18 is a week old: the hobby item goes
    expect(ofType(deliverNews(s, reg, 25), 'news_delivered')).toHaveLength(1);
    expect(s.life!.delivered.filter((r) => r.hobby && r.day === 25)).toHaveLength(1);
  });

  it('no woman twice within two days', () => {
    const s = world('often');
    queue(s, { unitId: ANN, category: 'body' });
    queue(s, { unitId: ANN, category: 'luck' });
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered')).toHaveLength(1);
    expect(ofType(deliverNews(s, reg, 21), 'news_delivered')).toEqual([]);
    expect(ofType(deliverNews(s, reg, 22), 'news_delivered')).toHaveLength(1);
  });

  it('the category of the last item is never repeated, and the day is skipped rather than filled', () => {
    const s = world();
    rows(s, 19, DEE, 'body');
    queue(s, { unitId: ANN, category: 'body' });
    queue(s, { unitId: BEA, category: 'body' });
    expect(deliverNews(s, reg, 20)).toEqual([]);
    expect(s.life!.delivered).toHaveLength(1);
    queue(s, { unitId: CAT, category: 'luck' });
    expect(ofType(deliverNews(s, reg, 21), 'news_delivered')).toHaveLength(1);
    expect(s.life!.delivered.at(-1)!.category).toBe('luck');
  });

  it('an urgent item bypasses the caps on its day, and counts', () => {
    const s = world();
    rows(s, 19, ANN, 'body'); // Ann was told yesterday, in the category the item shares
    rows(s, 20, DEE, 'luck'); // today's one item is spent
    const urgent = queue(s, { unitId: ANN, category: 'body', urgent: true });
    queue(s, { unitId: BEA, category: 'people' });
    const events = deliverNews(s, reg, 20);
    expect(ofType(events, 'news_delivered').map((e) => e.itemId)).toEqual([urgent.id]); // the ordinary one waits: the day is full
    expect(deliveredOn(s, 20)).toHaveLength(2);
  });
});

describe('the order', () => {
  it('a notable item first, then the oldest, then the category delivered longest ago', () => {
    const s = world();
    s.day = 12;
    const old = queue(s, { unitId: ANN, category: 'body', day: 9 });
    const newer = queue(s, { unitId: BEA, category: 'people', day: 11 });
    const notable = queue(s, { unitId: CAT, category: 'luck', day: 11, notable: true });
    const order: string[] = [];
    for (let d = 12; d <= 14; d++) order.push(...ofType(deliverNews(s, reg, d), 'news_delivered').map((e) => String(e.itemId)));
    expect(order).toEqual([notable.id, old.id, newer.id]);
  });

  it('on a tie of age, the category that was delivered longest ago (or never)', () => {
    const s = world();
    rows(s, 14, DEE, 'body');
    rows(s, 15, DEE, 'people');
    rows(s, 16, DEE, 'luck'); // the last one
    const a = queue(s, { unitId: ANN, category: 'people', day: 18 });
    const b = queue(s, { unitId: BEA, category: 'body', day: 18 });
    // body was delivered before people: it goes first
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered').map((e) => e.itemId)).toEqual([b.id]);
    expect(a.id).not.toBe(b.id);
  });
});

describe('staleness', () => {
  it('an item older than 7 days is never delivered: it becomes a passing mention', () => {
    const s = world();
    const item = queue(s, { unitId: ANN, day: 12 }); // 8 days old on day 20
    const kept = queue(s, { unitId: BEA, category: 'body', day: 18 });
    expect(staleSweep(s, 20)).toEqual([]);
    expect(s.life!.news).toEqual([{ itemId: item.id, unitId: ANN, until: 20 + TUNING.life.newsDays, passing: true }]);
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered').map((e) => e.itemId)).toEqual([kept.id]);
    expect(s.life!.outbox.some((o) => o.itemId === item.id)).toBe(false);
    expect(pendingNews(s, ANN)).toEqual([{ itemId: item.id, text: expect.stringContaining('Ann'), passing: true }]);
  });

  it('seven days is still news', () => {
    const s = world();
    queue(s, { unitId: ANN, day: 13 });
    staleSweep(s, 20);
    expect(s.life!.news).toEqual([]);
    expect(ofType(deliverNews(s, reg, 20), 'news_delivered')).toHaveLength(1);
  });

  it('a passing mention is dropped after three days, with news_stale, and the fact stays hers', () => {
    const s = world();
    const item = queue(s, { unitId: ANN, day: 10 });
    staleSweep(s, 20);
    expect(staleSweep(s, 22)).toEqual([]);
    expect(s.life!.news).toHaveLength(1);
    const events = staleSweep(s, 23);
    expect(ofType(events, 'news_stale')).toEqual([{ type: 'news_stale', itemId: item.id, unitId: ANN }]);
    expect(s.life!.news).toEqual([]);
    expect(s.life!.queue).toEqual([]);
    expect(s.memory.facts.find((f) => f.id === item.factId)!.hiddenFromCommander).toBe(true);
  });

  it('a news directive nobody used goes after three days too', () => {
    const s = world();
    s.settings.unitDms = false;
    const item = queue(s, { unitId: ANN, day: 20 });
    deliverNews(s, reg, 20);
    expect(s.life!.news).toEqual([{ itemId: item.id, unitId: ANN, until: 23 }]);
    expect(ofType(staleSweep(s, 23), 'news_stale')).toHaveLength(1);
    expect(s.life!.queue).toEqual([]);
  });

  it('a scene with her ends the news she did not tell (scene/end)', () => {
    const s = world();
    s.settings.unitDms = false;
    const item = queue(s, { unitId: ANN, day: 20 });
    deliverNews(s, reg, 20);
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    expect(started.state.life!.news).toHaveLength(1);
    const ended = run(started.state, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ofType(ended.events, 'news_stale')).toEqual([{ type: 'news_stale', itemId: item.id, unitId: ANN }]);
    expect(ended.state.life!.news).toEqual([]);
    expect(ended.state.life!.queue).toEqual([]);
    // a scene without her leaves hers alone
    const other = run(run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [BEA], origin: 'event', startIndex: 0 } }).state, reg, { type: 'scene/end', payload: {} });
    expect(other.state.life!.news).toHaveLength(1);
  });
});

describe('the channel', () => {
  const item = (s: CampaignState, over: Partial<NewsItem> = {}): NewsItem => ({
    id: 'ln0', unitId: ANN, kind: 'event', ref: 'found_something', what: 'event', category: 'things', day: 20, ...over,
  });

  it('a talkative woman with DMs on: a DM', () => {
    const s = world();
    s.squad[0].temperament = { talkativeness: 'talkative', volatility: 'steady', humor: 'dry' };
    s.relations[ANN].affinity = -20;
    expect(channelFor(s, reg, item(s))).toBe('dm');
  });

  it('a terse woman at Affinity 50: a DM on about half of 200 hashed items', () => {
    const s = world();
    s.relations[ANN].affinity = 50;
    let dm = 0;
    for (let i = 0; i < 200; i++) if (channelFor(s, reg, item(s, { id: `ln${i}` })) === 'dm') dm++;
    expect(dm).toBeGreaterThan(75);
    expect(dm).toBeLessThan(125);
  });

  it('a terse woman below Affinity 40 never DMs', () => {
    const s = world();
    s.relations[ANN].affinity = 39;
    for (let i = 0; i < 100; i++) expect(channelFor(s, reg, item(s, { id: `ln${i}` }))).toBe('directive');
  });

  it('DMs off (or unknown): a directive, whoever she is', () => {
    const s = world();
    s.squad[0].temperament = { talkativeness: 'talkative', volatility: 'steady', humor: 'dry' };
    s.settings.unitDms = false;
    expect(channelFor(s, reg, item(s))).toBe('directive');
    delete s.settings.unitDms;
    expect(channelFor(s, reg, item(s))).toBe('directive');
  });

  it('a milestone whose trace is a note: a note, DMs or not', () => {
    const s = world();
    const hobby = [...reg.hobbies.values()].find((h) => (h.milestones as Array<{ trace?: string }>).some((m) => m.trace === 'note'))!;
    const m = (hobby.milestones as Array<{ id: string; trace?: string }>).find((x) => x.trace === 'note')!;
    const plain = (hobby.milestones as Array<{ id: string; trace?: string }>).find((x) => x.trace !== 'note')!;
    for (const dms of [true, false]) {
      s.settings.unitDms = dms;
      expect(channelFor(s, reg, item(s, { kind: 'hobby', ref: String(hobby.id), what: 'milestone', milestoneId: m.id, category: 'hobby' }))).toBe('note');
    }
    s.settings.unitDms = false;
    expect(channelFor(s, reg, item(s, { kind: 'hobby', ref: String(hobby.id), what: 'milestone', milestoneId: plain.id, category: 'hobby' }))).toBe('directive');
  });

  it('delivery puts a DM and a note in the outbox and a directive in the news', () => {
    const s = world();
    s.squad[0].temperament = { talkativeness: 'talkative', volatility: 'steady', humor: 'dry' };
    const a = queue(s, { unitId: ANN, category: 'body' });
    expect(deliverNews(s, reg, 20)).toEqual([{ type: 'news_delivered', itemId: a.id, unitId: ANN, channel: 'dm' }]);
    expect(s.life!.outbox).toEqual([{ itemId: a.id, unitId: ANN, channel: 'dm', day: 20 }]);
    expect(s.life!.news).toEqual([]);
    const t = world();
    t.settings.unitDms = false;
    const b = queue(t, { unitId: BEA, category: 'body' });
    expect(deliverNews(t, reg, 20)).toEqual([{ type: 'news_delivered', itemId: b.id, unitId: BEA, channel: 'directive' }]);
    expect(t.life!.news).toEqual([{ itemId: b.id, unitId: BEA, until: 23 }]);
    expect(t.life!.outbox).toEqual([]);
  });

  it('a woman out on a run waits', () => {
    const s = world();
    queue(s, { unitId: ANN });
    s.expedition = { party: [ANN] } as unknown as CampaignState['expedition'];
    expect(deliverNews(s, reg, 20)).toEqual([]);
  });
});

describe('closing the news', () => {
  it('closeNews reveals the fact and takes the item out of the queue, the outbox and the news', () => {
    const s = world();
    const item = queue(s, { unitId: ANN });
    s.life!.outbox.push({ itemId: item.id, unitId: ANN, channel: 'dm', day: 20 });
    s.life!.news.push({ itemId: item.id, unitId: ANN, until: 23 });
    const fact = s.memory.facts.find((f) => f.id === item.factId)!;
    expect(fact.tags).toContain(UNTOLD_TAG);
    expect(closeNews(s, item.id)).toEqual([{ type: 'life_noted', unitId: ANN, itemId: item.id }]);
    expect(fact.hiddenFromCommander).toBeUndefined();
    expect(fact.tags).not.toContain(UNTOLD_TAG);
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.outbox).toEqual([]);
    expect(s.life!.news).toEqual([]);
    expect(closeNews(s, item.id)).toEqual([]);
  });

  it('pendingNews lists her news entries, the oldest item first', () => {
    const s = world();
    const a = queue(s, { unitId: ANN, day: 19 });
    const b = queue(s, { unitId: ANN, day: 17, category: 'body' });
    queue(s, { unitId: BEA });
    s.life!.news.push({ itemId: a.id, unitId: ANN, until: 23 }, { itemId: b.id, unitId: ANN, until: 22, passing: true });
    expect(pendingNews(s, ANN).map((p) => p.itemId)).toEqual([b.id, a.id]);
    expect(pendingNews(s, ANN)[0].passing).toBe(true);
    expect(pendingNews(s, ANN)[1].passing).toBeUndefined();
    expect(pendingNews(s, BEA)).toEqual([]);
    expect(pendingNews(campaign(reg, 4), ANN)).toEqual([]);
  });
});

describe('share_done and trace_note', () => {
  function inOutbox(channel: 'dm' | 'note', over: Spec = { unitId: ANN }): { s: CampaignState; item: NewsItem } {
    const s = world();
    const item = queue(s, over);
    s.life!.outbox.push({ itemId: item.id, unitId: item.unitId, channel, day: 20 });
    return { s, item };
  }

  it('delivers once: the DM is in her thread with its behaviours, the fact is revealed, the outbox is closed', () => {
    const { s, item } = inOutbox('dm');
    const r = run(s, reg, { type: 'life/share_done', payload: { itemId: item.id, text: 'Found a coin in the vents.' } });
    expect(errors(r.events)).toEqual([]);
    const msgs = r.state.dms[ANN];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ from: ANN, text: 'Found a coin in the vents.', initiated: true, read: false });
    // the same message a plain dm/receive makes (behaviours stamped by the same path)
    const plain = run(s, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'Found a coin in the vents.', initiated: true } });
    expect(msgs[0]).toEqual(plain.state.dms[ANN][0]);
    expect(ofType(r.events, 'dm_received')).toHaveLength(1);
    expect(ofType(r.events, 'life_noted')).toEqual([{ type: 'life_noted', unitId: ANN, itemId: item.id }]);
    expect(r.state.life!.outbox).toEqual([]);
    expect(r.state.life!.queue).toEqual([]);
    expect(r.state.memory.facts.find((f) => f.id === item.factId)!.hiddenFromCommander).toBeUndefined();
    // a second call is refused and changes nothing
    const again = run(r.state, reg, { type: 'life/share_done', payload: { itemId: item.id, text: 'Again.' } });
    expect(errors(again.events)).toEqual([expect.objectContaining({ message: 'Already told.' })]);
    expect(again.state).toEqual(r.state);
  });

  it('refuses an item that is a note, an unknown one, and an empty text', () => {
    const { s, item } = inOutbox('note');
    expect(errors(run(s, reg, { type: 'life/share_done', payload: { itemId: item.id, text: 'x' } }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'life/share_done', payload: { itemId: 'ln99', text: 'x' } }).events)).toEqual([expect.objectContaining({ message: 'Already told.' })]);
    const dm = inOutbox('dm');
    expect(errors(run(dm.s, reg, { type: 'life/share_done', payload: { itemId: dm.item.id, text: '  ' } }).events)).toHaveLength(1);
  });

  it('dm/receive without lifeItemId is unchanged, and a lifeItemId that is not waiting is refused', () => {
    const s = world();
    const r = run(s, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'Hello.', initiated: true } });
    expect(ofType(r.events, 'life_noted')).toEqual([]);
    expect(r.state.dms[ANN]).toHaveLength(1);
    const bad = run(s, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'Hello.', initiated: true, lifeItemId: 'ln7' } });
    expect(errors(bad.events)).toEqual([expect.objectContaining({ message: 'Already told.' })]);
    expect(bad.state.dms[ANN] ?? []).toEqual([]);
  });

  it('a trace note is left in her quarters, the fact revealed and the item closed', () => {
    const { s, item } = inOutbox('note', { unitId: ANN, kind: 'hobby', ref: 'sketching', what: 'milestone', category: 'hobby' });
    const r = run(s, reg, { type: 'life/trace_note', payload: { itemId: item.id, text: 'Pencil drawings, pinned over the cot.' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.notes!.list).toEqual([{ id: 'hn1', unitId: ANN, noteId: 'life:sketching', where: 'quarters', text: 'Pencil drawings, pinned over the cot.', day: 20 }]);
    expect(ofType(r.events, 'note_left')).toHaveLength(1);
    expect(ofType(r.events, 'life_noted')).toHaveLength(1);
    expect(r.state.life!.outbox).toEqual([]);
    expect(r.state.life!.queue).toEqual([]);
    expect(r.state.memory.facts.find((f) => f.id === item.factId)!.hiddenFromCommander).toBeUndefined();
    expect(errors(run(r.state, reg, { type: 'life/trace_note', payload: { itemId: item.id, text: 'Again.' } }).events)).toEqual([expect.objectContaining({ message: 'Already told.' })]);
    // a note is on show like any other, with no registry entry behind it
    expect(notesFor(r.state, 'quarters')).toHaveLength(1);
    expect(unreadNotes(r.state)).toBe(1);
  });

  it('a trace note refuses a DM item', () => {
    const { s, item } = inOutbox('dm');
    expect(errors(run(s, reg, { type: 'life/trace_note', payload: { itemId: item.id, text: 'x' } }).events)).toHaveLength(1);
  });
});

describe('a seeded month', () => {
  it('obeys every cap (five women, normal, 30 day ends)', () => {
    const s = campaign(reg, 5);
    s.settings.lifeEvents = 'normal';
    s.settings.unitDms = false; // directives: nothing consumes the outbox in an engine test
    s.life = newLife(7);
    s.world.clocks = [];
    s.squad.filter((u) => u.kind === 'named').forEach((u, i) => {
      u.status = 'active';
      u.temperament = { talkativeness: 'talkative', volatility: 'steady', humor: 'dry' }; // they tell most of what happens (a busier month)
      s.relations[u.id].affinity = 50;
      u.hobbies = [{ id: ['reading', 'cooking', 'chess', 'tinkering', 'training'][i], skill: 0, interest: 50, state: 'active', since: 1, milestones: [] }];
    });
    const rng = structuredClone(s.rng);
    const rowsByDay: Array<{ day: number; unitId: string; category: string; hobby: boolean }> = [];
    for (let d = 1; d <= 30; d++) {
      s.day = d;
      lifeDayStep(s, ctxOf(s, reg));
      // nothing here tells her: every directive that expired is simply gone
      rowsByDay.push(...s.life!.delivered.filter((r) => r.day === d && r.caused !== true));
    }
    expect(s.rng).toEqual(rng); // no rng draw
    expect(rowsByDay.length).toBeGreaterThanOrEqual(6); // the month has something to check
    for (let d = 1; d <= 30; d++) expect(rowsByDay.filter((r) => r.day === d).length).toBeLessThanOrEqual(1);
    for (let d = 1; d <= 30; d++) expect(rowsByDay.filter((r) => r.hobby && r.day <= d && r.day > d - 7).length).toBeLessThanOrEqual(TUNING.life.hobbyWeek);
    for (const r of rowsByDay) expect(rowsByDay.filter((o) => o.unitId === r.unitId && o.day > r.day && o.day - r.day < TUNING.life.sameWomanDays)).toEqual([]);
    rowsByDay.slice(1).forEach((r, i) => expect(r.category).not.toBe(rowsByDay[i].category));
  });
});
