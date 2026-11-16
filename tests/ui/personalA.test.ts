// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { personalDayStep } from '../../src/engine/personal/dayStep';
import type { Booking, CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { h } from '../../src/ui/dom';
import { tonightItems } from '../../src/ui/hub/model';
import { renderOpsTab } from '../../src/ui/ops/opsTab';
import { renderClaimCard } from '../../src/ui/personal/claimCard';
import { renderDeviceBlock } from '../../src/ui/personal/deviceBlock';
import { renderSchedule } from '../../src/ui/personal/schedule';
import { drawProposalChips } from '../../src/ui/proposalChips';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { ANN, atImpunity, BEA, CAT, ctxFrom, enable, loadCore, partner, plain, setRecord } from '../helpers/personal';
import { offerProposal } from '../../src/engine/relations/proposals';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const q = <T extends HTMLElement = HTMLElement>(host: HTMLElement, sel: string) => host.querySelector<T>(sel);
const qa = (host: HTMLElement, sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const bk = (id: string, unitId: string, over: Partial<Booking> = {}): Booking =>
  ({ id, unitId, kindId: 'evening_with_me', day: 6, slot: 'evening', status: 'booked', source: 'roll', made: 5, ...over });

/** Ann: a dominant lover (access 4, jealousy_games on), decor placed. Day 5. */
function lover(): CampaignState {
  const s = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 80 }), 'jealousy_games');
  s.day = 5;
  atImpunity(s, reg, ANN, 55);
  personalDayStep(s, ctxFrom(s, reg));
  s.personal!.bookings = [];
  return s;
}
/** Everything a DM thread with Bea needs, and a DM edit of Ann's waiting for her. */
const edit = { id: 'icp_1', editorId: ANN, toUnitId: BEA, original: 'Meet me at the yard.', edited: 'Meet me at the yard. — Ann added this.' };

describe('the EDITED BY chip in COMMS', () => {
  function render(over: { edit?: typeof edit | null } = {}) {
    const state = lover();
    const ctx = {
      getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(),
      edit: () => (over.edit === undefined ? edit : over.edit), onAnswerEdit: vi.fn(),
    };
    const host = mount();
    renderCommsTab(host, ctx);
    (q(host, `button[data-unit="${BEA}"]`) as HTMLElement).click();
    return { host, ctx, state };
  }

  it('the DM input shows the edited text with EDITED BY and both buttons call the controller', () => {
    const { host, ctx } = render();
    const input = q<HTMLInputElement>(host, 'input[name="dm"]')!;
    expect(input.value).toBe(edit.edited);
    expect(input.readOnly).toBe(true);
    expect(q(host, '.alius-edit .alius-chip')!.textContent).toBe('EDITED BY ANN');
    expect(q(host, '[data-action="send"]')!.getAttribute('aria-disabled')).toBe('true');
    (q(host, '.alius-edit [data-action="keep"]') as HTMLElement).click();
    expect(ctx.onAnswerEdit).toHaveBeenLastCalledWith(true);
    (q(host, '.alius-edit [data-action="revert"]') as HTMLElement).click();
    expect(ctx.onAnswerEdit).toHaveBeenLastCalledWith(false);
    // sending is refused while the edit waits
    (q(host, '[data-action="send"]') as HTMLElement).click();
    expect(ctx.onSend).not.toHaveBeenCalled();
  });

  it('no edit, no chip: the input is typed in as before; an edit for another thread shows nothing here', () => {
    const none = render({ edit: null });
    expect(q(none.host, '.alius-edit')).toBeNull();
    expect(q<HTMLInputElement>(none.host, 'input[name="dm"]')!.readOnly).toBe(false);
    const other = render({ edit: { ...edit, toUnitId: CAT } });
    expect(q(other.host, '.alius-edit')).toBeNull();
  });

  it('the chip carries data-analyze and the buttons are reachable', () => {
    const { host, state } = render();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });
});

describe('courtship chips', () => {
  function proposal(lead: 'assertive' | 'balanced') {
    const s = partner(plain(reg), ANN, { lead, stateId: 'friend', affinity: 40, trust: 40 });
    s.relations[ANN].attraction = 40;
    expect(offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'dm' })).toHaveLength(1);
    const host = mount();
    const onAnswer = vi.fn();
    drawProposalChips(host, s, (p) => p.channel === 'dm', onAnswer, reg);
    return { s, host, onAnswer };
  }

  it("a courting unit's proposal shows ACCEPT / DEFLECT / SET A CONDITION; another's shows P3's chips", () => {
    const court = proposal('assertive');
    expect(qa(court.host, 'button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DEFLECT]', '[SET A CONDITION]']);
    expect(q(court.host, '.alius-chip')!.textContent).toBe('COURTING');
    const plainOne = proposal('balanced');
    expect(qa(plainOne.host, 'button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]', '[NOT NOW]']);
    expect(q(plainOne.host, '.alius-chip')).toBeNull();
    // and without the registries, P3's chips whatever the unit is
    const host = mount();
    drawProposalChips(host, court.s, () => true, vi.fn());
    expect(qa(host, 'button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]', '[NOT NOW]']);
  });

  it('ACCEPT and DEFLECT answer at once; SET A CONDITION opens a one-line input and answers with its text', () => {
    const { s, host, onAnswer } = proposal('assertive');
    const id = s.proposals![0].id;
    (qa(host, 'button')[0]).click();
    expect(onAnswer).toHaveBeenLastCalledWith(id, 'accept');
    (qa(host, 'button')[1]).click();
    expect(onAnswer).toHaveBeenLastCalledWith(id, 'deflect');
    (qa(host, 'button')[2]).click();
    const input = q<HTMLInputElement>(host, 'input.alius-input')!;
    expect(input.maxLength).toBe(160);
    const confirm = q<HTMLButtonElement>(host, '[data-action="condition-ok"]')!;
    confirm.click(); // an empty condition answers nothing
    expect(onAnswer).toHaveBeenCalledTimes(2);
    input.value = '  Tell me before you ride out.  ';
    confirm.click();
    expect(onAnswer).toHaveBeenLastCalledWith(id, 'accept_condition', 'Tell me before you ride out.');
  });

  it('every chip carries data-analyze', () => {
    const { s, host } = proposal('assertive');
    (qa(host, 'button')[2]).click();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });
});

describe('the DEVICE block of a dossier', () => {
  const block = (s: CampaignState, unitId = ANN, raw = false) => {
    const handlers = { onPeel: vi.fn(), onCancel: vi.fn() };
    const el = renderDeviceBlock(s, reg, unitId, handlers);
    const host = mount();
    if (el) host.append(el);
    return { host, el, ...handlers, raw };
  };

  it('shows ACCESS L{n} {NAME}, the decor parts, the notes and her bookings', () => {
    const s = lover();
    s.personal!.bookings = [bk('bk_1', ANN)];
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 't', text: 'Tell me before you ride out.', status: 'active', day: 1, brokenCount: 0 }] };
    const { host } = block(s);
    expect(q(host, '[data-access]')!.textContent).toBe('ACCESS L4 ANN');
    expect(qa(host, '[data-decor-part]').map((e) => e.dataset.decorPart)).toEqual(['sticker', 'wallpaper', 'contact']);
    expect(host.textContent).toContain('Tell me before you ride out.');
    expect(qa(host, '[data-booking]').map((e) => e.dataset.booking)).toEqual(['bk_1']);
  });

  it('PEEL dispatches device/remove_decor through the handler; CANCEL cancels the booking', () => {
    const s = lover();
    s.personal!.bookings = [bk('bk_1', ANN)];
    const b = block(s);
    (q(b.host, '[data-decor-part="sticker"] [data-action="peel"]') as HTMLElement).click();
    expect(b.onPeel).toHaveBeenCalledWith(ANN, 'sticker');
    (q(b.host, '[data-booking="bk_1"] [data-action="cancel"]') as HTMLElement).click();
    expect(b.onCancel).toHaveBeenCalledWith('bk_1');
  });

  it('a unit with no access, no decor and no booking gets no block; the wallpaper shows only on its owner', () => {
    expect(block(plain(reg)).el).toBeNull();
    const s = lover();
    partner(s, BEA, { lead: 'assertive', stateId: 'lover', affinity: 95 });
    personalDayStep(s, ctxFrom(s, reg));
    expect(qa(block(s, ANN).host, '[data-decor-part="wallpaper"]')).toHaveLength(0);
    expect(qa(block(s, BEA).host, '[data-decor-part="wallpaper"]')).toHaveLength(1);
  });

  it('a faded decor says so and offers no PEEL', () => {
    const s = lover();
    s.personal!.decor![ANN].fadedUntil = s.day + 3;
    const { host } = block(s);
    expect(qa(host, '[data-decor-part][data-faded="true"]').length).toBeGreaterThan(0);
    expect(qa(host, '[data-action="peel"]')).toHaveLength(0);
  });

  it('is part of the SQUAD dossier and carries data-analyze everywhere', () => {
    const s = lover();
    s.personal!.bookings = [bk('bk_1', ANN)];
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = mount();
    renderSquadTab(host, {
      st, getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => getSettings(st), onNewCampaign: vi.fn(),
      onPeel: vi.fn(), onCancelBooking: vi.fn(),
    });
    expect(qa(host, '.alius-device-block')).toHaveLength(1);
    const device = q(host, '.alius-device-block')!;
    expect(markedWithout(device)).toEqual([]);
    expect(unresolved(device, env(s))).toEqual([]);
    expect(unreachable(device)).toEqual([]);
  });
});

describe('the SCHEDULE of the OPS tab', () => {
  const handlers = () => ({ onCancel: vi.fn(), onKeep: vi.fn(), onSettle: vi.fn() });
  function clash(): CampaignState {
    const s = lover();
    partner(s, BEA, { lead: 'assertive', stateId: 'lover', affinity: 80 });
    s.personal!.bookings = [bk('bk_1', ANN, { conflict: true }), bk('bk_2', BEA, { conflict: true }), bk('bk_3', CAT, { day: 7, slot: 'afternoon', kindId: 'train_together' })];
    return s;
  }

  it('the schedule lists bookings with her name and accent; CANCEL dispatches booking/cancel', () => {
    const s = lover();
    s.personal!.bookings = [bk('bk_1', ANN), bk('bk_9', ANN, { day: 20 })];
    const hs = handlers();
    const el = renderSchedule(s, reg, hs)!;
    const host = mount();
    host.append(el);
    const rows = qa(host, '[data-booking]');
    expect(rows.map((r) => r.dataset.booking)).toEqual(['bk_1']); // the next three days only
    expect(rows[0].textContent).toContain('ANN');
    expect(rows[0].textContent).toContain('EVENING');
    expect(q(host, '[data-booking="bk_1"] .alius-chip')!.style.getPropertyValue('--unit-accent')).not.toBe('');
    (q(host, '[data-action="cancel"]') as HTMLElement).click();
    expect(hs.onCancel).toHaveBeenCalledWith('bk_1');
  });

  it('a conflict offers KEEP HERS on each and LET THEM SETTLE IT once', () => {
    const s = clash();
    const hs = handlers();
    const host = mount();
    host.append(renderSchedule(s, reg, hs)!);
    expect(qa(host, '[data-conflict="true"]')).toHaveLength(2);
    const keeps = qa(host, '[data-action="keep"]');
    expect(keeps.map((b) => b.textContent)).toEqual(['[KEEP HERS]', '[KEEP HERS]']);
    keeps[1].click();
    expect(hs.onKeep).toHaveBeenCalledWith('bk_2');
    const settle = qa(host, '[data-action="settle"]');
    expect(settle).toHaveLength(1);
    expect(settle[0].textContent).toBe('[LET THEM SETTLE IT]');
    settle[0].click();
    expect(hs.onSettle).toHaveBeenCalledWith(6, 'evening');
  });

  it('nothing booked: no schedule at all', () => {
    expect(renderSchedule(lover(), reg, handlers())).toBeNull();
  });

  it('the OPS tab shows it and every marked element resolves', () => {
    const s = clash();
    const host = mount();
    const onCancelBooking = vi.fn();
    renderOpsTab(host, {
      getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(),
      onCancelBooking, onKeepBooking: vi.fn(), onSettleBooking: vi.fn(),
    });
    const schedule = q(host, '.alius-schedule')!;
    expect(schedule).not.toBeNull();
    (q(schedule, '[data-booking="bk_3"] [data-action="cancel"]') as HTMLElement).click();
    expect(onCancelBooking).toHaveBeenCalledWith('bk_3');
    expect(markedWithout(schedule)).toEqual([]);
    expect(unresolved(schedule, env(s))).toEqual([]);
    expect(unreachable(schedule)).toEqual([]);
  });
});

describe('the claim card', () => {
  const card = (cats: string[]) => {
    const s = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover' }), ...cats);
    const handlers = { onLetStand: vi.fn(), onRefuse: vi.fn() };
    const host = mount();
    host.append(renderClaimCard(s, reg, { unitId: ANN, day: s.day }, handlers));
    return { s, host, ...handlers };
  };

  it('offers REFUSE PUBLICLY only with public_humiliation on', () => {
    const off = card([]);
    expect(qa(off.host, 'button').map((b) => b.textContent)).toEqual(['[LET IT STAND]']);
    const on = card(['public_humiliation']);
    expect(qa(on.host, 'button').map((b) => b.textContent)).toEqual(['[LET IT STAND]', '[REFUSE PUBLICLY]']);
    (qa(on.host, 'button')[1]).click();
    expect(on.onRefuse).toHaveBeenCalledWith(ANN);
    (qa(on.host, 'button')[0]).click();
    expect(on.onLetStand).toHaveBeenCalledWith(ANN);
    expect(on.host.textContent).toContain('ANN');
  });

  it("not among her own limits: with the category on but hers, only LET IT STAND", () => {
    const s = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover' }), 'public_humiliation');
    s.squad.find((u) => u.id === ANN)!.bond!.ownLimits = { categories: ['public_humiliation'] };
    const host = mount();
    host.append(renderClaimCard(s, reg, { unitId: ANN, day: s.day }, { onLetStand: vi.fn(), onRefuse: vi.fn() }));
    expect(qa(host, 'button').map((b) => b.textContent)).toEqual(['[LET IT STAND]']);
  });

  it('carries data-analyze and resolves', () => {
    const { s, host } = card(['public_humiliation']);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });
});

describe('the Tonight list', () => {
  it('ends with the booking line and never shows more than six', () => {
    const s = lover();
    s.personal!.bookings = [bk('bk_1', ANN, { day: 6 })];
    let items = tonightItems(s, reg);
    expect(items.at(-1)).toMatchObject({ kind: 'booking', unitId: ANN, analyze: 'glossary:booking' });
    expect(items.at(-1)!.text).toContain('Ann');
    expect(items.at(-1)!.text).toContain('tomorrow');
    // today's slot says today
    s.personal!.bookings[0].day = s.day;
    items = tonightItems(s, reg);
    expect(items.at(-1)!.text).toContain('today');
    // a crowded list is still six lines
    s.calendar.shortageStreak = 2;
    s.commander.injuredUntilDay = s.day + 3;
    for (const id of [BEA, CAT, 'unit_dee']) s.dms[id] = [{ id: `m_${id}`, from: id, text: 'hi', day: s.day, slot: 'morning', read: false }];
    expect(tonightItems(s, reg)).toHaveLength(6);
    // a cancelled or lapsed booking and one for later say nothing
    s.personal!.bookings[0].status = 'cancelled';
    expect(tonightItems(s, reg).some((i) => i.kind === 'booking')).toBe(false);
    s.personal!.bookings[0] = bk('bk_2', ANN, { day: s.day + 4 });
    expect(tonightItems(s, reg).some((i) => i.kind === 'booking')).toBe(false);
  });
});

void setRecord;
