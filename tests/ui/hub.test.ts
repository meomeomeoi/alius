// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState, Slot } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { attachAnalyzer, type Analyzer } from '../../src/ui/analyze/analyzer';
import { h } from '../../src/ui/dom';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { probeHubArt } from '../../src/ui/hub/art';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';
import { setRelation } from '../helpers/loyalty';

vi.mock('../../src/ui/hub/art', () => ({ probeHubArt: vi.fn(async () => null), peekHubArt: vi.fn(() => undefined) }));

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});

let analyzer: Analyzer | null = null;
beforeEach(() => {
  vi.mocked(probeHubArt).mockReset();
  vi.mocked(probeHubArt).mockResolvedValue(null);
});
afterEach(() => {
  analyzer?.destroy();
  analyzer = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

interface Mounted {
  host: HTMLElement; device: HTMLElement; ctx: HubCtx; state: CampaignState | null;
  onTalk: ReturnType<typeof vi.fn>; onEndSlot: ReturnType<typeof vi.fn>; onOpenPda: ReturnType<typeof vi.fn>; onDo: ReturnType<typeof vi.fn>;
  rerender(): void;
}

function mount(opts: { state?: CampaignState | null; readonly?: boolean; registries?: Registries; assetUrl?: (p: string) => string; width?: number } = {}): Mounted {
  const state = opts.state === undefined ? campaign(reg, 4) : opts.state;
  const onTalk = vi.fn();
  const onEndSlot = vi.fn();
  const onOpenPda = vi.fn();
  const onDo = vi.fn();
  const registries = opts.registries ?? reg;
  const ctx: HubCtx = {
    getState: () => state,
    getLoad: () => (opts.readonly ? { kind: 'readonly', reason: 'Another version wrote this save.', chatId: 'c' } : state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' }),
    registries,
    settings: () => ({ ...DEFAULT_SETTINGS }),
    assetUrl: opts.assetUrl,
    ops: {
      getState: () => state, getLoad: () => (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' }), registries,
      onDo, onRequisition: vi.fn(),
    },
    onTalk, onEndSlot, onOpenPda,
    avatar: () => null,
  };
  const root = h('div', { id: 'alius-shell' });
  const host = h('div', { class: 'alius-hub-host' });
  if (opts.width) host.style.width = `${opts.width}px`;
  const device = h('div', { class: 'alius-device' });
  root.append(host, device);
  document.body.append(root);
  renderHub(host, device, ctx);
  return { host, device, ctx, state, onTalk, onEndSlot, onOpenPda, onDo, rerender: () => { host.replaceChildren(); renderHub(host, device, ctx); } };
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const room = (m: Mounted, id: string) => m.host.querySelector<HTMLElement>(`.alius-room[data-room="${id}"]`)!;
const panel = (m: Mounted) => m.host.querySelector<HTMLElement>('.alius-room-panel');
const keydown = (target: EventTarget, k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

/** A morning campaign with unit 0 injured (medbay) and unit 1 confined (quarters). */
function staged(): CampaignState {
  const s = campaign(reg, 4);
  s.squad[0].status = 'injured';
  s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: s.squad[1].id, kind: 'confined', untilDay: s.day + 3 }], demands: [], demandLog: [] };
  return s;
}

describe('hub screen', () => {
  it('renders top bar, cross-section, rooms and the right column', () => {
    const m = mount();
    expect(m.host.querySelector('.alius-hub-topbar')!.textContent).toContain('ALIUS');
    expect(m.host.querySelector('.alius-hub-topbar')!.textContent).toContain('CCP OUTPOST // ');
    expect(m.host.querySelector('.alius-hub-status')!.textContent).toMatch(/CR \d+/);
    expect(m.host.querySelectorAll('.alius-room[data-room]')).toHaveLength(8);
    expect(m.host.querySelector('.alius-objective')).not.toBeNull();
    expect(m.host.querySelector('.alius-tonight')).not.toBeNull();
    expect(m.host.querySelector('[data-open-pda]')).not.toBeNull();
    expect(m.host.querySelector('[data-end-slot]')!.textContent).toBe('END MORNING ▸');
  });

  it('the END label follows the slot', () => {
    const s = campaign(reg, 4);
    s.slot = 'evening';
    expect(mount({ state: s }).host.querySelector('[data-end-slot]')!.textContent).toBe('END EVENING ▸');
  });

  it('names the corporation in the top bar', () => {
    const s = campaign(reg, 4);
    const corp = String(reg.corporations.get(s.commander.corporationId!)!.name);
    expect(mount({ state: s }).host.querySelector('.alius-hub-topbar')!.textContent).toContain(corp);
  });

  it('markers sit in the room whereabouts says', () => {
    const s = staged();
    const m = mount({ state: s });
    expect(room(m, 'medbay').querySelector(`.alius-marker[data-unit="${s.squad[0].id}"]`)).not.toBeNull();
    expect(room(m, 'quarters').querySelector(`.alius-marker[data-unit="${s.squad[1].id}"]`)).not.toBeNull();
    // each unit is on the cross-section exactly once
    expect(m.host.querySelectorAll('.alius-room .alius-marker')).toHaveLength(4);
  });

  it('a marker shows the state glyph and the tone glyph and carries data-tone', () => {
    const s = campaign(reg, 4);
    setRelation(s, s.squad[0].id, { stateId: 'friend' });
    s.squad[1].stress = 90;
    const m = mount({ state: s });
    const a = m.host.querySelector<HTMLElement>(`.alius-marker[data-unit="${s.squad[0].id}"]`)!;
    expect(a.dataset.tone).toBe('trust');
    expect(a.textContent).toContain('*'); // friend's state glyph
    expect(a.textContent).toContain('+'); // trust tone glyph
    const b = m.host.querySelector<HTMLElement>(`.alius-marker[data-unit="${s.squad[1].id}"]`)!;
    expect(b.dataset.tone).toBe('danger');
    expect(b.textContent).toContain('!');
    for (const marker of m.host.querySelectorAll('.alius-marker')) {
      expect((marker.textContent ?? '').trim().length, marker.outerHTML).toBeGreaterThan(1);
      expect(marker.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('a grunt marker reads GR and has no state glyph', () => {
    const s = campaign(reg, 4);
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'g1', kind: 'grunt', displayName: 'K-117', designation: 'K-117' });
    const m = mount({ state: s });
    const g = m.host.querySelector<HTMLElement>('.alius-marker[data-unit="g1"]')!;
    expect(g.textContent).toContain('GR');
    expect(g.getAttribute('data-analyze')).toBe('glossary:whereabouts');
  });

  it('a named marker analyzes her relationship state with her unit id', () => {
    const s = campaign(reg, 4);
    const m = mount({ state: s });
    const a = m.host.querySelector<HTMLElement>(`.alius-marker[data-unit="${s.squad[0].id}"]`)!;
    expect(a.getAttribute('data-analyze')).toBe(`relationshipStates:${s.relations[s.squad[0].id].stateId}`);
    expect(JSON.parse(a.getAttribute('data-analyze-ctx')!)).toEqual({ unitId: s.squad[0].id });
  });

  it('away units are in the AWAY strip and in no room', () => {
    const s = campaign(reg, 4);
    s.expedition = { party: [s.squad[0].id, s.squad[2].id] } as unknown as CampaignState['expedition'];
    const m = mount({ state: s });
    const strip = m.host.querySelector('.alius-away')!;
    expect([...strip.querySelectorAll('.alius-marker')].map((x) => (x as HTMLElement).dataset.unit)).toEqual([s.squad[0].id, s.squad[2].id]);
    expect(strip.textContent).toContain('AWAY');
    expect(m.host.querySelectorAll('.alius-room .alius-marker')).toHaveLength(2);
  });

  it('no AWAY strip while nobody is out', () => {
    expect(mount().host.querySelector('.alius-away')).toBeNull();
  });

  it('everyone away shows the AWAY strip and empty rooms', () => {
    const s = campaign(reg, 4);
    s.expedition = { party: s.squad.map((u) => u.id) } as unknown as CampaignState['expedition'];
    const m = mount({ state: s });
    expect(m.host.querySelectorAll('.alius-away .alius-marker')).toHaveLength(4);
    expect(m.host.querySelectorAll('.alius-room .alius-marker')).toHaveLength(0);
    expect(m.host.querySelectorAll('.alius-room')).toHaveLength(8);
    expect(m.host.querySelector<HTMLElement>('[data-end-slot]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('a unit placed nowhere is listed under ELSEWHERE so she never vanishes', () => {
    const m = mount({ registries: { ...reg, hubRooms: new Map() } });
    expect(m.host.querySelectorAll('.alius-room')).toHaveLength(0);
    expect(m.host.querySelectorAll('.alius-elsewhere .alius-marker')).toHaveLength(4);
  });

  it('missing hub art falls back to the blueprint', async () => {
    vi.mocked(probeHubArt).mockResolvedValue(null);
    const m = mount({ assetUrl: (p) => `/ext/${p}` });
    await flush();
    expect(m.host.querySelector('.alius-hub-blueprint')).not.toBeNull();
    expect(m.host.querySelector('.alius-hub-art')).toBeNull();
    expect(m.host.textContent).toContain('SECTION A-A · NOT TO SCALE');
  });

  it('hub art that loads replaces the blueprint grid', async () => {
    vi.mocked(probeHubArt).mockResolvedValue('/ext/content/core/art/hub/base.png');
    const m = mount({ assetUrl: (p) => `/ext/${p}` });
    await flush();
    const art = m.host.querySelector<HTMLElement>('.alius-hub-art')!;
    expect(art).not.toBeNull();
    expect(art.style.backgroundImage).toContain('/ext/content/core/art/hub/base.png');
    expect(m.host.querySelector('.alius-hub-blueprint')).toBeNull();
    expect(vi.mocked(probeHubArt)).toHaveBeenCalledWith(expect.any(Function), 'morning');
  });

  it('clicking a room opens its panel with who is there, TALK and its activity cards', () => {
    const s = staged();
    const m = mount({ state: s });
    expect(panel(m)).toBeNull();
    room(m, 'medbay').click();
    const p = panel(m)!;
    expect(p.dataset.room).toBe('medbay');
    expect(p.textContent).toContain('MEDBAY');
    expect(p.querySelector(`.alius-marker[data-unit="${s.squad[0].id}"]`)).not.toBeNull();
    expect(p.textContent).toContain(s.squad[0].displayName);
    expect(p.querySelector(`[data-talk="${s.squad[0].id}"]`)).not.toBeNull();
    expect(p.querySelector('.alius-activity[data-activity="medbay"]')).not.toBeNull();
  });

  it('an empty room says so', () => {
    const s = campaign(reg, 4);
    s.expedition = { party: s.squad.map((u) => u.id) } as unknown as CampaignState['expedition'];
    const m = mount({ state: s });
    room(m, 'mess').click();
    expect(panel(m)!.textContent).toContain('Nobody is here.');
  });

  it('TALK calls onTalk with her id and the room location', () => {
    const s = staged();
    const m = mount({ state: s });
    room(m, 'medbay').click();
    panel(m)!.querySelector<HTMLElement>(`[data-talk="${s.squad[0].id}"]`)!.click();
    expect(m.onTalk).toHaveBeenCalledWith(s.squad[0].id, 'medbay');
  });

  it('TALK is aria-disabled with the restriction reason for a confined unit, and does nothing', () => {
    const s = staged();
    const m = mount({ state: s });
    room(m, 'quarters').click();
    const btn = panel(m)!.querySelector<HTMLElement>(`[data-talk="${s.squad[1].id}"]`)!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(panel(m)!.textContent).toContain('is in the brig until day');
    btn.click();
    expect(m.onTalk).not.toHaveBeenCalled();
  });

  it('TALK is disabled with "Closed this night." when the location is closed', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    const locations = new Map(reg.locations);
    const quarters = reg.locations.get('quarters_unit')!;
    locations.set('quarters_unit', { ...quarters, slots: ['morning', 'afternoon', 'evening'] });
    const m = mount({ state: s, registries: { ...reg, locations } });
    room(m, 'quarters').click();
    const btn = panel(m)!.querySelector<HTMLElement>(`[data-talk="${s.squad[0].id}"]`)!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(panel(m)!.textContent).toContain('Closed this night.');
  });

  it('a grunt gets no TALK button', () => {
    const s = campaign(reg, 4);
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'g1', kind: 'grunt', displayName: 'K-117', status: 'injured' });
    const m = mount({ state: s });
    room(m, 'medbay').click();
    expect(panel(m)!.querySelector('[data-talk="g1"]')).toBeNull();
    expect(panel(m)!.querySelector('.alius-marker[data-unit="g1"]')).not.toBeNull();
  });

  it('the panel closes with [X], with Escape and with a click outside; Escape inside a field is left alone', () => {
    const s = staged();
    const m = mount({ state: s });
    room(m, 'medbay').click();
    panel(m)!.querySelector<HTMLElement>('[data-close-room]')!.click();
    expect(panel(m)).toBeNull();

    room(m, 'medbay').click();
    expect(keydown(document.body, 'Escape').defaultPrevented).toBe(true);
    expect(panel(m)).toBeNull();

    room(m, 'medbay').click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel(m)).toBeNull();

    room(m, 'medbay').click();
    const select = panel(m)!.querySelector('select');
    if (select) {
      keydown(select, 'Escape');
      expect(panel(m)).not.toBeNull();
    }
  });

  it('Escape with no panel open is not consumed (the shell lowers the device)', () => {
    mount();
    expect(keydown(document.body, 'Escape').defaultPrevented).toBe(false);
  });

  it('the open panel survives a refresh', () => {
    const s = staged();
    const m = mount({ state: s });
    room(m, 'medbay').click();
    m.rerender();
    expect(panel(m)?.dataset.room).toBe('medbay');
  });

  it('END is aria-disabled with the endSlotBlock reason', () => {
    const s = campaign(reg, 4);
    s.scene = { id: 's', day: 1, slot: 'morning', locationId: 'mess_hall', participants: [], mode: 'private', origin: 'activity', consumesSlot: true, startIndex: 0, exchanges: 0 };
    const m = mount({ state: s });
    const end = m.host.querySelector<HTMLElement>('[data-end-slot]')!;
    expect(end.getAttribute('aria-disabled')).toBe('true');
    expect(m.host.querySelector('.alius-end-reason')!.textContent).toBe('A conversation is open.');
    end.click();
    expect(m.onEndSlot).not.toHaveBeenCalled();
  });

  it('END calls onEndSlot and OPEN PDA calls onOpenPda', () => {
    const m = mount();
    const end = m.host.querySelector<HTMLElement>('[data-end-slot]')!;
    expect(end.getAttribute('aria-disabled')).toBeNull();
    end.click();
    expect(m.onEndSlot).toHaveBeenCalledTimes(1);
    m.host.querySelector<HTMLElement>('[data-open-pda]')!.click();
    expect(m.onOpenPda).toHaveBeenCalledTimes(1);
  });

  it('renders without a campaign', () => {
    const m = mount({ state: null });
    expect(m.host.textContent).toContain('NO ACTIVE CAMPAIGN IN THIS CHAT');
    expect(m.host.querySelector('[data-end-slot]')).toBeNull();
    expect(m.host.querySelector('[data-talk]')).toBeNull();
    expect(m.host.querySelector('[data-open-pda]')).not.toBeNull();
  });

  it('read-only shows the banner and no actions', () => {
    const m = mount({ readonly: true });
    expect(m.host.querySelector('.alius-banner')!.textContent).toContain('READ-ONLY');
    expect(m.host.querySelector('[data-end-slot]')).toBeNull();
    room(m, 'medbay').click();
    expect(panel(m)?.querySelector('[data-talk]') ?? null).toBeNull();
    expect(panel(m)?.querySelector('.alius-activity') ?? null).toBeNull();
  });

  it('shows the objective, or NO STANDING ORDERS', () => {
    const s = campaign(reg, 4);
    s.missions = { offered: [], active: [], completed: [] };
    expect(mount({ state: s }).host.querySelector('.alius-objective')!.textContent).toContain('NO STANDING ORDERS');
    const s2 = campaign(reg, 4);
    s2.day = 4;
    s2.missions.active = [{ id: 'm', title: 'Hold the line', deadlineDay: 6, spineBeat: 'b', status: 'active' } as never];
    const text = mount({ state: s2 }).host.querySelector('.alius-objective')!.textContent!;
    expect(text).toContain('Hold the line');
    expect(text).toContain('2');
  });

  it('Tonight lists its items, each with a glyph, and says so when empty', () => {
    const s = campaign(reg, 4);
    s.missions = { offered: [], active: [], completed: [] };
    expect(mount({ state: s }).host.querySelector('.alius-tonight')!.textContent).toContain('Nothing is waiting.');
    s.calendar.shortageStreak = 2;
    s.dms[s.squad[0].id] = [{ id: 'd', from: s.squad[0].id, text: 't', day: 1, slot: 'morning', read: false }];
    const m = mount({ state: s });
    const items = [...m.host.querySelectorAll<HTMLElement>('.alius-tonight-item')];
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('1 unread message.'), expect.stringContaining('SHORTAGE 2d')]);
    expect(items[0].textContent).toMatch(/^[!♥+*~·]/);
    expect(items.every((i) => i.getAttribute('data-analyze')?.startsWith('glossary:'))).toBe(true);
  });

  it('the legend names every tone with its glyph', () => {
    const text = mount().host.querySelector('.alius-legend')!.textContent!;
    for (const part of ['! DANGER', '♥ BOND', '+ TRUST', '* AFFINITY', '~ WARNING']) expect(text).toContain(part);
  });

  it('the newest oversight card shows only today or yesterday', () => {
    const s = campaign(reg, 4);
    s.day = 6;
    const entry = (no: number, day: number) => ({ no, unitId: s.squad[0].id, kind: 'compel', day, context: 'scene', outcome: 'done' });
    s.leash.log = [entry(3, 4)];
    expect(mount({ state: s }).host.querySelector('.alius-oversight')).toBeNull();
    s.leash.log = [entry(3, 4), entry(4, 5)];
    const card = mount({ state: s }).host.querySelector('.alius-oversight')!;
    expect(card.textContent).toContain('#0004');
    expect(card.textContent).toContain('COMPEL');
    expect(card.textContent).toContain(s.squad[0].displayName);
    expect(card.textContent).toContain('done');
    expect(card.classList.contains('alius-voice-corporate')).toBe(true);
    expect(card.getAttribute('data-analyze')).toBe('glossary:leash');
  });

  it('rooms stay labelled at 360 px', () => {
    const m = mount({ width: 360 });
    const labels = [...m.host.querySelectorAll<HTMLElement>('.alius-room-label')];
    expect(labels).toHaveLength(8);
    for (const l of labels) expect((l.textContent ?? '').trim().length).toBeGreaterThan(0);
    // the narrow-width rules are CSS: a container query on the cross-section keeps the label readable
    const css = readFileSync('css/15-hub.css', 'utf8');
    expect(css).toMatch(/container-type:\s*inline-size/);
    expect(css).toMatch(/@container[^{]*max-width[^{]*\{[^}]*\.alius-room-label[^}]*(font-size|min-height)/s);
  });
});

describe('hub and the analysis panel', () => {
  const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS } });

  function shellAround(m: Mounted, state: CampaignState): void {
    const rootEl = document.getElementById('alius-shell')!;
    analyzer = attachAnalyzer(rootEl, { getEnv: () => env(state) });
  }

  it('long-press on a marker analyzes, a tap opens the room', () => {
    vi.useFakeTimers();
    const s = staged();
    const m = mount({ state: s });
    shellAround(m, s);
    const marker = room(m, 'medbay').querySelector<HTMLElement>('.alius-marker')!;
    const ptr = (type: string, init: Record<string, unknown> = {}) =>
      marker.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType: 'touch', clientX: 5, clientY: 5, ...init }));
    ptr('pointerdown');
    vi.advanceTimersByTime(600);
    expect(document.querySelector('.alius-analyze')).not.toBeNull();
    ptr('pointerup');
    marker.click(); // the click that follows the long-press is swallowed
    expect(panel(m)).toBeNull();
    analyzer!.close();
    // a plain tap
    ptr('pointerdown');
    ptr('pointerup');
    marker.click();
    expect(document.querySelector('.alius-analyze')).toBeNull();
    expect(panel(m)?.dataset.room).toBe('medbay');
  });

  it('every marked element resolves, is reachable and is marked (with a room panel open)', () => {
    const s = staged();
    s.day = 5;
    s.calendar.shortageStreak = 1;
    s.world.incomingUnits = 1;
    s.leash.log = [{ no: 1, unitId: s.squad[0].id, kind: 'compel', day: 5, context: 'scene', outcome: 'done' }];
    s.expedition = { party: [s.squad[3].id] } as unknown as CampaignState['expedition'];
    const m = mount({ state: s });
    room(m, 'medbay').click();
    expect(markedWithout(m.host)).toEqual([]);
    expect(unresolved(m.host, env(s))).toEqual([]);
    expect(unreachable(m.host)).toEqual([]);
    expect(m.host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(15);
  });
});

describe('time of day', () => {
  it.each<Slot>(['morning', 'afternoon', 'evening', 'night'])('probes the art of the %s', async (slot) => {
    const s = campaign(reg, 4);
    s.slot = slot;
    const m = mount({ state: s, assetUrl: (p) => p });
    await flush();
    expect(vi.mocked(probeHubArt)).toHaveBeenCalledWith(expect.any(Function), slot);
    expect(m.host.querySelector<HTMLElement>('.alius-hub')!.dataset.slot).toBe(slot);
  });
});
