import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../src/engine/blocking';
import type { CampaignState } from '../../src/engine/state/types';
import { clearBlockingDirectives, refreshBlockingDirectives } from '../../src/blocking/directives';
import { ContextBuilder, type ContextProvider } from '../../src/llm/context';
import { blockingLine, registerBlockingContext } from '../../src/scene/blockingContext';
import { registerMemoryContext } from '../../src/scene/memoryContext';
import { registerSceneContext } from '../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { enable } from '../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import '../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetBlockingHooks());

const ANN = 'unit_ann';
const hint = (registry: 'blockingPostures' | 'blockingAnchors' | 'blockingItems' | 'blockingActivities', id: string): string => String(reg[registry].get(id)!.promptHint);

function scene(over: { stateId?: string; on?: string[]; loc?: string } = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: over.stateId ?? 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const put = (s: CampaignState, ...changes: BlockingChange[]): CampaignState => {
  const d = structuredClone(s);
  for (const c of changes) setBlocking(d, { registries: reg }, c, { at: 1, source: 'engine' });
  return d;
};
const provider = (): ContextProvider => {
  const out: ContextProvider[] = [];
  registerBlockingContext({ register: (p: ContextProvider) => out.push(p) } as unknown as ContextBuilder, { registries: () => reg });
  return out[0]!;
};
const NOUN = /\b(he|him|his|himself|she|her|hers|herself|they|them|their)\b/i;

describe('[BLOCKING] (R8)', () => {
  it('the reference case renders as a line per person with a set field', () => {
    const s = put(scene({ on: ['restraint', 'humiliation'] }),
      { person: ANN, field: 'posture', value: 'sitting' }, { person: ANN, field: 'anchor', value: 'at_desk' }, { person: ANN, field: 'activity', value: 'on_comms' },
      { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { person: COMMANDER, field: 'anchor', value: 'under_desk' },
      { person: COMMANDER, field: 'worn', value: 'ring_gag' });
    const text = provider().render(s)!;
    expect(text).toBe([
      '[BLOCKING]',
      `Ann: ${hint('blockingPostures', 'sitting')} ${hint('blockingAnchors', 'at_desk')}, ${hint('blockingActivities', 'on_comms')}.`,
      `The commander: ${hint('blockingPostures', 'kneeling_upright')} ${hint('blockingAnchors', 'under_desk')}, ${hint('blockingItems', 'ring_gag')}.`,
    ].join('\n'));
    expect(blockingLine(s, reg, ANN)).toBe(text.split('\n')[1]!.replace(/\.$/, '') + '.');
    expect(text).toContain('Ann: sitting at the desk, on comms.');
    expect(text).toContain('The commander: kneeling upright under the desk, ring-gagged.');
  });

  it('shows only the fields that are set: a person with none is absent, and a live scene with nothing set has no block', () => {
    const none = scene();
    expect(provider().render(none)).toBeNull();
    expect(blockingLine(none, reg, ANN)).toBeNull();
    const s = put(none, { person: COMMANDER, field: 'posture', value: 'sitting' });
    expect(provider().render(s)).toBe('[BLOCKING]\nThe commander: sitting.');
    expect(blockingLine(s, reg, ANN)).toBeNull();
  });

  it('each worn item once (a hood takes two slots), the contact on the person it is stored on, and a set intimacy or note', () => {
    registerFrameReader(() => 'play');
    const s = put(scene({ on: ['restraint', 'worship'] }),
      { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN },
      { person: COMMANDER, field: 'intimacy', value: 'close' }, { person: ANN, field: 'intimacy', value: 'none' }, { person: ANN, field: 'note', value: 'tired after the run' });
    const text = provider().render(s)!;
    expect(text.match(/hooded/g)).toHaveLength(1);
    expect(text).toContain(`Ann: sitting, the commander worships her feet, note: tired after the run.`);
    expect(text).toContain('intimacy: close');
    expect(text).not.toContain('intimacy: none');
  });

  it('a live scene with no relation that is close renders nothing; the unlive scene has no block', () => {
    const s = scene({ stateId: 'comrade' });
    expect(provider().render(s)).toBeNull();
    expect(provider().render(campaign(reg, 4))).toBeNull();
  });

  it('is a core provider at priority 88 and keeps its room when memory fills the cap', () => {
    const p = provider();
    expect(p).toMatchObject({ id: 'blocking', priority: 88, core: true });
    expect(p.group).toBeUndefined();
    const s = put(scene(), { person: COMMANDER, field: 'posture', value: 'sitting' });
    s.memory.dossiers = { [ANN]: { shared: 'x '.repeat(400), day: 1, folded: 1 } as never, '*': { shared: 'y '.repeat(400), day: 1, folded: 1 } as never };
    const b = new ContextBuilder();
    registerSceneContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    registerBlockingContext(b, { registries: () => reg });
    registerMemoryContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    const built = b.build(s, 400, 400);
    expect(built.block).toContain('[BLOCKING]\nThe commander: sitting.');
    expect(built.block.indexOf('[BLOCKING]')).toBeLessThan(built.block.indexOf('What the squad remembers'));
  });

  it('no pronoun for the commander in the block', () => {
    registerFrameReader(() => 'play');
    const s = put(scene({ on: ['restraint', 'worship'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN });
    const commanderLine = provider().render(s)!.split('\n').find((l) => l.startsWith('The commander'))!;
    expect(commanderLine).not.toMatch(/\b(he|him|his|himself|their|them)\b/i);
  });
});

describe('the blocking: directives', () => {
  const get = (b: ContextBuilder, id: string): string | undefined => (b as unknown as { directives: Map<string, { text: string }> }).directives.get(id)?.text;
  const refresh = (s: CampaignState | null, b = new ContextBuilder()): ContextBuilder => {
    if (s) refreshBlockingDirectives(b, s, reg);
    else clearBlockingDirectives(b);
    return b;
  };

  it('blocking:scene words the input and mobility limits, one sentence per person, and no pronoun', () => {
    const s = put(scene({ on: ['restraint', 'humiliation', 'pet_play'] }),
      { person: COMMANDER, field: 'worn', value: 'hood' }, { person: COMMANDER, field: 'worn', value: 'ring_gag', slot: 'mouth' }, { person: COMMANDER, field: 'worn', value: 'spreader_bar' });
    const b = refresh(s);
    const text = get(b, 'blocking:scene')!;
    expect(text).toContain('The commander');
    expect(text).toContain('garbled');
    expect(text).toContain('movement');
    expect(text).not.toMatch(NOUN);
    const mitts = refresh(put(scene({ on: ['pet_play'] }), { person: COMMANDER, field: 'worn', value: 'muzzle' }));
    expect(get(mitts, 'blocking:scene')).toBe('The commander cannot speak words, only sounds.');
  });

  it('no limits, no blocking:scene', () => {
    const b = refresh(put(scene(), { person: COMMANDER, field: 'posture', value: 'sitting' }));
    expect(get(b, 'blocking:scene')).toBeUndefined();
    expect(get(b, 'blocking:pov')).toBeUndefined();
  });

  it('blocking:pov while the commander cannot see (a blindfold, pov_dark), and it is gone when removed', () => {
    const s = put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' });
    const b = refresh(s);
    expect(get(b, 'blocking:pov')).toBe('Narrate only what the commander can hear, feel and smell; do not describe how anyone looks.');
    expect(get(b, 'blocking:pov')).not.toMatch(NOUN);
    const off = put(s, { person: COMMANDER, field: 'removed', value: 'blindfold' });
    refreshBlockingDirectives(b, off, reg);
    expect(get(b, 'blocking:pov')).toBeUndefined();
    registerFrameReader(() => 'play');
    const dark = refresh(put(scene({ on: ['restraint', 'worship'] }), { person: COMMANDER, field: 'contact', value: 'smothered_armpit', with: ANN }));
    expect(get(dark, 'blocking:pov')).toBeDefined(); // camera pov_dark
    expect(get(dark, 'blocking:scene')).toMatch(/muffled/);
  });

  it('not live: no directive, and clearing removes every blocking: one', () => {
    const live = refresh(put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' }));
    expect(get(live, 'blocking:pov')).toBeDefined();
    refreshBlockingDirectives(live, scene({ stateId: 'comrade' }), reg);
    expect(get(live, 'blocking:pov')).toBeUndefined();
    const again = refresh(put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' }));
    refresh(null, again);
    expect(get(again, 'blocking:pov')).toBeUndefined();
    const noScene = refresh(campaign(reg, 4));
    expect(get(noScene, 'blocking:scene')).toBeUndefined();
  });

  it('directive ids start with blocking: and are manual', () => {
    const b = refresh(put(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'hood' }));
    const all = (b as unknown as { directives: Map<string, { expiresAfter: string }> }).directives;
    for (const [id, d] of all) {
      expect(id.startsWith('blocking:'), id).toBe(true);
      expect(d.expiresAfter).toBe('manual');
    }
    expect(all.size).toBeGreaterThan(0);
  });
});
