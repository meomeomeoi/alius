// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch } from '../../src/engine/dispatch';
import { openRequest } from '../../src/engine/world/director';
import type { CampaignState, GenerationRecord } from '../../src/engine/state/types';
import type { Envelope } from '../../src/llm/envelope';
import { MOVED_REASON } from '../../src/llm/envelope';
import { llmLog } from '../../src/llm/log';
import { generationSites } from '../../src/llm/sites';
import { createDilemmas } from '../../src/loyalty/dilemmaController';
import type { AliusSettings } from '../../src/settings';
import type { FakeStAdapter } from '../../src/st/fake';
import { createDirector } from '../../src/world/directorController';
import { createExpedition } from '../../src/world/expeditionController';
import { h } from '../../src/ui/dom';
import { drawRecordChip, type GenerationUi } from '../../src/ui/generation/surface';
import { AI_REFUSAL_JSON, CUT_JSON, EMPTY, INVALID_OBJECT, REFUSAL, THINKING_ONLY } from '../fixtures/llm/failures';
import { depart, withMission } from '../helpers/expedition';
import { ANN, harness, summaryJson, type Harness } from '../helpers/sceneHarness';
import { campaign as loyaltyCampaign } from '../helpers/loyalty';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

// P14 acceptance 1, 3, 4, 5: every failure reason through a real site of each reroll mode (free, before_commit, revert, none/held),
// plus `expired`, the refused revert and the size of what is kept in the state.

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => llmLog.clear());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const REASONS = ['refused', 'truncated', 'timeout', 'invalid_output', 'empty', 'network'] as const;
type Reason = (typeof REASONS)[number];
const SETTINGS: Partial<AliusSettings> = { autoRetry: 0, llmTimeoutMs: 10000 };

/** What the player reads for each reason (the exact words of the plan's ruling). */
const WHY: Record<Reason, string | RegExp> = {
  refused: 'the model refused.',
  truncated: /^.*: the answer was cut off( at \d+ tokens)?\.$/,
  timeout: 'no answer within 10 s.',
  invalid_output: 'the answer did not fit the form.',
  empty: 'nothing came back.',
  network: 'the connection failed.',
};

/** A site under test: how to make it fail in each way, how to make it work, and how its moment passes. */
interface Rig {
  siteId: string;
  label: string;
  /** Prose sites have no form to fit: `invalid_output` cannot happen to them. */
  text: boolean;
  /** A site whose form accepts any object (the director's) needs its own recorded answers for some reasons. */
  fixtures?: Partial<Record<Reason, string | { text: string; finishReason: 'length' }>>;
  st: FakeStAdapter;
  gens: Envelope;
  settings: AliusSettings;
  state(): CampaignState;
  trigger(): Promise<void>;
  good: string;
  /** Asserts that the good answer was applied. */
  applied(): void;
  /** The moment passes; returns what `retry` of the record must then say. */
  expire(): Promise<string>;
}

const valid = readFileSync('tests/fixtures/director_tick/valid.txt', 'utf8');
const eff = (kind: string, target: string, direction: 1 | -1) => ({ kind, target, direction, magnitude: 'small' });
const wording = JSON.stringify({
  title: 'Short rations', setup: 'The mess hall is short again.',
  options: [
    { label: 'Cut portions', effects: [eff('resource', 'supplies', 1), eff('stress', 'squad', 1)] },
    { label: 'Buy on the black market', effects: [eff('resource', 'supplies', 1), eff('resource', 'credits', -1), eff('faction', 'sable', 1)] },
  ],
});

const recapRig = async (): Promise<Rig> => {
  const { state, mission } = withMission(reg, campaign(reg, 4));
  const s = structuredClone(depart(reg, state, mission.id));
  s.expedition!.objectiveDone = true;
  const w = worldHarness(reg, s, SETTINGS);
  const make = () => createExpedition({ ...w.deps, startCombat: w.startCombat as never, startScene: w.startScene as never });
  make().return();
  return {
    siteId: 'expedition.recap', label: 'After-action recap', text: true, st: w.st, gens: w.deps.generations, settings: w.settings, state: w.state,
    trigger: () => make().requestRecap(), good: 'The squad came back.',
    applied: () => expect(w.state().lastExpedition!.recap).toBe('The squad came back.'),
    expire: async () => { w.setState((x) => { x.lastExpedition!.id = 'rep_newer'; }); return 'A newer report replaced it.'; },
  };
};

const dilemmaRig = async (): Promise<Rig> => {
  const w = worldHarness(reg, loyaltyCampaign(reg, 4), SETTINGS);
  w.app().dispatch({ type: 'dilemma/request', payload: { templateId: 'dil_rations', context: 'base' } });
  const ctrl = createDilemmas(w.deps);
  return {
    siteId: 'dilemma.generate', label: 'Decision text', text: false, st: w.st, gens: w.deps.generations, settings: w.settings, state: w.state,
    trigger: () => ctrl.onRequested(), good: wording,
    applied: () => expect(w.state().dilemmas!.open).toMatchObject({ status: 'presented', source: 'model', title: 'Short rations' }),
    expire: async () => { ctrl.choose(0); return 'The decision was made.'; },
  };
};

const directorRig = async (): Promise<Rig> => {
  const requested = campaign(reg, 4);
  openRequest(requested, 'day_end');
  const w = worldHarness(reg, requested, SETTINGS);
  const director = createDirector(w.deps);
  return {
    siteId: 'director.tick', label: "The director's plan", text: false,
    // every field of the director's output is optional, so a repaired or foreign object still fits: only an answer with no JSON at all is invalid
    fixtures: { invalid_output: 'No plan this time, sorry.', truncated: { text: 'The plan for the week begins with', finishReason: 'length' } },
    st: w.st, gens: w.deps.generations, settings: w.settings, state: w.state,
    trigger: () => director.onRequested(), good: valid,
    applied: () => expect(w.state().world.director!.pending).toBeUndefined(),
    expire: async () => {
      // the day ends: the engine answers the held request with its own plan; the next pass finds the record's moment gone
      w.setState((s) => { s.slot = 'evening'; });
      w.app().dispatch({ type: 'calendar/consume_slot', payload: {} });
      w.st.mainReplies = [];
      await director.onRequested();
      return 'The day ended: the engine planned the world.';
    },
  };
};

const summaryRig = async (): Promise<Rig> => {
  const w: Harness = harness(reg, { settings: SETTINGS });
  expect(await w.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
  w.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
  return {
    siteId: 'scene.summary', label: 'Scene summary', text: false, st: w.st, gens: w.generations, settings: w.settings, state: w.state,
    trigger: () => w.controller.end(), good: summaryJson('Ann was kind.'),
    applied: () => expect(w.state().memory.chronicle.filter((e) => e.sceneId === 's1')).toMatchObject([{ text: 'Ann was kind.' }]),
    expire: async () => {
      const s = structuredClone(w.state());
      delete s.memory.scenes![0].participants;
      w.set(s);
      return 'That scene ended before late summaries existed.';
    },
  };
};

const RIGS: Array<[string, () => Promise<Rig>]> = [
  ['expedition.recap (free)', recapRig], ['dilemma.generate (before_commit)', dilemmaRig], ['scene.summary (revert)', summaryRig], ['director.tick (none, held)', directorRig],
];

/** Queues the failure on the fake and runs the site; a timeout needs the clock to move. */
async function fail(rig: Rig, reason: Reason): Promise<void> {
  const own = rig.fixtures?.[reason];
  if (own !== undefined) {
    if (typeof own === 'string') rig.st.mainReplies = [own];
    else rig.st.queueAnswer(own);
    await rig.trigger();
    return;
  }
  switch (reason) {
    case 'refused': rig.st.mainReplies = [rig.text ? REFUSAL : AI_REFUSAL_JSON]; break;
    case 'truncated': rig.st.mainReplies = [rig.text ? THINKING_ONLY : CUT_JSON]; break;
    case 'invalid_output': rig.st.mainReplies = [INVALID_OBJECT]; break;
    case 'empty': rig.st.mainReplies = [EMPTY]; break;
    case 'network': rig.st.mainReplies = []; break;
    case 'timeout': rig.st.hangNext(); break;
  }
  if (reason === 'timeout') {
    vi.useFakeTimers();
    const p = rig.trigger();
    await vi.advanceTimersByTimeAsync(10_001);
    await p;
    vi.useRealTimers();
  } else await rig.trigger();
}

const records = (rig: Rig): GenerationRecord[] => rig.state().generations?.records ?? [];
const chipOf = (rig: Rig, rec: GenerationRecord): HTMLElement => {
  const ui = { generations: rig.gens, modal: async () => null, settings: () => rig.settings, toast: () => {}, redraw: () => {} } as unknown as GenerationUi;
  const host = h('div');
  document.body.append(host);
  return drawRecordChip(host, ui, rig.state(), rec);
};

describe.each(RIGS)('%s', (_name, make) => {
  for (const reason of REASONS) {
    it(`${reason}: the right record, the right chip text and a working RETRY`, async () => {
      const rig = await make();
      if (reason === 'invalid_output' && rig.text) return; // a prose answer has no form to fit: the classifier never gives it
      await fail(rig, reason);
      expect(records(rig)).toMatchObject([{ siteId: rig.siteId, reason, status: 'open' }]);
      const chip = chipOf(rig, records(rig)[0]);
      const want = WHY[reason];
      if (typeof want === 'string') expect(chip.querySelector('.alius-genfail-text')!.textContent).toBe(`⚠ ${rig.label}: ${want}`);
      else expect(chip.querySelector('.alius-genfail-text')!.textContent).toMatch(want);
      expect(chip.querySelector('[data-action="generation-retry"]')).not.toBeNull();
      rig.st.mainReplies = [rig.good];
      const out = await rig.gens.retry(records(rig)[0].id);
      expect(out.kind).toBe('applied');
      rig.applied();
      expect(records(rig)).toEqual([]);
    });
  }

  it('expired: the record says why, the chip offers only DROP and RETRY changes nothing', async () => {
    const rig = await make();
    await fail(rig, 'network');
    const why = await rig.expire();
    const rec = records(rig).find((r) => r.siteId === rig.siteId)!;
    if (rec.status !== 'expired') expect(await rig.gens.retry(rec.id)).toEqual({ kind: 'expired', why });
    const now = records(rig).find((r) => r.siteId === rig.siteId)!;
    expect(now).toMatchObject({ status: 'expired', expiredWhy: why });
    const chip = chipOf(rig, now);
    expect(chip.textContent).toContain(`${rig.label}: ${why.replace(/\.$/, '')}.`);
    expect([...chip.querySelectorAll('button')].map((b) => b.getAttribute('data-action'))).toEqual(['generation-drop']);
  });
});

describe('revert refused when the state moved', () => {
  it('scene.summary: another dispatch after the summary makes REROLL refuse with the reason and ask nothing', async () => {
    const w = harness(reg, { settings: SETTINGS });
    expect(await w.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
    w.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
    w.st.mainReplies = [summaryJson('First version.')];
    await w.controller.end();
    expect(w.generations.rerollState('scene.summary', 's1')).toEqual({ enabled: true });
    w.dispatch({ type: 'dm/read', payload: { unitId: ANN } });
    w.set({ ...w.state() });
    expect(w.generations.rerollState('scene.summary', 's1')).toEqual({ enabled: false, reason: MOVED_REASON });
    const calls = w.st.calls.length;
    expect(await w.generations.reroll('scene.summary', 's1')).toEqual({ kind: 'expired', why: MOVED_REASON });
    expect(w.st.calls).toHaveLength(calls);
  });

  it('dm.reply: another dispatch after her answer does the same', async () => {
    const w = harness(reg, { settings: { ...SETTINGS, unitDms: true } });
    w.st.mainReplies = ['First answer.', JSON.stringify({ events: [] })];
    await w.comms.send(ANN, 'Are you awake?');
    expect(w.comms.replyState(ANN)!.reroll).toEqual({ enabled: true });
    w.dispatch({ type: 'dm/read', payload: { unitId: ANN } });
    expect(w.comms.replyState(ANN)!.reroll).toEqual({ enabled: false, reason: MOVED_REASON });
    const calls = w.st.calls.length;
    await w.comms.rerollLast(ANN);
    expect(w.st.calls).toHaveLength(calls);
  });
});

describe('state stays small', () => {
  it('after 25 failures of every full site the records stay under the cap and 8000 characters', () => {
    let s = campaign(reg, 4);
    const full = generationSites().filter((x) => x.record === 'full');
    expect(full.length).toBeGreaterThan(0);
    for (let i = 0; i < 25; i++) {
      for (const site of full) {
        const r = dispatch(s, {
          type: 'generation/failed', payload: { siteId: site.id, key: `${site.id}:k${i}`, reason: 'invalid_output', detail: 'x'.repeat(400), attempts: 2, at: i, budgetMult: 1.5 },
        }, reg);
        expect(r.events.some((e) => e.type === 'error')).toBe(false);
        s = r.state;
      }
    }
    expect(s.generations!.records).toHaveLength(20);
    expect(JSON.stringify(s.generations).length).toBeLessThan(8000);
    for (const r of s.generations!.records) expect(r.detail.length).toBeLessThanOrEqual(160);
  });

  it('no prompt, transcript or model text appears in the records of real failures', async () => {
    const seen: string[] = [];
    for (const [, make] of RIGS) {
      const rig = await make();
      await fail(rig, 'refused'); // the answer is a recorded refusal text
      seen.push(JSON.stringify(rig.state().generations));
    }
    const all = seen.join('\n');
    // the raw answers, and the words of the prompts of these calls, never reach the state
    for (const text of [REFUSAL, AI_REFUSAL_JSON, 'As an AI', "can't assist", 'Hello.', 'mess hall', 'rules referee', 'You are']) expect(all, text).not.toContain(text);
    for (const e of llmLog.entries()) {
      if (e.prompt.length > 20) expect(all).not.toContain(e.prompt.slice(0, 20));
    }
  });
});
