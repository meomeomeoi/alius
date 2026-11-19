// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState, GenerationRecord } from '../../src/engine/state/types';
import type { LlmLogEntry } from '../../src/llm/log';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import type { GenerationUi } from '../../src/ui/generation/surface';
import { generationBadge, renderGenerationsSection } from '../../src/ui/shell/generationsSection';
import { renderSysTab } from '../../src/ui/shell/sysTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const rec = (id: string, siteId: string, key: string, over: Partial<GenerationRecord> = {}): GenerationRecord => ({
  id, siteId, key, reason: 'refused', detail: '', attempts: 1, day: 2, slot: 'evening', at: 100, budgetMult: 1, status: 'open', ...over,
});
const withRecords = (...records: GenerationRecord[]): CampaignState => {
  const s = campaign(reg, 4);
  s.generations = { seq: records.length, records };
  return s;
};
const fakeUi = (settings: Partial<typeof DEFAULT_SETTINGS> = {}) => {
  const generations = { retry: vi.fn(async () => ({}) as never), reroll: vi.fn(async () => ({}) as never), rerollState: vi.fn(() => ({ enabled: true })), drop: vi.fn(), useFallback: vi.fn(async () => {}) };
  const ui: GenerationUi = { generations, modal: vi.fn(async () => null), settings: () => ({ ...DEFAULT_SETTINGS, ...settings }), toast: vi.fn(), redraw: vi.fn() };
  return { ui, generations };
};
const draw = (state: CampaignState | null, settings: Partial<typeof DEFAULT_SETTINGS> = {}, debugLog?: LlmLogEntry[]) => {
  const { ui, generations } = fakeUi(settings);
  const host = h('div');
  document.body.append(host);
  renderGenerationsSection(host, { state, ui, debugLog });
  return { host, generations };
};

describe('SYS › GENERATIONS', () => {
  it('lists open and expired records newest first with RETRY, menu and DROP', () => {
    const state = withRecords(
      rec('g1', 'scene.summary', 's1'),
      rec('g2', 'expedition.recap', 'r1', { status: 'expired', reason: 'expired', expiredWhy: 'A newer report came.' }),
      rec('g3', 'dilemma.generate', 'd1', { reason: 'timeout' }),
    );
    const { host, generations } = draw(state);
    const rows = [...host.querySelectorAll('li[data-record]')];
    expect(rows.map((r) => r.getAttribute('data-record'))).toEqual(['g3', 'g2', 'g1']);
    expect([...rows[0].querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['generation-retry', 'generation-menu', 'generation-drop']);
    expect([...rows[1].querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['generation-drop']);
    expect(rows[1].textContent).toContain('After-action recap: A newer report came.');
    (rows[2].querySelector('[data-action="generation-drop"]') as HTMLElement).click();
    expect(generations.drop).toHaveBeenCalledWith('g1');
  });

  it('quiet records are listed but not counted', () => {
    const state = withRecords(rec('g1', 'scene.digest', 's1:4'), rec('g2', 'flavor.grunt', 'unit_dee'), rec('g3', 'scene.summary', 's1'));
    const { host } = draw(state);
    expect(host.querySelectorAll('li[data-record]').length).toBe(3);
    expect(host.querySelector('li[data-record="g1"]')!.textContent).toContain('background');
    expect(host.querySelector('li[data-record="g3"]')!.textContent).not.toContain('background');
    expect(generationBadge(state)).toBe(1);
  });

  it('the badge counts open full records', () => {
    expect(generationBadge(null)).toBe(0);
    expect(generationBadge(campaign(reg, 4))).toBe(0);
    const state = withRecords(
      rec('g1', 'scene.summary', 's1'), rec('g2', 'director.tick', 'q1'),
      rec('g3', 'expedition.recap', 'r1', { status: 'expired', reason: 'expired', expiredWhy: 'x' }), rec('g4', 'scene.digest', 's1:4'),
    );
    expect(generationBadge(state)).toBe(2);
  });

  it('the standing no-profile line shows while there is no profile and no fallback', () => {
    const line = (settings: Partial<typeof DEFAULT_SETTINGS>) => draw(campaign(reg, 4), settings).host.querySelector('.alius-generations-standing');
    expect(line({ mechanicProfileId: '', mechanicFallbackToMain: false })!.textContent).toContain('No mechanic profile is selected');
    expect(line({ mechanicProfileId: '', mechanicFallbackToMain: true })).toBeNull();
    expect(line({ mechanicProfileId: 'p1', mechanicFallbackToMain: false })).toBeNull();
    expect(draw(campaign(reg, 4), { mechanicProfileId: '', mechanicFallbackToMain: false }).host.textContent).toContain('No failed generations.');
  });

  it('debug mode shows the raw text of the matching log entry and nothing without debug', () => {
    const state = withRecords(rec('g1', 'expedition.recap', 'r1', { at: 777 }));
    const log: LlmLogEntry[] = [
      { at: 777, callType: 'expedition_recap', profile: 'main', maxTokens: 700, prompt: 'PROMPT TEXT', raw: "I can't help with that request.", ok: false, ms: 5, reason: 'refused' },
      { at: 777, callType: 'dm_reply', profile: 'main', maxTokens: 300, prompt: 'p', raw: 'WRONG ENTRY', ok: true, ms: 5 },
    ];
    const on = draw(state, { debug: true }, log).host;
    expect(on.querySelector('[data-raw]')!.textContent).toBe("I can't help with that request.");
    expect(on.textContent).not.toContain('PROMPT TEXT');
    expect(on.textContent).not.toContain('WRONG ENTRY');
    expect(draw(state, { debug: false }, log).host.querySelector('[data-raw]')).toBeNull();
  });

  it('no record, no raw text, no state: just the empty line', () => {
    expect(draw(null).host.textContent).toContain('No failed generations.');
  });
});

describe('SYS › Generation settings', () => {
  const sys = () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = h('div');
    document.body.append(host);
    renderSysTab(host, { st, getState: () => campaign(reg, 4), getLoad: () => ({ kind: 'none' }), getRegistries: () => reg, toast: () => {}, modal: async () => null, onSettingsChanged: () => {}, generation: fakeUi().ui });
    return { st, host, input: (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)! };
  };
  const type = (el: HTMLInputElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };

  it('the timeout is in seconds and clamps to 10–600, the retries to 0–2', () => {
    const { st, input } = sys();
    expect(input('llmTimeoutMs').value).toBe('120');
    expect(input('autoRetry').value).toBe('1');
    type(input('llmTimeoutMs'), '30');
    expect(getSettings(st).llmTimeoutMs).toBe(30000);
    type(input('llmTimeoutMs'), '5');
    expect(getSettings(st).llmTimeoutMs).toBe(30000); // refused: it snaps back to what is stored
    expect(input('llmTimeoutMs').value).toBe('30');
    type(input('llmTimeoutMs'), '601');
    expect(getSettings(st).llmTimeoutMs).toBe(30000);
    type(input('autoRetry'), '2');
    expect(getSettings(st).autoRetry).toBe(2);
    type(input('autoRetry'), '3');
    expect(getSettings(st).autoRetry).toBe(2);
    type(input('autoRetry'), '0');
    expect(getSettings(st).autoRetry).toBe(0);
  });

  it('both rows carry data-analyze and the list is part of the tab', () => {
    const { host } = sys();
    for (const name of ['llmTimeoutMs', 'autoRetry']) expect(host.querySelector(`label[data-analyze="setting:${name}"]`), name).not.toBeNull();
    expect(host.querySelector('.alius-generations')).not.toBeNull();
  });
});
