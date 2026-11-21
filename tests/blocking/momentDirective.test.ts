import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { momentDirective } from '../../src/blocking/momentDirectives';
import type { Registries } from '../../src/content/types';
import { registerFrameReader, resetBlockingHooks } from '../../src/engine/blocking';
import { fireMoment } from '../../src/engine/moments/fire';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/moments';

/** Review finding I5: the fire directive says who the moment is about, who comes in and what she brings up, and never the registry's design note. */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetBlockingHooks());

const ANN = 'unit_ann';
const BEA = 'unit_bea';
const COMMANDER_WORD = /\b(he|him|his|himself)\b/i;

function scene(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const fired = (s: CampaignState) => ({ type: 'moment_fired', momentId: s.scene!.moments!.open!.id });

describe('the directive of a moment that fires', () => {
  it('every source has a hint of its own for the model: not the design note, no marker', () => {
    for (const e of reg.momentSources.values()) {
      const hint = String(e.promptHint ?? '');
      expect(hint.length, String(e.id)).toBeGreaterThan(10);
      expect(hint, String(e.id)).not.toMatch(/AUTHOR TO WRITE|^Live when/);
      expect(hint, String(e.id)).not.toBe(String(e.description));
      expect(hint, String(e.id)).not.toMatch(COMMANDER_WORD);
    }
  });

  it('names the soldier it is about, and never the registry description', () => {
    const s = scene();
    fireMoment(s, { registries: reg }, 'her_question', BEA);
    const d = momentDirective(fired(s), s, reg)!;
    expect(d.text).toContain('Bea');
    expect(d.text).toContain(String(reg.momentSources.get('her_question')!.promptHint));
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|Live when/);
  });

  it('names the visitor the engine chose, so the story and the memory agree', () => {
    const s = scene();
    fireMoment(s, { registries: reg }, 'third_party', ANN);
    s.scene!.moments!.open!.visitorId = 'unit_cat';
    const d = momentDirective(fired(s), s, reg)!;
    expect(d.text).toContain('Cat');
    expect(d.text).not.toMatch(COMMANDER_WORD);
  });

  it('carries the fact a kept-fact moment brings up', () => {
    const s = scene();
    s.memory.facts.push({ id: 'fact_k', about: [ANN], text: 'She keeps her brother\'s tag in her boot.', tags: ['life', 'untold'], importance: 3, day: 1, knownBy: [ANN] });
    fireMoment(s, { registries: reg }, 'memory_surfaces', ANN);
    s.scene!.moments!.open!.factId = 'fact_k';
    const d = momentDirective(fired(s), s, reg)!;
    expect(d.text).toContain('brother');
  });
});
