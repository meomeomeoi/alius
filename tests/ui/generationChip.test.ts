// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { resetKnowledgeRules } from '../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import { readingFor } from '../../src/analysis/providers';
import { parseSubject } from '../../src/analysis/subject';
import type { Registries } from '../../src/content/types';
import type { CampaignState, GenerationRecord } from '../../src/engine/state/types';
import { describeFailure } from '../../src/llm/describe';
import { generationSites } from '../../src/llm/sites';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { chipsFor, drawGenerationChip, drawReroll } from '../../src/ui/generation/chip';
import { openRetryMenu } from '../../src/ui/generation/retryMenu';
import { createModalHost } from '../../src/ui/shell/modal';
import { hiddenFixture } from '../fixtures/analyze/hidden';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});

const rec = (over: Partial<GenerationRecord> = {}): GenerationRecord => ({
  id: 'g1', siteId: 'expedition.recap', key: 'r1', reason: 'refused', detail: '', attempts: 1, day: 3, slot: 'morning', at: 1, budgetMult: 1, status: 'open', ...over,
});
const handlers = () => ({ label: 'After-action recap', text: '', onRetry: vi.fn(), onMenu: vi.fn(), onUseFallback: vi.fn(), onDrop: vi.fn() });
const draw = (r: GenerationRecord, hh = handlers(), withFallback = false) => {
  const host = h('div');
  const text = describeFailure({ label: hh.label, reason: r.reason, budget: 300, timeoutMs: 120000, expiredWhy: r.expiredWhy });
  const chip = drawGenerationChip(host, r, { ...hh, text, onUseFallback: withFallback ? hh.onUseFallback : undefined });
  return { host, chip, hh };
};
const envOf = (state: CampaignState | null): AnalyzeEnv => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the failure chip', () => {
  it('chip text per reason', () => {
    const cases: Array<[Partial<GenerationRecord>, string]> = [
      [{ reason: 'refused' }, 'After-action recap: the model refused.'],
      [{ reason: 'truncated' }, 'After-action recap: the answer was cut off at 300 tokens.'],
      [{ reason: 'timeout' }, 'After-action recap: no answer within 120 s.'],
      [{ reason: 'network' }, 'After-action recap: the connection failed.'],
      [{ reason: 'invalid_output' }, 'After-action recap: the answer did not fit the form.'],
      [{ reason: 'empty' }, 'After-action recap: nothing came back.'],
    ];
    for (const [over, want] of cases) {
      const { chip } = draw(rec(over));
      expect(chip.textContent, over.reason).toContain(want);
      expect(chip.className).toContain('alius-chip');
      expect(chip.className).toContain('alius-genfail');
      expect(chip.getAttribute('data-record')).toBe('g1');
    }
  });

  it('RETRY and the menu call back; USE FALLBACK shows only when the site offers it', () => {
    const { chip, hh } = draw(rec(), handlers(), true);
    (chip.querySelector('[data-action="generation-retry"]') as HTMLElement).click();
    (chip.querySelector('[data-action="generation-menu"]') as HTMLElement).click();
    (chip.querySelector('[data-action="generation-fallback"]') as HTMLElement).click();
    expect(hh.onRetry).toHaveBeenCalledOnce();
    expect(hh.onMenu).toHaveBeenCalledOnce();
    expect(hh.onUseFallback).toHaveBeenCalledOnce();
    expect(draw(rec()).chip.querySelector('[data-action="generation-fallback"]')).toBeNull();
  });

  it('expired chip shows the why and only DROP', () => {
    const { chip, hh } = draw(rec({ status: 'expired', reason: 'expired', expiredWhy: 'The scene is over.' }));
    expect(chip.textContent).toContain('After-action recap: The scene is over.');
    expect([...chip.querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['generation-drop']);
    (chip.querySelector('[data-action="generation-drop"]') as HTMLElement).click();
    expect(hh.onDrop).toHaveBeenCalledOnce();
  });

  it('every chip and button carries data-analyze', () => {
    const { host } = draw(rec(), handlers(), true);
    drawReroll(host, { enabled: true }, () => {});
    drawReroll(host, { enabled: false, reason: 'Something happened since: this can no longer be rerolled.' }, () => {});
    const marked = host.querySelectorAll('[data-analyze]');
    expect(marked.length).toBe(6);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, envOf(campaign(reg, 2)))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    for (const b of host.querySelectorAll('button')) expect(b.getAttribute('data-analyze'), b.textContent ?? '').toBeTruthy();
  });
});

describe('REROLL', () => {
  it('is a button that calls back and shows pending as disabled', () => {
    const host = h('div');
    const onReroll = vi.fn();
    const btn = drawReroll(host, { enabled: true }, onReroll);
    expect(btn.textContent).toBe('[REROLL]');
    btn.click();
    expect(onReroll).toHaveBeenCalledOnce();
    const pending = drawReroll(h('div'), { enabled: true }, onReroll, true);
    expect((pending as HTMLButtonElement).disabled).toBe(true);
  });

  it('disabled is aria-disabled, analyzable, explains', () => {
    const reason = 'Something happened since: this can no longer be rerolled.';
    const onReroll = vi.fn();
    const btn = drawReroll(h('div'), { enabled: false, reason }, onReroll);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('title')).toBe(reason);
    expect(btn.getAttribute('data-analyze')).toBe('glossary:generation_reroll');
    btn.click();
    expect(onReroll).not.toHaveBeenCalled();
    const reading = readingFor(parseSubject(btn.getAttribute('data-analyze')!, btn.getAttribute('data-analyze-ctx'))!, envOf(campaign(reg, 2)));
    expect(reading?.lines.join(' ')).toContain(reason);
  });
});

describe('the retry menu', () => {
  const open = (opts: { hasMechanic: boolean; hasFallback: boolean }) => {
    const layer = h('div');
    document.body.append(layer);
    const modals = createModalHost(layer);
    const p = openRetryMenu((o) => modals.show(o), opts);
    return { layer, p };
  };
  const press = (layer: HTMLElement, label: string) => ([...layer.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLElement).click();

  it('hides the profile row without a mechanic profile', () => {
    const without = open({ hasMechanic: false, hasFallback: false });
    expect(without.layer.querySelector('[name="generation-profile"]')).toBeNull();
    expect(without.layer.textContent).not.toContain('USE FALLBACK');
    press(without.layer, 'CANCEL');
    const withMech = open({ hasMechanic: true, hasFallback: true });
    expect(withMech.layer.querySelectorAll('[name="generation-profile"]').length).toBe(2);
    expect(withMech.layer.textContent).toContain('USE FALLBACK');
    press(withMech.layer, 'CANCEL');
  });

  it('answers the chosen budget and profile, DROP, fallback or null', async () => {
    const a = open({ hasMechanic: true, hasFallback: true });
    (a.layer.querySelector('[name="generation-budget"][value="2"]') as HTMLInputElement).click();
    (a.layer.querySelector('[name="generation-profile"][value="main"]') as HTMLInputElement).click();
    press(a.layer, 'RETRY');
    expect(await a.p).toEqual({ budgetMult: 2, profile: 'main' });
    const defaults = open({ hasMechanic: true, hasFallback: false });
    press(defaults.layer, 'RETRY');
    expect(await defaults.p).toEqual({ budgetMult: 1.5 });
    const d = open({ hasMechanic: false, hasFallback: false });
    press(d.layer, 'DROP');
    expect(await d.p).toBe('drop');
    const f = open({ hasMechanic: false, hasFallback: true });
    press(f.layer, 'USE FALLBACK');
    expect(await f.p).toBe('fallback');
    const c = open({ hasMechanic: false, hasFallback: false });
    press(c.layer, 'CANCEL');
    expect(await c.p).toBeNull();
  });
});

describe('chipsFor', () => {
  it('lists open and expired records of full sites of the surface, quiet sites never', () => {
    const state = campaign(reg, 2);
    state.generations = {
      seq: 4,
      records: [
        rec({ id: 'g1', siteId: 'expedition.recap' }),
        rec({ id: 'g2', siteId: 'expedition.recap', key: 'r0', status: 'expired', reason: 'expired', expiredWhy: 'A newer report came.' }),
        rec({ id: 'g3', siteId: 'scene.digest', key: 's:1', quiet: true }),
        rec({ id: 'g4', siteId: 'dilemma.generate', key: 'd1' }),
      ],
    };
    expect(chipsFor(state, 'expedition').map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(chipsFor(state, 'scene')).toEqual([]);
    expect(chipsFor(state, 'dilemma', (r) => r.key === 'd1').map((r) => r.id)).toEqual(['g4']);
    expect(chipsFor({ ...state, generations: undefined }, 'expedition')).toEqual([]);
  });
});

describe('analysis', () => {
  it('a chip is read through its record, with the reason in words', () => {
    const state = campaign(reg, 2);
    state.generations = { seq: 1, records: [rec({ reason: 'truncated', attempts: 2, detail: 'cut' })] };
    const { chip } = draw(state.generations.records[0]);
    const subject = parseSubject(chip.getAttribute('data-analyze')!, chip.getAttribute('data-analyze-ctx'))!;
    const lines = readingFor(subject, envOf(state))!.lines.join('\n');
    expect(lines).toContain('2 tries');
    expect(lines.toLowerCase()).toContain('cut off');
    expect(readingFor(subject, envOf(null))?.lines).toEqual(['No campaign loaded.']);
  });

  it('the glossary ids exist and no entry gives the commander a pronoun', () => {
    for (const id of ['generation_failed', 'generation_reroll', 'generation_record', 'generation_reasons', 'setting_llm_timeout_ms', 'setting_auto_retry']) {
      const e = reg.glossary.get(id);
      expect(e, id).toBeDefined();
      expect(`${e?.short} ${e?.long}`, id).not.toMatch(/\b(he|him|his)\b/i);
    }
  });

  it('a hidden sentinel never renders', () => {
    const { state, sentinels } = hiddenFixture(reg);
    try {
      state.generations = {
        seq: generationSites().length,
        records: generationSites().map((s, i) => rec({ id: `g${i + 1}`, siteId: s.id, key: `${s.id}:key`, reason: 'invalid_output', detail: 'wardenAgenda.expectations.0.kind: Invalid' })),
      };
      const text: string[] = [];
      for (const r of state.generations.records) {
        const site = generationSites().find((s) => s.id === r.siteId)!;
        const label = site.label(state, r.key);
        const { host } = draw(r, { ...handlers(), label });
        text.push(host.textContent ?? '', label);
        const subject = parseSubject(host.querySelector('[data-analyze]')!.getAttribute('data-analyze')!, host.querySelector('[data-analyze]')!.getAttribute('data-analyze-ctx'))!;
        text.push(...(readingFor(subject, envOf(state))?.lines ?? []));
      }
      const all = text.join('\n');
      for (const t of sentinels.texts) expect(all, t).not.toContain(t);
    } finally {
      resetKnowledgeRules();
    }
  });
});
