import '../../engine/actions/items';
import type { Registries } from '../../content/types';
import { dispatch } from '../../engine/dispatch';
import { canEquip, checkWorkshop, equippedBy, itemStats } from '../../engine/items';
import { activeRosterUnits } from '../../engine/economy';
import type { Stats } from '../../engine/combat/types';
import { unitStats } from '../../engine/combat/stats';
import type { CampaignState, ItemInstance } from '../../engine/state/types';
import { h } from '../dom';

export interface InvTabCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  onEquip(unitId: string, uid: string): void;
  onCraft(recipeId: string): void;
  onUpgrade(uid: string): void;
  onReroll(uid: string, affixIndex: number): void;
  onDismantle(uid: string): void;
}

type SlotFilter = 'all' | 'weapon' | 'upper' | 'lower';
const STATS: Array<keyof Stats> = ['hp', 'atk', 'def', 'spd', 'crit'];

/** Why the engine would refuse the action right now (a dry run on a copy), or null. */
function refusal(state: CampaignState, reg: Registries, type: string, payload: unknown): string | null {
  const r = dispatch(state, { type, payload }, reg);
  const err = r.events.find((e) => e.type === 'error');
  return err ? String(err.message ?? 'NOT POSSIBLE') : null;
}

const upper = (s: string) => s.toUpperCase();

/** The INV tab: a retro item list, the compare panel and — during a workshop session — crafting and upgrades. */
export function renderInvTab(host: HTMLElement, ctx: InvTabCtx): void {
  const { registries: reg } = ctx;
  let filter: SlotFilter = 'all';
  let selected: string | null = null;
  let compareUnit: string | null = null;

  function render(): void {
    host.replaceChildren();
    const state = ctx.getState();
    if (!state) {
      host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
      return;
    }
    const slotOf = (i: ItemInstance) => reg.items.get(i.itemId)?.slot as string | undefined;
    const nameOf = (i: ItemInstance) => (reg.items.get(i.itemId)?.name as string | undefined) ?? `UNKNOWN ${i.itemId}`;
    const items = state.inventory.filter((i) => filter === 'all' || slotOf(i) === filter);
    const current = state.inventory.find((i) => i.uid === selected) ?? null;
    if (!current) selected = null;

    const res = h('p', { class: 'alius-inv-res' }, `CREDITS ${state.resources.credits} · SUPPLIES ${state.resources.supplies} · PLYX ${state.resources.plyx}`);
    const filters = h('div', { class: 'alius-inv-filters' },
      ...(['all', 'weapon', 'upper', 'lower'] as const).map((f) =>
        h('button', { type: 'button', class: 'alius-btn', 'data-filter': f, 'aria-pressed': filter === f ? 'true' : 'false', onclick: () => { filter = f; render(); } }, upper(f))));

    const list = h('div', { class: 'alius-inv-list', role: 'list' },
      ...(items.length === 0 ? [h('p', { class: 'alius-dim' }, 'NOTHING IN STORAGE')] : items.map((i) => {
        const wearer = equippedBy(state, i.uid);
        return h('button', {
          type: 'button', class: 'alius-inv-item', 'data-uid': i.uid, 'aria-pressed': selected === i.uid ? 'true' : 'false',
          onclick: () => { selected = i.uid; render(); },
        },
        h('span', { class: 'alius-inv-name' }, nameOf(i)),
        h('span', { class: `alius-rarity alius-rarity-${i.rarity}` }, i.rarity),
        h('span', {}, i.upgrade > 0 ? `+${i.upgrade}` : ''),
        h('span', { class: 'alius-dim' }, i.affixes.map((a) => String(reg.affixes.get(a)?.name ?? a)).join(', ')),
        h('span', { class: 'alius-dim' }, wearer ? `WORN BY ${wearer.displayName}` : ''));
      })));

    host.append(h('section', { class: 'alius-section alius-inv' }, h('h2', {}, '[ INVENTORY ]'), res, filters, list));
    if (current) host.append(comparePanel(state, current));
    if (checkWorkshop(state) === null) host.append(workshopPanel(state, current));
  }

  function comparePanel(state: CampaignState, item: ItemInstance): HTMLElement {
    const units = activeRosterUnits(state);
    if (!compareUnit || !units.some((u) => u.id === compareUnit)) compareUnit = units[0]?.id ?? null;
    const unit = units.find((u) => u.id === compareUnit);
    const slot = reg.items.get(item.itemId)?.slot as 'weapon' | 'upper' | 'lower' | undefined;
    const worn = unit && slot && unit.equipment[slot] ? state.inventory.find((i) => i.uid === unit.equipment[slot]) : undefined;
    const mine = itemStats(reg, item)?.stats ?? {};
    const theirs = worn && worn.uid !== item.uid ? itemStats(reg, worn)?.stats ?? {} : {};
    const deltas = STATS.filter((k) => (mine[k] ?? 0) !== (theirs[k] ?? 0) || (mine[k] ?? 0) !== 0)
      .map((k) => {
        const d = (mine[k] ?? 0) - (theirs[k] ?? 0);
        return h('span', { class: d >= 0 ? 'alius-delta-up' : 'alius-delta-down', 'data-stat': k }, `${upper(k)} ${d > 0 ? '+' : ''}${d}  `);
      });
    const picker = h('select', { class: 'alius-input', 'data-compare-unit': 'true', 'aria-label': 'Compare for' },
      ...units.map((u) => h('option', { value: u.id, selected: u.id === compareUnit }, u.displayName))) as HTMLSelectElement;
    picker.value = compareUnit ?? '';
    picker.addEventListener('change', () => { compareUnit = picker.value; render(); });
    const reason = unit ? canEquip(reg, unit, item) : 'NO UNIT';
    let afterLine: HTMLElement | null = null;
    if (unit && reason === null) {
      try {
        const sample = structuredClone(state);
        const s2 = sample.squad.find((u) => u.id === unit.id)!;
        const before = unitStats(sample, reg, s2);
        for (const x of sample.squad) for (const k of ['weapon', 'upper', 'lower'] as const) if (x.equipment[k] === item.uid) delete x.equipment[k];
        s2.equipment[slot!] = item.uid;
        const after = unitStats(sample, reg, s2);
        afterLine = h('p', { class: 'alius-dim', 'data-after': 'true' }, `${unit.displayName}: ${STATS.map((k) => `${upper(k)} ${before[k]}→${after[k]}`).join(' · ')}`);
      } catch { afterLine = null; }
    }
    return h('section', { class: 'alius-section alius-inv-compare' },
      h('h3', {}, `COMPARE: ${(reg.items.get(item.itemId)?.name as string | undefined) ?? item.itemId}`),
      h('div', {}, 'FOR ', picker, worn && worn.uid !== item.uid ? ` (WEARS ${(reg.items.get(worn.itemId)?.name as string | undefined) ?? worn.itemId})` : ' (STANDARD ISSUE)'),
      h('p', { class: 'alius-inv-deltas' }, ...deltas),
      afterLine,
      h('button', {
        type: 'button', class: 'alius-btn', 'data-act': 'equip', disabled: reason !== null || !unit, title: reason ?? 'Equip',
        onclick: () => { if (unit) ctx.onEquip(unit.id, item.uid); },
      }, reason ? `[EQUIP] ${reason}` : '[EQUIP]'));
  }

  function workshopPanel(state: CampaignState, item: ItemInstance | null): HTMLElement {
    const ops = state.workshopSession?.opsLeft ?? 0;
    const recipes = [...reg.recipes.values()].map((r) => {
      const reason = refusal(state, reg, 'item/craft', { recipeId: r.id });
      const tpl = reg.items.get(r.itemId as string);
      const cost = r.cost as { credits: number; plyx: number };
      return h('button', {
        type: 'button', class: 'alius-btn', 'data-recipe': r.id, disabled: reason !== null, title: reason ?? 'Craft',
        onclick: () => ctx.onCraft(r.id),
      }, `${String(tpl?.name ?? r.itemId)} [${String(r.rarity)}] ${cost.credits} CR / ${cost.plyx} PLYX${reason ? ` — ${reason}` : ''}`);
    });
    const itemButtons: HTMLElement[] = [];
    if (item) {
      const up = refusal(state, reg, 'item/upgrade', { uid: item.uid });
      const dis = refusal(state, reg, 'item/dismantle', { uid: item.uid });
      itemButtons.push(
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'upgrade', disabled: up !== null, title: up ?? 'Upgrade', onclick: () => ctx.onUpgrade(item.uid) }, `[UPGRADE +${item.upgrade + 1}]${up ? ` — ${up}` : ''}`),
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'dismantle', disabled: dis !== null, title: dis ?? 'Dismantle', onclick: () => ctx.onDismantle(item.uid) }, `[DISMANTLE]${dis ? ` — ${dis}` : ''}`),
        ...item.affixes.map((a, i) => {
          const why = refusal(state, reg, 'item/reroll', { uid: item.uid, affixIndex: i });
          return h('button', { type: 'button', class: 'alius-btn', 'data-act': 'reroll', 'data-index': String(i), disabled: why !== null, title: why ?? 'Reroll', onclick: () => ctx.onReroll(item.uid, i) }, `[REROLL ${upper(String(reg.affixes.get(a)?.name ?? a))}]${why ? ` — ${why}` : ''}`);
        }));
    }
    return h('section', { class: 'alius-section alius-inv-workshop' },
      h('h3', {}, `[ WORKSHOP ] ${ops} OPERATION${ops === 1 ? '' : 'S'} LEFT`),
      h('div', { class: 'alius-row' }, ...itemButtons),
      h('h4', {}, 'RECIPES'),
      h('div', { class: 'alius-inv-recipes' }, ...recipes));
  }

  render();
}
