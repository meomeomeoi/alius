// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { cabinOf, cabinOwner, registerPlanMarks, resetPlanMarks, unitCabins } from '../../src/engine/basePlan';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  resetPlanMarks();
  document.body.innerHTML = '';
});

function mount(state: CampaignState, opts: { reduced?: boolean } = {}) {
  const onTalk = vi.fn();
  const onReadNote = vi.fn();
  const ctx: HubCtx = {
    getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg,
    settings: () => ({ ...DEFAULT_SETTINGS, reducedMotion: opts.reduced === true }),
    ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
    onTalk, onEndSlot: vi.fn(), onOpenPda: vi.fn(), onReadNote, avatar: () => null,
  };
  const root = h('div', { id: 'alius-shell' });
  const host = h('div', { class: 'alius-hub-host' });
  const device = h('div', { class: 'alius-device' });
  root.append(host, device);
  document.body.append(root);
  renderHub(host, device, ctx);
  const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
  return { host, device, ctx, onTalk, q, rerender: () => renderHub(host, device, ctx) };
}

const stage = (host: HTMLElement) => host.querySelector<HTMLElement>('.alius-hub-plan')!;
const layer = (host: HTMLElement, f: string) => host.querySelector<HTMLElement>(`.alius-plan-layer[data-floor="${f}"]`)!;

describe('the plan stage (P10d)', () => {
  it('opens on the ground floor: its layer is shown, the others are hidden; the SVG draws every floor', () => {
    const m = mount(campaign(reg, 4));
    expect(stage(m.host).dataset.floor).toBe('ground');
    expect(layer(m.host, 'ground').hidden).toBe(false);
    expect(layer(m.host, 'upper').hidden).toBe(true);
    expect(layer(m.host, 'roof').hidden).toBe(true);
    expect(m.host.querySelectorAll('.alius-plan-svg .p-layer')).toHaveLength(4);
    expect(m.q('.alius-hub-caption')!.textContent).toContain('GROUND FLOOR');
  });

  it('floor buttons switch the floor, say how many are there, and the floor survives a redraw', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';                                      // everyone sleeps in her cabin, upstairs
    const m = mount(s);
    const btn = (f: string) => m.q(`.alius-plan-floor-btn[data-floor="${f}"]`)!;
    expect(btn('upper').textContent).toBe('2F · 4');
    expect(btn('ground').textContent).toBe('1F');
    expect(btn('ground').getAttribute('aria-pressed')).toBe('true');
    btn('upper').click();
    expect(stage(m.host).dataset.floor).toBe('upper');
    expect(layer(m.host, 'upper').hidden).toBe(false);
    expect(btn('upper').getAttribute('aria-pressed')).toBe('true');
    m.rerender();
    expect(stage(m.host).dataset.floor).toBe('upper');
  });

  it('a staircase takes you to its floor; PageUp and PageDown too', () => {
    const m = mount(campaign(reg, 4));
    m.q('.alius-plan-layer[data-floor="ground"] .alius-plan-stair-btn[data-stair-to="upper"]')!.click();
    expect(stage(m.host).dataset.floor).toBe('upper');
    m.q('.alius-plan-layer[data-floor="upper"] .alius-plan-stair-btn[data-stair-to="roof"]')!.click();
    expect(stage(m.host).dataset.floor).toBe('roof');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(stage(m.host).dataset.floor).toBe('upper');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(stage(m.host).dataset.floor).toBe('ground');
  });

  it('labels are buttons that analyze; closed rooms are labels only, not rooms, and analyze as their plan entry', () => {
    const m = mount(campaign(reg, 4));
    for (const b of m.host.querySelectorAll<HTMLElement>('.alius-room-label')) expect(b.tagName).toBe('BUTTON');
    const gym = m.q('.alius-plan-closed[data-plan="g_gym"]')!;
    expect(gym.classList.contains('alius-room')).toBe(false);
    expect(gym.querySelector('.alius-plan-label')!.getAttribute('data-analyze')).toBe('planRooms:g_gym');
    expect(m.q('.alius-room[data-plan="g_gym"]')).toBeNull();
  });

  it('cabins carry their soldier\'s name; the rest read VACANT; a confined soldier is in hers', () => {
    const s = campaign(reg, 4);
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: s.squad[1].id, kind: 'confined', untilDay: s.day + 3 }], demands: [], demandLog: [] };
    const m = mount(s);
    const cabins = unitCabins(reg);
    for (const c of cabins) {
      const el = m.q(`.alius-room[data-plan="${String(c.id)}"]`)!;
      const owner = cabinOwner(s, reg, String(c.id));
      const label = el.querySelector('.alius-room-label')!;
      expect(label.textContent).toBe(owner ? s.squad.find((u) => u.id === owner)!.displayName.toUpperCase() : 'VACANT');
      expect(label.getAttribute('data-analyze')).toBe('glossary:cabin');
    }
    const hers = m.q(`.alius-room[data-plan="${String(cabinOf(s, reg, s.squad[1].id)!.id)}"]`)!;
    expect(hers.querySelector(`.alius-marker[data-unit="${s.squad[1].id}"]`)).not.toBeNull();
    expect(m.host.querySelectorAll('.alius-plan-svg .p-lock')).toHaveLength(1);
  });

  it('a cabin\'s panel shows only her, talks in her quarters and has no notes; the commander\'s cabin has the notes and the activities', () => {
    const s = campaign(reg, 4);
    s.slot = 'evening';
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: s.squad[1].id, kind: 'confined', untilDay: s.day + 3 }], demands: [], demandLog: [] };
    const m = mount(s);
    m.q(`.alius-room[data-plan="${String(cabinOf(s, reg, s.squad[1].id)!.id)}"]`)!.click();
    const panel = m.q('.alius-room-panel')!;
    expect(panel.textContent).toContain(`${s.squad[1].displayName.toUpperCase()}'S CABIN`);
    expect(panel.querySelectorAll('.alius-room-person')).toHaveLength(1);
    expect(panel.querySelector('.alius-activity')).toBeNull();
    m.q('.alius-room[data-cabin="commander"]')!.click();
    const cmdr = m.q('.alius-room-panel')!;
    expect(cmdr.dataset.plan).toBe('u_cmdr');
    expect(cmdr.querySelectorAll('.alius-activity').length).toBeGreaterThan(0);   // the quarters' activities (rest, study)
  });

  it('TALK in her cabin goes to her quarters', () => {
    const s = campaign(reg, 4);
    s.slot = 'evening';
    s.squad[2].status = 'active';
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: s.squad[2].id, kind: 'confined', untilDay: s.day + 3 }], demands: [], demandLog: [] };
    const m = mount(s);
    m.q(`.alius-room[data-plan="${String(cabinOf(s, reg, s.squad[2].id)!.id)}"]`)!.click();
    expect(m.q('.alius-room-panel')!.querySelector(`.alius-marker[data-unit="${s.squad[2].id}"]`)).not.toBeNull();
    s.discipline.restrictions = [];
    s.slot = 'night';
    const n = mount(s);
    n.q(`.alius-room[data-plan="${String(cabinOf(s, reg, s.squad[2].id)!.id)}"]`)!.click();
    const talk = n.q(`[data-talk="${s.squad[2].id}"]`)!;
    expect(talk.getAttribute('aria-disabled')).toBeNull();
    talk.click();
    expect(n.onTalk).toHaveBeenCalledWith(s.squad[2].id, 'quarters_unit');
  });

  it('the light: lit rooms carry their class (the CSS shows the glow at dusk and night); emergency lights exist', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    const m = mount(s);
    expect(m.host.querySelector('.alius-hub')!.getAttribute('data-slot')).toBe('night');
    expect(m.host.querySelectorAll('.p-room-lit').length).toBeGreaterThanOrEqual(5);   // four cabins and the commander's
    expect(m.host.querySelectorAll('.p-elight').length).toBeGreaterThan(10);
  });

  it('plan marks: a provider\'s mark tags its room and shows its chip', () => {
    registerPlanMarks(() => [{ planRoomId: 'u_cabin_1', kind: 'territory', label: 'HERS', analyze: 'glossary:cabin' }]);
    const m = mount(campaign(reg, 4));
    const el = m.q('.alius-room[data-plan="u_cabin_1"]')!;
    expect(el.dataset.marks).toBe('territory');
    expect(el.querySelector('.alius-plan-mark')!.textContent).toBe('HERS');
  });

  it('every marked element on every floor resolves, is reachable and is marked', () => {
    const s = campaign(reg, 4);
    const m = mount(s);
    for (const f of ['ground', 'upper', 'roof']) layer(m.host, f).hidden = false;
    expect(markedWithout(m.host)).toEqual([]);
    expect(unresolved(m.host, { registries: reg, state: s, settings: { ...DEFAULT_SETTINGS } })).toEqual([]);
    expect(unreachable(m.host)).toEqual([]);
  });
});
