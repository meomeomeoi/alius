// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import { dispatch } from '../../../src/engine/dispatch';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderDevelopmentBlock } from '../../../src/ui/development/developmentBlock';
import { renderSysTab } from '../../../src/ui/shell/sysTab';
import { markedWithout } from '../../helpers/analyzeCoverage';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const ANN = 'unit_ann';
const unit = (s: CampaignState): Unit => s.squad.find((u) => u.id === ANN)!;

/** ANN has changed twice: mercy (shown) and her desire (a moment no scene has carried yet), and has one shown and one unshown line. */
function world(): CampaignState {
  const s = campaign(reg, 2);
  s.settings.characterDevelopment = 'normal';
  const dev = ensureDevelopment(unit(s));
  unit(s).values.mercy = 1;
  dev.drift.mercy = 1;
  dev.acc = { 'value:ingroup': 4.37 };
  dev.moments = [{ id: 'dm0', axis: 'value:mercy', from: '1', to: '2', reason: 'Weeks of small kindnesses.', day: 3, sceneId: 's1', shownDay: 4 }];
  dev.facts = [
    { id: 'df0', text: 'She keeps a spare ration for the others.', kind: 'attitude', day: 3, source: 'review', sceneId: 's1', shownDay: 4 },
    { id: 'df1', text: 'SENTINEL-UNSHOWN she is planning something.', kind: 'memory', day: 5, source: 'review' },
  ];
  return s;
}
function mount(s: CampaignState, over: { editLock?: boolean; sent?: Array<{ type: string; payload?: unknown }> } = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const host = document.createElement('div');
  document.body.append(host);
  let state = s;
  const settings = { ...getSettings(st), editLock: over.editLock ?? true, showRawValues: false };
  const draw = (): void => renderDevelopmentBlock(host, {
    state, registries: reg, settings, unitId: ANN,
    dispatch: (a) => { over.sent?.push(a); const r = dispatch(state, a as never, reg); state = r.state; return r.events as never; },
    onChanged: draw,
  });
  draw();
  return { host, state: () => state, draw };
}
const q = (host: HTMLElement, sel: string) => host.querySelector<HTMLElement>(sel)!;

describe('the DEVELOPMENT view', () => {
  it('shows only what she has shown, in words, with no number', () => {
    const { host } = mount(world());
    const text = host.textContent ?? '';
    expect(text).toContain('More merciful than her file says.');
    expect(text).toContain('She keeps a spare ration for the others.');
    expect(text).not.toContain('SENTINEL-UNSHOWN');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toContain('4.37');
    expect(host.querySelectorAll('.alius-dev-fact')).toHaveLength(1);
  });

  it('an unshown change appears once a scene has shown it', () => {
    let s = world();
    unit(s).development!.moments.push({ id: 'dm1', axis: 'value:autonomy', from: '0', to: '1', reason: 'r', day: 5 });
    unit(s).development!.drift.autonomy = 1;
    expect(mount(s).host.querySelector('[data-axis="value:autonomy"]')).toBeNull();
    s = dispatch(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }, reg).state;
    s = dispatch(s, { type: 'scene/end', payload: {} }, reg).state;
    const { host } = mount(s);
    expect(host.querySelector('[data-axis="value:autonomy"]')).not.toBeNull();
    expect(host.textContent).toContain('SENTINEL-UNSHOWN'); // the scene showed her line too
  });

  it('nothing yet', () => {
    const s = campaign(reg, 2);
    expect(mount(s).host.textContent).toContain('NOTHING YET.');
    const quiet = world();
    unit(quiet).development!.moments = [];
    unit(quiet).development!.facts = [];
    unit(quiet).development!.drift = {};
    expect(mount(quiet).host.textContent).toContain('NOTHING YET.');
  });

  it('every element carries data-analyze, and the axis line has its own address', () => {
    const { host } = mount(world(), { editLock: false });
    expect(markedWithout(host)).toEqual([]);
    expect(q(host, '[data-axis="value:mercy"] .alius-stat').getAttribute('data-analyze')).toBe('development:unit_ann:value:mercy');
    expect(q(host, '[data-action="hold"]').getAttribute('data-analyze')).toBe('glossary:development_hold');
  });
});

describe('HOLD and fact editing', () => {
  it('with the edit lock off, HOLD toggles held', () => {
    const sent: Array<{ type: string; payload?: unknown }> = [];
    const m = mount(world(), { editLock: false, sent });
    const hold = q(m.host, '[data-action="hold"]');
    expect(hold.getAttribute('aria-pressed')).toBe('false');
    hold.click();
    expect(sent.at(-1)).toEqual({ type: 'development/hold', payload: { unitId: ANN, axis: 'value:mercy', on: true } });
    expect(developmentOf(unit(m.state())).held).toEqual(['value:mercy']);
    expect(q(m.host, '[data-action="hold"]').getAttribute('aria-pressed')).toBe('true');
    q(m.host, '[data-action="hold"]').click();
    expect(developmentOf(unit(m.state())).held).toBeUndefined();
  });

  it('EDIT saves her line as edited, REMOVE takes it away', () => {
    const m = mount(world(), { editLock: false });
    q(m.host, '[data-action="edit"]').click();
    const ta = q(m.host, 'textarea') as HTMLTextAreaElement;
    ta.value = 'She gave her ration away.';
    q(m.host, '[data-action="save"]').click();
    expect(developmentOf(unit(m.state())).facts[0]).toMatchObject({ text: 'She gave her ration away.', edited: true });
    expect(m.host.textContent).toContain('EDITED');
    q(m.host, '[data-action="remove"]').click();
    expect(developmentOf(unit(m.state())).facts.map((f) => f.id)).toEqual(['df1']);
  });

  it('with the edit lock on the controls are aria-disabled, analyzable, and do nothing', () => {
    const sent: Array<{ type: string; payload?: unknown }> = [];
    const m = mount(world(), { editLock: true, sent });
    for (const action of ['hold', 'edit', 'remove']) {
      const btn = q(m.host, `[data-action="${action}"]`);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.hasAttribute('data-analyze')).toBe(true);
      btn.click();
    }
    expect(sent).toEqual([]);
    expect(m.host.querySelector('textarea')).toBeNull();
  });

  it('a habit line carries the habit chip address', () => {
    const s = world();
    unit(s).development!.facts.push({ id: 'df2', text: 'She drills at dawn.', kind: 'habit', day: 6, source: 'habit', habitId: 'drills_daily', shownDay: 7 });
    unit(s).development!.habits = ['drills_daily'];
    const { host } = mount(s);
    expect(q(host, '[data-fact="df2"] [data-role="text"]').getAttribute('data-analyze')).toBe('glossary:habit');
  });
});

describe('SYS › character development', () => {
  const sys = (state: CampaignState | null) => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = document.createElement('div');
    document.body.append(host);
    const sent: Array<{ type: string; payload?: unknown }> = [];
    let cur = state;
    renderSysTab(host, {
      st, getState: () => cur, getLoad: () => ({ kind: 'none' }), toast: () => {}, modal: async () => null, onSettingsChanged: () => {},
      dispatch: (a) => { sent.push(a); if (cur) { const r = dispatch(cur, a as never, reg); cur = r.state; return r.events as never; } return []; },
    } as never);
    return { host, sent, state: () => cur };
  };

  it('an old save reads off, and the select dispatches development/set_mode', () => {
    const old = campaign(reg, 2);
    const m = sys(old);
    const sel = q(m.host, 'select[name="characterDevelopment"]') as HTMLSelectElement;
    expect(sel.value).toBe('off');
    expect(sel.closest('[data-analyze]')!.getAttribute('data-analyze')).toBe('glossary:character_development');
    sel.value = 'slow';
    sel.dispatchEvent(new Event('change'));
    expect(m.sent).toEqual([{ type: 'development/set_mode', payload: { mode: 'slow' } }]);
    expect(m.state()!.settings.characterDevelopment).toBe('slow');
  });

  it('a campaign with it on reads its mode; without a campaign the select is disabled', () => {
    const on = world();
    expect((q(sys(on).host, 'select[name="characterDevelopment"]') as HTMLSelectElement).value).toBe('normal');
    expect((q(sys(null).host, 'select[name="characterDevelopment"]') as HTMLSelectElement).disabled).toBe(true);
  });

  it('the habit wording checkbox is there and off by default', () => {
    const cb = q(sys(world()).host, 'input[name="habitWording"]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });
});
