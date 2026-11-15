// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { h } from '../../src/ui/dom';
import { renderContentSection } from '../../src/ui/bonds/content';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const COPY = 'CONTENT — nothing here appears unless you turn it on. Turning it on is your consent for the story to go there.';
function draw(enabled: string[] = [], registries = reg) {
  const host = h('div');
  document.body.append(host);
  const onChange = vi.fn();
  renderContentSection(host, { enabled, registries, onChange });
  const row = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-category="${id}"]`)!;
  return { host, onChange, row, rows: () => [...host.querySelectorAll<HTMLButtonElement>('button[data-category]')] };
}

describe('renderContentSection (P9d)', () => {
  it('shows the heading copy and all nine categories in order, each off, with its label and description', () => {
    const v = draw();
    expect(v.host.querySelector('h3')!.textContent).toBe(COPY);
    expect(v.rows().map((r) => r.dataset.category)).toEqual([...reg.contentCategories.keys()]);
    expect(v.rows()).toHaveLength(9);
    for (const r of v.rows()) {
      const c = reg.contentCategories.get(r.dataset.category!)!;
      expect(r.getAttribute('aria-pressed'), r.dataset.category).toBe('false');
      expect(r.textContent).toContain(String(c.label));
      expect(r.textContent).toContain(String(c.description));
    }
  });

  it('a custom title replaces the heading', () => {
    const host = h('div');
    document.body.append(host);
    renderContentSection(host, { enabled: [], registries: reg, onChange: vi.fn(), title: 'Content' });
    expect(host.querySelector('h3')!.textContent).toBe('Content');
  });

  it('marks the enabled ones and ignores an unknown id', () => {
    const v = draw(['restraint', 'not_a_category']);
    expect(v.row('restraint').getAttribute('aria-pressed')).toBe('true');
    expect(v.row('humiliation').getAttribute('aria-pressed')).toBe('false');
  });

  it('a click reports the whole new list in registry order', () => {
    const v = draw(['restraint']);
    v.row('humiliation').click();
    expect(v.onChange).toHaveBeenLastCalledWith(['humiliation', 'restraint']);
    v.row('restraint').click();
    expect(v.onChange).toHaveBeenLastCalledWith([]);
  });

  it('every row carries data-analyze for its category', () => {
    const v = draw();
    for (const r of v.rows()) expect(r.getAttribute('data-analyze')).toBe(`contentCategories:${r.dataset.category}`);
  });

  it('is text only: markup in a label or description stays text', () => {
    const r2 = structuredClone(reg);
    r2.contentCategories.set('restraint', { ...r2.contentCategories.get('restraint')!, label: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' });
    const v = draw([], r2);
    expect(v.host.querySelectorAll('img, b')).toHaveLength(0);
    expect(v.row('restraint').textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('says so when the pack has no categories', () => {
    const r2 = structuredClone(reg);
    r2.contentCategories = new Map();
    const v = draw([], r2);
    expect(v.rows()).toHaveLength(0);
    expect(v.host.textContent).toContain('no content categories');
  });
});
