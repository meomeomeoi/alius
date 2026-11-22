// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBlockingProviders } from '../../src/analysis/providers/blocking';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import { stagingInput } from '../../src/blocking/input';
import type { Registries } from '../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../src/engine/blocking';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderBlockingStrip } from '../../src/ui/scene/blockingStrip';
import { enable } from '../helpers/bonds';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerBlockingProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBlockingHooks();
});

const ANN = 'unit_ann';
function scene(over: { stateId?: string; on?: string[]; loc?: string } = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: over.stateId ?? 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const put = (s: CampaignState, ...changes: BlockingChange[]): CampaignState => {
  const d = structuredClone(s);
  for (const [i, c] of changes.entries()) setBlocking(d, { registries: reg }, c, { at: i + 1, source: i === 0 ? 'chip' : 'engine' });
  return d;
};
function draw(state: CampaignState) {
  const host = h('div');
  document.body.append(host);
  const onStage = vi.fn();
  renderBlockingStrip(host, { state, registries: reg, onStage });
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)];
  return { host, onStage, q, qa };
}
const env = (state: CampaignState | null) => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the BLOCKING strip', () => {
  it('is absent when the blocking is not live (nothing is drawn)', () => {
    const v = draw(scene({ stateId: 'comrade' }));
    expect(v.host.innerHTML).toBe('');
    const noScene = draw(campaign(reg, 4));
    expect(noScene.host.innerHTML).toBe('');
  });

  it('shows a row per person with the set fields as chips, in participant order and then the commander', () => {
    const s = put(scene({ on: ['restraint', 'humiliation'] }),
      { person: ANN, field: 'posture', value: 'sitting' }, { person: ANN, field: 'anchor', value: 'at_desk' }, { person: ANN, field: 'activity', value: 'on_comms' },
      { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { person: COMMANDER, field: 'worn', value: 'ring_gag' });
    const v = draw(s);
    expect(v.qa('.alius-blocking-row').map((r) => r.dataset.person)).toEqual([ANN, COMMANDER]);
    const chips = (person: string) => v.qa(`.alius-blocking-row[data-person="${person}"] .alius-chip`).map((c) => c.dataset.analyze);
    expect(chips(ANN)).toEqual(['blockingPostures:sitting', 'blockingAnchors:at_desk', 'blockingActivities:on_comms']);
    expect(chips(COMMANDER)).toEqual(['blockingPostures:kneeling_upright', 'blockingItems:ring_gag']);
    expect(v.q('.alius-blocking-row[data-person="unit_ann"]')!.textContent).toContain('Ann');
    expect(v.q('.alius-blocking-row[data-person="commander"] .alius-chip[data-analyze="blockingItems:ring_gag"]')!.textContent).toBe('Ring gag');
  });

  it('a live scene with nothing set still draws the commander\'s movement chips and the menu', () => {
    const v = draw(scene());
    expect(v.q('.alius-blocking')).not.toBeNull();
    expect(v.qa('.alius-chip')).toHaveLength(0);
    expect(v.qa('[data-move]').map((b) => b.dataset.move)).toEqual(['kneel', 'sit', 'stand', 'crawl', 'lie']);
    expect(v.q('.alius-blocking-add')).not.toBeNull();
  });

  it('a mobility-frozen chip is aria-disabled with the reason, and clicking it does nothing', () => {
    registerFrameReader(() => 'play');
    const s = put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'contact', value: 'straddled', with: ANN });
    const v = draw(s);
    for (const b of v.qa('[data-move]')) {
      expect(b.getAttribute('aria-disabled'), b.dataset.move).toBe('true');
      expect(b.title).toBe('The commander cannot move: held in place.');
    }
    v.q('[data-move="kneel"]')!.click();
    expect(v.onStage).not.toHaveBeenCalled();
    // a chip that is allowed is not disabled
    const free = draw(scene());
    expect(free.q('[data-move="sit"]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('limited movement disables standing but not sitting', () => {
    const s = put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'spreader_bar' });
    const v = draw(s);
    expect(v.q('[data-move="stand"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(v.q('[data-move="sit"]')!.getAttribute('aria-disabled')).toBeNull();
    expect(v.q('[data-move="crawl"]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('a movement chip goes through stage with the posture (the controller adds `at`)', () => {
    const v = draw(scene());
    v.q('[data-move="kneel"]')!.click();
    expect(v.onStage).toHaveBeenCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright' } });
    v.q('[data-move="lie"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'lying_back' } });
  });
});

describe('the [ + ] menu', () => {
  const ids = (v: ReturnType<typeof draw>, group: string) => v.qa(`.alius-blocking-add [data-group="${group}"]`).map((b) => b.dataset.id!);

  it('lists only allowed entries: the same filter as the reading\'s vocabulary', () => {
    const s = scene({ loc: 'mess_hall' });
    const v = draw(s);
    const vocab = stagingInput(s, reg, [ANN]).staging!.vocabulary;
    expect(ids(v, 'anchor').sort()).toEqual([...vocab.anchor].sort());
    expect(new Set(ids(v, 'contact'))).toEqual(new Set(vocab.contact));
    expect(ids(v, 'worn').sort()).toEqual([...vocab.worn].sort());
    expect(ids(v, 'anchor')).not.toContain('under_desk');
    expect(ids(v, 'worn')).not.toContain('blindfold');
    expect(ids(v, 'contact')).not.toContain('human_chair');
    expect(ids(v, 'worn')).toContain('collar');
  });

  it('switching the tag on, the frame to play and the room to one with a desk adds entries; her own limit is honoured', () => {
    registerFrameReader(() => 'play');
    const v = draw(scene({ on: ['restraint', 'objectification'] }));
    expect(ids(v, 'worn')).toEqual(expect.arrayContaining(['blindfold', 'hood']));
    expect(ids(v, 'contact')).toContain('human_chair');
    expect(ids(v, 'anchor')).toContain('under_desk');
  });

  it('an entry a gate refuses right now (a taken slot) is shown disabled with its reason', () => {
    const s = put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' });
    const v = draw(s);
    const hood = v.q('.alius-blocking-add [data-group="worn"][data-id="hood"]')!;
    expect(hood.getAttribute('aria-disabled')).toBe('true');
    expect(hood.title).toMatch(/eyes/);
    const collar = v.q('.alius-blocking-add [data-group="worn"][data-id="collar"]')!;
    expect(collar.getAttribute('aria-disabled')).toBeNull();
  });

  it('an entry goes through stage: an anchor, an item, and a contact with the soldier and its direction', () => {
    registerFrameReader(() => 'play');
    const v = draw(scene({ on: ['restraint', 'objectification'] }));
    v.q('[data-group="anchor"][data-id="at_her_feet"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'anchor', value: 'at_her_feet' } });
    v.q('[data-group="worn"][data-id="collar"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'worn', value: 'collar' } });
    v.q('[data-group="contact"][data-id="human_chair"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'contact', value: 'human_chair', with: ANN } });
    // a contact that works both ways is offered once for each direction
    const spooning = v.qa('[data-group="contact"][data-id="spooning"]');
    expect(spooning.map((b) => b.dataset.direction)).toEqual(['from', 'to']);
    spooning[1]!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'contact', value: 'spooning', with: ANN, direction: 'to' } });
  });

  it('a worn item of hers (a strap) is set on her', () => {
    registerFrameReader(() => 'play');
    const v = draw(scene({ on: ['strap', 'explicit_scenes'] }));
    v.q('[data-group="worn"][data-id="strap"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: ANN, field: 'worn', value: 'strap' } });
  });

  it('an item or a contact on a chip can be removed with its × button', () => {
    registerFrameReader(() => 'play');
    const s = put(scene({ on: ['restraint', 'worship'] }), { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN });
    const v = draw(s);
    const x = v.qa('[data-action="remove"]');
    expect(x.map((b) => `${b.dataset.person}:${b.dataset.id}`).sort()).toEqual([`${ANN}:foot_worship`, `${COMMANDER}:hood`].sort());
    v.q('[data-action="remove"][data-id="hood"]')!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'removed', value: 'hood' } });
    expect(v.q('[data-action="remove"]')!.getAttribute('aria-label')).toMatch(/^Remove /);
  });
});

describe('analyze', () => {
  it('every element resolves, is reachable and carries data-analyze', () => {
    registerFrameReader(() => 'play');
    const s = put(scene({ on: ['restraint', 'worship', 'objectification'] }),
      { person: ANN, field: 'posture', value: 'sitting' }, { person: ANN, field: 'activity', value: 'on_comms' },
      { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN }, { person: COMMANDER, field: 'anchor', value: 'under_desk' });
    const v = draw(s);
    expect(markedWithout(v.host)).toEqual([]);
    expect(unresolved(v.host, env(s))).toEqual([]);
    expect(unreachable(v.host)).toEqual([]);
    expect(v.qa('[data-analyze]').length).toBeGreaterThan(20);
  });

  it('a live reading names who has it, who set it and in which exchange; an unset value reads only its description', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['restraint'], loc: 'quarters_commander' });
    s.scene!.exchanges = 3;
    s = put(s, { person: COMMANDER, field: 'worn', value: 'hood' });
    const read = (address: string, state: CampaignState | null) => readingFor(parseSubject(address, null)!, env(state))?.lines ?? [];
    expect(read('blockingItems:hood', s)).toEqual(['In the scene: the commander wears it, set by a chip in exchange 3.']);
    expect(read('blockingItems:blindfold', s)).toEqual([]);
    expect(read('blockingItems:hood', null)).toEqual(['No campaign loaded.']);
    expect(read('blockingItems:hood', scene({ on: ['restraint'] }))).toEqual([]);
    const posture = put(scene(), { person: COMMANDER, field: 'posture', value: 'sitting' }, { person: ANN, field: 'posture', value: 'sitting' });
    expect(read('blockingPostures:sitting', posture)).toEqual(['In the scene: Ann is in it, set by the game in exchange 0; the commander is in it, set by a chip in exchange 0.']);
  });

  it('a value the game set at the start of the scene (no log entry) reads as set by the game', () => {
    const s = scene();
    s.scene!.blocking = { [ANN]: { activity: 'on_comms' } };
    const lines = readingFor(parseSubject('blockingActivities:on_comms', null)!, env(s))?.lines ?? [];
    expect(lines).toEqual(['In the scene: Ann is doing it, set by the game at the start.']);
  });

  it('the glossary entry of the strip exists and has no pronoun for the commander', () => {
    const g = reg.glossary.get('blocking_strip')!;
    expect(g).toBeDefined();
    expect(`${String(g.short)} ${String(g.long)}`).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});

describe('in the scene screen', () => {
  it('draws the strip only while live, and a chip goes through the controller\'s stage when no onStage is given', async () => {
    const { renderSceneScreen } = await import('../../src/ui/scene/sceneScreen');
    const { FakeStAdapter } = await import('../../src/st/fake');
    const draws = (state: CampaignState, over: Record<string, unknown> = {}) => {
      const stage = vi.fn(() => []);
      const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(), stage } as never;
      const host = h('div');
      document.body.append(host);
      const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
      renderSceneScreen(host, { controller, getState: () => state, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), ...over });
      return { host, stage };
    };
    expect(draws(scene({ stateId: 'comrade' })).host.querySelector('.alius-dial')).toBeNull(); // P10e: the scene draws the dial, the strip's model
    const live = draws(scene());
    expect(live.host.querySelector('.alius-dial')).not.toBeNull();
    live.host.querySelector<HTMLElement>('[data-move="sit"]')!.click();
    expect(live.stage).toHaveBeenCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting' } });
    const onStage = vi.fn();
    const own = draws(scene(), { onStage });
    own.host.querySelector<HTMLElement>('[data-move="stand"]')!.click();
    expect(onStage).toHaveBeenCalledOnce();
    expect(own.stage).not.toHaveBeenCalled();
  });
  it('an item or a contact is taken off with its × in the scene too, and a person\'s row shows what is set (review C1)', async () => {
    registerFrameReader(() => 'play');
    const { renderSceneScreen } = await import('../../src/ui/scene/sceneScreen');
    const { FakeStAdapter } = await import('../../src/st/fake');
    const s = put(scene({ on: ['restraint', 'worship'] }), { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN }, { person: ANN, field: 'posture', value: 'sitting' });
    const stage = vi.fn(() => []);
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(), stage } as never;
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }), settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn() });
    const x = [...host.querySelectorAll<HTMLElement>('[data-action="remove"]')];
    expect(x.map((b) => `${b.dataset.person}:${b.dataset.id}`).sort()).toEqual([`${ANN}:foot_worship`, `${COMMANDER}:hood`].sort());
    expect([...host.querySelectorAll<HTMLElement>('.alius-blocking-row')].map((r) => r.dataset.person)).toEqual([ANN, COMMANDER]);
    expect(host.querySelector('.alius-blocking-row[data-person="unit_ann"] .alius-chip[data-analyze="blockingPostures:sitting"]')).not.toBeNull();
    host.querySelector<HTMLElement>('[data-action="remove"][data-id="hood"]')!.click();
    expect(stage).toHaveBeenCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'removed', value: 'hood' } });
  });
});
