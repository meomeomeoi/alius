// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createShell, type ShellDeps } from '../../src/ui/shell/shell';
import { FakeStAdapter } from '../../src/st/fake';
import { createCampaign } from '../../src/engine/state/create';
import type { CampaignState } from '../../src/engine/state/types';
import type { LoadResult } from '../../src/st/persistence';

const CHAT = { chatId: 'c', isGroup: true, groupId: 'g' };
let shells: Array<{ destroy(): void }> = [];

function setup(
  opts: { settings?: Record<string, unknown>; load?: LoadResult; state?: CampaignState | null; extra?: Partial<ShellDeps> } = {},
) {
  const st = new FakeStAdapter(CHAT);
  st.profiles = [{ id: 'mech', name: 'Mech profile', api: 'openrouter', model: 'm' }];
  Object.assign(st.settings, opts.settings ?? {});
  const state = opts.state === undefined ? createCampaign({ seed: 1, commanderName: 'Vale' }) : opts.state;
  const load: LoadResult = opts.load ?? (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' });
  const replaceState = vi.fn();
  const shell = createShell({ st, getState: () => state, getLoad: () => load, replaceState, ...opts.extra });
  shells.push(shell);
  return { st, shell, state, replaceState };
}

const root = () => document.getElementById('alius-shell');
const tabs = () => [...document.querySelectorAll<HTMLElement>('#alius-shell .alius-tab')];
const selected = () => document.querySelector('#alius-shell .alius-tab[aria-selected="true"]')?.textContent;
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

afterEach(() => {
  shells.forEach((s) => s.destroy());
  shells = [];
  document.body.innerHTML = '';
});

describe('shell', () => {
  it('open mounts #alius-shell and close removes it', () => {
    const { shell } = setup();
    expect(root()).toBeNull();
    shell.open();
    expect(root()).not.toBeNull();
    expect(shell.isOpen()).toBe(true);
    shell.open(); // idempotent
    expect(document.querySelectorAll('#alius-shell')).toHaveLength(1);
    shell.close();
    expect(root()).toBeNull();
    expect(shell.isOpen()).toBe(false);
  });

  it('eight tabs in the specified order and labels', () => {
    const { shell } = setup();
    shell.open();
    expect(tabs().map((t) => t.textContent)).toEqual(['SQUAD', 'OPS', 'MAP', 'COMMS', 'BASE', 'INV', 'LOG', 'SYS']);
    expect(document.querySelector('#alius-shell [role="tablist"]')!.textContent).toBe(
      'SQUAD · OPS · MAP · COMMS · BASE · INV · LOG · SYS',
    );
    expect(selected()).toBe('SQUAD');
  });

  it('digit 3 selects MAP', () => {
    const { shell } = setup();
    shell.open();
    key(document.body, '3');
    expect(selected()).toBe('MAP');
  });

  it('digits are ignored while typing in a field', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    const input = document.querySelector<HTMLInputElement>('#alius-shell input[type="number"]')!;
    key(input, '3');
    expect(selected()).toBe('SYS');
  });

  it('ArrowRight on SYS wraps to SQUAD, ArrowLeft on SQUAD wraps to SYS', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    key(tabs()[7], 'ArrowRight');
    expect(selected()).toBe('SQUAD');
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0], 'ArrowLeft');
    expect(selected()).toBe('SYS');
  });

  it('unregistered tab shows stub text', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('map');
    expect(document.querySelector('#alius-shell .alius-screen')!.textContent).toContain('NO DATA // MODULE OFFLINE');
  });

  it('a registered tab renders its content, also if registered while shown', () => {
    const { shell } = setup();
    shell.open();
    shell.registerTab('squad', (host) => { host.textContent = 'ROSTER HERE'; });
    expect(document.querySelector('#alius-shell .alius-screen')!.textContent).toBe('ROSTER HERE');
  });

  it('other screens show an offline stub; pda brings the tabs back', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('combat');
    expect(document.querySelector('#alius-shell .alius-view')!.textContent).toContain('MODULE OFFLINE');
    expect(tabs()).toHaveLength(0);
    shell.showScreen('pda');
    expect(tabs()).toHaveLength(8);
  });

  it('palette sets data-palette and persists in settings', () => {
    const { shell, st } = setup();
    shell.open();
    expect(root()!.dataset.palette).toBe('amber');
    shell.setPalette('green');
    expect(root()!.dataset.palette).toBe('green');
    expect(st.settings.palette).toBe('green');
    shell.close();
    shell.open();
    expect(root()!.dataset.palette).toBe('green');
  });

  it('scanlines and flicker classes follow settings', () => {
    const { shell } = setup({ settings: { scanlines: true, flicker: true } });
    shell.open();
    expect(root()!.classList.contains('alius-scanlines')).toBe(true);
    expect(root()!.classList.contains('alius-flicker')).toBe(true);
  });

  it('modal resolves with clicked value and Escape resolves null', async () => {
    const { shell } = setup();
    shell.open();
    const p1 = shell.modal({ title: 'Sure?', body: 'Really?', actions: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] });
    const dialog = document.querySelector('#alius-shell [role="dialog"]')!;
    expect(dialog.textContent).toContain('Really?');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Yes')!.click();
    expect(await p1).toBe('yes');
    expect(document.querySelector('#alius-shell [role="dialog"]')).toBeNull();

    const p2 = shell.modal({ title: 'T', body: document.createTextNode('b'), actions: [{ label: 'OK', value: 'ok' }] });
    key(document.body, 'Escape');
    expect(await p2).toBeNull();
    expect(shell.isOpen()).toBe(true); // Escape closes the modal, not the shell
  });

  it('Escape without a modal does not close the shell', () => {
    const { shell } = setup();
    shell.open();
    key(document.body, 'Escape');
    expect(shell.isOpen()).toBe(true);
  });

  it('Alt+Shift+A toggles the shell globally', () => {
    const { shell } = setup();
    key(document.body, 'A', { altKey: true, shiftKey: true, code: 'KeyA' });
    expect(shell.isOpen()).toBe(true);
    key(document.body, 'A', { altKey: true, shiftKey: true, code: 'KeyA' });
    expect(shell.isOpen()).toBe(false);
  });

  it('toasts show inside the open shell and fall back to SillyTavern when closed', () => {
    const { shell, st } = setup();
    shell.toast('info', 'closed one');
    expect(st.toasts).toEqual([{ kind: 'info', text: 'closed one' }]);
    shell.open();
    shell.toast('error', 'open one');
    expect(document.querySelector('#alius-shell .alius-toast')!.textContent).toContain('open one');
    expect(st.toasts).toHaveLength(1);
  });

  it('readonly banner shows reason', () => {
    const { shell } = setup({ state: null, load: { kind: 'readonly', reason: 'state version 99 is newer', chatId: 'c' } });
    shell.open();
    expect(document.querySelector('#alius-shell .alius-banner')!.textContent).toContain('state version 99 is newer');
  });

  it('no banner for a healthy campaign', () => {
    const { shell } = setup();
    shell.open();
    expect(document.querySelector('#alius-shell .alius-banner')).toBeNull();
  });
});

describe('focus', () => {
  it('open moves focus into the shell and close gives it back', () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    ta.focus();
    const { shell } = setup();
    shell.open();
    expect(root()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(tabs()[0]);
    key(document.activeElement!, '3'); // not an editable field: the hotkey works
    expect(selected()).toBe('MAP');
    shell.close();
    expect(document.activeElement).toBe(ta);
  });
});

describe('SYS tab', () => {
  it('lists connection profiles and saves a changed setting', () => {
    const { shell, st } = setup();
    shell.open();
    shell.showTab('sys');
    const select = document.querySelector<HTMLSelectElement>('#alius-shell select[name="mechanicProfileId"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'mech']);
    select.value = 'mech';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.mechanicProfileId).toBe('mech');
    expect(st.settingsSaves).toBeGreaterThan(0);
  });

  it('changing the palette in SYS restyles the shell', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    const select = document.querySelector<HTMLSelectElement>('#alius-shell select[name="palette"]')!;
    select.value = 'white';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root()!.dataset.palette).toBe('white');
  });

  it('has one budget input per call type', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    expect(document.querySelectorAll('#alius-shell input[name^="budget:"]')).toHaveLength(12);
  });

  it('debug panel is hidden unless debug is on', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    expect(document.querySelector('#alius-shell .alius-debug')).toBeNull();
  });

  it('state editor is read-only while editLock is on', () => {
    const { shell } = setup({ settings: { debug: true, editLock: true } });
    shell.open();
    shell.showTab('sys');
    const view = document.querySelector('#alius-shell pre.alius-state-view')!;
    expect(JSON.parse(view.textContent!).version).toBe(1);
    expect(document.querySelector('#alius-shell textarea')).toBeNull();
    expect([...document.querySelectorAll('#alius-shell button')].some((b) => b.textContent === 'Apply')).toBe(false);
  });

  it('with editLock off the state is editable; invalid JSON is refused with a toast', () => {
    const { shell, replaceState } = setup({ settings: { debug: true, editLock: false } });
    shell.open();
    shell.showTab('sys');
    const ta = document.querySelector<HTMLTextAreaElement>('#alius-shell textarea.alius-state-editor')!;
    const apply = [...document.querySelectorAll<HTMLButtonElement>('#alius-shell button')].find((b) => b.textContent === 'Apply')!;
    ta.value = '{ not json';
    apply.click();
    expect(replaceState).not.toHaveBeenCalled();
    expect(document.querySelector('#alius-shell .alius-toast')!.textContent).toMatch(/invalid/i);

    ta.value = JSON.stringify({ version: 99 });
    apply.click();
    expect(replaceState).not.toHaveBeenCalled();

    const edited = createCampaign({ seed: 1, commanderName: 'Vale' });
    edited.day = 9;
    ta.value = JSON.stringify(edited);
    apply.click();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0][0].day).toBe(9);
  });

  it('debug panel lists LLM log entries newest first', async () => {
    const { llmLog } = await import('../../src/llm/log');
    llmLog.clear();
    llmLog.push({ at: 1, callType: 'ping', profile: 'p', maxTokens: 1, prompt: 'first', raw: 'r1', ok: true, ms: 1 });
    llmLog.push({ at: 2, callType: 'flavor', profile: 'p', maxTokens: 1, prompt: 'second', raw: 'r2', ok: false, ms: 1 });
    const { shell } = setup({ settings: { debug: true } });
    shell.open();
    shell.showTab('sys');
    const items = [...document.querySelectorAll('#alius-shell .alius-log-entry')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('flavor');
    expect(items[1].textContent).toContain('ping');
    llmLog.clear();
  });

  it('export and import buttons exist', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    const labels = [...document.querySelectorAll('#alius-shell button')].map((b) => b.textContent);
    expect(labels).toContain('Export campaign');
    expect(labels).toContain('Import campaign');
  });

  it('debug panel lists content errors', () => {
    const { shell } = setup({
      settings: { debug: true },
      extra: { getContentErrors: () => [{ pack: 'core', file: 'flags.json', path: '[1].scope', message: 'Invalid enum value' }] },
    });
    shell.open();
    shell.showTab('sys');
    const text = document.querySelector('#alius-shell .alius-content-errors')!.textContent!;
    expect(text).toContain('core');
    expect(text).toContain('flags.json');
    expect(text).toContain('[1].scope');
    expect(text).toContain('Invalid enum value');
  });

  it('debug panel runs the debug tools it is given', () => {
    const run = vi.fn();
    const { shell } = setup({ settings: { debug: true }, extra: { debugTools: [{ label: 'Set test directive', run }] } });
    shell.open();
    shell.showTab('sys');
    const btn = [...document.querySelectorAll<HTMLButtonElement>('#alius-shell .alius-debug button')].find((b) => b.textContent === 'Set test directive')!;
    btn.click();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('SYS tab P2 settings', () => {
  it('has toggles for companion vignettes and generated grunt names', () => {
    const { shell } = setup();
    shell.open();
    shell.showTab('sys');
    for (const name of ['activityFlavor', 'gruntFlavor']) {
      const box = document.querySelector(`#alius-shell input[name="${name}"]`) as HTMLInputElement | null;
      expect(box, name).not.toBeNull();
      expect(box!.checked).toBe(true);
    }
  });
});

describe('status header in the PDA', () => {
  it('shows the clock above the tabs and follows refresh()', () => {
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const { shell } = setup({ state });
    shell.open();
    const header = () => document.querySelector('#alius-shell .alius-status')?.textContent ?? '';
    expect(header()).toContain('DAY 001 // MORNING');
    state.day = 5;
    state.slot = 'evening';
    state.resources.credits = 77;
    shell.refresh();
    expect(header()).toContain('DAY 005 // EVENING');
    expect(header()).toContain('CR 77');
  });

  it('is not shown on other screens', () => {
    const { shell } = setup();
    shell.open();
    shell.showScreen('setup');
    expect(document.querySelector('#alius-shell .alius-status')).toBeNull();
  });
});

describe('P3 shell additions', () => {
  const comms = () => document.querySelector<HTMLElement>('#alius-shell #alius-tab-comms')!;

  it('setTabBadge shows and clears a count', () => {
    const { shell } = setup();
    shell.open();
    shell.setTabBadge('comms', 3);
    expect(comms().querySelector('.alius-badge')!.textContent).toBe('3');
    expect(comms().getAttribute('aria-label')).toBe('COMMS, 3 unread');
    shell.setTabBadge('comms', 0);
    expect(comms().querySelector('.alius-badge')).toBeNull();
    expect(comms().getAttribute('aria-label')).toBeNull();
  });

  it('a badge set before the shell opens, and one that survives a re-render', () => {
    const { shell } = setup();
    shell.setTabBadge('comms', 2);
    shell.open();
    expect(comms().querySelector('.alius-badge')!.textContent).toBe('2');
    shell.showScreen('setup');
    shell.showScreen('pda');
    expect(comms().querySelector('.alius-badge')!.textContent).toBe('2');
    shell.setTabBadge('comms', 120);
    expect(comms().querySelector('.alius-badge')!.textContent).toBe('99+');
  });

  it('a screen with a refresh handler is updated in place, and re-rendered when the handler declines', () => {
    const { shell } = setup();
    let renders = 0;
    let refreshes = 0;
    let handled = true;
    shell.registerScreen('scene', (host) => { renders++; host.append(document.createElement('p')); }, { refresh: () => { refreshes++; return handled; } });
    shell.open();
    shell.showScreen('scene');
    expect([renders, refreshes]).toEqual([1, 0]);
    const p = document.querySelector('#alius-shell .alius-view p')!;
    shell.refresh();
    expect([renders, refreshes]).toEqual([1, 1]);
    expect(document.querySelector('#alius-shell .alius-view p')).toBe(p);
    handled = false;
    shell.refresh();
    expect([renders, refreshes]).toEqual([2, 2]);
    shell.showScreen('scene'); // an explicit visit always renders fresh
    expect(renders).toBe(3);
  });

  it('SYS reports a changed setting to the app', () => {
    const onSettingsChanged = vi.fn();
    const { shell } = setup({ extra: { onSettingsChanged } });
    shell.open();
    shell.showTab('sys');
    const box = document.querySelector<HTMLInputElement>('#alius-shell input[name="romance"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSettingsChanged).toHaveBeenCalled();
  });

  it('P3 settings fields round-trip', () => {
    const { shell, st } = setup();
    shell.open();
    shell.showTab('sys');
    const input = (name: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`#alius-shell [name="${name}"]`)!;
    const change = (el: HTMLInputElement | HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const toggle = (el: HTMLInputElement) => { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); };
    expect((input('intentMode') as HTMLSelectElement).value).toBe('exchange');
    change(input('intentMode'), 'every_n');
    change(input('intentEveryN'), '5');
    change(input('intentMinConfidence'), '0.3');
    change(input('scenePacing'), '12');
    change(input('typingSpeed'), '0');
    change(input('romanticInitiative'), 'high');
    toggle(input('romance') as HTMLInputElement);
    toggle(input('explicitContent') as HTMLInputElement);
    toggle(input('unitDms') as HTMLInputElement);
    toggle(input('chronicleCompaction') as HTMLInputElement);
    expect(st.settings).toMatchObject({
      intentMode: 'every_n', intentEveryN: 5, intentMinConfidence: 0.3, scenePacing: 12, typingSpeed: 0, romanticInitiative: 'high',
      romance: false, explicitContent: true, unitDms: false, chronicleCompaction: false,
    });
  });

  it('invalid numbers snap back to a valid value', () => {
    const { shell, st } = setup();
    shell.open();
    shell.showTab('sys');
    const input = document.querySelector<HTMLInputElement>('#alius-shell input[name="intentEveryN"]')!;
    input.value = '99';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.intentEveryN).toBe(3);
    expect(input.value).toBe('3');
    const conf = document.querySelector<HTMLInputElement>('#alius-shell input[name="intentMinConfidence"]')!;
    conf.value = '7';
    conf.dispatchEvent(new Event('change', { bubbles: true }));
    expect(conf.value).toBe('0.5');
  });
});

describe('SYS combat settings', () => {
  it('shows the campaign difficulty and changes it through the engine', () => {
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
      state.difficulty = (action.payload as { difficulty: CampaignState['difficulty'] }).difficulty;
      return [{ type: 'difficulty_changed' }];
    });
    const { shell } = setup({ state, extra: { dispatch } });
    shell.open();
    shell.showTab('sys');
    const select = document.querySelector<HTMLSelectElement>('#alius-shell select[name="difficulty"]')!;
    expect(select.value).toBe('normal');
    expect([...select.options].map((o) => o.value)).toEqual(['story', 'normal', 'hard']);
    select.value = 'hard';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'campaign/set_difficulty', payload: { difficulty: 'hard' } });
    expect(state.difficulty).toBe('hard');
  });

  it('a refused change (combat open) snaps the select back and says why', () => {
    const state = createCampaign({ seed: 1, commanderName: 'Vale' });
    const dispatch = vi.fn(() => [{ type: 'error', message: 'The difficulty cannot change during a combat.' }]);
    const { shell } = setup({ state, extra: { dispatch } });
    shell.open();
    shell.showTab('sys');
    const select = document.querySelector<HTMLSelectElement>('#alius-shell select[name="difficulty"]')!;
    select.value = 'story';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(select.value).toBe('normal');
    expect(document.body.textContent).toContain('cannot change during a combat');
  });

  it('is disabled without a campaign; easy retry and enemy names are plain settings', () => {
    const { shell, st } = setup({ state: null });
    shell.open();
    shell.showTab('sys');
    expect(document.querySelector<HTMLSelectElement>('#alius-shell select[name="difficulty"]')!.disabled).toBe(true);
    const easy = document.querySelector<HTMLInputElement>('#alius-shell input[name="easyRetry"]')!;
    expect(easy.checked).toBe(false);
    easy.checked = true;
    easy.dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.easyRetry).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#alius-shell input[name="enemyFlavor"]')!.checked).toBe(false);
  });

  it('SYS shows the world settings: director, beat cooldown and expedition recap', () => {
    const { shell, st } = setup({});
    shell.open();
    shell.showTab('sys');
    const box = (name: string) => document.querySelector<HTMLInputElement>(`#alius-shell input[name="${name}"]`)!;
    expect(box('directorEnabled').checked).toBe(true);
    expect(box('expeditionRecap').checked).toBe(true);
    expect(box('beatCooldownDays').value).toBe('3');
    box('directorEnabled').checked = false;
    box('directorEnabled').dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.directorEnabled).toBe(false);
    box('expeditionRecap').checked = false;
    box('expeditionRecap').dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.expeditionRecap).toBe(false);
    box('beatCooldownDays').value = '9';
    box('beatCooldownDays').dispatchEvent(new Event('change', { bubbles: true }));
    expect(st.settings.beatCooldownDays).toBe(9);
    // a value the settings reject snaps back to what is stored
    box('beatCooldownDays').value = '50';
    box('beatCooldownDays').dispatchEvent(new Event('change', { bubbles: true }));
    expect(box('beatCooldownDays').value).toBe('9');
    expect(st.settings.beatCooldownDays).toBe(9);
  });
});
