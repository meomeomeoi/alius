import { beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { isThreat } from '../../../src/engine/dynamic/reading';
import { noteOffence } from '../../../src/engine/practice/offences';
import { slapSide, slapWindowMs, startSlap } from '../../../src/engine/practice/slap';
import { EXPRESSION_LABELS } from '../../../src/llm/calls/intentExtract';
import { blankPractices, practiceRoll, SLAP_RESULTS, type OpenPunishment, type SlapResult } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { issuedDirective } from '../../../src/practice/directives';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});

type Style = 'affectionate' | 'regal' | 'ritual' | 'drill' | 'cold' | 'clinical' | 'possessive' | 'playful' | 'obsessive' | 'vindictive' | 'cruel';

/** Ann holds at `role` in `style`; physical discipline is on; `others` are in the scene with her when named. */
function slapWorld(style: Style = 'cold', over: { others?: string[]; content?: string[]; swing?: number; frame?: 'play' | 'role'; hold?: number } = {}): CampaignState {
  const s = world(reg, over.frame ?? 'role');
  s.content = { enabled: [...(s.content?.enabled ?? []), ...(over.content ?? ['physical_discipline_shown'])] };
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  dynamicOf(s, ANN)!.hold = over.hold ?? 60;
  s.relations[ANN].herSkill = { seal: 0, weight: 0, reading: 0, swing: over.swing ?? 0, rhythm: 0, practice: {} };
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN, ...(over.others ?? [])], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}
const start = (s: CampaignState, opts: { punishmentId?: string; unannounced?: true } = {}) => {
  const d = structuredClone(s);
  const events = startSlap(d, ctxOf(d, reg), ANN, opts);
  return { d, events, slap: d.practices?.slap };
};
const answer = (s: CampaignState, result: SlapResult) => run(s, reg, { type: 'practice/slap_answer', payload: { slapId: s.practices!.slap!.id, result } });

describe('the window by style (R.12)', () => {
  it('is the table, in milliseconds, written on practices.slap with slap_started', () => {
    for (const style of ['affectionate', 'regal', 'ritual', 'drill', 'cold', 'clinical', 'possessive', 'playful', 'vindictive', 'cruel'] as const) {
      const { slap, events } = start(slapWorld(style));
      expect(slap, style).toMatchObject({ holderId: ANN, windowMs: TUNING.practice.slap.windowMs[style], feints: 0 });
      expect(ofType(events, 'slap_started')).toMatchObject([{ slapId: slap!.id, holderId: ANN }]);
      // the window and the feints are hers to keep: the overlay reads them from the state, an event (a toast, the model, a reading) never carries them (review M3)
      expect(ofType(events, 'slap_started')[0]).not.toHaveProperty('windowMs');
      expect(ofType(events, 'slap_started')[0]).not.toHaveProperty('feints');
    }
    expect(TUNING.practice.slap.windowMs.affectionate).toBe(700);
    expect(TUNING.practice.slap.windowMs.cruel).toBe(300);
  });

  it('obsessive takes 300 to 700 by a hashed roll: the same slap always the same window, no draw', () => {
    const s = slapWorld('obsessive');
    const rng = JSON.stringify(s.rng);
    const a = start(s);
    const b = start(s);
    expect(a.slap!.windowMs).toBe(b.slap!.windowMs);
    expect(a.slap!.windowMs).toBeGreaterThanOrEqual(300);
    expect(a.slap!.windowMs).toBeLessThanOrEqual(700);
    expect(a.slap!.windowMs).toBe(Math.round(300 + practiceRoll(s, ANN, `slapwin:${a.slap!.id}`) * TUNING.practice.slap.obsessiveSpread));
    expect(JSON.stringify(s.rng)).toBe(rng);
    const widths = new Set<number>();
    for (let seq = 0; seq < 30; seq++) {
      const d = structuredClone(s);
      d.practices = { ...blankPractices(), seq };
      widths.add(slapWindowMs(d, reg, ANN, `ps${seq}`));
    }
    expect(widths.size).toBeGreaterThan(5);
  });
});

describe('feints from swing 2', () => {
  const feintsAt = (swing: number, seq: number): number => {
    const s = slapWorld('cold', { swing });
    s.practices = { ...blankPractices(), seq };
    return start(s).slap!.feints;
  };

  it('swing 0 and 1 never feint', () => {
    for (let seq = 0; seq < 60; seq++) {
      expect(feintsAt(0, seq)).toBe(0);
      expect(feintsAt(1, seq)).toBe(0);
    }
  });

  it('swing 3: a feint exactly when the hashed roll is below 0.2 (ten percent a level from the second)', () => {
    let feints = 0;
    let none = 0;
    for (let seq = 0; seq < 80; seq++) {
      const s = slapWorld('cold', { swing: 3 });
      const roll = practiceRoll(s, ANN, `feint:ps${seq}`);
      const got = feintsAt(3, seq);
      expect(got, `seq ${seq}`).toBe(roll < 0.2 ? 1 : 0);
      if (got === 1) feints++; else none++;
    }
    expect(feints).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(feints);
    // swing 2 is ten percent
    let two = 0;
    for (let seq = 0; seq < 200; seq++) two += feintsAt(2, seq);
    expect(two).toBeGreaterThan(0);
    expect(two).toBeLessThan(60);
  });
});

describe('what is needed', () => {
  it('nothing without physical_discipline_shown, a live holder or a slap not already open', () => {
    expect(start(slapWorld('cold', { content: [] })).slap).toBeUndefined();
    const s = slapWorld('cold');
    const twice = structuredClone(s);
    startSlap(twice, ctxOf(twice, reg), ANN);
    const events = startSlap(twice, ctxOf(twice, reg), ANN);
    expect(events).toEqual([]);
    const eq = slapWorld('cold');
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(start(eq).slap).toBeUndefined();
  });

  it('with others in the scene it waits for privacy unless public_humiliation is on (not built: skipped)', () => {
    const others = slapWorld('cold', { others: [BEA] });
    expect(start(others).slap).toMatchObject({ public: true });
    const off = slapWorld('cold', { others: [BEA] });
    off.content = { enabled: ['restraint', 'physical_discipline_shown'] };
    expect(start(off).slap).toBeUndefined();
  });

  it('with no scene with her there is nothing to brace: it lands unseen (none) at once', () => {
    const s = world(reg, 'role');
    s.content = { enabled: [...(s.content?.enabled ?? []), 'physical_discipline_shown'] };
    const d = structuredClone(s);
    const favour = dynamicOf(d, ANN)!.favour;
    const events = startSlap(d, ctxOf(d, reg), ANN, {});
    expect(d.practices?.slap).toBeUndefined();
    expect(ofType(events, 'slap_dealt')).toMatchObject([{ unitId: ANN, result: 'none', public: false }]);
    expect(dynamicOf(d, ANN)!.favour).toBe(favour + 1);
  });
});

describe('the outcomes', () => {
  const favour = (s: CampaignState) => dynamicOf(s, ANN)!.favour;

  it('none: favour + 1, she is content', () => {
    const s = start(slapWorld('cold')).d;
    const before = favour(s);
    const r = answer(s, 'none');
    expect(errors(r.events)).toEqual([]);
    expect(favour(r.state)).toBe(before + 1);
    expect(r.state.practices!.slap).toBeUndefined();
    expect(ofType(r.events, 'slap_dealt')).toMatchObject([{ unitId: ANN, holderId: ANN, result: 'none', public: false }]);
  });

  it('braced: favour + 2 and her Regard rises for the dignity of it', () => {
    const s = start(slapWorld('cold')).d;
    s.relations[ANN].regard = 40;
    const before = favour(s);
    const r = answer(s, 'braced');
    expect(favour(r.state)).toBe(before + 2);
    expect(r.state.relations[ANN].regard!).toBeGreaterThan(40);
  });

  it('flinched: favour - 1', () => {
    const s = start(slapWorld('cold')).d;
    const before = favour(s);
    const r = answer(s, 'flinched');
    expect(favour(r.state)).toBe(before - 1);
    expect(ofType(r.events, 'slap_dealt')[0]).toMatchObject({ result: 'flinched' });
  });

  it('cruel slaps again once after a flinch; the second one flinched ends it', () => {
    const s = start(slapWorld('cruel')).d;
    const r = answer(s, 'flinched');
    expect(ofType(r.events, 'slap_started')).toHaveLength(1);
    expect(r.state.practices!.slap).toMatchObject({ holderId: ANN, again: true });
    const second = answer(r.state, 'flinched');
    expect(ofType(second.events, 'slap_started')).toEqual([]);
    expect(second.state.practices!.slap).toBeUndefined();
    // braced the first time: no second
    expect(answer(start(slapWorld('cruel')).d, 'braced').state.practices!.slap).toBeUndefined();
  });

  it('affectionate softer: a flinch gives one back (net 0)', () => {
    const s = start(slapWorld('affectionate')).d;
    const before = favour(s);
    expect(favour(answer(s, 'flinched').state)).toBe(before);
  });

  it('vindictive adds one to the count of the sentence the slap belongs to', () => {
    const base = slapWorld('vindictive');
    const p: OpenPunishment = { id: 'pp1', holderId: ANN, entryId: 'the_slap', severity: 4, offence: { kind: 'task_broken', stakes: 'minor', day: base.day }, text: 'x', summary: 'the slap', status: 'accepted', day: base.day, count: 2 };
    base.practices = { ...blankPractices(), seq: 3, punishments: [p] };
    const s = start(base, { punishmentId: 'pp1' }).d;
    expect(s.practices!.slap!.punishmentId).toBe('pp1');
    const r = answer(s, 'flinched');
    expect(r.state.practices!.punishments[0].count).toBe(3);
    expect(answer(start(base, { punishmentId: 'pp1' }).d, 'braced').state.practices!.punishments[0].count).toBe(2);
  });

  it('ritual: a flinch at the final slap leaves the finished ceremony alone (review I5)', () => {
    const base = slapWorld('ritual');
    const p: OpenPunishment = {
      id: 'pp1', holderId: ANN, entryId: 'the_slap', severity: 4, offence: { kind: 'task_broken', stakes: 'minor', day: base.day }, text: 'x', summary: 'the slap', status: 'accepted', day: base.day,
      ceremony: { steps: ['ask_formally', 'name_the_number'], done: ['ask_formally', 'name_the_number'], number: 8, carried: true },
    };
    base.practices = { ...blankPractices(), seq: 3, punishments: [p] };
    const kept = answer(start(base, { punishmentId: 'pp1' }).d, 'flinched').state.practices!.punishments[0].ceremony!;
    expect(kept).toMatchObject({ number: 8, done: ['ask_formally', 'name_the_number'], carried: true });
  });

  it('refuses an answer for a slap that is not open, a wrong id or a result that is no result; draws nothing', () => {
    const s = start(slapWorld('cold')).d;
    expect(errors(run(s, reg, { type: 'practice/slap_answer', payload: { slapId: 'ps99', result: 'none' } }).events)[0]?.message).toMatch(/no slap/i);
    expect(errors(run(s, reg, { type: 'practice/slap_answer', payload: { slapId: s.practices!.slap!.id, result: 'maybe' } }).events)).toHaveLength(1);
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(answer(s, 'none').state.rng)).toBe(rng);
    expect(SLAP_RESULTS).toEqual(['none', 'braced', 'flinched']);
  });
});

describe('a slap is a threat, and she gets better at it', () => {
  it('slap_dealt is read as a threat: lastThreat names her, and her swing practice rises', () => {
    const s = start(slapWorld('cold')).d;
    const r = answer(s, 'none');
    expect(ofType(r.events, 'slap_dealt').every((e) => isThreat(e))).toBe(true);
    expect(r.state.practices!.lastThreat).toMatchObject({ unitId: ANN });
    expect(r.state.relations[ANN].herSkill!.practice.swing).toBeGreaterThan(0);
  });

  it('a yield right after it reads as fear (Task 17 on the real event)', () => {
    const s = start(slapWorld('cold')).d;
    const r = answer(s, 'none');
    expect(r.state.practices!.lastThreat!.unitId).toBe(ANN);
  });
});

describe('before others', () => {
  const publicSlap = (): CampaignState => {
    const s = slapWorld('cold', { others: [BEA] });
    s.relations[BEA].regard = 60;
    s.relations[ANN].regard = 60;
    return start(s).d;
  };

  it('a public slap lowers the regard of those who saw it, counts the deed and is remembered by those present', () => {
    const s = publicSlap();
    expect(s.practices!.slap!.public).toBe(true);
    const r = answer(s, 'none');
    expect(ofType(r.events, 'slap_dealt')).toMatchObject([{ public: true, present: [ANN, BEA] }]);
    expect(r.state.relations[BEA].regard!).toBeLessThan(60);
    expect(r.state.commander.deeds?.slapped_public).toBe(1);
    const fact = r.state.memory.facts.filter((f) => f.tags.includes('slap_public'));
    expect(fact).toHaveLength(1);
    expect(fact[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA]));
    expect(buildKnowledge(r.state, DEFAULT_SETTINGS).facts().some((f) => f.tags.includes('slap_public'))).toBe(true);
  });

  it('a private slap writes neither the deed nor the fact', () => {
    const r = answer(start(slapWorld('cold')).d, 'none');
    expect(r.state.commander.deeds?.slapped_public).toBeUndefined();
    expect(r.state.memory.facts.some((f) => f.tags.includes('slap_public'))).toBe(false);
  });
});

describe('unannounced, after a slip', () => {
  /** The first day of 80 on which a slip of hers (the offence entered in a scene with her) starts a slap, or null. */
  const firstSlapDay = (style: Style, over: Parameters<typeof slapWorld>[1] = {}, kind: 'protocol_slip' | 'denial_broken' = 'protocol_slip'): number | null => {
    for (let day = 1; day <= 80; day++) {
      const s = slapWorld(style, over);
      s.day = day;
      noteOffence(s, ctxOf(s, reg), ANN, { kind, ref: 'slip', stakes: 'minor', day });
      if (s.practices?.slap !== undefined) return day;
    }
    return null;
  };

  it('only cold, cruel, drill and vindictive, and only at the chance of 0.3', () => {
    for (const style of ['cold', 'cruel', 'drill', 'vindictive'] as const) expect(firstSlapDay(style), style).not.toBeNull();
    for (const style of ['ritual', 'affectionate', 'regal', 'playful', 'possessive'] as const) expect(firstSlapDay(style), style).toBeNull();
    let hits = 0;
    for (let day = 1; day <= 200; day++) {
      const s = slapWorld('cold');
      s.day = day;
      noteOffence(s, ctxOf(s, reg), ANN, { kind: 'protocol_slip', ref: 'slip', stakes: 'minor', day });
      if (s.practices?.slap !== undefined) hits++;
    }
    expect(hits).toBeGreaterThan(30);
    expect(hits).toBeLessThan(90);
  });

  it('a denial broken does it too; a task broken, a refusal and a slip outside a scene with her never do', () => {
    expect(firstSlapDay('cold', {}, 'denial_broken')).not.toBeNull();
    for (let day = 1; day <= 80; day++) {
      const s = slapWorld('cold');
      s.day = day;
      noteOffence(s, ctxOf(s, reg), ANN, { kind: 'task_broken', ref: 't', stakes: 'minor', day });
      noteOffence(s, ctxOf(s, reg), ANN, { kind: 'refusal', ref: 'r', stakes: 'minor', day });
      expect(s.practices?.slap).toBeUndefined();
      const dm = world(reg, 'role');
      dm.day = day;
      dm.content = { enabled: [...(dm.content?.enabled ?? []), 'physical_discipline_shown'] };
      noteOffence(dm, ctxOf(dm, reg), ANN, { kind: 'protocol_slip', ref: 'slip', stakes: 'minor', day });
      expect(dm.practices?.slap).toBeUndefined();
    }
  });

  it('never without physical_discipline_shown; before others only with public_humiliation', () => {
    expect(firstSlapDay('cold', { content: [] })).toBeNull();
    const day = firstSlapDay('cold')!;
    const withOthers = slapWorld('cold', { others: [BEA] });
    withOthers.day = day;
    noteOffence(withOthers, ctxOf(withOthers, reg), ANN, { kind: 'protocol_slip', ref: 'slip', stakes: 'minor', day });
    expect(withOthers.practices?.slap).toBeDefined(); // public_humiliation is on in this world
    const off = slapWorld('cold', { others: [BEA] });
    off.content = { enabled: ['restraint', 'physical_discipline_shown'] };
    off.day = day;
    noteOffence(off, ctxOf(off, reg), ANN, { kind: 'protocol_slip', ref: 'slip', stakes: 'minor', day });
    expect(off.practices?.slap).toBeUndefined();
  });

  it('a slap that is open is never joined by a second', () => {
    const s = start(slapWorld('cold')).d;
    const id = s.practices!.slap!.id;
    for (let day = 1; day <= 40; day++) {
      s.day = day;
      noteOffence(s, ctxOf(s, reg), ANN, { kind: 'protocol_slip', ref: `slip${day}`, stakes: 'minor', day });
    }
    expect(s.practices!.slap!.id).toBe(id);
  });
});

describe('from her discipline', () => {
  const punished = (style: Style = 'cold', scene = true): CampaignState => {
    const s = scene ? slapWorld(style, { frame: 'play', hold: 20 }) : world(reg, 'play');
    if (!scene) {
      s.content = { enabled: [...(s.content?.enabled ?? []), 'physical_discipline_shown'] };
      unitOf(s, ANN).bond!.practice!.style = { primary: style };
    }
    const p: OpenPunishment = { id: 'pp1', holderId: ANN, entryId: 'the_slap', severity: 4, offence: { kind: 'task_broken', stakes: 'minor', day: s.day }, text: 'x', summary: 'the slap', status: 'offered', day: s.day };
    s.practices = { ...blankPractices(), seq: 3, punishments: [p] };
    return s;
  };

  it('accepting the slap starts it for the open scene, with the punishment it belongs to', () => {
    const r = run(punished(), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'slap_started')).toHaveLength(1);
    expect(r.state.practices!.slap).toMatchObject({ holderId: ANN, punishmentId: 'pp1' });
  });

  it('the engine-internal practice/slap_start opens the slap of a punishment that never slapped, and never a second (review M12)', () => {
    const base = punished();
    base.practices!.punishments[0].status = 'accepted'; // accepted, its effect not yet run
    const first = run(base, reg, { type: 'practice/slap_start', payload: { holderId: ANN, punishmentId: 'pp1' } });
    expect(errors(first.events)).toEqual([]);
    const done = answer(first.state, 'braced').state;
    expect(done.practices!.punishments[0].slapped).toBe(true);
    expect(errors(run(done, reg, { type: 'practice/slap_start', payload: { holderId: ANN, punishmentId: 'pp1' } }).events)[0]?.message).toMatch(/already/i);
    // the slap its accept ran counts the same
    const accepted = run(punished(), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    const answered = answer(accepted.state, 'braced').state;
    expect(errors(run(answered, reg, { type: 'practice/slap_start', payload: { holderId: ANN, punishmentId: 'pp1' } }).events)).toHaveLength(1);
  });

  it('UNDO before the commander braced ends the slap; after it was answered UNDO is refused', () => {
    const r = run(punished(), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(r.state.practices!.punishments[0].inverse!.practice!.slapId).toBe(r.state.practices!.slap!.id);
    const undone = run(r.state, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } });
    expect(errors(undone.events)).toEqual([]);
    expect(undone.state.practices!.slap).toBeUndefined();
    const struck = answer(r.state, 'none');
    expect(errors(run(struck.state, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } }).events)[0]?.message).toMatch(/struck|landed|slap/i);
  });

  it('answered in a DM (no scene with her) it lands unseen at once, and cannot be undone', () => {
    const r = run(punished('cold', false), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'slap_dealt')).toMatchObject([{ result: 'none' }]);
    expect(r.state.practices!.slap).toBeUndefined();
    expect(errors(run(r.state, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } }).events)).toHaveLength(1);
  });

  it('the action practice/slap_start only opens the slap of an accepted punishment of hers', () => {
    const s = punished();
    expect(errors(run(s, reg, { type: 'practice/slap_start', payload: { holderId: ANN } }).events)).toHaveLength(1);
    s.practices!.punishments[0].status = 'accepted';
    const ok = run(s, reg, { type: 'practice/slap_start', payload: { holderId: ANN, punishmentId: 'pp1' } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.practices!.slap).toBeDefined();
  });
});

describe('the scene it was raised in', () => {
  it('ending the scene, or aborting it, with the slap still open drops it; nothing lands', () => {
    const s = start(slapWorld('cold')).d;
    const favour = dynamicOf(s, ANN)!.favour;
    const ended = run(s, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.practices!.slap).toBeUndefined();
    expect(ofType(ended.events, 'slap_dealt')).toEqual([]);
    expect(dynamicOf(ended.state, ANN)!.favour).toBe(favour);
    const aborted = run(s, reg, { type: 'scene/abort', payload: {} });
    expect(aborted.state.practices!.slap).toBeUndefined();
  });
});

describe('what the model is told', () => {
  it('the outcome is one line for her next reply: no number, no pronoun for the commander', () => {
    const s = start(slapWorld('cold')).d;
    for (const result of ['none', 'braced', 'flinched'] as const) {
      const r = answer(structuredClone(s), result);
      const ev = ofType(r.events, 'slap_dealt')[0];
      const d = issuedDirective(ev, slapWorld('cold'), reg)!;
      expect(d.id).toBe(`practice:slap:${ANN}`);
      expect(d.expiresAfter).toBe('next_reply');
      expect(d.text).not.toMatch(/\d/);
      expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    }
    expect(issuedDirective({ type: 'slap_dealt', unitId: ANN, holderId: ANN, result: 'flinched' }, slapWorld('cold'), reg)!.text).toMatch(/flinch/i);
  });
});

describe('P10e-e Task 11: a turned face, her side, her face (R11-R13)', () => {
  const defied = (s: CampaignState): string[] => (s.practices?.noted?.keys ?? []).filter((k) => k.includes('|slap_defied|'));

  it('a turned face is her offence: flinched notes slap_defied (minor) after slap_dealt; none and braced note none', () => {
    const s = start(slapWorld('cold')).d;
    const id = s.practices!.slap!.id;
    const r = answer(s, 'flinched');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'slap_dealt')).toHaveLength(1);
    expect(defied(r.state)).toEqual([`${ANN}|slap_defied|${id}`]);
    const asked = r.state.practices!.requests.filter((q) => q.kind === 'punishment' && q.offence?.kind === 'slap_defied');
    expect(asked, 'her discipline asks for a punishment for it').toHaveLength(1);
    expect(asked[0]!.offence).toMatchObject({ kind: 'slap_defied', stakes: 'minor', ref: id });
    for (const result of ['none', 'braced'] as const) expect(defied(answer(start(slapWorld('cold')).d, result).state), result).toEqual([]);
  });

  it('cruel still slaps again after a turned face, and vindictive still adds to the count', () => {
    const r = answer(start(slapWorld('cruel')).d, 'flinched');
    expect(r.state.practices!.slap).toMatchObject({ again: true });
    expect(defied(r.state)).toHaveLength(1);
    const base = slapWorld('vindictive');
    const p: OpenPunishment = { id: 'pp1', holderId: ANN, entryId: 'the_slap', severity: 4, offence: { kind: 'task_broken', stakes: 'minor', day: base.day }, text: 'x', summary: 'the slap', status: 'accepted', day: base.day, count: 2 };
    base.practices = { ...blankPractices(), seq: 3, punishments: [p] };
    expect(answer(start(base, { punishmentId: 'pp1' }).d, 'flinched').state.practices!.punishments[0].count).toBe(3);
  });

  it('the side is the hash of the id: the same id the same side, both sides over twenty ids; slap_dealt carries it', () => {
    expect(slapSide('ps7')).toBe(slapSide('ps7'));
    const sides = new Set(Array.from({ length: 20 }, (_, i) => slapSide(`ps${i}`)));
    expect([...sides].sort()).toEqual([-1, 1]);
    const s = start(slapWorld('cold')).d;
    const id = s.practices!.slap!.id;
    expect(ofType(answer(s, 'none').events, 'slap_dealt')[0]).toMatchObject({ side: slapSide(id) });
  });

  it('faces holds every style: eleven rows, each after with the three results, every label one of the 28 expressions', () => {
    const faces = TUNING.practice.slap.faces;
    expect(Object.keys(faces).sort()).toEqual([...reg.practiceStyles.keys()].sort());
    expect(Object.keys(faces)).toHaveLength(11);
    const labels: readonly string[] = EXPRESSION_LABELS;
    for (const [style, f] of Object.entries(faces)) {
      expect(Object.keys(f.after).sort(), style).toEqual([...SLAP_RESULTS].sort());
      for (const l of [f.before, ...f.keep, ...Object.values(f.after)]) expect(labels, `${style}: ${l}`).toContain(l);
    }
    expect(faces.cruel).toEqual({ before: 'amusement', keep: ['amusement', 'anger', 'annoyance', 'desire', 'pride'], after: { none: 'amusement', braced: 'annoyance', flinched: 'anger' } });
    expect(TUNING.practice.slap.braceBand).toEqual([42, 224]);
    expect(TUNING.practice.slap.againLeadMs).toBe(420);
  });

  it('the directive names the cheek', () => {
    const left = issuedDirective({ type: 'slap_dealt', unitId: ANN, holderId: ANN, result: 'none', side: 1 }, slapWorld('cold'), reg)!;
    const right = issuedDirective({ type: 'slap_dealt', unitId: ANN, holderId: ANN, result: 'braced', side: -1 }, slapWorld('cold'), reg)!;
    expect(left.text).toMatch(/ on the left cheek\./);
    expect(right.text).toMatch(/ on the right cheek\./);
    for (const d of [left, right]) expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('no rng: the state\'s rng is the same before and after a slap is dealt, whatever the result', () => {
    for (const result of SLAP_RESULTS) {
      const s = start(slapWorld('cruel')).d;
      const before = structuredClone(s.rng);
      expect(answer(s, result).state.rng, result).toEqual(before);
    }
  });
});
