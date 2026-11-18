// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildKnowledge, resetKnowledgeRules } from '../../src/analysis/knowledge';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { registerSpecialProviders } from '../../src/analysis/providers/special';
import { parseSubject } from '../../src/analysis/subject';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { paymentFor } from '../../src/engine/special/debts/intel';
import type { IntelItem } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { createSpecial, type SpecialDeps } from '../../src/special/controller';
import { specialDirectives } from '../../src/special/directives';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { h } from '../../src/ui/dom';
import { renderDebtsBlock } from '../../src/ui/special/debtsBlock';
import { renderHandlerPanel } from '../../src/ui/special/handlerPanel';
import { VOICE_OF } from '../../src/ui/voice/sources';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { allReadings, leaks } from '../helpers/analyze';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { campaign } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import { ANN, BEA, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
  registerCoreProviders();
});
afterEach(() => { resetKnowledgeRules(); document.body.innerHTML = ''; });

const ITEMS: IntelItem[] = [
  { id: 'squad:unit_ann', kind: 'squad', refId: ANN, label: 'Ann is an assault with Echo Bleed.' },
  { id: 'plan:m1', kind: 'plan', refId: 'm1', label: 'The squad plans "Hold the road".' },
];
const visiting = (): CampaignState => {
  const s = specialCampaign(reg, 'web_of_debts');
  s.special!.debts!.visit = { id: 'hv1', day: s.day, items: ITEMS };
  return s;
};
const mount = (s: CampaignState, onAnswer = vi.fn()) => {
  const host = h('div');
  document.body.append(host);
  renderHandlerPanel(host, { state: s, reg, onAnswer });
  return { host, onAnswer };
};
const row = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-intel="${id}"]`)!;
const pick = (host: HTMLElement, id: string, answer: string) => row(host, id).querySelector<HTMLButtonElement>(`button[data-answer="${answer}"]`)!.click();
const submit = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-act="submit"]')!;

describe('the HANDLER panel', () => {
  it('four choices per row, each an analysable option; SUBMIT waits until every row is set', () => {
    const { host, onAnswer } = mount(visiting());
    for (const i of ITEMS) {
      const buttons = [...row(host, i.id).querySelectorAll<HTMLButtonElement>('button[data-answer]')];
      expect(buttons.map((b) => b.dataset.answer)).toEqual(['truth', 'partial', 'false', 'withhold']);
      for (const b of buttons) { expect(b.className).toContain('alius-option'); expect(b.getAttribute('data-analyze')).toBe('glossary:intel_exchange'); }
      expect(row(host, i.id).textContent).toContain(i.label);
    }
    expect(submit(host).getAttribute('aria-disabled')).toBe('true');
    submit(host).click();
    expect(onAnswer).not.toHaveBeenCalled();
    pick(host, ITEMS[0].id, 'truth');
    expect(submit(host).getAttribute('aria-disabled')).toBe('true');
    pick(host, ITEMS[1].id, 'withhold');
    expect(submit(host).getAttribute('aria-disabled')).toBeNull();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: visiting(), settings: DEFAULT_SETTINGS })).toEqual([]);
  });

  it('shows the greeting of her handler and a payment preview that never hints at pressure', () => {
    const s = visiting();
    s.special!.debts!.handlerPressure = 80;
    s.special!.debts!.handlerSuspicion = 90;
    const { host } = mount(s);
    const preview = () => host.querySelector('[data-preview]')!.textContent!;
    pick(host, ITEMS[0].id, 'truth');
    pick(host, ITEMS[1].id, 'partial');
    const full = paymentFor({ a: 'truth', b: 'partial' }, 0);
    expect(preview()).toContain(`${full.credits} CR`);
    expect(preview()).toContain(`${full.supplies} SUPPLIES`);
    expect(host.textContent).not.toMatch(/pressure|suspicion|halved/i);
    const handler = reg.debtHandlers.get(s.special!.debts!.handlerId)!;
    expect(host.textContent).toContain(String(handler.name));
    expect(host.textContent).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('SUBMIT dispatches one answer with every item, and a second press does nothing', () => {
    const { host, onAnswer } = mount(visiting());
    pick(host, ITEMS[0].id, 'truth');
    pick(host, ITEMS[1].id, 'false');
    submit(host).click();
    submit(host).click();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ 'squad:unit_ann': 'truth', 'plan:m1': 'false' });
  });

  it('a refused answer unlocks the panel (the microtask rule); an answer that redraws it leaves it detached and locked', async () => {
    const { host, onAnswer } = mount(visiting());
    pick(host, ITEMS[0].id, 'truth');
    pick(host, ITEMS[1].id, 'truth');
    submit(host).click();
    expect(submit(host).getAttribute('aria-disabled')).toBe('true'); // locked while the answer is out
    await Promise.resolve();
    expect(submit(host).getAttribute('aria-disabled')).toBeNull(); // the engine refused: the panel is still here
    expect(onAnswer).toHaveBeenCalledTimes(1);
    // an accepted answer redraws and detaches the panel: nothing is unlocked on it
    const second = mount(visiting());
    pick(second.host, ITEMS[0].id, 'truth');
    pick(second.host, ITEMS[1].id, 'truth');
    submit(second.host).click();
    second.host.remove();
    await Promise.resolve();
    expect(submit(second.host).getAttribute('aria-disabled')).toBe('true');
  });

  it('draws nothing without an open visit', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    expect(mount(s).host.querySelector('[data-intel]')).toBeNull();
  });
});

describe('the special controller: the visit', () => {
  const rig = (s: CampaignState = visiting()) => {
    const h = worldHarness(reg, s);
    const notices: unknown[][] = [];
    const cuts: string[] = [];
    const deps: SpecialDeps = { ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), notice: (...a) => { notices.push(a); }, cutIn: (t) => { cuts.push(t); } };
    return { h, special: createSpecial(deps), notices, cuts };
  };
  const answers = { 'squad:unit_ann': 'withhold', 'plan:m1': 'withhold' } as const;

  it('answerVisit dispatches one debts/answer_visit with expectChatId', async () => {
    const r = rig();
    expect(await r.special.answerVisit('hv1', { ...answers })).toBe(true);
    expect(r.h.log.filter((a) => a.type === 'debts/answer_visit')).toHaveLength(1);
    expect(r.h.state().special!.debts!.visit).toBeUndefined();
  });

  it('a chat switched meanwhile drops it; a refused answer toasts and returns false', async () => {
    const r = rig();
    r.h.switchChat('other');
    const bad = rig();
    expect(await bad.special.answerVisit('hv9', { ...answers })).toBe(false);
    expect(bad.h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(r.h.state().special!.debts!.visit).toBeDefined();
  });

  it('toasts a threat, the leak and a consequence in the corporate voice; the leak also cuts in', () => {
    const r = rig();
    r.special.onEvents([{ type: 'handler_threat' }, { type: 'handler_leak' }, { type: 'debts_consequence', kind: 'plan' }]);
    expect(r.notices.map((n) => [n[0], n[2], n[3]])).toEqual([['warn', 'HANDLER', 'handler'], ['warn', 'HANDLER', 'handler'], ['warn', 'HANDLER', 'handler']]);
    expect(r.cuts).toHaveLength(1);
    for (const n of r.notices) expect(String(n[1])).not.toMatch(/AUTHOR TO WRITE|\b(he|him|his)\b/i);
    expect(VOICE_OF.handler).toBe('corporate');
  });

  it('the discovery by a soldier is toasted by name', () => {
    const r = rig();
    r.special.onEvents([{ type: 'debts_discovered', unitId: ANN }]);
    expect(String(r.notices[0][1])).toContain('Ann');
  });
});

describe('the DEBTS block', () => {
  const draw = (s: CampaignState): HTMLElement => { const host = h('div'); document.body.append(host); renderDebtsBlock(host, s, reg); return host; };

  it('shows the handler, the corporation, the last visit, what was sold and the pressure as a band only', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const d = s.special!.debts!;
    d.lastVisitDay = 4;
    d.answered = ['a', 'b', 'c'];
    d.handlerSuspicion = 57;
    d.oversightSuspicion = 63;
    const bands = ([[5, 'calm'], [25, 'pressing'], [55, 'threatening']] as const).map(([p, word]) => { d.handlerPressure = p; const host = draw(s); return [host, word] as const; });
    for (const [host, word] of bands) {
      expect(host.textContent).toContain(String(reg.debtHandlers.get(d.handlerId)!.name));
      expect(host.textContent).toContain(String(reg.corporations.get(d.corporationId)!.name));
      expect(host.textContent).toMatch(/Day 4/);
      expect(host.textContent).toMatch(/3 items/);
      const chip = host.querySelector('[data-analyze="glossary:handler_pressure"]')!;
      expect(chip.className).toContain('alius-chip');
      expect(chip.textContent).toBe(`PRESSURE: ${word}`);
      expect(host.textContent).not.toMatch(/\b(57|63|55|25)\b/);
      expect(markedWithout(host)).toEqual([]);
    }
  });

  it('says so when the arrangement ended, and draws nothing without debts', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.special!.debts!.ended = 'fled';
    expect(draw(s).textContent).toMatch(/fled/i);
    expect(draw(campaign(reg, 2)).children).toHaveLength(0);
  });

  it('is part of the CMDR card', () => {
    const host = h('div');
    renderCmdrCard(host, { state: specialCampaign(reg, 'web_of_debts'), registries: reg, raw: false });
    expect(host.querySelector('.alius-debts')).not.toBeNull();
  });
});

describe('what the player may not read', () => {
  it('no provider shows a debts sentinel, raw values on or off', () => {
    const { state, unitId } = hiddenFixture(reg);
    for (const raw of [false, true]) {
      const text = allReadings({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } }, unitId);
      // 63 is also a soldier's stress in the fixture, which raw values may show; the handler's 57 and the label never
      expect(leaks(text, { numbers: raw ? [57] : [63, 57], texts: ['SENTINEL_INTEL_FALSE'] }), `raw ${raw}`).toEqual([]);
    }
  });

  it('the readings: oversight is an unseen threat, pressure a band, the handler named', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.special!.debts!.handlerPressure = 55;
    const read = (id: string) => readingFor(parseSubject(`glossary:${id}`)!, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS, showRawValues: true } })!.lines.join(' ');
    expect(read('oversight_suspicion')).toMatch(/An unseen threat/);
    expect(read('oversight_suspicion')).not.toMatch(/\d/);
    expect(read('handler_pressure')).toMatch(/threatening/);
    expect(read('handler_pressure')).not.toMatch(/\b55\b/);
    expect(read('handler')).toContain(String(reg.debtHandlers.get(s.special!.debts!.handlerId)!.name));
    expect(read('intel_exchange')).not.toMatch(/SENTINEL/);
    s.world.flags.push('defector_arc', 'defector_fled');
    expect(read('defector_arc')).toMatch(/fled/i);
  });

  it('knows_debts stays hidden until the soldier is named, or the handler leaked it to everyone', () => {
    registerSpecialProviders(); // the rule was reset after the previous test
    const s = specialCampaign(reg, 'web_of_debts');
    s.relations[ANN].flags.push('knows_debts');
    const k = () => buildKnowledge(s, DEFAULT_SETTINGS);
    expect(k().flagVisible('knows_debts')).toBe(false);
    s.special!.debts!.discoveredBy = ANN;
    expect(k().flagVisible('knows_debts')).toBe(true);
    s.relations[BEA].flags.push('knows_debts');
    expect(k().flagVisible('knows_debts')).toBe(false);
    s.special!.debts!.ended = 'leaked';
    expect(k().flagVisible('knows_debts')).toBe(true);
  });
});

describe('the handler directive', () => {
  it('special:handler appears only in a scene with a unit who knows, and names the handler without a pronoun for the commander', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const scene = { id: 's1', day: s.day, slot: 'morning', locationId: 'mess_hall', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    expect(specialDirectives(s, reg, [ANN]).map((d) => d.id)).not.toContain('special:handler');
    s.scene = scene;
    expect(specialDirectives(s, reg, [ANN]).map((d) => d.id)).not.toContain('special:handler');
    s.relations[ANN].flags.push('knows_debts');
    const d = specialDirectives(s, reg, [ANN]).find((x) => x.id === 'special:handler')!;
    expect(d.text).toContain('Ann');
    expect(d.text).toContain(String(reg.debtHandlers.get(s.special!.debts!.handlerId)!.name));
    expect(d.text).not.toMatch(/\b(he|him|his)\b|AUTHOR TO WRITE/i);
    expect(specialDirectives(s, reg, [BEA]).map((x) => x.id)).not.toContain('special:handler');
  });
});
