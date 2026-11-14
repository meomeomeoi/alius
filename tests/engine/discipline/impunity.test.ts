import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { addRecord, decayRecords, disciplineOf, recordOf } from '../../../src/engine/discipline/record';
import { impunityBand, impunityOf, leverageOf } from '../../../src/engine/discipline/impunity';
import { commanderProfile } from '../../../src/engine/commander/profile';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';
import { noPresence, setRecord } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});

const A = 'unit_ann';
const B = 'unit_bea';
const C = 'unit_cat';
const D = 'unit_dee';
/** Day 8: a week has passed, so a Leash nobody has used reads as a bluff (+8). */
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 8;
  return s;
};
const val = (s: CampaignState, id = A, r: Registries = reg) => impunityOf(s, r, id)!;
const logEntry = (s: CampaignState, over: Record<string, unknown> = {}) => {
  s.leash.log.push({ no: 1, unitId: B, kind: 'compel', day: s.day, context: 'scene', outcome: 'done', ...over });
};

describe('impunityOf', () => {
  it('on day 1 a fresh unit on a guarded world reads just its base, 35', () => {
    const s = campaign(reg, 4);
    expect(val(s).value).toBe(35);
    expect(val(s).terms).toEqual({ base: 35, record: 0, leash: 0, presence: 0, dependency: 0, contagion: 0, leverage: 0 });
  });

  it('a fresh unit on a guarded world with a Leash never used for a week reads 35 + 0 + 8', () => {
    const s = fresh();
    expect(val(s).value).toBe(43);
    expect(val(s).terms).toEqual({ base: 35, record: 0, leash: 8, presence: 0, dependency: 0, contagion: 0, leverage: 0 });
  });

  it('base follows her effective disposition: offset +2 on a guarded world is volatile', () => {
    const s = fresh();
    s.squad[0].dispositionOffset = 2;
    expect(val(s).terms.base).toBe(55);
    s.squad[0].dispositionOffset = -1;
    expect(val(s).terms.base).toBe(25);
  });

  it('a pack whose level has no impunityBase reads the default 35; an active nickname adds its own base', () => {
    const s = fresh();
    const level = { ...(reg.dispositionLevels.get('guarded') as Entry) };
    delete (level as Record<string, unknown>).impunityBase;
    const bare: Registries = { ...reg, dispositionLevels: new Map([...reg.dispositionLevels, ['guarded', level]]) };
    expect(val(s, A, bare).terms.base).toBe(35);
    s.commander.reputation = { active: [{ id: 'iron_rule', name: 'Iron Rule', sinceDay: 1 }, { id: 'gone', name: 'Gone', sinceDay: 1 }] };
    const withNick: Registries = { ...reg, reputations: new Map([['iron_rule', { id: 'iron_rule', effects: { impunityBase: -8 } }]]) };
    expect(val(s, A, withNick).terms.base).toBe(27);
  });

  it('the record is the stored term', () => {
    const s = setRecord(fresh(), A, 12);
    expect(val(s).terms.record).toBe(12);
    expect(val(s).value).toBe(55);
  });

  describe('the Leash term L', () => {
    it('0 authorizations left and never used = +18', () => {
      const s = fresh();
      s.leash.authorizationsLeft = 0;
      expect(val(s).terms.leash).toBe(18);
    });
    it('the never-used bonus grows smoothly over the first week: 0, 1, 2, 3, 5, 6, 7 on days 1 to 7, +8 from day 8', () => {
      const at = (day: number) => { const s = fresh(); s.day = day; return val(s).terms.leash; };
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 30].map(at)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 8, 8]);
    });
    it('it fades the same way after the first use: nothing is cancelled at once', () => {
      // used on day 3 with 2 left: the credit earned by then (2) is held while the week fills, then fades over a week
      const at = (day: number) => {
        const s = fresh();
        s.day = day;
        s.leash.authorizationsLeft = 2;
        s.leash.log = [{ no: 1, unitId: B, kind: 'compel', day: 3, context: 'scene', outcome: 'done' }];
        return val(s).terms.leash - (day - 3 < 7 ? -10 : 0); // the recent-use −10 is its own term, added on top
      };
      const credits = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(at);
      expect(credits[0]).toBe(2);
      expect(credits.every((c, i) => i === 0 || c <= credits[i - 1] + 1)).toBe(true);
      expect(credits.at(-1)).toBe(0);
    });
    it('it fades from the full +8 after a use made later, and a Leash used long ago gives none', () => {
      const s = fresh();
      s.day = 40;
      s.leash.authorizationsLeft = 2;
      s.leash.log = [{ no: 1, unitId: B, kind: 'compel', day: 40, context: 'scene', outcome: 'done' }];
      expect(val(s).terms.leash).toBe(8 - 10); // the day of the use: all of it still there, and the fresh scare
      s.day = 43;
      expect(val(s).terms.leash).toBe(Math.round(8 * (1 - 3 / 7)) - 10);
      s.day = 47;
      expect(val(s).terms.leash).toBe(0);
      s.day = 90;
      expect(val(s).terms.leash).toBe(0);
    });
    it('a trimmed log with a sequence number still reads as used a long time ago', () => {
      const s = fresh();
      s.day = 90;
      s.leash.authorizationsLeft = 2;
      s.leash.seq = 5;
      s.leash.log = [];
      expect(val(s).terms.leash).toBe(0);
    });
    it('increases and decreases add up: the stored record, the ramp and a Leash use never cancel each other', () => {
      const day4 = (record: number) => { const s = setRecord(fresh(), A, record); s.day = 4; return val(s); };
      expect(day4(0).terms.leash).toBe(3);
      expect(day4(-12).terms.leash).toBe(3); // the ramp does not care about the record
      expect(day4(-12).value).toBe(day4(0).value - 12);
      expect(day4(12).value).toBe(day4(0).value + 12);
      const withUse = fresh();
      withUse.day = 4;
      withUse.leash.authorizationsLeft = 2;
      withUse.leash.log = [{ no: 1, unitId: B, kind: 'compel', day: 4, context: 'scene', outcome: 'done' }];
      setRecord(withUse, A, -20);
      // 35 base − 20 record + (3 credit − 10 recent use) = 8
      expect(val(withUse).value).toBe(35 - 20 + 3 - 10);
    });
    it('0 authorizations left adds its +10 to the ramp, whatever the day', () => {
      const s = fresh();
      s.day = 3;
      s.leash.authorizationsLeft = 0;
      expect(val(s).terms.leash).toBe(10 + 2);
    });
    it('never used needs an empty log and no sequence number', () => {
      const s = fresh();
      s.leash.seq = 2;
      expect(val(s).terms.leash).toBe(0);
    });
    it('a done use 3 days ago with 0 left: +10 empty, −10 scare, and 5 of the bluff credit still fading; 8 days ago with 2 left is 0', () => {
      const s = fresh();
      s.day = 12;
      s.leash.authorizationsLeft = 0;
      logEntry(s, { day: 9 });
      expect(val(s).terms.leash).toBe(10 - 10 + Math.round(8 * (1 - 3 / 7)));
      const t = fresh();
      t.day = 12;
      t.leash.authorizationsLeft = 2;
      logEntry(t, { day: 4 });
      expect(val(t).terms.leash).toBe(0);
    });
    it('a use counts for 7 days (the day itself and the 6 after; every unit heard of it)', () => {
      const s = fresh();
      s.day = 12;
      s.leash.authorizationsLeft = 2;
      const credit = (ago: number) => Math.round(8 * Math.max(0, 1 - ago / 7)); // the bluff credit is fading on its own
      logEntry(s, { day: 9 });
      expect(val(s).terms.leash).toBe(-10 + credit(3));
      expect(val(s, C).terms.leash).toBe(-10 + credit(3));
      s.leash.log = [];
      logEntry(s, { day: 6 }); // 6 days ago: the last day it counts
      expect(val(s).terms.leash).toBe(-10 + credit(6));
      s.leash.log = [];
      logEntry(s, { day: 5 }); // 7 days ago: over
      expect(val(s).terms.leash).toBe(0);
    });
    it('a failed or denied request is no fresh scare (only a done use is), though the credit starts to fade', () => {
      const s = fresh();
      s.leash.authorizationsLeft = 2;
      logEntry(s, { outcome: 'failed' });
      logEntry(s, { outcome: 'denied', no: 2 });
      expect(val(s).terms.leash).toBe(8); // no −10; asked today, so all of the credit is still there
    });
  });

  describe('presence P·w(d)', () => {
    const present = (s: CampaignState): Registries => ({
      ...reg, presence: new Map([['p', { id: 'p', factor: 'archetype', key: commanderProfile(s).archetype, presence: 10 }]]),
    });
    it('P = 10, met today → −10', () => {
      const s = fresh();
      s.relations[A].metDay = s.day;
      expect(val(s, A, present(s)).terms.presence).toBe(-10);
    });
    it('met 7 days ago (τ = 7) → round(−10·e⁻¹) = −4', () => {
      const s = fresh();
      s.day = 20;
      s.relations[A].metDay = 13;
      expect(val(s, A, present(s)).terms.presence).toBe(-4);
    });
    it('a commander who looks weak raises it', () => {
      const s = fresh();
      s.relations[A].metDay = s.day;
      const weak: Registries = { ...reg, presence: new Map([['p', { id: 'p', factor: 'archetype', key: commanderProfile(s).archetype, presence: -6 }]]) };
      expect(val(s, A, weak).terms.presence).toBe(6);
    });
  });

  describe('dependency D', () => {
    it('the dependent state takes 15 away, a controlled need 10, both 25', () => {
      const s = fresh();
      s.relations[A].stateId = 'dependent';
      expect(val(s).terms.dependency).toBe(-15);
      const t = fresh();
      t.relations[A].flags.push('need_controlled');
      expect(val(t).terms.dependency).toBe(-10);
      s.relations[A].flags.push('need_controlled');
      expect(val(s).terms.dependency).toBe(-25);
    });
    it('a defect on the manage arc is a defect upkeep', () => {
      const s = fresh();
      s.squad[0].defects = [{ id: 'echo_bleed', arc: 'manage' }];
      expect(val(s).terms.dependency).toBe(-10);
      s.squad[0].defects = [{ id: 'echo_bleed', arc: 'embrace' }];
      expect(val(s).terms.dependency).toBe(0);
    });
  });

  describe('contagion C', () => {
    it("others' records 20, 10, 0 → round(0.3 × 10) = 3; her own record is not in the mean", () => {
      const s = fresh();
      setRecord(s, B, 20);
      setRecord(s, C, 10);
      setRecord(s, A, 30);
      expect(val(s).terms.contagion).toBe(3);
      expect(val(s).terms.record).toBe(30);
    });
    it('only living named units count; with none the term is 0', () => {
      const s = fresh();
      setRecord(s, B, 40);
      s.squad.find((u) => u.id === B)!.status = 'deserted';
      expect(val(s).terms.contagion).toBe(0);
      for (const id of [C, D]) s.squad.find((u) => u.id === id)!.status = 'dead';
      expect(val(s).terms.contagion).toBe(0);
    });
    it('a negative mean lowers it', () => {
      const s = fresh();
      for (const id of [B, C, D]) setRecord(s, id, -20);
      expect(val(s).terms.contagion).toBe(-6);
    });
  });

  describe('leverage S', () => {
    it('knows_crime while another named unit does not → 5', () => {
      const s = fresh();
      s.relations[A].flags.push('knows_crime');
      expect(val(s).terms.leverage).toBe(5);
      expect(leverageOf(s, reg, A)).toEqual(['knows_crime']);
      expect(leverageOf(s, reg, B)).toEqual([]);
    });
    it('when every living named unit knows it is no secret: 0', () => {
      const s = fresh();
      for (const id of [A, B, C, D]) s.relations[id].flags.push('knows_crime');
      expect(val(s).terms.leverage).toBe(0);
      s.squad.find((u) => u.id === D)!.status = 'dead';
      s.relations[D].flags = [];
      expect(val(s).terms.leverage).toBe(0);
    });
    it('a crime that is not damaging gives no leverage', () => {
      const s = fresh();
      s.relations[A].flags.push('knows_crime');
      const crime = { ...(reg.crimes.get(s.commander.crimeId!) as Entry), damaging: false };
      const soft: Registries = { ...reg, crimes: new Map([...reg.crimes, [crime.id, crime]]) };
      expect(val(s, A, soft).terms.leverage).toBe(0);
    });
    it('any flag marked leverage counts, and the term never exceeds 15', () => {
      const s = fresh();
      const flags = new Map(reg.flags);
      for (const id of ['l1', 'l2', 'l3', 'l4']) flags.set(id, { id, scope: 'relation', description: 'x', leverage: true });
      const more: Registries = { ...reg, flags };
      s.relations[A].flags.push('knows_crime', 'l1', 'l2', 'l3', 'l4');
      expect(val(s, A, more).terms.leverage).toBe(15);
      expect(leverageOf(s, more, A)).toHaveLength(5);
    });
    it('a concealed affair she is part of counts, until the hidden partner learns of it', () => {
      const s = fresh();
      s.relations[B].stateId = 'lover';
      s.relations[A].affair = { as: 'lover', hiddenFrom: [B], since: 1 };
      expect(val(s).terms.leverage).toBe(5);
      expect(leverageOf(s, reg, A)).toEqual(['affair']);
      const fact: Fact = { id: 'f1', about: [A], text: 'x', tags: ['affair'], importance: 3, day: 1, knownBy: [B] };
      s.memory.facts.push(fact);
      expect(val(s).terms.leverage).toBe(0);
    });
    it('a unit who knows of the affair holds it too (a fact tagged affair with her in knownBy)', () => {
      const s = fresh();
      s.relations[B].stateId = 'lover';
      s.relations[A].affair = { as: 'lover', hiddenFrom: [B], since: 1 };
      s.memory.facts.push({ id: 'f1', about: [A], text: 'x', tags: ['affair'], importance: 3, day: 1, knownBy: [C] });
      expect(val(s, C).terms.leverage).toBe(5);
      expect(val(s, D).terms.leverage).toBe(0);
      s.relations[B].stateId = 'friend'; // the partner has left romance: nothing to conceal
      expect(val(s, C).terms.leverage).toBe(0);
    });
  });

  it('a grunt, a dead unit and an unknown id have no Impunity', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[A]);
    expect(impunityOf(s, reg, 'grunt_1')).toBeNull();
    s.squad[1].status = 'dead';
    expect(impunityOf(s, reg, B)).toBeNull();
    expect(impunityOf(s, reg, 'nobody')).toBeNull();
  });

  it('the value is clamped to 0…100', () => {
    const s = fresh();
    const level = { ...(reg.dispositionLevels.get('guarded') as Entry), impunityBase: 100 };
    const big: Registries = { ...reg, dispositionLevels: new Map([...reg.dispositionLevels, ['guarded', level]]) };
    setRecord(s, A, 40);
    s.leash.authorizationsLeft = 0;
    expect(val(s, A, big).value).toBe(100);
    const t = fresh();
    setRecord(t, A, -40);
    t.relations[A].stateId = 'dependent';
    t.relations[A].flags.push('need_controlled');
    expect(val(t).value).toBe(0);
  });
});

describe('impunityBand', () => {
  it('< 30 cowed, < 50 low, < 60 high, else brazen', () => {
    expect([0, 29, 30, 49, 50, 59, 60, 100].map(impunityBand)).toEqual(['cowed', 'cowed', 'low', 'low', 'high', 'high', 'brazen', 'brazen']);
  });
});

describe('the stored record', () => {
  it('a save without impunityRecord reads 0', () => {
    const s = fresh();
    delete s.relations[A].impunityRecord;
    expect(recordOf(s, A)).toBe(0);
    expect(recordOf(s, 'nobody')).toBe(0);
    expect(val(s).terms.record).toBe(0);
  });

  it('addRecord clamps at ±40 and reports the applied delta', () => {
    const s = fresh();
    setRecord(s, A, 38);
    const ev = addRecord(s, A, 10, 'test');
    expect(recordOf(s, A)).toBe(40);
    expect(ev).toEqual([{ type: 'impunity_changed', unitId: A, delta: 2, reason: 'test' }]);
    expect(addRecord(s, A, 5, 'test')).toEqual([]);
    expect(addRecord(s, A, -100, 'test')).toEqual([{ type: 'impunity_changed', unitId: A, delta: -80, reason: 'test' }]);
    expect(recordOf(s, A)).toBe(-40);
  });

  it('addRecord of a unit without a relation changes nothing', () => {
    const s = fresh();
    expect(addRecord(s, 'nobody', 5, 'test')).toEqual([]);
  });

  it('a record back at 0 is removed from the relation', () => {
    const s = setRecord(fresh(), A, 5);
    addRecord(s, A, -5, 'test');
    expect('impunityRecord' in s.relations[A]).toBe(false);
  });

  it('decayRecords moves 3 → 2, −1 → 0, 0 stays', () => {
    const s = fresh();
    setRecord(s, A, 3);
    setRecord(s, B, -1);
    decayRecords(s);
    expect([recordOf(s, A), recordOf(s, B), recordOf(s, C)]).toEqual([2, 0, 0]);
    expect('impunityRecord' in s.relations[B]).toBe(false);
  });

  it('disciplineOf creates the object once and returns the same one afterwards', () => {
    const s = fresh();
    expect(s.discipline).toBeUndefined();
    const d = disciplineOf(s);
    expect(d).toEqual({ defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [] });
    d.defiance.push({ unitId: A, severity: 'minor', day: 1, source: 'intent' });
    expect(disciplineOf(s).defiance).toHaveLength(1);
  });
});
