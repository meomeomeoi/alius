// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import type { LoadResult } from '../../src/st/persistence';
import { h } from '../../src/ui/dom';
import { renderOpsTab, type OpsTabCtx } from '../../src/ui/ops/opsTab';
import { offerMission } from '../../src/engine/world/missions';
import { postRumor } from '../../src/engine/world/missions';
import { campaign, ctxOf, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function render(opts: { state?: CampaignState | null; load?: LoadResult; extra?: Partial<OpsTabCtx> } = {}) {
  const state = opts.state === undefined ? campaign(reg, 4) : opts.state;
  const load: LoadResult = opts.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const onDo = vi.fn();
  const onRequisition = vi.fn();
  const host = h('div');
  document.body.append(host);
  renderOpsTab(host, { getState: () => state, getLoad: () => load, registries: reg, onDo, onRequisition, ...opts.extra });
  const card = (id: string) => host.querySelector<HTMLElement>(`[data-activity="${id}"]`)!;
  const btn = (id: string) => card(id).querySelector<HTMLButtonElement>('button[data-do]')!;
  return { host, onDo, onRequisition, card, btn, state };
}
const change = (el: HTMLSelectElement | HTMLInputElement, value?: string) => {
  if (value !== undefined) el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('OPS tab', () => {
  it('lists every activity with the day clock, in registry order', () => {
    const { host } = render();
    expect(host.textContent).toContain('DAY 001 // MORNING');
    const ids = [...host.querySelectorAll<HTMLElement>('[data-activity]')].map((e) => e.dataset.activity);
    expect(ids).toEqual(['train', 'workshop', 'medbay', 'work', 'scout_net', 'rest', 'mess', 'study', 'talk']);
  });

  it('an activity not available in this slot is shown disabled with the reason', () => {
    const { btn, card } = render();
    expect(btn('mess').disabled).toBe(true);
    expect(card('mess').textContent).toMatch(/not available in the morning/i);
    const evening = campaign(reg, 4);
    evening.slot = 'evening';
    expect(render({ state: evening }).btn('mess').disabled).toBe(false);
  });

  it('at night only rest and talk can be done', () => {
    const s = campaign(reg, 4);
    s.slot = 'night';
    const { btn } = render({ state: s });
    const enabled = ['train', 'workshop', 'medbay', 'work', 'scout_net', 'rest', 'mess', 'study'].filter((id) => !btn(id).disabled);
    expect(enabled).toEqual(['rest']);
    expect(btn('talk').disabled).toBe(true); // needs a companion, but not a slot problem
  });

  it('a disabled activity shows its reason', () => {
    const s = campaign(reg, 4);
    s.day = 2;
    s.commander.injuredUntilDay = 5;
    const { btn, card } = render({ state: s });
    expect(btn('work').disabled).toBe(true);
    expect(card('work').textContent).toMatch(/injured/i);
    expect(btn('rest').disabled).toBe(false);
  });

  it('companion select appears only for optional or required companions', () => {
    const { card } = render();
    expect(card('work').querySelector('select[name="companion"]')).toBeNull();
    expect(card('rest').querySelector('select[name="companion"]')).not.toBeNull();
    const talk = card('talk').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...talk.options].map((o) => o.value)).toEqual(['', 'unit_ann', 'unit_bea', 'unit_cat', 'unit_dee']);
  });

  it('talk without a companion stays disabled until one is chosen', () => {
    const { btn, card, onDo } = render();
    expect(btn('talk').disabled).toBe(true);
    expect(card('talk').textContent).toMatch(/needs a companion/i);
    change(card('talk').querySelector('select')!, 'unit_bea');
    expect(btn('talk').disabled).toBe(false);
    btn('talk').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'talk', companionId: 'unit_bea' });
  });

  it('dead units are not offered as companions', () => {
    const s = campaign(reg, 4);
    s.squad[3].status = 'dead';
    const { card } = render({ state: s });
    const values = [...card('rest').querySelectorAll<HTMLOptionElement>('select[name="companion"] option')].map((o) => o.value);
    expect(values).not.toContain('unit_dee');
  });

  it('DO sends the right request: focus and picked units', () => {
    const { btn, card, onDo } = render();
    expect(btn('train').disabled).toBe(true); // default focus asks for units and none are picked
    const boxes = card('train').querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-unit]');
    expect(boxes).toHaveLength(4);
    boxes[0].checked = true;
    change(boxes[0]);
    boxes[2].checked = true;
    change(boxes[2]);
    expect(btn('train').disabled).toBe(false);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', focus: 'units', unitIds: ['unit_ann', 'unit_cat'] });
  });

  it('a focus without units needs no unit picking', () => {
    const { btn, card, onDo } = render();
    change(card('train').querySelector<HTMLSelectElement>('select[name="focus"]')!, 'commander');
    expect(card('train').querySelectorAll('input[data-unit]')).toHaveLength(0);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', focus: 'commander' });
  });

  it('choosing a companion hides focus and unit controls and sends only the companion', () => {
    const { btn, card, onDo } = render();
    change(card('train').querySelector<HTMLSelectElement>('select[name="companion"]')!, 'unit_dee');
    expect(card('train').querySelector('select[name="focus"]')).toBeNull();
    expect(card('train').querySelectorAll('input[data-unit]')).toHaveLength(0);
    btn('train').click();
    expect(onDo).toHaveBeenCalledWith({ activityId: 'train', companionId: 'unit_dee' });
  });

  it('shows the cost of an activity', () => {
    const s = campaign(reg, 4);
    s.slot = 'evening';
    expect(render({ state: s }).card('mess').textContent).toContain('2 SUPPLIES');
  });

  it('requisition sends the amount', () => {
    const { host, onRequisition } = render();
    const input = host.querySelector<HTMLInputElement>('input[name="requisition"]')!;
    input.value = '7';
    host.querySelector<HTMLButtonElement>('button[data-requisition]')!.click();
    expect(onRequisition).toHaveBeenCalledWith(7);
    expect(host.textContent).toContain('3 CR per supply');
  });

  it('the requisition amount survives a re-render', () => {
    const state = campaign(reg, 4);
    const host = h('div');
    document.body.append(host);
    const draw = () => renderOpsTab(host, { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() });
    draw();
    const input = host.querySelector<HTMLInputElement>('input[name="requisition"]')!;
    input.value = '9';
    change(input);
    draw();
    expect(host.querySelector<HTMLInputElement>('input[name="requisition"]')!.value).toBe('9');
  });

  it('requisition is disabled without enough credits', () => {
    const s = campaign(reg, 4);
    s.resources.credits = 5;
    const { host } = render({ state: s });
    expect(host.querySelector<HTMLButtonElement>('button[data-requisition]')!.disabled).toBe(true);
  });

  it('no campaign and read-only show a message instead of the list', () => {
    expect(render({ state: null }).host.textContent).toContain('NO ACTIVE CAMPAIGN');
    const ro = render({ state: null, load: { kind: 'readonly', reason: 'broken', chatId: 'c' } });
    expect(ro.host.textContent).toContain('READ-ONLY');
  });

  it('talk companion list excludes grunts, other activities keep them', () => {
    const s = campaign(reg, 4);
    s.squad.find((u) => u.id === 'unit_dee')!.kind = 'grunt';
    const { card } = render({ state: s });
    const talk = card('talk').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...talk.options].map((o) => o.value)).toEqual(['', 'unit_ann', 'unit_bea', 'unit_cat']);
    const rest = card('rest').querySelector<HTMLSelectElement>('select[name="companion"]')!;
    expect([...rest.options].map((o) => o.value)).toContain('unit_dee');
  });
});

describe('OPS: mission board and rumor mill', () => {
  const board = (s: CampaignState) => {
    const onPlan = vi.fn();
    const onDismiss = vi.fn();
    const onFollowRumor = vi.fn();
    const onIntake = vi.fn();
    const r = render({ state: s, extra: { onPlan, onDismiss, onFollowRumor, onIntake } });
    return { ...r, onPlan, onDismiss, onFollowRumor, onIntake };
  };
  const offer = (s: CampaignState, o: { templateId: string; regionId: string; source: 'command' | 'side' | 'rumor' | 'story'; title?: string; brief?: string; spineBeat?: string }) =>
    offerMission(s, ctxOf(s, reg), o).mission!;
  const post = (s: CampaignState, text: string, over: Record<string, unknown> = {}) =>
    postRumor(s, ctxOf(s, reg), { text, tags: [], leadsTo: 'none', ...over } as never)!;

  it('board lists offered missions with source tag, deadline and tier', () => {
    const s = campaign(reg, 4);
    s.day = 3;
    const cmd = offer(s, { templateId: 'tpl_sweep', regionId: 'ashway', source: 'command', title: 'Clear the road', brief: 'Marauders hold the overpass.' });
    const story = offer(s, { templateId: 'tpl_vesper_beat_1', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_1', title: 'First sample' });
    const { host } = board(s);
    const card = (id: string) => host.querySelector<HTMLElement>(`[data-mission-card="${id}"]`)!;
    const text = card(cmd.id).textContent!;
    expect(text).toContain('[COMMAND]');
    expect(text).toContain('Clear the road');
    expect(text).toContain('The Ashway');
    expect(text).toContain('DANGER 2');
    expect(text).toContain('OBJECTIVE: Contact');
    expect(text).toContain(`D-${cmd.deadlineDay! - 3}`);
    expect(text).toContain('Marauders hold the overpass.');
    expect(text).toContain('REWARD: TIER 1');
    const st = card(story.id).textContent!;
    expect(st).toContain('[STORY]');
    expect(st).toContain('NO DEADLINE');
    expect(st).toContain('REWARD: TIER 2');
  });

  it('board header shows used and total size', () => {
    const s = campaign(reg, 4);
    expect(board(s).host.textContent).toContain('MISSION BOARD 0/3');
    offer(s, { templateId: 'tpl_sweep', regionId: 'ashway', source: 'side' });
    expect(board(s).host.textContent).toContain('MISSION BOARD 1/3');
    s.base.facilities.comms = 2;
    expect(board(s).host.textContent).toContain('MISSION BOARD 1/4');
    expect(board(campaign(reg, 4)).host.textContent).toContain('NO MISSIONS POSTED');
  });

  it("PLAN is disabled in the Evening with the engine's reason", () => {
    const s = campaign(reg, 4);
    const m = offer(s, { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' });
    const ok = board(s);
    const plan = ok.host.querySelector<HTMLButtonElement>(`button[data-plan="${m.id}"]`)!;
    expect(plan.disabled).toBe(false);
    plan.click();
    expect(ok.onPlan).toHaveBeenCalledWith(m.id);
    s.slot = 'evening';
    const late = board(s);
    const blocked = late.host.querySelector<HTMLButtonElement>(`button[data-plan="${m.id}"]`)!;
    expect(blocked.disabled).toBe(true);
    expect(late.host.textContent).toContain('District 7 Quarantine takes 2 slots: leave in the Morning or Afternoon.');
    blocked.click();
    expect(late.onPlan).not.toHaveBeenCalled();
  });

  it('DISMISS is absent for command and story missions', () => {
    const s = campaign(reg, 4);
    s.base.facilities.comms = 2;
    const cmd = offer(s, { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' });
    const story = offer(s, { templateId: 'tpl_vesper_beat_1', regionId: 'quarantine_d7', source: 'story', spineBeat: 'beat_1' });
    const side = offer(s, { templateId: 'tpl_hunt', regionId: 'ashway', source: 'side' });
    const rumor = offer(s, { templateId: 'tpl_recover', regionId: 'ashway', source: 'rumor' });
    const b = board(s);
    expect(b.host.querySelector(`button[data-dismiss="${cmd.id}"]`)).toBeNull();
    expect(b.host.querySelector(`button[data-dismiss="${story.id}"]`)).toBeNull();
    b.host.querySelector<HTMLButtonElement>(`button[data-dismiss="${side.id}"]`)!.click();
    b.host.querySelector<HTMLButtonElement>(`button[data-dismiss="${rumor.id}"]`)!.click();
    expect(b.onDismiss.mock.calls.map((c) => c[0])).toEqual([side.id, rumor.id]);
  });

  it('rumors render newest first with a FOLLOW button only when they lead somewhere', () => {
    const s = campaign(reg, 4);
    s.base.facilities.comms = 3;
    s.commander.socialStats.insight = 5;
    s.day = 4;
    const plain = post(s, 'Nothing came of it.');
    const fact = post(s, 'The east stairwell is avoided.', { leadsTo: 'fact', tags: ['d7'] });
    const lead = post(s, 'A cache lies on the Ashway.', { leadsTo: 'mission', lead: { templateId: 'tpl_recover', regionId: 'ashway' } });
    fact.status = 'followed';
    const b = board(s);
    const posts = [...b.host.querySelectorAll<HTMLElement>('[data-rumor]')];
    expect(posts.map((p) => p.dataset.rumor)).toEqual([lead.id, fact.id, plain.id]);
    expect(b.host.textContent).toContain('RUMOR MILL');
    expect(posts[0].textContent).toMatch(/> anon_\d{3} \/\/ DAY 004/);
    expect(posts[1].textContent).toContain('#d7');
    expect(posts[0].querySelector('button[data-follow]')).not.toBeNull();
    expect(posts[1].querySelector('button[data-follow]')).toBeNull();
    expect(posts[1].textContent).toContain('FOLLOWED');
    expect(posts[2].querySelector('button[data-follow]')).toBeNull();
    expect(posts[2].textContent).not.toContain('FOLLOWED');
  });

  it('FOLLOW calls onFollowRumor', () => {
    const s = campaign(reg, 4);
    const r = post(s, 'A cache lies on the Ashway.', { leadsTo: 'mission', lead: { templateId: 'tpl_recover', regionId: 'ashway' } });
    const b = board(s);
    b.host.querySelector<HTMLButtonElement>(`button[data-follow="${r.id}"]`)!.click();
    expect(b.onFollowRumor).toHaveBeenCalledWith(r.id);
  });

  it('the intake banner appears while a unit is waiting', () => {
    const s = campaign(reg, 4);
    expect(board(s).host.textContent).not.toContain('INTAKE PENDING');
    s.world.incomingUnits = 1;
    const b = board(s);
    expect(b.host.textContent).toContain('INTAKE PENDING');
    b.host.querySelector<HTMLButtonElement>('button[data-intake]')!.click();
    expect(b.onIntake).toHaveBeenCalledTimes(1);
  });

  it('rumor and mission text is not HTML', () => {
    const s = campaign(reg, 4);
    const evil = '<img src=x onerror=alert(1)>';
    post(s, evil, { tags: ['<b>x</b>'] });
    offer(s, { templateId: 'tpl_sweep', regionId: 'ashway', source: 'command', title: '<i>Title</i>', brief: '<script>x()</script>' });
    const { host } = board(s);
    expect(host.querySelector('img, script, i, b')).toBeNull();
    expect(host.textContent).toContain(evil);
    expect(host.textContent).toContain('<i>Title</i>');
  });

  it('existing activity cards still render under the board, and the board needs no callbacks', () => {
    const s = campaign(reg, 4);
    offer(s, { templateId: 'tpl_sweep', regionId: 'ashway', source: 'command' });
    const { host } = render({ state: s });
    expect(host.querySelector('[data-activity="train"]')).not.toBeNull();
    expect(host.textContent).toContain('MISSION BOARD');
    expect(host.querySelector('button[data-plan]')).toBeNull(); // no onPlan: nothing to click
    // the board comes first
    expect(host.textContent!.indexOf('MISSION BOARD')).toBeLessThan(host.textContent!.indexOf('DAY 001'));
  });

  it('an unacknowledged report shows REPORT READY with an OPEN REPORT button', () => {
    const s = campaign(reg, 4);
    s.lastExpedition = { id: 'rep_1', missionId: 'm1', missionTitle: 'T', regionId: 'ashway', day: 1, outcome: 'success' as const, party: [], nodes: [], log: [], loot: [], injuries: [], deaths: [], breakdowns: [], acknowledged: false, debriefed: false };
    const onOpenReport = vi.fn();
    const r = render({ state: s, extra: { onOpenReport } });
    expect(r.host.textContent).toContain('REPORT READY');
    [...r.host.querySelectorAll('button')].find((b) => b.textContent!.includes('OPEN REPORT'))!.click();
    expect(onOpenReport).toHaveBeenCalledTimes(1);
    s.lastExpedition!.acknowledged = true;
    expect(render({ state: s, extra: { onOpenReport } }).host.textContent).not.toContain('REPORT READY');
    expect(render({ state: s }).host.textContent).not.toContain('REPORT READY');
  });
});
