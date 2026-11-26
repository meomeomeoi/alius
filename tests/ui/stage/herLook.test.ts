import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { handOf } from '../../../src/engine/hand';
import { fnv1a } from '../../../src/engine/hub';
import { herHand, setStageLooks, stageLookOf } from '../../../src/ui/stage/look';
import { UNIT_ACCENTS, unitAccent } from '../../../src/ui/voice/voiceCard';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => setStageLooks(new Map()));

describe('her look from her stage folder (P10e-f)', () => {
  it('herHand: the campaign\'s own hand first, then her card\'s, then the hash', () => {
    const state = campaign(reg, 2);
    const id = state.squad[0].id;
    const keys = [...reg.handFonts.keys()];
    const hashed = handOf(state, reg, id)!;
    const other = keys.find((k) => reg.handFonts.get(k) !== hashed)!;
    const third = keys.find((k) => k !== other && reg.handFonts.get(k) !== hashed)!;
    expect(herHand(state, reg, id)).toBe(hashed); // nothing set: the hash
    setStageLooks(new Map([[id, { hand: other }]]));
    expect(herHand(state, reg, id)).toBe(reg.handFonts.get(other)); // her card's
    state.squad[0].hand = third;
    expect(herHand(state, reg, id)).toBe(reg.handFonts.get(third)); // the campaign's own, whatever her card says
    delete state.squad[0].hand;
    setStageLooks(new Map([[id, { hand: 'no_such_hand' }]]));
    expect(herHand(state, reg, id)).toBe(hashed); // an unknown hand on her card is skipped
    expect(herHand(state, reg, 'nobody')).toBeNull();
  });

  it('unitAccent: the override first, the hash without one', () => {
    expect(unitAccent('u1')).toBe(UNIT_ACCENTS[fnv1a('u1') % UNIT_ACCENTS.length]);
    setStageLooks(new Map([['u1', { accent: '#123456' }]]));
    expect(unitAccent('u1')).toBe('#123456');
    expect(stageLookOf('u1')).toEqual({ accent: '#123456' });
    expect(unitAccent('u2')).toBe(UNIT_ACCENTS[fnv1a('u2') % UNIT_ACCENTS.length]);
    setStageLooks(new Map());
    expect(unitAccent('u1')).toBe(UNIT_ACCENTS[fnv1a('u1') % UNIT_ACCENTS.length]);
  });
});
