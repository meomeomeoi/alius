// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { createCampaign } from '../../src/engine/state/create';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { createShell } from '../../src/ui/shell/shell';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, loadCore } from '../helpers/world';


let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
let shells: Array<{ destroy(): void }> = [];
afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});

const CHAT = { chatId: 'c', isGroup: true, groupId: 'g' };
function setup() {
  const st = new FakeStAdapter(CHAT);
  const state = createCampaign({ seed: 1, commanderName: 'Vale' });
  const shell = createShell({ st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), replaceState: vi.fn() });
  shells.push(shell);
  shell.open();
  return shell;
}
const tab = (id: string) => document.getElementById(`alius-tab-${id}`) as HTMLElement;
const selected = () => document.querySelector('#alius-shell .alius-tab[aria-selected="true"]')?.id;
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('locked tabs', () => {
  it('a locked tab reads OFFLINE, is aria-disabled and showTab does nothing', () => {
    const shell = setup();
    shell.showTab('squad');
    shell.setTabLocked('ops', true);
    expect(tab('ops').textContent).toContain('OFFLINE');
    expect(tab('ops').textContent).toContain('OPS');
    expect(tab('ops').getAttribute('aria-disabled')).toBe('true');
    expect(tab('squad').getAttribute('aria-disabled')).toBeNull();
    shell.showTab('ops');
    expect(selected()).toBe('alius-tab-squad');
    tab('ops').click();
    expect(selected()).toBe('alius-tab-squad');
  });

  it('unlocking brings the tab back', () => {
    const shell = setup();
    shell.setTabLocked('ops', true);
    shell.setTabLocked('ops', false);
    expect(tab('ops').textContent).not.toContain('OFFLINE');
    expect(tab('ops').getAttribute('aria-disabled')).toBeNull();
    shell.showTab('ops');
    expect(selected()).toBe('alius-tab-ops');
  });

  it('digit key on a locked tab does nothing', () => {
    const shell = setup();
    shell.showTab('squad');
    shell.setTabLocked('ops', true); // key 2
    key('2');
    expect(selected()).toBe('alius-tab-squad');
    key('1');
    key('4'); // comms stays open
    expect(selected()).toBe('alius-tab-comms');
    shell.setTabLocked('ops', false);
    key('2');
    expect(selected()).toBe('alius-tab-ops');
  });

  it('the arrow keys step over a locked tab', () => {
    const shell = setup();
    shell.showTab('squad');
    shell.setTabLocked('ops', true);
    tab('squad').focus();
    tab('squad').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(selected()).toBe('alius-tab-map');
  });

  it('a locked tab survives a rebuild of the device layer', () => {
    const shell = setup();
    shell.setTabLocked('base', true);
    shell.showScreen('hub');
    shell.showScreen('pda');
    expect(tab('base').textContent).toContain('OFFLINE');
  });

  it('locking is idempotent and ignores nothing else', () => {
    const shell = setup();
    shell.setTabLocked('inv', true);
    shell.setTabLocked('inv', true);
    expect(document.querySelectorAll('#alius-shell .alius-offline')).toHaveLength(1);
  });
});

describe('the room panel while OPS is locked', () => {
  function mount(opts: { prologue: boolean }) {
    const state = opts.prologue ? campaign(reg, 4, { onboarding: 'prologue' }) : campaign(reg, 4);
    state.squad[0].status = 'injured'; // she is in the medbay
    const ctx: HubCtx = {
      getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
      ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() } as never,
      onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null,
    };
    const host = h('div');
    document.body.append(host);
    renderHub(host, h('div'), ctx);
    (host.querySelector('.alius-room[data-room="medbay"]') as HTMLElement).click();
    return host.querySelector('.alius-room-panel')!;
  }

  it('hides the activity cards (TALK stays)', () => {
    const locked = mount({ prologue: true });
    expect(locked.querySelector('.alius-activity')).toBeNull();
    expect(locked.querySelector('[data-talk]')).not.toBeNull();
  });

  it('shows them once OPS is open or in a campaign without a prologue', () => {
    expect(mount({ prologue: false }).querySelector('.alius-activity')).not.toBeNull();
  });
});

describe('locking the tab that is showing', () => {
  it('moves to the first open tab instead of leaving a module usable behind its OFFLINE label', () => {
    const shell = setup();
    shell.showTab('ops');
    expect(selected()).toBe('alius-tab-ops');
    shell.setTabLocked('ops', true);
    expect(selected()).toBe('alius-tab-home'); // P10b: HOME is first, and never locked
    expect(document.querySelector('#alius-shell .alius-screen')!.textContent).not.toMatch(/ACTIVITIES|REQUISITION/);
  });
});

describe('the OFFLINE label is analysable', () => {
  it('carries glossary:module_offline', () => {
    const shell = setup();
    shell.setTabLocked('ops', true);
    expect(document.querySelector('#alius-tab-ops .alius-offline')!.getAttribute('data-analyze')).toBe('glossary:module_offline');
  });
});

describe('locked tabs with HOME first (P10b)', () => {
  it('a locked tab stays locked, and the tabs around it still work', () => {
    const shell = setup();
    shell.showTab('home');
    shell.setTabLocked('squad', true);
    shell.setTabLocked('ops', true);
    key('1');
    expect(selected()).toBe('alius-tab-home');
    key('0');
    expect(selected()).toBe('alius-tab-home');
    key('3');
    expect(selected()).toBe('alius-tab-map');
  });

  it('HOME is never locked: not by the shell, not by the unlock rules', async () => {
    const shell = setup();
    shell.setTabLocked('home', true);
    expect(tab('home').getAttribute('aria-disabled')).toBeNull();
    expect(tab('home').textContent).not.toContain('OFFLINE');
    const { UI_TAB_IDS } = await import('../../src/content/schemas');
    expect(UI_TAB_IDS as readonly string[]).not.toContain('home');
  });
});
