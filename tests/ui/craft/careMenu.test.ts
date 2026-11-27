// @vitest-environment jsdom
/**
 * P16b Task 15 (PDA surface): `[ CARE ]` in her cabin's room panel and in her DYNAMIC section. Open toward any woman with a dynamic block, drawn the same whether or not she noticed
 * an earlier care (it is hidden until she shows it), every chip with `data-analyze` and a reading, the engine's reason beside an option that cannot be done now.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/craft';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { cabinOf } from '../../../src/engine/basePlan';
import { careKinds } from '../../../src/engine/craft/care';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderCareMenu } from '../../../src/ui/craft/careMenu';
import { h } from '../../../src/ui/dom';
import { renderDynamicSection, resetDynamicSection } from '../../../src/ui/dynamic/section';
import type { HubCtx } from '../../../src/ui/hub/hubScreen';
import { renderRoomPanel } from '../../../src/ui/hub/roomPanel';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, world } from '../../engine/craft/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; resetDynamicSection(); });

const menuOf = (s: CampaignState, onCare = vi.fn()): HTMLElement | null => renderCareMenu(s, reg, ANN, onCare);
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } } as unknown as AnalyzeEnv);

describe('the menu', () => {
  it('lists the cares there are, in registry order, and an option dispatches its care', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    const onCare = vi.fn();
    const el = menuOf(s, onCare)!;
    document.body.append(el);
    expect(el.getAttribute('data-care-menu')).toBe(ANN);
    expect(el.querySelector('summary')!.textContent).toBe('[ CARE ]');
    expect([...el.querySelectorAll('[data-care]')].map((b) => b.getAttribute('data-care'))).toEqual(careKinds(reg).map((r) => r.id));
    (el.querySelector('[data-care="polishing_her_boots"]') as HTMLButtonElement).click();
    expect(onCare).toHaveBeenCalledWith(ANN, 'polishing_her_boots');
  });

  it('is open toward a woman at equal too, and absent without a dynamic block or a live profile', () => {
    expect(menuOf(world(reg, 'equal'))).not.toBeNull();
    const none = world(reg, 'play');
    delete none.relations[ANN].dynamic;
    expect(menuOf(none)).toBeNull();
    expect(renderCareMenu(world(reg, 'play'), reg, 'unit_bea', vi.fn())).toBeNull();
  });

  it('an option that cannot be done now is aria-disabled with the reason, and does nothing', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    s.relations[ANN].craft = { cares: [{ day: s.day, careId: 'polishing_her_boots', noticed: false }] };
    const onCare = vi.fn();
    const el = menuOf(s, onCare)!;
    const done = el.querySelector('[data-care="polishing_her_boots"]') as HTMLButtonElement;
    expect(done.getAttribute('aria-disabled')).toBe('true');
    expect(done.parentElement!.querySelector('.alius-reason')!.textContent).toMatch(/done today/);
    done.click();
    expect(onCare).not.toHaveBeenCalled();
    expect((el.querySelector('[data-care="tidying_her_quarters"]') as HTMLElement).getAttribute('aria-disabled')).toBeNull();
  });

  it('every option is aria-disabled with the reason while another woman holds the commander', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    s.personal = { seq: 9, bookings: [{ id: 'bk_held', unitId: 'unit_bea', kindId: 'held_in_quarters', day: s.day, slot: s.slot, status: 'booked', source: 'practice', made: s.day }] } as never;
    s.practices = { handovers: [], ...(s.practices ?? {}), held: { by: 'unit_bea', since: { day: s.day, slot: s.slot }, until: { day: s.day, slot: s.slot }, sensory: false, extended: 0, bookingIds: ['bk_held'] } } as never;
    const onCare = vi.fn();
    const el = menuOf(s, onCare)!;
    const buttons = [...el.querySelectorAll('[data-care]')] as HTMLElement[];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.parentElement!.querySelector('.alius-reason')!.textContent).toMatch(/held/);
      b.click();
    }
    expect(onCare).not.toHaveBeenCalled();
  });

  it('is drawn the same whether she noticed an earlier care or not (hidden until she shows it)', () => {
    const draw = (noticed: boolean): string => {
      const s = world(reg, 'play');
      s.slot = 'morning';
      s.relations[ANN].craft = { cares: [{ day: s.day - 2, careId: 'doing_her_laundry', noticed }] };
      return menuOf(s)!.outerHTML;
    };
    expect(draw(true)).toBe(draw(false));
  });

  it('every chip carries data-analyze and reads, is reachable, and no text names the commander by a pronoun', () => {
    const s = world(reg, 'play');
    const el = menuOf(s)!;
    document.body.append(el);
    expect(markedWithout(el)).toEqual([]);
    expect(unreachable(el)).toEqual([]);
    expect(unresolved(el, env(s))).toEqual([]);
    expect(hasCommanderPronoun(el.textContent ?? '')).toBe(false);
  });
});

describe('where it is drawn', () => {
  it('in her DYNAMIC section when the surface gives it an action', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    const onCare = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderDynamicSection(host, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, DEFAULT_SETTINGS), hidden: false, actions: { care: onCare } });
    const btn = host.querySelector('[data-care-menu] [data-care="tidying_her_quarters"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onCare).toHaveBeenCalledWith(ANN, 'tidying_her_quarters');
    const bare = h('div');
    renderDynamicSection(bare, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, DEFAULT_SETTINGS), hidden: false });
    expect(bare.querySelector('[data-care-menu]')).toBeNull();
  });

  it('in her cabin\'s room panel, whether or not she is there; not in the commander\'s cabin or another room', () => {
    const s = world(reg, 'play');
    const onCare = vi.fn();
    const ops = { getState: () => s, getLoad: () => ({ kind: 'ok' as const, state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn(), onCare };
    const hubCtx = { getState: () => s, getLoad: ops.getLoad, registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }), ops, onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), avatar: () => null } as unknown as HubCtx;
    const cabin = cabinOf(s, reg, ANN)!;
    const room = reg.hubRooms.get(String(cabin.hubRoomId))!;
    const panel = (plan: typeof cabin, view: Parameters<typeof renderRoomPanel>[4]['view']) => renderRoomPanel(room, s, hubCtx, [], { readOnly: false, onClose: vi.fn(), view });
    const hers = panel(cabin, { planRoomId: String(cabin.id), people: [], cabin: 'unit', title: 'HER CABIN' });
    expect(hers.querySelector(`[data-care-menu="${ANN}"]`)).not.toBeNull();
    const other = panel(cabin, { planRoomId: 'commander_cabin', people: [], cabin: 'commander' });
    expect(other.querySelector('[data-care-menu]')).toBeNull();
    const none = renderRoomPanel(room, s, hubCtx, [], { readOnly: true, onClose: vi.fn(), view: { planRoomId: String(cabin.id), people: [], cabin: 'unit' } });
    expect(none.querySelector('[data-care-menu]')).toBeNull();
  });
});
