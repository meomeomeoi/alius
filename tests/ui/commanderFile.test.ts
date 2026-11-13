// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { DESCRIPTORS, type CommanderSetup } from '../../src/engine/commander/profile';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderCommanderFile, type CommanderFileCtx } from '../../src/ui/commander/commanderFile';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const setup = (over: Partial<CommanderSetup> = {}): CommanderSetup => ({
  body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [] }, ...over,
});
function render(value: CommanderSetup = setup(), extra: Partial<CommanderFileCtx> = {}) {
  const host = h('div');
  document.body.append(host);
  const onChange = vi.fn();
  renderCommanderFile(host, { value, registries: reg, desireBondDefects: false, onChange, ...extra });
  const stat = (k: string) => host.querySelector<HTMLElement>(`.alius-stat[data-analyze="glossary:body_${k}"]`)!;
  const btn = (sel: string) => host.querySelector<HTMLButtonElement>(sel)!;
  const trait = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-trait="${id}"]`)!;
  return { host, onChange, stat, btn, trait };
}
const env = (): AnalyzeEnv => ({ registries: reg, state: null, settings: DEFAULT_SETTINGS });

describe('commander file form', () => {
  it('the commander step shows descriptors, never stat numbers', () => {
    const { host } = render();
    const stats = [...host.querySelectorAll<HTMLElement>('.alius-stat')];
    expect(stats.length).toBeGreaterThanOrEqual(3);
    const allowed = new Set(Object.values(DESCRIPTORS).flat());
    for (const el of stats) {
      expect(allowed.has(el.textContent!.trim()), el.textContent!).toBe(true);
      expect(el.textContent).not.toMatch(/\d/);
    }
    expect(host.querySelector('[data-analyze="glossary:body_strength"]')!.textContent).toBe('Average');
    expect(host.querySelector('[data-analyze="glossary:body_endurance"]')!.textContent).toBe('Average');
    expect(host.querySelector('[data-analyze="glossary:body_reflexes"]')!.textContent).toBe('Slow');
  });

  it('shows POINTS LEFT as a creation budget', () => {
    expect(render(setup()).host.textContent).toContain('POINTS LEFT 2'); // 3/3/2 spends 5 of 7
    expect(render(setup({ body: { strength: 4, endurance: 4, reflexes: 2 } })).host.textContent).toContain('POINTS LEFT 0');
    expect(render(setup({ body: { strength: 1, endurance: 1, reflexes: 1 } })).host.textContent).toContain('POINTS LEFT 7');
  });

  it('+ is disabled at 4 and with no points left; − is disabled at 1', () => {
    const a = render(setup({ body: { strength: 4, endurance: 1, reflexes: 1 } }));
    expect(a.btn('button[data-body="strength"][data-step="+"]').disabled).toBe(true); // at the creation cap
    expect(a.btn('button[data-body="endurance"][data-step="+"]').disabled).toBe(false);
    expect(a.btn('button[data-body="endurance"][data-step="-"]').disabled).toBe(true); // at 1
    expect(a.btn('button[data-body="strength"][data-step="-"]').disabled).toBe(false);
    const spent = render(setup({ body: { strength: 4, endurance: 4, reflexes: 2 } }));
    expect(spent.btn('button[data-body="reflexes"][data-step="+"]').disabled).toBe(true); // no points left
    expect(spent.btn('button[data-body="reflexes"][data-step="-"]').disabled).toBe(false);
  });

  it('+ and − send a body patch', () => {
    const m = render();
    m.btn('button[data-body="strength"][data-step="+"]').click();
    expect(m.onChange).toHaveBeenLastCalledWith({ kind: 'body', stat: 'strength', value: 4 });
    m.btn('button[data-body="reflexes"][data-step="-"]').click();
    expect(m.onChange).toHaveBeenLastCalledWith({ kind: 'body', stat: 'reflexes', value: 1 });
  });

  it('the archetype label follows the body', () => {
    const label = (b: CommanderSetup['body']) => render(setup({ body: b })).host.querySelector('[data-analyze="glossary:archetype"]')!.textContent!;
    expect(label({ strength: 1, endurance: 1, reflexes: 1 })).toContain('frail');
    expect(label({ strength: 2, endurance: 2, reflexes: 2 })).toContain('slight');
    expect(label({ strength: 3, endurance: 3, reflexes: 2 })).toContain('average');
    expect(label({ strength: 4, endurance: 3, reflexes: 3 })).toContain('fit');
    expect(label({ strength: 4, endurance: 4, reflexes: 4 })).toContain('fit'); // 13 only through growth
    for (const text of ['frail', 'slight']) expect(label(text === 'frail' ? { strength: 1, endurance: 1, reflexes: 1 } : { strength: 2, endurance: 2, reflexes: 1 })).not.toMatch(/\d/);
  });

  it('expression and seasoning are descriptor buttons; the current one is pressed', () => {
    const m = render(setup({ expression: 4, seasoning: 2 }));
    const exp = [...m.host.querySelectorAll<HTMLButtonElement>('button[data-expression]')];
    expect(exp.map((b) => b.textContent)).toEqual([...DESCRIPTORS.expression]);
    expect(exp.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    const sea = [...m.host.querySelectorAll<HTMLButtonElement>('button[data-seasoning]')];
    expect(sea.map((b) => b.textContent)).toEqual([...DESCRIPTORS.seasoning]);
    expect(sea[1].getAttribute('aria-pressed')).toBe('true');
    exp[0].click();
    expect(m.onChange).toHaveBeenLastCalledWith({ kind: 'expression', value: 1 });
    sea[4].click();
    expect(m.onChange).toHaveBeenLastCalledWith({ kind: 'seasoning', value: 5 });
  });

  it('trait cards show upside and downside, toggle and mark the chosen ones', () => {
    const m = render(setup({ traits: { regular: ['old_wound'] } }));
    const cards = [...m.host.querySelectorAll<HTMLButtonElement>('button[data-trait]')];
    expect(cards).toHaveLength(reg.commanderTraits.size);
    expect(m.trait('old_wound').getAttribute('aria-pressed')).toBe('true');
    expect(m.trait('insomniac').getAttribute('aria-pressed')).toBe('false');
    expect(m.trait('old_wound').textContent).toContain(String(reg.commanderTraits.get('old_wound')!.upside));
    expect(m.trait('old_wound').textContent).toContain(String(reg.commanderTraits.get('old_wound')!.downside));
    m.trait('insomniac').click();
    expect(m.onChange).toHaveBeenLastCalledWith({ kind: 'trait', id: 'insomniac' });
  });

  it('a third regular trait is disabled; chosen ones stay enabled to be dropped; the special one is separate', () => {
    const m = render(setup({ traits: { regular: ['old_wound', 'insomniac'] } }));
    // soft-disabled (aria-disabled): still focusable and hoverable, so the analysis panel can explain the trait
    expect(m.trait('bookish').disabled).toBe(false);
    expect(m.trait('bookish').getAttribute('aria-disabled')).toBe('true');
    expect(m.trait('bookish').title).toMatch(/two regular/i);
    m.trait('bookish').click();
    expect(m.onChange).not.toHaveBeenCalled();
    expect(m.trait('old_wound').disabled).toBe(false);
    expect(m.trait('vow_of_distance').disabled).toBe(false);
    expect(m.trait('vow_of_distance').textContent).toMatch(/SPECIAL/);
  });

  it('an exclusive trait is disabled with the reason', () => {
    const m = render(setup({ traits: { regular: ['corporate_polish'] } }));
    expect(m.trait('street_raised').getAttribute('aria-disabled')).toBe('true');
    expect(m.trait('street_raised').title).toMatch(/Corporate Polish/);
  });

  it('PREFILL and RANDOM appear only with callbacks and call them', () => {
    expect(render().host.querySelector('button[data-action="prefill"]')).toBeNull();
    const onPrefill = vi.fn();
    const onRandom = vi.fn();
    const m = render(setup(), { onPrefill, onRandom });
    expect(m.btn('button[data-action="prefill"]').textContent).toBe('PREFILL FROM PERSONA');
    expect(m.btn('button[data-action="random"]').textContent).toBe('RANDOM COMMANDER');
    m.btn('button[data-action="prefill"]').click();
    m.btn('button[data-action="random"]').click();
    expect([onPrefill.mock.calls.length, onRandom.mock.calls.length]).toEqual([1, 1]);
  });

  it('the import status and the reasons of the chosen traits are shown', () => {
    const loading = render(setup(), { onPrefill: vi.fn(), importStatus: { status: 'loading', reasons: {} } });
    expect(loading.host.textContent).toMatch(/READING THE PERSONA/);
    expect(loading.btn('button[data-action="prefill"]').disabled).toBe(true);
    const manual = render(setup(), { importStatus: { status: 'manual', notice: 'the persona has no description', reasons: {} } });
    expect(manual.host.textContent).toContain('MANUAL — the persona has no description');
    const ready = render(setup({ traits: { regular: ['old_wound'] } }), { importStatus: { status: 'ready', source: 'Mara Vale', notes: 'A scarred, quiet officer.', reasons: { old_wound: 'A limp from an old fight.', bookish: 'unused' } } });
    expect(ready.host.textContent).toContain('PREFILLED from the persona "Mara Vale"');
    expect(ready.host.textContent).toContain('Note: A scarred, quiet officer.');
    expect(ready.host.textContent).toContain('A limp from an old fight.');
    expect(ready.host.textContent).not.toContain('unused'); // only chosen traits carry a reason
  });

  it('every marked element resolves and is reachable', () => {
    const m = render(setup({ traits: { regular: ['old_wound'], special: 'vow_of_distance' } }), { onPrefill: vi.fn(), onRandom: vi.fn() });
    expect(markedWithout(m.host)).toEqual([]);
    expect(unresolved(m.host, env())).toEqual([]);
    expect(unreachable(m.host)).toEqual([]);
    expect(m.host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(20);
  });

  it('text from content goes in as text, never as markup', () => {
    const evil: Registries = { ...reg, commanderTraits: new Map([['evil', { id: 'evil', name: '<img src=x onerror=alert(1)>', kind: 'regular', upside: '<b>u</b>', downside: 'd', effects: [], description: 'x' } as never]]) };
    const host = h('div');
    document.body.append(host);
    renderCommanderFile(host, { value: setup(), registries: evil, desireBondDefects: false, onChange: vi.fn() });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('wording', () => {
  it('the form names no pronoun for the commander', () => {
    const text = render(setup(), { onPrefill: vi.fn(), onRandom: vi.fn() }).host.textContent!;
    expect(text).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});
