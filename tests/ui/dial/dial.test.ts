// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { blankPractices } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { blockingChoices } from '../../../src/ui/scene/blockingStrip';
import { renderPostureDial } from '../../../src/ui/scene/dial/dial';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import { ANN, unitOf, withService, world } from '../../engine/practice/world';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBlockingHooks();
});

function scene(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, 'unit_ann', { stateId: 'confidant' });
  enable(s, 'pet_play', 'restraint');
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: ['unit_ann'], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const put = (s: CampaignState, ...changes: BlockingChange[]): CampaignState => {
  const d = structuredClone(s);
  for (const c of changes) setBlocking(d, { registries: reg }, c, { at: 1, source: 'engine' });
  return d;
};
const posture = (value: string): BlockingChange => ({ person: COMMANDER, field: 'posture', value });

function draw(state: CampaignState | null) {
  const host = h('div');
  document.body.append(host);
  const onStage = vi.fn();
  const render = (s: CampaignState | null) => renderPostureDial(host, { state: s, registries: reg, onStage, reduced: false, settings: DEFAULT_SETTINGS });
  render(state);
  return { host, onStage, render, q: <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel), qa: (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)] };
}

describe('the posture dial (P10e §7)', () => {
  it('is drawn only while the blocking is live', () => {
    expect(draw(null).host.childElementCount).toBe(0);
    expect(draw(campaign(reg, 4)).host.childElementCount).toBe(0); // no scene
    const live = draw(put(scene(), posture('kneeling_upright')));
    expect(live.qa('.alius-dial-face svg')).toHaveLength(1); // (the fan holds its small thumbnails)
    expect(live.q('.alius-dial-name')!.textContent).not.toBe('');
  });

  it('the label is the registry label of the commander\'s posture, in capitals', () => {
    const t = draw(put(scene(), posture('kneeling_upright')));
    expect(t.q('.alius-dial-name')!.textContent).toBe(String(reg.blockingPostures.get('kneeling_upright')!.label).toUpperCase());
  });

  it('her name for the posture is the label when a holder present named it (P16)', () => {
    const base = withService(world(reg, 'role'));
    unitOf(base, ANN).bond!.practice!.style = { primary: 'ritual' };
    base.practices = { ...blankPractices(), seq: 1, postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'Down', day: 20 }] } };
    setRelation(base, ANN, { stateId: 'confidant' });
    enable(base, 'pet_play', 'restraint');
    const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    const s = put(r.state, posture('kneeling_upright'));
    expect(draw(s).q('.alius-dial-name')!.textContent).toBe('DOWN');
    // another posture keeps its own label
    expect(draw(put(s, posture('sitting'))).q('.alius-dial-name')!.textContent).toBe(String(reg.blockingPostures.get('sitting')!.label).toUpperCase());
  });

  it('a second dim line says where the eyes are when that is not the default', () => {
    const down = draw(put(scene(), posture('bowing')));
    expect(down.q('.alius-dial-sub')!.textContent).toBe('EYES DOWN');
    const plain = draw(put(scene(), posture('standing')));
    expect(plain.q('.alius-dial-sub')?.textContent ?? '').toBe('');
  });

  it('the figure has no text; the label is HTML', () => {
    const t = draw(put(scene(), posture('kneeling_upright')));
    expect(t.q('svg')!.querySelector('text')).toBeNull();
  });

  it('a click on the centre opens the fan, which holds one option per move, each with a small mannequin and its name', () => {
    const s = put(scene(), posture('kneeling_upright'));
    const t = draw(s);
    const fan = t.q<HTMLDetailsElement>('details.alius-dial-fan')!;
    expect(fan.open).toBe(false);
    t.q('[data-dial-open]')!.click();
    expect(fan.open).toBe(true);
    const moves = blockingChoices(s, reg)!.moves;
    const options = t.qa('.alius-dial-fan [data-move]');
    expect(options.map((o) => o.dataset.move)).toEqual(moves.map((m) => m.move));
    for (const o of options) {
      expect(o.querySelector('svg.alius-mannequin')).not.toBeNull();
      expect(o.querySelector('.alius-dial-option-name')!.textContent).not.toBe('');
      expect(o.getAttribute('data-analyze')).toMatch(/^blockingPostures:/);
    }
    t.q('[data-dial-open]')!.click();
    expect(fan.open).toBe(false);
  });

  it('the places, contacts and items the scene allows follow as lists, from the same vocabulary as the strip', () => {
    const s = put(scene(), posture('kneeling_upright'));
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    const add = blockingChoices(s, reg)!.add;
    expect(add.length).toBeGreaterThan(3);
    const shown = t.qa('.alius-dial-fan [data-group]');
    expect(shown.map((e) => `${e.dataset.group}:${e.dataset.id}:${e.dataset.direction ?? ''}`).sort()).toEqual(add.map((e) => `${e.group}:${e.id}:${e.direction ?? ''}`).sort());
    for (const e of shown) expect(e.getAttribute('data-analyze')).toMatch(/^blocking(Anchors|Contacts|Items):/);
    expect(t.qa('.alius-dial-fan .alius-blocking-group').length).toBeGreaterThan(0);
  });

  it('a refused option is aria-disabled with its reason and does nothing', () => {
    const s = put(scene(), { person: COMMANDER, field: 'worn', value: 'blindfold' }); // the eyes are taken: a hood is refused today
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    const hood = t.q('.alius-dial-fan [data-group="worn"][data-id="hood"]')!;
    expect(hood.getAttribute('aria-disabled')).toBe('true');
    expect(hood.title).toMatch(/eyes/);
    hood.click();
    expect(t.onStage).not.toHaveBeenCalled();
    expect(t.q('.alius-dial-fan [data-group="worn"][data-id="collar"]')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('a movement a gate refuses (frozen in place) is aria-disabled with the reason, as in the strip', () => {
    const s = put(scene(), { person: COMMANDER, field: 'worn', value: 'spreader_bar' }); // limited movement: no standing
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    expect(t.q('.alius-dial-fan [data-move="stand"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(t.q('.alius-dial-fan [data-move="stand"]')!.title).not.toBe('');
    expect(t.q('.alius-dial-fan [data-move="sit"]')!.getAttribute('aria-disabled')).toBeNull();
    t.q('.alius-dial-fan [data-move="stand"]')!.click();
    expect(t.onStage).not.toHaveBeenCalled();
  });

  it('choosing a posture sends exactly the action the strip\'s chip sends, and closes the fan', () => {
    const s = put(scene(), posture('standing'));
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    t.q('.alius-dial-fan [data-move="kneel"]')!.click();
    expect(t.onStage).toHaveBeenCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright' } });
    expect(t.q<HTMLDetailsElement>('details.alius-dial-fan')!.open).toBe(false);
  });

  it('an item chosen from the fan sends its change', () => {
    const s = scene();
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    const choices = blockingChoices(s, reg)!;
    const ok = choices.add.find((e) => e.why(choices.units[0]) === null)!;
    t.q(`.alius-dial-fan [data-group="${ok.group}"][data-id="${ok.id}"]${ok.direction ? `[data-direction="${ok.direction}"]` : ''}`)!.click();
    expect(t.onStage).toHaveBeenCalledWith({ type: 'blocking/set', payload: { ...ok.change(choices.units[0]) } });
  });

  it('an open fan stays open across a redraw', () => {
    const s = put(scene(), posture('standing'));
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    t.render(put(s, posture('sitting')));
    expect(t.q<HTMLDetailsElement>('details.alius-dial-fan')!.open).toBe(true);
  });

  it('the dial and every option carry data-analyze and resolve (P7a)', () => {
    const s = put(scene(), posture('kneeling_upright'));
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    expect(t.q('[data-dial-open]')!.getAttribute('data-analyze')).toBe('glossary:posture_dial');
    expect(reg.glossary.has('posture_dial')).toBe(true);
    expect(markedWithout(t.host)).toEqual([]);
    expect(unreachable(t.host)).toEqual([]);
    const env = { state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } } as never;
    expect(unresolved(t.host, env)).toEqual([]);
  });

  it('the figure is the mannequin of the base posture (reduced motion changes nothing about it)', () => {
    const a = draw(put(scene(), posture('kneeling_upright')));
    const b = draw(put(scene(), posture('sitting')));
    expect(a.q('svg')!.innerHTML).not.toBe(b.q('svg')!.innerHTML);
  });
});
