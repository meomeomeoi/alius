// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { arcPaths } from '../../src/engine/arcs';
import type { CampaignState } from '../../src/engine/state/types';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderSquadTab, type SquadTabCtx } from '../../src/ui/squad/squadTab';
import { renderLogTab } from '../../src/ui/log/logTab';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const ANN = 'unit_ann';
function arcState(stateId = 'confidant', medbay = 5): CampaignState {
  const s = campaign(reg, 2, { crimeId: 'purge' });
  s.day = 8;
  s.resources = { credits: 500, supplies: 50, plyx: 50 };
  s.base.facilities.medbay = medbay;
  for (const u of s.squad) {
    u.defects = [{ id: 'echo_bleed' }];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    setRelation(s, u.id, { stateId, trust: 70, affinity: 20, band: 'steady' });
  }
  return s;
}

function render(state: CampaignState, extra: Partial<SquadTabCtx> = {}, raw = false) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const settings = { ...getSettings(st), showRawValues: raw };
  const host = h('div');
  document.body.append(host);
  const calls = { leash: vi.fn(), arc: vi.fn() };
  renderSquadTab(host, {
    st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings, onNewCampaign: () => {},
    onLeash: calls.leash, onArc: calls.arc,
    arcPaths: (unitId, defectId) => arcPaths(state, reg, unitId, defectId),
    canTerminate: () => 'There is no cause to terminate her.',
    ...extra,
  });
  return { host, calls };
}
const unitBlock = (host: HTMLElement, name: string): HTMLElement =>
  [...host.querySelectorAll<HTMLElement>('.alius-unit')].find((u) => u.querySelector('.alius-unit-name')!.textContent === name)!;

describe('SQUAD tab: loyalty and the Leash', () => {
  it('shows the loyalty band of every living unit', () => {
    const s = arcState();
    setRelation(s, ANN, { band: 'wavering', trust: 20 });
    setRelation(s, 'unit_bea', { band: 'breaking', trust: 5 });
    const { host } = render(s);
    expect(unitBlock(host, 'Ann').querySelector('.alius-loyalty')!.textContent).toBe('LOYALTY: WAVERING');
    expect(unitBlock(host, 'Bea').querySelector('.alius-loyalty')!.textContent).toBe('LOYALTY: BREAKING');
    const steady = arcState();
    expect(unitBlock(render(steady).host, 'Ann').querySelector('.alius-loyalty')!.textContent).toBe('LOYALTY: STEADY');
  });

  it('a deserted or terminated unit has no loyalty line and no Leash menu, only her status', () => {
    const s = arcState();
    s.squad[0].status = 'terminated';
    const { host } = render(s);
    const block = unitBlock(host, 'Ann');
    expect(block.querySelector('.alius-loyalty')).toBeNull();
    expect(block.querySelector('[data-leash-menu]')).toBeNull();
    expect(block.textContent).toContain('TERMINATED');
  });

  it('the LEASH menu lists compel and suppress, hides TERMINATE without cause and calls onLeash', () => {
    const { host, calls } = render(arcState());
    const menu = unitBlock(host, 'Ann').querySelector('[data-leash-menu]')!;
    expect(menu.querySelector('summary')!.textContent).toBe('[ LEASH ]');
    const kinds = [...menu.querySelectorAll<HTMLButtonElement>('button')].map((b) => b.getAttribute('data-leash'));
    expect(kinds).toEqual(['compel', 'suppress']);
    menu.querySelector<HTMLButtonElement>('button[data-leash="suppress"]')!.click();
    expect(calls.leash).toHaveBeenCalledWith(ANN, 'suppress');
  });

  it('TERMINATE appears when there is cause', () => {
    const { host, calls } = render(arcState(), { canTerminate: () => null });
    const btn = unitBlock(host, 'Ann').querySelector<HTMLButtonElement>('button[data-leash="terminate"]')!;
    expect(btn.textContent).toBe('TERMINATE');
    btn.click();
    expect(calls.leash).toHaveBeenCalledWith(ANN, 'terminate');
  });

  it('offers arc paths with wants/refuses marks, costs and the reason a path is greyed', () => {
    const s = arcState('confidant', 3); // medbay 3: manage and embrace, cure too deep
    s.squad[0].values.autonomy = 3; // she wants embrace
    const { host, calls } = render(s);
    const arc = unitBlock(host, 'Ann').querySelector('[data-arc="echo_bleed"]')!;
    expect(arc.querySelector('summary')!.textContent).toBe('[ DECIDE ARC ]');
    const row = (path: string) => arc.querySelector<HTMLElement>(`[data-path="${path}"]`)!;
    expect(row('manage').textContent).toContain('Journaling ritual with the commander.');
    expect(row('manage').textContent).toContain('5 SUPPLIES');
    expect(row('embrace').textContent).toContain('SHE WANTS THIS');
    expect(row('embrace').querySelector('button')!.disabled).toBe(false);
    expect(row('cure').querySelector('button')!.disabled).toBe(true);
    expect(row('cure').textContent).toMatch(/medbay/i);
    row('embrace').querySelector('button')!.click();
    expect(calls.arc).toHaveBeenCalledWith(ANN, 'echo_bleed', 'embrace', false);
  });

  it('a refused path says so and is decided with the Leash', () => {
    const s = arcState('confidant', 5);
    s.squad[0].values.autonomy = 3; // refuses cure
    const { host, calls } = render(s);
    const cure = unitBlock(host, 'Ann').querySelector<HTMLElement>('[data-path="cure"]')!;
    expect(cure.textContent).toContain('SHE REFUSES — LEASH ONLY');
    const btn = cure.querySelector('button')!;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toMatch(/LEASH/);
    btn.click();
    expect(calls.arc).toHaveBeenCalledWith(ANN, 'echo_bleed', 'cure', true);
  });

  it('a completed arc shows its status instead of the button', () => {
    const s = arcState();
    Object.assign(s.squad[0].defects[0], { arc: 'manage', arcSteps: { done: 1, needed: 1 } });
    const { host } = render(s);
    const block = unitBlock(host, 'Ann');
    expect(block.querySelector('[data-arc="echo_bleed"]')!.textContent).toBe('ARC: MANAGE 1/1');
    expect(block.querySelector('[data-arc="echo_bleed"] summary')).toBeNull();
    const mid = arcState();
    Object.assign(mid.squad[0].defects[0], { arc: 'cure', arcSteps: { done: 2, needed: 3 } });
    expect(unitBlock(render(mid).host, 'Ann').querySelector('[data-arc="echo_bleed"]')!.textContent).toBe('ARC: CURE 2/3');
  });

  it('nothing is offered for a lite defect, a comrade or when no callbacks are given', () => {
    const lite = arcState();
    lite.squad[0].defects[0].lite = true;
    expect(unitBlock(render(lite).host, 'Ann').querySelector('[data-arc]')).toBeNull();
    const comrade = arcState('comrade');
    expect(unitBlock(render(comrade).host, 'Ann').querySelector('[data-arc] summary')).toBeNull();
    const bare = render(arcState(), { onLeash: undefined, onArc: undefined, arcPaths: undefined, canTerminate: undefined });
    expect(bare.host.querySelector('[data-leash-menu]')).toBeNull();
    expect(bare.host.querySelector('[data-arc]')).toBeNull();
  });

  it('content and card text is set as text, never as markup', () => {
    const s = arcState();
    s.squad[0].displayName = '<img src=x onerror=alert(1)>';
    const { host } = render(s);
    expect(host.querySelector('.alius-unit img[src="x"]')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('LOG tab: the oversight log', () => {
  const log = (s: CampaignState) => {
    const host = h('div');
    document.body.append(host);
    renderLogTab(host, { getState: () => s });
    return host;
  };

  it('the log lists Leash uses newest first and skips malformed entries', () => {
    const s = arcState();
    s.leash.log = [
      { no: 1, unitId: ANN, kind: 'compel', day: 3, context: 'scene', outcome: 'done' },
      'garbage', null, { unitId: 5 },
      { no: 7, unitId: 'unit_bea', kind: 'terminate', day: 12, context: 'desertion', outcome: 'denied' },
      { no: 2, unitId: 'ghost', kind: 'suppress', day: 9, context: 'mutiny', outcome: 'done' },
    ];
    const host = log(s);
    expect(host.textContent).toContain('OVERSIGHT LOG');
    const lines = [...host.querySelectorAll('.alius-oversight-entry')].map((e) => e.textContent);
    expect(lines).toEqual([
      '#0007 DAY 012 TERMINATE Bea — DENIED',
      '#0002 DAY 009 SUPPRESS ghost — DONE',
      '#0001 DAY 003 COMPEL Ann — DONE',
    ]);
  });

  it('an empty log says so, and unit names are plain text', () => {
    const s = arcState();
    expect(log(s).textContent).toContain('NO REQUESTS FILED');
    document.body.innerHTML = '';
    s.squad[0].displayName = '<b>x</b>';
    s.leash.log = [{ no: 1, unitId: ANN, kind: 'compel', day: 1, context: 'scene', outcome: 'done' }];
    const host = log(s);
    expect(host.querySelector('.alius-oversight-entry b')).toBeNull();
    expect(host.querySelector('.alius-oversight-entry')!.textContent).toContain('<b>x</b>');
  });

  it('the chronicle still renders as before', () => {
    const s = arcState();
    s.memory.chronicle = [{ id: 'c1', kind: 'scene', day: 1, slot: 'morning', text: 'Early talk.' }];
    expect(log(s).querySelectorAll('.alius-post')).toHaveLength(1);
  });
});

