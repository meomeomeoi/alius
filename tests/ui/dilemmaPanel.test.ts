// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderDilemma, type DilemmaPanelCtx } from '../../src/ui/dilemma/dilemmaPanel';
import { h } from '../../src/ui/dom';
import { renderExpeditionScreen } from '../../src/ui/expedition/expeditionScreen';
import type { ExpeditionController } from '../../src/world/expeditionController';
import { depart, withMission } from '../helpers/expedition';
import { campaign, loadCore } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const options = (over: Array<Partial<DilemmaPanelCtx['options'][number]>> = []): DilemmaPanelCtx['options'] =>
  [{ label: 'Cut portions', disabled: null, hasCheck: false }, { label: 'Buy on the black market', disabled: null, hasCheck: true }]
    .map((o, index) => ({ index, ...o, ...(over[index] ?? {}) }));

function mount(over: Partial<DilemmaPanelCtx> = {}) {
  const host = h('div');
  document.body.append(host);
  const onChoose = vi.fn();
  renderDilemma(host, { title: 'Short rations', setup: 'The mess hall is short again.', scale: 'minor', waiting: false, options: options(), onChoose, ...over });
  return { host, onChoose };
}
const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')];

describe('dilemma panel', () => {
  it('shows the title, the setup and one button per option', () => {
    const { host } = mount();
    expect(host.querySelector('h3')!.textContent).toBe('Short rations');
    expect(host.textContent).toContain('The mess hall is short again.');
    expect(buttons(host).map((b) => b.textContent)).toEqual(['[ Cut portions ]', '[ Buy on the black market ] — CHECK']);
    expect(host.textContent).toContain('MINOR');
  });

  it('waiting shows no buttons', () => {
    const { host } = mount({ waiting: true, options: [] });
    expect(host.textContent).toContain('OVERSIGHT IS DRAFTING YOUR OPTIONS…');
    expect(buttons(host)).toHaveLength(0);
    expect(host.textContent).not.toContain('The mess hall');
  });

  it('a greyed option shows its reason and cannot be chosen', () => {
    const { host, onChoose } = mount({ options: options([{}, { disabled: 'Needs Empathy 3' }]) });
    const grey = buttons(host)[1];
    // soft-disabled: still focusable and hoverable, so its requirement can be analyzed
    expect(grey.disabled).toBe(false);
    expect(grey.getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain('Needs Empathy 3');
    grey.click();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('choosing disables every button and calls onChoose once', () => {
    const { host, onChoose } = mount();
    const [a, b] = buttons(host);
    a.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(0);
    expect(buttons(host).every((x) => x.getAttribute('aria-disabled') === 'true')).toBe(true);
    a.click();
    b.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('there is no text input', () => {
    const { host } = mount();
    expect(host.querySelector('input, textarea, select, [contenteditable]')).toBeNull();
  });

  it('model text is shown as text, never as markup', () => {
    const { host } = mount({ title: '<b>T</b>', setup: '<img src=x onerror=alert(1)>', options: options([{ label: '<i>x</i>' }]) });
    expect(host.querySelector('b, img, i')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(host.textContent).toContain('<i>x</i>');
  });

  it('a defining decision says so', () => {
    expect(mount({ scale: 'defining' }).host.textContent).toContain('DEFINING');
  });
});

describe('expedition event panel with a dilemma', () => {
  const EVT = 'evt_vesper_choice';
  function atEvent(): CampaignState {
    const { state, mission } = withMission(reg, campaign(reg, 4));
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.phase = 'event';
    s.expedition!.pending = { kind: 'event', nodeId: s.expedition!.map.objectiveId, templateId: EVT };
    return s;
  }
  function screen(state: CampaignState, withChoose = true) {
    const host = h('div');
    document.body.append(host);
    const onDilemmaChoose = vi.fn();
    const controller = { choose: vi.fn(), move: vi.fn(), treat: vi.fn(), setFormation: vi.fn(), retreat: vi.fn(), return: vi.fn(), planning: vi.fn(() => null) } as unknown as ExpeditionController;
    const s = renderExpeditionScreen(host, { getState: () => state, registries: reg, settings: () => DEFAULT_SETTINGS, controller, onClose: () => {}, ...(withChoose ? { onDilemmaChoose } : {}) });
    return { host, onDilemmaChoose, controller, screen: s };
  }
  const open = (s: CampaignState, status: 'requested' | 'presented') => {
    s.dilemmas = {
      seq: 1,
      open: {
        id: 'dl1', templateId: EVT, scale: 'defining', context: 'expedition_event', day: s.day, status, attempts: 0, units: [], beatId: 'beat_4',
        ...(status === 'presented'
          ? { title: 'The generated evidence', setup: 'Written by the model.', source: 'model' as const, options: [
            { label: 'Hand it over', effects: [{ type: 'resource' as const, resource: 'credits' as const, amount: -40 }], magnitudes: [] },
            { label: 'Burn it', effects: [{ type: 'party_stress' as const, amount: 5 }], magnitudes: [] },
          ] }
          : {}),
      },
    };
  };

  it('the expedition event panel shows the generated dilemma when one is open and the fixed options otherwise', () => {
    const fixed = screen(atEvent());
    expect(fixed.host.textContent).toContain('The evidence');
    expect(fixed.host.querySelectorAll('[data-option]')).toHaveLength(3);
    fixed.host.querySelector<HTMLButtonElement>('[data-option="1"]')!.click();
    expect(fixed.controller.choose).toHaveBeenCalledWith(1);

    const s = atEvent();
    open(s, 'presented');
    const generated = screen(s);
    expect(generated.host.textContent).toContain('The generated evidence');
    expect(generated.host.textContent).toContain('Written by the model.');
    expect(generated.host.querySelectorAll('[data-option]')).toHaveLength(0);
    const hand = [...generated.host.querySelectorAll('button')].find((b) => b.textContent!.includes('Hand it over'))!;
    hand.click();
    expect(generated.onDilemmaChoose).toHaveBeenCalledWith(0);
    expect(generated.controller.choose).not.toHaveBeenCalled();
  });

  it('while the request is being written the panel waits and offers no way around it', () => {
    const s = atEvent();
    open(s, 'requested');
    const { host } = screen(s);
    expect(host.textContent).toContain('OVERSIGHT IS DRAFTING YOUR OPTIONS…');
    expect(host.querySelectorAll('[data-option]')).toHaveLength(0);
  });

  it('without a dilemma handler the fixed options stay', () => {
    const s = atEvent();
    open(s, 'presented');
    expect(screen(s, false).host.querySelectorAll('[data-option]')).toHaveLength(3);
  });
});

describe('route picker (P7)', () => {
  const ROUTES = [
    { route: 0, kind: 'body' as const, label: 'STRENGTH: Strong or better', disabled: 'Needs strength Strong or better; yours is Average.' },
    { route: 1, kind: 'delegate' as const, label: 'Ask a unit (Trust: guarded)', disabled: null, unitIds: ['unit_ann', 'unit_bea'] },
    { route: 2, kind: 'bypass' as const, label: 'Pay 5 credits', disabled: null },
  ];
  const routed = () => options([{ routes: ROUTES }, {}]);
  const names: Record<string, string> = { unit_ann: 'Ann', unit_bea: 'Bea' };

  it('a routed option opens its route list instead of choosing at once', () => {
    const { host, onChoose } = mount({ options: routed(), unitName: (id) => names[id] ?? id });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    expect(onChoose).not.toHaveBeenCalled();
    const routes = [...host.querySelectorAll<HTMLButtonElement>('button[data-route]')];
    expect(routes.map((b) => b.textContent)).toEqual([
      '[ STRENGTH: Strong or better ] — Needs strength Strong or better; yours is Average.', '[ Ask a unit (Trust: guarded) ]', '[ Pay 5 credits ]',
    ]);
  });

  it('a disabled route shows its reason and cannot be taken', () => {
    const { host, onChoose } = mount({ options: routed() });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    const body = host.querySelector<HTMLButtonElement>('button[data-route="0"]')!;
    expect(body.getAttribute('aria-disabled')).toBe('true');
    body.click();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('a route without a unit sends { route }', () => {
    const { host, onChoose } = mount({ options: routed() });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(0, { route: 2 });
  });

  it('a delegate route asks for a unit first and sends { route, unitId }', () => {
    const { host, onChoose } = mount({ options: routed(), unitName: (id) => names[id] ?? id });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="1"]')!.click();
    expect(onChoose).not.toHaveBeenCalled();
    const units = [...host.querySelectorAll<HTMLButtonElement>('button[data-route-unit]')];
    expect(units.map((b) => b.textContent)).toEqual(['[ Ann ]', '[ Bea ]']);
    units[1].click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(0, { route: 1, unitId: 'unit_bea' });
  });

  it('after a pick every button is locked, and a second click does nothing', () => {
    const { host, onChoose } = mount({ options: routed() });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    const bypass = host.querySelector<HTMLButtonElement>('button[data-route="2"]')!;
    bypass.click();
    bypass.click();
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="1"]')!.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('a pick the engine rejects unlocks the panel (nothing re-rendered it), a pick that went through stays locked', async () => {
    const { host, onChoose } = mount({ options: routed() });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // the host is still in the document: the dispatch changed nothing
    expect(host.querySelector('button[data-route="2"]')!.getAttribute('aria-disabled')).toBeNull();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    expect(onChoose).toHaveBeenCalledTimes(2);

    // the screen was redrawn by the successful choice: the old buttons are gone and stay inert
    const ok = mount({ options: routed() });
    ok.host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    const bypass = ok.host.querySelector<HTMLButtonElement>('button[data-route="2"]')!;
    bypass.click();
    ok.host.replaceChildren();
    await Promise.resolve();
    bypass.click();
    expect(ok.onChoose).toHaveBeenCalledTimes(1);
  });

  it('an option without routes still chooses at once', () => {
    const { host, onChoose } = mount({ options: routed() });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="1"]')!.click();
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('route and unit buttons are analyzable, text is not markup', () => {
    const { host } = mount({ options: options([{ routes: [{ route: 0, kind: 'bypass', label: '<b>Pay</b>', disabled: null }] }]) });
    host.querySelector<HTMLButtonElement>('[data-dilemma-option="0"]')!.click();
    expect(host.querySelector('b')).toBeNull();
    for (const b of host.querySelectorAll('button[data-route]')) expect(b.getAttribute('data-analyze')).toMatch(/^glossary:(check_routes|delegate)$/);
  });
});

describe('expedition event with a routed option (P7)', () => {
  function atCrate(): CampaignState {
    const { state, mission } = withMission(reg, campaign(reg, 4));
    const s = structuredClone(depart(reg, state, mission.id));
    s.commander.body = { strength: 2, endurance: 3, reflexes: 2 };
    s.expedition!.phase = 'event';
    s.expedition!.pending = { kind: 'event', nodeId: s.expedition!.map.objectiveId, templateId: 'evt_sealed_crate' };
    return s;
  }
  function screen(state: CampaignState) {
    const host = h('div');
    document.body.append(host);
    const controller = { choose: vi.fn(), move: vi.fn(), treat: vi.fn(), setFormation: vi.fn(), retreat: vi.fn(), return: vi.fn(), planning: vi.fn(() => null) } as unknown as ExpeditionController;
    renderExpeditionScreen(host, { getState: () => state, registries: reg, settings: () => DEFAULT_SETTINGS, controller, onClose: () => {} });
    return { host, controller };
  }

  it('the routed option opens the route list; the plain one still chooses at once', () => {
    const { host, controller } = screen(atCrate());
    host.querySelector<HTMLButtonElement>('[data-option="0"]')!.click();
    expect(controller.choose).not.toHaveBeenCalled();
    expect([...host.querySelectorAll('button[data-route]')].map((b) => b.getAttribute('data-route'))).toEqual(['0', '1', '2']);
    host.querySelector<HTMLButtonElement>('[data-option="1"]')!.click();
    expect(controller.choose).toHaveBeenCalledWith(1);
  });

  it('a body route below its minimum shows the reason', () => {
    const { host } = screen(atCrate());
    host.querySelector<HTMLButtonElement>('[data-option="0"]')!.click();
    const body = host.querySelector<HTMLButtonElement>('button[data-route="0"]')!;
    expect(body.textContent).toMatch(/Needs strength Average or better; yours is Slight|Needs strength/);
    expect(body.getAttribute('aria-disabled')).toBe('true');
  });

  it('a delegate pick sends the route and the unit to the controller', () => {
    const { host, controller } = screen(atCrate());
    host.querySelector<HTMLButtonElement>('[data-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="1"]')!.click();
    const ann = host.querySelector<HTMLButtonElement>('button[data-route-unit="unit_ann"]')!;
    ann.click();
    expect(controller.choose).toHaveBeenCalledWith(0, { route: 1, unitId: 'unit_ann' });
  });

  it('a rejected pick leaves the event usable', async () => {
    const { host, controller } = screen(atCrate());
    host.querySelector<HTMLButtonElement>('[data-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    expect(controller.choose).toHaveBeenCalledTimes(2);
  });

  it('a bypass sends only the route', () => {
    const { host, controller } = screen(atCrate());
    host.querySelector<HTMLButtonElement>('[data-option="0"]')!.click();
    host.querySelector<HTMLButtonElement>('button[data-route="2"]')!.click();
    expect(controller.choose).toHaveBeenCalledWith(0, { route: 2 });
  });
});
