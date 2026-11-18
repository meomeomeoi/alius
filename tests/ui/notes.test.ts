// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { handOf } from '../../src/engine/hand';
import type { CampaignState, HandNote, Rule } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderHub, type HubCtx } from '../../src/ui/hub/hubScreen';
import { renderInvTab } from '../../src/ui/inv/invTab';
import { renderNote } from '../../src/ui/notes/note';
import { renderRuleNote, resetTorn } from '../../src/ui/notes/ruleNote';
import { h } from '../../src/ui/dom';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
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
const env = (state: CampaignState) => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

const note = (over: Partial<HandNote> = {}): HandNote => ({ id: 'hn1', unitId: ANN, noteId: 'desk_eat', where: 'quarters', text: 'Eat something. — Ann', day: 5, ...over });
function world(...notes: HandNote[]): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.notes = { seq: notes.length, list: notes };
  return s;
}
const rule = (over: Partial<Rule> = {}): Rule => ({ id: 'r1', unitId: ANN, templateId: 'report_evening', text: 'Report to me every evening.', status: 'proposed', day: 3, brokenCount: 0, delivered: true, ...over });
const withRule = (r: Rule, day = 5): CampaignState => {
  const s = campaign(reg, 4);
  s.day = day;
  s.bonds = { rules: [r] };
  return s;
};
const handlers = () => ({ accept: vi.fn(), negotiate: vi.fn(), refuse: vi.fn() });

describe('renderNote', () => {
  it('is a paper-voice note whose body sets --alius-font-hand to her family, with the type font behind it', () => {
    const s = world();
    const hand = handOf(s, reg, ANN);
    const el = renderNote({ text: 'Eat something.', unitName: 'Ann', hand, analyze: 'glossary:hand_note' });
    expect(el.classList.contains('alius-note')).toBe(true);
    expect(el.closest('.alius-voice-paper') ?? el.classList.contains('alius-voice-paper')).toBeTruthy();
    expect(el.style.getPropertyValue('--alius-font-hand')).toBe(`"${String(hand!.family)}", var(--alius-font-type)`);
    expect(el.querySelector('.alius-note-body')!.textContent).toBe('Eat something.');
    expect(el.getAttribute('data-analyze')).toBe('glossary:hand_note');
  });

  it('without a hand it leaves the variable unset (the type font)', () => {
    const el = renderNote({ text: 'x', unitName: 'Ann', hand: null, analyze: 'glossary:hand_note' });
    expect(el.style.getPropertyValue('--alius-font-hand')).toBe('');
  });

  it('the text is text, never markup', () => {
    const el = renderNote({ text: '<img src=x onerror=alert(1)>', unitName: 'Ann', hand: null, analyze: 'glossary:hand_note' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });

  it('an unread note has a [GOT IT] button that calls onRead once; a read one has none and is dimmed', () => {
    const onRead = vi.fn();
    const unread = renderNote({ text: 'x', unitName: 'Ann', hand: null, analyze: 'glossary:hand_note', onRead });
    const b = unread.querySelector<HTMLButtonElement>('button[data-action="read-note"]')!;
    expect(b.textContent).toBe('[GOT IT]');
    b.click();
    b.click();
    expect(onRead).toHaveBeenCalledTimes(1);
    const read = renderNote({ text: 'x', unitName: 'Ann', hand: null, analyze: 'glossary:hand_note', read: true, onRead });
    expect(read.querySelector('button')).toBeNull();
    expect(read.classList.contains('is-read')).toBe(true);
  });
});

describe('rule notes', () => {
  it('a delivered proposal is her signed note with [SIGN] / [NEGOTIATE] / [DON\'T SIGN] calling accept / negotiate / refuse', () => {
    const s = withRule(rule());
    const on = handlers();
    const el = renderRuleNote(s, reg, s.bonds!.rules[0], on, { motion: true });
    document.body.append(el);
    const btn = (k: string) => el.querySelector<HTMLButtonElement>(`button[data-rule-answer="${k}"]`)!;
    expect(['accept', 'negotiate', 'refuse'].map((k) => btn(k).textContent)).toEqual(['[SIGN]', '[NEGOTIATE]', "[DON'T SIGN]"]);
    for (const k of ['accept', 'negotiate', 'refuse']) expect(btn(k).getAttribute('data-analyze'), k).toBe('glossary:rule_note');
    btn('accept').click();
    btn('negotiate').click();
    btn('refuse').click();
    expect(on.accept).toHaveBeenCalledWith('r1');
    expect(on.negotiate).toHaveBeenCalledWith('r1');
    expect(on.refuse).toHaveBeenCalledWith('r1');
    expect(el.querySelector('.alius-note-body')!.textContent).toContain('Report to me every evening.');
    expect(el.querySelector('.alius-note-sign')!.textContent).toBe('— Ann');
    expect(el.style.getPropertyValue('--alius-font-hand')).toContain(String(handOf(s, reg, ANN)!.family));
  });

  it('[SIGN] is soft-disabled while she already holds three rules', () => {
    const s = withRule(rule());
    for (const [i, t] of ['hands_off_gear', 'no_other_tokens', 'name_me_first'].entries()) s.bonds!.rules.push(rule({ id: `a${i}`, templateId: t, status: 'active' }));
    const on = handlers();
    const el = renderRuleNote(s, reg, s.bonds!.rules[0], on, { motion: true });
    const sign = el.querySelector<HTMLButtonElement>('button[data-rule-answer="accept"]')!;
    expect(sign.getAttribute('aria-disabled')).toBe('true');
    sign.click();
    expect(on.accept).not.toHaveBeenCalled();
  });

  it('an active rule is signed by both, with no pronoun for the commander and no buttons', () => {
    const s = withRule(rule({ status: 'active' }));
    const el = renderRuleNote(s, reg, s.bonds!.rules[0], handlers(), { motion: true });
    expect(el.querySelector('button')).toBeNull();
    const signs = [...el.querySelectorAll('.alius-note-sign')].map((x) => x.textContent);
    expect(signs).toEqual(['— Ann', `— ${s.commander.name}`]);
    expect(el.querySelector('.alius-note-sign-commander')).not.toBeNull();
    expect(el.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('a rule broken yesterday shows torn; the tear animates once and is static under reduced motion', () => {
    const s = withRule(rule({ status: 'active', brokenCount: 1, lastBrokenDay: 4 }));
    const r = s.bonds!.rules[0];
    const first = renderRuleNote(s, reg, r, handlers(), { motion: true });
    expect(first.classList.contains('is-torn')).toBe(true);
    expect(first.classList.contains('is-tearing')).toBe(true);
    const again = renderRuleNote(s, reg, r, handlers(), { motion: true });
    expect(again.classList.contains('is-torn')).toBe(true);
    expect(again.classList.contains('is-tearing')).toBe(false); // once per rule and lastBrokenDay
    r.lastBrokenDay = 5;
    expect(renderRuleNote(s, reg, r, handlers(), { motion: true }).classList.contains('is-tearing')).toBe(true); // a new break
    resetTorn();
    const still = renderRuleNote(s, reg, r, handlers(), { motion: false });
    expect(still.classList.contains('is-torn')).toBe(true);
    expect(still.classList.contains('is-tearing')).toBe(false);
  });

  it('a rule broken three days ago is not torn', () => {
    const s = withRule(rule({ status: 'active', brokenCount: 1, lastBrokenDay: 2 }));
    expect(renderRuleNote(s, reg, s.bonds!.rules[0], handlers(), { motion: true }).classList.contains('is-torn')).toBe(false);
  });

  it('the rule text is text, never markup, and the note is analyzable', () => {
    const s = withRule(rule({ text: '<b>bold</b>' }));
    const el = renderRuleNote(s, reg, s.bonds!.rules[0], handlers(), { motion: true });
    document.body.append(el);
    expect(el.querySelector('b')).toBeNull();
    expect(markedWithout(el)).toEqual([]);
    expect(unresolved(el, env(s))).toEqual([]);
    expect(unreachable(el)).toEqual([]);
  });
});

function mountHub(state: CampaignState, over: Partial<HubCtx> = {}) {
  const ctx: HubCtx = {
    getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
    ops: { getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
    onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null, onReadNote: vi.fn(), ...over,
  };
  const root = h('div', { id: 'alius-shell' });
  const host = h('div');
  root.append(host, h('div', { class: 'alius-device' }));
  document.body.append(root);
  renderHub(host, root.lastElementChild as HTMLElement, ctx);
  return { host, ctx };
}
const openCell = (host: HTMLElement) => {
  const cell = [...reg.hubRooms.values()].find((r) => r.commanderCell === true)!;
  host.querySelector<HTMLElement>(`.alius-room[data-room="${String(cell.id)}"]`)!.click();
  return host.querySelector<HTMLElement>('.alius-room-panel');
};

describe('notes in the room of the commander\'s quarters', () => {
  it('the panel of the room with commanderCell shows her quarters notes in her hand, and calls onReadNote', () => {
    const s = world(note({ id: 'hn1', text: 'Eat something. — Ann' }), note({ id: 'hn2', unitId: BEA, text: 'Report on the desk. — Bea' }));
    const { host, ctx } = mountHub(s);
    const panel = openCell(host)!;
    const notes = [...panel.querySelectorAll<HTMLElement>('.alius-note')];
    expect(notes.map((n) => n.querySelector('.alius-note-body')!.textContent)).toEqual(['Report on the desk. — Bea', 'Eat something. — Ann']); // newest first
    expect(notes[1].style.getPropertyValue('--alius-font-hand')).toContain(String(handOf(s, reg, ANN)!.family));
    notes[1].querySelector<HTMLButtonElement>('button[data-action="read-note"]')!.click();
    expect(ctx.onReadNote).toHaveBeenCalledWith('hn1');
  });

  it('other rooms show no notes, and gear and door notes are not in the room', () => {
    const s = world(note({ id: 'hn1', where: 'gear' }), note({ id: 'hn2', where: 'door' }));
    const { host } = mountHub(s);
    const other = [...reg.hubRooms.values()].find((r) => r.commanderCell !== true)!;
    host.querySelector<HTMLElement>(`.alius-room[data-room="${String(other.id)}"]`)!.click();
    expect(host.querySelector('.alius-room-panel .alius-note')).toBeNull();
    expect(openCell(host)!.querySelector('.alius-note')).toBeNull();
  });

  it('pinned notes (P9c, access ≥ 2) show there too', () => {
    const s = partner(world(), ANN, { lead: 'assertive', stateId: 'lover' });
    const panel = openCell(mountHub(s).host)!;
    expect(panel.querySelectorAll('.alius-note').length).toBeGreaterThan(0);
  });

  it('every note in the panel is analyzable and reachable', () => {
    const { host } = mountHub(world(note()));
    const panel = openCell(host)!;
    expect(markedWithout(panel)).toEqual([]);
    expect(unresolved(panel, env(world(note())))).toEqual([]);
  });
});

describe('gear notes on INV', () => {
  it('sit at the top of the tab, in her hand, and call onReadNote', () => {
    const s = world(note({ id: 'hn7', where: 'gear', text: 'Come back in one piece. — Ann' }), note({ id: 'hn8', where: 'quarters' }));
    const host = h('div');
    document.body.append(host);
    const onReadNote = vi.fn();
    renderInvTab(host, { getState: () => s, registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn(), onReadNote });
    const notes = [...host.querySelectorAll('.alius-note')];
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('Come back in one piece.');
    expect(host.firstElementChild!.contains(notes[0])).toBe(true);
    notes[0].querySelector<HTMLButtonElement>('button[data-action="read-note"]')!.click();
    expect(onReadNote).toHaveBeenCalledWith('hn7');
    expect(markedWithout(host)).toEqual([]);
  });

  it('no gear note, no notes block', () => {
    const host = h('div');
    document.body.append(host);
    renderInvTab(host, { getState: () => world(), registries: reg, onEquip: vi.fn(), onCraft: vi.fn(), onUpgrade: vi.fn(), onReroll: vi.fn(), onDismantle: vi.fn() });
    expect(host.querySelector('.alius-note')).toBeNull();
  });
});
