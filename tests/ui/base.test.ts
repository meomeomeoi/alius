// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { TUNING } from '../../src/engine/tuning';
import type { CampaignState } from '../../src/engine/state/types';
import type { LoadResult } from '../../src/st/persistence';
import { renderBaseTab, schematic } from '../../src/ui/base/baseTab';
import { h } from '../../src/ui/dom';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function render(opts: { state?: CampaignState | null; load?: LoadResult } = {}) {
  const state = opts.state === undefined ? campaign(reg, 4) : opts.state;
  const load: LoadResult = opts.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const onUpgrade = vi.fn();
  const onRecruit = vi.fn();
  const onSetRoster = vi.fn();
  const host = h('div');
  document.body.append(host);
  renderBaseTab(host, { getState: () => state, getLoad: () => load, registries: reg, onUpgrade, onRecruit, onSetRoster });
  return { host, onUpgrade, onRecruit, onSetRoster };
}

describe('schematic', () => {
  it('shows every facility with its level', () => {
    const text = schematic(campaign(reg, 4), reg);
    for (const [name, level] of [['BARRACKS', 'L1/5'], ['WORKSHOP', 'L1/5'], ['MEDBAY', 'L1/5'], ['MESS HALL', 'L1/3'], ['COMMS ROOM', 'L1/3']]) {
      expect(text, name).toContain(name);
      expect(text, `${name} ${level}`).toContain(level);
    }
  });

  it('marks a pending upgrade with its days left and uses the current level', () => {
    const s = campaign(reg, 4);
    s.base.facilities.barracks = 2;
    s.base.upgrades = [{ facilityId: 'medbay', toLevel: 2, daysLeft: 3 }];
    const text = schematic(s, reg);
    expect(text).toContain('L2/5');
    expect(text).toMatch(/\^ 3d/);
  });

  it('is rectangular ASCII art: every box line has the same width', () => {
    const lines = schematic(campaign(reg, 4), reg).split('\n').filter((l) => l.startsWith('+'));
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
  });
});

describe('BASE tab', () => {
  const rich = (): CampaignState => {
    const s = campaign(reg, 4);
    s.resources = { credits: 1000, supplies: 50, plyx: 100 };
    return s;
  };

  it('upgrade button shows the next level cost and calls onUpgrade', () => {
    const { host, onUpgrade } = render({ state: rich() });
    const card = host.querySelector<HTMLElement>('[data-facility="barracks"]')!;
    expect(card.textContent).toContain('60 CR');
    expect(card.textContent).toContain('5 PLYX');
    expect(card.textContent).toContain('2 DAYS');
    card.querySelector<HTMLButtonElement>('button[data-upgrade]')!.click();
    expect(onUpgrade).toHaveBeenCalledWith('barracks');
  });

  it('upgrade button is disabled without credits, with a pending upgrade, and at max level', () => {
    const poor = campaign(reg, 4);
    poor.resources.credits = 0;
    const a = render({ state: poor });
    expect(a.host.querySelector<HTMLButtonElement>('[data-facility="barracks"] button[data-upgrade]')!.disabled).toBe(true);
    expect(a.host.querySelector('[data-facility="barracks"]')!.textContent).toMatch(/credits/i);

    const busy = rich();
    busy.base.upgrades = [{ facilityId: 'comms', toLevel: 2, daysLeft: 2 }];
    const b = render({ state: busy });
    expect(b.host.querySelector<HTMLButtonElement>('[data-facility="comms"] button[data-upgrade]')!.disabled).toBe(true);
    expect(b.host.querySelector('[data-facility="comms"]')!.textContent).toContain('^ 2d');

    const maxed = rich();
    maxed.base.facilities.mess_hall = 3;
    const c = render({ state: maxed });
    expect(c.host.querySelector('[data-facility="mess_hall"] button[data-upgrade]')).toBeNull();
    expect(c.host.querySelector('[data-facility="mess_hall"]')!.textContent).toContain('MAX');
  });

  it('roster shows units/capacity and toggles active status', () => {
    const s = campaign(reg, 6);
    const { host, onSetRoster } = render({ state: s });
    expect(host.textContent).toContain('UNITS 6/6');
    const toggle = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-roster-toggle="${id}"]`)!;
    expect(toggle('unit_ann').textContent).toBe('[ACTIVE]');
    toggle('unit_ann').click();
    expect(onSetRoster).toHaveBeenLastCalledWith(['unit_bea', 'unit_cat', 'unit_dee']);
  });

  it('roster toggle refuses a fifth active unit', () => {
    const { host } = render({ state: campaign(reg, 6) });
    const eve = host.querySelector<HTMLButtonElement>('button[data-roster-toggle="unit_eve"]')!;
    expect(eve.textContent).toBe('[RESERVE]');
    expect(eve.disabled).toBe(true);
    expect(eve.title).toMatch(/4/);
  });

  it('adding a reserve unit when there is room appends it', () => {
    const s = campaign(reg, 6);
    s.roster.activeIds = ['unit_ann', 'unit_bea'];
    const { host, onSetRoster } = render({ state: s });
    host.querySelector<HTMLButtonElement>('button[data-roster-toggle="unit_eve"]')!.click();
    expect(onSetRoster).toHaveBeenCalledWith(['unit_ann', 'unit_bea', 'unit_eve']);
  });

  it('dead units are not listed in the roster and do not count towards the beds', () => {
    const s = campaign(reg, 4);
    s.squad[3].status = 'dead';
    const { host } = render({ state: s });
    expect(host.querySelector('button[data-roster-toggle="unit_dee"]')).toBeNull();
    expect(host.textContent).toContain('UNITS 3/6');
  });

  it('recruit button shows the cost, dispatches, and is disabled at capacity', () => {
    const ok = render({ state: rich() });
    const btn = ok.host.querySelector<HTMLButtonElement>('button[data-recruit]')!;
    expect(btn.textContent).toBe(`[ RECRUIT GRUNT (${TUNING.recruit.credits} CR) ]`);
    btn.click();
    expect(ok.onRecruit).toHaveBeenCalledTimes(1);

    const full = rich();
    full.roster.capacity = 4;
    const f = render({ state: full });
    expect(f.host.querySelector<HTMLButtonElement>('button[data-recruit]')!.disabled).toBe(true);
    expect(f.host.textContent).toMatch(/barracks are full/i);
  });

  it('no campaign and read-only show a message', () => {
    expect(render({ state: null }).host.textContent).toContain('NO ACTIVE CAMPAIGN');
    expect(render({ state: null, load: { kind: 'readonly', reason: 'broken', chatId: 'c' } }).host.textContent).toContain('READ-ONLY');
  });
});
