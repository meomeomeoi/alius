// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Registries } from '../../../src/content/types';
import { developmentMode } from '../../../src/engine/development/state';
import { buildCampaign } from '../../../src/engine/setup';
import { Wizard } from '../../../src/setup/wizard';
import { h } from '../../../src/ui/dom';
import { renderWorldParams } from '../../../src/ui/setup/worldParams';
import { markedWithout } from '../../helpers/analyzeCoverage';
import { unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
afterEach(() => { document.body.innerHTML = ''; });

function make() {
  const wizard = new Wizard({ registries: reg, desireBondDefects: false, importer: vi.fn() as never, onChange: () => {} }, { personaName: 'Vale', canBindCurrent: false });
  wizard.setStart('start_vesper');
  const host = h('div');
  document.body.append(host);
  const draw = () => renderWorldParams(host, { wizard, registries: reg });
  wizard.subscribe(draw);
  draw();
  return { wizard, host };
}
const select = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('select[name="characterDevelopment"]')!;

describe('WORLD PARAMETERS: CHARACTER DEVELOPMENT', () => {
  it('the select defaults to normal and is analyzable', () => {
    const { host, wizard } = make();
    expect(select(host).value).toBe('normal');
    expect([...select(host).options].map((o) => o.value)).toEqual(['off', 'slow', 'normal']);
    expect(select(host).closest('[data-analyze]')!.getAttribute('data-analyze')).toBe('glossary:character_development');
    expect(wizard.state.development).toBe('normal');
    expect(markedWithout(host.querySelector('.alius-character-development') as HTMLElement)).toEqual([]);
  });

  it('a change writes the field, the text follows, and the screen keeps the choice', () => {
    const { host, wizard } = make();
    select(host).value = 'off';
    select(host).dispatchEvent(new Event('change'));
    expect(wizard.state.development).toBe('off');
    expect(select(host).value).toBe('off');
    expect(host.querySelector('[data-development-text]')!.getAttribute('data-development-text')).toBe('off');
    wizard.setDevelopment('fast' as never);
    expect(wizard.state.development).toBe('off'); // an unknown value is ignored
  });

  it('the result carries the mode, and the campaign built from it stores it', () => {
    const { wizard } = make();
    for (const mode of ['normal', 'slow', 'off'] as const) {
      wizard.setDevelopment(mode);
      const r = { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [unitSetup('Ann')], characterDevelopment: wizard.state.development };
      const built = buildCampaign(r, reg, { desireBondDefects: false, seed: 3 });
      if (!built.ok) throw new Error(built.errors.join('; '));
      expect(built.state.settings.characterDevelopment).toBe(mode);
      expect(developmentMode(built.state)).toBe(mode);
    }
  });
});
