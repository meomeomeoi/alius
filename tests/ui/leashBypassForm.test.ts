// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { checkActivity } from '../../src/engine/activities';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { fileLeashRequest, type LeashFormShell } from '../../src/ui/leash/requestForm';
import { activityCard, type OpsTabCtx } from '../../src/ui/ops/opsTab';
import { createModalHost } from '../../src/ui/shell/modal';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
let layer: HTMLElement;
let shell: LeashFormShell;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => {
  layer = h('div');
  document.body.append(layer);
  const modals = createModalHost(layer);
  shell = { modal: (o) => modals.show(o), closeModal: () => modals.cancel() };
});
afterEach(() => { document.body.innerHTML = ''; });

const base = { kind: 'compel' as const, unitName: 'Bea', no: 7, left: 2, showNumbers: false, delayMs: 0 };
const routes = {
  comms: {}, reset: { allies: [{ id: 'unit_dee', name: 'Dee' }] }, ally: { allies: [{ id: 'unit_cat', name: 'Cat' }, { id: 'unit_dee', name: 'Dee' }] },
};
const buttons = () => [...layer.querySelectorAll<HTMLButtonElement>('.alius-modal-actions button')];
const button = (label: string) => buttons().find((b) => b.textContent === label)!;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('the Leash form while a holder holds the requests (P15)', () => {
  it('says the request is held for her co-sign, with the capability\'s own analyze entry', () => {
    void fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes });
    const line = layer.querySelector<HTMLElement>('[data-line="cosign"]')!;
    expect(line.textContent).toContain("HELD FOR ANN'S CO-SIGN");
    expect(line.getAttribute('data-analyze')).toBe('glossary:capability_leash_block');
  });

  it('offers the routes only while blocked, each with data-analyze', () => {
    void fileLeashRequest(shell, { ...base });
    expect(buttons().map((b) => b.textContent)).toEqual(['[ FILE REQUEST ]', '[ WITHDRAW ]']);
    expect(layer.querySelector('[data-line="cosign"]')).toBeNull();
    layer.innerHTML = '';
    void fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes });
    expect(buttons().map((b) => b.textContent)).toEqual(['[ FILE REQUEST ]', '[ COMMS TERMINAL ]', '[ RESET THE DEVICE ]', '[ ASK A SOLDIER ]', '[ WITHDRAW ]']);
    expect(['[ COMMS TERMINAL ]', '[ RESET THE DEVICE ]', '[ ASK A SOLDIER ]'].map((l) => button(l).getAttribute('data-analyze')))
      .toEqual(['glossary:leash_bypass_comms', 'glossary:leash_bypass_reset', 'glossary:leash_bypass_ally']);
    for (const id of ['leash_bypass_comms', 'leash_bypass_reset', 'leash_bypass_ally']) expect(reg.glossary.has(id)).toBe(true);
  });

  it('a route that cannot be taken is greyed with its reason', () => {
    void fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes: { ...routes, comms: { disabled: 'LEAVE THE SCENE FIRST' }, reset: { disabled: 'NO ONE WHO KNOWS THE DEVICE', allies: [] } } });
    expect(button('[ COMMS TERMINAL ]').disabled).toBe(true);
    expect(button('[ RESET THE DEVICE ]').disabled).toBe(true);
    expect(layer.textContent).toContain('LEAVE THE SCENE FIRST');
    expect(button('[ ASK A SOLDIER ]').disabled).toBe(false);
  });

  it('the comms route resolves true and reports the route; a soldier route asks who first', async () => {
    const taken = vi.fn();
    const p = fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes, onRoute: taken });
    button('[ COMMS TERMINAL ]').click();
    expect(await p).toBe(true);
    expect(taken).toHaveBeenCalledWith({ route: 'comms' });

    const taken2 = vi.fn();
    const q = fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes, onRoute: taken2 });
    button('[ ASK A SOLDIER ]').click();
    await tick();
    expect(buttons().map((b) => b.textContent)).toEqual(['[ CAT ]', '[ DEE ]', '[ BACK ]']);
    button('[ DEE ]').click();
    expect(await q).toBe(true);
    expect(taken2).toHaveBeenCalledWith({ route: 'ally', allyId: 'unit_dee' });

    // BACK returns to the form
    const taken3 = vi.fn();
    const r = fileLeashRequest(shell, { ...base, heldBy: 'Ann', routes, onRoute: taken3 });
    button('[ RESET THE DEVICE ]').click();
    await tick();
    button('[ BACK ]').click();
    await tick();
    expect(button('[ FILE REQUEST ]')).toBeDefined();
    button('[ WITHDRAW ]').click();
    expect(await r).toBe(false);
    expect(taken3).not.toHaveBeenCalled();
  });
});

describe('the comms activity (P15)', () => {
  const state = () => {
    const s = campaign(reg, 3);
    s.base.facilities.comms = 1;
    s.slot = 'morning';
    return s;
  };
  it('lists no focus choice: the terminal is filed from the Leash form, and one focus is no choice', () => {
    const el = activityCard(reg.activities.get('scout_net')!, state(), { registries: reg, settings: DEFAULT_SETTINGS, onDo: () => {} } as unknown as OpsTabCtx);
    expect(el.querySelector('select[name="focus"]')).toBeNull();
  });

  it('the terminal focus is allowed only while a holder holds the Leash block', () => {
    const req = { activityId: 'scout_net', focus: 'leash_terminal' };
    const s = state();
    expect(checkActivity(s, reg, req)).toMatch(/not available/);
    expect(checkActivity(s, reg, { activityId: 'scout_net' })).toBeNull(); // the default (scouting) is unchanged
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    s.content = { enabled: ['restraint'] };
    s.squad[0].bond = {
      leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
      practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
    };
    s.relations[s.squad[0].id].dynamic = { ...blankDynamic(s.day), frame: 'role', hold: 70, domains: [{ id: 'device', since: 1 }] };
    expect(checkActivity(s, reg, req)).toBeNull();
  });
});
