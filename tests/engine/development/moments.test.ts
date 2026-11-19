import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import { momentDirective, stampedMoments } from '../../../src/engine/development/moments';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { CampaignState, DevMoment } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const moment = (over: Partial<DevMoment> = {}): DevMoment => ({ id: 'dm0', axis: 'value:mercy', from: '1', to: '2', reason: 'kindness', day: 3, ...over });
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  const a = ensureDevelopment(s.squad.find((u) => u.id === ANN)!);
  a.moments = [moment()];
  a.facts = [{ id: 'df1', text: 'She hums.', kind: 'habit', day: 3, source: 'review' }];
  ensureDevelopment(s.squad.find((u) => u.id === BEA)!).moments = [moment({ id: 'dm1', axis: 'bond:desire', from: 'low', to: 'medium' })];
  return s;
}
const start = (s: CampaignState, ids: string[]) => run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } });
const dev = (s: CampaignState, id = ANN) => developmentOf(s.squad.find((u) => u.id === id)!);

describe('stamp, show, abort', () => {
  it('scene/start stamps a participant\'s moments and facts, and only hers', () => {
    const r = start(world(), [ANN]);
    expect(errors(r.events)).toEqual([]);
    const id = r.state.scene!.id;
    expect(dev(r.state).moments[0].sceneId).toBe(id);
    expect(dev(r.state).facts[0].sceneId).toBe(id);
    expect(dev(r.state, BEA).moments[0].sceneId).toBeUndefined();
    expect(stampedMoments(r.state, ANN)).toHaveLength(1);
    expect(stampedMoments(r.state, BEA)).toEqual([]);
  });

  it('scene/end shows them: shownDay is the day', () => {
    const s = start(world(), [ANN]).state;
    s.day = 4;
    const r = run(s, reg, { type: 'scene/end', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(dev(r.state).moments[0].shownDay).toBe(4);
    expect(dev(r.state).facts[0].shownDay).toBe(4);
    expect(dev(r.state, BEA).moments[0].shownDay).toBeUndefined();
  });

  it('scene/abort removes the stamp and shows nothing', () => {
    const s = start(world(), [ANN]).state;
    const r = run(s, reg, { type: 'scene/abort', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(dev(r.state).moments[0].sceneId).toBeUndefined();
    expect(dev(r.state).moments[0].shownDay).toBeUndefined();
    // and the next scene carries it
    const again = start(r.state, [ANN]).state;
    expect(stampedMoments(again, ANN)).toHaveLength(1);
  });

  it('a shown moment is not stamped again', () => {
    let s = start(world(), [ANN]).state;
    s = run(s, reg, { type: 'scene/end', payload: {} }).state;
    s = start(s, [ANN]).state;
    expect(stampedMoments(s, ANN)).toEqual([]);
  });

  it('a campaign without development is untouched by scenes', () => {
    const plain = campaign(reg, 4);
    const r = run(start(plain, [ANN]).state, reg, { type: 'scene/end', payload: {} });
    expect(r.state.squad.every((u) => u.development === undefined)).toBe(true);
  });
});

describe('the directive', () => {
  it('appears while the scene runs, in her words, with no pronoun for the commander', () => {
    const s = start(world(), [ANN, BEA]).state;
    const d = momentDirective(s, reg, ANN)!;
    expect(d).toMatchObject({ id: 'development:unit_ann', expiresAfter: 'scene' });
    expect(d.text).toContain('Ann has changed lately: more merciful than her file says');
    expect(d.text).toContain('never announce it');
    expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(d.text).not.toMatch(/\b(he|him|his)\b/i);
    expect(momentDirective(s, reg, BEA)!.text).toContain('wants more');
  });

  it('a down step, a taste and a like use their own words', () => {
    const s = world();
    ensureDevelopment(s.squad.find((u) => u.id === ANN)!).moments = [moment({ from: '2', to: '1' }), moment({ id: 'dm2', axis: 'like:tea', from: 'no', to: 'yes' })];
    const d = momentDirective(start(s, [ANN]).state, reg, ANN)!;
    expect(d.text).toContain('harder than her file says');
    expect(d.text).toContain('has come to like tea');
  });

  it('is null without a scene, for a unit that carries nothing, and after the scene', () => {
    expect(momentDirective(world(), reg, ANN)).toBeNull();
    const s = start(world(), [ANN]).state;
    expect(momentDirective(s, reg, 'unit_cat')).toBeNull();
    expect(momentDirective(run(s, reg, { type: 'scene/end', payload: {} }).state, reg, ANN)).toBeNull();
  });
});
