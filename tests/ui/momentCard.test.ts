// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBlockingProviders } from '../../src/analysis/providers/blocking';
import { genericWord } from '../../src/blocking/momentDirectives';
import type { Registries } from '../../src/content/types';
import { resetBlockingHooks, registerFrameReader } from '../../src/engine/blocking';
import { registerExpectation, resetExpectations } from '../../src/engine/moments/answer';
import { fireMoment } from '../../src/engine/moments/fire';
import { momentsOf } from '../../src/engine/moments/state';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { h } from '../../src/ui/dom';
import { renderMomentCard } from '../../src/ui/scene/momentCard';
import { analyze, markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/moments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerBlockingProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetExpectations();
});

const ANN = 'unit_ann';
function scene(sourceId: string | null = 'her_offer', stateId = 'confidant'): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId });
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  if (sourceId !== null) fireMoment(r.state, { registries: reg }, sourceId, ANN);
  return r.state;
}
function draw(state: CampaignState | null, chips: 'chips' | 'immersive' = 'chips') {
  const host = h('div');
  document.body.append(host);
  const onStage = vi.fn();
  renderMomentCard(host, { state, registries: reg, chips, onStage });
  const options = () => [...host.querySelectorAll<HTMLButtonElement>('button.alius-option')];
  return { host, onStage, options };
}
const env = (state: CampaignState | null) => ({ registries: reg, state, settings: DEFAULT_SETTINGS });

describe('the moment card', () => {
  it('is absent without an open moment, without a scene and while the blocking is not live', () => {
    expect(draw(scene(null)).host.innerHTML).toBe('');
    expect(draw(null).host.innerHTML).toBe('');
    expect(draw(scene('her_offer', 'comrade')).host.innerHTML).toBe('');
  });

  it('shows the generic words first, then the labels when they arrive; the additions have words of their own', () => {
    const s = scene('third_party');
    const generic = draw(s).options().map((b) => b.textContent);
    expect(generic).toEqual(['[ HIDE ]', '[ AS IS ]', '[ SHOW YOURSELF ]', '[ ASK HER TO LOCK THE DOOR ]', '[ ASK HER WITH A LOOK ]']);
    const labelled = structuredClone(s);
    momentsOf(labelled.scene).open!.labels = ['pull the jacket over it', 'stay as you are', 'stand up'];
    labelled.scene!.moments!.open!.labels = ['pull the jacket over it', 'stay as you are', 'stand up'];
    expect(draw(labelled).options().map((b) => b.textContent)).toEqual(['[ PULL THE JACKET OVER IT ]', '[ STAY AS YOU ARE ]', '[ STAND UP ]', '[ ASK HER TO LOCK THE DOOR ]', '[ ASK HER WITH A LOOK ]']);
    expect(generic[0]!.toLowerCase()).toContain(genericWord(reg, 'third_party', '0'));
  });

  it('names what may give the commander away, and offers free text', () => {
    const s = scene('third_party');
    s.scene!.moments!.open!.exposing = 'Leash';
    const v = draw(s);
    expect(v.host.querySelector('.alius-moment-exposing')!.textContent).toBe('Leash could give the commander away.');
    expect(v.host.querySelector('.alius-moment-hint')!.textContent).toBe('Or answer in your own words.');
    expect(v.host.innerHTML).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('immersive hides the chips: one dim line, still analyzable', () => {
    const v = draw(scene(), 'immersive');
    expect(v.options()).toEqual([]);
    expect(v.host.querySelector('.alius-moment-dim')!.textContent).toBe('Something is at stake.');
    expect(v.host.querySelector('[data-analyze="glossary:moment"]')).not.toBeNull();
  });

  it('a click stages moment/answer with the moment and the key', () => {
    const s = scene('third_party');
    const v = draw(s);
    v.options()[1]!.click();
    expect(v.onStage).toHaveBeenCalledWith({ type: 'moment/answer', payload: { momentId: 'm1', key: '1' } });
    v.options()[3]!.click();
    expect(v.onStage).toHaveBeenLastCalledWith({ type: 'moment/answer', payload: { momentId: 'm1', key: 'lock' } });
    // the action it stages is one the engine takes
    const r = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '1', at: 3 } });
    expect(errors(r.events)).toEqual([]);
  });

  it('every element is marked, reaches an analysis panel and can be reached from the keyboard', () => {
    const s = scene('third_party');
    s.scene!.moments!.open!.exposing = 'Leash';
    for (const chips of ['chips', 'immersive'] as const) {
      const v = draw(s, chips);
      expect(markedWithout(v.host)).toEqual([]);
      expect(unresolved(v.host, env(s))).toEqual([]);
      expect(unreachable(v.host)).toEqual([]);
    }
    const v = draw(s);
    expect(v.options().every((b) => b.getAttribute('data-analyze') === 'momentSources:third_party' && b.hasAttribute('data-analyze-ctx'))).toBe(true);
    expect(v.options().map((b) => JSON.parse(b.getAttribute('data-analyze-ctx')!).key)).toEqual(['0', '1', '2', 'lock', 'look']);
  });

  it('every option reads its kind of answer and nothing names the one she expects', () => {
    const s = scene('third_party');
    const lines = (st: CampaignState): string[] => ['0', '1', '2', 'lock', 'look'].map((key) => analyze('momentSources:third_party', env(st), { key }).join(' '));
    const plain = lines(s);
    expect(plain[0]).toBe('This answer goes along with her.'); // hiding is not remembered
    expect(plain[1]).toBe('This answer takes the lead back. Those present will remember it.');
    expect(plain.every((l) => l !== '')).toBe(true);
    expect(plain[2]).toContain('pushes back');
    expect(plain[4]).toContain('turns it aside');
    expect(plain.join('\n')).not.toMatch(/expect|strength|gap|escalat|matched|opposite/i);
    // her expectation, whatever it is, changes no reading
    registerExpectation(() => ({ key: '0', strength: 3 }));
    const other = lines(s);
    registerFrameReader(() => 'play');
    expect(other).toEqual(plain);
    // no open moment of that source, or no key: the static text only
    expect(analyze('momentSources:third_party', env(scene(null)), { key: '1' })).toEqual([]);
    expect(analyze('momentSources:third_party', env(s))).toEqual([]);
    expect(analyze('momentSources:her_offer', env(s), { key: '1' })).toEqual([]);
  });

  it('the static text of a source is its description (the panel resolves it)', () => {
    const s = scene('her_question');
    expect(unresolved(draw(s).host, env(s))).toEqual([]);
    expect(reg.glossary.has('moment_card')).toBe(true);
  });
});
