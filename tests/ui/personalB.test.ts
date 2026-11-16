// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { disciplineOf } from '../../src/engine/discipline';
import { offerProposal } from '../../src/engine/relations/proposals';
import { personalOf } from '../../src/engine/personal/state';
import type { CampaignState, Token, Vote, Wager } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { refreshPersonalDirectives } from '../../src/personal/directives';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderCmdrCard } from '../../src/ui/commander/cmdrCard';
import { drawDemandChips } from '../../src/ui/discipline/chips';
import { renderDilemma } from '../../src/ui/dilemma/dilemmaPanel';
import { h } from '../../src/ui/dom';
import { drawPersonalChips } from '../../src/ui/personal/chips';
import { renderSchedule } from '../../src/ui/personal/schedule';
import { renderTokens } from '../../src/ui/personal/tokens';
import { renderWagerCard } from '../../src/ui/personal/wagerCard';
import { renderWagerForm } from '../../src/ui/personal/wagerForm';
import { drawProposalChips } from '../../src/ui/proposalChips';
import { renderVotePanel } from '../../src/ui/power/votePanel';
import { markedWithout, unreachable, unresolved } from '../helpers/analyzeCoverage';
import { ANN, atImpunity, BEA, CAT, enable, errors, loadCore, partner, plain, run, setRelation } from '../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const env = (state: CampaignState | null, raw = false): AnalyzeEnv => ({ registries: reg, state, settings: { ...DEFAULT_SETTINGS, showRawValues: raw } });
const mount = (): HTMLElement => {
  const host = h('div');
  document.body.append(host);
  return host;
};
const q = <T extends HTMLElement = HTMLElement>(host: HTMLElement, sel: string) => host.querySelector<T>(sel);
const qa = (host: HTMLElement, sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const stakeOf = (effect: string): string => [...reg.wagerStakes.values()].find((x) => x.effect === effect)!.id as string;
const tok = (id: string, giverId: string, over: Partial<Token> = {}): Token => ({ id, giverId, kindId: 'patch', label: `${giverId}'s patch`, day: 1, worn: false, ...over });
const wager = (over: Partial<Wager> = {}): Wager => ({ id: 'wg_1', unitId: ANN, by: 'unit', gameId: 'coin', stakeId: stakeOf('privilege'), day: 5, status: 'offered', ...over });

/** Ann: a balanced friend with Affinity 60; day 5. */
function fresh(who: 'commander' | 'unit' | null = null): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 60 });
  s.day = 5;
  s.slot = 'morning';
  if (who) personalOf(s).obedience = { unitId: ANN, day: 5, who };
  return s;
}

describe('the TOKENS block of the CMDR dossier', () => {
  function withTokens(): CampaignState {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    s.day = 5;
    partner(s, BEA, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    partner(s, CAT, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    personalOf(s).tokens = { owned: [tok('t1', ANN, { worn: true, lockedUntil: s.day + 3 }), tok('t2', BEA, { worn: true }), tok('t3', CAT)], given: [ANN, BEA, CAT] };
    return s;
  }
  const card = (s: CampaignState, handlers = { onWear: vi.fn(), onTakeOff: vi.fn() }) => {
    const host = mount();
    renderCmdrCard(host, { state: s, registries: reg, raw: false, ...handlers });
    return { host, ...handlers };
  };

  it('shows worn and kept tokens with WEAR / TAKE OFF, and the lock', () => {
    const s = withTokens();
    const { host, onTakeOff } = card(s);
    const block = q(host, '.alius-tokens')!;
    expect(qa(block, '[data-token]').map((t) => [t.dataset.token, t.dataset.worn])).toEqual([['t1', 'true'], ['t2', 'true'], ['t3', 'false']]);
    expect(q(block, '[data-token="t1"]')!.textContent).toContain('LOCKED');
    (q(block, '[data-token="t2"] [data-action="take-off"]') as HTMLElement).click();
    expect(onTakeOff).toHaveBeenCalledWith('t2');
  });

  it('refuses a third wear with the engine\'s message (acceptance 4)', () => {
    const s = withTokens();
    const { host, onWear } = card(s);
    const wear = q(host, '[data-token="t3"] [data-action="wear"]')!;
    const engine = errors(run(s, reg, { type: 'token/wear', payload: { tokenId: 't3' } }).events)[0].message;
    expect(wear.getAttribute('aria-disabled')).toBe('true');
    expect(wear.getAttribute('title')).toBe(engine);
    wear.click();
    expect(onWear).not.toHaveBeenCalled();
    // with a free hand it is a plain button
    s.personal!.tokens!.owned[1].worn = false;
    const free = card(s);
    const w = q(free.host, '[data-token="t3"] [data-action="wear"]')!;
    expect(w.getAttribute('aria-disabled')).toBeNull();
    w.click();
    expect(free.onWear).toHaveBeenCalledWith('t3');
  });

  it('shows the mark of a won wager with its last day, and nothing for a commander with no tokens', () => {
    const s = withTokens();
    s.personal!.mark = { unitId: ANN, untilDay: s.day + 2 };
    expect(card(s).host.textContent).toMatch(/BEARS ANN'S MARK UNTIL DAY 7/);
    const none = plain(reg);
    expect(q(card(none).host, '.alius-tokens')).toBeNull();
  });

  it('every chip carries data-analyze and resolves', () => {
    const s = withTokens();
    s.personal!.mark = { unitId: ANN, untilDay: s.day + 2 };
    const { host } = card(s);
    const block = q(host, '.alius-tokens')!;
    expect(markedWithout(block)).toEqual([]);
    expect(unresolved(block, env(s))).toEqual([]);
    expect(unreachable(block)).toEqual([]);
    expect(renderTokens(plain(reg), reg, { onWear: vi.fn(), onTakeOff: vi.fn() })).toBeNull();
  });
});

describe('the scene context', () => {
  it('names the tokens the commander wears', () => {
    const s = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    personalOf(s).tokens = { owned: [tok('t1', ANN, { worn: true, label: "Ann's patch" })], given: [ANN] };
    s.scene = { id: 'sc', day: s.day, slot: s.slot, participants: [BEA], mode: 'private', locationId: 'mess_hall', exchanges: 0 } as never;
    const b = new ContextBuilder();
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).toContain("The commander wears Ann's patch.");
    delete s.scene;
    refreshPersonalDirectives(b, s, reg);
    expect(b.build(s, 5000).directives).not.toContain('wears');
  });
});

describe('the wager form', () => {
  const form = (s: CampaignState, onSubmit = vi.fn()) => {
    const host = mount();
    host.append(renderWagerForm(s, reg, ANN, onSubmit));
    return { host, onSubmit };
  };
  const stakes = (host: HTMLElement) => qa(host, '[name="stake"] option').map((o) => (o as HTMLOptionElement).value);

  it('never lists a stake whose category is off (acceptance 6)', () => {
    const off = form(fresh()).host;
    expect(stakes(off)).not.toContain(stakeOf('mark'));
    expect(stakes(off)).toContain(stakeOf('privilege'));
    const on = form(enable(fresh(), 'body_modification')).host;
    expect(stakes(on)).toContain(stakeOf('mark'));
    const limited = enable(fresh(), 'body_modification');
    limited.squad.find((u) => u.id === ANN)!.bond!.ownLimits = { categories: ['body_modification'] };
    expect(stakes(form(limited).host)).not.toContain(stakeOf('mark'));
  });

  it('lists the games; sparring lists only the handicaps her Affinity allows; a bet asks what she bets on', () => {
    const cold = fresh();
    setRelation(cold, ANN, { affinity: 25 });
    const { host, onSubmit } = form(cold);
    const games = qa(host, '[name="game"] option').map((o) => (o as HTMLOptionElement).value);
    expect(games).toEqual(['coin', 'rps', 'high_card', 'sparring', 'expedition_bet']);
    const game = q<HTMLSelectElement>(host, '[name="game"]')!;
    game.value = 'sparring';
    game.dispatchEvent(new Event('change'));
    expect(qa(host, '[name="pick"] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['none', 'one_arm', 'first_blood']); // blindfold needs 40
    game.value = 'expedition_bet';
    game.dispatchEvent(new Event('change'));
    expect(qa(host, '[name="pick"] option').map((o) => (o as HTMLOptionElement).value)).toEqual(['kills', 'no_damage', 'objective']);
    q<HTMLSelectElement>(host, '[name="stake"]')!.value = stakeOf('privilege');
    (q(host, '[data-action="challenge"]') as HTMLElement).click();
    expect(onSubmit).toHaveBeenCalledWith({ gameId: 'expedition_bet', stakeId: stakeOf('privilege'), pick: 'kills' });
    game.value = 'coin';
    game.dispatchEvent(new Event('change'));
    expect(q(host, '[name="pick"]')).toBeNull();
    (q(host, '[data-action="challenge"]') as HTMLElement).click();
    expect(onSubmit).toHaveBeenLastCalledWith({ gameId: 'coin', stakeId: stakeOf('privilege') });
  });

  it('says so when she is offered no stake, and carries data-analyze', () => {
    const { host } = form(fresh());
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(fresh()))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    const none = form(plain(reg)).host;
    expect(none.textContent).toContain('NOT OFFERED');
  });
});

describe('the wager card', () => {
  it('says who won what, with the cards or the hands and the bout', () => {
    const s = fresh();
    const card = (r: Record<string, unknown>) => {
      const host = mount();
      host.append(renderWagerCard(s, reg, { unitId: ANN, gameId: 'coin', stakeId: stakeOf('privilege'), winner: 'unit', ...r }));
      return host;
    };
    expect(card({}).textContent).toMatch(/ANN WINS/);
    expect(card({ winner: 'commander' }).textContent).toMatch(/THE COMMANDER WINS/);
    expect(card({ winner: 'void' }).textContent).toMatch(/NOBODY WINS|VOID/);
    expect(card({ gameId: 'high_card', commanderCard: 4, herCard: 11 }).textContent).toContain('4');
    expect(card({ gameId: 'rps', hand: 'rock', throws: [{ hers: 'rock' }, { hers: 'paper' }] }).textContent).toMatch(/PAPER/);
    expect(card({ gameId: 'sparring', rounds: 7, handicap: 'one_arm' }).textContent).toMatch(/7 ROUNDS/);
    const host = card({});
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });
});

describe('chips in COMMS', () => {
  const draw = (s: CampaignState) => {
    const host = mount();
    const handlers = { onAnswerToken: vi.fn(), onAnswerWager: vi.fn(), onPlayWager: vi.fn(), onAnswerQuestion: vi.fn() };
    drawPersonalChips(host, s, reg, (id) => id === ANN, handlers);
    return { host, ...handlers };
  };

  it('a token offer: ACCEPT or DECLINE', () => {
    const s = fresh();
    personalOf(s).tokens = { owned: [], offer: { id: 'tk_1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day: 5 }, given: [ANN] };
    const { host, onAnswerToken } = draw(s);
    expect(host.textContent).toContain("ANN OFFERS: ANN'S PATCH");
    const buttons = qa(host, 'button');
    expect(buttons.map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]']);
    buttons[0].click();
    expect(onAnswerToken).toHaveBeenCalledWith('tk_1', true);
    buttons[1].click();
    expect(onAnswerToken).toHaveBeenLastCalledWith('tk_1', false);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });

  it('her challenge: ACCEPT or DECLINE; once accepted, play it (rock-paper-scissors asks for a hand)', () => {
    const offered = fresh();
    personalOf(offered).wagers = { open: [wager()], log: [] };
    const a = draw(offered);
    expect(qa(a.host, 'button').map((b) => b.textContent)).toEqual(['[ACCEPT]', '[DECLINE]']);
    qa(a.host, 'button')[0].click();
    expect(a.onAnswerWager).toHaveBeenCalledWith('wg_1', true);
    const coin = fresh();
    personalOf(coin).wagers = { open: [wager({ status: 'accepted' })], log: [] };
    const c = draw(coin);
    expect(qa(c.host, 'button').map((b) => b.textContent)).toEqual(['[PLAY]']);
    qa(c.host, 'button')[0].click();
    expect(c.onPlayWager).toHaveBeenCalledWith('wg_1', undefined);
    const rps = fresh();
    personalOf(rps).wagers = { open: [wager({ status: 'accepted', gameId: 'rps' })], log: [] };
    const r = draw(rps);
    expect(qa(r.host, 'button').map((b) => b.textContent)).toEqual(['[ROCK]', '[PAPER]', '[SCISSORS]']);
    qa(r.host, 'button')[1].click();
    expect(r.onPlayWager).toHaveBeenCalledWith('wg_1', 'paper');
    const spar = fresh();
    personalOf(spar).wagers = { open: [wager({ status: 'accepted', gameId: 'sparring', pick: 'none' })], log: [] };
    expect(qa(draw(spar).host, 'button').map((b) => b.textContent)).toEqual(['[FIGHT]']);
    const bet = fresh();
    personalOf(bet).wagers = { open: [wager({ status: 'pending_run', gameId: 'expedition_bet', pick: 'kills' })], log: [] };
    const b = draw(bet);
    expect(qa(b.host, 'button')).toHaveLength(0);
    expect(b.host.textContent).toContain('WAITS FOR THE NEXT RUN');
  });

  it('a won question wager asks for the answer or the question in one line', () => {
    const s = fresh();
    personalOf(s).pendingQuestion = { wagerId: 'wg_1', unitId: ANN, winner: 'unit' };
    const a = draw(s);
    expect(a.host.textContent).toContain('ANSWER');
    const input = q<HTMLInputElement>(a.host, 'input')!;
    expect(input.maxLength).toBe(200);
    (q(a.host, '[data-action="question-ok"]') as HTMLElement).click(); // empty: nothing
    expect(a.onAnswerQuestion).not.toHaveBeenCalled();
    input.value = '  I was afraid.  ';
    (q(a.host, '[data-action="question-ok"]') as HTMLElement).click();
    expect(a.onAnswerQuestion).toHaveBeenCalledWith('wg_1', 'I was afraid.');
    const ask = fresh();
    personalOf(ask).pendingQuestion = { wagerId: 'wg_1', unitId: ANN, winner: 'commander' };
    expect(draw(ask).host.textContent).toContain('ASK');
    expect(markedWithout(a.host)).toEqual([]);
    expect(unresolved(a.host, env(s))).toEqual([]);
    expect(unreachable(a.host)).toEqual([]);
  });

  it('another unit\'s offers are not shown here', () => {
    const s = fresh();
    personalOf(s).wagers = { open: [wager({ unitId: BEA })], log: [] };
    expect(draw(s).host.childElementCount).toBe(0);
  });
});

describe('under obedience her pick is pre-selected (acceptance 6)', () => {
  const preselected = (host: HTMLElement) => qa(host, '[data-preselected="true"]');
  const defies = (host: HTMLElement) => qa(host, '[data-defies]');

  it('the demand: GRANT is her pick, REFUSE defies her', () => {
    const s = fresh('commander');
    s.resources.supplies = 5;
    disciplineOf(s).demands.push({ id: 'd1', unitId: ANN, templateId: 'double_ration', text: 'x', day: 5, expiresDay: 9, status: 'open', impunityDriven: false });
    const host = mount();
    drawDemandChips(host, s, reg, () => true, { grant: vi.fn(), refuse: vi.fn(), talk: vi.fn() });
    expect(preselected(host).map((b) => b.dataset.demandAnswer)).toEqual(['grant']);
    expect(defies(host).map((e) => e.textContent)).toEqual(['DEFIES ANN']);
    expect(q(host, '[data-demand-answer="refuse"]')!.parentElement).toBe(q(host, '[data-defies]')!.parentElement);
    // a day without obedience: nothing
    const free = mount();
    drawDemandChips(free, fresh(null), reg, () => true, { grant: vi.fn(), refuse: vi.fn() });
    expect(preselected(free)).toEqual([]);
  });

  it("the proposal: ACCEPT is her pick; her own proposal only, and only while the commander obeys her", () => {
    const make = (who: 'commander' | 'unit' | null, lead: 'balanced' | 'assertive') => {
      const s = partner(plain(reg), ANN, { lead, stateId: 'friend', affinity: 40, trust: 40 });
      s.day = 5;
      s.relations[ANN].attraction = 40;
      if (who) personalOf(s).obedience = { unitId: ANN, day: 5, who };
      expect(offerProposal(s, reg, { unitId: ANN, kind: 'date', channel: 'dm' })).toHaveLength(1);
      const host = mount();
      drawProposalChips(host, s, () => true, vi.fn(), reg);
      return host;
    };
    for (const lead of ['balanced', 'assertive'] as const) {
      const host = make('commander', lead);
      expect(preselected(host).map((b) => b.textContent)).toEqual(['[ACCEPT]']);
      expect(defies(host).length).toBeGreaterThan(0);
      expect(preselected(make(null, lead))).toEqual([]);
      expect(preselected(make('unit', lead))).toEqual([]);
    }
  });

  it('the dilemma: her pick option is pre-selected, the others defy her', () => {
    const host = mount();
    renderDilemma(host, {
      title: 'T', setup: 'S', scale: 'minor', waiting: false, herPick: { index: 1, name: 'Ann' },
      options: [{ index: 0, label: 'A', disabled: null, hasCheck: false }, { index: 1, label: 'B', disabled: null, hasCheck: false }],
      onChoose: vi.fn(),
    });
    expect(preselected(host).map((b) => b.dataset.dilemmaOption)).toEqual(['1']);
    expect(defies(host).map((e) => e.textContent)).toEqual(['DEFIES ANN']);
    const plainHost = mount();
    renderDilemma(plainHost, { title: 'T', setup: 'S', scale: 'minor', waiting: false, options: [{ index: 0, label: 'A', disabled: null, hasCheck: false }], onChoose: vi.fn() });
    expect(preselected(plainHost)).toEqual([]);
  });

  const vote = (status: Vote['status'], ballot: 'for' | 'against'): Vote => ({
    id: 'v1', kind: 'mission', subject: 'm1', day: 5, commanderWeight: 1, forWeight: status === 'passed' ? 2 : 1, againstWeight: status === 'passed' ? 1 : 2, passed: status === 'passed', status,
    ballots: [{ unitId: ANN, vote: ballot, weight: 1, score: ballot === 'for' ? 1 : -1, term: 'values' }],
  });
  const panel = (s: CampaignState, v: Vote) => {
    const host = mount();
    renderVotePanel(host, v, {}, { state: s, registries: reg, onCarry: vi.fn(), onDrop: vi.fn(), onOverrule: vi.fn() });
    return host;
  };

  it('the vote: her ballot against pre-selects DROP', () => {
    const s = fresh('commander');
    const passed = panel(s, vote('passed', 'against'));
    expect(preselected(passed).map((b) => b.dataset.voteAct)).toEqual(['drop']);
    expect(q(passed, '[data-vote-act="carry"]')!.parentElement!.querySelector('[data-defies]')).not.toBeNull();
    const failed = panel(s, vote('failed', 'against'));
    expect(preselected(failed).map((b) => b.dataset.voteAct)).toEqual(['accept']);
    expect(defies(failed).length).toBeGreaterThan(0);
    // she voted for it, or there is no obedience: nothing
    expect(preselected(panel(s, vote('passed', 'for')))).toEqual([]);
    expect(preselected(panel(fresh(null), vote('passed', 'against')))).toEqual([]);
  });

  it('the booking: CANCEL defies her, in the schedule and in the dossier', () => {
    const s = fresh('commander');
    personalOf(s).bookings = [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: 6, slot: 'evening', status: 'booked', source: 'roll', made: 5 }];
    const host = mount();
    host.append(renderSchedule(s, reg, { onCancel: vi.fn(), onKeep: vi.fn(), onSettle: vi.fn() })!);
    expect(defies(host).map((e) => e.textContent)).toEqual(['DEFIES ANN']);
    expect(defies(host)[0].parentElement).toBe(q(host, '[data-action="cancel"]')!.parentElement);
    const free = mount();
    const calm = fresh(null);
    personalOf(calm).bookings = s.personal!.bookings;
    free.append(renderSchedule(calm, reg, { onCancel: vi.fn(), onKeep: vi.fn(), onSettle: vi.fn() })!);
    expect(defies(free)).toEqual([]);
  });

  it('every hint carries no analysis gaps', () => {
    const s = fresh('commander');
    const host = panel(s, vote('failed', 'against'));
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
  });
});

void atImpunity;
