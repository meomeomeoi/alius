import type { Entry, Registries } from '../../content/types';
import { knownSkills, loadoutSize, respecCost, xpToNext } from '../../engine/progression';
import { activeLoadout } from '../../engine/combat/skills';
import { skillById } from '../../engine/combat/targeting';
import { canEquip } from '../../engine/items';
import { unitStats } from '../../engine/combat/stats';
import { affinityBand, attractionBand, trustBand } from '../../engine/relations/bands';
import { intimacyOf } from '../../engine/relations/gain';
import type { CampaignState, Unit } from '../../engine/state/types';
import { VALUE_AXES } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import type { ArcPath, ArcPathInfo } from '../../engine/arcs';
import type { LeashKind } from '../../engine/state/types';
import { stressBand } from '../../engine/combat/stress';
import { analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import { valueBand } from './bands';
import { renderSkillTree } from './skillTree';

export interface SquadTabCtx {
  st: StAdapter;
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  settings: () => AliusSettings;
  onNewCampaign: () => void;
  onResync?: (unitId: string) => void;
  /** P4 progression and equipment callbacks (the app dispatches the engine actions). */
  onUnlock?: (unitId: string, nodeId: string) => void;
  onRespec?: (unitId: string) => void;
  onSetLoadout?: (unitId: string, skillIds: string[]) => void;
  onEquip?: (unitId: string, uid: string) => void;
  onUnequip?: (unitId: string, slot: 'weapon' | 'upper' | 'lower') => void;
  /** P6: the Leash menu, defect arcs and Terminate. */
  onLeash?: (unitId: string, kind: LeashKind) => void;
  onArc?: (unitId: string, defectId: string, path: ArcPath, compel: boolean) => void;
  arcPaths?: (unitId: string, defectId: string) => ArcPathInfo[];
  /** `null` when oversight would hear a termination request (there is cause), else why not. */
  canTerminate?: (unitId: string) => string | null;
}

const unknown = (id: string) => `UNKNOWN ${id}`;
const nameOf = (e: Entry | undefined, id: string) => (e ? String(e.name) : unknown(id));

/** Sprite lookups per adapter: a found sprite is kept, a missing one is not asked for again for a while. */
const spriteCache = new WeakMap<StAdapter, Map<string, { url: string | null; at: number }>>();
const MISSING_SPRITE_RETRY_MS = 30_000;

/** Neutral sprite if the card has one, else the avatar; a failed load also falls back to the avatar. */
function portrait(st: StAdapter, unit: Unit): HTMLElement | null {
  if (unit.kind === 'grunt') {
    return unit.asciiPortrait ? h('pre', { class: 'alius-ascii', 'aria-label': `Portrait of ${unit.displayName}` }, unit.asciiPortrait) : null;
  }
  if (!unit.cardRef) return null;
  const card = unit.cardRef;
  const avatar = st.getAvatarUrl(card);
  let cache = spriteCache.get(st);
  if (!cache) spriteCache.set(st, (cache = new Map()));
  const known = cache.get(card);
  const img = h('img', { class: 'alius-portrait', src: known?.url ?? avatar, alt: unit.displayName, width: '96', height: '96' }) as HTMLImageElement;
  let usingAvatar = !known?.url;
  if (known && (known.url || Date.now() - known.at < MISSING_SPRITE_RETRY_MS)) {
    img.addEventListener('error', () => {
      if (usingAvatar) return;
      usingAvatar = true;
      img.setAttribute('src', avatar);
    });
    return img;
  }
  img.addEventListener('error', () => {
    if (usingAvatar) return;
    usingAvatar = true;
    img.setAttribute('src', avatar);
  });
  st.getSpriteUrl(card, 'neutral').then(
    (url) => {
      cache!.set(card, { url: url || null, at: Date.now() });
      if (!url) return;
      usingAvatar = false;
      img.setAttribute('src', url);
    },
    () => {},
  );
  return img;
}

function defectBlock(reg: Registries, d: Unit['defects'][number]): HTMLElement {
  const def = reg.defects.get(d.id);
  if (!def) return h('div', { class: 'alius-defect' }, h('strong', {}, unknown(d.id)));
  const bd = def.breakdown as { name: string; text: string };
  const arc = def.arc as { cure: string; manage: string; embrace: string };
  const line = (label: string, text: string) => h('p', { class: 'alius-defect-line' }, `${label}: ${text}`);
  return h(
    'div',
    { class: 'alius-defect' },
    h('strong', { class: 'alius-chip', ...analyzeNative(`defects:${d.id}`) }, String(def.name)),
    h('span', { class: 'alius-dim' }, ` [${String(def.category)}]`),
    d.origin ? line('Origin', d.origin) : null,
    line('Lore', String(def.lore)),
    line('Upside', String(def.upside)),
    line('Downside', String(def.downside)),
    line('Breakdown', `${bd.name} — ${bd.text}`),
    line('Social', String(def.social)),
    d.lite ? null : line('Arc', `Cure: ${arc.cure} · Manage: ${arc.manage} · Embrace: ${arc.embrace}`),
  );
}

/** State name and axis bands (numbers only with "show raw values"); grunts show Trust only. */
function relationLine(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const rel = state.relations[unit.id];
  if (!rel) return null;
  const raw = ctx.settings().showRawValues;
  const num = (n: number) => (raw ? ` (${n})` : '');
  const live = { unitId: unit.id };
  const chip = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-chip', ...analyzeNative(address, data) }, text);
  const parts = [
    chip(`${String(ctx.registries.relationshipStates.get(rel.stateId)?.name ?? rel.stateId).toUpperCase()}`, `relationshipStates:${rel.stateId}`),
    chip(`TRUST ${trustBand(rel.trust).toUpperCase()}${num(rel.trust)}`, 'glossary:trust', live),
  ];
  if (unit.kind !== 'grunt') {
    parts.push(chip(`AFFINITY ${affinityBand(rel.affinity).toUpperCase()}${num(rel.affinity)}`, 'glossary:affinity', live));
    if (intimacyOf(state).romance) parts.push(chip(`ATTRACTION ${attractionBand(rel.attraction).toUpperCase()}${num(rel.attraction)}`, 'glossary:attraction', live));
  }
  return h('p', { class: 'alius-relation' }, ...joinWith(parts, ' · '));
}

/** Children separated by a text separator, so the text of a line stays as it was before it carried markers. */
const joinWith = (items: Child[], sep: string): Child[] => items.flatMap((item, i) => (i === 0 ? [item] : [sep, item]));

const SLOTS = ['weapon', 'upper', 'lower'] as const;

/** Level, gear and injuries included; the role base when the role is unknown. */
function effectiveStats(unit: Unit, ctx: SquadTabCtx, state: CampaignState): Unit['baseStats'] {
  try {
    return unitStats(state, ctx.registries, unit);
  } catch {
    return unit.baseStats;
  }
}

/** One equipment line: the item, `STANDARD ISSUE` when empty, `UNKNOWN` / `NOT CERTIFIED` flags; with a picker. */
function equipmentBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement {
  const reg = ctx.registries;
  const rows = SLOTS.map((slot) => {
    const uid = unit.equipment[slot];
    const inst = uid ? state.inventory.find((i) => i.uid === uid) : undefined;
    const tpl = inst ? reg.items.get(inst.itemId) : undefined;
    let text: Child;
    let flag: string | null = null;
    if (!uid) text = 'STANDARD ISSUE';
    else if (!inst || !tpl) {
      text = 'UNKNOWN';
      flag = 'UNKNOWN';
    } else {
      text = h('span', { class: 'alius-chip', ...analyzeNative(`items:${inst.itemId}`) }, `${String(tpl.name)} [${inst.rarity}]${inst.upgrade > 0 ? ` +${inst.upgrade}` : ''}`);
      flag = canEquip(reg, unit, inst);
    }
    const options = state.inventory.filter((i) => reg.items.get(i.itemId)?.slot === slot && canEquip(reg, unit, i) === null);
    const picker = ctx.onEquip && ctx.onUnequip
      ? h('select', { class: 'alius-input', 'data-equip': slot, 'data-unit': unit.id, 'aria-label': `${slot} of ${unit.displayName}` },
        h('option', { value: '', selected: !uid }, '(standard issue)'),
        ...options.map((i) => h('option', { value: i.uid, selected: i.uid === uid }, `${String(reg.items.get(i.itemId)?.name)} [${i.rarity}]${i.upgrade > 0 ? ` +${i.upgrade}` : ''}`)))
      : null;
    if (picker) {
      (picker as HTMLSelectElement).value = uid ?? '';
      picker.addEventListener('change', () => {
        const v = (picker as HTMLSelectElement).value;
        if (v) ctx.onEquip!(unit.id, v);
        else if (uid) ctx.onUnequip!(unit.id, slot);
      });
    }
    return h('div', { class: 'alius-equip-row', 'data-slot': slot },
      h('span', {}, `${slot.toUpperCase()}: `, text),
      flag ? h('span', { class: 'alius-equip-flag' }, ` ${flag}`) : null,
      picker);
  });
  return h('div', { class: 'alius-equipment' }, ...rows);
}

/** Checkboxes for the known actives; once the loadout is full the unchecked ones are disabled. */
function loadoutBlock(unit: Unit, ctx: SquadTabCtx): HTMLElement {
  const reg = ctx.registries;
  const known = knownSkills(reg, unit);
  const size = loadoutSize(reg, unit);
  const chosen = new Set(activeLoadout(reg, unit));
  const boxes: HTMLInputElement[] = [];
  const sync = () => {
    const count = boxes.filter((b) => b.checked).length;
    for (const b of boxes) b.disabled = !b.checked && count >= size;
  };
  const rows = known.map((id) => {
    const box = h('input', { type: 'checkbox', 'data-skill': id, checked: chosen.has(id) }) as HTMLInputElement;
    boxes.push(box);
    box.addEventListener('change', () => {
      sync();
      ctx.onSetLoadout?.(unit.id, boxes.filter((b) => b.checked).map((b) => b.getAttribute('data-skill')!));
    });
    return h('label', { class: 'alius-option', ...analyzeNative(`skills:${id}`) }, box, ` ${skillById(reg, id)?.name ?? id}`);
  });
  sync();
  return h('div', { class: 'alius-loadout', 'data-unit': unit.id }, h('p', { class: 'alius-dim' }, `LOADOUT ${chosen.size}/${size}`), ...rows);
}

function progressionBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement {
  const cost = respecCost(unit);
  const canPay = state.resources.credits >= cost.credits && state.resources.plyx >= cost.plyx;
  const tree = h('div', { class: 'alius-tree-host' });
  renderSkillTree(tree, { unit, registries: ctx.registries, state, onUnlock: (nodeId) => ctx.onUnlock?.(unit.id, nodeId) });
  return h('div', { class: 'alius-progression' },
    h('h4', {}, 'SKILLS'),
    tree,
    h('h4', {}, 'LOADOUT'),
    loadoutBlock(unit, ctx),
    ctx.onRespec
      ? h('button', {
        type: 'button', class: 'alius-btn', 'data-respec': unit.id, disabled: unit.unlockedNodes.length === 0 || !canPay,
        onclick: () => ctx.onRespec!(unit.id),
      }, `[RESPEC — ${cost.credits} CR / ${cost.plyx} PLYX]`)
      : null);
}

const COST_NAMES: Record<string, string> = { credits: 'CREDITS', supplies: 'SUPPLIES', plyx: 'PLYX' };
const costText = (cost: ArcPathInfo['cost']): string =>
  Object.entries(cost).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${COST_NAMES[k] ?? k.toUpperCase()}`).join(' / ') || 'NO COST';

/** The arc status of one defect (`ARC: MANAGE 1/1`) or the paths she can take, marked with what she wants and refuses. */
function arcBlock(unit: Unit, d: Unit['defects'][number], ctx: SquadTabCtx): HTMLElement | null {
  if (d.lite || unit.kind !== 'named') return null;
  if (d.arc !== undefined && d.arcSteps) {
    return h('p', { class: 'alius-arc', 'data-arc': d.id }, `ARC: ${d.arc.toUpperCase()} ${d.arcSteps.done}/${d.arcSteps.needed}`);
  }
  if (!ctx.arcPaths || !ctx.onArc) return null;
  const paths = ctx.arcPaths(unit.id, d.id);
  if (!paths.some((p) => p.available)) return null;
  const rows = paths.map((p) => {
    const refused = p.available && p.refuses;
    const button = h('button', {
      type: 'button', class: 'alius-btn', 'data-decide': p.path, disabled: !p.available, title: p.reason ?? undefined,
      onclick: () => ctx.onArc!(unit.id, d.id, p.path, refused),
    }, refused ? `[ ${p.path.toUpperCase()} — WITH LEASH ]` : `[ ${p.path.toUpperCase()} ]`);
    return h('div', { class: 'alius-arc-path alius-option', 'data-path': p.path, ...analyzeNative(`glossary:arc_${p.path}`) },
      h('strong', {}, p.path.toUpperCase()),
      h('span', {}, ` — ${p.text}`),
      h('span', { class: 'alius-dim' }, ` · ${costText(p.cost)}`),
      p.wanted ? h('span', { class: 'alius-arc-mark' }, ' SHE WANTS THIS') : null,
      refused ? h('span', { class: 'alius-arc-mark is-refused' }, ' SHE REFUSES — LEASH ONLY') : null,
      !p.available && p.reason ? h('span', { class: 'alius-equip-flag' }, ` ${p.reason}`) : null,
      button);
  });
  return h('details', { class: 'alius-arc', 'data-arc': d.id }, h('summary', {}, '[ DECIDE ARC ]'), ...rows);
}

/** The Leash menu: compel and suppress always, terminate only when there is cause. */
function leashMenu(unit: Unit, ctx: SquadTabCtx): HTMLElement | null {
  if (!ctx.onLeash) return null;
  const kinds: LeashKind[] = ['compel', 'suppress'];
  if (ctx.canTerminate && ctx.canTerminate(unit.id) === null) kinds.push('terminate');
  return h('details', { class: 'alius-leash-menu', 'data-leash-menu': unit.id },
    h('summary', {}, '[ LEASH ]'),
    ...kinds.map((kind) => h('button', { type: 'button', class: 'alius-btn alius-option', 'data-leash': kind, ...analyzeNative(`glossary:leash_${kind}`), onclick: () => ctx.onLeash!(unit.id, kind) }, kind.toUpperCase())));
}

function unitBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement {
  const gone = unit.status === 'dead' || unit.status === 'deserted' || unit.status === 'terminated';
  const reg = ctx.registries;
  const raw = ctx.settings().showRawValues;
  const s = effectiveStats(unit, ctx, state);
  const sigTpl = reg.signatures.get(unit.signatureSkill.templateId);
  const values = VALUE_AXES.map((axis) => {
    const v = unit.values[axis];
    return h('span', { class: 'alius-stat', ...analyzeNative(`glossary:value_${axis}`) }, `${axis.toUpperCase()}: ${raw ? (v > 0 ? `+${v}` : String(v)) : valueBand(v)}`);
  });
  const live = { unitId: unit.id };
  const chip = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-chip', ...analyzeNative(address, data) }, text);
  const stat = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-stat', ...analyzeNative(address, data) }, text);
  const roleEntry = reg.roles.get(unit.roleId);

  return h(
    'article',
    { class: 'alius-unit' },
    portrait(ctx.st, unit),
    h(
      'div',
      { class: 'alius-unit-body' },
      h('h3', { class: 'alius-unit-name' }, unit.displayName),
      unit.kind === 'grunt' ? h('p', { class: 'alius-dim' }, `GRUNT ${unit.designation ?? ''}`.trimEnd()) : null,
      h('p', {}, roleEntry ? chip(nameOf(roleEntry, unit.roleId), `roles:${unit.roleId}`) : nameOf(roleEntry, unit.roleId), ` · LVL ${unit.level}`),
      h('p', { class: 'alius-xp' }, chip(`XP ${unit.xp}/${xpToNext(unit.level)}`, 'glossary:level_xp'), ' · ', chip(`SKILL POINTS ${unit.skillPoints}`, 'glossary:skill_points')),
      unit.breakdown
        ? h('p', { class: 'alius-equip-flag' }, `BREAKDOWN: ${String((reg.defects.get(unit.breakdown.defectId)?.breakdown as { name?: string } | undefined)?.name ?? unit.breakdown.defectId)}`)
        : null,
      gone ? h('p', { class: 'alius-equip-flag' }, `STATUS: ${unit.status.toUpperCase()}`) : null,
      relationLine(unit, state, ctx),
      !gone && state.relations[unit.id] ? h('p', { class: 'alius-loyalty' }, chip(`LOYALTY: ${state.relations[unit.id].loyaltyBand.toUpperCase()}`, 'glossary:loyalty_band')) : null,
      gone ? null : h('p', { class: 'alius-stress' }, chip(`STRESS ${stressBand(unit.stress).toUpperCase()}${raw ? ` (${unit.stress})` : ''}`, 'glossary:stress', live)),
      gone ? null : leashMenu(unit, ctx),
      unit.bio ? h('p', { class: 'alius-dim' }, unit.bio) : null,
      h('p', {}, ...joinWith([
        stat(`HP ${s.hp}`, 'glossary:stat_hp', live), stat(`ATK ${s.atk}`, 'glossary:stat_atk', live), stat(`DEF ${s.def}`, 'glossary:stat_def', live),
        stat(`SPD ${s.spd}`, 'glossary:stat_spd', live), stat(`CRIT ${s.crit}%`, 'glossary:stat_crit', live),
      ], ' · ')),
      equipmentBlock(unit, ctx, state),
      progressionBlock(unit, ctx, state),
      h('h4', {}, 'DEFECTS'),
      ...unit.defects.flatMap((d) => [defectBlock(reg, d), gone ? null : arcBlock(unit, d, ctx)]),
      h('h4', {}, 'VALUES'),
      h('p', { class: 'alius-values' }, ...joinWith(values, ' · ')),
      ...(unit.kind === 'grunt'
        ? []
        : [
            h('h4', {}, 'SIGNATURE'),
            h('p', {}, sigTpl ? h('strong', { class: 'alius-chip', ...analyzeNative(`signatures:${unit.signatureSkill.templateId}`) }, unit.signatureSkill.name) : h('strong', {}, unit.signatureSkill.name), ` — ${unit.signatureSkill.description}`),
            h('p', { class: 'alius-dim' }, `Template: ${nameOf(sigTpl, unit.signatureSkill.templateId)} — ${sigTpl ? String(sigTpl.mechanic) : ''}`),
          ]),
      // Re-sync overwrites numbers on a running campaign, so it follows the SYS edit lock.
      ctx.onResync && unit.cardRef && !ctx.settings().editLock
        ? h('button', { type: 'button', class: 'alius-btn', 'data-resync': unit.id, onclick: () => ctx.onResync!(unit.id) }, '[ RE-SYNC FROM CARD ]')
        : null,
    ),
  );
}

export function renderSquadTab(host: HTMLElement, ctx: SquadTabCtx): void {
  host.replaceChildren();
  const load = ctx.getLoad();
  const state = ctx.getState();

  if (load.kind === 'readonly') {
    host.append(h('section', { class: 'alius-section' }, h('p', { class: 'alius-banner' }, `READ-ONLY: ${load.reason}`)));
    return;
  }
  if (!state) {
    host.append(
      h(
        'section',
        { class: 'alius-section' },
        h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT'),
        h('button', { type: 'button', class: 'alius-btn', onclick: ctx.onNewCampaign }, '[ NEW CAMPAIGN ]'),
      ),
    );
    return;
  }
  if (state.squad.length === 0) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO UNITS ASSIGNED')));
    return;
  }
  host.append(h('section', { class: 'alius-section alius-squad' }, ...state.squad.map((u) => unitBlock(u, ctx, state))));
}
