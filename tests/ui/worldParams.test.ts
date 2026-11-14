// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { Wizard } from '../../src/setup/wizard';
import { h } from '../../src/ui/dom';
import { renderWorldParams } from '../../src/ui/setup/worldParams';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => {
  document.body.innerHTML = '';
});

function make() {
  const wizard = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn() as never, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
  const host = h('div');
  document.body.append(host);
  const draw = () => renderWorldParams(host, { wizard, registries: reg });
  wizard.subscribe(draw);
  draw();
  return { wizard, host };
}
const qa = (host: HTMLElement, sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const card = (host: HTMLElement, option: string, choice: string) => host.querySelector<HTMLElement>(`.alius-world-choice[data-option="${option}"][data-id="${choice}"]`)!;

describe('the WORLD PARAMETERS screen', () => {
  it('world step renders every option and marks the chosen card', () => {
    const { host } = make();
    for (const option of reg.worldOptions.values()) {
      const cards = qa(host, `.alius-world-choice[data-option="${option.id}"]`);
      expect(cards.map((c) => c.dataset.id), String(option.id)).toEqual((option.choices as Array<{ id: string }>).map((c) => c.id));
      const pressed = cards.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.id);
      expect(pressed, String(option.id)).toEqual(['guarded', 'indifferent', 'tolerated', 'standard', 'restrained', 'grim'].filter((id) => cards.some((c) => c.dataset.id === id)));
    }
    expect(host.textContent).toContain('WORLD PARAMETERS');
    // grouped by option group, in registry order, with the option's label and description
    expect(qa(host, 'h3').map((e) => e.textContent)).toEqual(expect.arrayContaining(['SOCIETY', 'CORPORATION', 'PRESENTATION', 'SOLDIERS']));
    expect(host.textContent).toContain('Disposition of the squad');
  });

  it('every card is marked for analysis: worldOptions:<id> with the choice in the context', () => {
    const { host } = make();
    const c = card(host, 'oversight', 'brutal');
    expect(c.getAttribute('data-analyze')).toBe('worldOptions:oversight');
    expect(JSON.parse(c.getAttribute('data-analyze-ctx')!)).toEqual({ choice: 'brutal' });
    for (const p of reg.worldPresets.keys()) expect(host.querySelector(`.alius-world-preset[data-id="${p}"]`)!.getAttribute('data-analyze')).toBe(`worldPresets:${p}`);
  });

  it('a card click selects the choice and the screen follows', () => {
    const { wizard, host } = make();
    card(host, 'disposition', 'volatile').click();
    expect(wizard.state.world.options.disposition).toBe('volatile');
    expect(card(host, 'disposition', 'volatile').getAttribute('aria-pressed')).toBe('true');
    expect(card(host, 'disposition', 'guarded').getAttribute('aria-pressed')).toBe('false');
  });

  it('a preset click selects its choices', () => {
    const { wizard, host } = make();
    host.querySelector<HTMLElement>('.alius-world-preset[data-id="brutal"]')!.click();
    expect(wizard.state.world.preset).toBe('brutal');
    expect(card(host, 'disposition', 'hazardous').getAttribute('aria-pressed')).toBe('true');
    expect(card(host, 'gender_norms', 'corporate_machismo').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.alius-world-preset[data-id="brutal"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.alius-world-preset[data-id="standard"]')!.getAttribute('aria-pressed')).toBe('false');
    card(host, 'tone', 'grim').click();
    expect(host.querySelector('.alius-world-preset[data-id="brutal"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('locked options show the lock, the live one says it can change', () => {
    const { host } = make();
    for (const option of reg.worldOptions.values()) {
      const head = host.querySelector(`.alius-world-option[data-option="${option.id}"]`)!;
      const lock = head.querySelector('.alius-lock');
      expect(lock, String(option.id)).not.toBeNull();
      expect(lock!.textContent).toBe(option.live === true ? 'CHANGEABLE LATER' : 'LOCKED AT START');
      expect(lock!.getAttribute('data-live')).toBe(String(option.live === true));
    }
  });

  it('"What this changes" lists the descriptions of the non-default choices, without numbers', () => {
    const { wizard, host } = make();
    expect(host.querySelector('.alius-world-summary')!.textContent).toContain('Nothing differs');
    wizard.applyPreset('brutal');
    const items = qa(host, '.alius-world-summary li').map((li) => li.textContent!);
    expect(items).toEqual(wizard.worldSummary());
    expect(items).toHaveLength(6);
    for (const t of items) expect(t).not.toMatch(/\d/);
    // the screen is a meta screen: no fiction voice, no pronoun for the commander
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('options with the same group share one heading', () => {
    const { host } = make();
    expect(qa(host, 'h3').filter((e) => e.textContent === 'SOCIETY')).toHaveLength(1);
    expect(qa(host, 'h3').filter((e) => e.textContent === 'PRESENTATION')).toHaveLength(1);
  });
});
