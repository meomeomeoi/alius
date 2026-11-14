// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderDisciplineMenu } from '../../src/ui/discipline/menu';
import { campaign, loadCore, run } from '../helpers/world';
import '../../src/engine/actions/discipline';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const ANN = 'unit_ann';
const LADDER = ['verbal', 'revoke_rations', 'revoke_leave', 'extra_duty', 'bench', 'brig'];

function render(state: CampaignState = campaign(reg, 4), unitId = ANN, registries: Registries = reg) {
  const onPunish = vi.fn();
  const menu = renderDisciplineMenu({ state, registries, unitId, onPunish });
  document.body.append(menu);
  return { menu, onPunish, btn: (id: string) => menu.querySelector<HTMLButtonElement>(`button[data-punish="${id}"]`)! };
}

describe('the DISCIPLINE menu', () => {
  it('is a details element with the summary [ DISCIPLINE ] and six buttons in ladder order', () => {
    const { menu } = render();
    expect(menu.tagName).toBe('DETAILS');
    expect(menu.classList.contains('alius-discipline')).toBe(true);
    expect(menu.querySelector('summary')!.textContent).toBe('[ DISCIPLINE ]');
    expect([...menu.querySelectorAll<HTMLElement>('button[data-punish]')].map((b) => b.dataset.punish)).toEqual(LADDER);
  });

  it('the order follows severity, not the order of the pack', () => {
    const shuffled: Registries = { ...reg, punishments: new Map([...reg.punishments].reverse()) };
    const ids = [...render(campaign(reg, 4), ANN, shuffled).menu.querySelectorAll<HTMLElement>('button[data-punish]')].map((b) => b.dataset.punish!);
    const severities = ids.map((id) => Number(reg.punishments.get(id)!.severity));
    expect(severities).toEqual([...severities].sort((x, y) => x - y));
    expect([...ids].sort()).toEqual([...LADDER].sort());
  });

  it('buttons are labelled with the punishment label, analyzable, and every address resolves', () => {
    const { menu, btn } = render();
    expect(btn('revoke_rations').textContent).toBe('RATIONS REVOKED');
    expect(btn('brig').getAttribute('data-analyze')).toBe('punishments:brig');
    expect(JSON.parse(btn('brig').getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN });
    expect(btn('brig').classList.contains('alius-option')).toBe(true);
    const env: AnalyzeEnv = { registries: reg, state: campaign(reg, 4), settings: DEFAULT_SETTINGS };
    expect(unresolved(menu, env)).toEqual([]);
    expect(markedWithout(menu)).toEqual([]);
    expect(unreachable(menu)).toEqual([]);
  });

  it('clicking a measure calls onPunish with it; the brig takes the days of its select', () => {
    const { menu, btn, onPunish } = render();
    btn('verbal').click();
    expect(onPunish).toHaveBeenLastCalledWith('verbal', undefined);
    const select = menu.querySelector<HTMLSelectElement>('select[data-brig-days]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '3']);
    select.value = '2';
    btn('brig').click();
    expect(onPunish).toHaveBeenLastCalledWith('brig', 2);
    expect(menu.querySelectorAll('select[data-brig-days]')).toHaveLength(1); // only the entry that has days
  });

  it('the days of a pack whose entry differs follow its range', () => {
    const wide: Registries = { ...reg, punishments: new Map([...reg.punishments, ['brig', { ...(reg.punishments.get('brig') as object), id: 'brig', sideEffects: [{ type: 'confine', minDays: 2, maxDays: 5 }] } as never]]) };
    const select = render(campaign(reg, 4), ANN, wide).menu.querySelector<HTMLSelectElement>('select[data-brig-days]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['2', '3', '4', '5']);
  });

  it('a measure already imposed today is soft-disabled with the reason, and its click does nothing', () => {
    const s = run(campaign(reg, 4), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } }).state;
    const { btn, onPunish } = render(s);
    expect(btn('verbal').getAttribute('aria-disabled')).toBe('true');
    expect(btn('verbal').getAttribute('title')).toBe('Ann was already given Reprimand today.');
    expect(btn('verbal').disabled).toBe(false); // soft: still focusable
    btn('verbal').click();
    expect(onPunish).not.toHaveBeenCalled();
    expect(btn('revoke_rations').getAttribute('aria-disabled')).toBeNull();
    btn('revoke_rations').click();
    expect(onPunish).toHaveBeenCalledWith('revoke_rations', undefined);
  });

  it('a unit already in the brig cannot be sent there again', () => {
    const s = run(campaign(reg, 4), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'brig', days: 2 } }).state;
    s.day += 1;
    expect(render(s).btn('brig').getAttribute('aria-disabled')).toBe('true');
  });

  it('the text of the page comes through textContent, never as markup', () => {
    const evil: Registries = { ...reg, punishments: new Map([...reg.punishments, ['verbal', { ...(reg.punishments.get('verbal') as object), id: 'verbal', label: '<img src=x onerror=1>' } as never]]) };
    const { menu } = render(campaign(reg, 4), ANN, evil);
    expect(menu.querySelector('img')).toBeNull();
    expect(menu.textContent).toContain('<IMG SRC=X ONERROR=1>');
  });
});
