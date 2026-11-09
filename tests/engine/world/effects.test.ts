import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import type { WorldEffect } from '../../../src/engine/world/types';
import { campaign, ctxOf, loadCore, ofType, stubExpedition } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const SRC = { kind: 'event' as const, id: 'evt_test' };
function apply(state: CampaignState, effects: WorldEffect[], src: { kind: 'mission' | 'clock' | 'event' | 'beat' | 'director'; id: string; depth?: number; label?: string } = SRC) {
  const draft = structuredClone(state);
  const events = applyWorldEffects(draft, ctxOf(draft, reg), effects, src);
  return { draft, events };
}
const open = (extra: Partial<NonNullable<CampaignState['expedition']>> = {}): CampaignState => {
  const s = structuredClone(base);
  s.expedition = stubExpedition(s, extra);
  return s;
};

describe('world effects', () => {
  it('resource never goes below zero', () => {
    const s = structuredClone(base);
    s.resources.credits = 20;
    const r = apply(s, [{ type: 'resource', resource: 'credits', amount: -50 }, { type: 'resource', resource: 'plyx', amount: 5 }]);
    expect(r.draft.resources.credits).toBe(0);
    expect(r.draft.resources.plyx).toBe(base.resources.plyx + 5);
    expect(ofType(r.events, 'resource_changed')).toEqual([
      { type: 'resource_changed', resource: 'credits', amount: -20 },
      { type: 'resource_changed', resource: 'plyx', amount: 5 },
    ]);
    // a change that changes nothing emits nothing
    expect(apply({ ...s, resources: { ...s.resources, credits: 0 } }, [{ type: 'resource', resource: 'credits', amount: -5 }]).events).toEqual([]);
  });

  it('carried_supplies only counts on an expedition and is clamped to 0…suppliesMax', () => {
    expect(apply(base, [{ type: 'carried_supplies', amount: 3 }]).events).toEqual([]);
    const s = open({ supplies: 4 });
    expect(apply(s, [{ type: 'carried_supplies', amount: -9 }]).draft.expedition!.supplies).toBe(0);
    expect(apply(s, [{ type: 'carried_supplies', amount: 99 }]).draft.expedition!.supplies).toBe(TUNING.expedition.suppliesMax);
  });

  it('faction clamps at ±100 and reports the standing', () => {
    const s = structuredClone(base);
    s.world.factions.sable = 95;
    const up = apply(s, [{ type: 'faction', factionId: 'sable', amount: 30 }]);
    expect(up.draft.world.factions.sable).toBe(100);
    expect(ofType(up.events, 'faction_changed')).toEqual([{ type: 'faction_changed', factionId: 'sable', amount: 5, standing: 100 }]);
    s.world.factions.sable = -90;
    expect(apply(s, [{ type: 'faction', factionId: 'sable', amount: -30 }]).draft.world.factions.sable).toBe(-100);
  });

  it('a flag removes the flags it excludes and lands in the list of its scope', () => {
    const s = structuredClone(base);
    s.world.flags = ['evidence_buried'];
    const r = apply(s, [{ type: 'flag', flagId: 'evidence_sold_aurum' }]);
    expect(r.draft.world.flags).toEqual(['evidence_sold_aurum']);
    expect(ofType(r.events, 'flag_set')).toEqual([{ type: 'flag_set', flagId: 'evidence_sold_aurum', scope: 'world' }]);
    // setting it again is a no-op without an event
    const again = apply(r.draft, [{ type: 'flag', flagId: 'evidence_sold_aurum' }]);
    expect(again.events).toEqual([]);
    expect(again.draft.world.flags).toEqual(['evidence_sold_aurum']);
  });

  it('a commander-scoped flag goes to the commander', () => {
    const regs = { ...reg, flags: new Map(reg.flags) } as Registries;
    regs.flags.set('cmd_test', { id: 'cmd_test', scope: 'commander', description: 'd' });
    const draft = structuredClone(base);
    const events = applyWorldEffects(draft, ctxOf(draft, regs), [{ type: 'flag', flagId: 'cmd_test' }], SRC);
    expect(draft.commander.flags).toContain('cmd_test');
    expect(draft.world.flags).not.toContain('cmd_test');
    expect(ofType(events, 'flag_set')).toHaveLength(1);
  });

  it('a flag nobody declared, or one of relation scope, is skipped', () => {
    expect(apply(base, [{ type: 'flag', flagId: 'ghost' }, { type: 'flag', flagId: 'knows_crime' }]).events).toEqual([]);
  });

  it('clearance never drops and stops at 3', () => {
    const s = structuredClone(base);
    s.world.clearanceTier = 2;
    const low = apply(s, [{ type: 'clearance', tier: 1 }]);
    expect(low.draft.world.clearanceTier).toBe(2);
    expect(low.events).toEqual([]);
    const up = apply(s, [{ type: 'clearance', tier: 3 }]);
    expect(up.draft.world.clearanceTier).toBe(3);
    expect(ofType(up.events, 'clearance_raised')).toEqual([{ type: 'clearance_raised', tier: 3 }]);
    expect(apply(base, [{ type: 'clearance', tier: 1 }]).draft.world.clearanceTier).toBe(1);
  });

  it('party_stress is clamped 0…100 and hits the expedition party, or the active roster without one', () => {
    const s = open({ party: [base.roster.activeIds[0]] });
    const [a, b] = base.roster.activeIds;
    s.squad.find((u) => u.id === a)!.stress = 95;
    const r = apply(s, [{ type: 'party_stress', amount: 20 }]);
    expect(r.draft.squad.find((u) => u.id === a)!.stress).toBe(100);
    expect(r.draft.squad.find((u) => u.id === b)!.stress).toBe(base.squad.find((u) => u.id === b)!.stress);
    expect(ofType(r.events, 'stress_changed')).toEqual([{ type: 'stress_changed', unitId: a, delta: 5 }]);
    // no expedition: everybody on the active roster, never below 0
    const all = apply(structuredClone(base), [{ type: 'party_stress', amount: -50 }]);
    for (const id of base.roster.activeIds) expect(all.draft.squad.find((u) => u.id === id)!.stress).toBe(0);
  });

  it('party_hp never kills and never exceeds max', () => {
    const s = open();
    const [a, b] = s.expedition!.party;
    s.squad.find((u) => u.id === a)!.currentHp = 10;
    s.squad.find((u) => u.id === b)!.currentHp = 50;
    const r = apply(s, [{ type: 'party_hp', pct: -90 }]);
    expect(r.draft.squad.find((u) => u.id === a)!.currentHp).toBe(1);
    expect(r.draft.squad.find((u) => u.id === b)!.currentHp).toBeGreaterThanOrEqual(1);
    const healed = apply(s, [{ type: 'party_hp', pct: 100 }]);
    const max = healed.draft.squad.find((u) => u.id === a)!.currentHp;
    expect(max).toBeGreaterThan(10);
    expect(apply(healed.draft, [{ type: 'party_hp', pct: 100 }]).draft.squad.find((u) => u.id === a)!.currentHp).toBe(max);
    // units outside the party are untouched
    const outsider = s.roster.activeIds.find((id) => !s.expedition!.party.includes(id))!;
    expect(r.draft.squad.find((u) => u.id === outsider)!.currentHp).toBe(s.squad.find((u) => u.id === outsider)!.currentHp);
  });

  it('loot waits in the expedition and is banked without one', () => {
    const on = apply(open(), [{ type: 'loot', tableId: 'loot_cache' }]);
    expect(on.draft.expedition!.loot.length).toBeGreaterThan(0);
    expect(ofType(on.events, 'loot_banked')).toEqual([]);
    expect(on.draft.resources).toEqual(base.resources);
    const off = apply(base, [{ type: 'loot', tableId: 'loot_cache' }]);
    expect(off.draft.expedition).toBeUndefined();
    expect(ofType(off.events, 'loot_banked')).toHaveLength(1);
    const gained = off.draft.resources.credits + off.draft.resources.plyx + off.draft.resources.supplies + off.draft.inventory.length;
    expect(gained).toBeGreaterThan(base.resources.credits + base.resources.plyx + base.resources.supplies + base.inventory.length);
    // `rolls` repeats the table roll
    const triple = apply(open(), [{ type: 'loot', tableId: 'loot_cache', rolls: 3 }]);
    expect(triple.draft.expedition!.loot.length).toBe(6);
  });

  it('a removed loot table is skipped', () => {
    expect(apply(open(), [{ type: 'loot', tableId: 'ghost' }]).draft.expedition!.loot).toEqual([]);
  });

  it('leash never goes below zero', () => {
    const s = structuredClone(base);
    s.leash.authorizationsLeft = 1;
    expect(apply(s, [{ type: 'leash', amount: -1 }, { type: 'leash', amount: -1 }]).draft.leash.authorizationsLeft).toBe(0);
    expect(apply(s, [{ type: 'leash', amount: 1 }]).draft.leash.authorizationsLeft).toBe(2);
  });

  it('thread changes the status of an existing thread only', () => {
    const s = structuredClone(base);
    s.world.threads.push({ id: 't1', title: 'T', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
    const r = apply(s, [{ type: 'thread', threadId: 't1', status: 'resolved' }, { type: 'thread', threadId: 'ghost', status: 'failed' }]);
    expect(r.draft.world.threads[0].status).toBe('resolved');
    expect(ofType(r.events, 'thread_changed')).toEqual([{ type: 'thread_changed', threadId: 't1', status: 'resolved' }]);
    expect(r.draft.world.threads).toHaveLength(1);
  });

  it('unit_event queues an intent for named party units only', () => {
    const s = open();
    const [a, b] = s.expedition!.party;
    // make the second party member a grunt
    s.squad.find((u) => u.id === b)!.kind = 'grunt';
    const fx: WorldEffect = { type: 'unit_event', event: 'sided_with', severity: 'minor', targets: 'named', valueAxes: [{ axis: 'mercy', direction: 1 }] };
    const named = apply(s, [fx], { ...SRC, label: 'Wounded scavenger' });
    expect(named.draft.expedition!.hints).toEqual([{
      type: 'sided_with', actor: 'commander', targets: [a], severity: 'minor', evidence: 'Wounded scavenger', valueAxes: [{ axis: 'mercy', direction: 1 }],
    }]);
    const party = apply(s, [{ ...fx, targets: 'party' }]);
    expect(party.draft.expedition!.hints[0].targets).toEqual([a, b]);
    expect(party.draft.expedition!.hints[0].evidence).toBe('evt_test');
    // without an expedition there is nobody to report to
    expect(apply(base, [fx]).events).toEqual([]);
  });

  it('incoming_unit raises the counter', () => {
    const r = apply(base, [{ type: 'incoming_unit' }, { type: 'incoming_unit' }]);
    expect(r.draft.world.incomingUnits).toBe(2);
    expect(ofType(r.events, 'incoming_unit_offered')).toHaveLength(2);
  });

  it('fact is public', () => {
    const s = structuredClone(base);
    s.day = 7;
    const r = apply(s, [{ type: 'fact', text: 'Oversight opened a file.', tags: ['oversight'], importance: 4 }]);
    const fact = r.draft.memory.facts.find((f) => f.text === 'Oversight opened a file.')!;
    expect(fact).toMatchObject({ about: [], knownBy: ['*'], importance: 4, day: 7, tags: ['oversight'] });
  });

  it('an effect on a removed clock or faction is skipped', () => {
    const r = apply(base, [
      { type: 'clock', clockId: 'ghost_clock', by: 1 }, { type: 'faction', factionId: 'ghost_corp', amount: 5 },
      { type: 'thread', threadId: 'ghost_thread', status: 'failed' },
    ]);
    expect(r.events).toEqual([]);
    expect(r.draft.world.factions).toEqual(base.world.factions);
  });

  it('offer_mission is routed to the mission module (not in this task: it throws until then)', () => {
    expect(() => apply(base, [{ type: 'offer_mission', templateId: 'tpl_sweep', source: 'command' }])).toThrow(/not implemented/);
  });
});
