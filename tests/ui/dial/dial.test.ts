// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { blankPractices } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { blockingChoices } from '../../../src/ui/scene/blockingStrip';
import { dialPoseOf, renderPostureDial } from '../../../src/ui/scene/dial/dial';
import { poseOf } from '../../../src/ui/scene/dial/points';
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

function scene(...tags: string[]): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, 'unit_ann', { stateId: 'confidant' });
  enable(s, 'pet_play', 'restraint', ...tags);
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

  /** Ann (ritual) is present and has named postures (P16). */
  function named(postures: Array<{ postureId: string; name: string }>): CampaignState {
    const base = withService(world(reg, 'role'));
    unitOf(base, ANN).bond!.practice!.style = { primary: 'ritual' };
    base.practices = { ...blankPractices(), seq: 1, postures: { [ANN]: postures.map((p) => ({ ...p, day: 20 })) } };
    setRelation(base, ANN, { stateId: 'confidant' });
    enable(base, 'pet_play', 'restraint');
    const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  }

  it('her name for the posture is the label when a holder present named it (P16)', () => {
    const s = put(named([{ postureId: 'kneeling_upright', name: 'Down' }]), posture('kneeling_upright'));
    expect(draw(s).q('.alius-dial-name')!.textContent).toBe('DOWN');
    // another posture keeps its own label
    expect(draw(put(s, posture('sitting'))).q('.alius-dial-name')!.textContent).toBe(String(reg.blockingPostures.get('sitting')!.label).toUpperCase());
  });

  it('the label shows her name over the base name (cards.html drawDial); with no name of hers, the base alone', () => {
    const t = draw(put(named([{ postureId: 'bowing', name: 'Low' }]), posture('bowing')));
    expect(t.q('.alius-dial-name')!.textContent).toBe('LOW');
    expect(t.q('.alius-dial-sub')!.textContent).toBe('BOWING');
    // the order: her name, the base name, then the eyes
    expect(t.qa('.alius-dial-label > *').map((e) => e.className.split(' ')[0])).toEqual(['alius-dial-name', 'alius-dial-sub', 'alius-dial-eyes']);
    const plain = draw(put(scene(), posture('bowing')));
    expect(plain.q('.alius-dial-name')!.textContent).toBe('BOWING');
    expect(plain.q('.alius-dial-sub')).toBeNull();
  });

  it('the dial draws the preset the commander holds (P16b): its points over the base, the base alone as before', () => {
    const preset = (id: string, base: string): BlockingChange => ({ person: COMMANDER, field: 'posture', value: base, preset: id });
    const plain = put(scene(), posture('kneeling_upright'));
    expect(dialPoseOf(plain, reg)).toEqual(poseOf('kneeling_upright')); // no preset: the base as today
    expect(dialPoseOf(plain)).toEqual(poseOf('kneeling_upright')); // the old call shape still works
    const open = put(scene(), preset('kneel_open', 'kneeling_upright'));
    const pose = dialPoseOf(open, reg);
    expect(pose.base).toBe('kneeling_upright');
    expect(pose.points).toMatchObject({ knees: 'apart', arms: 'on_thighs_up', hips: 'raised', torso: 'upright' }); // the preset's states over the base's
    const bunk = dialPoseOf(put(scene(), preset('light_bearer', 'kneeling_upright')), reg);
    expect(bunk).toMatchObject({ item: 'lamp', points: { arms: 'lamp' } }); // an item rides along
    // the figure is drawn from those points: a different pose than the base's
    const a = draw(plain).q('.alius-dial-face svg')!.innerHTML;
    const b = draw(open).q('.alius-dial-face svg')!.innerHTML;
    expect(b).not.toBe(a);
  });

  it('the label names the preset the commander holds, over its base; her name for the preset wins; a base held reads her name for its default preset', () => {
    const open = put(scene(), { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' });
    expect(draw(open).q('.alius-dial-name')!.textContent).toBe('KNEEL OPEN');
    expect(draw(open).q('.alius-dial-sub')!.textContent).toBe('KNEELING UPRIGHT');
    const hers = put(named([{ postureId: 'kneel_open', name: 'Offer' }]), { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' });
    expect(draw(hers).q('.alius-dial-name')!.textContent).toBe('OFFER');
    // her name for the old base reads for the default preset (the same pose), not for another preset of the base
    const old = named([{ postureId: 'kneeling_upright', name: 'Down' }]);
    expect(draw(put(old, posture('kneeling_upright'))).q('.alius-dial-name')!.textContent).toBe('DOWN');
    expect(draw(put(old, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_upright' })).q('.alius-dial-name')!.textContent).toBe('DOWN');
    expect(draw(put(old, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_open' })).q('.alius-dial-name')!.textContent).toBe('KNEEL OPEN');
    // the eyes line reads the preset's gaze
    expect(draw(open).q('.alius-dial-eyes')!.textContent).toBe('EYES DOWN');
  });

  it('a dim line under them says where the eyes are when that is not the default', () => {
    const down = draw(put(scene(), posture('bowing')));
    expect(down.q('.alius-dial-eyes')!.textContent).toBe('EYES DOWN');
    const plain = draw(put(scene(), posture('standing')));
    expect(plain.q('.alius-dial-eyes')).toBeNull();
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

  it('the fan lists what is set on each person (NOW), with the chips of the strip and the guarded × (review C1)', () => {
    registerFrameReader(() => 'play');
    const s = put(scene('worship'), { person: 'unit_ann', field: 'posture', value: 'sitting' }, { person: 'unit_ann', field: 'activity', value: 'on_comms' },
      { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: 'unit_ann' });
    const t = draw(s);
    t.q('[data-dial-open]')!.click();
    expect(t.qa('.alius-dial-now .alius-blocking-row').map((r) => r.dataset.person)).toEqual(['unit_ann', COMMANDER]);
    const chips = (person: string) => t.qa(`.alius-dial-now .alius-blocking-row[data-person="${person}"] .alius-chip`).map((c) => c.dataset.analyze);
    expect(chips('unit_ann')).toEqual(['blockingPostures:sitting', 'blockingContacts:foot_worship', 'blockingActivities:on_comms']);
    expect(chips(COMMANDER)).toEqual(expect.arrayContaining(['blockingItems:hood']));
    expect(t.q('.alius-dial-now .alius-blocking-row[data-person="unit_ann"]')!.textContent).toContain('Ann');
    const x = t.qa('.alius-dial-now [data-action="remove"]');
    expect(x.map((b) => `${b.dataset.person}:${b.dataset.id}`).sort()).toEqual([`${COMMANDER}:hood`, `unit_ann:foot_worship`].sort());
    expect(x[0].getAttribute('aria-label')).toMatch(/^Remove /);
    t.q('[data-action="remove"][data-id="hood"]')!.click();
    expect(t.onStage).toHaveBeenLastCalledWith({ type: 'blocking/set', payload: { person: COMMANDER, field: 'removed', value: 'hood' } });
  });

  it('nothing set: no NOW block', () => {
    const t = draw(scene());
    expect(t.q('.alius-dial-now')).toBeNull();
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
