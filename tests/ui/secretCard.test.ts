// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { addSecret } from '../../src/engine/personal/secrets';
import { personalOf } from '../../src/engine/personal/state';
import type { CampaignState, SquadSecret } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderSecretCard } from '../../src/ui/personal/secretCard';
import { VOICE_OF } from '../../src/ui/voice/sources';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { ANN, BEA, loadCore, plain } from '../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: false } });
function found(): { s: CampaignState; x: SquadSecret } {
  const s = plain(reg);
  addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [ANN, BEA], subjectId: ANN, vars: { name: 'Ann' } });
  const x = personalOf(s).secrets![0];
  x.status = 'found';
  x.foundRoute = 'slip';
  return { s, x };
}

describe('the secret card', () => {
  it('is a paper card with the three answers, each marked for analysis (acceptance 5)', () => {
    expect(VOICE_OF.squad_secret).toBe('paper');
    const { s, x } = found();
    const onChoose = vi.fn();
    const card = renderSecretCard(s, reg, x, onChoose);
    document.body.append(card);
    expect(card.querySelector('[data-voice="paper"]')).not.toBeNull();
    const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['[ CONFRONT EVERYONE ]', '[ PRETEND NOT TO KNOW ]', '[ USE IT ]']);
    expect(buttons.every((b) => b.getAttribute('data-analyze') === 'glossary:squad_secret')).toBe(true);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    expect(onChoose.mock.calls.map((c) => c[0])).toEqual(['confront', 'pretend', 'use']);
    expect(onChoose.mock.calls[0][1]).toBe(x.id);
  });

  it('shows the text with the knowers\' names redacted: the names are not in the DOM', () => {
    const { s, x } = found();
    const card = renderSecretCard(s, reg, x, () => {});
    expect(card.textContent).not.toContain('Ann');
    expect(card.textContent).not.toContain('Bea');
    expect(card.querySelector('.alius-redact')).not.toBeNull();
    expect(card.textContent).toContain('came back from the run badly hurt'); // the rest of the sentence reads
    expect(card.textContent).toMatch(/slip|let it/i);
  });

  it('every marked element carries data-analyze, resolves and is reachable by keyboard', () => {
    const { s, x } = found();
    const card = renderSecretCard(s, reg, x, () => {});
    document.body.append(card);
    expect(markedWithout(card)).toEqual([]);
    expect(unresolved(card, env(s))).toEqual([]);
    expect(unreachable(card)).toEqual([]);
  });

  it('redacts a name only as a whole word', () => {
    const { s, x } = found();
    x.text = 'Annex 4 holds the cache that Ann hid, and Anna knows.';
    const card = renderSecretCard(s, reg, x, () => {});
    expect(card.textContent).toContain('Annex 4');
    expect(card.textContent).toContain('Anna knows');
    expect(card.textContent).not.toMatch(/\bAnn\b/);
    expect(card.querySelectorAll('.alius-redact')).toHaveLength(1);
  });

  it('puts text in as text, never as markup', () => {
    const { s, x } = found();
    x.text = '<img src=x onerror=alert(1)> Something hidden.';
    const card = renderSecretCard(s, reg, x, () => {});
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('<img');
  });
});
