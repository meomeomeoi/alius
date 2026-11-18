import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import { pickHandler, rollVisit } from '../../src/engine/special/debts/handler';
import { HANDLER_UNIT, HANDLER_VISIT_KIND, isOwnPanelNight, OWN_PANEL_KINDS } from '../../src/engine/special/state';
import { CONFRONTATION_KINDS } from '../../src/engine/loyalty/state';
import type { CampaignState, NightEntry } from '../../src/engine/state/types';
import { tonightItems } from '../../src/ui/hub/model';
import { loadCore, run, unitSetup } from '../helpers/world';
import { ANN, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const debts = (s: CampaignState) => s.special!.debts!;
const entryOf = (s: CampaignState): NightEntry | undefined => s.calendar.nightEventsQueue.find((e) => e.kind === HANDLER_VISIT_KIND);
const nightWith = (s: CampaignState, entry: NightEntry): CampaignState => { s.slot = 'night'; s.calendar.nightEvent = entry; return s; };
const visitEntry = (s: CampaignState): NightEntry => ({
  id: 'n_v', unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: 6, framing: 'A visitor at the gate.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2,
});

describe('the handler', () => {
  it('serves a corporation that is not the commander\'s, whichever start', () => {
    for (const startId of ['start_vesper', 'start_kestrel']) {
      const r = buildCampaign({
        commanderName: 'Vale', startId, crimeId: 'mutiny', units: [unitSetup('Ann')],
        commander: { body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular: [], special: 'web_of_debts' } },
      }, reg, { desireBondDefects: false, seed: 5 });
      if (!r.ok) throw new Error(r.errors.join('; '));
      const d = r.state.special!.debts!;
      expect(d.corporationId).not.toBe(r.state.commander.corporationId);
      expect(reg.corporations.has(d.corporationId)).toBe(true);
      const h = reg.debtHandlers.get(d.handlerId)!;
      const serves = (h.corporations as string[] | undefined) ?? [];
      expect(serves.length === 0 || serves.includes(d.corporationId), startId).toBe(true);
      expect(d).toMatchObject({ visitSeq: 0, answered: [], handlerSuspicion: 0, handlerPressure: 0, oversightSuspicion: 0, scheduled: [], exposures: [] });
    }
  });

  it('pickHandler is the first other corporation in registry order, the handler by a hash of the rng state', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const own = s.commander.corporationId;
    const first = [...reg.corporations.keys()].find((id) => id !== own);
    expect(pickHandler(s, reg)?.corporationId).toBe(first);
    expect(pickHandler(s, reg)).toEqual(pickHandler(structuredClone(s), reg));
    const alone: Registries = { ...reg, corporations: new Map([[own!, reg.corporations.get(own!)!]]) };
    expect(pickHandler(s, alone)).toBeNull();
  });

  it('every handler has authored placeholder text and no pronoun for the commander', () => {
    expect(reg.debtHandlers.size).toBeGreaterThanOrEqual(2);
    for (const h of reg.debtHandlers.values()) {
      const texts = [String(h.name), String(h.description), ...Object.values(h.lines as Record<string, string>)];
      for (const t of texts) expect(t, `${h.id}`).not.toMatch(/\b(he|him|his)\b/i);
      expect(Object.keys(h.lines as object).sort()).toEqual(['cut', 'greet', 'leak', 'threat']);
    }
  });
});

describe('the visit schedule', () => {
  it('is about weekly: 120 seeded days, never before day 5, never two nights in a row', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.rng = new Rng(s.rng).state;
    const c = ctxOf(s);
    const days: number[] = [];
    for (let d = 1; d <= 120; d++) {
      s.day = d;
      const ev = rollVisit(s, c);
      if (ev.some((e) => e.type === 'handler_visit')) {
        days.push(d);
        // she answered at once: the next visit may come after the usual wait
        delete debts(s).visit;
        s.calendar.nightEventsQueue = [];
      }
    }
    expect(days.length).toBeGreaterThan(10);
    expect(days[0]).toBeGreaterThanOrEqual(5);
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(5);
    expect(mean).toBeLessThan(9);
  });

  it('a hit queues an own-panel night entry for no unit, with the visit', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.day = 8;
    debts(s).lastVisitDay = 1; // 7 days: p = 0.75
    let queued: CampaignState | null = null;
    for (let seed = 1; seed < 50 && !queued; seed++) {
      const t = structuredClone(s);
      t.rng = new Rng(s.rng).state;
      t.rng = [seed, seed + 1, seed + 2, seed + 3] as never;
      const ev = rollVisit(t, ctxOf(t));
      if (ev.some((e) => e.type === 'handler_visit')) queued = t;
    }
    expect(queued).not.toBeNull();
    const t = queued!;
    const entry = entryOf(t)!;
    expect(entry).toMatchObject({ unitId: HANDLER_UNIT, priority: 6, framing: 'A visitor at the gate.', ignore: { event: 'dismissed', severity: 'minor' } });
    expect(entry.expiresDay).toBe(t.day + 2);
    expect(debts(t).lastVisitDay).toBe(8);
    expect(debts(t).visitSeq).toBe(1);
    expect(debts(t).visit).toMatchObject({ id: 'hv1', day: 8 });
    expect(t.squad.some((u) => u.id === HANDLER_UNIT)).toBe(false);
  });

  it('does not roll while a visit waits, and an ended arrangement never visits again', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.day = 30;
    debts(s).visit = { id: 'hv1', day: 20, items: [] };
    const c = ctxOf(s);
    expect(rollVisit(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
    delete debts(s).visit;
    debts(s).ended = 'leaked';
    const c2 = ctxOf(s);
    expect(rollVisit(s, c2)).toEqual([]);
    expect(c2.rng.state).toEqual(s.rng);
  });

  it('with no debts effect: no draw and no state', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    s.day = 30;
    const c = ctxOf(s);
    expect(rollVisit(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
    const none = specialCampaign(reg);
    expect(rollVisit(none, ctxOf(none))).toEqual([]);
    expect(none.special).toBeUndefined();
  });
});

describe('an own-panel night', () => {
  it('the kinds cover every confrontation and the visit', () => {
    for (const k of CONFRONTATION_KINDS) expect(OWN_PANEL_KINDS).toContain(k);
    expect(OWN_PANEL_KINDS).toContain(HANDLER_VISIT_KIND);
    expect(isOwnPanelNight({ kind: HANDLER_VISIT_KIND })).toBe(true);
    expect(isOwnPanelNight({ kind: 'desertion' })).toBe(true);
    expect(isOwnPanelNight({ kind: 'we_need_to_talk' })).toBe(false);
  });

  it('night/open, night/door_say and night/ignore refuse a visit and change nothing', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    const open = nightWith(s, visitEntry(s));
    for (const action of [
      { type: 'night/open', payload: {} },
      { type: 'night/door_say', payload: { text: 'hello' } },
      { type: 'night/ignore', payload: {} },
    ]) {
      const r = run(open, reg, action);
      expect(r.events.some((e) => e.type === 'error'), action.type).toBe(true);
      expect(r.state, action.type).toBe(open);
    }
  });

  it('tonightItems does not crash and says A visitor at the gate.', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.calendar.nightEventsQueue.push(visitEntry(s));
    const items = tonightItems(s, reg);
    expect(items.map((i) => i.text)).toContain('A visitor at the gate.');
    s.calendar.nightEventsQueue[0].expiresDay = s.day - 1;
    expect(tonightItems(s, reg).map((i) => i.text)).not.toContain('A visitor at the gate.');
  });

  it('a visit waits behind a confrontation of higher priority, and the night opens the confrontation first', () => {
    const s = specialCampaign(reg, 'web_of_debts');
    s.day = 8;
    debts(s).lastVisitDay = 1;
    s.calendar.nightEventsQueue.push({ id: 'n_d', unitId: ANN, kind: 'desertion', priority: 95, framing: 'x', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2 });
    for (let seed = 1; seed < 80 && !entryOf(s); seed++) { s.rng = [seed, seed + 1, seed + 2, seed + 3] as never; rollVisit(s, ctxOf(s)); }
    expect(entryOf(s)).toBeDefined();
    expect(s.calendar.nightEventsQueue.map((e) => e.kind)).toEqual(['desertion', HANDLER_VISIT_KIND]);
  });
});
