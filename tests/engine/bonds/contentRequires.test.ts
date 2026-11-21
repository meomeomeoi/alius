// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Registries } from '../../../src/content/types';
import { categoryRequires, enabledCategories, setCategories } from '../../../src/engine/bonds';
import { h } from '../../../src/ui/dom';
import { renderContentSection } from '../../../src/ui/bonds/content';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';

void enable; // the bonds helper pulls in the whole action table
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const NEW = ['worship', 'breath_play', 'bodily_fluids', 'watersports', 'service', 'denial', 'exposure_risk', 'pet_play', 'objectification', 'deprivation', 'strap', 'her_anatomy', 'feminization'];

describe('thirteen new categories (P15a R3)', () => {
  it('the registry has 22, the new ones last and in order, and none is enabled in a new campaign', () => {
    const ids = [...reg.contentCategories.keys()];
    expect(ids).toHaveLength(22);
    expect(ids.slice(9)).toEqual(NEW);
    const orders = [...reg.contentCategories.values()].map((c) => Number(c.order));
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(22);
    expect(enabledCategories(campaign(reg, 4))).toEqual([]);
  });

  it('every new category has an AUTHOR TO WRITE description and a short label', () => {
    for (const id of NEW) {
      const c = reg.contentCategories.get(id)!;
      expect(String(c.description), id).toMatch(/^AUTHOR TO WRITE: /);
      expect(String(c.label).length, id).toBeLessThanOrEqual(40);
    }
  });
});

describe('requires', () => {
  it('watersports needs bodily_fluids; it is the only row that requires anything', () => {
    expect(categoryRequires(reg, 'watersports')).toEqual(['bodily_fluids']);
    expect(categoryRequires(reg, 'worship')).toEqual([]);
    expect(categoryRequires(reg, 'nope')).toEqual([]);
    const withRequires = [...reg.contentCategories.values()].filter((c) => categoryRequires(reg, String(c.id)).length > 0);
    expect(withRequires.map((c) => String(c.id))).toEqual(['watersports']);
  });

  it('setCategories drops a category whose requirement is off, and a switch-off takes the dependant with it', () => {
    const s = campaign(reg, 4);
    expect(setCategories(s, reg, ['watersports'])).toEqual([]);
    expect(enabledCategories(s)).toEqual([]);

    const both = setCategories(s, reg, ['watersports', 'bodily_fluids']);
    expect(enabledCategories(s)).toEqual(['bodily_fluids', 'watersports']);
    expect(both).toEqual([{ type: 'content_changed', added: ['bodily_fluids', 'watersports'], removed: [] }]);

    const off = setCategories(s, reg, ['watersports']);
    expect(enabledCategories(s)).toEqual([]);
    expect(off).toEqual([{ type: 'content_changed', added: [], removed: ['bodily_fluids', 'watersports'] }]);
    expect(off[0]!.removed).toContain('watersports');
  });

  it('through the action: content_changed lists both when the requirement goes off', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['bodily_fluids', 'watersports', 'restraint'] } });
    expect(errors(r.events)).toEqual([]);
    expect(enabledCategories(r.state)).toEqual(['restraint', 'bodily_fluids', 'watersports']);
    const r2 = run(r.state, reg, { type: 'content/set_categories', payload: { enabled: ['watersports', 'restraint'] } });
    expect(enabledCategories(r2.state)).toEqual(['restraint']);
    expect(ofType(r2.events, 'content_changed')).toEqual([{ type: 'content_changed', added: [], removed: ['bodily_fluids', 'watersports'] }]);
  });

  it('a chained requirement is followed (a needs b needs c)', async () => {
    const r = await withCategories([
      { id: 'cat_a', label: 'A', description: 'a', order: 91, requires: ['cat_b'] },
      { id: 'cat_b', label: 'B', description: 'b', order: 92, requires: ['cat_c'] },
      { id: 'cat_c', label: 'C', description: 'c', order: 93 },
    ]);
    expect(r.errors).toEqual([]);
    const s = campaign(r.registries, 4);
    setCategories(s, r.registries, ['cat_a', 'cat_b']);
    expect(enabledCategories(s)).toEqual([]);
    setCategories(s, r.registries, ['cat_a', 'cat_b', 'cat_c']);
    expect(enabledCategories(s)).toEqual(['cat_a', 'cat_b', 'cat_c']);
  });
});

describe('the toggle', () => {
  function draw(enabled: string[]) {
    const host = h('div');
    document.body.append(host);
    const onChange = vi.fn();
    renderContentSection(host, { enabled, registries: reg, onChange });
    return { onChange, row: (id: string) => host.querySelector<HTMLButtonElement>(`button[data-category="${id}"]`)! };
  }

  it('is aria-disabled with its reason while the requirement is off, and a click does nothing', () => {
    const v = draw([]);
    const row = v.row('watersports');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('title')).toBe('needs Bodily fluids');
    expect(row.textContent).toContain('needs Bodily fluids');
    row.click();
    expect(v.onChange).not.toHaveBeenCalled();
    expect(row.getAttribute('data-analyze')).toBe('contentCategories:watersports');
  });

  it('is a normal toggle once the requirement is on, and the others never were disabled', () => {
    const v = draw(['bodily_fluids']);
    const row = v.row('watersports');
    expect(row.getAttribute('aria-disabled')).toBeNull();
    row.click();
    expect(v.onChange).toHaveBeenLastCalledWith(['bodily_fluids', 'watersports']);
    expect(v.row('worship').getAttribute('aria-disabled')).toBeNull();
  });

  it('turning the requirement off reports a list without the dependant', () => {
    const v = draw(['bodily_fluids', 'watersports']);
    v.row('bodily_fluids').click();
    expect(v.onChange).toHaveBeenLastCalledWith([]);
  });
});

async function withCategories(rows: unknown[]) {
  const mem: Record<string, unknown> = {
    'mem/manifest.json': { id: 'mem', name: 'Mem', version: '1', priority: 5, files: { contentCategories: 'cats.json' } },
    'mem/cats.json': rows,
  };
  return loadPacks(['content/core', 'mem'], async (p) => (p in mem ? mem[p] : read(p)));
}

describe('content checks', () => {
  it('an unknown requires is a content error', async () => {
    const r = await withCategories([{ id: 'cat_x', label: 'X', description: 'x', order: 90, requires: ['no_such_category'] }]);
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/requires: unknown content category "no_such_category"/);
  });

  it('a cyclic requires is a content error', async () => {
    const r = await withCategories([
      { id: 'cat_a', label: 'A', description: 'a', order: 91, requires: ['cat_b'] },
      { id: 'cat_b', label: 'B', description: 'b', order: 92, requires: ['cat_a'] },
    ]);
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/requires: cycle/);
  });

  it('a category requiring itself is a cycle', async () => {
    const r = await withCategories([{ id: 'cat_self', label: 'S', description: 's', order: 90, requires: ['cat_self'] }]);
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/requires: cycle/);
  });
});
