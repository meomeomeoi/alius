// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { renderEndScreen } from '../../src/ui/warden/endScreen';
import { h } from '../../src/ui/dom';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const closed = (epilogue?: string): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')],
    mode: { kind: 'leashswap', deathRule: 'campaign_end', warden: { by: 'player', index: 0 } },
  }, reg, { desireBondDefects: false, seed: 3 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  out.state.ended = { day: 7, cause: 'terminated', ...(epilogue ? { epilogue } : {}) };
  return out.state;
};

describe('renderEndScreen', () => {
  it('shows the epilogue and only EXPORT', () => {
    const host = h('div');
    document.body.append(host);
    const onExport = vi.fn();
    renderEndScreen(host, closed('The squad held the gate.'), { onExport });
    expect(host.textContent).toContain('CAMPAIGN CLOSED');
    expect(host.textContent).toContain('The squad held the gate.');
    expect(host.textContent).toContain('Day 7');
    expect(host.querySelector('[data-voice="corporate"]')).not.toBeNull();
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('data-action'))).toEqual(['export']);
    buttons[0].click();
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('says the epilogue is being written while there is none', () => {
    const host = h('div');
    renderEndScreen(host, closed(), { onExport: vi.fn() });
    expect(host.textContent).toMatch(/being written|writing/i);
  });

  it('shows the epilogue as text, never as markup', () => {
    const host = h('div');
    renderEndScreen(host, closed('<img src=x onerror=alert(1)>'), { onExport: vi.fn() });
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x');
  });

  it('draws nothing for a running campaign', () => {
    const host = h('div');
    const s = closed();
    delete s.ended;
    renderEndScreen(host, s, { onExport: vi.fn() });
    expect(host.childElementCount).toBe(0);
  });
});
