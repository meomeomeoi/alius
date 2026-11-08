import { describe, it, expect } from 'vitest';
import { FakeStAdapter } from '../src/st/fake';
import { getSettings, updateSettings } from '../src/settings';
import { CALL_TYPE_IDS } from '../src/llm/callTypes';

describe('settings', () => {
  it('defaults are filled into empty extension settings', () => {
    const st = new FakeStAdapter();
    const s = getSettings(st);
    expect(s).toMatchObject({
      mechanicProfileId: '', mechanicThink: 'min', mechanicFallbackToMain: true, requestFloor: 2000,
      contextTokenCap: 1200, palette: 'amber', scanlines: true, flicker: false, debug: false, editLock: true,
    });
    expect(s.budgets).toEqual({
      profile_import: 1500, intent_extract: 600, scene_summary: 800, dilemma_generate: 1000,
      director_tick: 1200, flavor: 400, dm_reply: 300, expedition_recap: 700, emotion_pick: 50, ping: 100,
      activity_vignette: 150,
    });
    expect(Object.keys(s.budgets).sort()).toEqual([...CALL_TYPE_IDS].sort());
    // and written back so SillyTavern persists them
    expect(st.settings.palette).toBe('amber');
  });

  it('invalid palette resets, valid budget kept', () => {
    const st = new FakeStAdapter();
    st.settings = { palette: 'purple', requestFloor: 'lots', budgets: { flavor: 123, ping: -5, bogus: 9 }, debug: true };
    const s = getSettings(st);
    expect(s.palette).toBe('amber');
    expect(s.requestFloor).toBe(2000);
    expect(s.budgets.flavor).toBe(123);
    expect(s.budgets.ping).toBe(100);
    expect(s.budgets).not.toHaveProperty('bogus');
    expect(s.debug).toBe(true);
  });

  it('updateSettings merges a patch, saves, and ignores invalid values', () => {
    const st = new FakeStAdapter();
    const s = updateSettings(st, { palette: 'green', budgets: { flavor: 77 } as never, requestFloor: -1 });
    expect(s.palette).toBe('green');
    expect(s.budgets.flavor).toBe(77);
    expect(s.budgets.ping).toBe(100);
    expect(s.requestFloor).toBe(2000);
    expect(st.settingsSaves).toBe(1);
    expect(getSettings(st).palette).toBe('green');
  });

  it('new P1 settings default to false, false, native', () => {
    const s = getSettings(new FakeStAdapter());
    expect(s.desireBondDefects).toBe(false);
    expect(s.showRawValues).toBe(false);
    expect(s.spriteMode).toBe('native');
  });

  it('new P2 settings default to true, true', () => {
    const s = getSettings(new FakeStAdapter());
    expect(s.activityFlavor).toBe(true);
    expect(s.gruntFlavor).toBe(true);
  });

  it('activity_vignette budget defaults to 150 and is clamped like the others', () => {
    const st = new FakeStAdapter();
    expect(getSettings(st).budgets.activity_vignette).toBe(150);
    st.settings = { budgets: { activity_vignette: 0 }, activityFlavor: 'yes' };
    const s = getSettings(st);
    expect(s.budgets.activity_vignette).toBe(150);
    expect(s.activityFlavor).toBe(true);
  });

  it('invalid spriteMode resets to native', () => {
    const st = new FakeStAdapter();
    st.settings = { spriteMode: 'telepathy', desireBondDefects: true };
    const s = getSettings(st);
    expect(s.spriteMode).toBe('native');
    expect(s.desireBondDefects).toBe(true);
  });
});
