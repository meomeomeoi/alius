// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import '../../../src/engine/actions/practice';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { resetKnowledgeRules } from '../../../src/analysis/knowledge';
import type { Registries } from '../../../src/content/types';
import { practiceDirectives, issuedDirective } from '../../../src/practice/directives';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { drawDemonstrationCards } from '../../../src/ui/practice/demonstrationCard';
import { drawHeldStrip } from '../../../src/ui/practice/heldStrip';
import { drawInitiativeChips } from '../../../src/ui/practice/initiativeChips';
import { drawPunishmentCards } from '../../../src/ui/practice/punishmentCard';
import { renderSlapOverlay } from '../../../src/ui/practice/slapOverlay';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import { renderDynamicSection } from '../../../src/ui/dynamic/section';
import { drawTaskCards, renderRecordLines } from '../../../src/ui/practice/taskCard';
import { hiddenFixture } from '../../fixtures/analyze/hidden';
import { leaks } from '../../helpers/analyze';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; resetKnowledgeRules(); });

const noop = () => {};

/** The hidden fixture with her aftermath over (a holder in one is frozen and draws no card), and what is hidden in it. */
function fixture() {
  const f = hiddenFixture(reg);
  const state: CampaignState = structuredClone(f.state);
  delete state.relations[f.unitId].dynamic!.aftermath;
  state.practices!.demonstrations = [{ id: 'pd1', holderId: f.unitId, tags: [], summary: 'serving tea', text: 'She wants to show how well the commander serves.', audienceIds: [], stage: 'mess_hall', day: 8, status: 'offered', stakes: 'minor' } as never];
  return { ...f, state };
}

/** Every surface of the practices drawn for the holder, as one host (the DYNAMIC block of Task 40 is added by its own test). */
function everything(state: CampaignState, unitId: string, over: { sensory?: boolean } = {}): HTMLElement {
  const host = h('div');
  document.body.append(host);
  const pick = (c: { unitId: string }) => c.unitId === unitId;
  const part = (): HTMLElement => { const el = h('div'); host.append(el); return el; };
  drawTaskCards(part(), state, reg, pick, { answer: noop, sign: noop, focusInput: noop });
  drawPunishmentCards(part(), state, reg, pick, { answer: noop, takeInstead: noop, undo: noop, ceremony: noop });
  drawDemonstrationCards(part(), state, reg, pick, { answer: noop });
  drawHeldStrip(part(), state, reg, { sensory: over.sensory === true, askRelease: noop, sendSquad: noop, answerHer: noop });
  drawInitiativeChips(part(), { state, reg, pick: (id) => id === unitId, onAsk: noop, onConfess: noop, onAskPermission: noop, onHandOver: noop, onTakeBack: noop });
  const records = renderRecordLines(state, reg);
  if (records !== null) host.append(records);
  renderSlapOverlay(part(), { state, reg, slap: state.practices!.slap!, settings: DEFAULT_SETTINGS, onResult: noop, schedule: () => 0, cancel: noop, now: () => 0, sound: { play: noop } });
  return host;
}

describe('hidden values never reach a card, a label, a directive or the prompt (Task 39)', () => {
  it('the cards are drawn (so the checks are not vacuous) and show no sentinel, with the hold hidden, sensory or not', () => {
    const { state, unitId, sentinels } = fixture();
    for (const sensory of [false, true]) {
      const host = everything(state, unitId, { sensory });
      const html = host.outerHTML;
      expect(host.textContent, `sensory ${sensory}`).toMatch(/sealed/i); // the envelope of the sealed task
      expect(host.textContent).toMatch(/a day without messages/i); // her discipline, the ceremony
      const strip = host.querySelector('[data-held-strip], [data-held-line]');
      expect(strip, `sensory ${sensory}`).not.toBeNull();
      expect(strip!.textContent, `sensory ${sensory}`).not.toMatch(/until|afternoon|end of/); // the hold with no end says none
      expect(leaks(html, { numbers: [], texts: sentinels.texts }), `sensory ${sensory}`).toEqual([]);
      expect(leaks(host.textContent ?? '', { numbers: [13.37, 26, 34, 733], texts: [] }), `sensory ${sensory}`).toEqual([]);
      expect(html).not.toMatch(/windowMs|feints|hiddenCount|falseReport|brokenDay|askedOn|preselected/);
    }
  });

  it('an offered hold with no duration says no length: no slot count, no due day (review I4, M13)', () => {
    const { state, unitId } = fixture();
    const host = h('div');
    document.body.append(host);
    drawTaskCards(host, state, reg, (c) => c.unitId === unitId, { answer: noop, sign: noop, focusInput: noop });
    const card = host.querySelector('[data-task="pt4"]')!;
    expect(card, 'the offered hidden hold is drawn').not.toBeNull();
    expect(card.textContent).toMatch(/She has not said how long/);
    expect(card.textContent).toMatch(/until she decides/i);
    expect(card.textContent).not.toMatch(/\d|slot|Due:/i);
    // a hold that states its end is told how long it takes and when it ends, as before
    const known = structuredClone(state);
    delete known.practices!.tasks.find((t) => t.id === 'pt4')!.noDuration;
    const open = h('div');
    document.body.append(open);
    drawTaskCards(open, known, reg, (c) => c.unitId === unitId, { answer: noop, sign: noop, focusInput: noop });
    expect(open.querySelector('[data-task="pt4"]')!.textContent).toMatch(/Takes 2 slots/);
    expect(open.querySelector('[data-task="pt4"]')!.textContent).not.toMatch(/Due:/);
  });

  it('an offered hold with no duration names nothing it would push out: the card reads the same with bookings ahead or none (author ruling: the length stays truly hidden)', () => {
    const { state, unitId } = fixture();
    const other = state.squad.find((u) => u.id !== unitId)!;
    const kind = [...reg.bookingKinds.values()][0];
    const card = (s: CampaignState): string => {
      const host = h('div');
      document.body.append(host);
      drawTaskCards(host, s, reg, (c) => c.unitId === unitId, { answer: noop, sign: noop, focusInput: noop });
      return host.querySelector('[data-task="pt4"]')!.textContent ?? '';
    };
    const bare = structuredClone(state);
    bare.personal = { ...(bare.personal ?? {}), bookings: [] } as never;
    const booked = structuredClone(state);
    booked.personal = { ...(booked.personal ?? {}), bookings: [{ id: 'bk1', unitId: other.id, kindId: kind.id, day: state.day, slot: state.slot, status: 'booked', source: 'her' }] } as never;
    expect(card(booked)).toBe(card(bare));
    expect(card(booked)).not.toContain(String(kind.label));
    // a hold that states its end still names what would lapse
    delete booked.practices!.tasks.find((t) => t.id === 'pt4')!.noDuration;
    expect(card(booked)).toContain(`Would lapse: ${String(kind.label)}.`);
  });

  it('every element a card draws is addressed and resolves', () => {
    const { state, unitId } = fixture();
    const host = everything(state, unitId);
    const env = { state, registries: reg, settings: DEFAULT_SETTINGS };
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env)).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('a real and a false unfair punishment and a real and a false report render identically (the routine\'s `brokenDay` exists only once it was told: the chip is gone then, as it should be)', () => {
    const { state, unitId } = fixture();
    const fair = structuredClone(state);
    fair.practices!.punishments[1].offence = { kind: 'task_broken', stakes: 'major', day: 8 };
    delete fair.practices!.unfair;
    fair.practices!.tasks[1].report = { day: 8 };
    expect(everything(fair, unitId).outerHTML).toBe(everything(state, unitId).outerHTML);
    expect(practiceDirectives(fair, reg, [unitId]).map((d) => d.text)).toEqual(practiceDirectives(state, reg, [unitId]).map((d) => d.text));
  });

  it('the PRACTICES block of her dossier shows no sentinel, with raw values on or off, and nothing at all in immersive mode', () => {
    const { state, unitId, sentinels } = fixture();
    for (const [showRawValues, dynamicHidden] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const settings = { ...DEFAULT_SETTINGS, showRawValues, dynamicHidden };
      const host = h('div');
      document.body.append(host);
      renderDynamicSection(host, { state, reg, unitId, knowledge: buildKnowledge(state, settings), hidden: dynamicHidden });
      const label = `raw ${showRawValues}, immersive ${dynamicHidden}`;
      const block = host.querySelector('[data-practices-block]');
      if (dynamicHidden) expect(block, label).toBeNull();
      else {
        expect(block, label).not.toBeNull();
        expect(block!.textContent, label).toContain('bring the roster');
        expect(block!.textContent, label).toMatch(/a sealed task/);
        expect(block!.textContent, label).toMatch(/WARM/);
        expect(block!.textContent, label).toMatch(/until she decides/); // the task with no duration shows no deadline
      }
      expect(leaks(host.outerHTML, { numbers: [], texts: sentinels.texts }), label).toEqual([]);
      expect(leaks(host.textContent ?? '', { numbers: [13.37, 26, 34, 733], texts: [] }), label).toEqual([]);
    }
  });

  it('the directives carry no sentinel: a sealed task is "a sealed task", the hold has no end, a pretext never says nothing was done', () => {
    const { state, unitId, sentinels } = fixture();
    state.practices!.tasks[0].status = 'open'; // accepted: the model is told it exists, never its words
    const lines = practiceDirectives(state, reg, [unitId]);
    expect(lines.map((d) => d.id)).toEqual(expect.arrayContaining([`practice:tasks:${unitId}`, 'practice:held']));
    const issued = [
      issuedDirective({ type: 'punishment_issued', punishmentId: 'pp1', holderId: unitId }, { ...state, scene: { participants: [unitId] } as never }, reg),
      issuedDirective({ type: 'task_issued', taskId: 'pt1', holderId: unitId, kind: 'task' }, { ...state, scene: { participants: [unitId] } as never }, reg),
    ];
    const text = [...lines, ...issued.filter((d) => d !== null)].map((d) => d!.text).join('\n');
    expect(text).toContain('a sealed task');
    expect(text).toContain('sealed envelope');
    expect(leaks(text, { numbers: sentinels.numbers.filter((n) => n !== 8), texts: sentinels.texts.filter((t) => t !== 'end of the afternoon' || false) })).toEqual([]);
    expect(text).not.toMatch(/afternoon|evening|slot|unfair|double standard/i);
  });
});
