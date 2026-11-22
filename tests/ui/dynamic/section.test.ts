// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { addCompromat, mentionCompromat } from '../../../src/engine/dynamic/compromat';
import { DYNAMIC_KNOWLEDGE_TAG } from '../../../src/engine/dynamic/types';
import { addFact } from '../../../src/engine/memory/facts';
import { createDynamic } from '../../../src/dynamic/controller';
import { exitCostWord } from '../../../src/engine/dynamic/exit';
import { blankDynamic, blankReading, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderMilestoneCard } from '../../../src/ui/dynamic/cards';
import { resetDynamicSection } from '../../../src/ui/dynamic/section';
import { h } from '../../../src/ui/dom';
import { tonightItems } from '../../../src/ui/hub/model';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { campaign, loadCore } from '../../helpers/world';
import { worldHarness } from '../../helpers/worldApp';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetDynamicSection();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = () => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary: 'cold' as const }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds at `frame` with `hold`: one domain, a track at level 2, her reading, a claim and a milestone waiting. */
function world(frame: Frame = 'role', hold = 62, over: { sworn?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = practice();
  unitOf(s, BEA).bond = practice();
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = {
    ...blankDynamic(s.day), frame, hold, domains: [{ id: 'device', since: 1 }], tracks: { restraint: { xp: 40, level: 2 } },
    readOf: { ...blankReading(), region: 'proud', updates: 4 }, ...(over.sworn === true ? { sworn: { day: 3 } } : {}),
  };
  s.dynamic.open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'body', day: s.day });
  s.dynamic.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: 'handover', day: s.day, form: 'scene' });
  return s;
}
const env = (s: CampaignState, raw = false): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } }) as unknown as AnalyzeEnv;

function squad(s: CampaignState, opts: { raw?: boolean; hidden?: boolean; actions?: Record<string, unknown> } = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const host = h('div');
  document.body.append(host);
  renderSquadTab(host, {
    st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg,
    settings: () => ({ ...DEFAULT_SETTINGS, showRawValues: opts.raw === true, dynamicHidden: opts.hidden === true }),
    onNewCampaign: vi.fn(), onPunish: vi.fn(), onLeash: vi.fn(),
    dynamic: { dispatch: vi.fn(() => []), onChanged: vi.fn(), ...(opts.actions !== undefined ? { actions: opts.actions } : {}) },
  } as never);
  const unit = [...host.querySelectorAll<HTMLElement>('article.alius-unit')].find((a) => a.textContent?.includes('Ann')) ?? host;
  return { host, unit, section: unit.querySelector<HTMLElement>('.alius-dynamic-section') };
}

describe('her dossier: the DYNAMIC section', () => {
  it('shows frame, band, domains, tracks as bands, the vow, her reading in her words, open cards and the exit button', () => {
    const s = world('role', 62, { sworn: true });
    const { section } = squad(s);
    expect(section).not.toBeNull();
    const sec = section!;
    expect(sec.querySelector('[data-dyn-frame]')!.textContent).toContain('ROLE');
    expect(sec.querySelector('[data-dyn-hold]')!.textContent).toContain('OWNING');
    expect(sec.querySelector('[data-dyn-domain="device"]')).not.toBeNull(); // claimed
    expect(sec.querySelector('[data-dyn-domain="device"]')!.textContent).toContain('THE DEVICE');
    expect(sec.querySelector('[data-dyn-may-claim="household"]')).not.toBeNull(); // open: she may claim it
    expect(sec.querySelector('[data-dyn-may-claim="body"]')).toBeNull(); // asked already: the claim card shows
    expect(sec.querySelector('[data-dyn-may-claim="device"]')).toBeNull();
    const track = sec.querySelector('[data-dyn-track="restraint"]')!;
    expect(track.textContent).toContain('RESTRAINT');
    expect(track.textContent).not.toContain('40'); // a band, never the xp
    expect(sec.querySelector('[data-dyn-vow]')).not.toBeNull();
    expect(sec.querySelector('[data-dyn-reading]')!.textContent).toContain('proud');
    expect(sec.querySelector('.alius-claim[data-claim="dc1"]')).not.toBeNull();
    expect(sec.querySelector('.alius-milestone[data-milestone="dm1"]')).not.toBeNull();
    expect(sec.querySelector('[data-action="dyn-exit"]')!.textContent).toBe('[ END IT ]');
  });

  it('shows no reading before she has read anything, and no vow without one', () => {
    const s = world('play', 45);
    s.relations[ANN].dynamic!.readOf = blankReading();
    const { section } = squad(s);
    expect(section!.querySelector('[data-dyn-reading]')).toBeNull();
    expect(section!.querySelector('[data-dyn-vow]')).toBeNull();
  });

  it('raw hold only with show raw values', () => {
    const s = world();
    expect(squad(s).section!.querySelector('[data-dyn-hold]')!.textContent).not.toContain('62');
    document.body.innerHTML = '';
    expect(squad(s, { raw: true }).section!.querySelector('[data-dyn-hold]')!.textContent).toContain('(62)');
  });

  it('a woman at equal (a former holder) has the section but nothing to end', () => {
    const s = world();
    s.relations[ANN].dynamic = { ...blankDynamic(s.day), formerHolder: { endedDay: 2, frame: 'role', sworn: false } };
    const { section } = squad(s);
    expect(section).not.toBeNull();
    expect(section!.querySelector('[data-action="dyn-exit"]')).toBeNull();
  });

  it('the section is not drawn while the dynamic is off, for a grunt, or for a woman who holds nothing', () => {
    const off = world();
    off.content = { enabled: [] };
    expect(squad(off).section).toBeNull();
    document.body.innerHTML = '';
    const grunt = world();
    unitOf(grunt, ANN).kind = 'grunt';
    expect(squad(grunt).section).toBeNull();
    document.body.innerHTML = '';
    const none = world();
    delete none.relations[ANN].dynamic;
    expect(squad(none).section).toBeNull();
  });

  it('immersive hides the section and the bands but the hub chip and the cards still show', () => {
    const s = world();
    const { host, section } = squad(s, { hidden: true });
    expect(section).toBeNull();
    expect(host.querySelector('[data-dyn-hold]')).toBeNull();
    expect(host.querySelector('[data-dyn-frame]')).toBeNull();
    expect(tonightItems(s, reg).some((i) => i.kind === 'dynamic' && i.unitId === ANN)).toBe(true); // the hub chip
    const card = h('div');
    document.body.append(card);
    renderMilestoneCard(card, { state: s, reg, milestone: s.dynamic!.open.milestones[0], onAnswer: vi.fn() }); // the card
    expect(card.querySelector('[data-milestone="dm1"]')).not.toBeNull();
  });

  it('the cards answer through the callbacks', () => {
    const actions = { answerMilestone: vi.fn(), answerClaim: vi.fn(), answerReturn: vi.fn(), exit: vi.fn(), requestTransfer: vi.fn() };
    const { section } = squad(world(), { actions });
    section!.querySelector<HTMLButtonElement>('button[data-milestone-answer="accept"]')!.click();
    expect(actions.answerMilestone).toHaveBeenCalledWith('dm1', 'accept');
    section!.querySelector<HTMLButtonElement>('button[data-claim-answer="talk"]')!.click();
    expect(actions.answerClaim).toHaveBeenCalledWith('dc1', 'talk');
  });

  it('every row carries data-analyze and resolves', () => {
    for (const raw of [false, true]) {
      document.body.innerHTML = '';
      resetDynamicSection();
      const s = world('role', 62, { sworn: true });
      const { section } = squad(s, { raw });
      section!.querySelector<HTMLElement>('[data-action="dyn-exit"]')!.click(); // the exit card is part of the section
      expect(section!.querySelector('.alius-exit')).not.toBeNull();
      expect(markedWithout(section!)).toEqual([]);
      expect(unresolved(section!, env(s, raw))).toEqual([]);
      expect(unreachable(section!)).toEqual([]);
      expect(section!.querySelectorAll('[data-analyze]').length).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('what the commander has been shown of her', () => {
  it('shows what she keeps once she has mentioned it, and who has shown they know, and neither before', () => {
    const s = world();
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander once did something.', []);
    addFact(s, { about: [BEA, ANN], text: 'AUTHOR TO WRITE: Bea knows that Ann holds authority over the commander.', tags: [DYNAMIC_KNOWLEDGE_TAG, 'knows_dynamic'], importance: 3, day: 3, knownBy: [BEA], hiddenFromCommander: true });
    const before = squad(s).section!;
    expect(before.querySelector('[data-dyn-compromat]')).toBeNull();
    expect(before.querySelector('[data-dyn-known]')).toBeNull();
    document.body.innerHTML = '';
    mentionCompromat(s, undefined, ANN, undefined, 'the commander once did something');
    delete s.memory.facts.find((f) => f.tags.includes(DYNAMIC_KNOWLEDGE_TAG))!.hiddenFromCommander;
    const after = squad(s).section!;
    expect(after.querySelector('[data-dyn-compromat]')!.textContent).toBe('the commander once did something.');
    expect(after.querySelector('[data-dyn-known="unit_bea"]')!.textContent).toBe('BEA: KNOWS');
    expect(markedWithout(after)).toEqual([]);
    expect(unresolved(after, env(s))).toEqual([]);
  });
});

describe('the exit card', () => {
  /** Ann holds at `role` (one domain); Bea holds at `play`, so a transfer has somebody to go to. */
  function withBea(sworn = false): CampaignState {
    const s = world('role', 62, { sworn });
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    return s;
  }
  const open = (s: CampaignState, actions: Record<string, unknown> = {}) => {
    const r = squad(s, { actions });
    r.section!.querySelector<HTMLElement>('[data-action="dyn-exit"]')!.click();
    return r.section!;
  };

  it('the exit card shows the cost as a word per route', () => {
    const s = withBea();
    const sec = open(s);
    const cost = (route: string): string => sec.querySelector(`[data-exit-route="${route}"] [data-cost]`)!.textContent!;
    expect(cost('abrupt')).toBe(exitCostWord(s, reg, ANN, 'abrupt'));
    expect(cost('abrupt')).toBe('costly');
    expect(cost('negotiated')).toBe(exitCostWord(s, reg, ANN, 'negotiated', true)); // what a compromise would make of it
    expect(cost('negotiated')).toBe('light');
    expect(cost('force')).toBe('heavy');
    expect(sec.querySelector('[data-exit-route="transfer"][data-to="unit_bea"]')).not.toBeNull();
    expect([...sec.querySelectorAll('[data-cost]')].map((c) => c.textContent).join(' ')).not.toMatch(/\d/); // words, not numbers
  });

  it('a vow is a break whatever the route', () => {
    const sec = open(withBea(true));
    expect(sec.querySelector('[data-exit-route="abrupt"] [data-cost]')!.textContent).toBe('a break');
    expect(sec.querySelector('[data-exit-route="force"] [data-cost]')!.textContent).toBe('a break');
  });

  it('there is no transfer without another holder', () => {
    const sec = open(world());
    expect(sec.querySelector('[data-exit-route="transfer"]')).toBeNull();
  });

  it('the routes go through the callback; a forced exit needs its means done first', () => {
    const exit = vi.fn();
    const s = withBea();
    const sec = open(s, { exit });
    sec.querySelector<HTMLButtonElement>('[data-exit-route="abrupt"] button')!.click();
    expect(exit).toHaveBeenLastCalledWith(ANN, 'abrupt', undefined);
    sec.querySelector<HTMLButtonElement>('[data-exit-route="negotiated"] button')!.click();
    expect(exit).toHaveBeenLastCalledWith(ANN, 'negotiated', undefined);
    sec.querySelector<HTMLButtonElement>('[data-exit-route="transfer"][data-to="unit_bea"] button')!.click();
    expect(exit).toHaveBeenLastCalledWith(ANN, 'transfer', { toUnitId: 'unit_bea' });
    exit.mockClear();
    // nothing was done to her today: every FORCE is soft-disabled and does nothing
    const forces = [...sec.querySelectorAll<HTMLButtonElement>('[data-exit-route="force"] button[data-means]')];
    expect(forces.map((b) => b.getAttribute('data-means')).sort()).toEqual(['discipline', 'leash', 'transfer_request']);
    for (const b of forces) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      b.click();
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it('a means done today enables its FORCE, which names the means', () => {
    const exit = vi.fn();
    const s = withBea();
    s.dynamic!.oversight = { blocked: [], requests: [{ unitId: ANN, day: s.day }] } as never;
    const sec = open(s, { exit });
    const force = sec.querySelector<HTMLButtonElement>('[data-exit-route="force"] button[data-means="transfer_request"]')!;
    expect(force.getAttribute('aria-disabled')).toBeNull();
    force.click();
    expect(exit).toHaveBeenCalledWith(ANN, 'force', { means: 'transfer_request' });
  });

  it('the means are run through their own paths: the punishment menu, the Leash, the request', () => {
    const requestTransfer = vi.fn();
    const s = withBea();
    const sec = open(s, { requestTransfer });
    expect(sec.querySelector('.alius-exit .alius-discipline')).not.toBeNull(); // her DISCIPLINE menu: the commander's own click, through the vote
    sec.querySelector<HTMLButtonElement>('[data-do-means="transfer_request"]')!.click();
    expect(requestTransfer).toHaveBeenCalledWith(ANN);
    expect(sec.querySelector('[data-do-means="leash"]')).not.toBeNull();
  });

  it('closing the card leaves the section', () => {
    const sec = open(withBea());
    sec.querySelector<HTMLButtonElement>('[data-action="dyn-exit-close"]')!.click();
    expect(sec.querySelector('.alius-exit')).toBeNull();
    expect(sec.querySelector('[data-action="dyn-exit"]')).not.toBeNull();
  });
});

describe('the controller: exit', () => {
  function rig(s: CampaignState) {
    const harness = worldHarness(reg, s);
    const context = { setDirective: vi.fn(), clearMatching: vi.fn() };
    const startScene = vi.fn(async (o: { participants: string[] }) => {
      const r = harness.app().dispatch({ type: 'scene/start', payload: { locationId: 'quarters_unit', participants: o.participants, origin: 'event', startIndex: 0 } });
      return !r.some((e) => e.type === 'error');
    });
    const ctl = createDynamic({ ...harness.deps, context: context as never, refreshContext: vi.fn(), startScene });
    return { harness, ctl, startScene };
  }
  const world2 = (): CampaignState => {
    const s = world('role', 62);
    s.dynamic!.open.claims = [];
    s.dynamic!.open.milestones = [];
    return s;
  };

  it('abrupt dispatches the exit at once', async () => {
    const { harness, ctl } = rig(world2());
    expect(await ctl.exit(ANN, 'abrupt')).toBe(true);
    expect(harness.state().relations[ANN].dynamic!.frame).toBe('equal');
    expect(harness.state().relations[ANN].dynamic!.formerHolder).toBeDefined();
  });

  it('negotiated opens the exit and a scene with her; the exit stays pending', async () => {
    const { harness, ctl, startScene } = rig(world2());
    expect(await ctl.exit(ANN, 'negotiated')).toBe(true);
    expect(startScene).toHaveBeenCalledWith({ locationId: 'quarters_unit', participants: [ANN], origin: 'event' });
    expect(harness.state().relations[ANN].dynamic!.frame).toBe('role'); // nothing ended yet
    expect(harness.state().dynamic!.open.exits?.map((e) => e.unitId)).toEqual([ANN]);
  });

  it('a forced exit without its means is refused with the reason; with the request filed it is made', async () => {
    const { harness, ctl } = rig(world2());
    expect(await ctl.exit(ANN, 'force', { means: 'transfer_request' })).toBe(false);
    expect(harness.toasts.some((t) => t.kind === 'error' && t.text.includes('Do it first'))).toBe(true);
    expect(ctl.requestTransfer(ANN)).toBe(true);
    expect(await ctl.exit(ANN, 'force', { means: 'transfer_request' })).toBe(true);
    expect(harness.state().relations[ANN].dynamic!.frame).toBe('equal');
  });

  it('a transfer goes to the holder it names', async () => {
    const s = world2();
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    const { harness, ctl } = rig(s);
    expect(await ctl.exit(ANN, 'transfer', { toUnitId: BEA })).toBe(true);
    expect(harness.log.some((a) => a.type === 'dynamic/exit' && (a.payload as { toUnitId?: string }).toUnitId === BEA)).toBe(true);
  });
});
