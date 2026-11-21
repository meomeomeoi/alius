// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dispatch } from '../../../src/engine/dispatch';
import type { CampaignState } from '../../../src/engine/state/types';
import type { ImportOutcome } from '../../../src/setup/profile';
import { Wizard } from '../../../src/setup/wizard';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { renderWorldParams } from '../../../src/ui/setup/worldParams';
import { renderSysTab } from '../../../src/ui/shell/sysTab';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const card = (n: string) => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1) }) as never;
function make(...names: string[]) {
  const wizard = new Wizard(
    { registries: reg, desireBondDefects: false, importer: vi.fn(async (): Promise<ImportOutcome> => ({ kind: 'manual', reason: 'test' })), onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: false },
  );
  wizard.setStart('start_vesper');
  wizard.setCrime('mutiny');
  names.forEach((n, i) => {
    wizard.toggleUnit(card(n));
    wizard.setManual(i);
    wizard.update(i, { roleId: 'assault', signature: { templateId: 'sig_frenzy', name: 'W', description: 'D' }, defects: [{ id: 'echo_bleed', origin: 'o' }] });
  });
  const host = h('div');
  document.body.append(host);
  const draw = () => renderWorldParams(host, { wizard, registries: reg });
  wizard.subscribe(draw);
  draw();
  return { wizard, host };
}
const block = (host: HTMLElement) => host.querySelector<HTMLElement>('.alius-dynamic');

describe('WORLD PARAMETERS: DYNAMIC', () => {
  it('the block shows only while a practice category is enabled', () => {
    const { wizard, host } = make('ann', 'bea');
    expect(block(host)).toBeNull();
    expect(wizard.dynamicAvailable).toBe(false);
    wizard.setContent(['worship']); // a category no track names
    expect(block(host)).toBeNull();
    wizard.setContent(['restraint']);
    expect(block(host)).not.toBeNull();
    expect(block(host)!.querySelector('h3')!.textContent).toBe('DYNAMIC');
    expect(block(host)!.querySelectorAll('.alius-dynamic-unit')).toHaveLength(2);
    wizard.setContent([]);
    expect(block(host)).toBeNull();
  });

  it('the underway option shows only with a head start above zero', () => {
    const { wizard, host } = make('ann');
    wizard.setContent(['restraint']);
    expect(block(host)!.querySelectorAll('.alius-dynamic-underway')).toHaveLength(0);
    wizard.setHeadStart(14);
    expect(block(host)!.querySelectorAll('.alius-dynamic-underway')).toHaveLength(2); // the global one and hers
    expect(block(host)!.querySelector('.alius-dynamic-underway[data-scope="all"]')).not.toBeNull();
    wizard.setDynamic({ underway: true });
    expect(wizard.state.dynamic.underway).toBe(true);
    wizard.setHeadStart(0);
    expect(wizard.state.dynamic.underway).toBe(false);
    expect(block(host)!.querySelectorAll('.alius-dynamic-underway')).toHaveLength(0);
  });

  it('every control carries data-analyze', () => {
    const { wizard, host } = make('ann', 'bea');
    wizard.setContent(['restraint']);
    wizard.setHeadStart(7);
    wizard.setDynamicUnit('ann.png', { seeded: true });
    const controls = [...block(host)!.querySelectorAll<HTMLElement>('select, button, input')];
    expect(controls.length).toBeGreaterThan(8);
    for (const c of controls) {
      const marked = c.closest<HTMLElement>('[data-analyze]');
      expect(marked, c.outerHTML).not.toBeNull();
      expect(marked!.classList.contains('alius-option'), c.outerHTML).toBe(true);
      const id = marked!.getAttribute('data-analyze')!.replace('glossary:', '');
      expect(reg.glossary.has(id), id).toBe(true);
    }
    expect(block(host)!.querySelector('[name="startFrame"]')).not.toBeNull(); // a seeded unit has a starting frame
  });

  it('the controls go through the wizard', () => {
    const { wizard, host } = make('ann', 'bea');
    wizard.setContent(['restraint']);
    const holders = block(host)!.querySelector<HTMLSelectElement>('[name="dynamicHolders"]')!;
    expect(holders.value).toBe('1');
    holders.value = 'any';
    holders.dispatchEvent(new Event('change'));
    expect(wizard.state.dynamic.holders).toBe('any');
    block(host)!.querySelector<HTMLSelectElement>('[name="dynamicPace"]')!.value = 'fast';
    block(host)!.querySelector<HTMLSelectElement>('[name="dynamicPace"]')!.dispatchEvent(new Event('change'));
    expect(wizard.state.dynamic.pace).toBe('fast');
    block(host)!.querySelector<HTMLButtonElement>('[data-avatar="ann.png"] .alius-dynamic-seed')!.click();
    expect(wizard.state.dynamic.units['ann.png']).toEqual({ seeded: true });
    const frame = block(host)!.querySelector<HTMLSelectElement>('[data-avatar="ann.png"] [name="startFrame"]')!;
    frame.value = 'role';
    frame.dispatchEvent(new Event('change'));
    expect(wizard.state.dynamic.units['ann.png']).toEqual({ seeded: true, startFrame: 'role' });
  });
});

describe('the wizard: DYNAMIC', () => {
  it('the result carries the block only with a practice category on', () => {
    const { wizard } = make('ann', 'bea');
    expect(wizard.result()!.dynamic).toBeUndefined();
    wizard.setContent(['restraint']);
    expect(wizard.result()!.dynamic).toEqual({ holders: 1, pace: 'normal', frequency: 'normal', units: {} });
    wizard.setDynamic({ holders: 2, pace: 'slow', frequency: 'often' });
    wizard.setDynamicUnit('bea.png', { mayHold: 'no', sensitivity: 'lively' });
    expect(wizard.result()!.dynamic).toEqual({ holders: 2, pace: 'slow', frequency: 'often', units: { 'bea.png': { mayHold: 'no', sensitivity: 'lively' } } });
  });

  it('underway is written into the head start, globally or per card', () => {
    const { wizard } = make('ann', 'bea');
    wizard.setContent(['restraint']);
    wizard.setDynamicUnit('ann.png', { underway: true }); // no head start: ignored
    expect(wizard.result()!.headStart).toBeUndefined();
    wizard.setHeadStart(14);
    wizard.setDynamicUnit('ann.png', { underway: true });
    expect(wizard.result()!.headStart).toEqual({ days: 14, newArrivals: [], dynamicUnderway: ['ann.png'] });
    expect(wizard.result()!.dynamic!.units).toEqual({}); // underway is not part of the setup block
    wizard.setDynamic({ underway: true });
    expect(wizard.result()!.headStart!.dynamicUnderway).toBe(true);
    wizard.setContent([]);
    expect(wizard.result()!.headStart).toEqual({ days: 14, newArrivals: [] });
  });

  it('seeds are capped by the holders, and a removed unit leaves no pick', () => {
    const { wizard } = make('ann', 'bea');
    wizard.setContent(['restraint']);
    wizard.setDynamicUnit('ann.png', { seeded: true });
    wizard.setDynamicUnit('bea.png', { seeded: true }); // holders is 1: ignored
    expect(Object.keys(wizard.state.dynamic.units)).toEqual(['ann.png']);
    wizard.setDynamic({ holders: 2 });
    wizard.setDynamicUnit('bea.png', { seeded: true, startFrame: 'play' } as never);
    wizard.setDynamicUnit('bea.png', { startFrame: 'play' });
    expect(wizard.state.dynamic.units['bea.png']).toEqual({ seeded: true, startFrame: 'play' });
    wizard.setDynamic({ holders: 1 }); // the last seed goes
    expect(wizard.state.dynamic.units['bea.png']).toBeUndefined();
    expect(wizard.state.dynamic.units['ann.png']).toEqual({ seeded: true });
    wizard.setDynamic({ holders: 7 as never, pace: 'warp' as never });
    expect(wizard.state.dynamic).toMatchObject({ holders: 1, pace: 'normal' });
    wizard.toggleUnit(card('ann'));
    expect(wizard.state.dynamic.units['ann.png']).toBeUndefined();
    wizard.setDynamicUnit('nobody.png', { mayHold: 'no' });
    expect(wizard.state.dynamic.units['nobody.png']).toBeUndefined();
  });
});

describe('SYS: Dynamic', () => {
  function sys(s: CampaignState) {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const toast = vi.fn();
    let state = s;
    const host = h('div');
    document.body.append(host);
    renderSysTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), getRegistries: () => reg,
      dispatch: (a) => { const r = dispatch(state, a, reg); state = r.state; return r.events; },
      toast, modal: async () => null, onSettingsChanged: vi.fn(),
    });
    return { host, toast, state: () => state };
  }
  const withDynamic = (): CampaignState => {
    const s = campaign(reg, 3);
    s.content = { enabled: ['restraint'] };
    return s;
  };
  const change = (el: HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change')); };

  it('shows holders, pace, frequency and per-unit rows, each explainable', () => {
    const s = withDynamic();
    s.dynamic = { salt: 1, setup: { holders: 2, pace: 'normal', frequency: 'normal', units: {} }, knowledge: {}, overrideSeq: 0, queue: [], seq: 0, open: { claims: [], milestones: [], offers: [] } };
    const { host } = sys(s);
    const root = host.querySelector('.alius-dynamic-host')!;
    expect(root.querySelector<HTMLSelectElement>('[name="dynamicHolders"]')!.value).toBe('2');
    expect(root.querySelector('[name="dynamicPace"]')).not.toBeNull();
    expect(root.querySelector('[name="dynamicFrequency"]')).not.toBeNull();
    expect(root.querySelectorAll('.alius-dynamic-row')).toHaveLength(3);
    for (const c of root.querySelectorAll('select')) expect(c.closest('[data-analyze]'), c.outerHTML).not.toBeNull();
    expect([...host.querySelectorAll('h3')].some((e) => e.textContent === 'Dynamic')).toBe(true);
    expect(host.querySelector('[name="dynamicHidden"]')).not.toBeNull();
  });

  it('with no practice category and no block it says so, and with a category it creates the block', () => {
    const none = sys(campaign(reg, 2));
    expect(none.host.querySelector('.alius-dynamic-host select')).toBeNull();
    const on = sys(withDynamic());
    expect(on.state().dynamic).toBeUndefined();
    expect(on.host.querySelectorAll('.alius-dynamic-row')).toHaveLength(0);
    change(on.host.querySelector<HTMLSelectElement>('[name="dynamicHolders"]')!, '3');
    expect(on.state().dynamic!.setup.holders).toBe(3);
    expect(on.host.querySelectorAll('.alius-dynamic-row')).toHaveLength(3); // the rows follow the new block
  });

  it('per-unit rows go through the engine', () => {
    const s = withDynamic();
    const { host, state } = sys(s);
    change(host.querySelector<HTMLSelectElement>('[name="dynamicPace"]')!, 'fast');
    change(host.querySelector<HTMLSelectElement>('[name="mayHold:unit_ann"]')!, 'no');
    expect(state().dynamic!.setup.units.unit_ann).toEqual({ mayHold: 'no' });
    change(host.querySelector<HTMLSelectElement>('[name="sensitivity:unit_bea"]')!, 'lively');
    expect(state().dynamic!.setup.units.unit_bea).toEqual({ sensitivity: 'lively' });
    expect(state().dynamic!.setup.pace).toBe('fast');
  });

  it('lowering the holders below the count shows no warning that something ends', () => {
    const s = withDynamic();
    s.dynamic = { salt: 1, setup: { holders: 'any', pace: 'normal', frequency: 'normal', units: {} }, knowledge: {}, overrideSeq: 0, queue: [], seq: 0, open: { claims: [], milestones: [], offers: [] } };
    s.relations.unit_ann.dynamic = { hold: 50, frame: 'role', domains: [], tracks: {}, milestones: [], lastPracticeDay: 1, recent: [], favour: 0, readOf: { r: 0, f: 0, p: 0, motive: { order: 0.2, fear: 0.2, her: 0.2, process: 0.2, gain: 0.2 }, flat: 0, deflect: 0, region: 'reluctant', updates: 0 }, probes: { answers: [], issued: 0 }, refusals: [], contest: [], cooldowns: {} };
    s.relations.unit_bea.dynamic = { ...structuredClone(s.relations.unit_ann.dynamic!), frame: 'play', hold: 30 };
    const { host, toast, state } = sys(s);
    change(host.querySelector<HTMLSelectElement>('[name="dynamicHolders"]')!, '1');
    expect(state().dynamic!.setup.holders).toBe(1);
    expect(toast).not.toHaveBeenCalled();
    expect(state().relations.unit_ann.dynamic!.frame).toBe('role');
    expect(state().relations.unit_bea.dynamic!.frame).toBe('play');
    const after = host.querySelector('.alius-dynamic-host')!.textContent!;
    expect(after).not.toMatch(/end|warn|lose|lost/i);
    expect(after.length).toBeGreaterThan(0);
  });
});
