import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ensureDevelopment } from '../../src/engine/development/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder, type ContextProvider } from '../../src/llm/context';
import { estTokens } from '../../src/llm/text';
import { registerDevelopmentContext } from '../../src/scene/developmentContext';
import { registerMemoryContext } from '../../src/scene/memoryContext';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { withBond } from '../helpers/bonds';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const title = 'Since joining the unit:';

function provider(): ContextProvider {
  let found: ContextProvider | undefined;
  registerDevelopmentContext({ register: (p: ContextProvider) => { found = p; } } as unknown as ContextBuilder, { registries: () => reg });
  return found!;
}
const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Everyone in the scene has changed in some way. */
function world(participants: string[], developed: string[] = participants): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  for (const id of developed) {
    const dev = ensureDevelopment(unit(s, id));
    dev.drift.mercy = 1.2;
    dev.facts = [
      { id: 'df0', text: `${unit(s, id).displayName} keeps a spare ration for the others.`, kind: 'attitude', day: 2, source: 'review' },
      { id: 'df1', text: 'She hums while cleaning her rifle.', kind: 'habit', day: 5, source: 'habit' },
      { id: 'df2', text: 'She stopped sitting with her back to the door.', kind: 'attitude', day: 6, source: 'review', edited: true },
    ];
  }
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

describe('the since-joining block', () => {
  it('renders shifted axes and facts in words, with no number', () => {
    const s = world([ANN]);
    unit(s, ANN).values.mercy = 1;
    const out = provider().render(s, 2000)!;
    expect(out.startsWith(title)).toBe(true);
    expect(out).toContain('Ann: more merciful than her file says');
    expect(out).not.toMatch(/\d/);
    expect(out).not.toMatch(/AUTHOR TO WRITE/);
    // edited first, then the newest; two facts only
    expect(out).toContain('She stopped sitting with her back to the door.');
    expect(out).toContain('She hums while cleaning her rifle.');
    expect(out).not.toContain('spare ration');
  });

  it('an unshown moment and fact count: behaviour first', () => {
    const s = world([ANN]);
    expect(unit(s, ANN).development!.facts.every((f) => f.shownDay === undefined)).toBe(true);
    expect(provider().render(s, 2000)).toContain('Ann:');
  });

  it('is one line per present unit, and only about her', () => {
    const s = world([ANN, BEA], [ANN, BEA, CAT]);
    const out = provider().render(s, 2000)!;
    const lines = out.split('\n').slice(1);
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('- Ann:')).toBe(true);
    expect(lines[1].startsWith('- Bea:')).toBe(true);
    expect(out).not.toContain('Cat');
  });

  it('shows a gained like and a bond step in words', () => {
    const s = world([ANN], []);
    withBond(s, ANN, {});
    const dev = ensureDevelopment(unit(s, ANN));
    dev.gained = { likes: ['cooking'] };
    dev.bond = { desire: 'medium' };
    const out = provider().render(s, 2000)!;
    expect(out).toContain('has come to like cooking');
    expect(out).toContain('wants more');
  });

  it('out of a scene it renders nothing', () => {
    const s = campaign(reg, 4);
    s.settings.characterDevelopment = 'normal';
    ensureDevelopment(unit(s, ANN)).drift.mercy = 1.2;
    expect(provider().render(s, 2000)).toBeNull();
  });

  it('a unit with no development, or with nothing to say, renders nothing', () => {
    expect(provider().render(world([ANN], []), 2000)).toBeNull();
    const s = world([ANN], []);
    ensureDevelopment(unit(s, ANN)); // a block with nothing in it
    expect(provider().render(s, 2000)).toBeNull();
  });

  it('a campaign with development off has no block (nothing was ever written)', () => {
    const plain = campaign(reg, 4);
    const r = run(plain, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(provider().render(r.state, 2000)).toBeNull();
  });

  it('names no pronoun for the commander', () => {
    const out = provider().render(world([ANN, BEA]), 2000)!;
    expect(out).not.toMatch(/\b(he|him|his)\b/i);
  });
});

describe('inside the memory budget', () => {
  it('four developed units are trimmed line by line inside the memory share', () => {
    const s = world([ANN, BEA, CAT, DEE]);
    const builder = new ContextBuilder();
    registerMemoryContext(builder, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    registerDevelopmentContext(builder, { registries: () => reg });
    const full = provider().render(s, 2000)!;
    expect(full.split('\n')).toHaveLength(5);
    const share = 60;
    const { block } = builder.build(s, 4000, share);
    const lines = block.split('\n');
    const at = lines.indexOf(title);
    expect(at).toBeGreaterThanOrEqual(0);
    const mine = lines.slice(at).filter((l) => l === title || l.startsWith('- '));
    expect(mine.length).toBeLessThan(5); // trimmed, not whole
    expect(mine.length).toBeGreaterThan(1); // the title and at least one line survive
    expect(estTokens(mine.join('\n'))).toBeLessThanOrEqual(share);
  });

  it('sits after the dossier and before the journal', () => {
    const order: Array<[string, number]> = [];
    registerMemoryContext({ register: (p: ContextProvider) => order.push([p.id, p.priority]) } as unknown as ContextBuilder, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    const mine = provider();
    expect(mine.group).toBe('memory');
    const dossier = order.find(([id]) => id === 'dossier')![1];
    const journal = order.find(([id]) => id === 'journal')![1];
    expect(mine.priority).toBeLessThan(dossier);
    expect(mine.priority).toBeGreaterThan(journal);
  });
});
