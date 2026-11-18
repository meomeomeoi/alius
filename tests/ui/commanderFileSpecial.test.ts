// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { CommanderSetup } from '../../src/engine/commander/profile';
import { h } from '../../src/ui/dom';
import { renderCommanderFile } from '../../src/ui/commander/commanderFile';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const setup = (special?: string): CommanderSetup => ({
  body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [], ...(special ? { special } : {}) },
});
function render(value: CommanderSetup, corporationId: string | null = null) {
  const host = h('div');
  document.body.append(host);
  renderCommanderFile(host, { value, registries: reg, desireBondDefects: false, corporationId, onChange: vi.fn() });
  return host;
}

describe('WHAT THIS CHANGES', () => {
  it('a special card shows WHAT THIS CHANGES with every line and data-analyze', () => {
    const host = render(setup('secret_frequency'));
    const box = host.querySelector<HTMLElement>('details[data-trait-changes="secret_frequency"]')!;
    expect(box).not.toBeNull();
    expect(box.getAttribute('data-analyze')).toBe('commanderTraits:secret_frequency');
    expect(box.querySelector('summary')!.textContent).toBe('WHAT THIS CHANGES');
    const lines = [...box.querySelectorAll('li')].map((li) => li.textContent);
    expect(lines).toEqual(reg.commanderTraits.get('secret_frequency')!.changes);
    // the list is beside the card, never inside the button
    expect(host.querySelector('button[data-trait="secret_frequency"] details')).toBeNull();
  });

  it('the list is open while its card is pressed and closed otherwise', () => {
    expect(render(setup('secret_frequency')).querySelector('details[data-trait-changes="secret_frequency"]')!.hasAttribute('open')).toBe(true);
    const other = render(setup('secret_frequency'));
    expect(other.querySelector('details[data-trait-changes="bloom_paranoia"]')!.hasAttribute('open')).toBe(false);
  });

  it('every special card has one, and regular cards have none; nothing is unaddressed', () => {
    const host = render(setup());
    for (const id of ['secret_frequency', 'bloom_paranoia', 'web_of_debts']) expect(host.querySelector(`details[data-trait-changes="${id}"]`), id).not.toBeNull();
    expect(host.querySelector('details[data-trait-changes="insomniac"]')).toBeNull();
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: null, settings: {} as never })).toEqual([]);
  });

  it('web_of_debts is greyed (aria-disabled) when no rival corporation exists', () => {
    const alone = { ...reg, corporations: new Map([['vesper', reg.corporations.get('vesper')!]]) } as Registries;
    const host = h('div');
    document.body.append(host);
    renderCommanderFile(host, { value: setup(), registries: alone, desireBondDefects: false, corporationId: 'vesper', onChange: vi.fn() });
    const card = host.querySelector('button[data-trait="web_of_debts"]')!;
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.getAttribute('title')).toBe('Needs a rival corporation in the world.');
  });
});
