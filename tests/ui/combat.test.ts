// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CombatResult } from '../../src/engine/combat/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { CampaignState } from '../../src/engine/state/types';
import { FakeStAdapter } from '../../src/st/fake';
import { bar, statusGlyph } from '../../src/ui/combat/bars';
import { renderCombatScreen, type CombatScreen, type CombatScreenCtx } from '../../src/ui/combat/combatScreen';
import { campaign, loadCore, run } from '../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const marksman = { enemyId: 'scav_marksman', level: 1, affixes: [] as string[] };
const screens: CombatScreen[] = [];
afterEach(() => {
  screens.splice(0).forEach((s) => s.dispose());
  document.body.innerHTML = '';
});

/** An open combat with s1 awaiting, three units in front. */
function open(enemies = [husk, marksman], cp = 3): CampaignState {
  const s = structuredClone(base);
  const r = run(s, reg, {
    type: 'combat/start',
    payload: { encounter: { enemies, danger: 1 }, formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee'] } },
  });
  r.state.combat!.awaitingCid = 's1';
  r.state.combat!.cp = cp;
  return r.state;
}

function mount(state: CampaignState | null, over: Partial<CombatScreenCtx> = {}) {
  const shell = document.createElement('div');
  shell.id = 'alius-shell';
  document.body.append(shell);
  const host = document.createElement('div');
  shell.append(host);
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const cur = { state };
  const calls = {
    onAct: vi.fn(), onOrder: vi.fn(), onAuto: vi.fn(), onRetry: vi.fn(), onAccept: vi.fn(), onRetreat: vi.fn(), onClose: vi.fn(),
  };
  const screen = renderCombatScreen(host, {
    getState: () => cur.state, registries: reg, st, settings: () => DEFAULT_SETTINGS, ...calls, ...over,
  });
  screens.push(screen);
  return { host, screen, cur, calls, st };
}
const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const card = (host: HTMLElement, cid: string) => host.querySelector<HTMLElement>(`.alius-cc[data-cid="${cid}"]`)!;

describe('bars', () => {
  it('bar widths at 0, half and full', () => {
    expect(bar(0, 100)).toBe('░░░░░░░░░░');
    expect(bar(50, 100)).toBe('█████░░░░░');
    expect(bar(100, 100)).toBe('██████████');
    expect(bar(5, 10, 4)).toBe('██░░');
    expect(bar(-5, 10, 4)).toBe('░░░░');
    expect(bar(99, 10, 4)).toBe('████');
    expect(bar(3, 0, 4)).toBe('░░░░');
  });

  it('status glyphs show stacks', () => {
    expect(statusGlyph('bleed')).toBe('BLD');
    expect(statusGlyph('bleed', 3)).toBe('BLD×3');
    expect(statusGlyph('custom')).toBe('CUS');
  });
});

describe('combat screen', () => {
  it('renders enemy and squad rows with bars and statuses', () => {
    const s = open();
    s.combat!.combatants.find((c) => c.cid === 's2')!.statuses.push({ id: 'bleed', turns: 2, stacks: 2, sourceCid: 'e1' });
    s.combat!.combatants.find((c) => c.cid === 's3')!.stress = 60;
    const { host } = mount(s);
    expect(host.querySelectorAll('.alius-cc[data-side="squad"]')).toHaveLength(4);
    expect(host.querySelectorAll('.alius-cc[data-side="enemy"]')).toHaveLength(2);
    expect(card(host, 's1').textContent).toMatch(/HP █+░*\s+\d+\/\d+/);
    expect(card(host, 's1').textContent).toMatch(/ST ░+/);
    expect(card(host, 's2').textContent).toContain('[BLD×2]');
    expect(card(host, 's3').textContent).toContain('[STRAINED]');
    expect(host.querySelector('[data-row="enemy-back"] [data-cid="e2"]')).not.toBeNull();
    expect(host.querySelector('[data-row="squad-front"] [data-cid="s1"]')).not.toBeNull();
    expect(host.querySelector('.alius-cc-active')!.getAttribute('data-cid')).toBe('s1');
    expect(host.textContent).toContain('ROUND 1');
    expect(host.textContent).toContain('CP ●●●○○');
    expect(host.querySelectorAll('.alius-tl')).toHaveLength(6);
  });

  it('only legal targets are selectable', () => {
    const s = open();
    const { host, calls } = mount(s);
    press('1'); // Strike is melee: only the front enemy is a target
    expect(card(host, 'e1').getAttribute('data-legal')).toBe('true');
    expect(card(host, 'e2').getAttribute('data-legal')).toBe('false');
    expect(card(host, 's2').getAttribute('data-legal')).toBe('false');
    card(host, 'e2').click();
    expect(calls.onAct).not.toHaveBeenCalled();
    card(host, 'e1').click();
    expect(calls.onAct).toHaveBeenCalledWith({ kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
  });

  it('a skill on cooldown is disabled with the turns left', () => {
    const s = open();
    s.combat!.combatants[0].cooldowns.as_burst = 2;
    const { host } = mount(s);
    const btn = host.querySelector<HTMLButtonElement>('[data-skill="as_burst"]')!;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('COOLDOWN 2');
    expect(host.querySelector<HTMLButtonElement>('[data-skill="as_strike"]')!.disabled).toBe(false);
  });

  it('keyboard 2 + Enter acts on the first legal target; arrows cycle; Escape cancels', () => {
    const s = open();
    const { host, calls } = mount(s);
    press('2');
    expect(host.querySelector('.alius-cc-selected')!.getAttribute('data-cid')).toBe('e1');
    press('ArrowRight');
    expect(host.querySelector('.alius-cc-selected')!.getAttribute('data-cid')).toBe('e2');
    press('ArrowLeft');
    expect(host.querySelector('.alius-cc-selected')!.getAttribute('data-cid')).toBe('e1');
    press('Escape');
    expect(host.querySelector('.alius-cc-selected')).toBeNull();
    press('Enter');
    expect(calls.onAct).not.toHaveBeenCalled();
    press('2');
    press('Enter');
    expect(calls.onAct).toHaveBeenCalledWith({ kind: 'skill', skillId: 'as_burst', targetCid: 'e1' });
  });

  it('G, S and P act without a target; A toggles auto; keys are ignored while typing', () => {
    const s = open();
    const { calls } = mount(s);
    press('g');
    press('s');
    press('p');
    expect(calls.onAct.mock.calls.map((c) => c[0])).toEqual([{ kind: 'guard' }, { kind: 'swap' }, { kind: 'pass' }]);
    press('a');
    expect(calls.onAuto).toHaveBeenCalledWith(true);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    expect(calls.onAct).toHaveBeenCalledTimes(3);
  });

  it('Q issues the first order and is disabled without CP', () => {
    const s = open([husk], 2);
    const { host, calls, cur, screen } = mount(s);
    const q = host.querySelector<HTMLButtonElement>('[data-order="focus_fire"]')!;
    expect(q.disabled).toBe(false);
    expect(q.textContent).toContain('[Q] Focus Fire 2CP');
    press('q');
    expect(calls.onOrder).toHaveBeenCalledWith('focus_fire', 'e1');
    cur.state!.combat!.cp = 0;
    screen.refresh();
    expect(host.querySelector<HTMLButtonElement>('[data-order="focus_fire"]')!.disabled).toBe(true);
    press('q');
    expect(calls.onOrder).toHaveBeenCalledTimes(1);
  });

  it('an order that targets a unit waits for a click on a legal card; a target-less order goes at once', () => {
    const s = open([husk], 5);
    const { host, calls } = mount(s);
    host.querySelector<HTMLButtonElement>('[data-order="steady"]')!.click();
    expect(card(host, 's2').getAttribute('data-legal')).toBe('true');
    expect(card(host, 'e1').getAttribute('data-legal')).toBe('false');
    card(host, 's2').click();
    expect(calls.onOrder).toHaveBeenCalledWith('steady', 's2');
    host.querySelector<HTMLButtonElement>('[data-order="hold_the_line"]')!.click();
    expect(calls.onOrder).toHaveBeenLastCalledWith('hold_the_line');
  });

  it('lost_pending shows RETRY and ACCEPT DEFEAT', () => {
    const s = open();
    s.combat!.phase = 'lost_pending';
    s.combat!.awaitingCid = undefined;
    const { host, calls } = mount(s);
    const retry = host.querySelector<HTMLButtonElement>('[data-act="retry"]')!;
    expect(retry.textContent).toBe('[RETRY]');
    expect(host.querySelector('[data-act="accept"]')!.textContent).toBe('[ACCEPT DEFEAT]');
    expect(host.querySelector('[data-act="guard"]')).toBeNull();
    retry.click();
    (host.querySelector('[data-act="accept"]') as HTMLElement).click();
    expect(calls.onRetry).toHaveBeenCalledOnce();
    expect(calls.onAccept).toHaveBeenCalledOnce();
  });

  it('AUTO and RETREAT buttons call the handlers', () => {
    const { host, calls } = mount(open());
    (host.querySelector('[data-act="auto"]') as HTMLElement).click();
    (host.querySelector('[data-act="retreat"]') as HTMLElement).click();
    expect(calls.onAuto).toHaveBeenCalledWith(true);
    expect(calls.onRetreat).toHaveBeenCalledOnce();
  });

  it('result panel lists xp, loot and injuries', () => {
    const s = structuredClone(base);
    const result: CombatResult = {
      id: 'c1', day: 1, outcome: 'won', rounds: 4, formation: { front: ['unit_ann'], back: [] }, participants: ['unit_ann'],
      enemies: [], log: [], xp: { unit_ann: 23 }, levelUps: [{ unitId: 'unit_ann', level: 2 }],
      loot: [{ kind: 'credits', amount: 12 }, { kind: 'item', item: { uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 0, affixes: [] } }],
      banked: false, injuries: ['unit_bea'], deaths: [], breakdowns: [], stressDelta: {}, relationHints: [], commanderInjured: false,
    };
    s.lastCombat = result;
    const { host, calls } = mount(s);
    const text = host.textContent!;
    expect(text).toContain('OUTCOME: WON');
    expect(text).toContain('XP: Ann +23');
    expect(text).toContain('LEVEL UP: Ann → 2');
    expect(text).toContain('12 credits');
    expect(text).toContain('Standard Blade [refined]');
    expect(text).toContain('NOT BANKED');
    expect(text).toContain('INJURED: Bea');
    (host.querySelector('[data-act="continue"]') as HTMLElement).click();
    expect(calls.onClose).toHaveBeenCalledOnce();
  });

  it('log text is not HTML', () => {
    const s = open();
    s.squad[0].displayName = '<img src=x onerror=alert(1)>';
    const { host } = mount(s);
    s.combat!.log.push({ round: 1, kind: 'skill', actor: 's1', skillId: 'as_strike', target: 'e1' });
    expect(host.querySelector('img[src="x"]')).toBeNull();
    const { host: h2 } = mount(s);
    expect(h2.querySelector('.alius-combat-log img')).toBeNull();
    expect(h2.querySelector('.alius-combat-log')!.textContent).toContain('<img src=x onerror=alert(1)> uses Strike');
  });

  it('a commander card appears in the squad back row during a crisis', () => {
    const s = structuredClone(base);
    const r = run(s, reg, {
      type: 'combat/start',
      payload: { encounter: { enemies: [husk], danger: 1, exposesCommander: true }, coverId: 'unit_ann', formation: { front: ['unit_ann'], back: ['unit_dee'] } },
    });
    const { host } = mount(r.state);
    expect(host.querySelector('[data-row="squad-back"] [data-cid="commander"]')!.textContent).toContain('COMMANDER');
    expect(host.querySelector('[data-row="squad-back"] [data-cid="commander"]')!.textContent).toContain('50/50');
  });

  it('cut-in fires on a breakdown event', async () => {
    const s = open();
    const { host, screen } = mount(s);
    screen.handle([{ type: 'combat_cutin', kind: 'breakdown', unitId: 'unit_ann', text: 'Red Out' }]);
    await new Promise((r) => setTimeout(r, 0));
    const el = host.querySelector('.alius-cutin');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-kind')).toBe('breakdown');
    expect(el!.textContent).toContain('Red Out');
    screen.handle([{ type: 'level_up' }]);
    expect(host.querySelectorAll('.alius-cutin')).toHaveLength(1);
  });

  it('dispose removes the key handlers', () => {
    const { calls, screen } = mount(open());
    screen.dispose();
    press('g');
    expect(calls.onAct).not.toHaveBeenCalled();
  });

  it('keys do nothing once the shell is closed', () => {
    const { calls } = mount(open());
    document.getElementById('alius-shell')!.remove();
    press('g');
    press('Enter');
    expect(calls.onAct).not.toHaveBeenCalled();
  });

  it('shows nothing without a campaign', () => {
    const { host } = mount(null);
    expect(host.textContent).toBe('');
  });
});

describe('presence action (P7)', () => {
  const withPresence = (kind: 'unnoticed' | 'steady_voice' | 'rally', used = false): CampaignState => {
    const s = open();
    s.combat!.presence = { kind, used };
    return s;
  };
  const btn = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-act="presence"]');

  it('the presence button is labelled by the archetype\'s kind', () => {
    for (const [kind, label] of [['unnoticed', 'UNNOTICED'], ['steady_voice', 'STEADY VOICE'], ['rally', 'RALLY']] as const) {
      const { host } = mount(withPresence(kind), { onPresence: vi.fn() });
      expect(btn(host)!.textContent).toContain(label);
      expect(btn(host)!.getAttribute('data-analyze')).toBe(`glossary:presence_${kind}`);
      document.body.innerHTML = '';
    }
  });

  it('the presence button dispatches once and is disabled after use', () => {
    const onPresence = vi.fn();
    const { host, cur, screen } = mount(withPresence('rally'), { onPresence });
    btn(host)!.click();
    expect(onPresence).toHaveBeenCalledTimes(1);
    cur.state = withPresence('rally', true);
    screen.refresh();
    expect(btn(host)!.disabled).toBe(true);
    expect(btn(host)!.textContent).toMatch(/USED/);
    btn(host)!.click();
    expect(onPresence).toHaveBeenCalledTimes(1);
  });

  it('Unnoticed is disabled, with the reason, when nobody is after the commander', () => {
    const noCrisis = withPresence('unnoticed');
    expect(noCrisis.combat!.commander).toBeUndefined();
    const b = btn(mount(noCrisis, { onPresence: vi.fn() }).host)!;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/Nobody is after you/);
    document.body.innerHTML = '';
    const crisis = withPresence('unnoticed');
    crisis.combat!.commander = { hp: 50, maxHp: 50, def: 10, coverId: 's1', downed: false };
    expect(btn(mount(crisis, { onPresence: vi.fn() }).host)!.disabled).toBe(false);
    document.body.innerHTML = '';
    expect(btn(mount(withPresence('rally'), { onPresence: vi.fn() }).host)!.disabled).toBe(false); // Rally and Steady Voice need no Crisis
  });

  it('is disabled while no unit awaits input, and hidden without the callback or for a combat from before P7', () => {
    const idle = withPresence('rally');
    idle.combat!.awaitingCid = undefined;
    expect(btn(mount(idle, { onPresence: vi.fn() }).host)!.disabled).toBe(true);
    document.body.innerHTML = '';
    expect(btn(mount(withPresence('rally')).host)).toBeNull();
    document.body.innerHTML = '';
    const legacy = open();
    delete legacy.combat!.presence;
    expect(btn(mount(legacy, { onPresence: vi.fn() }).host)).toBeNull();
  });

  it('a dodge shows in the log', () => {
    const s = open();
    s.combat!.log.push({ round: 1, kind: 'dodge', actor: 'e1', target: 'commander' });
    const { host } = mount(s);
    expect(host.querySelector('.alius-combat-log')!.textContent).toMatch(/Commander dodges/);
  });
});
