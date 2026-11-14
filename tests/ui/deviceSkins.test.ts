// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entry, Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { getSettings } from '../../src/settings';
import { pickSkin, screenBox } from '../../src/ui/device/skins';
import { renderSysTab } from '../../src/ui/shell/sysTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const withSkins = (extra: Entry[]): Registries => ({ ...reg, deviceSkins: new Map([...reg.deviceSkins, ...extra.map((e): [string, Entry] => [e.id as string, e])]) });
const css = (id: string, bindTo?: Entry['bindTo']): Entry => ({ id, name: id, description: 'd', kind: 'css', cssPreset: 'kestrel', ledColor: '#ffffff', accent: '#ffffff', ...(bindTo ? { bindTo } : {}) });

describe('pickSkin', () => {
  it('a Kestrel campaign gets kestrel, a Vesper campaign vesper', () => {
    const k = campaign(reg, 4, { startId: 'start_kestrel' });
    const v = campaign(reg, 4, { startId: 'start_vesper' });
    expect(k.commander.corporationId).toBe('kestrel');
    expect(pickSkin(k, reg, '').id).toBe('kestrel');
    expect(pickSkin(v, reg, '').id).toBe('vesper');
  });

  it('an Aurum or null corporation gets ccp_standard', () => {
    const s = campaign(reg, 4);
    s.commander.corporationId = 'aurum';
    expect(pickSkin(s, reg, '').id).toBe('ccp_standard');
    s.commander.corporationId = null;
    expect(pickSkin(s, reg, '').id).toBe('ccp_standard');
  });

  it('the override wins, an override that is not a skin is ignored', () => {
    const k = campaign(reg, 4, { startId: 'start_kestrel' });
    expect(pickSkin(k, reg, 'vesper').id).toBe('vesper');
    expect(pickSkin(k, reg, 'ghost').id).toBe('kestrel');
  });

  it('a trait binding beats the corporation, a flag binding beats the corporation, a trait beats a flag', () => {
    const traitId = [...reg.commanderTraits.keys()][0];
    const r = withSkins([css('by_trait', { traitId }), css('by_flag', { unlockFlag: 'gift_device' })]);
    const k = campaign(reg, 4, { startId: 'start_kestrel' });
    k.world.flags = ['gift_device'];
    expect(pickSkin(k, r, '').id).toBe('by_flag');
    k.commander.traits = { regular: [traitId] };
    expect(pickSkin(k, r, '').id).toBe('by_trait');
    k.commander.traits = { regular: [] };
    k.world.flags = [];
    k.commander.flags = ['gift_device'];
    expect(pickSkin(k, r, '').id).toBe('by_flag'); // a commander flag counts as well
    k.commander.flags = [];
    expect(pickSkin(k, r, '').id).toBe('kestrel');
  });

  it('ties go to registry order', () => {
    const r = withSkins([css('second_kestrel', { corporationId: 'kestrel' })]);
    expect(pickSkin(campaign(reg, 4, { startId: 'start_kestrel' }), r, '').id).toBe('kestrel');
  });

  it('with no campaign: the override or ccp_standard', () => {
    expect(pickSkin(null, reg, '').id).toBe('ccp_standard');
    expect(pickSkin(null, reg, 'vesper').id).toBe('vesper');
    expect(pickSkin(null, reg, 'ghost').id).toBe('ccp_standard');
  });

  it('a pack with no skins at all still yields an entry', () => {
    const none: Registries = { ...reg, deviceSkins: new Map() };
    expect(pickSkin(null, none, '').id).toBe('ccp_standard');
  });
});

describe('screenBox', () => {
  it('turns a screenRect into percentages of the frame', () => {
    const skin: Entry = { id: 'f', name: 'f', description: 'd', kind: 'image', frameImage: 'x.png', frameSize: { w: 1000, h: 1600 }, screenRect: { x: 100, y: 240, w: 800, h: 1200 }, ledColor: '#ffffff', accent: '#ffffff' };
    expect(screenBox(skin)).toEqual({ left: '10%', top: '15%', width: '80%', height: '75%' });
  });

  it('keeps up to three decimals and trims trailing zeros', () => {
    const skin: Entry = { id: 'f', name: 'f', description: 'd', kind: 'image', frameImage: 'x.png', frameSize: { w: 900, h: 1700 }, screenRect: { x: 100, y: 100, w: 700, h: 1500 }, ledColor: '#ffffff', accent: '#ffffff' };
    expect(screenBox(skin)).toEqual({ left: '11.111%', top: '5.882%', width: '77.778%', height: '88.235%' });
  });

  it('is null for a css skin', () => {
    expect(screenBox(reg.deviceSkins.get('kestrel')!)).toBeNull();
  });
});

describe('SYS device skin select', () => {
  function sys(state: CampaignState | null, st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' })) {
    const host = document.createElement('div');
    document.body.append(host);
    const onSettingsChanged = vi.fn();
    renderSysTab(host, { st, getState: () => state, getLoad: () => (state ? { kind: 'ok', state, chatId: 'c' } : { kind: 'none' }), getRegistries: () => reg, dispatch: () => [], toast: vi.fn(), modal: async () => null, onSettingsChanged });
    return { host, st, onSettingsChanged };
  }

  it('offers "Follow the campaign ({name})" and every skin by name, inside the Display group', () => {
    const k = campaign(reg, 4, { startId: 'start_kestrel' });
    const { host } = sys(k);
    const select = host.querySelector<HTMLSelectElement>('select[name="deviceSkin"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', ...reg.deviceSkins.keys()]);
    expect(select.options[0].textContent).toBe(`Follow the campaign (${String(reg.deviceSkins.get('kestrel')!.name)})`);
    expect(select.options[1].textContent).toBe(String(reg.deviceSkins.get('ccp_standard')!.name));
    expect(select.closest('label')!.getAttribute('data-analyze')).toBe('setting:deviceSkin');
    expect(select.value).toBe('');
  });

  it('choosing a skin stores it and tells the shell', () => {
    const { host, st, onSettingsChanged } = sys(campaign(reg, 4));
    const select = host.querySelector<HTMLSelectElement>('select[name="deviceSkin"]')!;
    select.value = 'vesper';
    select.dispatchEvent(new Event('change'));
    expect(getSettings(st).deviceSkin).toBe('vesper');
    expect(onSettingsChanged).toHaveBeenCalled();
  });

  it('a stored skin that the pack no longer has reads as follow-the-campaign in the select', () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.settings.deviceSkin = 'removed_pack_skin';
    const { host } = sys(campaign(reg, 4), st);
    expect(host.querySelector<HTMLSelectElement>('select[name="deviceSkin"]')!.value).toBe('');
    expect(getSettings(st).deviceSkin).toBe('removed_pack_skin'); // the choice is not lost
  });

  it('works without a campaign', () => {
    const { host } = sys(null);
    expect(host.querySelector<HTMLSelectElement>('select[name="deviceSkin"]')!.options[0].textContent).toBe(`Follow the campaign (${String(reg.deviceSkins.get('ccp_standard')!.name)})`);
  });
});
