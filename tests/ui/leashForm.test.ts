// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../src/ui/dom';
import { fileLeashRequest, type LeashFormShell } from '../../src/ui/leash/requestForm';
import { createModalHost } from '../../src/ui/shell/modal';

let layer: HTMLElement;
let shell: LeashFormShell;
beforeEach(() => {
  layer = h('div');
  document.body.append(layer);
  const modals = createModalHost(layer);
  shell = { modal: (o) => modals.show(o), closeModal: () => modals.cancel() };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const base = { kind: 'compel' as const, unitName: 'Ann', no: 7, left: 2, showNumbers: false, delayMs: 0 };
const dialog = () => layer.querySelector<HTMLElement>('.alius-modal');
const buttons = () => [...layer.querySelectorAll<HTMLButtonElement>('.alius-modal-actions button')];
const button = (label: string) => buttons().find((b) => b.textContent === label)!;
const text = () => dialog()?.textContent ?? '';

describe('oversight request form', () => {
  it('the form shows the request number, subject and remaining authorizations', () => {
    void fileLeashRequest(shell, { ...base, cause: 'She refused a direct order.' });
    expect(layer.querySelector('.alius-modal-title')!.textContent).toBe('OVERSIGHT REQUEST #0007');
    const t = text();
    expect(t).toContain('SUBJECT');
    expect(t).toContain('Ann');
    expect(t).toContain('ACTION');
    expect(t).toContain('COMPEL');
    expect(t).toContain('GROUNDS');
    expect(t).toContain('She refused a direct order.');
    expect(t).toContain('AUTHORIZATIONS REMAINING');
    expect(layer.querySelector('[data-line="remaining"]')!.textContent).toContain('2');
    expect(buttons().map((b) => b.textContent)).toEqual(['[ FILE REQUEST ]', '[ WITHDRAW ]']);
  });

  it('the request number is padded to four digits and each kind has its own action line', () => {
    void fileLeashRequest(shell, { ...base, kind: 'terminate', no: 123, cause: 'Attacked the squad.' });
    expect(layer.querySelector('.alius-modal-title')!.textContent).toBe('OVERSIGHT REQUEST #0123');
    expect(text()).toContain('TERMINATE');
    expect(text()).toMatch(/IRREVERSIBLE/);
  });

  it('FILE is disabled at 0 authorizations with the reason', () => {
    void fileLeashRequest(shell, { ...base, left: 0 });
    const file = button('[ FILE REQUEST ]');
    expect(file.disabled).toBe(true);
    expect(text()).toMatch(/NO AUTHORIZATIONS REMAIN/);
    file.click();
    expect(dialog()).not.toBeNull(); // still open
    expect(button('[ WITHDRAW ]').disabled).toBe(false);
  });

  it('withdraw resolves false and files nothing', async () => {
    const p = fileLeashRequest(shell, base);
    button('[ WITHDRAW ]').click();
    expect(await p).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('Escape (a cancelled modal) counts as a withdrawal', async () => {
    const p = fileLeashRequest(shell, base);
    layer.querySelector<HTMLElement>('.alius-modal-backdrop');
    shell.closeModal();
    expect(await p).toBe(false);
  });

  it('with delay 0 FILE resolves true after the review lines', async () => {
    const p = fileLeashRequest(shell, base);
    button('[ FILE REQUEST ]').click();
    expect(await p).toBe(true);
    expect(dialog()).toBeNull(); // the review modal is closed again
  });

  it('the review lines appear over the delay and the verdict is the caller\'s', async () => {
    vi.useFakeTimers();
    const p = fileLeashRequest(shell, { ...base, delayMs: 1800, verdict: 'UNDER REVIEW' });
    button('[ FILE REQUEST ]').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(text()).toContain('TRANSMITTING…');
    expect(text()).not.toContain('OVERSIGHT REVIEW…');
    expect(buttons()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(700);
    expect(text()).toContain('OVERSIGHT REVIEW…');
    expect(text()).not.toContain('UNDER REVIEW');
    await vi.advanceTimersByTimeAsync(700);
    expect(text()).toContain('UNDER REVIEW');
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe(true);
  });

  it('the verdict defaults to APPROVED', async () => {
    vi.useFakeTimers();
    const p = fileLeashRequest(shell, { ...base, delayMs: 300 });
    button('[ FILE REQUEST ]').click();
    await vi.advanceTimersByTimeAsync(250);
    expect(text()).toContain('APPROVED');
    await vi.advanceTimersByTimeAsync(100);
    await p;
  });

  it('numbers are hidden unless showRawValues', () => {
    const cost = { trust: 15, affinity: 10, stress: 15, failChance: 0.25 };
    void fileLeashRequest(shell, { ...base, cost, showNumbers: false });
    const hidden = layer.querySelector('[data-line="consequence"]')!.textContent!;
    expect(hidden).not.toMatch(/15|10|25|%/);
    expect(hidden).toMatch(/TRUST/);
    expect(hidden).toMatch(/MAY FAIL/);
    shell.closeModal();
    void fileLeashRequest(shell, { ...base, cost, showNumbers: true });
    const shown = layer.querySelector('[data-line="consequence"]')!.textContent!;
    expect(shown).toContain('TRUST −15');
    expect(shown).toContain('AFFINITY −10');
    expect(shown).toContain('STRESS +15');
    expect(shown).toContain('25%');
  });

  it('a certain burst says nothing about failing; suppress and terminate describe their own consequence', () => {
    void fileLeashRequest(shell, { ...base, cost: { trust: 15, affinity: 10, stress: 15, failChance: 0 } });
    expect(layer.querySelector('[data-line="consequence"]')!.textContent).not.toMatch(/FAIL/);
    shell.closeModal();
    void fileLeashRequest(shell, { ...base, kind: 'suppress', cost: { trust: 25, affinity: 0, stress: 10, failChance: 0 } });
    expect(layer.querySelector('[data-line="consequence"]')!.textContent).toMatch(/SQUAD/);
  });

  it('subject and grounds are plain text, never markup', () => {
    void fileLeashRequest(shell, { ...base, unitName: '<img src=x onerror=alert(1)>', cause: '<b>bold</b>' });
    expect(dialog()!.querySelector('img')).toBeNull();
    expect(dialog()!.querySelector('b')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
    expect(text()).toContain('<b>bold</b>');
  });
});
