// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import { renderNodeMap } from '../../src/ui/expedition/nodeMapView';
import { mapRows, visibleTypes } from '../../src/engine/world/nodeMap';
import type { ExpeditionController, PlanTarget } from '../../src/world/expeditionController';
import { depart, withMission } from '../helpers/expedition';
import { campaign, loadCore, run } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
afterEach(() => {
  document.body.innerHTML = '';
});

function fakeController(target: PlanTarget | null = null) {
  const c = {
    plan: vi.fn(), planning: vi.fn(() => target), cancelPlan: vi.fn(), launch: vi.fn((_p: Parameters<ExpeditionController['launch']>[0]) => true), move: vi.fn(), choose: vi.fn(), treat: vi.fn(),
    setFormation: vi.fn(), fight: vi.fn(() => true), afterCombat: vi.fn(), retreat: vi.fn(), return: vi.fn(), requestRecap: vi.fn(async () => {}),
    acknowledge: vi.fn(), debrief: vi.fn(async () => true),
  };
  return c as typeof c & ExpeditionController;
}

interface MountOpts { target?: PlanTarget | null; recapPending?: boolean; regs?: Registries }
function mount(initial: CampaignState, o: MountOpts = {}) {
  let state = initial;
  const controller = fakeController(o.target ?? null);
  const onClose = vi.fn();
  const host = h('div');
  document.body.append(host);
  const screen = renderExpeditionScreen(host, {
    getState: () => state, registries: o.regs ?? reg, settings: () => DEFAULT_SETTINGS, controller, onClose,
    ...(o.recapPending !== undefined ? { recapPending: () => o.recapPending! } : {}),
  });
  return { host, controller, onClose, screen, set: (s: CampaignState) => { state = s; screen.refresh(); } };
}
const click = (el: Element | null) => (el as HTMLElement).click();
const btn = (host: HTMLElement, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent!.includes(label)) as HTMLButtonElement | undefined;

/** An open expedition with node n0_0 typed as given (map otherwise generated). */
function underway(type = 'cache', over: (s: CampaignState) => void = () => {}): CampaignState {
  const { state, mission } = withMission(reg, base);
  const s = structuredClone(depart(reg, state, mission.id));
  s.expedition!.map.nodes.n0_0.type = type;
  over(s);
  return s;
}
const move = (s: CampaignState, nodeId: string): CampaignState => {
  const r = dispatch(s, { type: 'expedition/move', payload: { nodeId } }, reg);
  return r.state;
};
const finished = (): CampaignState => {
  const s = underway();
  s.expedition!.objectiveDone = true;
  return run(s, reg, { type: 'expedition/return', payload: {} }).state;
};

describe('planner', () => {
  const planner = (over: (s: CampaignState) => void = () => {}) => {
    const { state, mission } = withMission(reg, base);
    over(state);
    const m = mount(state, { target: { missionId: mission.id } });
    return { ...m, state, mission };
  };
  const boxes = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[data-unit]')];

  it('lists the mission and the duration', () => {
    const { host, mission } = planner();
    const text = host.textContent!;
    expect(text).toContain(mission.title);
    expect(text).toContain('District 7 Quarantine');
    expect(text).toContain('DANGER 1');
    expect(text).toContain('OBJECTIVE');
    expect(text).toContain('DURATION 2 SLOTS (returns in the Evening)');
    expect(planner((s) => { s.slot = 'afternoon'; }).host.textContent).toContain('DURATION 2 SLOTS (returns the next morning)');
  });

  it('an injured unit is disabled with the reason', () => {
    const { host, state } = planner((s) => { s.squad[0].status = 'injured'; });
    const box = boxes(host).find((b) => b.dataset.unit === state.squad[0].id)!;
    expect(box.disabled).toBe(true);
    expect(host.querySelector(`[data-unit-row="${state.squad[0].id}"]`)!.textContent).toContain('Injured');
    const reserve = planner((s) => { s.roster.activeIds = s.roster.activeIds.slice(0, 3); });
    expect(reserve.host.querySelector(`[data-unit-row="${reserve.state.squad[3].id}"]`)!.textContent).toMatch(/reserve|roster/i);
    const broken = planner((s) => { s.squad[1].breakdown = { defectId: 'echo_bleed', day: 1 }; });
    expect(broken.host.querySelector(`[data-unit-row="${broken.state.squad[1].id}"]`)!.textContent).toContain('breakdown');
  });

  it('DEPART is disabled with the engine reason and enabled for a valid plan', () => {
    const { host, controller, state } = planner();
    const depart_ = btn(host, 'DEPART')!;
    expect(depart_.disabled).toBe(true);
    expect(host.textContent).toContain('An expedition takes 1 to 4 units.');
    const [a, b] = boxes(host);
    a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
    b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true }));
    const go = btn(host, 'DEPART')!;
    expect(go.disabled).toBe(false);
    click(go);
    expect(controller.launch).toHaveBeenCalledTimes(1);
    const arg = controller.launch.mock.calls[0][0];
    expect(arg.unitIds).toEqual([state.squad[0].id, state.squad[1].id]);
    expect([...arg.formation.front, ...arg.formation.back].sort()).toEqual([...arg.unitIds].sort());
    expect(arg.formation.front.length).toBeGreaterThan(0);
    expect(arg.supplies).toBeGreaterThanOrEqual(0);
    // in the Evening nobody leaves a 2-slot region
    const late = planner((s) => { s.slot = 'evening'; });
    const [c] = boxes(late.host);
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
    expect(btn(late.host, 'DEPART')!.disabled).toBe(true);
    expect(late.host.textContent).toContain('takes 2 slots');
  });

  it('row toggles move a picked unit between FRONT and BACK', () => {
    const { host, controller, state } = planner();
    const [a, b] = boxes(host);
    for (const x of [a, b]) { x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); }
    const toggle = host.querySelector<HTMLButtonElement>(`button[data-row="${state.squad[0].id}"]`)!;
    const before = toggle.textContent;
    click(host.querySelector(`button[data-row="${state.squad[0].id}"]`));
    expect(host.querySelector(`button[data-row="${state.squad[0].id}"]`)!.textContent).not.toBe(before);
    // a formation with an empty front row cannot depart
    for (const id of [state.squad[0].id, state.squad[1].id]) {
      const t = host.querySelector<HTMLButtonElement>(`button[data-row="${id}"]`)!;
      if (t.textContent!.includes('FRONT')) click(t);
    }
    expect(btn(host, 'DEPART')!.disabled).toBe(true);
    expect(host.textContent).toContain('front row');
    void controller;
  });

  it('the fifth checkbox cannot be ticked', () => {
    const six = campaign(reg, 6);
    for (const u of six.squad) u.defects = u.defects.filter((d) => d.id !== 'echo_bleed');
    for (const u of six.squad.slice(4)) { u.status = 'active'; six.roster.activeIds.push(u.id); }
    const { state, mission } = withMission(reg, six);
    const m = mount(state, { target: { missionId: mission.id } });
    const all = boxes(m.host);
    expect(all.length).toBe(6);
    for (const x of all.slice(0, 4)) { x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); }
    const now = boxes(m.host);
    expect(now.slice(4).every((x) => x.disabled)).toBe(true);
    expect(now.slice(0, 4).every((x) => !x.disabled)).toBe(true);
    // un-ticking one frees the others
    now[0].checked = false; now[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(boxes(m.host).slice(4).every((x) => !x.disabled)).toBe(true);
  });

  it('supplies cannot exceed what is owned or 12', () => {
    const { host } = planner((s) => { s.resources.supplies = 3; });
    const input = host.querySelector<HTMLInputElement>('input[name="supplies"]')!;
    expect(input.max).toBe('3');
    input.value = '9';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector<HTMLInputElement>('input[name="supplies"]')!.value).toBe('3');
    const rich = planner((s) => { s.resources.supplies = 50; });
    expect(rich.host.querySelector<HTMLInputElement>('input[name="supplies"]')!.max).toBe('12');
    expect(rich.host.textContent).toMatch(/REST NEEDS \d+ PER STOP/);
  });

  it('shows a loadout check per picked unit and CANCEL closes the plan', () => {
    const { host, controller, onClose, state } = planner();
    const [a] = boxes(host);
    a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
    expect(host.querySelector(`[data-unit-row="${state.squad[0].id}"]`)!.textContent).toMatch(/SKILLS \d\/4/);
    expect(host.textContent).toContain('STANDARD ISSUE');
    click(btn(host, 'CANCEL')!);
    expect(controller.cancelPlan).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a point-of-interest plan names the run', () => {
    const s = structuredClone(base);
    const m = mount(s, { target: { poi: { regionId: 'quarantine_d7', poiId: 'scavenge' } } });
    expect(m.host.textContent).toContain('Scavenging run');
    expect(m.host.textContent).toContain('District 7 Quarantine');
  });
});

describe('node map view', () => {
  it('renders layers joined by ── with glyphs only for visible nodes', () => {
    const s = underway();
    const exp = s.expedition!;
    const rows = mapRows(exp.map, { at: null, visible: visibleTypes(exp.map, null, 1), reg });
    const host = h('div');
    document.body.append(host);
    renderNodeMap(host, { rows, edges: {}, onMove: vi.fn() });
    const text = host.textContent!;
    expect((text.match(/──/g) ?? []).length).toBe(rows.length - 1);
    const cols = [...host.querySelectorAll('.alius-nodecol')];
    expect(cols).toHaveLength(rows.length);
    for (const cell of cols[0].querySelectorAll('.alius-node')) expect(cell.textContent).not.toBe('[ ]');
    for (const col of cols.slice(1)) for (const cell of col.querySelectorAll('.alius-node')) expect(cell.textContent).toBe('[ ]');
    expect(text).toMatch(/\[[^\] ]\]/);
  });

  it('only connected nodes are buttons and clicking one calls move', () => {
    const s = underway();
    const exp = s.expedition!;
    const rows = mapRows(exp.map, { at: null, visible: visibleTypes(exp.map, null, 1), reg });
    const onMove = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderNodeMap(host, { rows, edges: {}, onMove });
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(buttons.map((b) => b.dataset.node)).toEqual(exp.map.layers[0]);
    click(buttons[0]);
    expect(onMove).toHaveBeenCalledWith('n0_0');
    expect(host.querySelector('[data-node="n1_0"]')!.tagName).not.toBe('BUTTON');
    expect(buttons[0].getAttribute('aria-label')).toMatch(/reachable/);
  });

  it('the visited path is highlighted', () => {
    const s = move(underway('cache'), 'n0_0');
    const exp = s.expedition!;
    const rows = mapRows(exp.map, { at: exp.at, visible: visibleTypes(exp.map, exp.at, exp.reveal), reg });
    const host = h('div');
    document.body.append(host);
    renderNodeMap(host, { rows, edges: {}, onMove: vi.fn() });
    expect(host.querySelector('[data-node="n0_0"]')!.classList.contains('alius-path')).toBe(true);
    expect(host.querySelector('[data-node="n0_1"]')!.classList.contains('alius-path')).toBe(false);
    expect(host.querySelector('[data-node="n0_0"]')!.getAttribute('aria-label')).toMatch(/current/);
  });
});

describe('run view', () => {
  it('moves when an option is clicked and shows supplies, loot and the log', () => {
    const { host, controller } = mount(underway());
    expect(host.textContent).toContain('SUPPLIES 4');
    expect(host.textContent).toContain('LOOT 0');
    expect(host.textContent).toContain('Departed for District 7 Quarantine');
    click(host.querySelector('button[data-node="n0_0"]'));
    expect(controller.move).toHaveBeenCalledWith('n0_0');
  });

  it('the log shows only the last 8 lines', () => {
    const s = underway('cache', (x) => {
      for (let i = 0; i < 20; i++) x.expedition!.log.push({ n: i + 2, kind: 'move', text: `Line number ${i}.` });
    });
    const { host } = mount(s);
    expect(host.textContent).toContain('Line number 19.');
    expect(host.textContent).toContain('Line number 12.');
    expect(host.textContent).not.toContain('Line number 11.');
  });

  it('the party strip shows HP, stress, row and breakdown', () => {
    const s = underway('cache', (x) => { x.squad[0].stress = 50; x.squad[1].breakdown = { defectId: 'echo_bleed', day: 1 }; x.squad[2].status = 'injured'; });
    const { host } = mount(s);
    const row = (i: number) => host.querySelector(`[data-party="${s.squad[i].id}"]`)!.textContent!;
    expect(row(0)).toContain(s.squad[0].displayName);
    expect(row(0)).toMatch(/HP █+/);
    expect(row(0)).toMatch(/ST █+░+/);
    expect(row(0)).toContain('FRONT');
    expect(row(1)).toContain('BREAKDOWN');
    expect(row(2)).toContain('INJURED');
    expect(row(3)).toContain('BACK');
  });

  it('PATCH is disabled without supplies, and CALM for a unit in breakdown', () => {
    const none = mount(underway('cache', (x) => { x.expedition!.supplies = 0; }));
    expect([...none.host.querySelectorAll<HTMLButtonElement>('button[data-treat]')].every((b) => b.disabled)).toBe(true);
    const s = underway('cache', (x) => { x.squad[0].breakdown = { defectId: 'echo_bleed', day: 1 }; });
    const m = mount(s);
    const id = s.squad[0].id;
    const patch = m.host.querySelector<HTMLButtonElement>(`button[data-treat="patch"][data-unit="${id}"]`)!;
    const calm = m.host.querySelector<HTMLButtonElement>(`button[data-treat="calm"][data-unit="${id}"]`)!;
    expect(patch.disabled).toBe(false);
    expect(calm.disabled).toBe(true);
    click(patch);
    expect(m.controller.treat).toHaveBeenCalledWith(id, 'patch');
    expect(patch.textContent).toContain('1 SUPPLY');
  });

  it('a row swap button asks the controller to set the formation', () => {
    const s = underway();
    const { host, controller } = mount(s);
    const [a, b, c, d] = s.expedition!.party;
    click(host.querySelector(`button[data-swap="${c}"]`));
    expect(controller.setFormation).toHaveBeenCalledWith({ front: [a, b, c], back: [d] });
  });

  it('RETURN appears only after the objective', () => {
    expect(btn(mount(underway()).host, 'RETURN TO BASE')).toBeUndefined();
    const done = underway('cache', (x) => { x.expedition!.objectiveDone = true; });
    const m = mount(done);
    click(btn(m.host, 'RETURN TO BASE')!);
    expect(m.controller.return).toHaveBeenCalledTimes(1);
  });

  it('RETREAT asks for confirmation', () => {
    const m = mount(underway());
    click(btn(m.host, 'RETREAT')!);
    expect(m.controller.retreat).not.toHaveBeenCalled();
    expect(m.host.textContent).toContain('Unbanked loot will be lost.');
    click(btn(m.host, 'KEEP GOING')!);
    expect(m.controller.retreat).not.toHaveBeenCalled();
    expect(m.host.textContent).not.toContain('Unbanked loot will be lost.');
    click(btn(m.host, 'RETREAT')!);
    click(btn(m.host, 'CONFIRM')!);
    expect(m.controller.retreat).toHaveBeenCalledTimes(1);
  });

  it('refresh follows the state', () => {
    const m = mount(underway());
    const s2 = move(underway('cache'), 'n0_0');
    m.set(s2);
    expect(m.host.textContent).toContain('Moved to');
    expect(m.host.querySelector('[data-node="n0_0"]')!.classList.contains('alius-path')).toBe(true);
  });
});

describe('combat panel', () => {
  const atFight = (type: string, over: (s: CampaignState) => void = () => {}): CampaignState => move(underway(type, over), 'n0_0');

  it('shows the enemies, a cover picker for a crisis and AUTO only when allowed', () => {
    const plain = mount(atFight('combat'));
    const enc = (plain.host.querySelector('[data-enemies]') as HTMLElement).textContent!;
    expect(enc.length).toBeGreaterThan(0);
    expect(plain.host.querySelector('select[name="cover"]')).toBeNull();
    click(btn(plain.host, 'FIGHT')!);
    expect(plain.controller.fight).toHaveBeenCalledWith({ coverId: undefined, auto: false });
    // a strong enemy: no AUTO
    const strong = atFight('combat');
    strong.expedition!.pending = { ...(strong.expedition!.pending as object), encounter: { enemies: Array.from({ length: 6 }, () => ({ enemyId: 'warlord', level: 40, affixes: [] })), danger: 5 } } as never;
    expect(btn(mount(strong).host, 'AUTO')).toBeUndefined();
    // a weak one: AUTO
    const weak = atFight('combat', (x) => { for (const u of x.squad) u.level = 10; });
    weak.expedition!.pending = { ...(weak.expedition!.pending as object), encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 } } as never;
    const w = mount(weak);
    click(btn(w.host, 'AUTO')!);
    expect(w.controller.fight).toHaveBeenCalledWith({ coverId: undefined, auto: true });
    // a crisis exposes the commander: a cover unit must be chosen first
    const crisis = mount(atFight('crisis'));
    const select = crisis.host.querySelector<HTMLSelectElement>('select[name="cover"]')!;
    expect(select.options.length).toBeGreaterThanOrEqual(2);
    expect(btn(crisis.host, 'FIGHT')!.disabled).toBe(true);
    const unit = crisis.host.querySelector<HTMLOptionElement>('select[name="cover"] option[value]:not([value=""])')!.value;
    select.value = unit;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(btn(crisis.host, 'FIGHT')!.disabled).toBe(false);
    click(btn(crisis.host, 'FIGHT')!);
    expect(crisis.controller.fight).toHaveBeenCalledWith({ coverId: unit, auto: false });
  });

  it('RETREAT is offered at a pending fight and a decided fight offers CONTINUE', () => {
    const m = mount(atFight('combat'));
    expect(btn(m.host, 'RETREAT')).toBeDefined();
    const s = atFight('combat');
    s.lastCombat = { id: 'cmb_x' } as never;
    const decided = mount(s);
    click(btn(decided.host, 'CONTINUE')!);
    expect(decided.controller.afterCombat).toHaveBeenCalledTimes(1);
    expect(btn(decided.host, 'FIGHT')).toBeUndefined();
    // a fight in progress shows no buttons of its own
    const open = atFight('combat');
    open.combat = { id: 'cmb_open' } as never;
    const o = mount(open);
    expect(o.host.textContent).toContain('FIGHT IN PROGRESS');
    expect(btn(o.host, 'FIGHT')).toBeUndefined();
  });
});

describe('event panel', () => {
  const EVT = 'evt_wounded_scavenger';
  const atEvent = (): CampaignState => {
    const s = underway('event');
    s.expedition!.at = 'n0_0';
    s.expedition!.phase = 'event';
    s.expedition!.pending = { kind: 'event', nodeId: 'n0_0', templateId: EVT };
    return s;
  };

  it('shows options and disables the one that needs Empathy 3', () => {
    const m = mount(atEvent());
    const text = m.host.textContent!;
    expect(text).toContain('Wounded scavenger');
    expect(text).toContain('A scavenger lies against the wall');
    const options = [...m.host.querySelectorAll<HTMLButtonElement>('button[data-option]')];
    expect(options.map((b) => b.dataset.option)).toEqual(['0', '1', '2']);
    expect(options.map((b) => b.disabled)).toEqual([false, false, true]);
    expect(options[2].textContent).toContain('Needs Empathy 3');
    click(options[0]);
    expect(m.controller.choose).toHaveBeenCalledWith(0);
    click(options[2]);
    expect(m.controller.choose).toHaveBeenCalledTimes(1);
    // no travel controls while an event is open
    expect(m.host.querySelector('button[data-node]')).toBeNull();
  });

  it('event text is not HTML', () => {
    const regs = { ...reg, dilemmaTemplates: new Map(reg.dilemmaTemplates) } as Registries;
    const t = reg.dilemmaTemplates.get(EVT)!;
    regs.dilemmaTemplates.set(EVT, { ...t, fixed: { ...(t.fixed as object), title: '<b>Title</b>', setup: '<img src=x onerror=alert(1)>' } });
    const m = mount(atEvent(), { regs });
    expect(m.host.querySelector('img, b')).toBeNull();
    expect(m.host.textContent).toContain('<b>Title</b>');
    expect(m.host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('report', () => {
  it('shows the deterministic lines without a recap and the recap when present', () => {
    const s = finished();
    const plain = mount(s);
    const text = plain.host.textContent!;
    expect(text).toContain('AFTER-ACTION REPORT');
    expect(text).toContain(`Mission: ${s.lastExpedition!.missionTitle}`);
    expect(text).toContain('District 7 Quarantine');
    expect(text).toContain('OBJECTIVE SECURED');
    expect(text).not.toContain('COMPILING');
    expect(mount(s, { recapPending: true }).host.textContent).toContain('COMPILING…');
    const withRecap = structuredClone(s);
    withRecap.lastExpedition!.recap = 'The squad went in at dawn and came back.';
    const r = mount(withRecap, { recapPending: true });
    expect(r.host.textContent).toContain('The squad went in at dawn and came back.');
    expect(r.host.textContent).not.toContain('COMPILING');
    expect(r.host.textContent).toContain('Mission:');
  });

  it('recap text is not HTML', () => {
    const s = finished();
    s.lastExpedition!.recap = '<img src=x onerror=alert(1)> end';
    const m = mount(s);
    expect(m.host.querySelector('img')).toBeNull();
    expect(m.host.textContent).toContain('<img src=x onerror=alert(1)> end');
  });

  it('DEBRIEF is hidden at night and once done, and needs a unit', () => {
    const s = finished();
    const m = mount(s);
    const debrief = btn(m.host, 'DEBRIEF')!;
    expect(debrief.disabled).toBe(true);
    const box = m.host.querySelector<HTMLInputElement>('input[data-debrief]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(btn(m.host, 'DEBRIEF')!.disabled).toBe(false);
    click(btn(m.host, 'DEBRIEF')!);
    expect(m.controller.debrief).toHaveBeenCalledWith([box.dataset.debrief]);
    const night = structuredClone(s);
    night.slot = 'night';
    expect(btn(mount(night).host, 'DEBRIEF')).toBeUndefined();
    const done = structuredClone(s);
    done.lastExpedition!.debriefed = true;
    expect(btn(mount(done).host, 'DEBRIEF')).toBeUndefined();
  });

  it('at most three units can be picked for a debrief', () => {
    const s = finished();
    const m = mount(s);
    const boxes = [...m.host.querySelectorAll<HTMLInputElement>('input[data-debrief]')];
    expect(boxes.length).toBe(4);
    for (const b of boxes.slice(0, 3)) { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }
    expect([...m.host.querySelectorAll<HTMLInputElement>('input[data-debrief]')].filter((b) => !b.checked).every((b) => b.disabled)).toBe(true);
  });

  it('CLOSE acknowledges', () => {
    const m = mount(finished());
    click(btn(m.host, 'CLOSE')!);
    expect(m.controller.acknowledge).toHaveBeenCalledTimes(1);
    expect(m.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the screen picks its view', () => {
  it('open expedition → run; unacknowledged report → report; plan → planner; else NO EXPEDITION', () => {
    expect(mount(underway()).host.querySelector('.alius-nodemap')).not.toBeNull();
    const report = finished();
    expect(mount(report).host.textContent).toContain('AFTER-ACTION REPORT');
    const acked = structuredClone(report);
    acked.lastExpedition!.acknowledged = true;
    const idle = mount(acked);
    expect(idle.host.textContent).toContain('NO EXPEDITION');
    click(btn(idle.host, 'BACK')!);
    expect(idle.onClose).toHaveBeenCalled();
    const { state, mission } = withMission(reg, base);
    expect(mount(state, { target: { missionId: mission.id } }).host.textContent).toContain('DEPART');
    // an open expedition wins over a pending plan and over an old report
    const both = underway();
    both.lastExpedition = report.lastExpedition;
    expect(mount(both, { target: { missionId: 'x' } }).host.querySelector('.alius-nodemap')).not.toBeNull();
  });

  it('dispose empties the host and refresh after dispose does nothing', () => {
    const m = mount(underway());
    m.screen.dispose();
    expect(m.host.childElementCount).toBe(0);
    m.screen.refresh();
    expect(m.host.childElementCount).toBe(0);
  });
});
