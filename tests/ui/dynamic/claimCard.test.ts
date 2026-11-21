// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { createDynamic } from '../../../src/dynamic/controller';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { claimsDue } from '../../../src/engine/dynamic/domains';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderClaimCard } from '../../../src/ui/dynamic/cards';
import { renderHierarchyBlock } from '../../../src/ui/power/hierarchy';
import { computeHierarchy } from '../../../src/engine/power/standing';
import { h } from '../../../src/ui/dom';
import { tonightItems } from '../../../src/ui/hub/model';
import { renderCommsTab } from '../../../src/ui/comms/commsTab';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { FakeStAdapter } from '../../../src/st/fake';
import type { SceneController } from '../../../src/scene/sceneController';
import { campaign, errors, loadCore, run } from '../../helpers/world';
import { worldHarness } from '../../helpers/worldApp';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` with `hold`; her claim is open (the first domain she is due). */
function world(frame: Frame, hold: number, opts: { submit?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold };
  if (opts.submit === true) s.dynamic.open.claims.push({ id: 'dc0', unitId: ANN, submit: true, day: s.day });
  else claimsDue(s, { registries: reg, rng: { chance: () => true } as unknown as Rng });
  expect(s.dynamic.open.claims).toHaveLength(1);
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

describe('the claim card', () => {
  it('names the domain by label and lists what it grants in plain words', () => {
    const s = world('play', 45); // private time: no weekly limit, books ahead
    const claim = s.dynamic!.open.claims[0];
    expect(claim.domainId).toBe('private_time');
    const host = h('div');
    document.body.append(host);
    renderClaimCard(host, { state: s, reg, claim, onAnswer: vi.fn() });
    const card = host.querySelector<HTMLElement>('[data-claim]')!;
    expect(card.getAttribute('data-claim')).toBe(claim.id);
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull(); // her voice
    expect(host.textContent).toContain('Ann');
    expect(host.textContent).toContain(String(reg.dynamicDomains.get('private_time')!.label).toUpperCase());
    const granted = [...host.querySelectorAll<HTMLElement>('[data-grants]')].map((e) => e.getAttribute('data-grants'));
    expect(granted).toEqual(['booking_uncapped', 'book_ahead']);
    for (const cap of granted) {
      const row = host.querySelector<HTMLElement>(`[data-grants="${cap}"]`)!;
      expect(row.textContent).toBe(String(reg.glossary.get(`capability_${cap}`)!.term)); // the plain words are the glossary's
      expect(row.getAttribute('data-analyze')).toBe(`glossary:capability_${cap}`);
    }
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    expect(host.textContent).not.toMatch(/_/); // no raw id
  });

  it('YIELD / REFUSE / TALK carry data-analyze and answer', () => {
    const s = world('play', 45);
    const onAnswer = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderClaimCard(host, { state: s, reg, claim: s.dynamic!.open.claims[0], onAnswer });
    const buttons = (['yield', 'refuse', 'talk'] as const).map((a) => host.querySelector<HTMLButtonElement>(`button[data-claim-answer="${a}"]`)!);
    expect(buttons.map((b) => b.textContent)).toEqual(['[ YIELD ]', '[ REFUSE ]', '[ TALK ]']);
    for (const el of [host.querySelector<HTMLElement>('[data-claim]')!, ...buttons]) expect(el.getAttribute('data-analyze')).toBeTruthy();
    expect(buttons[0].getAttribute('data-analyze')).toBe('glossary:claim');
    for (const b of buttons) b.click();
    expect(onAnswer.mock.calls).toEqual([['yield'], ['refuse'], ['talk']]);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('the submit claim (R1 contest) uses the same card with her words', () => {
    const s = world('rule', 70, { submit: true });
    const host = h('div');
    document.body.append(host);
    renderClaimCard(host, { state: s, reg, claim: s.dynamic!.open.claims[0], onAnswer: vi.fn() });
    expect(host.querySelectorAll('[data-claim-answer]')).toHaveLength(3);
    expect(host.querySelector('[data-grants]')).toBeNull(); // no domain is asked for
    expect(host.querySelector('.alius-claim-text')!.textContent).toContain('Ann');
    expect(host.querySelector('.alius-claim-text')!.textContent).not.toBe('');
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('a claim of a domain the pack no longer has draws nothing', () => {
    const s = world('play', 45);
    s.dynamic!.open.claims[0].domainId = 'gone';
    const host = h('div');
    renderClaimCard(host, { state: s, reg, claim: s.dynamic!.open.claims[0], onAnswer: vi.fn() });
    expect(host.children).toHaveLength(0);
  });
});

describe('the hierarchy line', () => {
  it('reads co-leader for the holder of the command, addressable', () => {
    const s = world('role', 70);
    s.relations[ANN].dynamic!.domains = [{ id: 'command', since: 1 }];
    computeHierarchy(s, reg);
    const host = h('div');
    document.body.append(host);
    renderHierarchyBlock(host, s, reg, ANN, {} as never);
    const chip = host.querySelector<HTMLElement>('[data-co-leader]')!;
    expect(chip.textContent).toBe('CO-LEADER');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:capability_co_leader');
    expect(unresolved(host, env(s))).toEqual([]);
    s.relations[ANN].dynamic!.domains = [];
    computeHierarchy(s, reg);
    renderHierarchyBlock(host, s, reg, ANN, {} as never);
    expect(host.querySelector('[data-co-leader]')).toBeNull();
  });
});

describe('the Tonight list', () => {
  it('a unit with only a claim open has a chip for the claim', () => {
    const s = world('play', 45);
    const chips = tonightItems(s, reg).filter((i) => i.kind === 'dynamic');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ unitId: ANN, tone: 'warn', analyze: 'glossary:claim' });
    expect(chips[0].text).not.toMatch(/\d/);
  });
});

describe('where the card is drawn', () => {
  it('the scene draws the open claim of its participants and answers it; the thread draws it under her messages only', () => {
    const s = run(world('play', 45), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const onAnswerClaim = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onAnswerClaim });
    const id = s.dynamic!.open.claims[0].id;
    host.querySelector<HTMLButtonElement>('button[data-claim-answer="yield"]')!.click();
    expect(onAnswerClaim).toHaveBeenCalledWith(id, 'yield');
    host.querySelector<HTMLButtonElement>('button[data-claim-answer="talk"]')!.click();
    expect(onAnswerClaim).toHaveBeenLastCalledWith(id, 'talk');
    expect(markedWithout(host.querySelector('.alius-claim-cards') as HTMLElement)).toEqual([]);

    const comms = h('div');
    document.body.append(comms);
    const onAnswer = vi.fn();
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onAnswerClaim: onAnswer } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    comms.querySelector<HTMLButtonElement>('.alius-thread button[data-claim-answer="refuse"]')!.click();
    expect(onAnswer).toHaveBeenCalledWith(id, 'refuse');
    comms.querySelector<HTMLElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(comms.querySelector('.alius-thread [data-claim]')).toBeNull();
  });

  it('nothing is drawn while the dynamic is off', () => {
    const s = world('play', 45);
    s.content = { enabled: [] };
    const comms = h('div');
    document.body.append(comms);
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    expect(comms.querySelector('[data-claim]')).toBeNull();
  });
});

describe('the controller', () => {
  function rig(s: CampaignState) {
    const harness = worldHarness(reg, s);
    const directives = new Map<string, { id: string; text: string }>();
    const context = {
      setDirective: (d: { id: string; text: string }) => { directives.set(d.id, d); },
      clearMatching: (f: (d: { id: string }) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
    };
    const startScene = vi.fn(async (o: { participants: string[] }) => {
      const r = harness.app().dispatch({ type: 'scene/start', payload: { locationId: 'quarters_unit', participants: o.participants, origin: 'event', startIndex: 0 } });
      return !r.some((e) => e.type === 'error');
    });
    const refreshContext = vi.fn();
    const ctl = createDynamic({ ...harness.deps, context: context as never, refreshContext, startScene });
    return { harness, ctl, startScene, refreshContext };
  }

  it('answerClaim dispatches yield and refuse; a stale claim toasts and answers false', () => {
    const { harness, ctl } = rig(world('play', 45));
    const id = harness.state().dynamic!.open.claims[0].id;
    expect(ctl.answerClaim(id, 'yield')).toBe(true);
    expect(harness.state().relations[ANN].dynamic!.domains.map((d) => d.id)).toEqual(['private_time']);
    expect(ctl.answerClaim(id, 'yield')).toBe(false);
  });

  it('talk opens a one-to-one scene with her (her quarters) while the claim stays open', async () => {
    const { harness, ctl, startScene } = rig(world('play', 45));
    const id = harness.state().dynamic!.open.claims[0].id;
    expect(await ctl.talk(id)).toBe(true);
    expect(startScene).toHaveBeenCalledWith({ locationId: 'quarters_unit', participants: [ANN], origin: 'event' });
    expect(harness.state().scene?.participants).toEqual([ANN]);
    expect(harness.state().dynamic!.open.claims.map((c) => c.id)).toEqual([id]);
    expect(await ctl.talk('dc99')).toBe(false);
  });

  it('her directive tells the model what she is waiting for while a claim is open', () => {
    const s = run(world('play', 45), reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(s.events)).toEqual([]);
    const text = dynamicDirectives(s.state, reg, [ANN]).map((d) => d.text).join(' ');
    expect(text).toContain(String(reg.dynamicDomains.get('private_time')!.promptHint));
    expect(text).toContain('waiting for the commander');
  });
});
