// @vitest-environment jsdom
/**
 * P16b Task 22b (PDA surface, ruling 26): HER POSTURES in the DYNAMIC section. Only the postures she has named: her name in her hand, the dial's mannequin of the preset, its points with their keys and
 * states, how well the commander knows it as a word (never a number), and `[ PRACTISE ]` (a posture drill alone on that preset; the slot is spent). Every row `data-analyze`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/craft';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { renderDynamicSection, resetDynamicSection } from '../../../src/ui/dynamic/section';
import { herPosturesBlock } from '../../../src/ui/practice/herPostures';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, unitOf, world } from '../../engine/craft/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { document.body.innerHTML = ''; resetDynamicSection(); resetBlockingHooks(); });

function named(postures: Array<[string, string]> = [['kneel_open', 'Open'], ['attention', 'Straight']]): CampaignState {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  s.slot = 'morning';
  s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [], postures: { [ANN]: postures.map(([postureId, name]) => ({ postureId, name, day: s.day })) } } as never;
  return s;
}
const block = (s: CampaignState, onPractise = vi.fn(), hidden = false): HTMLElement | null => {
  const el = herPosturesBlock(s, reg, buildKnowledge(s, DEFAULT_SETTINGS), ANN, hidden, onPractise);
  if (el !== null) document.body.append(el);
  return el;
};
const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-her-posture]')];

describe('HER POSTURES', () => {
  it('lists only the postures she has named, in the order she named them', () => {
    const el = block(named())!;
    expect(el.getAttribute('data-her-postures')).toBe(ANN);
    expect(el.querySelector('h5')!.textContent).toBe('HER POSTURES');
    expect(rows(el).map((r) => r.getAttribute('data-her-posture'))).toEqual(['kneel_open', 'attention']);
    const one = block(named([['kneel_open', 'Open']]))!;
    expect(rows(one).map((r) => r.getAttribute('data-her-posture'))).toEqual(['kneel_open']);
  });

  it('draws nothing without a named posture, in immersive mode, or for a woman who is not live', () => {
    expect(block(named([]))).toBeNull();
    expect(block(named(), vi.fn(), true)).toBeNull();
    const eq = named();
    registerFrameReader(() => 'equal');
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(block(eq)).toBeNull();
    const none = world(reg, 'play');
    expect(block(none)).toBeNull();
  });

  it('her name is in her hand', () => {
    const el = block(named())!;
    const name = rows(el)[0]!.querySelector<HTMLElement>('[data-posture-name]')!;
    expect(name.textContent).toBe('Open');
    expect(name.style.getPropertyValue('--alius-font-hand')).not.toBe('');
  });

  it('shows the dial\'s mannequin of the preset and the points it fixes with their keys and states', () => {
    const el = block(named())!;
    const row = rows(el)[0]!;
    expect(row.querySelector('svg.alius-mannequin')).not.toBeNull();
    const points = [...row.querySelectorAll<HTMLElement>('[data-point]')].map((p) => [p.getAttribute('data-point'), p.querySelector('kbd')!.textContent, p.textContent!.replace(/\s+/g, ' ').trim()]);
    // kneel_open fixes knees apart, arms on thighs up, head up, gaze down (keys 3, 4, 5, 6)
    expect(points).toEqual([['knees', '3', '3 KNEES apart'], ['arms', '4', '4 ARMS on thighs up'], ['head', '5', '5 HEAD up'], ['gaze', '6', '6 GAZE down']]);
  });

  it('says how well it is known as a word, never a number', () => {
    const s = named();
    expect(rows(block(s)!)[0]!.querySelector('[data-knowledge]')!.textContent).toBe('UNTRAINED');
    const known = named();
    known.relations[ANN].craft = { postures: { kneel_open: { xp: 211.7, day: known.day } } };
    const el = block(known)!;
    expect(rows(el)[0]!.querySelector('[data-knowledge]')!.textContent).toBe('STEADY');
    expect(el.textContent).not.toMatch(/211|xp/i);
    expect(rows(el)[1]!.querySelector('[data-knowledge]')!.textContent).toBe('UNTRAINED');
  });

  it('[ PRACTISE ] asks for a posture drill on that preset', () => {
    const onPractise = vi.fn();
    const el = block(named(), onPractise)!;
    const btn = rows(el)[1]!.querySelector<HTMLButtonElement>('[data-action="practise-posture"]')!;
    expect(btn.textContent).toBe('[ PRACTISE ]');
    btn.click();
    expect(onPractise).toHaveBeenCalledWith(ANN, 'attention');
  });

  it('[ PRACTISE ] is aria-disabled with the reason when the slot cannot be spent, and does nothing', () => {
    const s = named();
    s.calendar.pendingScene = { unitId: ANN, day: s.day, slot: 'morning' }; // a conversation is still open
    const onPractise = vi.fn();
    const el = block(s, onPractise)!;
    const btn = rows(el)[0]!.querySelector<HTMLButtonElement>('[data-action="practise-posture"]')!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(rows(el)[0]!.querySelector('.alius-reason')!.textContent).toMatch(/conversation/i);
    btn.click();
    expect(onPractise).not.toHaveBeenCalled();
  });

  it('every row, the knowledge word and the button carry data-analyze and resolve; none gives the commander a pronoun', () => {
    const s = named();
    const el = block(s)!;
    expect(rows(el).every((r) => r.getAttribute('data-analyze') === 'glossary:her_postures')).toBe(true);
    expect(el.querySelector('[data-action="practise-posture"]')!.getAttribute('data-analyze')).toBe('glossary:her_postures');
    expect(markedWithout(el)).toEqual([]);
    expect(unresolved(el, { registries: reg, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
    expect(unreachable(el)).toEqual([]);
    expect(hasCommanderPronoun(el.textContent ?? '')).toBe(false);
  });

  it('sits in the DYNAMIC section when the section has the action', () => {
    const s = named();
    const host = h('div');
    document.body.append(host);
    const practisePosture = vi.fn();
    renderDynamicSection(host, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, DEFAULT_SETTINGS), hidden: false, actions: { practisePosture } });
    expect(host.querySelector('[data-her-postures]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[data-action="practise-posture"]')!.click();
    expect(practisePosture).toHaveBeenCalledWith(ANN, 'kneel_open');
    const bare = h('div');
    renderDynamicSection(bare, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, DEFAULT_SETTINGS), hidden: false });
    expect(bare.querySelector('[data-her-postures]')).not.toBeNull(); // the list is read-only without the action
    expect(bare.querySelector('[data-action="practise-posture"]')).toBeNull();
  });
});
