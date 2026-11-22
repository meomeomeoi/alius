import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/engine/actions/dynamic';
import type { Registries } from '../../src/content/types';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { zoneTag } from '../../src/engine/dynamic/zones';
import { addFact } from '../../src/engine/memory/facts';
import type { CampaignState } from '../../src/engine/state/types';
import { ANN, harness, intentJson } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** Ann practises (cold), feet craves, nothing shown yet but the feet; the dynamic is on. */
function tweak(s: CampaignState): void {
  const u = s.squad.find((x) => x.id === ANN)!;
  u.bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  u.expectations = { worship: { feet: { attitude: 'craves' }, hands: { attitude: 'dislikes' } } };
  s.content = { enabled: ['restraint', 'worship', 'service', 'humiliation', 'objectification'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 20 };
  addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: shown feet', tags: ['dynamic', zoneTag('feet')], importance: 2, day: s.day, knownBy: [ANN] });
}
const offerFeet = { type: 'dynamic/offer', payload: { unitId: ANN, composition: [{ tab: 'part', ids: ['feet'] }] } };

describe('an offer made in a DM tells the model her answer (P15, review I3)', () => {
  it('the dm.reply prompt carries the engine\'s answer word, in words, with no number and no pronoun for the commander', async () => {
    const h = harness(reg, { tweak });
    expect(h.dispatch(offerFeet).find((e) => e.type === 'error')).toBeUndefined();
    expect(h.state().dynamic!.open.offers[0]).toMatchObject({ unitId: ANN, answer: 'accepted' });
    h.st.mainReplies = ['Come here.', intentJson()];
    await h.comms.send(ANN, '*offers her feet.*');
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toMatch(/The commander offers .+ to Ann/i);
    expect(prompt).toMatch(/takes it up/);
    expect(prompt).not.toMatch(/\b(he|him|his)\b/i);
    expect(prompt).not.toMatch(/hold|favour|regard/i);
  });

  it('with no offer open the prompt is the prompt of before; an offer made in a scene, or already answered in the thread, is not carried', async () => {
    const plain = harness(reg, { tweak });
    plain.st.mainReplies = ['Here.', intentJson()];
    await plain.comms.send(ANN, 'Hello?');
    const base = (plain.st.calls[0] as { prompt: string }).prompt;
    expect(base).not.toMatch(/commander offers/i);

    const inScene = harness(reg, { tweak });
    inScene.dispatch(offerFeet);
    const st = structuredClone(inScene.state());
    st.dynamic!.open.offers[0].sceneId = 'sc1'; // the scene's directive carries that one
    delete st.dynamic!.open.offers[0].dmAt;
    inScene.set(st);
    inScene.st.mainReplies = ['Here.', intentJson()];
    await inScene.comms.send(ANN, 'Hello?');
    expect((inScene.st.calls[0] as { prompt: string }).prompt).not.toMatch(/commander offers/i);

    const answered = harness(reg, { tweak });
    answered.dispatch(offerFeet);
    answered.st.mainReplies = ['Come here.', intentJson(), 'Again?', intentJson()];
    await answered.comms.send(ANN, '*offers her feet.*');
    await answered.comms.send(ANN, 'Anything else?');
    expect((answered.st.calls.filter((c) => (c as { prompt?: string }).prompt?.includes('Recent messages')).at(-1) as { prompt: string }).prompt).not.toMatch(/commander offers/i);
  });
});
