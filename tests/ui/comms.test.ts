// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { h } from '../../src/ui/dom';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function render(opts: { state?: CampaignState | null; host?: HTMLElement } = {}) {
  const state = opts.state === undefined ? campaign(reg, 4) : opts.state;
  const ctx = { getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() };
  const host = opts.host ?? h('div');
  document.body.append(host);
  renderCommsTab(host, ctx);
  return { host, ctx, state, again: () => renderCommsTab(host, ctx), q: (sel: string) => host.querySelector<HTMLElement>(sel), qa: (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)] };
}
const msg = (from: string, text: string, read: boolean, over: Record<string, unknown> = {}) => ({ id: `m${Math.random()}`, from, text, day: 3, slot: 'evening' as const, read, ...over });

describe('COMMS tab', () => {
  it('lists named units only with unread dots', () => {
    const s = campaign(reg, 4);
    s.squad.find((u) => u.id === 'unit_dee')!.kind = 'grunt';
    s.dms[ANN] = [msg(ANN, 'hey', false), msg(ANN, 'you there?', false)];
    s.dms[BEA] = [msg('commander', 'hi', true), msg(BEA, 'hello', true)];
    const { qa, q } = render({ state: s });
    expect(qa('button[data-unit]').map((b) => b.dataset.unit)).toEqual([ANN, BEA, 'unit_cat']);
    expect(q(`button[data-unit="${ANN}"] .alius-dot`)!.getAttribute('aria-label')).toBe('2 unread');
    expect(q(`button[data-unit="${BEA}"] .alius-dot`)).toBeNull();
  });

  it('dead and deserted units are not contacts', () => {
    const s = campaign(reg, 4);
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    expect(render({ state: s }).qa('button[data-unit]').map((b) => b.dataset.unit)).not.toContain(BEA);
  });

  it('opening a thread shows it and calls onRead', () => {
    const s = campaign(reg, 4);
    s.dms[ANN] = [msg('commander', 'are you awake?', true), msg(ANN, 'barely', false)];
    const { q, qa, ctx } = render({ state: s });
    expect(q('.alius-thread')!.textContent).toMatch(/SELECT A CONTACT/i);
    q(`button[data-unit="${ANN}"]`)!.click();
    expect(ctx.onRead).toHaveBeenCalledWith(ANN);
    expect(qa('.alius-msg').map((m) => [m.classList.contains('is-commander'), m.querySelector('.alius-msg-text')!.textContent])).toEqual([[true, 'are you awake?'], [false, 'barely']]);
    expect(q('.alius-msg-meta')!.textContent).toContain('DAY 003 // EVENING');
  });

  it('a selected thread survives a re-render, and unread messages in it are marked read once', async () => {
    const s = campaign(reg, 4);
    const r = render({ state: s });
    r.q(`button[data-unit="${ANN}"]`)!.click();
    r.ctx.onRead.mockClear();
    s.dms[ANN] = [msg(ANN, 'new!', false)];
    r.again();
    expect(r.q('.alius-msg-text')!.textContent).toBe('new!');
    await Promise.resolve();
    expect(r.ctx.onRead).toHaveBeenCalledWith(ANN);
    r.ctx.onRead.mockClear();
    s.dms[ANN][0].read = true;
    r.again();
    await Promise.resolve();
    expect(r.ctx.onRead).not.toHaveBeenCalled();
  });

  it('send calls onSend and clears the box; Enter works too; empty is ignored', () => {
    const r = render();
    r.q(`button[data-unit="${ANN}"]`)!.click();
    const input = r.q('input[name="dm"]') as HTMLInputElement;
    input.value = '  hello there ';
    r.q('button[data-action="send"]')!.click();
    expect(r.ctx.onSend).toHaveBeenCalledWith(ANN, 'hello there');
    expect(input.value).toBe('');
    input.value = 'second';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(r.ctx.onSend).toHaveBeenLastCalledWith(ANN, 'second');
    input.value = '   ';
    r.q('button[data-action="send"]')!.click();
    expect(r.ctx.onSend).toHaveBeenCalledTimes(2);
  });

  it('message text is text, not markup', () => {
    const s = campaign(reg, 4);
    s.dms[ANN] = [msg(ANN, '<img src=x onerror=alert(1)><b>x</b>', true)];
    const r = render({ state: s });
    r.q(`button[data-unit="${ANN}"]`)!.click();
    expect(r.host.querySelector('img')).toBeNull();
    expect(r.host.querySelector('.alius-msg-text b')).toBeNull();
    expect(r.q('.alius-msg-text')!.textContent).toContain('<img');
  });

  it('proposal chips appear inside the thread of their unit and call onAnswer', () => {
    const s = campaign(reg, 4);
    s.proposals = [
      { id: 'q1', unitId: ANN, kind: 'date', from: 'unit', day: 3, channel: 'dm', targetState: 'flirting', needsDisclosure: false },
      { id: 'q2', unitId: BEA, kind: 'confide', from: 'unit', day: 3, channel: 'dm', targetState: 'confidant', needsDisclosure: false },
      { id: 'q3', unitId: ANN, kind: 'fwb', from: 'unit', day: 3, channel: 'scene', targetState: 'fwb', needsDisclosure: false },
    ];
    const r = render({ state: s });
    r.q(`button[data-unit="${ANN}"]`)!.click();
    expect(r.q('.alius-chips')!.textContent).toContain('ANN PROPOSES: DATE');
    expect(r.q('.alius-chips')!.textContent).not.toContain('CONFIDE');
    expect(r.q('.alius-chips')!.textContent).not.toContain('FWB');
    expect(r.qa('.alius-chips button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]', '[NOT NOW]']);
    r.qa('.alius-chips button')[0].click();
    expect(r.ctx.onAnswer).toHaveBeenCalledWith('q1', 'accept');
  });

  it('a second romance asks OPENLY / SECRETLY', () => {
    const s = campaign(reg, 4);
    s.proposals = [{ id: 'q1', unitId: ANN, kind: 'date', from: 'unit', day: 3, channel: 'dm', targetState: 'flirting', needsDisclosure: true }];
    const r = render({ state: s });
    r.q(`button[data-unit="${ANN}"]`)!.click();
    expect(r.qa('.alius-chips button').map((b) => b.textContent)).toEqual(['[OPENLY]', '[SECRETLY]', '[NOT NOW]']);
    r.qa('.alius-chips button')[1].click();
    expect(r.ctx.onAnswer).toHaveBeenCalledWith('q1', 'accept_secret');
  });

  it('no campaign and no contacts show a message', () => {
    expect(render({ state: null }).host.textContent).toMatch(/NO ACTIVE CAMPAIGN/);
    const s = campaign(reg, 4);
    s.squad.forEach((u) => { u.kind = 'grunt'; });
    expect(render({ state: s }).host.textContent).toMatch(/NO CONTACTS/);
  });
});
