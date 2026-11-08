import type { Entry, Registries } from '../../content/types';
import type { CampaignState, Unit } from '../../engine/state/types';
import { VALUE_AXES } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import type { LoadResult } from '../../st/persistence';
import { h } from '../dom';
import { valueBand } from './bands';

export interface SquadTabCtx {
  st: StAdapter;
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  settings: () => AliusSettings;
  onNewCampaign: () => void;
  onResync?: (unitId: string) => void;
}

const unknown = (id: string) => `UNKNOWN ${id}`;
const nameOf = (e: Entry | undefined, id: string) => (e ? String(e.name) : unknown(id));

/** Neutral sprite if the card has one, else the avatar; a failed load also falls back to the avatar. */
function portrait(st: StAdapter, unit: Unit): HTMLElement | null {
  if (!unit.cardRef) return null;
  const card = unit.cardRef;
  const avatar = st.getAvatarUrl(card);
  const img = h('img', { class: 'alius-portrait', src: avatar, alt: unit.displayName, width: '96', height: '96' }) as HTMLImageElement;
  let usingAvatar = true;
  img.addEventListener('error', () => {
    if (usingAvatar) return;
    usingAvatar = true;
    img.setAttribute('src', avatar);
  });
  st.getSpriteUrl(card, 'neutral').then(
    (url) => {
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
    h('strong', {}, String(def.name)),
    h('span', { class: 'alius-dim' }, ` [${String(def.category)}]`),
    d.origin ? line('Origin', d.origin) : null,
    line('Lore', String(def.lore)),
    line('Upside', String(def.upside)),
    line('Downside', String(def.downside)),
    line('Breakdown', `${bd.name} — ${bd.text}`),
    line('Social', String(def.social)),
    line('Arc', `Cure: ${arc.cure} · Manage: ${arc.manage} · Embrace: ${arc.embrace}`),
  );
}

function unitBlock(unit: Unit, ctx: SquadTabCtx): HTMLElement {
  const reg = ctx.registries;
  const raw = ctx.settings().showRawValues;
  const s = unit.baseStats;
  const equipped = Object.entries(unit.equipment).filter(([, id]) => !!id);
  const sigTpl = reg.signatures.get(unit.signatureSkill.templateId);
  const values = VALUE_AXES.map((axis) => {
    const v = unit.values[axis];
    return `${axis.toUpperCase()}: ${raw ? (v > 0 ? `+${v}` : String(v)) : valueBand(v)}`;
  });

  return h(
    'article',
    { class: 'alius-unit' },
    portrait(ctx.st, unit),
    h(
      'div',
      { class: 'alius-unit-body' },
      h('h3', { class: 'alius-unit-name' }, unit.displayName),
      h('p', {}, `${nameOf(reg.roles.get(unit.roleId), unit.roleId)} · LVL ${unit.level}`),
      h('p', {}, `HP ${s.hp} · ATK ${s.atk} · DEF ${s.def} · SPD ${s.spd} · CRIT ${s.crit}%`),
      h(
        'p',
        { class: 'alius-dim' },
        equipped.length === 0 ? 'STANDARD ISSUE — PENDING' : equipped.map(([slot, id]) => `${slot.toUpperCase()}: ${id}`).join(' · '),
      ),
      h('h4', {}, 'DEFECTS'),
      ...unit.defects.map((d) => defectBlock(reg, d)),
      h('h4', {}, 'VALUES'),
      h('p', { class: 'alius-values' }, values.join(' · ')),
      h('h4', {}, 'SIGNATURE'),
      h('p', {}, h('strong', {}, unit.signatureSkill.name), ` — ${unit.signatureSkill.description}`),
      h('p', { class: 'alius-dim' }, `Template: ${nameOf(sigTpl, unit.signatureSkill.templateId)} — ${sigTpl ? String(sigTpl.mechanic) : ''}`),
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
  host.append(h('section', { class: 'alius-section alius-squad' }, ...state.squad.map((u) => unitBlock(u, ctx))));
}

export function renderOpsPlaceholder(host: HTMLElement, getState: () => CampaignState | null): void {
  host.replaceChildren();
  const state = getState();
  host.append(
    h(
      'section',
      { class: 'alius-section' },
      state ? h('h2', {}, `DAY ${state.day} // ${state.slot.toUpperCase()}`) : null,
      h('p', { class: 'alius-dim' }, 'CALENDAR MODULE OFFLINE'),
    ),
  );
}
