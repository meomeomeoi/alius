// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { startHold } from '../../../src/engine/practice/hold';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { renderExpeditionScreen } from '../../../src/ui/expedition/expeditionScreen';
import { renderSquadCallCard } from '../../../src/ui/expedition/squadCallCard';
import { renderAlarmCard } from '../../../src/ui/practice/alarmCard';
import { drawHeldStrip } from '../../../src/ui/practice/heldStrip';
import type { ExpeditionController } from '../../../src/world/expeditionController';
import { depart, withMission } from '../../helpers/expedition';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { ctxOf, loadCore, run } from '../../helpers/world';
import { ANN, unitOf, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: false } });
const mount = (): HTMLElement => { const host = h('div'); document.body.append(host); return host; };
const click = (el: Element | null) => (el as HTMLElement).click();

/** Ann keeps the commander (a possessive holder with no mercy: she keeps against every duty) from the morning. */
function held(span: 1 | 2 | 'day' = 2): CampaignState {
  const s = world(reg, 'role');
  s.slot = 'morning';
  dynamicOf(s, ANN)!.hold = 70;
  const u = unitOf(s, ANN);
  u.bond!.practice!.style = { primary: 'possessive' };
  u.values = { ...u.values, mercy: 0, corporate: 0 };
  startHold(s, ctxOf(s, reg), ANN, span);
  return s;
}
const withAlarm = (over: Partial<NonNullable<CampaignState['practices']>['alarm']> & { kind?: 'launch' | 'deadline' | 'night' } = {}): CampaignState => {
  const s = held();
  s.practices!.alarm = { id: 'pa0', holderId: ANN, kind: 'launch', day: 20, slot: 'morning', answer: 'keep', ...over };
  s.practices!.held!.alarm = 'pa0';
  return s;
};
const handlers = () => ({ accept: vi.fn(), argue: vi.fn(), defy: vi.fn(), sendSquad: vi.fn(), dismiss: vi.fn() });

describe('the alarm card', () => {
  it('shows her answer in her voice, her name, and the three choices; the buttons answer with the alarm id', () => {
    const s = withAlarm();
    const hs = handlers();
    const card = renderAlarmCard(s, reg, null, hs)!;
    expect(card).not.toBeNull();
    document.body.append(card);
    expect(card.getAttribute('data-alarm')).toBe('pa0');
    expect(card.querySelector('.alius-voice-from')!.textContent).toContain(unitOf(s, ANN).displayName);
    expect(card.textContent).not.toContain('AUTHOR TO WRITE');
    expect(card.textContent).not.toMatch(/\b(he|him|his)\b/i);
    const label = (a: string) => card.querySelector<HTMLButtonElement>(`[data-alarm-answer="${a}"]`)!;
    expect([label('accept').textContent, label('argue').textContent, label('defy').textContent]).toEqual(['[ ACCEPT ]', '[ ARGUE ]', '[ DEFY ]']);
    click(label('accept'));
    click(label('argue'));
    click(label('defy'));
    expect([hs.accept, hs.argue, hs.defy].map((f) => f.mock.calls)).toEqual([[['pa0']], [['pa0']], [['pa0']]]);
    click(card.querySelector('[data-alarm-send]'));
    expect(hs.sendSquad).toHaveBeenCalledWith('pa0');
  });

  it('says a different thing for each duty (a launch, a deadline, a knock); a knock has no squad to send', () => {
    const lines = (['launch', 'deadline', 'night'] as const).map((kind) => {
      const card = renderAlarmCard(withAlarm({ kind }), reg, null, handlers())!;
      return { kind, text: card.querySelector('[data-alarm-line]')!.textContent, send: card.querySelector('[data-alarm-send]') !== null };
    });
    expect(new Set(lines.map((l) => l.text)).size).toBe(3);
    expect(lines.map((l) => l.send)).toEqual([true, true, false]);
  });

  it('ARGUE is disabled once it was used; an accepted keep draws no card (the strip carries what is left); no alarm draws none', () => {
    const argued = renderAlarmCard(withAlarm({ argued: true }), reg, null, handlers())!;
    expect(argued.querySelector<HTMLButtonElement>('[data-alarm-answer="argue"]')!.disabled).toBe(true);
    expect(argued.querySelector<HTMLButtonElement>('[data-alarm-answer="accept"]')!.disabled).toBe(false);
    expect(renderAlarmCard(withAlarm({ accepted: true }), reg, null, handlers())).toBeNull();
    expect(renderAlarmCard(held(), reg, null, handlers())).toBeNull();
  });

  it('a release is told as a card with her line and OK; a late release says why the launch then fails', () => {
    const s = held();
    s.practices!.held = undefined;
    delete s.practices!.held;
    const hs = handlers();
    const plain = renderAlarmCard(s, reg, { holderId: ANN, kind: 'launch', answer: 'release' }, hs)!;
    expect(plain.querySelector('[data-alarm-answer]')).toBeNull();
    expect(plain.querySelector('[data-alarm-reason]')).toBeNull();
    click(plain.querySelector('[data-alarm-dismiss]'));
    expect(hs.dismiss).toHaveBeenCalledTimes(1);
    const reason = 'District 7 Quarantine takes 2 slots: leave in the Morning or Afternoon.';
    const late = renderAlarmCard(s, reg, { holderId: ANN, kind: 'launch', answer: 'release_late', reason }, hs)!;
    expect(late.querySelector('[data-alarm-reason]')!.textContent).toContain(reason);
    expect(late.querySelector('[data-alarm-line]')!.textContent).not.toBe(plain.querySelector('[data-alarm-line]')!.textContent);
  });

  it('every part is marked for the analysis tool and opens a panel', () => {
    const host = mount();
    const s = withAlarm();
    host.append(renderAlarmCard(s, reg, null, handlers())!);
    const late = renderAlarmCard(s, reg, { holderId: ANN, kind: 'launch', answer: 'release_late', reason: 'Too late.' }, handlers())!;
    host.append(late);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze="glossary:alarm"]').length).toBeGreaterThan(0);
  });
});

describe('the held strip', () => {
  it('shows while the commander is held, with who holds, when it ends (as a word) and [ ASK TO BE LET GO ]', () => {
    const s = held(2);
    const host = mount();
    const ask = vi.fn();
    drawHeldStrip(host, s, reg, { sensory: false, askRelease: ask, sendSquad: vi.fn() });
    const strip = host.querySelector('[data-held-strip]')!;
    expect(strip.textContent).toContain(unitOf(s, ANN).displayName);
    expect(strip.textContent).toContain('afternoon');
    expect(strip.textContent).not.toMatch(/\d/);
    click(host.querySelector('[data-ask-release]'));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-ask-release]')!.textContent).toBe('[ ASK TO BE LET GO ]');
  });

  it('a hold with no duration does not say when it ends; no hold, no strip; a hold not yet begun draws none', () => {
    const hidden = held(2);
    hidden.practices!.held!.hidden = true;
    const host = mount();
    drawHeldStrip(host, hidden, reg, { sensory: false, askRelease: vi.fn(), sendSquad: vi.fn() });
    expect(host.querySelector('[data-held-strip]')!.textContent).not.toMatch(/afternoon|morning|evening|until/i);
    const none = mount();
    drawHeldStrip(none, world(reg, 'role'), reg, { sensory: false, askRelease: vi.fn(), sendSquad: vi.fn() });
    expect(none.children).toHaveLength(0);
    const later = held(1);
    later.slot = 'afternoon';
    const waiting = mount();
    drawHeldStrip(waiting, later, reg, { sensory: false, askRelease: vi.fn(), sendSquad: vi.fn() });
    expect(waiting.children).toHaveLength(0);
  });

  it('in sensory mode only plain lines remain: no strip chrome, one plain line, and still the way to ask', () => {
    const s = held(2);
    const host = mount();
    const ask = vi.fn();
    drawHeldStrip(host, s, reg, { sensory: true, askRelease: ask, sendSquad: vi.fn() });
    expect(host.querySelector('[data-held-strip]')).toBeNull();
    expect(host.querySelector('p[data-held-line]')).not.toBeNull();
    click(host.querySelector('[data-ask-release]'));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('while a kept alarm of a launch or a deadline stands (accepted), [ SEND THE SQUAD ] is on the strip', () => {
    const s = withAlarm({ accepted: true });
    const host = mount();
    const send = vi.fn();
    drawHeldStrip(host, s, reg, { sensory: false, askRelease: vi.fn(), sendSquad: send });
    click(host.querySelector('[data-held-send]'));
    expect(send).toHaveBeenCalledWith('pa0');
    const night = mount();
    drawHeldStrip(night, withAlarm({ accepted: true, kind: 'night' }), reg, { sensory: false, askRelease: vi.fn(), sendSquad: send });
    expect(night.querySelector('[data-held-send]')).toBeNull();
  });

  it('every part is marked for the analysis tool and opens a panel', () => {
    const s = withAlarm({ accepted: true });
    const host = mount();
    drawHeldStrip(host, s, reg, { sensory: false, askRelease: vi.fn(), sendSquad: vi.fn() });
    const plain = mount();
    drawHeldStrip(plain, s, reg, { sensory: true, askRelease: vi.fn(), sendSquad: vi.fn() });
    for (const root of [host, plain]) {
      expect(markedWithout(root)).toEqual([]);
      expect(unresolved(root, env(s))).toEqual([]);
      expect(unreachable(root)).toEqual([]);
    }
    expect(host.querySelector('[data-analyze="glossary:held"]')).not.toBeNull();
    expect(host.querySelector('[data-analyze="glossary:ask_release"]')).not.toBeNull();
    expect(plain.querySelector('[data-analyze="glossary:sensory_mode"]')).not.toBeNull();
  });
});

describe('the squad-call card and the run without the commander', () => {
  const SQUAD_TEMPLATE = {
    id: 'evt_squad', scale: 'minor', contexts: ['expedition_event'],
    fixed: { title: 'The ridge', setup: 'A ridge.', options: [{ label: 'Talk them down', requires: { stat: 'authority', rank: 1 }, effects: [] }, { label: 'Wait it out', effects: [{ type: 'party_stress', amount: 7 }] }] },
  };
  function atSquadCall(): { state: CampaignState; regs: Registries } {
    const regs = { ...reg, dilemmaTemplates: new Map([['evt_squad', SQUAD_TEMPLATE]]) } as unknown as Registries;
    const base = world(reg, 'role');
    const { state, mission } = withMission(reg, base);
    for (const u of state.squad) u.defects = [];
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map.nodes.n0_0.type = 'event';
    s.expedition!.withoutCommand = { holderId: ANN };
    return { state: run(s, regs, { type: 'expedition/move', payload: { nodeId: 'n0_0' } }).state, regs };
  }

  it('shows the option the squad took and ACKNOWLEDGE; nothing when no squad call waits', () => {
    const { state, regs } = atSquadCall();
    const ack = vi.fn();
    const card = renderSquadCallCard(state, regs, ack)!;
    document.body.append(card);
    expect(card.textContent).toContain('Wait it out');
    expect(card.textContent).toContain('The ridge');
    expect(card.textContent).not.toMatch(/\b(he|him|his)\b/i);
    click(card.querySelector('[data-ack-squad-call]'));
    expect(ack).toHaveBeenCalledTimes(1);
    const calm = structuredClone(state);
    delete calm.expedition!.pending;
    expect(renderSquadCallCard(calm, regs, ack)).toBeNull();
    expect(markedWithout(card)).toEqual([]);
    expect(unresolved(card, env(state))).toEqual([]);
    expect(card.querySelector('[data-analyze="glossary:squad_call"]')).not.toBeNull();
  });

  function screen(state: CampaignState, regs: Registries) {
    const controller = {
      plan: vi.fn(), planning: vi.fn(() => null), cancelPlan: vi.fn(), launch: vi.fn(() => true), move: vi.fn(), choose: vi.fn(), treat: vi.fn(), setFormation: vi.fn(), fight: vi.fn(() => true),
      afterCombat: vi.fn(), retreat: vi.fn(), return: vi.fn(), requestRecap: vi.fn(async () => {}), acknowledge: vi.fn(), ackHerCall: vi.fn(), ackSquadCall: vi.fn(), debrief: vi.fn(async () => true),
    } as unknown as ExpeditionController & { ackSquadCall: ReturnType<typeof vi.fn> };
    const host = mount();
    renderExpeditionScreen(host, { getState: () => state, registries: regs, settings: () => DEFAULT_SETTINGS, controller, onClose: vi.fn() });
    return { host, controller };
  }

  it('the run view says it is without command, shows the squad-call card instead of the options and acknowledges through the controller', () => {
    const { state, regs } = atSquadCall();
    const { host, controller } = screen(state, regs);
    expect(host.querySelector('[data-without-command]')!.textContent).toContain('WITHOUT COMMAND');
    expect(host.querySelector('[data-without-command]')!.getAttribute('data-analyze')).toBe('glossary:without_command');
    expect(host.querySelector('[data-option]')).toBeNull();
    click(host.querySelector('[data-ack-squad-call]'));
    expect(controller.ackSquadCall).toHaveBeenCalledTimes(1);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state))).toEqual([]);
  });

  it('a run with the commander shows no such chip', () => {
    const { state, regs } = atSquadCall();
    delete state.expedition!.withoutCommand;
    const { host } = screen(state, regs);
    expect(host.querySelector('[data-without-command]')).toBeNull();
  });

  it('a fight of a run without the commander never asks for a cover unit', () => {
    const { state } = atSquadCall();
    const s = structuredClone(state);
    s.expedition!.pending = { kind: 'combat', nodeId: 'n0_0', encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1, exposesCommander: true } } as never;
    s.expedition!.phase = 'combat';
    const { host } = screen(s, reg);
    expect(host.querySelector('select[name="cover"]')).toBeNull();
    expect([...host.querySelectorAll('button')].find((b) => b.textContent!.includes('[ FIGHT ]'))!.disabled).toBe(false);
    const normal = structuredClone(s);
    delete normal.expedition!.withoutCommand;
    const withCommand = screen(normal, reg);
    expect(withCommand.host.querySelector('select[name="cover"]')).not.toBeNull();
  });
});
