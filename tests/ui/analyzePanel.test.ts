// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { placePanel } from '../../src/ui/analyze/place';
import { renderPanel, type PanelView } from '../../src/ui/analyze/panel';
import { ANALYZE_MARKERS, analyzeAttrs } from '../../src/ui/analyze/mark';
import type { PanelModel } from '../../src/analysis/model';

afterEach(() => { document.body.innerHTML = ''; });

describe('placePanel', () => {
  const size = { w: 200, h: 100 };
  const vp = { w: 1000, h: 800 };

  it('sits below-right of the cursor', () => {
    expect(placePanel({ x: 100, y: 100 }, size, vp)).toEqual({ left: 112, top: 112 });
    expect(placePanel({ x: 100, y: 100 }, size, vp, 20)).toEqual({ left: 120, top: 120 });
  });

  it('flips left at the right edge', () => {
    expect(placePanel({ x: 900, y: 100 }, size, vp)).toEqual({ left: 900 - 12 - 200, top: 112 });
  });

  it('flips up at the bottom', () => {
    expect(placePanel({ x: 100, y: 750 }, size, vp)).toEqual({ left: 112, top: 750 - 12 - 100 });
  });

  it('never leaves the viewport on a tiny screen', () => {
    for (const [anchor, tiny] of [
      [{ x: 5, y: 5 }, { w: 150, h: 90 }],
      [{ x: 140, y: 85 }, { w: 150, h: 90 }],
      [{ x: 0, y: 0 }, { w: 100, h: 50 }],
    ] as const) {
      const p = placePanel(anchor, size, tiny);
      expect(p.left).toBeGreaterThanOrEqual(4);
      expect(p.top).toBeGreaterThanOrEqual(4);
    }
    // when it fits at all, it stays inside every edge
    const p = placePanel({ x: 990, y: 790 }, size, vp);
    expect(p.left + size.w).toBeLessThanOrEqual(vp.w - 4);
    expect(p.top + size.h).toBeLessThanOrEqual(vp.h - 4);
  });
});

const model = (over: Partial<PanelModel> = {}): PanelModel => ({
  address: 'glossary:trust', source: 'glossary', title: 'Trust', text: 'Belief in you.', long: null,
  effects: [], see: [], reading: null, missing: false, ...over,
});
const view = (over: Partial<PanelView> = {}): PanelView => ({
  model: model(), crumbs: ['Trust'], canDrill: true, pinned: false, analyzingMs: 0, wipe: false, ...over,
});
const handlers = () => ({ link: vi.fn(), crumb: vi.fn(), back: vi.fn(), pin: vi.fn() });
const render = (v: PanelView, on = handlers()) => {
  const host = document.createElement('div');
  document.body.append(host);
  renderPanel(host, v, on);
  return { host, on };
};

describe('renderPanel', () => {
  it('is a labelled dialog with a terminal frame', () => {
    const { host } = render(view());
    expect(host.classList.contains('alius-analyze')).toBe(true);
    expect(host.getAttribute('role')).toBe('dialog');
    expect(host.getAttribute('aria-label')).toBe('Analysis: Trust');
    expect(host.textContent).toContain('┌─[ ANALYSIS ]');
    expect(host.textContent).toContain('└─');
    expect(host.textContent).toContain('Trust');
    expect(host.textContent).toContain('Belief in you.');
  });

  it('analyzing shows the scan line and no text', () => {
    const { host } = render(view({ analyzingMs: 600, wipe: true }));
    expect(host.textContent).toContain('ANALYZING ▒▒▒░░');
    expect(host.textContent).not.toContain('Belief in you.');
    expect(host.querySelector('.alius-analyze-wipe')).not.toBeNull();
    const quick = render(view({ analyzingMs: 150, wipe: false }));
    expect(quick.host.textContent).toContain('ANALYZING');
    expect(quick.host.querySelector('.alius-analyze-wipe')).toBeNull();
  });

  it('text renders links as buttons with their target', () => {
    const { host, on } = render(view({ model: model({ text: 'See [[stress]] and [[items:medkit|the kit]].' }) }));
    const links = [...host.querySelectorAll<HTMLButtonElement>('button.alius-analyze-link')];
    expect(links.map((b) => b.dataset.target)).toEqual(['glossary:stress', 'items:medkit']);
    expect(links.map((b) => b.textContent)).toEqual(['stress', 'the kit']);
    links[1].click();
    expect(on.link).toHaveBeenCalledWith('items:medkit');
  });

  it('content text is never parsed as HTML', () => {
    const evil = '<img src=x onerror="window.__pwned=1"> <b>bold</b> [[<i>x</i>|<u>y</u>]]';
    const { host } = render(view({ model: model({ title: '<script>1</script>', text: evil, long: evil, effects: [evil], see: ['<img>'], reading: { lines: [evil] } }) }));
    expect(host.querySelector('img, b, i, u, script')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(host.getAttribute('aria-label')).toBe('Analysis: <script>1</script>');
  });

  it('no drill-down links at max depth', () => {
    const { host } = render(view({ canDrill: false, model: model({ text: 'See [[stress]].', see: ['cp'] }) }));
    expect(host.querySelector('button.alius-analyze-link')).toBeNull();
    expect(host.textContent).toContain('See stress.');
    expect(host.textContent).toContain('cp');
  });

  it('shows effects, the current reading and see also in their own blocks', () => {
    const { host } = render(view({ model: model({
      long: 'More detail.', effects: ['+20% ATK', 'Apply [[statuses:bleed]]'], reading: { lines: ['Rhea: GUARDED'] }, see: ['stress', 'items:kit'],
    }) }));
    const text = host.textContent!;
    expect(text).toContain('More detail.');
    for (const label of ['EFFECTS', 'CURRENT READING', 'SEE ALSO']) expect(text).toContain(label);
    expect(text.indexOf('EFFECTS')).toBeLessThan(text.indexOf('CURRENT READING'));
    expect(text.indexOf('CURRENT READING')).toBeLessThan(text.indexOf('SEE ALSO'));
    expect(text).toContain('Rhea: GUARDED');
    expect([...host.querySelectorAll<HTMLButtonElement>('.alius-analyze-see button')].map((b) => b.dataset.target)).toEqual(['glossary:stress', 'items:kit']);
    const bare = render(view());
    for (const label of ['EFFECTS', 'CURRENT READING', 'SEE ALSO']) expect(bare.host.textContent).not.toContain(label);
  });

  it('a missing subject reads NO DATA with its address', () => {
    const { host } = render(view({ model: model({ missing: true, title: 'NO DATA', text: 'items:gone', address: 'items:gone' }) }));
    expect(host.textContent).toContain('NO DATA // items:gone');
  });

  it('breadcrumbs call crumb with their index', () => {
    const { host, on } = render(view({ crumbs: ['Trust', 'Stress', 'CP'] }));
    const crumbs = [...host.querySelectorAll<HTMLButtonElement>('.alius-analyze-crumbs button')];
    expect(crumbs.map((b) => b.textContent)).toEqual(['Trust', 'Stress']);
    crumbs[1].click();
    expect(on.crumb).toHaveBeenCalledWith(1);
    crumbs[0].click();
    expect(on.crumb).toHaveBeenCalledWith(0);
    expect(host.querySelector('.alius-analyze-crumbs')!.textContent).toBe('Trust › Stress › CP');
    host.querySelector<HTMLButtonElement>('.alius-analyze-back')!.click();
    expect(on.back).toHaveBeenCalledTimes(1);
  });

  it('a single crumb has no trail and no back button', () => {
    const { host } = render(view());
    expect(host.querySelector('.alius-analyze-crumbs')).toBeNull();
    expect(host.querySelector('.alius-analyze-back')).toBeNull();
  });

  it('pin toggles the label', () => {
    const open = render(view({ pinned: false }));
    const btn = open.host.querySelector<HTMLButtonElement>('.alius-analyze-pin')!;
    expect(btn.textContent).toBe('[PIN]');
    btn.click();
    expect(open.on.pin).toHaveBeenCalledTimes(1);
    const pinned = render(view({ pinned: true }));
    expect(pinned.host.querySelector('.alius-analyze-pin')!.textContent).toBe('[PINNED]');
  });

  it('rendering again replaces the previous content', () => {
    const { host, on } = render(view());
    renderPanel(host, view({ model: model({ title: 'Stress', text: 'Strain.' }), crumbs: ['Stress'] }), on);
    expect(host.textContent).toContain('Strain.');
    expect(host.textContent).not.toContain('Belief in you.');
    expect(host.getAttribute('aria-label')).toBe('Analysis: Stress');
  });
});

describe('analyzeAttrs', () => {
  it('adds ctx only when given', () => {
    expect(analyzeAttrs('glossary:trust')).toEqual({ 'data-analyze': 'glossary:trust', tabindex: '0' });
    expect(analyzeAttrs('glossary:trust', { unitId: 'u1' })).toEqual({
      'data-analyze': 'glossary:trust', 'data-analyze-ctx': '{"unitId":"u1"}', tabindex: '0',
    });
  });

  it('exposes the coverage selector', () => {
    expect(ANALYZE_MARKERS).toBe('.alius-stat, .alius-chip, .alius-option');
  });
});
