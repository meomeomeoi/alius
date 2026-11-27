// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSysTab } from '../../../src/ui/shell/sysTab';
import { markedWithout, unresolved } from '../../helpers/analyzeCoverage';
import { campaign, loadCore } from '../../helpers/world';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { DEFAULT_SETTINGS } from '../../../src/settings';

/** P16b, Task 13: the two games have their rows in SYS beside the contact interactions: each switches off, carries `data-analyze` and resolves (P7a). */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { document.body.innerHTML = ''; });

function draw() {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const state = campaign(reg, 4);
  const host = document.createElement('div');
  document.body.append(host);
  renderSysTab(host, { st, getState: () => state, getLoad: () => ({ kind: 'none' }), getRegistries: () => reg, dispatch: vi.fn(() => []), toast: () => {}, modal: async () => null, onSettingsChanged: () => {} });
  return { host, st, state };
}
const box = (host: HTMLElement, key: string) => host.querySelector<HTMLInputElement>(`input[name="physicsInteractions:${key}"]`)!;

describe('SYS: the toggles of the two games', () => {
  it('each has a row, on by default, in the games\' own words', () => {
    const { host } = draw();
    for (const key of ['posture', 'provocation']) {
      expect(box(host, key), key).not.toBeNull();
      expect(box(host, key).checked, key).toBe(true);
    }
    const labels = [...host.querySelectorAll('.alius-field-label')].map((l) => l.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Game: the game of postures', 'Game: stillness under provocation', 'Contact: timing']));
  });

  it('switching one off is kept in the settings and leaves the contact interactions alone', () => {
    const { host, st } = draw();
    const el = box(host, 'posture');
    el.checked = false;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getSettings(st).physicsInteractions).toMatchObject({ posture: false, provocation: true, timing: true });
  });

  it('the rows mark themselves for the analysis tool and resolve', () => {
    const { host, state } = draw();
    const row = box(host, 'posture').closest('label')!;
    expect(row.getAttribute('data-analyze')).toBe('setting:physicsInteractions');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { state, registries: reg, settings: { ...DEFAULT_SETTINGS } } as unknown as AnalyzeEnv)).toEqual([]);
  });
});
