import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { recordPromise } from '../../src/engine/memory';
import type { CampaignState } from '../../src/engine/state/types';
import { clockById } from '../../src/engine/world/state';
import { ContextBuilder } from '../../src/llm/context';
import { registerSceneContext } from '../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { registerWorldContext } from '../../src/world/context';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const builder = () => {
  const b = new ContextBuilder();
  registerSceneContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
  registerWorldContext(b, { registries: () => reg });
  return b;
};
const inScene = (tweak: (s: CampaignState) => void = () => {}, participants = [ANN]): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 12;
  s.slot = 'evening';
  tweak(s);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const worldLine = (b: ContextBuilder, s: CampaignState, cap = 5000): string => {
  const lines = b.build(s, cap).block.split('\n');
  return lines.filter((l) => /^(World|Ongoing|Pressure):/.test(l)).join('\n');
};
const report = (over: Record<string, unknown> = {}) => ({
  id: 'rep_1', missionId: 'm1', missionTitle: 'T', regionId: 'ashway', day: 10, outcome: 'success', party: [], nodes: [], log: [], loot: [],
  injuries: [], deaths: [], breakdowns: [], acknowledged: true, debriefed: false, ...over,
}) as never;
const thread = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, title, status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1, ...over,
}) as never;
const fill = (s: CampaignState, id: string, n: number) => { clockById(s, id)!.filled = n; };

describe('world context', () => {
  it('renders nothing outside a scene', () => {
    const b = builder();
    const s = campaign(reg, 4);
    s.lastExpedition = report({ day: s.day });
    fill(s, 'bloom_d7', 7);
    expect(b.build(s, 5000).block).toBe('[ALIUS CONTEXT]\n[ALIUS] Day 1, Morning.');
  });

  it('renders nothing in a scene when nothing applies', () => {
    const b = builder();
    const s = inScene((x) => { for (const c of x.world.clocks) c.filled = 0; });
    expect(worldLine(b, s)).toBe('');
  });

  it('mentions the last expedition for three days and then drops it', () => {
    const b = builder();
    const at = (day: number) => worldLine(b, inScene((s) => { s.lastExpedition = report({ day: 12 - day }); }));
    expect(at(2)).toBe('World: the unit came back from The Ashway 2 day(s) ago (success).');
    expect(at(3)).toContain('3 day(s) ago');
    expect(at(4)).toBe('');
    expect(at(0)).toBe('World: the unit came back from The Ashway today (success).');
    const lost = worldLine(b, inScene((s) => { s.lastExpedition = report({ day: 11, outcome: 'retreated' }); }));
    expect(lost).toContain('1 day(s) ago (retreated)');
    // an unknown region falls back to its id
    expect(worldLine(b, inScene((s) => { s.lastExpedition = report({ day: 11, regionId: 'gone_region' }); }))).toContain('gone_region');
  });

  it('prefers a thread that involves a present unit', () => {
    const b = builder();
    const s = inScene((x) => {
      x.world.threads.push(thread('spine:beat_1', 'First sample'), thread('t1', 'Bea\'s brother', { relatedUnits: [BEA] }), thread('t2', 'Ann\'s dog tags', { relatedUnits: [ANN] }));
      x.world.spine = { proposed: 'beat_1' };
    });
    expect(worldLine(b, s)).toBe("Ongoing: Ann's dog tags.");
    // no thread of a present unit: the proposed spine beat's thread
    const spine = inScene((x) => {
      x.world.threads.push(thread('spine:beat_1', 'First sample'), thread('t1', "Bea's brother", { relatedUnits: [BEA] }));
      x.world.spine = { proposed: 'beat_1' };
    });
    expect(worldLine(b, spine)).toBe('Ongoing: First sample.');
    // closed threads and a spine thread that is not the proposed one do not count
    const none = inScene((x) => {
      x.world.threads.push(thread('t2', 'Done', { relatedUnits: [ANN], status: 'resolved' }), thread('spine:beat_1', 'First sample'));
    });
    expect(worldLine(b, none)).toBe('');
  });

  it('lists at most two visible clocks above half and never a hidden one', () => {
    const b = builder();
    const s = inScene((x) => {
      for (const c of x.world.clocks) c.filled = 0;
      fill(x, 'bloom_d7', 5); // 5/8 visible
      fill(x, 'corridor_quota', 4); // 4/6 visible
      fill(x, 'oversight', 5); // 5/6 visible
      fill(x, 'sable_operation', 5); // hidden
      fill(x, 'garden_wake', 9); // hidden
    });
    const text = worldLine(b, s);
    expect(text).toBe('Pressure: Oversight suspicion is at 5/6. Pressure: Corridor K-12 quota is at 4/6.');
    expect(text).not.toContain('Sable');
    expect(text).not.toContain('Garden');
    // exactly half is not above half
    const half = inScene((x) => { for (const c of x.world.clocks) c.filled = 0; fill(x, 'oversight', 3); });
    expect(worldLine(b, half)).toBe('');
  });

  it('never more than three sentences', () => {
    const b = builder();
    const s = inScene((x) => {
      x.lastExpedition = report({ day: 11 });
      x.world.threads.push(thread('t1', 'Open thread', { relatedUnits: [ANN] }));
      for (const c of x.world.clocks) c.filled = c.segments - 1;
    });
    const text = worldLine(b, s);
    expect(text.match(/(World|Ongoing|Pressure):/g)).toHaveLength(3);
    expect(text).toMatch(/^World:/);
    expect(text).toMatch(/Ongoing:/);
    expect(text.match(/Pressure:/g)).toHaveLength(1);
  });

  it('dynamic flags never appear', () => {
    const b = builder();
    const s = inScene((x) => {
      x.world.threads.push(thread('t1', 'Open thread', { relatedUnits: [ANN], flags: [{ id: 'thread:t1:secret_door', description: 'The secret door is open.' }] }));
    });
    expect(b.build(s, 5000).block).not.toMatch(/secret/i);
  });

  it('is trimmed before the promises provider under a tight cap', () => {
    const b = builder();
    const s = inScene((x) => {
      x.lastExpedition = report({ day: 11 });
      recordPromise(x, { by: 'commander', to: ANN, text: 'bring the medicine', kind: 'made' }, x.day, [ANN]);
    });
    const full = b.build(s, 5000).block;
    expect(full).toContain('World:');
    const promisesAt = full.split('\n').findIndex((l) => /medicine/i.test(l));
    expect(promisesAt).toBeGreaterThan(0);
    const worldAt = full.split('\n').findIndex((l) => l.startsWith('World:'));
    expect(worldAt).toBeGreaterThan(promisesAt); // the world line comes after (below) the promises
    const withoutWorld = full.split('\n').slice(0, worldAt).join('\n');
    const tight = Math.ceil(withoutWorld.length / 3.6) + 1;
    const trimmed = b.build(s, tight).block;
    expect(trimmed).toMatch(/medicine/i);
    expect(trimmed).not.toContain('World:');
  });
});
