import type { Registries } from '../../content/types';
import { investigationBand, overrideOpen, remoteExpectations, wardenOf, type Expectation } from '../../engine/warden';
import type { CampaignState, Unit } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';
import { renderIntrigueSection } from './intrigueSection';
import { expectationLabel, renderOverrideChip, type OverrideAnswer } from './overrideChip';

export interface WardenPanelDeps {
  /** Her portrait (the app builds it); absent = none. */
  avatar?: (unit: Unit) => Node | null;
  /** Show the numbers behind the bands (setting `showRawValues`). */
  showRaw?: boolean;
  onAnswer?: (answer: OverrideAnswer) => void;
  /** INTRIGUE: DIG and HACK STEP (a slot action with the ally who helps). */
  onIntrigue?: (action: 'dig' | 'hack_step', unitId?: string) => void;
  /** INTRIGUE: REPORT TO OVERSIGHT. */
  onReport?: () => void;
}

/** Words for the satisfaction and weight bands: the player reads these, never the engine's numbers (unless raw values are on). */
export const satisfactionBand = (n: number): string => (n < 20 ? 'HOSTILE' : n < 40 ? 'COLD' : n < 60 ? 'WARY' : n < 80 ? 'SATISFIED' : 'PLEASED');
export const weightBand = (w: number): string => (w < 0.2 ? 'LOW' : w < 0.35 ? 'MEDIUM' : 'HIGH');

/** The registry id of the entry for a kind (the address of a known row); personal expectations have none. Read by kind. */
const entryIdFor = (reg: Registries, x: Expectation): string | null =>
  x.kind === 'personal' ? null : String([...reg.wardenExpectations.values()].find((e) => e.kind === x.kind)?.id ?? '') || null;

/**
 * The WARDEN panel (P13 §6), in the corporate voice: who holds the controller, her satisfaction as a band, the defiance meter with its 50
 * and 75 marks and the warnings, the expectations the commander knows (label and weight band), one `? UNKNOWN EXPECTATION` for each it
 * does not (the count only: neither kind, text nor weight is in the page), the commander's restrictions, the Leash authorizations she has
 * left and what she has done to the commander lately. Appends nothing unless someone holds the leash.
 */
export function renderWardenPanel(host: HTMLElement, state: CampaignState, reg: Registries, deps: WardenPanelDeps = {}): void {
  const w = wardenOf(state);
  const unit = w ? state.squad.find((u) => u.id === w.unitId) : undefined;
  if (!w || !unit) {
    renderInvestigation(host, state);
    return;
  }
  const E = TUNING.warden.escalation;
  const known = w.expectations.filter((x) => x.known);
  const unknown = w.expectations.length - known.length;
  const raw = deps.showRaw === true;

  const meter = h('div', { class: 'alius-defiance alius-stat', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(w.defiance), ...analyzeAttrs('glossary:warden_defiance') },
    h('div', { class: 'alius-defiance-fill', style: `width:${w.defiance}%` }),
    h('span', { class: 'alius-defiance-mark', style: `left:${E.warning1}%`, 'aria-hidden': 'true' }),
    h('span', { class: 'alius-defiance-mark', style: `left:${E.warning2}%`, 'aria-hidden': 'true' }));
  const active = w.restrictions.filter((r) => state.day <= r.untilDay);
  const rows: HTMLElement[] = [
    h('p', {}, h('span', { class: 'alius-chip alius-stat', 'data-stat': 'satisfaction', ...analyzeAttrs('glossary:warden_satisfaction') }, `SATISFACTION: ${satisfactionBand(w.satisfaction)}${raw ? ` (${w.satisfaction})` : ''}`)),
    h('div', {}, h('span', { class: 'alius-dim' }, `DEFIANCE${raw ? ` ${w.defiance}` : ''}`), meter),
    ...w.warnings.map((x) => h('p', { class: 'alius-chip alius-stat alius-warning', 'data-warning': String(x.level), ...analyzeAttrs('glossary:lethal_escalation') }, `${x.level === 2 ? 'FINAL WARNING' : 'WARNING'} — day ${x.day}`)),
    h('h4', {}, 'EXPECTATIONS'),
    ...known.map((x) => {
      const id = entryIdFor(reg, x);
      return h('p', { class: 'alius-chip alius-stat alius-expectation', ...analyzeAttrs(id ? `wardenExpectations:${id}` : 'glossary:warden_expectation') }, `${expectationLabel(reg, x)} — ${weightBand(x.weight)}`);
    }),
    ...Array.from({ length: unknown }, () => h('p', { class: 'alius-chip alius-stat alius-expectation alius-unknown', ...analyzeAttrs('glossary:warden_expectation') }, '? UNKNOWN EXPECTATION')),
    h('h4', {}, 'THE LEASH'),
    h('p', {}, h('span', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:commander_leash') }, `AUTHORIZATIONS LEFT: ${w.leashLeft}`),
      w.compelled ? h('span', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:commander_leash') }, 'COMPELLED') : null),
    ...active.map((r) => h('p', { class: 'alius-chip alius-stat alius-restriction', 'data-restriction': r.what, ...analyzeAttrs('glossary:commander_punishment') },
      `${r.what === 'no_dms' ? 'NO MESSAGES' : 'NO LEAVE'} until day ${r.untilDay}`)),
    h('h4', {}, 'RECENT'),
    ...(w.punishLog.length === 0 ? [h('p', { class: 'alius-dim' }, 'NOTHING ON THE RECORD.')] : w.punishLog.slice(-5).reverse().map((p) =>
      h('p', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:commander_punishment') }, `Day ${p.day}: ${String(reg.commanderPunishments.get(p.punishmentId)?.label ?? 'Punishment')}`))),
  ];
  const portrait = deps.avatar?.(unit) ?? null;
  const body = h('div', { class: 'alius-warden-body' },
    h('div', { class: 'alius-warden-head' }, portrait ? h('span', { class: 'alius-warden-portrait', 'aria-hidden': 'true' }, portrait) : null,
      h('span', {}, `${unit.displayName.toUpperCase()} holds the controller.`)),
    ...rows);
  renderIntrigueSection(body, state, reg, { ...(deps.onIntrigue ? { onAct: deps.onIntrigue } : {}), ...(deps.onReport ? { onReport: deps.onReport } : {}) });
  if (overrideOpen(state) && deps.onAnswer) renderOverrideChip(body, state, reg, deps.onAnswer);
  const card = renderVoiceCard({ voice: VOICE_OF.warden_notice, title: 'WARDEN', meta: 'OVERSIGHT', level: 3, body });
  card.classList.add('alius-warden-panel');
  host.append(card);
}

/**
 * While nobody holds the leash and oversight investigates: the investigation as a band, and the fixed expectations of remote control
 * (quota and obedience, both known). Nothing in any other state (a cleared commander has no panel).
 */
function renderInvestigation(host: HTMLElement, state: CampaignState): void {
  const ls = state.leashswap;
  if (!ls || ls.status !== 'investigation') return;
  const clock = state.world.clocks.find((c) => c.id === (ls.removal?.clockId ?? 'investigation'));
  const label = (kind: string): string => (kind === 'meet_quota' ? 'QUOTA' : 'OBEDIENCE');
  const body = h('div', { class: 'alius-warden-body' },
    h('p', {}, 'NOBODY HOLDS THE CONTROLLER. OVERSIGHT RUNS IT.'),
    h('p', {}, h('span', { class: 'alius-chip alius-stat', 'data-stat': 'investigation', ...analyzeAttrs('glossary:investigation') },
      `INVESTIGATION: ${clock ? investigationBand(clock.filled, clock.segments) : 'UNDER WAY'}`)),
    h('h4', {}, 'REMOTE CONTROL'),
    ...remoteExpectations(state).map((x) => h('p', { class: 'alius-chip alius-stat alius-expectation', ...analyzeAttrs('glossary:remote_control') }, `${label(x.kind)} — ${weightBand(x.weight)}`)));
  const card = renderVoiceCard({ voice: VOICE_OF.warden_notice, title: 'OVERSIGHT', meta: 'INVESTIGATION', level: 3, body });
  card.classList.add('alius-warden-panel', 'alius-warden-investigation');
  host.append(card);
}
