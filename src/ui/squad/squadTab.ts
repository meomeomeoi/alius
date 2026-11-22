import type { ChallengeStat } from '../../engine/power/moves';
import { renderHierarchyBlock } from '../power/hierarchy';
import { renderDeviceBlock } from '../personal/deviceBlock';
import { renderMemoryBlock } from '../memory/memoryBlock';
import { renderDevelopmentBlock } from '../development/developmentBlock';
import { renderHobbiesEditor, renderOpinionsEditor, renderTemperamentBlock } from '../life/profileBlocks';
import { dynamicBlockData, renderExpectationsBlock, renderPracticeBlock } from '../dynamic/profileBlocks';
import { renderDynamicSection, type DynamicSectionActions } from '../dynamic/section';
import { temperamentOf, lifeMode } from '../../engine/life/state';
import { toldMilestones } from '../../engine/life/known';
import { buildKnowledge } from '../../analysis/knowledge';
import { renderHobbies, renderThoughts, renderToldNews } from '../life/lifeViews';
import { renderVitalsBlock } from '../vitals/block';
import { motionReduced } from '../motion';
import { renderChallenge, type WagerChoice } from '../personal/wagerForm';
import type { Entry, Registries } from '../../content/types';
import { bondOf, PUBLICITY_LEVELS, wantBand, wantEligible, wantOf } from '../../engine/bonds';
import { knownSkills, loadoutSize, respecCost, xpToNext } from '../../engine/progression';
import { activeLoadout } from '../../engine/combat/skills';
import { skillById } from '../../engine/combat/targeting';
import { canEquip } from '../../engine/items';
import { unitStats } from '../../engine/combat/stats';
import { affinityBand, attractionBand, trustBand } from '../../engine/relations/bands';
import { intimacyOf } from '../../engine/relations/gain';
import type { CampaignState, DecorPart, Publicity, Unit } from '../../engine/state/types';
import { VALUE_AXES } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import type { ArcPath, ArcPathInfo } from '../../engine/arcs';
import { arcLine } from '../../engine/arcs';
import type { LeashKind } from '../../engine/state/types';
import { stressBand } from '../../engine/combat/stress';
import { portraitOptions, unitPortrait } from '../portrait/portrait';
import { renderVoiceCard } from '../voice/voiceCard';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { quartersOf } from '../../engine/backdrops';
import { handOf } from '../../engine/hand';
import { dispositionFor } from '../../engine/worldOptions';
import { activeRestrictions, commandStance, impunityBand, impunityOf, stanceEntry } from '../../engine/discipline';
import { renderDisciplineMenu } from '../discipline/menu';
import { renderCmdrCard } from '../commander/cmdrCard';
import { h, type Child } from '../dom';
import { valueBand } from './bands';
import { renderSkillTree } from './skillTree';
import { valuesOf } from '../../engine/development/profile';

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
  /** P9: the DISCIPLINE menu (a punishment from the menu: the commander's own click). */
  onPunish?: (unitId: string, measure: string, days?: number) => void;
  /** P9d: the commander sets how open a romantic relationship is (the dossier's [SECRET] [KNOWN] [PUBLIC]). */
  onSetPublicity?: (unitId: string, level: Publicity) => void;
  /** P10b: the HAND select: the commander picks the handwriting of her notes (absent = no select). */
  onSetHand?: (unitId: string, handId: string) => void;
  /** P10c: QUARTERS, the room style of her quarters scenes. */
  onSetQuarters?: (unitId: string, styleId: string) => void;
  /** P9b: the squad leader's dossier block: ENDORSE her, or CHALLENGE her on a stat. */
  onEndorse?: () => void;
  onChallenge?: (stat: ChallengeStat) => void;
  /** P9e: the standing order "ask me first" for one soldier. */
  onAskFirst?: (unitId: string, on: boolean) => void;
  /** P9c: PEEL on a part of her decor, and CANCEL on one of her bookings (the DEVICE block of the dossier). */
  onPeel?: (unitId: string, part: DecorPart) => void;
  onCancelBooking?: (bookingId: string) => void;
  /** P9c chunk (b): the commander challenges her (the dossier's [CHALLENGE] form). */
  onWager?: (unitId: string, choice: WagerChoice) => void;
  /** P9c chunk (b): WEAR / TAKE OFF on a token (the CMDR dossier's TOKENS block). */
  onWear?: (tokenId: string) => void;
  onTakeOff?: (tokenId: string) => void;
  /** P3b: the MEMORY block of each named unit's dossier; absent = no block. */
  /** P14b: the DEVELOPMENT view of each named unit (HOLD and fact editing go through `dispatch`); absent = no block. */
  development?: { dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>; onChanged?: () => void };
  /** P14c: the TEMPERAMENT block and the HOBBIES and OPINIONS editors of each named unit's dossier (every edit goes through `dispatch`); absent = no block. */
  life?: { dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>; onChanged?: () => void };
  /** P15: the PRACTICE and EXPECTATIONS editors of each named unit's dossier (every edit goes through `dispatch`); absent = no block. */
  dynamic?: { dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>; onChanged?: () => void; /** The DYNAMIC section's cards and the exit: the controller's calls. */ actions?: DynamicSectionActions };
  memory?: { dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>; confirm: (text: string) => Promise<boolean>; onChanged?: () => void };
}

const unknown = (id: string) => `UNKNOWN ${id}`;
const nameOf = (e: Entry | undefined, id: string) => (e ? String(e.name) : unknown(id));

function defectBlock(reg: Registries, d: Unit['defects'][number]): HTMLElement {
  const def = reg.defects.get(d.id);
  if (!def) return h('div', { class: 'alius-defect' }, h('strong', {}, unknown(d.id)));
  const bd = def.breakdown as { name: string; text: string };
  const arc = arcLine(def);
  const line = (label: string, text: string) => h('p', { class: 'alius-defect-line' }, `${label}: ${text}`);
  return h(
    'div',
    { class: 'alius-defect' },
    h('strong', { class: 'alius-chip', ...analyzeAttrs(`defects:${d.id}`) }, String(def.name)),
    h('span', { class: 'alius-dim' }, ` [${String(def.category)}]`),
    d.origin ? line('Origin', d.origin) : null,
    line('Lore', String(def.lore)),
    line('Upside', String(def.upside)),
    line('Downside', String(def.downside)),
    line('Breakdown', `${bd.name} — ${bd.text}`),
    line('Social', String(def.social)),
    d.lite || arc === null ? null : line('Arc', arc),
  );
}

/** State name and axis bands (numbers only with "show raw values"); grunts show Trust only. */
function relationLine(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const rel = state.relations[unit.id];
  if (!rel) return null;
  const raw = ctx.settings().showRawValues;
  const num = (n: number) => (raw ? ` (${n})` : '');
  const live = { unitId: unit.id };
  const chip = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-chip', ...analyzeAttrs(address, data) }, text);
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
      text = h('span', { class: 'alius-chip', ...analyzeAttrs(`items:${inst.itemId}`) }, `${String(tpl.name)} [${inst.rarity}]${inst.upgrade > 0 ? ` +${inst.upgrade}` : ''}`);
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
      }, `[ RESPEC — ${cost.credits} CR / ${cost.plyx} PLYX ]`)
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

/** P9: her command stance and how safe she feels defying the commander; a grunt has neither. */
function disciplineLine(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const found = impunityOf(state, ctx.registries, unit.id);
  if (!found) return null;
  const live = { unitId: unit.id };
  const stance = commandStance(state, ctx.registries, unit.id);
  const entry = stance === null ? undefined : stanceEntry(ctx.registries, stance);
  const raw = ctx.settings().showRawValues;
  const parts: Child[] = [];
  if (stance !== null && entry) {
    parts.push(h('span', { class: 'alius-chip', 'data-stance': unit.id, ...analyzeAttrs(`commandStances:${stance}`, live) }, `STANCE: ${String(entry.name).toUpperCase()}`));
  }
  parts.push(h('span', { class: 'alius-chip', 'data-impunity': unit.id, ...analyzeAttrs('glossary:impunity', live) }, `IMPUNITY: ${impunityBand(found.value).toUpperCase()}${raw ? ` (${found.value})` : ''}`));
  return h('p', { class: 'alius-stance-line' }, ...joinWith(parts, ' · '));
}

/** P9b: her standing, the leader badge and, on the leader, ENDORSE and CHALLENGE. */
function hierarchyBlock(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const host = h('div', { class: 'alius-hierarchy' });
  renderHierarchyBlock(host, state, ctx.registries, unit.id, { onEndorse: () => ctx.onEndorse?.(), onChallenge: (stat) => ctx.onChallenge?.(stat), ...(ctx.onAskFirst ? { onAskFirst: ctx.onAskFirst } : {}) }, { raw: ctx.settings().showRawValues });
  return host.childElementCount > 0 ? host : null;
}

const RESTRICTION_LABEL = { confined: 'IN THE BRIG', no_leave: 'NO LEAVE', benched: 'BENCHED', duty: 'EXTRA DUTY' } as const;

/** P9: what the commander's discipline currently keeps her from, one chip each. */
function restrictionLine(unit: Unit, state: CampaignState): HTMLElement | null {
  const list = activeRestrictions(state, unit.id);
  if (list.length === 0) return null;
  return h('p', { class: 'alius-restrictions' }, ...joinWith(list.map((r) =>
    h('span', { class: 'alius-chip', 'data-restriction': r.kind, ...analyzeAttrs('glossary:restriction', { unitId: unit.id }) }, RESTRICTION_LABEL[r.kind])), ' · '));
}

/**
 * How open a romantic relationship is (P9d), only while she is in a `romantic` state: the level, her preference from the card and the
 * commander's choice as three buttons (the current one is pressed). The change goes through the app (`onSetPublicity`).
 */
function publicityLine(unit: Unit, level: Publicity, pref: Publicity, ctx: SquadTabCtx, concealed: boolean): HTMLElement {
  const live = { unitId: unit.id };
  return h('p', { class: 'alius-publicity' },
    h('span', { class: 'alius-chip', 'data-publicity': unit.id, ...analyzeAttrs('glossary:publicity', live) }, `PUBLICITY: ${level.toUpperCase()}`), ' ',
    h('span', { class: 'alius-chip', 'data-publicity-pref': unit.id, ...analyzeAttrs('glossary:publicity', live) }, `SHE PREFERS: ${pref.toUpperCase()}`),
    ...(ctx.onSetPublicity && !concealed // a concealed romance comes out only by being discovered
      ? PUBLICITY_LEVELS.flatMap((l) => [' ', h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-publicity-set': l, 'aria-pressed': String(l === level), ...analyzeNative('glossary:publicity', live),
        onclick: () => ctx.onSetPublicity!(unit.id, l),
      }, `[ ${l.toUpperCase()} ]`)])
      : []));
}

/**
 * The bond part of a dossier (P9d): her lead style, attachment and desire as chips, her Want as a band word (the number only
 * with raw values) while Want runs for her or is stored, and her rules with status and how often each was broken (suspended
 * ones are hidden). Nothing for a unit with none of these.
 */
function bondBlock(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  if (unit.kind !== 'named') return null;
  const reg = ctx.registries;
  const raw = ctx.settings().showRawValues;
  const live = { unitId: unit.id };
  const rules = (state.bonds?.rules ?? []).filter((r) => r.unitId === unit.id && (r.status === 'active' || r.status === 'negotiating' || (r.status === 'proposed' && r.delivered === true)));
  const showWant = wantEligible(state, reg, unit.id) || wantOf(state, unit.id) > 0;
  const open = intimacyOf(state).romance ? state.relations[unit.id]?.publicity : undefined; // romance off: no relationship news
  if (unit.bond === undefined && !showWant && rules.length === 0 && open === undefined) return null;
  const chip = (text: string, address: string, extra: Record<string, string> = {}) => h('span', { class: 'alius-chip', ...extra, ...analyzeAttrs(address, live) }, text);
  const bond = unit.bond === undefined ? null : bondOf(unit); // P14b: what she is now (an imported bond with her development on top)
  return h('div', { class: 'alius-bond' },
    bond ? h('p', {}, chip(`LEADS: ${bond.leadStyle.toUpperCase()}`, 'glossary:bond_profile', { 'data-bond': 'lead' }), ' ', chip(`ATTACHES: ${bond.attachment.toUpperCase()}`, 'glossary:bond_profile', { 'data-bond': 'attachment' }), ' ', chip(`DESIRE: ${bond.desire.toUpperCase()}`, 'glossary:bond_profile', { 'data-bond': 'desire' })) : null,
    open ? publicityLine(unit, open.level, bondOf(unit)?.publicity ?? 'known', ctx, state.relations[unit.id]?.stateId === 'secret_affair') : null,
    showWant ? h('p', {}, chip(`WANT: ${wantBand(wantOf(state, unit.id)).toUpperCase()}${raw ? ` (${wantOf(state, unit.id)})` : ''}`, 'glossary:want', { 'data-want': unit.id })) : null,
    rules.length > 0
      ? h('ul', { class: 'alius-rules' }, ...rules.map((r) => h('li', {}, h('span', {
        class: 'alius-chip', 'data-rule': r.id, ...analyzeAttrs(`relationshipRuleTemplates:${r.templateId}`, { unitId: unit.id, ruleId: r.id }),
      }, `${r.status === 'negotiating' ? 'NEGOTIATING' : r.status === 'proposed' ? 'PROPOSED' : 'ACTIVE'} — ${r.text}${r.brokenCount > 0 ? ` (broken ${r.brokenCount}×)` : ''}`))))
      : null);
}

/** P14b: the unit's DEVELOPMENT view (what she has become and shown); named units only. */
function developmentBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (!ctx.development || unit.kind !== 'named') return null;
  const host = h('div', { class: 'alius-development' });
  renderDevelopmentBlock(host, { state, registries: ctx.registries, settings: ctx.settings(), unitId: unit.id, dispatch: ctx.development.dispatch, ...(ctx.development.onChanged ? { onChanged: ctx.development.onChanged } : {}) });
  return host;
}

/**
 * P14c: her temperament (with a padlock per field), hobbies and opinions, under DEVELOPMENT. Editable only with the mechanics edit lock off;
 * with it on every control is drawn `aria-disabled`, her aptitudes are not drawn and an opinion she has not voiced is left out.
 */
function lifeProfileBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (!ctx.life || unit.kind !== 'named') return null;
  const { dispatch, onChanged } = ctx.life;
  const editable = !ctx.settings().editLock;
  const who = { id: unit.id, displayName: unit.displayName };
  const send = (action: { type: string; payload?: unknown }): void => {
    dispatch(action);
    onChanged?.();
  };
  const host = h('div', { class: 'alius-life-profile' });
  const part = (cls: string): HTMLElement => host.appendChild(h('div', { class: cls }));
  renderTemperamentBlock(part('alius-life-temperament'), {
    unit: who, temperament: temperamentOf(state, unit.id), locks: unit.temperamentLocks ?? [], editable,
    onSet: (field, value) => send({ type: 'profile/set_temperament', payload: { unitId: unit.id, temperament: { [field]: value } } }), // only the changed field: a locked one in the patch refuses it all
    onLock: (field, on) => send({ type: 'profile/lock_temperament', payload: { unitId: unit.id, field, on } }),
  });
  // with the lock on only what the commander has been told: a hobby she took up off-screen is left out until it is told, and the dots count told milestones
  const known = new Set(buildKnowledge(state, ctx.settings()).life(unit.id, ctx.registries).hobbies.map((x) => x.id));
  renderHobbiesEditor(part('alius-life-hobbies'), {
    unit: who, registries: ctx.registries, editable,
    hobbies: (unit.hobbies ?? []).filter((x) => editable || known.has(x.id)).map((x) => ({ id: x.id, state: x.state, milestones: editable ? x.milestones.length : toldMilestones(state, unit.id, x).length })),
    aptitudes: unit.aptitudes ?? { high: [], low: [] },
    onSet: (hobbies, aptitudes) => send({ type: 'profile/set_hobbies', payload: { unitId: unit.id, hobbies, aptitudes } }),
  });
  renderOpinionsEditor(part('alius-life-opinions'), {
    unit: who, registries: ctx.registries, editable,
    opinions: Object.fromEntries(Object.entries(unit.opinions ?? {}).map(([t, o]) => [t, { position: o.position, ...(o.text ? { text: o.text } : {}), voiced: o.voicedDay !== undefined }])),
    onSet: (topicId, patch) => send({ type: 'profile/set_opinion', payload: { unitId: unit.id, topicId, ...patch } }),
  });
  return host;
}

/**
 * P15: her PRACTICE and EXPECTATIONS, under the life editors. Her profile is hidden information, so it is drawn only while the mechanics edit
 * lock is off (with it on nothing shows), and only while a practice category is switched on. Every edit is one field at a time through
 * `profile/set_practice` and `profile/set_expectation` (a locked field refuses the whole patch).
 */
/**
 * P15: her DYNAMIC section (frame, band, domains, tracks, the vow, her reading, the cards she waits on, the way out). Nothing for a grunt, while the dynamic
 * is off, for a woman who holds nothing, or in immersive mode (the cards in a scene and the hub's line still show). Read from the state; every action is the
 * controller's, through `ctx.dynamic.actions`.
 */
function dynamicSection(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (unit.kind !== 'named') return null;
  const host = h('div', { class: 'alius-dyn-section-host' });
  const drawn = renderDynamicSection(host, {
    state, reg: ctx.registries, unitId: unit.id, knowledge: buildKnowledge(state, ctx.settings()), hidden: ctx.settings().dynamicHidden === true,
    ...(ctx.dynamic?.actions !== undefined ? { actions: ctx.dynamic.actions } : {}),
    ...(ctx.onPunish !== undefined ? { onPunish: (id: string, measure: string, days?: number) => ctx.onPunish!(id, measure, days) } : {}),
    ...(ctx.onLeash !== undefined ? { onLeash: (id: string) => ctx.onLeash!(id, 'compel') } : {}),
    ...(ctx.dynamic?.onChanged !== undefined ? { onChanged: ctx.dynamic.onChanged } : {}),
  });
  return drawn ? host : null;
}

function dynamicProfileBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (!ctx.dynamic || unit.kind !== 'named' || ctx.settings().editLock) return null;
  const data = dynamicBlockData(ctx.registries, state, unit.id);
  if (data.categories.length === 0) return null;
  const { dispatch, onChanged } = ctx.dynamic;
  const who = { id: unit.id, displayName: unit.displayName };
  const send = (action: { type: string; payload?: unknown }): void => {
    dispatch(action);
    onChanged?.();
  };
  const host = h('div', { class: 'alius-dynamic-profile' });
  const part = (cls: string): HTMLElement => host.appendChild(h('div', { class: cls }));
  renderPracticeBlock(part('alius-dyn-practice'), {
    unit: who, practice: unit.bond?.practice, categories: data.categories, locks: unit.practiceLocks ?? [], editable: true,
    onSet: (practice) => send({ type: 'profile/set_practice', payload: { unitId: unit.id, practice } }),
    onLock: (field, on) => send({ type: 'profile/lock_practice', payload: { unitId: unit.id, field, on } }),
  });
  renderExpectationsBlock(part('alius-dyn-expectations'), {
    unit: who, expectations: unit.expectations, targets: data.targets, sources: data.sources, locks: unit.expectationLocks ?? [], editable: true,
    onSet: (patch) => send({ type: 'profile/set_expectation', payload: { unitId: unit.id, patch } }),
    onLock: (field, on) => send({ type: 'profile/lock_expectation', payload: { unitId: unit.id, field, on } }),
  });
  return host;
}

/**
 * P14c: what the commander has been told of her life, under the editors: THOUGHTS (the opinions she has voiced, and what she used to think), what
 * she does (her hobbies as milestones told and a word) and what she has told of her days. Read through `Knowledge.life`; drawn only when her life
 * has anything to do with her (life on or once on, or a hobby or an opinion on her card).
 */
function lifeViewBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (unit.kind !== 'named') return null;
  if (lifeMode(state) === 'off' && state.life === undefined && (unit.hobbies ?? []).length === 0 && Object.keys(unit.opinions ?? {}).length === 0) return null;
  const view = { state, registries: ctx.registries, unitId: unit.id, knowledge: buildKnowledge(state, ctx.settings()) };
  const host = h('div', { class: 'alius-life-views' });
  const part = (cls: string): HTMLElement => host.appendChild(h('div', { class: cls }));
  renderThoughts(part('alius-life-thoughts'), view);
  renderHobbies(part('alius-life-hobbies-view'), view);
  renderToldNews(part('alius-life-told'), view);
  return host;
}

/** P3b: the unit's MEMORY block (dossier and facts, with PIN / FORGET and, with the edit lock off, EDIT). */
function memoryBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement | null {
  if (!ctx.memory) return null;
  const host = h('div', { class: 'alius-memory-host' });
  renderMemoryBlock(host, { state, settings: ctx.settings(), target: unit.id, dispatch: ctx.memory.dispatch, confirm: ctx.memory.confirm, ...(ctx.memory.onChanged ? { onChanged: ctx.memory.onChanged } : {}) });
  return host;
}

function unitBlock(unit: Unit, ctx: SquadTabCtx, state: CampaignState): HTMLElement {
  const gone = unit.status === 'dead' || unit.status === 'deserted' || unit.status === 'terminated';
  const reg = ctx.registries;
  const raw = ctx.settings().showRawValues;
  const s = effectiveStats(unit, ctx, state);
  const sigTpl = reg.signatures.get(unit.signatureSkill.templateId);
  const values = VALUE_AXES.map((axis) => {
    const v = valuesOf(unit)[axis]; // P14b: the effective band; the import shows only in the re-sync review
    return h('span', { class: 'alius-stat', ...analyzeAttrs(`glossary:value_${axis}`) }, `${axis.toUpperCase()}: ${raw ? (v > 0 ? `+${v}` : String(v)) : valueBand(v)}`);
  });
  const live = { unitId: unit.id };
  const chip = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-chip', ...analyzeAttrs(address, data) }, text);
  const stat = (text: string, address: string, data?: Record<string, unknown>) => h('span', { class: 'alius-stat', ...analyzeAttrs(address, data) }, text);
  const roleEntry = reg.roles.get(unit.roleId);

  // the unit's header is a paper dossier: name, role and level, experience, and the flags that mark her state
  const dossier = renderVoiceCard({
    voice: 'paper', title: unit.displayName, level: 3,
    body: h('div', {},
      unit.kind === 'grunt' ? h('p', { class: 'alius-dim' }, `GRUNT ${unit.designation ?? ''}`.trimEnd()) : null,
      h('p', {}, roleEntry ? chip(nameOf(roleEntry, unit.roleId), `roles:${unit.roleId}`) : nameOf(roleEntry, unit.roleId), ` · LVL ${unit.level}`),
      h('p', { class: 'alius-xp' }, chip(`XP ${unit.xp}/${xpToNext(unit.level)}`, 'glossary:level_xp'), ' · ', chip(`SKILL POINTS ${unit.skillPoints}`, 'glossary:skill_points')),
      unit.breakdown
        ? h('p', { class: 'alius-equip-flag' }, `BREAKDOWN: ${String((reg.defects.get(unit.breakdown.defectId)?.breakdown as { name?: string } | undefined)?.name ?? unit.breakdown.defectId)}`)
        : null,
      gone ? h('p', { class: 'alius-equip-flag' }, `STATUS: ${unit.status.toUpperCase()}`) : null),
  });
  dossier.querySelector('.alius-voice-title')!.classList.add('alius-unit-name');

  return h(
    'article',
    { class: 'alius-unit' },
    unitPortrait(ctx.st, unit, portraitOptions(ctx.settings())),
    h(
      'div',
      { class: 'alius-unit-body' },
      dossier,
      relationLine(unit, state, ctx),
      !gone && state.relations[unit.id] ? h('p', { class: 'alius-loyalty' }, chip(`LOYALTY: ${state.relations[unit.id].loyaltyBand.toUpperCase()}`, 'glossary:loyalty_band')) : null,
      gone ? null : h('p', { class: 'alius-disposition' }, h('span', { class: 'alius-chip', 'data-disposition': unit.id, ...analyzeAttrs('glossary:disposition', live) }, `Disposition: ${String(dispositionFor(state, reg, unit).name)}`)),
      gone ? null : bondBlock(unit, state, ctx),
      gone ? null : dynamicSection(unit, ctx, state), // P15: her hold, frame, domains and the way out
      gone ? null : disciplineLine(unit, state, ctx),
      gone ? null : hierarchyBlock(unit, state, ctx),
      gone ? null : renderDeviceBlock(state, ctx.registries, unit.id, { onPeel: (id, part) => ctx.onPeel?.(id, part), onCancel: (id) => ctx.onCancelBooking?.(id) }),
      unit.kind === 'named' ? memoryBlock(unit, ctx, state) : null,
      unit.kind === 'named' ? developmentBlock(unit, ctx, state) : null, // P14b
      gone ? null : lifeProfileBlock(unit, ctx, state), // P14c
      gone ? null : dynamicProfileBlock(unit, ctx, state), // P15: her practice and what she expects (hidden: only while the edit lock is off)
      gone ? null : lifeViewBlock(unit, ctx, state), // P14c: what she has told and said
      gone || !ctx.onWager ? null : renderChallenge(state, ctx.registries, unit.id, (choice) => ctx.onWager?.(unit.id, choice)),
      gone ? null : restrictionLine(unit, state),
      gone || !ctx.onPunish || unit.kind !== 'named' ? null : renderDisciplineMenu({ state, registries: reg, unitId: unit.id, onPunish: (measure, days) => ctx.onPunish!(unit.id, measure, days) }),
      gone ? null : h('p', { class: 'alius-stress' }, chip(`STRESS ${stressBand(unit.stress).toUpperCase()}${raw ? ` (${unit.stress})` : ''}`, 'glossary:stress', live)),
      gone ? null : renderVitalsBlock(state, reg, unit.id, { motion: !motionReduced(ctx.settings()) }),
      gone ? null : handSelect(unit, state, ctx),
      gone ? null : quartersSelect(unit, state, ctx),
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
            h('p', {}, sigTpl ? h('strong', { class: 'alius-chip', ...analyzeAttrs(`signatures:${unit.signatureSkill.templateId}`) }, unit.signatureSkill.name) : h('strong', {}, unit.signatureSkill.name), ` — ${unit.signatureSkill.description}`),
            h('p', { class: 'alius-dim' }, `Template: ${nameOf(sigTpl, unit.signatureSkill.templateId)} — ${sigTpl ? String(sigTpl.mechanic) : ''}`),
          ]),
      // Re-sync overwrites numbers on a running campaign, so it follows the SYS edit lock.
      ctx.onResync && unit.cardRef && !ctx.settings().editLock
        ? h('button', { type: 'button', class: 'alius-btn', 'data-resync': unit.id, onclick: () => ctx.onResync!(unit.id) }, '[ RE-SYNC FROM CARD ]')
        : null,
    ),
  );
}

/** P10b: HAND, the handwriting of her notes. Named units only, and only where the app can store the choice. */
function handSelect(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const current = handOf(state, ctx.registries, unit.id);
  if (!ctx.onSetHand || !current) return null;
  const select = h('select', { class: 'alius-input', 'data-hand': unit.id, 'aria-label': `Handwriting of ${unit.displayName}` }, ...[...ctx.registries.handFonts.values()].map((e) => {
    const option = h('option', { value: String(e.id) }, String(e.name));
    if (e.id === current.id) option.setAttribute('selected', '');
    return option;
  })) as HTMLSelectElement;
  select.value = String(current.id);
  select.addEventListener('change', () => ctx.onSetHand!(unit.id, select.value));
  return h('label', { class: 'alius-stat alius-hand', ...analyzeNative('glossary:handwriting', { unitId: unit.id }) }, 'HAND ', select);
}

/** P10c: QUARTERS, the room style her quarters scenes show and the model describes. Named units only, and only where the app can store it. */
function quartersSelect(unit: Unit, state: CampaignState, ctx: SquadTabCtx): HTMLElement | null {
  const current = quartersOf(state, ctx.registries, unit.id);
  if (!ctx.onSetQuarters || !current) return null;
  const select = h('select', { class: 'alius-input', 'data-quarters': unit.id, 'aria-label': `Quarters of ${unit.displayName}` }, ...[...ctx.registries.quartersStyles.values()].map((e) => {
    const option = h('option', { value: String(e.id), title: String(e.description) }, String(e.name));
    if (e.id === current.id) option.setAttribute('selected', '');
    return option;
  })) as HTMLSelectElement;
  select.value = String(current.id);
  select.addEventListener('change', () => ctx.onSetQuarters!(unit.id, select.value));
  return h('label', { class: 'alius-stat alius-quarters', ...analyzeNative('glossary:quarters', { unitId: unit.id }) }, 'QUARTERS ', select);
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
  renderCmdrCard(host, { state, registries: ctx.registries, raw: ctx.settings().showRawValues, ...(ctx.onWear ? { onWear: ctx.onWear } : {}), ...(ctx.onTakeOff ? { onTakeOff: ctx.onTakeOff } : {}) });
  if (state.squad.length === 0) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO UNITS ASSIGNED')));
    return;
  }
  host.append(h('section', { class: 'alius-section alius-squad' }, ...state.squad.map((u) => unitBlock(u, ctx, state))));
}
