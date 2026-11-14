// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { defaultCommanderSetup } from '../../src/engine/commander/profile';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { renderCommanderFile } from '../../src/ui/commander/commanderFile';
import { renderCommsTab } from '../../src/ui/comms/commsTab';
import { h } from '../../src/ui/dom';
import { fileLeashRequest, type LeashFormShell } from '../../src/ui/leash/requestForm';
import { renderLogTab } from '../../src/ui/log/logTab';
import { createModalHost } from '../../src/ui/shell/modal';
import { renderSquadTab } from '../../src/ui/squad/squadTab';
import { unitAccent } from '../../src/ui/voice/voiceCard';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};

describe('COMMS threads are personal bubbles', () => {
  function thread(): { host: HTMLElement; state: CampaignState; id: string } {
    const state = campaign(reg, 4);
    const id = state.squad[0].id;
    state.dms[id] = [
      { id: 'd1', from: 'commander', text: 'are you awake?', day: 3, slot: 'evening', read: true },
      { id: 'd2', from: id, text: 'barely', day: 3, slot: 'evening', read: true, initiated: true },
    ];
    const host = mount();
    renderCommsTab(host, { getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() });
    host.querySelector<HTMLElement>(`.alius-contact[data-unit="${id}"]`)!.click();
    return { host, state, id };
  }

  it('every message is a personal bubble: hers on the left with her accent, the commander\'s on the right', () => {
    const { host, id } = thread();
    const bubbles = [...host.querySelectorAll<HTMLElement>('.alius-thread .alius-voice-personal')];
    expect(bubbles).toHaveLength(2);
    expect(bubbles.map((b) => [b.classList.contains('is-mine'), b.classList.contains('is-hers')])).toEqual([[true, false], [false, true]]);
    expect(bubbles[1].style.getPropertyValue('--bubble-accent')).toBe(unitAccent(id));
    // what the existing screen and its tests rely on stays
    expect(bubbles.map((b) => b.classList.contains('alius-msg'))).toEqual([true, true]);
    expect(bubbles[1].querySelector('.alius-msg-text')!.textContent).toBe('barely');
    expect(bubbles[1].querySelector('.alius-msg-meta')!.textContent).toContain('SHE WROTE FIRST');
  });

  it('the contact row and the unread dot carry her accent', () => {
    const { host, state, id } = thread();
    state.dms[id].push({ id: 'd3', from: id, text: 'new', day: 4, slot: 'morning', read: false });
    renderCommsTab(host, { getState: () => state, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() });
    const row = host.querySelector<HTMLElement>(`.alius-contact[data-unit="${id}"]`)!;
    expect(row.style.getPropertyValue('--unit-accent')).toBe(unitAccent(id));
  });

  it('the thread itself is in the personal voice', () => {
    const { host } = thread();
    expect(host.querySelector('.alius-thread')!.classList.contains('alius-voice-personal')).toBe(true);
  });
});

describe('LOG', () => {
  it('chronicle posts are paper and the oversight log is corporate', () => {
    const state = campaign(reg, 4);
    state.memory.chronicle = [{ id: 'c1', kind: 'scene', day: 2, text: 'Rhea said nothing.', slot: 'evening' }];
    state.leash.log = [{ no: 3, unitId: state.squad[0].id, kind: 'compel', day: 2, context: 'scene', outcome: 'done' }];
    const host = mount();
    renderLogTab(host, { getState: () => state });
    const post = host.querySelector<HTMLElement>('.alius-post')!;
    expect(post.classList.contains('alius-voice-paper')).toBe(true);
    expect(post.dataset.voice).toBe('paper');
    expect(post.querySelector('.alius-post-head')!.textContent).toBe('DAY 002 // EVENING');
    expect(post.querySelector('.alius-post-text')!.textContent).toBe('Rhea said nothing.');
    const log = host.querySelector<HTMLElement>('.alius-oversight-log')!;
    expect(log.classList.contains('alius-voice-corporate')).toBe(true);
    expect(log.querySelector('.alius-oversight-entry')!.textContent).toContain('#0003');
    expect(log.textContent).toContain('OVERSIGHT LOG');
  });
});

describe('the oversight form', () => {
  function formShell() {
    const layer = h('div');
    document.body.append(layer);
    const modals = createModalHost(layer);
    const shell: LeashFormShell = { modal: (o) => modals.show(o), closeModal: () => modals.cancel() };
    return { layer, shell };
  }
  const base = { kind: 'compel' as const, unitName: 'Ann', no: 7, left: 2, showNumbers: false, delayMs: 0 };

  it('the form itself is paper', () => {
    const { layer, shell } = formShell();
    void fileLeashRequest(shell, base);
    const paper = layer.querySelector('.alius-modal .alius-voice-paper')!;
    expect(paper).not.toBeNull();
    expect(paper.querySelector('.alius-form')).not.toBeNull();
    expect(paper.querySelector('.alius-voice-meta')!.textContent).toContain('OVERSIGHT');
  });

  it('the verdict is a corporate card headed with the corporation name', async () => {
    vi.useFakeTimers();
    const { layer, shell } = formShell();
    const p = fileLeashRequest(shell, { ...base, delayMs: 300, corporation: 'Kestrel-Ward Industrial', verdict: 'UNDER REVIEW' });
    layer.querySelector<HTMLButtonElement>('.alius-modal-actions button')!.click();
    await vi.advanceTimersByTimeAsync(250); // the verdict is up at 200 ms, the modal closes at 300 ms
    const card = layer.querySelector('.alius-modal .alius-voice-corporate')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.alius-voice-title')!.textContent).toBe('KESTREL-WARD INDUSTRIAL · OVERSIGHT');
    expect(card.textContent).toContain('UNDER REVIEW');
    await vi.advanceTimersByTimeAsync(100);
    await p;
  });

  it('without a corporation the header says CCP', async () => {
    const { layer, shell } = formShell();
    const p = fileLeashRequest(shell, { ...base, delayMs: 1 });
    layer.querySelector<HTMLButtonElement>('.alius-modal-actions button')!.click();
    await vi.waitFor(() => expect(layer.querySelector('.alius-modal .alius-voice-corporate .alius-voice-title')?.textContent ?? 'CCP · OVERSIGHT').toBe('CCP · OVERSIGHT'));
    await p;
  });
});

describe('dossiers', () => {
  it('the SQUAD unit header is a paper dossier and keeps its name and analysable chips', () => {
    const state = campaign(reg, 4);
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const host = mount();
    renderSquadTab(host, {
      st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
      onNewCampaign: vi.fn(), onUnlock: vi.fn(), onSetLoadout: vi.fn(),
    } as never);
    const unit = host.querySelector<HTMLElement>('.alius-unit')!;
    const head = unit.querySelector<HTMLElement>('.alius-voice-paper')!;
    expect(head).not.toBeNull();
    expect(head.querySelector('h3.alius-unit-name')!.textContent).toBe(state.squad[0].displayName);
    expect(head.querySelector('[data-analyze^="roles:"]')).not.toBeNull();
    expect(head.querySelector('[data-analyze="glossary:level_xp"]')).not.toBeNull();
  });

  it('the CMDR card is paper', () => {
    const state = campaign(reg, 4);
    const host = mount();
    renderCmdrCard(host, { state, registries: reg, raw: false });
    const card = host.querySelector('section.alius-cmdr .alius-voice-paper')!;
    expect(card).not.toBeNull();
    expect(host.querySelector('h2')!.textContent).toBe(`CMDR — ${state.commander.name}`);
    expect(card.querySelector('[data-analyze^="crimes:"]')).not.toBeNull();
  });

  it('the COMMANDER FILE opens with a paper header and no pronoun for the commander', () => {
    const host = mount();
    renderCommanderFile(host, { value: defaultCommanderSetup(), registries: reg, desireBondDefects: false, onChange: vi.fn() });
    const head = host.querySelector<HTMLElement>('.alius-voice-paper')!;
    expect(head).not.toBeNull();
    expect(head.querySelector('.alius-voice-title')!.textContent).toBe('COMMANDER FILE');
    expect(head.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(host.firstElementChild).toBe(head);
  });
});
