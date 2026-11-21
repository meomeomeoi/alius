// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { renderHomeTab, type HomeCtx } from '../../src/ui/home/homeTab';
import { resetTorn } from '../../src/ui/notes/ruleNote';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';
import { partner } from '../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetTorn();
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.slot = 'afternoon';
  return s;
}
/** Ann is a lover with device access and the wallpaper decor. */
function decorated(parts: Array<'sticker' | 'wallpaper' | 'contact'> = ['wallpaper', 'sticker', 'contact'], fadedUntil?: number): CampaignState {
  const s = partner(world(), ANN, { lead: 'assertive', stateId: 'lover', affinity: 80 });
  s.personal = { seq: 1, decor: { [ANN]: { since: 2, parts, contactName: 'Sweetheart', ...(fadedUntil !== undefined ? { fadedUntil } : {}) } } };
  return s;
}

function mount(state: CampaignState | null, over: Partial<AliusSettings> = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const host = h('div');
  document.body.append(host);
  const ctx: HomeCtx = {
    getState: () => state, registries: reg, st, settings: () => settings,
    onReadNote: vi.fn(), onPeel: vi.fn(), rule: { accept: vi.fn(), negotiate: vi.fn(), refuse: vi.fn() },
  };
  renderHomeTab(host, ctx);
  return { host, ctx, q: (sel: string) => host.querySelector<HTMLElement>(sel), qa: (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)] };
}

describe('HOME: the basics', () => {
  it('no campaign: the usual line', () => {
    expect(mount(null).host.textContent).toContain('NO ACTIVE CAMPAIGN IN THIS CHAT');
  });

  it('shows the day and slot, and is quiet when there is nothing else', () => {
    const { host, q } = mount(world());
    expect(q('.alius-home-clock')!.textContent).toBe('DAY 005 // AFTERNOON');
    expect(q('.alius-home-clock')!.getAttribute('data-analyze')).toBe('glossary:slots');
    expect(host.querySelector('.alius-wallpaper')).toBeNull();
    expect(host.querySelector('.alius-note')).toBeNull();
    expect(host.textContent).toContain('NOTHING IS PINNED');
  });
});

describe('HOME: the wallpaper', () => {
  it("is the owner's dithered portrait at size 256", () => {
    const { q } = mount(decorated());
    const wall = q('.alius-wallpaper')!;
    expect(wall.querySelector('img')!.getAttribute('width')).toBe('256');
    expect(wall.getAttribute('data-unit')).toBe(ANN);
    expect(wall.getAttribute('data-faded')).toBeNull();
    expect(wall.getAttribute('aria-hidden')).toBe('true');
  });

  it('is faded while her decor fades', () => {
    const { q } = mount(decorated(['wallpaper'], 8));
    const wall = q('.alius-wallpaper')!;
    expect(wall.getAttribute('data-unit')).toBe(ANN);
    expect(wall.getAttribute('data-faded')).toBe('true');
  });

  it('is gone once the fade is over', () => {
    expect(mount(decorated(['wallpaper'], 4)).q('.alius-wallpaper')).toBeNull();
  });

  it('readable mode: no image, only the caption WALLPAPER: ANN', () => {
    const { q, host } = mount(decorated(), { readableMode: true });
    expect(q('.alius-wallpaper')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(q('.alius-wallpaper-caption')!.textContent).toBe('WALLPAPER: ANN');
  });

  it('a decor without the wallpaper part has none', () => {
    expect(mount(decorated(['sticker'])).q('.alius-wallpaper')).toBeNull();
  });

  it('the one with the highest Affinity owns it (P9c\'s rule)', () => {
    const s = decorated();
    s.personal!.decor![BEA] = { since: 2, parts: ['wallpaper'], contactName: 'B' };
    s.relations[BEA].affinity = 99;
    expect(mount(s).q('.alius-wallpaper')!.getAttribute('data-unit')).toBe(BEA);
  });
});

describe('HOME: peel and change wallpaper', () => {
  it('[ CHANGE WALLPAPER ] asks the app to peel the owner\'s wallpaper part; [ PEEL STICKER ] her sticker', () => {
    const { q, ctx } = mount(decorated());
    q('button[data-action="change-wallpaper"]')!.click();
    expect(ctx.onPeel).toHaveBeenCalledWith(ANN, 'wallpaper');
    q('button[data-action="peel-sticker"]')!.click();
    expect(ctx.onPeel).toHaveBeenLastCalledWith(ANN, 'sticker');
  });

  it('no buttons without the parts, none for a faded decor', () => {
    const { q } = mount(decorated(['contact']));
    expect(q('button[data-action="change-wallpaper"]')).toBeNull();
    expect(q('button[data-action="peel-sticker"]')).toBeNull();
    const faded = mount(decorated(['wallpaper', 'sticker'], 8));
    expect(faded.q('button[data-action="peel-sticker"]')).toBeNull();
    expect(faded.q('button[data-action="change-wallpaper"]')).toBeNull();
  });

  it('every button is analyzable', () => {
    const { host } = mount(decorated());
    for (const a of ['change-wallpaper', 'peel-sticker']) expect(host.querySelector(`button[data-action="${a}"]`)!.getAttribute('data-analyze')).toBe('glossary:device_marks');
  });
});

describe('HOME: access lines', () => {
  it('one ACCESS line per unit with access 1 or more, analyzable with her id', () => {
    const { qa } = mount(decorated());
    const lines = qa('.alius-chip[data-access]');
    expect(lines.map((l) => l.textContent)).toEqual([expect.stringMatching(/^ACCESS L[1-4] ANN$/)]);
    expect(lines[0].getAttribute('data-analyze')).toBe('glossary:device_access');
    expect(JSON.parse(lines[0].getAttribute('data-analyze-ctx')!)).toEqual({ unitId: ANN });
  });

  it('none for a squad without access', () => {
    expect(mount(world()).qa('.alius-chip[data-access]')).toEqual([]);
  });
});

describe('HOME: the notes', () => {
  it('pinned notes, rule notes and door notes, each in her hand; quarters and gear notes too', () => {
    const s = decorated();
    s.bonds = { rules: [
      { id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report to me every evening.', status: 'proposed', day: 3, brokenCount: 0, delivered: true },
      { id: 'r2', unitId: ANN, templateId: 'hands_off_gear', text: 'Hands off my gear.', status: 'active', day: 2, brokenCount: 0 },
    ] };
    s.notes = { seq: 3, list: [
      { id: 'hn1', unitId: ANN, noteId: 'door_plain', where: 'door', text: 'I came by.', day: 5 },
      { id: 'hn2', unitId: ANN, noteId: 'desk_eat', where: 'quarters', text: 'Eat something.', day: 5 },
      { id: 'hn3', unitId: ANN, noteId: 'gear_tucked', where: 'gear', text: 'Come back.', day: 5 },
    ] };
    const { host, q, qa } = mount(s);
    const bodies = qa('.alius-note .alius-note-body').map((n) => n.textContent);
    expect(bodies).toEqual(expect.arrayContaining(['Report to me every evening.', 'Hands off my gear.', 'I came by.', 'Eat something.']));
    expect(bodies).not.toContain('Come back.'); // gear notes live on INV
    expect(q('.alius-home-notes button[data-rule-answer="accept"]')).not.toBeNull();
    for (const n of qa('.alius-note')) expect(n.style.getPropertyValue('--alius-font-hand')).toContain('var(--alius-font-type)');
    expect(host.querySelectorAll('.alius-note').length).toBeGreaterThanOrEqual(5); // + at least one pinned line
  });

  it('a note about her hobby (a note id with no registry entry behind it) is shown like any other', () => {
    const s = decorated();
    s.notes = { seq: 1, list: [{ id: 'hn1', unitId: ANN, noteId: 'life:reading', where: 'quarters', text: 'Pencil drawings, pinned over the cot.', day: 5 }] };
    const { qa } = mount(s);
    expect(qa('.alius-note .alius-note-body').map((n) => n.textContent)).toContain('Pencil drawings, pinned over the cot.');
  });

  it('[ GOT IT ] on a stored note calls onReadNote; a rule note answers through the rule handlers', () => {
    const s = decorated();
    s.notes = { seq: 1, list: [{ id: 'hn1', unitId: ANN, noteId: 'door_plain', where: 'door', text: 'I came by.', day: 5 }] };
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report.', status: 'proposed', day: 3, brokenCount: 0, delivered: true }] };
    const { q, ctx } = mount(s);
    q('.alius-note button[data-action="read-note"]')!.click();
    expect(ctx.onReadNote).toHaveBeenCalledWith('hn1');
    q('button[data-rule-answer="accept"]')!.click();
    expect(ctx.rule.accept).toHaveBeenCalledWith('r1');
  });

  it('a broken rule shows torn (a note for yesterday\'s break)', () => {
    const s = decorated();
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report.', status: 'active', day: 3, brokenCount: 1, lastBrokenDay: 4 }] };
    expect(mount(s).q('.alius-rule-note.is-torn')).not.toBeNull();
  });

  it('reduced motion: the tear does not animate', () => {
    const s = decorated();
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report.', status: 'active', day: 3, brokenCount: 1, lastBrokenDay: 4 }] };
    const { q } = mount(s, { reducedMotion: true });
    expect(q('.alius-rule-note.is-torn')!.classList.contains('is-tearing')).toBe(false);
  });

  it('expired notes are not shown', () => {
    const s = world();
    s.notes = { seq: 1, list: [{ id: 'hn1', unitId: ANN, noteId: 'door_plain', where: 'door', text: 'Old.', day: 1 }] };
    expect(mount(s).q('.alius-note')).toBeNull();
  });
});

describe('HOME: analysis coverage', () => {
  it('everything marked resolves and every stat, chip and option is marked', () => {
    const s = decorated();
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report.', status: 'proposed', day: 3, brokenCount: 0, delivered: true }] };
    s.notes = { seq: 1, list: [{ id: 'hn1', unitId: ANN, noteId: 'door_plain', where: 'door', text: 'I came by.', day: 5 }] };
    const { host } = mount(s);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });
});
