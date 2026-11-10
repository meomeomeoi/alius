// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { offerMission } from '../../src/engine/world/missions';
import type { LoadResult } from '../../src/st/persistence';
import { h } from '../../src/ui/dom';
import { renderMapTab } from '../../src/ui/map/mapTab';
import { campaign, ctxOf, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function render(o: { state?: CampaignState | null; load?: LoadResult; image?: string | null; regs?: Registries; host?: HTMLElement } = {}) {
  const state = o.state === undefined ? campaign(reg, 4) : o.state;
  const load: LoadResult = o.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const onPlan = vi.fn();
  const host = o.host ?? h('div');
  if (!host.isConnected) document.body.append(host);
  const ctx = { getState: () => state, getLoad: () => load, registries: o.regs ?? reg, mapImageUrl: o.image ?? null, onPlan };
  renderMapTab(host, ctx);
  return { host, onPlan, state, again: () => renderMapTab(host, ctx) };
}
const region = (host: HTMLElement, id: string) => host.querySelector<HTMLButtonElement>(`button[data-region="${id}"]`)!;
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const withMission = (s: CampaignState, o: { templateId: string; regionId: string; source: 'command' | 'side' | 'rumor'; title?: string; brief?: string }) => {
  const m = offerMission(s, ctxOf(s, reg), o).mission!;
  return m;
};

describe('MAP tab: the map', () => {
  it('without an image the ASCII grid shows every known region as a button', () => {
    const { host } = render();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[data-region]')];
    expect(buttons.map((b) => b.dataset.region).sort()).toEqual(['ashway', 'kestrel_corridor', 'quarantine_d7']);
    expect(region(host, 'ashway').textContent).toBe('The Ashway');
    expect(host.querySelector('img, svg')).toBeNull();
    expect(host.querySelector('.alius-ascii-map')).not.toBeNull();
    // it is a 3×3 grid: three rows of three cells
    expect(host.querySelectorAll('.alius-ascii-row')).toHaveLength(3);
    expect(host.querySelectorAll('.alius-ascii-cell')).toHaveLength(9);
    // each region sits at its map cell
    const cellOf = (id: string) => region(host, id).closest('.alius-ascii-cell') as HTMLElement;
    expect(cellOf('quarantine_d7').dataset.cell).toBe('0,0');
    expect(cellOf('kestrel_corridor').dataset.cell).toBe('1,0');
    expect(cellOf('ashway').dataset.cell).toBe('2,0');
  });

  it('an unknown region shows NO SIGNAL and is not selectable', () => {
    const { host } = render();
    const stubs = [...host.querySelectorAll('.alius-nosignal')];
    expect(stubs.map((e) => e.textContent)).toEqual(['[ NO SIGNAL ]', '[ NO SIGNAL ]']);
    expect(host.querySelector('button[data-region="drowned_market"]')).toBeNull();
    expect(host.querySelector('button[data-region="the_garden"]')).toBeNull();
    // clearance makes them appear
    const s = campaign(reg, 4);
    s.world.clearanceTier = 2;
    const known = render({ state: s }).host;
    expect(known.querySelectorAll('button[data-region]')).toHaveLength(5);
    expect(known.querySelector('.alius-nosignal')).toBeNull();
  });

  it('with an image URL polygons are rendered and an image error falls back to ASCII', () => {
    const { host } = render({ image: 'content/core/map/world.png' });
    const img = host.querySelector<HTMLImageElement>('img')!;
    expect(img.getAttribute('src')).toBe('content/core/map/world.png');
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    const polys = [...svg.querySelectorAll('polygon')];
    expect(polys).toHaveLength(5);
    const ashway = svg.querySelector('polygon[data-region="ashway"]')!;
    expect(ashway.getAttribute('aria-label')).toBe('The Ashway');
    expect(ashway.getAttribute('tabindex')).toBe('0');
    expect(ashway.getAttribute('points')).toBe((reg.regions.get('ashway')!.mapHotspot as number[][]).map(([x, y]) => `${x},${y}`).join(' '));
    // an unknown region cannot be focused or selected
    const lost = svg.querySelector('polygon[data-region="the_garden"]')!;
    expect(lost.getAttribute('aria-disabled')).toBe('true');
    expect(lost.getAttribute('tabindex')).toBeNull();
    click(lost);
    expect(host.textContent).not.toContain('The Garden');
    // selecting through the polygon works, by click and by keyboard
    click(ashway);
    expect(host.textContent).toContain('ENVIRONMENT');
    expect(host.querySelector('polygon[data-region="ashway"]')!.classList.contains('alius-selected')).toBe(true);
    host.querySelector('polygon[data-region="kestrel_corridor"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.textContent).toContain('Corridor K-12');
    // the image fails to load: the ASCII grid takes over
    host.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(host.querySelector('img, svg')).toBeNull();
    expect(host.querySelectorAll('button[data-region]')).toHaveLength(3);
    expect(host.textContent).toContain('Corridor K-12'); // the selection survives
  });
});

describe('MAP tab: the region panel', () => {
  it('the start region is selected by default', () => {
    const { host } = render();
    expect(host.querySelector('.alius-region-panel h2')!.textContent).toBe('District 7 Quarantine');
    expect(region(host, 'quarantine_d7').classList.contains('alius-selected')).toBe(true);
    const kestrel = render({ state: campaign(reg, 4, { startId: 'start_kestrel' }), host: h('div') });
    expect(kestrel.host.querySelector('.alius-region-panel h2')!.textContent).toBe('Corridor K-12');
  });

  it('selecting a region shows environment, danger, hostiles, clocks and missions', () => {
    const s = campaign(reg, 4);
    const m = withMission(s, { templateId: 'tpl_sweep', regionId: 'ashway', source: 'command', title: 'Clear the road' });
    const { host } = render({ state: s });
    click(region(host, 'ashway'));
    const panel = host.querySelector('.alius-region-panel') as HTMLElement;
    const text = panel.textContent!;
    expect(panel.querySelector('h2')!.textContent).toBe('The Ashway');
    expect(text).toContain('A dead highway lined with scavenger camps');
    expect(text).toContain('ENVIRONMENT');
    expect(text).toContain('Dead highway, ash drifts, scavenger camps.');
    expect(text).toContain('DANGER ▮▮▯▯▯');
    expect(text).toContain('TRAVEL 2 SLOTS');
    expect(text).toContain('KNOWN HOSTILES');
    expect(text).toContain('Marauders');
    expect(text).toContain('Bio-mutants (beast)');
    expect(text).toContain('CLOCKS');
    expect(text).toContain('Oversight suspicion ░░░░░░ 0/6'); // a visible clock without a region shows everywhere
    expect(text).not.toContain('Bloom spread'); // another region's clock
    expect(text).toContain('MISSIONS');
    expect(text).toContain('[COMMAND]');
    expect(text).toContain('Clear the road');
    expect(text).toContain(`D-${m.deadlineDay! - s.day}`);
    expect(text).toContain('POINTS OF INTEREST');
    expect(text).toContain('Scavenging run');
    // another region
    click(region(host, 'quarantine_d7'));
    const t2 = host.querySelector('.alius-region-panel')!.textContent!;
    expect(t2).toContain('Bloom spread — District 7 █░░░░░░░ 1/8');
    expect(t2).not.toContain('Clear the road');
    expect(t2).toContain('DANGER ▮▯▯▯▯');
  });

  it('hidden clocks are not shown', () => {
    const s = campaign(reg, 4);
    s.world.clearanceTier = 2;
    const { host } = render({ state: s });
    click(region(host, 'the_garden'));
    const text = host.querySelector('.alius-region-panel')!.textContent!;
    expect(text).toContain('The Garden');
    expect(text).not.toContain('The Garden wakes');
    click(region(host, 'ashway'));
    expect(host.querySelector('.alius-region-panel')!.textContent).not.toContain('Sable Line operation');
  });

  it('a mission button calls onPlan with its id', () => {
    const s = campaign(reg, 4);
    const m = withMission(s, { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' });
    const { host, onPlan } = render({ state: s });
    const btn = host.querySelector<HTMLButtonElement>(`button[data-mission="${m.id}"]`)!;
    click(btn);
    expect(onPlan).toHaveBeenCalledWith({ missionId: m.id });
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('a POI button plans a run; a POI on cooldown is disabled with the reason', () => {
    const s = campaign(reg, 4);
    s.day = 6;
    s.world.regions.quarantine_d7 = { known: true, poi: { scavenge: 6 } };
    const { host, onPlan } = render({ state: s });
    const btn = host.querySelector<HTMLButtonElement>('button[data-poi="scavenge"]')!;
    expect(btn.disabled).toBe(true);
    expect(host.querySelector('.alius-region-panel')!.textContent).toContain('cannot be run again before day 8');
    click(btn);
    expect(onPlan).not.toHaveBeenCalled();
    s.day = 8;
    const ready = render({ state: s, host: h('div') });
    const ok = ready.host.querySelector<HTMLButtonElement>('button[data-poi="scavenge"]')!;
    expect(ok.disabled).toBe(false);
    click(ok);
    expect(ready.onPlan).toHaveBeenCalledWith({ poi: { regionId: 'quarantine_d7', poiId: 'scavenge' } });
  });

  it('region names and briefs are rendered as text, not HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const regs = { ...reg, regions: new Map(reg.regions) } as Registries;
    regs.regions.set('quarantine_d7', { ...reg.regions.get('quarantine_d7')!, name: evil, summary: `<b>${evil}</b>`, environmentPrompt: '<script>x()</script>' });
    const s = campaign(reg, 4);
    withMission(s, { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command', title: '<i>Title</i>' });
    const { host } = render({ state: s, regs });
    expect(host.querySelector('img, script, b, i')).toBeNull();
    expect(host.textContent).toContain(evil);
    expect(host.textContent).toContain('<i>Title</i>');
    expect(host.textContent).toContain('<script>x()</script>');
  });

  it('the selection survives a re-render', () => {
    const { host, again } = render();
    click(region(host, 'kestrel_corridor'));
    again();
    expect(host.querySelector('.alius-region-panel h2')!.textContent).toBe('Corridor K-12');
    expect(region(host, 'kestrel_corridor').classList.contains('alius-selected')).toBe(true);
  });
});

describe('MAP tab: states', () => {
  it('no campaign shows the offline stub text', () => {
    const { host } = render({ state: null });
    expect(host.textContent).toContain('NO ACTIVE CAMPAIGN IN THIS CHAT');
    expect(host.querySelector('button')).toBeNull();
  });

  it('a read-only campaign shows the banner', () => {
    const { host } = render({ state: campaign(reg, 4), load: { kind: 'readonly', reason: 'newer version' } as LoadResult });
    expect(host.textContent).toContain('READ-ONLY: newer version');
    expect(host.querySelector('button')).toBeNull();
  });
});
