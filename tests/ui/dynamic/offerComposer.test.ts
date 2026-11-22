// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { createDynamic } from '../../../src/dynamic/controller';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { offerChoices, type OfferComposition } from '../../../src/engine/dynamic/offer';
import type { Frame, OfferTab } from '../../../src/engine/dynamic/types';
import { OFFER_TABS } from '../../../src/engine/dynamic/types';
import { zoneTag } from '../../../src/engine/dynamic/zones';
import { addFact } from '../../../src/engine/memory/facts';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderCommsTab } from '../../../src/ui/comms/commsTab';
import { drawOfferChips, renderOfferComposer } from '../../../src/ui/dynamic/offerComposer';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { campaign, errors, loadCore, run } from '../../helpers/world';
import { worldHarness } from '../../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const ON = ['restraint', 'worship', 'service', 'humiliation', 'objectification'];
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

function world(opts: { frame?: Frame; on?: string[]; shown?: string[] } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  unitOf(s, ANN).expectations = { worship: { feet: { attitude: 'craves' }, toes: { attitude: 'enjoys' }, hands: { attitude: 'dislikes' } } };
  s.content = { enabled: opts.on ?? ON };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: opts.frame ?? 'play', hold: 25 };
  for (const t of opts.shown ?? []) addFact(s, { about: [ANN], text: `AUTHOR TO WRITE: shown ${t}`, tags: ['dynamic', zoneTag(t)], importance: 2, day: s.day, knownBy: [ANN] });
  return s;
}

/** The composer drawn for Ann over `s`. */
function open(s: CampaignState, over: { onSend?: ReturnType<typeof vi.fn>; onClose?: ReturnType<typeof vi.fn> } = {}) {
  const host = h('div');
  document.body.append(host);
  const onSend = over.onSend ?? vi.fn();
  const onClose = over.onClose ?? vi.fn();
  renderOfferComposer(host, { state: s, reg, unitId: ANN, choices: offerChoices(s, reg, ANN), onSend, onClose });
  return { host, onSend, onClose };
}
const tab = (host: HTMLElement, id: OfferTab) => host.querySelector<HTMLButtonElement>(`[data-offer-tab="${id}"]`)!;
const entry = (host: HTMLElement, id: string) => host.querySelector<HTMLButtonElement>(`[data-offer-entry="${id}"]`)!;
const entries = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[data-offer-entry]')].map((e) => e.getAttribute('data-offer-entry'));

describe('the composer', () => {
  it('seven tabs, only allowed entries', () => {
    const s = world({ shown: ['feet'] });
    const { host } = open(s);
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('data-offer-tab'))).toEqual([...OFFER_TABS]);
    // the first tab (parts) is open: the targets the gate lets through
    expect(entries(host)).toEqual(offerChoices(s, reg, ANN).part.map((c) => c.id));
    expect(entries(host)).toContain('feet');
    expect(entries(host)).not.toContain('breasts'); // explicit_scenes is off
    tab(host, 'contact').click();
    expect(entries(host)).toEqual(offerChoices(s, reg, ANN).contact.map((c) => c.id));
    expect(entries(host)).toContain('foot_worship');
    expect(entries(host)).not.toContain('footrest'); // an object is a role
    tab(host, 'role').click();
    expect(entries(host)).toContain('footrest');
    tab(host, 'time').click();
    expect(entries(host)).toEqual(['evening', 'night']);
    // a closed category empties its tab, and the tab says so
    const off = world({ on: ['restraint'] });
    const closed = open(off);
    expect(entries(closed.host)).toEqual([]);
    expect(closed.host.textContent).toContain('Nothing here is on offer');
  });

  it('worship targets show the known attitude or "?"', () => {
    const { host } = open(world({ shown: ['feet', 'hands'] }));
    expect(entry(host, 'feet').querySelector('.alius-offer-known')!.textContent).toBe('CRAVES');
    expect(entry(host, 'hands').querySelector('.alius-offer-known')!.textContent).toBe('DISLIKES');
    expect(entry(host, 'toes').querySelector('.alius-offer-known')!.textContent).toBe('?');
    expect(entry(host, 'toes').classList.contains('is-unknown')).toBe(true);
    expect(entry(host, 'feet').classList.contains('is-craves')).toBe(true);
    // only a worship target says anything of her
    tab(host, 'posture').click();
    expect(host.querySelector('.alius-offer-known')).toBeNull();
  });

  it('one or two entries make an offer; a third is refused', () => {
    const { host, onSend } = open(world({ shown: ['feet'] }));
    const send = () => host.querySelector<HTMLButtonElement>('[data-action="send"]')!;
    expect(send().getAttribute('aria-disabled')).toBe('true'); // nothing chosen yet
    send().click();
    expect(onSend).not.toHaveBeenCalled();
    entry(host, 'feet').click();
    expect(send().getAttribute('aria-disabled')).toBeNull();
    tab(host, 'posture').click();
    entry(host, 'kneeling_upright').click(); // two entries, across tabs
    tab(host, 'time').click();
    entry(host, 'evening').click(); // a third: refused, with the reason
    expect(entry(host, 'evening').getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.alius-offer-note')!.textContent).toContain('one or two');
    expect(host.querySelector('.alius-offer-chosen')!.textContent).toBe('Offer: Feet and Kneeling upright.');
    // an entry that is chosen can be put back, which makes room
    tab(host, 'part').click();
    entry(host, 'feet').click();
    expect(entry(host, 'feet').getAttribute('aria-pressed')).toBe('false');
    tab(host, 'time').click();
    entry(host, 'evening').click();
    expect(entry(host, 'evening').getAttribute('aria-pressed')).toBe('true');
    send().click();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith([{ tab: 'posture', ids: ['kneeling_upright'] }, { tab: 'time', ids: ['evening'] }], false);
  });

  it('the ask-in-return toggle goes with the offer', () => {
    const { host, onSend } = open(world({ shown: ['feet'] }));
    entry(host, 'feet').click();
    const ask = () => host.querySelector<HTMLButtonElement>('[data-action="ask-return"]')!;
    expect(ask().getAttribute('aria-pressed')).toBe('false');
    ask().click();
    expect(ask().getAttribute('aria-pressed')).toBe('true');
    host.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    expect(onSend).toHaveBeenCalledWith([{ tab: 'part', ids: ['feet'] }], true);
  });

  it('cancel closes without sending', () => {
    const { host, onSend, onClose } = open(world());
    host.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('every tab, entry and button carries data-analyze and resolves', () => {
    const s = world({ shown: ['feet'] });
    const { host } = open(s);
    for (const t of OFFER_TABS) {
      tab(host, t).click();
      expect(host.querySelectorAll('[role="tab"]')).toHaveLength(7);
      expect(markedWithout(host)).toEqual([]);
      expect(unresolved(host, env(s))).toEqual([]);
      expect(unreachable(host)).toEqual([]);
    }
    tab(host, 'part').click();
    expect(entry(host, 'feet').getAttribute('data-analyze')).toBe('worshipTargets:feet');
    for (const el of host.querySelectorAll('button')) expect(el.getAttribute('data-analyze'), el.outerHTML.slice(0, 100)).toBeTruthy();
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/_/); // no raw id
  });

  it('a draw keeps the choice and the open tab', () => {
    const s = world({ shown: ['feet'] });
    const host = h('div');
    document.body.append(host);
    const onSend = vi.fn();
    const ctx = { state: s, reg, unitId: ANN, choices: offerChoices(s, reg, ANN), onSend, onClose: vi.fn() };
    renderOfferComposer(host, ctx);
    tab(host, 'contact').click();
    entry(host, 'foot_worship').click();
    renderOfferComposer(host, ctx); // the scene redraws after every action
    expect(tab(host, 'contact').getAttribute('aria-selected')).toBe('true');
    expect(entry(host, 'foot_worship').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the chip', () => {
  const surface = (s: CampaignState, onOffer = vi.fn()) => {
    const host = h('div');
    document.body.append(host);
    drawOfferChips(host, { state: s, reg, pick: () => true, onOffer });
    return { host, onOffer };
  };

  it('is drawn while she can be offered to, opens the composer and sends through onOffer', () => {
    const s = world({ shown: ['feet'] });
    const { host, onOffer } = surface(s);
    const chip = host.querySelector<HTMLButtonElement>('[data-action="offer"]')!;
    expect(chip.textContent).toBe('[ OFFER MYSELF ]');
    expect(chip.classList.contains('alius-chip')).toBe(true);
    expect(chip.getAttribute('data-analyze')).toBe('glossary:offer');
    expect(host.querySelector('.alius-offer')).toBeNull();
    chip.click();
    expect(host.querySelector('.alius-offer')).not.toBeNull();
    entry(host, 'feet').click();
    host.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    expect(onOffer).toHaveBeenCalledTimes(1);
    expect(onOffer).toHaveBeenCalledWith(ANN, [{ tab: 'part', ids: ['feet'] }], false);
    expect(host.querySelector('.alius-offer')).toBeNull(); // sending closes it
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('is absent while the dynamic is off, for a woman who could not hold, and when nobody is picked', () => {
    const off = world();
    off.dynamic = undefined;
    expect(surface(off).host.querySelector('[data-action="offer"]')).toBeNull();
    const none = world({ on: [] });
    expect(surface(none).host.querySelector('[data-action="offer"]')).toBeNull();
    const host = h('div');
    drawOfferChips(host, { state: world(), reg, pick: (id) => id === BEA, onOffer: vi.fn() });
    expect(host.querySelector('[data-action="offer"]')).toBeNull();
  });

  it('shows the answer as a chip once she has answered', () => {
    const s = world({ shown: ['feet'] });
    const r = run(s, reg, { type: 'dynamic/offer', payload: { unitId: ANN, composition: [{ tab: 'part', ids: ['feet'] }] } });
    expect(errors(r.events)).toEqual([]);
    const { host } = surface(r.state);
    const chip = host.querySelector<HTMLElement>('.alius-offer-answer')!;
    expect(chip.textContent).toBe('ACCEPTED');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:offer_answer');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(r.state))).toEqual([]);
    expect(surface(r.state, vi.fn()).host.textContent).not.toMatch(/\d/);
    // `waiting`: the reply has not come yet
    const waiting = h('div');
    drawOfferChips(waiting, { state: r.state, reg, pick: () => true, onOffer: vi.fn(), answered: () => false });
    expect(waiting.querySelector('.alius-offer-answer')).toBeNull();
  });

  it('two women in the room: a chip for each, named', () => {
    const s = world();
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond);
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 25 };
    const host = h('div');
    document.body.append(host);
    drawOfferChips(host, { state: s, reg, pick: () => true, onOffer: vi.fn() });
    expect([...host.querySelectorAll('[data-action="offer"]')].map((c) => c.getAttribute('data-unit'))).toEqual([ANN, BEA]);
    expect(host.querySelector('[data-action="offer"]')!.textContent).toBe('[ OFFER MYSELF > ANN ]');
  });
});

describe('where it is drawn', () => {
  it('the scene draws the chip for her and sends the offer to its handler; without a handler nothing is drawn', () => {
    const s = run(world({ shown: ['feet'] }), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), replyPending: () => false } as unknown as SceneController;
    const onOffer = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onOffer });
    host.querySelector<HTMLButtonElement>('[data-action="offer"]')!.click();
    entry(host, 'feet').click();
    host.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    expect(onOffer).toHaveBeenCalledWith(ANN, [{ tab: 'part', ids: ['feet'] }], false);
    const plain = h('div');
    renderSceneScreen(plain, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn() });
    expect(plain.querySelector('[data-action="offer"]')).toBeNull();
  });

  it('the thread draws the chip of the contact it is open on', () => {
    const s = world({ shown: ['feet'] });
    const comms = h('div');
    document.body.append(comms);
    const onOffer = vi.fn();
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onOffer } as never);
    expect(comms.querySelector('[data-action="offer"]')).toBeNull(); // no thread open
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    comms.querySelector<HTMLButtonElement>('.alius-thread [data-action="offer"]')!.click();
    entry(comms, 'feet').click();
    comms.querySelector<HTMLButtonElement>('.alius-thread [data-action="send"]')!.click();
    expect(onOffer).toHaveBeenCalledWith(ANN, [{ tab: 'part', ids: ['feet'] }], false);
    comms.querySelector<HTMLElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(comms.querySelector('.alius-thread [data-action="offer"]')).toBeNull(); // Bea has no practice
  });
});

describe('the controller', () => {
  function rig(s: CampaignState, over: { stage?: ReturnType<typeof vi.fn>; sayInScene?: ReturnType<typeof vi.fn>; sayInDm?: ReturnType<typeof vi.fn> } = {}) {
    const harness = worldHarness(reg, s);
    const context = { setDirective: vi.fn(), clearMatching: vi.fn() };
    const refreshContext = vi.fn();
    const ctl = createDynamic({ ...harness.deps, context: context as never, refreshContext, ...over } as never);
    return { harness, ctl, refreshContext };
  }
  const feet: OfferComposition = [{ tab: 'part', ids: ['feet'] }];

  it('in a DM it dispatches dynamic/offer once, directly, and says it in the thread', async () => {
    const sayInDm = vi.fn(async () => {});
    const { harness, ctl, refreshContext } = rig(world({ shown: ['feet'] }), { sayInDm });
    expect(await ctl.offer(ANN, feet, false)).toBe(true);
    expect(harness.state().dynamic!.open.offers).toHaveLength(1);
    expect(harness.log.filter((a) => a.type === 'dynamic/offer')).toHaveLength(1);
    expect(refreshContext).toHaveBeenCalled();
    expect(sayInDm).toHaveBeenCalledTimes(1);
    const [unitId, line] = sayInDm.mock.calls[0] as unknown as [string, string];
    expect(unitId).toBe(ANN);
    expect(line).toContain('feet');
    expect(line).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('in a scene with her it goes through stage, then into the scene, with the asking noted', async () => {
    const s = run(world({ shown: ['feet'] }), reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    const sayInScene = vi.fn(async () => true);
    let harnessRef: ReturnType<typeof worldHarness>;
    const stage = vi.fn((a) => harnessRef.app().dispatch(a));
    const { harness, ctl } = rig(s, { stage, sayInScene });
    harnessRef = harness;
    expect(await ctl.offer(ANN, feet, true)).toBe(true);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0][0]).toMatchObject({ type: 'dynamic/offer', payload: { unitId: ANN, composition: feet, askInReturn: true } });
    expect(harness.state().dynamic!.open.offers[0].conditions).toBe(true);
    expect(sayInScene).toHaveBeenCalledTimes(1);
    expect((sayInScene.mock.calls[0] as unknown as [string])[0]).toContain('in return');
  });

  it('a refused offer toasts the reason, says nothing and answers false', async () => {
    const sayInDm = vi.fn(async () => {});
    const { harness, ctl } = rig(world(), { sayInDm });
    expect(await ctl.offer(ANN, [{ tab: 'part', ids: ['breasts'] }], false)).toBe(false);
    expect(harness.toasts.at(-1)!.kind).toBe('error');
    expect(sayInDm).not.toHaveBeenCalled();
  });
});

describe('off is nothing', () => {
  it('the controller refuses and no chip exists while the dynamic is off', async () => {
    const s = world();
    s.dynamic = undefined;
    const harness = worldHarness(reg, s);
    const ctl = createDynamic({ ...harness.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn() } as never);
    expect(await ctl.offer(ANN, [{ tab: 'part', ids: ['feet'] }], false)).toBe(false);
    expect(Object.values(offerChoices(s, reg, ANN)).flat()).toEqual([]);
  });
});
