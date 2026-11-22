// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { tonightItems } from '../../../src/ui/hub/model';
import { drawInitiativeChips } from '../../../src/ui/practice/initiativeChips';
import { renderHandoverComposer } from '../../../src/ui/practice/handoverComposer';
import { renderTaskCard } from '../../../src/ui/practice/taskCard';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

function holder(): CampaignState {
  const s = withService(world(reg, 'role'));
  s.content = { enabled: [...(s.content?.enabled ?? []), 'jealousy_games'] }; // the device is the intercept of P9c
  dynamicOf(s, ANN)!.hold = 60;
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
function composer(s: CampaignState = holder()) {
  const host = h('div');
  document.body.append(host);
  const onSend = vi.fn();
  const onClose = vi.fn();
  renderHandoverComposer(host, { state: s, reg, unitId: ANN, onSend, onClose });
  return { host, onSend, onClose };
}
const kinds = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-handover-kind]')];
const days = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-handover-days]')];

describe('the composer', () => {
  it('lists the three kinds and nothing else: the device, the key, the calendar', () => {
    const { host } = composer();
    expect(kinds(host).map((b) => b.getAttribute('data-handover-kind'))).toEqual(['device', 'key', 'calendar']);
    expect(kinds(host).map((b) => b.textContent)).toEqual(['[ THE DEVICE ]', '[ THE KEY ]', '[ THE CALENDAR ]']);
  });

  it('the days follow the kind: a device is one day, a key one to seven, a calendar one to three; words, never digits', () => {
    const { host } = composer();
    kinds(host)[0].click();
    expect(days(host)).toEqual([]); // a device is one day: there is nothing to choose
    expect(host.textContent).toMatch(/for the day/);
    kinds(host)[1].click();
    expect(days(host).map((b) => b.textContent)).toEqual(['[ ONE DAY ]', '[ TWO DAYS ]', '[ THREE DAYS ]', '[ FOUR DAYS ]', '[ FIVE DAYS ]', '[ SIX DAYS ]', '[ SEVEN DAYS ]']);
    kinds(host)[2].click();
    expect(days(host).map((b) => b.getAttribute('data-handover-days'))).toEqual(['1', '2', '3']);
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('sends the kind and the days chosen; nothing before both are chosen; cancel closes', () => {
    const { host, onSend, onClose } = composer();
    const send = () => host.querySelector<HTMLButtonElement>('[data-action="handover-send"]')!;
    send().click();
    expect(onSend).not.toHaveBeenCalled();
    kinds(host)[1].click();
    send().click();
    expect(onSend).not.toHaveBeenCalled(); // no days yet
    days(host)[2].click();
    expect(days(host)[2].getAttribute('aria-pressed')).toBe('true');
    send().click();
    expect(onSend).toHaveBeenCalledWith('key', 3);
    host.querySelector<HTMLButtonElement>('[data-action="handover-cancel"]')!.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('a device needs no days chosen: it is one', () => {
    const { host, onSend } = composer();
    kinds(host)[0].click();
    host.querySelector<HTMLButtonElement>('[data-action="handover-send"]')!.click();
    expect(onSend).toHaveBeenCalledWith('device', 1);
  });

  it('a kind she has already, or that waits for the words, is closed with the reason', () => {
    const s = holder();
    s.practices = { ...blankPractices(), handovers: [{ id: 'ph1', kind: 'key', holderId: ANN, untilDay: 25 }] };
    const { host, onSend } = composer(s);
    const key = kinds(host)[1];
    expect(key.getAttribute('aria-disabled')).toBe('true');
    expect(key.title).toMatch(/already/i);
    key.click();
    expect(days(host)).toHaveLength(0);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('every element carries data-analyze, resolves and is reachable', () => {
    const { host } = composer();
    kinds(host)[1].click();
    for (const b of host.querySelectorAll('button')) expect(b.getAttribute('data-analyze'), b.textContent ?? '').toBe('glossary:handover');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(holder()))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });
});

describe('the chip and what stands', () => {
  const draw = (s: CampaignState) => {
    const host = h('div');
    document.body.append(host);
    const handlers = { onAsk: vi.fn(), onConfess: vi.fn(), onAskPermission: vi.fn(), onHandOver: vi.fn(), onTakeBack: vi.fn() };
    drawInitiativeChips(host, { state: s, reg, pick: () => true, ...handlers });
    return { host, ...handlers };
  };

  it('[ GIVE HER … ] shows for a holder and opens the composer under it; sending hands the choice to the app and closes it', () => {
    const { host, onHandOver } = draw(holder());
    const chip = host.querySelector<HTMLButtonElement>('[data-action="give"]')!;
    expect(chip.textContent).toBe('[ GIVE HER … ]');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:handover');
    chip.click();
    expect(host.querySelector('.alius-handover')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[data-handover-kind="device"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-action="handover-send"]')!.click();
    expect(onHandOver).toHaveBeenCalledWith(ANN, 'device', 1);
    expect(host.querySelector('.alius-handover')).toBeNull();
  });

  it('not for an eligible unit who does not hold yet', () => {
    const s = holder();
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(draw(s).host.querySelector('[data-action="give"]')).toBeNull();
  });

  it('what stands can be taken back: a chip for each, with what it is; it sends the handover id', () => {
    const s = holder();
    s.practices = { ...blankPractices(), handovers: [{ id: 'ph1', kind: 'key', holderId: ANN, untilDay: 25 }, { id: 'ph2', kind: 'calendar', holderId: ANN, untilDay: 22 }] };
    const { host, onTakeBack } = draw(s);
    const chips = [...host.querySelectorAll<HTMLButtonElement>('[data-action="take-back"]')];
    expect(chips.map((c) => c.textContent)).toEqual(['[ TAKE BACK THE KEY ]', '[ TAKE BACK THE CALENDAR ]']);
    chips[1].click();
    expect(onTakeBack).toHaveBeenCalledWith('ph2');
    for (const c of chips) expect(c.getAttribute('data-analyze')).toBe('glossary:handover');
  });
});

describe('the card', () => {
  const task = (): Task => ({
    id: 'pt1', holderId: ANN, kind: 'task', tags: [], track: 'service', tier: 1, stakes: 'severe', check: 'model', proof: 'none', text: 'AUTHOR TO WRITE: The commander gives Ann the key, for three days.', summary: 'gave her the key to the quarters, for three days',
    status: 'offered', acceptForm: 'signed', day: 20, handover: 'key', handoverDays: 3,
  });
  const draw = (said = false) => {
    const s = holder();
    s.practices = { ...blankPractices(), seq: 3, tasks: [{ ...task(), ...(said ? { said: true as const } : {}) }] };
    const host = h('div');
    document.body.append(host);
    const handlers = { onAnswer: vi.fn(), onSign: vi.fn(), focusInput: vi.fn() };
    renderTaskCard(host, { state: s, reg, task: s.practices.tasks[0], ...handlers });
    return { host, ...handlers };
  };

  it('has no TALK, and its REFUSE is the commander taking the offer back: [ CANCEL ]', () => {
    const { host, onAnswer } = draw();
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['[ ACCEPT ]', '[ CANCEL ]']);
    host.querySelector<HTMLButtonElement>('[data-task-answer="refuse"]')!.click();
    expect(onAnswer).toHaveBeenCalledWith('refuse');
  });

  it('asks for the words, then the signature; the closes line says what is handed over', () => {
    const { host } = draw();
    expect(host.textContent).toContain('Say it in your own words.');
    expect(host.querySelector('.alius-task-closes')!.textContent).toMatch(/key/i);
    expect(draw(true).host.querySelector('[data-task-sign]')).not.toBeNull();
  });
});

describe('the device and the category it needs (review I2)', () => {
  it('with jealousy games off the device chip is closed with the reason; the key and the calendar stay open', () => {
    const off = holder();
    off.content = { enabled: off.content!.enabled.filter((c) => c !== 'jealousy_games') };
    const { host } = composer(off);
    const device = host.querySelector('[data-handover-kind="device"]')!;
    expect(device.getAttribute('aria-disabled')).toBe('true');
    expect(device.getAttribute('title')).toMatch(/jealousy/i);
    expect(host.querySelector('[data-handover-kind="key"]')!.getAttribute('aria-disabled')).toBeNull();
    expect(host.querySelector('[data-handover-kind="calendar"]')!.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('the HOME line', () => {
  it('a calendar she fills is told in one line: whose hand and which day', () => {
    const s = holder();
    s.personal = { seq: 3, bookings: [{ id: 'bk1', unitId: ANN, kindId: 'train_together', day: s.day + 1, slot: 'morning', status: 'booked', source: 'practice', made: s.day, practiceId: 'ph1' }] } as never;
    s.practices = { ...blankPractices(), handovers: [{ id: 'ph1', kind: 'calendar', holderId: ANN, untilDay: s.day + 1 }] };
    const lines = tonightItems(s, reg);
    const line = lines.find((l) => l.kind === 'booking')!;
    expect(line.text).toContain('hand');
    expect(line.text).toContain('Ann');
    expect(line.text).toContain('tomorrow');
    expect(line.text).not.toMatch(/\d/);
    // an ordinary booking keeps its line
    const plain = holder();
    plain.personal = { seq: 3, bookings: [{ id: 'bk1', unitId: ANN, kindId: 'train_together', day: plain.day + 1, slot: 'morning', status: 'booked', source: 'roll', made: plain.day }] } as never;
    expect(tonightItems(plain, reg).find((l) => l.kind === 'booking')!.text).toMatch(/has booked tomorrow/);
  });
});
