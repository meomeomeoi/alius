// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import { renderRevealCard } from '../../src/ui/warden/revealCard';
import { h } from '../../src/ui/dom';
import { loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { document.body.innerHTML = ''; });

const swap = () => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea')],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 3 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};

describe('renderRevealCard', () => {
  it('is a corporate card naming her, with an acknowledge button and data-analyze', () => {
    const host = h('div');
    document.body.append(host);
    const onAck = vi.fn();
    renderRevealCard(host, swap(), reg, onAck);
    expect(host.querySelector('.alius-voice-corporate, [data-voice="corporate"]')).not.toBeNull();
    expect(host.textContent).toContain('WARDEN ASSIGNED');
    expect(host.textContent).toContain('Bea');
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    for (const el of host.querySelectorAll('.alius-stat, .alius-chip, .alius-option')) expect(el.getAttribute('data-analyze')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('button[data-action="ack-reveal"]')!.click();
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('draws nothing when the reveal is not pending (default mode, or already acknowledged)', () => {
    const host = h('div');
    const s = swap();
    s.leashswap!.revealed = true;
    renderRevealCard(host, s, reg, vi.fn());
    expect(host.childElementCount).toBe(0);
    const plain = swap();
    delete plain.leashswap;
    renderRevealCard(host, plain, reg, vi.fn());
    expect(host.childElementCount).toBe(0);
  });
});
