// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import { plainText, revealFact, writeLifeFact } from '../../../src/engine/life/facts';
import { applyLifeEvent } from '../../../src/engine/life/events';
import { newLife } from '../../../src/engine/life/state';
import type { HobbyEntry, LifeEventEntry, OpinionTopicEntry } from '../../../src/engine/life/types';
import type { CampaignState, HobbyState, Opinion } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../../src/settings';
import type { SceneController } from '../../../src/scene/sceneController';
import { FakeStAdapter } from '../../../src/st/fake';
import { Wizard } from '../../../src/setup/wizard';
import { renderCmdrCard } from '../../../src/ui/commander/cmdrCard';
import { h } from '../../../src/ui/dom';
import { renderMarker } from '../../../src/ui/hub/marker';
import { renderRoomPanel } from '../../../src/ui/hub/roomPanel';
import type { HubCtx } from '../../../src/ui/hub/hubScreen';
import { renderHobbies, renderHubDayLine, renderLetsMenu, renderPastimePicker, renderThoughts, renderToldNews } from '../../../src/ui/life/lifeViews';
import { renderOpsTab } from '../../../src/ui/ops/opsTab';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { renderWorldParams } from '../../../src/ui/setup/worldParams';
import { renderSysTab } from '../../../src/ui/shell/sysTab';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { campaign, errors, loadCore, run } from '../../helpers/world';
import { markedWithout, markerCount, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const mine = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const hobby = (id: string): HobbyEntry => reg.hobbies.get(id) as unknown as HobbyEntry;
const topic = (id: string): OpinionTopicEntry => reg.opinionTopics.get(id) as unknown as OpinionTopicEntry;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 47.31, interest: 63.17, state: 'active', since: 1, milestones: [], ...over });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });

/** Day 40, afternoon, life normal. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.slot = 'afternoon';
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  return s;
}
const ctx = (s: CampaignState) => ({ state: s, registries: reg, unitId: ANN, knowledge: buildKnowledge(s, { ...DEFAULT_SETTINGS }) });
const texts = (el: Element) => el.textContent ?? '';

describe('THOUGHTS', () => {
  const T = 'corporations';
  const pos = () => topic(T).positions.map((p) => p.id);
  function opinions(s: CampaignState, over: Record<string, Opinion>): void {
    mine(s).opinions = over;
  }

  it('lists only voiced opinions and shows a changed mind', () => {
    const s = world();
    const [p0, p1] = pos();
    opinions(s, {
      [T]: { position: p1, strength: 'held', formedDay: 3, voicedDay: 20, history: [{ day: 30, from: p0, to: p1 }] },
      books: { position: topic('books').positions[0].id, strength: 'held', formedDay: 3, text: 'SENTINEL-UNVOICED' }, // never said: never shown
    });
    const host = mount();
    renderThoughts(host, ctx(s));
    expect(host.querySelectorAll('[data-thought]')).toHaveLength(1);
    expect(host.querySelector(`[data-thought="${T}"]`)).not.toBeNull();
    expect(texts(host)).not.toContain('SENTINEL-UNVOICED');
    expect(texts(host)).not.toContain(String(topic('books').label));
    expect(texts(host)).toContain(plainText(topic(T).positions[1].description));
    expect(texts(host)).toContain(`She used to think: ${plainText(topic(T).positions[0].description)}`);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('uses her own words when she has them, and says nothing yet with nothing voiced', () => {
    const s = world();
    opinions(s, { [T]: { position: pos()[2], strength: 'held', formedDay: 3, voicedDay: 20, text: 'A ladder, dirty rungs.' } });
    const host = mount();
    renderThoughts(host, ctx(s));
    expect(texts(host)).toContain('A ladder, dirty rungs.');
    const none = world();
    opinions(none, { [T]: { position: pos()[2], strength: 'strong', formedDay: 3 } });
    const empty = mount();
    renderThoughts(empty, ctx(none));
    expect(empty.querySelector('[data-empty="thoughts"]')).not.toBeNull();
    expect(empty.querySelectorAll('[data-thought]')).toHaveLength(0);
  });
});

describe('HOBBIES', () => {
  /** A milestone's fact, told (revealed) or not. */
  function milestone(s: CampaignState, hobbyId: string, n: number, told: boolean): void {
    const m = hobby(hobbyId).milestones[n];
    const f = writeLifeFact(s, ANN, `Ann (${hobbyId}): ${plainText(m.line)}`, ['hobby', hobbyId, m.id], 1);
    if (told) revealFact(s, f.id);
  }

  it('shows told milestones only, a word for how keen she is and no number', () => {
    const s = world();
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id, ms[1].id] })];
    milestone(s, 'reading', 0, true);
    milestone(s, 'reading', 1, false); // reached, not told
    const host = mount();
    renderHobbies(host, ctx(s));
    const row = host.querySelector('[data-hobby-view="reading"]')!;
    expect([...row.querySelectorAll('[data-milestone]')].map((li) => li.textContent)).toEqual([plainText(ms[0].line)]);
    expect(texts(host)).not.toContain(plainText(ms[1].line));
    expect(row.querySelector('[data-word]')!.getAttribute('data-word')).toBe('steady'); // interest 63: not yet keen
    expect(texts(host)).not.toMatch(/47|63|\d\.\d/);
    expect(row.querySelector('[data-trace]')).toBeNull(); // the prop is the second step, which she has not told
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('a prop trace of a told milestone reads "in her quarters", and the words follow the cycle', () => {
    const s = world();
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id, ms[1].id], interest: 90 }), take('tinkering', { state: 'cooling' }), take('plants', { state: 'dropped' })];
    milestone(s, 'reading', 0, true);
    milestone(s, 'reading', 1, true);
    const host = mount();
    renderHobbies(host, ctx(s));
    expect(host.querySelector('[data-hobby-view="reading"] [data-trace]')!.textContent).toBe(`in her quarters: ${plainText(hobby('reading').traceText!)}`);
    const word = (id: string) => host.querySelector(`[data-hobby-view="${id}"] [data-word]`)!.getAttribute('data-word');
    expect([word('reading'), word('tinkering'), word('plants')]).toEqual(['keen', 'cooling', 'put away']);
  });

  it('leaves out a hobby she took up off-screen until it is told, and a milestone with no fact (a starting skill) counts as told', () => {
    const s = world();
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id] }), take('chess')];
    writeLifeFact(s, ANN, 'Ann has taken up chess.', ['hobby', 'chess', 'started'], 1); // untold
    const host = mount();
    renderHobbies(host, ctx(s));
    expect(host.querySelector('[data-hobby-view="chess"]')).toBeNull();
    expect(host.querySelectorAll('[data-hobby-view="reading"] [data-milestone]')).toHaveLength(1);
  });

  it('an item of the queue keeps its milestone untold even when its fact is gone', () => {
    const s = world();
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id] })];
    s.life!.queue.push({ id: 'ln0', unitId: ANN, kind: 'hobby', ref: 'reading', what: 'milestone', milestoneId: ms[0].id, category: 'hobby', day: 39 });
    const host = mount();
    renderHobbies(host, ctx(s));
    expect(host.querySelectorAll('[data-milestone]')).toHaveLength(0);
  });

  it('the news she has told lists the told facts of her days, newest first, and nothing untold', () => {
    const s = world();
    const a = writeLifeFact(s, ANN, 'Ann: found a coin.', ['found_something'], 1);
    writeLifeFact(s, ANN, 'Ann: SENTINEL-UNTOLD.', ['wrote_journal'], 1);
    const c = writeLifeFact(s, ANN, 'Ann: mended a boot.', ['mended'], 1);
    revealFact(s, a.id);
    revealFact(s, c.id);
    const host = mount();
    renderToldNews(host, ctx(s));
    expect([...host.querySelectorAll('[data-told]')].map((li) => li.textContent)).toEqual(['Ann: mended a boot.', 'Ann: found a coin.']);
    expect(texts(host)).not.toContain('SENTINEL-UNTOLD');
    expect(markedWithout(host)).toEqual([]);
    const quiet = mount();
    renderToldNews(quiet, ctx(world()));
    expect(quiet.childElementCount).toBe(0);
  });
});

describe('the squad dossier', () => {
  function squad(s: CampaignState, editLock = true) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = mount();
    renderSquadTab(host, {
      st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => ({ ...getSettings(st), editLock }),
      onNewCampaign: vi.fn(), life: { dispatch: () => [] },
    });
    return host;
  }

  it('draws THOUGHTS, what she does and what she has told under the editors, only from what was told or voiced', () => {
    const s = world();
    mine(s).opinions = { corporations: { position: topic('corporations').positions[0].id, strength: 'held', formedDay: 3, voicedDay: 20 }, books: { position: topic('books').positions[0].id, strength: 'held', formedDay: 3 } };
    const ms = hobby('reading').milestones;
    mine(s).hobbies = [take('reading', { milestones: [ms[0].id, ms[1].id] })];
    const f0 = writeLifeFact(s, ANN, 'Ann read one.', ['hobby', 'reading', ms[0].id], 1);
    writeLifeFact(s, ANN, 'Ann read two.', ['hobby', 'reading', ms[1].id], 1);
    revealFact(s, f0.id);
    const host = squad(s);
    expect(host.querySelector('[data-view="thoughts"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-thought]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-hobby-view="reading"] [data-milestone]')).toHaveLength(1);
    // the editor's dots count only what she told, with the lock on
    expect(host.querySelector('.alius-life-hobbies [data-milestones]')!.getAttribute('data-milestones')).toBe('1');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('with life never switched on and nothing set up, no view is drawn', () => {
    const s = campaign(reg, 4);
    const host = squad(s);
    expect(host.querySelector('[data-view]')).toBeNull();
  });
});

describe('the CMDR card', () => {
  function card(s: CampaignState): HTMLElement {
    const host = mount();
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    return host;
  }

  it('shows what the commander has learned as descriptors, no number', () => {
    const s = world();
    s.commander.hobbySkill = { tinkering: 35, reading: 5, music: 80 };
    const host = card(s);
    const rows = [...host.querySelectorAll('[data-commander-hobby]')].map((el) => [el.getAttribute('data-commander-hobby'), el.textContent]);
    expect(rows.map((r) => r[0])).toEqual(['tinkering', 'reading', 'music']);
    expect(rows[0][1]).toContain('GETTING THERE');
    expect(rows[1][1]).toContain('NOT YET');
    expect(rows[2][1]).toContain('GOOD AT IT');
    expect(texts(host)).not.toMatch(/\b(35|80)\b/);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('shows nothing when she has taught the commander nothing', () => {
    const host = card(world());
    expect(host.querySelector('[data-commander-hobby]')).toBeNull();
    expect(host.querySelector('[data-commander-hobbies]')).toBeNull();
  });
});

describe('the hub line', () => {
  const anyone = () => [...reg.lifeEvents.values()].find((e) => (e as unknown as LifeEventEntry).share === 'anyone' && (e as unknown as LifeEventEntry).becomes === undefined) as unknown as LifeEventEntry;
  const keeps = () => [...reg.lifeEvents.values()].find((e) => (e as unknown as LifeEventEntry).share === 'keeps' && (e as unknown as LifeEventEntry).keepsUnless === undefined && (e as unknown as LifeEventEntry).becomes === undefined) as unknown as LifeEventEntry;
  const line = (s: CampaignState): HTMLElement => {
    const host = mount();
    renderHubDayLine(host, s, reg, ANN);
    return host;
  };

  it('shows the newest event of the last two days under her name', () => {
    const s = world();
    applyLifeEvent(s, reg, ANN, anyone(), 38); // two days ago
    const host = line(s);
    expect(host.querySelector('[data-hub-line]')!.textContent).toBe(plainText(anyone().hub));
    expect(host.querySelector('[data-hub-line]')!.getAttribute('data-analyze')).toBe(`lifeEvents:${anyone().id}`);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('shows nothing after two days, for what she keeps to herself, or with life off', () => {
    const old = world();
    applyLifeEvent(old, reg, ANN, anyone(), 36);
    expect(line(old).childElementCount).toBe(0);
    const kept = world();
    applyLifeEvent(kept, reg, ANN, keeps(), 40);
    expect(kept.life!.units[ANN].hub).toBeUndefined();
    expect(line(kept).childElementCount).toBe(0);
    const off = world();
    applyLifeEvent(off, reg, ANN, anyone(), 40);
    delete off.settings.lifeEvents;
    expect(line(off).childElementCount).toBe(0);
  });

  it('the marker carries the line for hover, and nothing without it', () => {
    const s = world();
    expect(renderMarker(s, reg, mine(s)).getAttribute('data-life-line')).toBeNull();
    applyLifeEvent(s, reg, ANN, anyone(), 40);
    const m = renderMarker(s, reg, mine(s));
    expect(m.getAttribute('data-life-line')).toBe(plainText(anyone().hub));
    expect(m.getAttribute('aria-label')).toContain(plainText(anyone().hub));
  });
});

describe('the hub room panel', () => {
  function panel(s: CampaignState, onTimeTogether?: (u: string, p: string) => void): HTMLElement {
    const ops = { getState: () => s, getLoad: () => ({ kind: 'ok' as const, state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(), ...(onTimeTogether ? { onTimeTogether } : {}) };
    const hubCtx = { getState: () => s, getLoad: ops.getLoad, registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }), ops, onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null } as unknown as HubCtx;
    const room = reg.hubRooms.get('mess_hall') ?? [...reg.hubRooms.values()][0];
    const el = renderRoomPanel(room, s, hubCtx, [{ unitId: ANN, roomId: String(room.id), reason: 'routine' }], { readOnly: false, onClose: vi.fn() });
    document.body.append(el);
    return el;
  }
  const anyone = () => [...reg.lifeEvents.values()].find((e) => (e as unknown as LifeEventEntry).share === 'anyone' && (e as unknown as LifeEventEntry).becomes === undefined) as unknown as LifeEventEntry;

  it('writes the hub line under her name and opens the pastime picker from TIME TOGETHER', () => {
    const s = world();
    applyLifeEvent(s, reg, ANN, anyone(), 40);
    const onTimeTogether = vi.fn();
    const el = panel(s, onTimeTogether);
    expect(el.querySelector('.alius-room-person[data-unit="unit_ann"] [data-hub-line]')!.textContent).toBe(plainText(anyone().hub));
    const menu = el.querySelector('[data-quiet-hour="unit_ann"]')!;
    expect(menu).not.toBeNull();
    (menu.querySelector('[data-pastime="tidy_her_quarters"]') as HTMLElement).click();
    expect(onTimeTogether).toHaveBeenCalledWith(ANN, 'tidy_her_quarters');
    expect(markedWithout(el)).toEqual([]);
    expect(unresolved(el, env(s))).toEqual([]);
    expect(unreachable(el)).toEqual([]);
  });

  it('draws neither with life off or without the callback', () => {
    const off = world();
    applyLifeEvent(off, reg, ANN, anyone(), 40);
    delete off.settings.lifeEvents;
    const el = panel(off, vi.fn());
    expect(el.querySelector('[data-quiet-hour]')).toBeNull();
    expect(el.querySelector('[data-hub-line]')).toBeNull();
    expect(panel(world()).querySelector('[data-quiet-hour]')).toBeNull();
  });
});

describe('the pastime picker', () => {
  it('lists the pastimes she can have now and calls onPick', () => {
    const s = world();
    const onPick = vi.fn();
    const host = mount();
    renderPastimePicker(host, { state: s, registries: reg, unitId: ANN, onPick });
    const ids = [...host.querySelectorAll('[data-pastime]')].map((b) => b.getAttribute('data-pastime'));
    expect(ids.length).toBeGreaterThan(2);
    expect(ids).toContain('tidy_her_quarters');
    expect(ids).not.toContain('tea_at_night'); // night only
    expect(ids).not.toContain('patch_each_other'); // no run
    (host.querySelector('[data-pastime="tidy_her_quarters"]') as HTMLElement).click();
    expect(onPick).toHaveBeenCalledWith('tidy_her_quarters');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('says so when nothing is open', () => {
    const s = world();
    s.relations[ANN].affinity = -50;
    const host = mount();
    renderPastimePicker(host, { state: s, registries: reg, unitId: ANN, onPick: vi.fn() });
    expect(host.querySelector('[data-empty="pastimes"]')).not.toBeNull();
  });

  it('the OPS tab shows one card for a quiet hour (life on), whose picker calls onTimeTogether', () => {
    const s = world();
    const onTimeTogether = vi.fn();
    const host = mount();
    const ops = { getState: () => s, getLoad: () => ({ kind: 'ok' as const, state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(), onTimeTogether };
    renderOpsTab(host, ops);
    const card = host.querySelector('[data-pastime-card]')!;
    expect(card).not.toBeNull();
    expect(host.querySelector('[data-do="time_together"]')).toBeNull(); // not the plain [ DO ]
    const sel = card.querySelector<HTMLSelectElement>('select[name="companion"]')!;
    sel.value = ANN;
    sel.dispatchEvent(new Event('change'));
    (card.querySelector('[data-pastime="tidy_her_quarters"]') as HTMLElement).click();
    expect(onTimeTogether).toHaveBeenCalledWith(ANN, 'tidy_her_quarters');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    // life off, or no callback: no card
    const off = world();
    delete off.settings.lifeEvents;
    const quiet = mount();
    renderOpsTab(quiet, { ...ops, getState: () => off });
    expect(quiet.querySelector('[data-pastime-card]')).toBeNull();
    const noCb = mount();
    renderOpsTab(noCb, { ...ops, onTimeTogether: undefined });
    expect(noCb.querySelector('[data-pastime-card]')).toBeNull();
  });
});

describe("the scene's LET'S menu", () => {
  function scene(participants = [ANN], over: { life?: boolean } = {}) {
    let state = world();
    if (over.life === false) delete state.settings.lifeEvents;
    const started = run(state, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants, origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    state = started.state;
    const controller = {
      send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(),
      transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(),
    } as unknown as SceneController;
    const onPastime = vi.fn();
    const host = mount();
    renderSceneScreen(host, {
      controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
      settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onPastime,
    });
    return { host, onPastime };
  }

  it('lists the pastimes that fit the place and slot of a private scene with one woman', () => {
    const t = scene();
    const menu = t.host.querySelector('[data-lets]')!;
    expect(menu).not.toBeNull();
    const ids = [...menu.querySelectorAll('[data-pastime]')].map((b) => b.getAttribute('data-pastime'));
    expect(ids).toContain('fix_gear'); // the workshop, in the afternoon
    expect(ids).not.toContain('cook_together');
    (menu.querySelector('[data-pastime="fix_gear"]') as HTMLElement).click();
    expect(t.onPastime).toHaveBeenCalledWith(ANN, 'fix_gear');
    expect(markedWithout(t.host.querySelector('[data-lets]') as HTMLElement)).toEqual([]);
  });

  it('is not drawn in a group scene, with life off, or without the callback', () => {
    expect(scene([ANN, BEA]).host.querySelector('[data-lets]')).toBeNull();
    expect(scene([ANN], { life: false }).host.querySelector('[data-lets]')).toBeNull();
  });

  it('renderLetsMenu keeps itself closed until asked and lists only what fits', () => {
    const s = world();
    const host = mount();
    renderLetsMenu(host, { state: s, registries: reg, unitId: ANN, onPick: vi.fn(), at: { locationId: 'laundry', slot: 'afternoon' } });
    expect((host.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect([...host.querySelectorAll('[data-pastime]')].map((b) => b.getAttribute('data-pastime'))).toEqual(['laundry_together']);
  });
});

describe('SYS › Life events', () => {
  function sys(state: CampaignState | null, dispatch = vi.fn((_a: { type: string; payload?: unknown }) => [] as Array<{ type: string; [k: string]: unknown }>)) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = mount();
    renderSysTab(host, { st, getState: () => state, getLoad: () => ({ kind: 'none' }), getRegistries: () => reg, dispatch, toast: vi.fn(), modal: async () => null, onSettingsChanged: vi.fn() });
    return { host, dispatch, select: () => host.querySelector<HTMLSelectElement>('select[name="lifeEvents"]')! };
  }

  it('shows the mode and dispatches set_frequency on a change', () => {
    const s = world();
    s.settings.lifeEvents = 'rare';
    const t = sys(s);
    expect(t.select().value).toBe('rare');
    expect([...t.select().options].map((o) => o.value)).toEqual(['off', 'rare', 'normal', 'often']);
    t.select().value = 'often';
    t.select().dispatchEvent(new Event('change'));
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'life/set_frequency', payload: { mode: 'often' } });
    expect(t.select().closest('[data-analyze]')!.getAttribute('data-analyze')).toBe('glossary:setting_life_events');
  });

  it('an old save shows off', () => {
    const s = campaign(reg, 4);
    expect(sys(s).select().value).toBe('off');
  });

  it('a refused change is reported and the select snaps back; without a campaign it is disabled', () => {
    const s = world();
    const t = sys(s, vi.fn(() => [{ type: 'error', message: 'No.' }]));
    t.select().value = 'often';
    t.select().dispatchEvent(new Event('change'));
    expect(t.select().value).toBe('normal');
    expect(sys(null).select().disabled).toBe(true);
  });
});

describe('the wizard select', () => {
  it('defaults to normal, feeds the wizard and is analyzable', () => {
    const wizard = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn() as never, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
    wizard.setStart('start_vesper');
    const host = mount();
    const draw = () => renderWorldParams(host, { wizard, registries: reg });
    wizard.subscribe(draw);
    draw();
    const select = () => host.querySelector<HTMLSelectElement>('select[name="lifeEvents"]')!;
    expect(select().value).toBe('normal');
    expect([...select().options].map((o) => o.value)).toEqual(['off', 'rare', 'normal', 'often']);
    expect(select().closest('[data-analyze]')!.getAttribute('data-analyze')).toBe('glossary:setting_life_events');
    expect(markedWithout(host.querySelector('.alius-life-events') as HTMLElement)).toEqual([]);
    select().value = 'rare';
    select().dispatchEvent(new Event('change'));
    expect(wizard.state.lifeEvents).toBe('rare');
    expect(select().value).toBe('rare');
    expect(markerCount(host)).toBeGreaterThan(0);
  });
});
