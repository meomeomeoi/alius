import type { Registries } from '../../content/types';
import type { Skill } from '../../content/schemas';
import { defaultEnemyName } from '../../engine/combat/encounter';
import { makeCtx, type EffectCtx } from '../../engine/combat/effects';
import { checkOrder, orderCost } from '../../engine/combat/orders';
import { resolveSkill, usableSkills } from '../../engine/combat/skills';
import { legalTargets } from '../../engine/combat/targeting';
import { stressBand } from '../../engine/combat/stress';
import type { Combatant, LogEntry, PlannedAction } from '../../engine/combat/types';
import type { EngineEvent } from '../../engine/dispatch';
import { getSynergies } from '../../engine/relations';
import { Rng } from '../../engine/rng';
import type { CampaignState, Unit } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { h } from '../dom';
import { cutIn } from '../scene/cutIn';
import { bar, statusGlyph } from './bars';
import { attachCombatKeys } from './keys';

export interface CombatScreenCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  st: StAdapter;
  settings: () => AliusSettings;
  onAct(action: PlannedAction): void;
  onOrder(orderId: string, targetCid?: string): void;
  onAuto(on: boolean): void;
  onRetry(): void;
  onAccept(): void;
  onRetreat(): void;
  onClose(): void;
  /** P6: Compel the unit whose order was just refused. */
  onCompel?(): void;
}

export interface CombatScreen {
  refresh(): void;
  /** Reacts to engine events of the last dispatch (cut-ins). */
  handle(events: EngineEvent[]): void;
  dispose(): void;
}

const LOG_LINES = 8;

/** The terminal battlefield: enemy rows on top, squad rows below, keyboard and mouse control. */
export function renderCombatScreen(host: HTMLElement, ctx: CombatScreenCtx): CombatScreen {
  host.replaceChildren();
  const root = h('div', { class: 'alius-combat' });
  host.append(root);
  const { registries: reg, st } = ctx;

  let selSkill: string | null = null;
  let selTarget: string | null = null;
  let orderMode: string | null = null;
  const sprites = new Map<string, string | null>();

  // ------------------------------------------------------------------------------------------------ helpers
  const unitOf = (state: CampaignState, c: Combatant): Unit | undefined => state.squad.find((u) => u.id === c.unitId);
  const nameOf = (state: CampaignState, c: Combatant): string => {
    if (c.side === 'squad' || (c.unitId !== undefined && c.enemyId === undefined)) return unitOf(state, c)?.displayName ?? c.nameKey; // a mutineer keeps her own name
    const affixes = (c.nameKey.split('|')[1] ?? '').split(',').filter((a) => a !== '');
    return state.enemyNames?.[c.nameKey] ?? defaultEnemyName(reg, c.enemyId ?? '', affixes);
  };
  const effCtx = (state: CampaignState): EffectCtx => makeCtx(state.combat!, state, reg, new Rng(state.rng));

  function skillRows(state: CampaignState, cid: string): Array<{ skill: Skill; reason: string | null; targets: string[] }> {
    const cs = state.combat!;
    const c = cs.combatants.find((x) => x.cid === cid)!;
    const e = effCtx(state);
    const usable = new Map(usableSkills(e, cid).map((u) => [u.skill.id, u.targets]));
    const rows: Array<{ skill: Skill; reason: string | null; targets: string[] }> = [];
    for (const id of c.skills) {
      const skill = resolveSkill(reg, c, id);
      if (!skill || skill.kind === 'passive') continue;
      const cd = c.cooldowns[id] ?? 0;
      let reason: string | null = null;
      if (cd > 0) reason = `COOLDOWN ${cd}`;
      else if (!usable.has(id)) {
        const needsCp = (skill.cp ?? 0) > 0 && cs.cp < skill.cp! && !c.statuses.some((s) => s.id === 'authorized');
        reason = needsCp ? `NEEDS ${skill.cp} CP` : legalTargets(cs, cid, skill, reg).length === 0 ? 'NO TARGET' : 'UNAVAILABLE';
      }
      rows.push({ skill, reason, targets: usable.get(id) ?? [] });
    }
    return rows;
  }

  const needsTarget = (skill: Skill): boolean => !!skill.targets && skill.targets.side !== 'self' && skill.targets.count !== 'all';

  function targetsOfSelection(state: CampaignState): string[] {
    const cs = state.combat;
    if (!cs?.awaitingCid) return [];
    if (orderMode) {
      const order = reg.orders.get(orderMode) as unknown as { target: string } | undefined;
      if (!order) return [];
      const side = order.target === 'enemy' ? 'enemy' : 'squad';
      return order.target === 'none' ? [] : cs.combatants.filter((c) => c.side === side && !c.downed).map((c) => c.cid);
    }
    if (!selSkill) return [];
    const c = cs.combatants.find((x) => x.cid === cs.awaitingCid)!;
    const skill = resolveSkill(reg, c, selSkill);
    return skill ? legalTargets(cs, cs.awaitingCid, skill, reg) : [];
  }

  function act(state: CampaignState, action: PlannedAction): void {
    selSkill = null;
    selTarget = null;
    orderMode = null;
    void state;
    ctx.onAct(action);
  }

  function pickSkill(state: CampaignState, index: number): void {
    const cs = state.combat;
    if (!cs?.awaitingCid) return;
    const row = skillRows(state, cs.awaitingCid)[index];
    if (!row || row.reason) return;
    orderMode = null;
    selSkill = row.skill.id;
    selTarget = needsTarget(row.skill) ? row.targets[0] ?? null : null;
    render();
  }

  function confirm(state: CampaignState): void {
    const cs = state.combat;
    if (!cs?.awaitingCid) return;
    if (selSkill) {
      const c = cs.combatants.find((x) => x.cid === cs.awaitingCid)!;
      const skill = resolveSkill(reg, c, selSkill);
      if (!skill) return;
      if (needsTarget(skill)) {
        if (!selTarget || !targetsOfSelection(state).includes(selTarget)) return;
        act(state, { kind: 'skill', skillId: selSkill, targetCid: selTarget });
      } else act(state, { kind: 'skill', skillId: selSkill });
    }
  }

  function clickCard(state: CampaignState, cid: string): void {
    const legal = targetsOfSelection(state);
    if (!legal.includes(cid)) return;
    if (orderMode) {
      const id = orderMode;
      orderMode = null;
      selSkill = null;
      ctx.onOrder(id, cid);
      return;
    }
    selTarget = cid;
    confirm(state);
  }

  function cycleTarget(state: CampaignState, dir: 1 | -1): void {
    const legal = targetsOfSelection(state);
    if (legal.length === 0) return;
    const i = selTarget ? legal.indexOf(selTarget) : -1;
    selTarget = legal[(i + dir + legal.length) % legal.length];
    render();
  }

  function issueOrder(state: CampaignState, index: number): void {
    const cs = state.combat;
    const id = [...reg.orders.keys()][index];
    if (!cs || !id) return;
    const e = effCtx(state);
    const order = reg.orders.get(id) as unknown as { target: 'none' | 'ally' | 'enemy' };
    if (order.target === 'none') {
      if (checkOrder(e, id) === null) ctx.onOrder(id);
      return;
    }
    const side = order.target === 'enemy' ? 'enemy' : 'squad';
    const pool = cs.combatants.filter((c) => c.side === side && !c.downed).map((c) => c.cid);
    const preferred = selTarget && pool.includes(selTarget) ? selTarget : cs.awaitingCid && pool.includes(cs.awaitingCid) && side === 'squad' ? cs.awaitingCid : pool[0];
    const target = [preferred, ...pool].find((t) => t !== undefined && checkOrder(e, id, t) === null);
    if (target) {
      selSkill = null;
      orderMode = null;
      ctx.onOrder(id, target);
    }
  }

  /** `ready` while a refusal stands and an authorization is not yet pledged; `blocked` when none is left. */
  function compelState(state: CampaignState): 'none' | 'ready' | 'blocked' {
    const cs = state.combat;
    if (!ctx.onCompel || !cs?.lastRefusal || cs.phase !== 'awaiting') return 'none';
    return state.leash.authorizationsLeft - (cs.compels?.length ?? 0) >= 1 ? 'ready' : 'blocked';
  }

  const keysOff = attachCombatKeys({
    skill: (i) => { const s = ctx.getState(); if (s) pickSkill(s, i); },
    cycleTarget: (d) => { const s = ctx.getState(); if (s) cycleTarget(s, d); },
    confirm: () => { const s = ctx.getState(); if (s) confirm(s); },
    guard: () => { const s = ctx.getState(); if (s?.combat?.awaitingCid) act(s, { kind: 'guard' }); },
    swap: () => { const s = ctx.getState(); if (s?.combat?.awaitingCid) act(s, { kind: 'swap' }); },
    pass: () => { const s = ctx.getState(); if (s?.combat?.awaitingCid) act(s, { kind: 'pass' }); },
    order: (i) => { const s = ctx.getState(); if (s) issueOrder(s, i); },
    auto: () => { const s = ctx.getState(); if (s?.combat?.phase === 'awaiting') ctx.onAuto(!s.combat.auto); },
    cancel: () => { selSkill = null; selTarget = null; orderMode = null; render(); },
    compel: () => { const s = ctx.getState(); if (s && compelState(s) === 'ready') ctx.onCompel?.(); },
  });

  // ------------------------------------------------------------------------------------------------ rendering
  function logLine(state: CampaignState, l: LogEntry): string {
    const cs = state.combat;
    const name = (cid?: string): string => {
      if (!cid) return '';
      if (cid === 'commander') return 'Commander';
      const c = cs?.combatants.find((x) => x.cid === cid);
      return c ? nameOf(state, c) : cid;
    };
    const skill = l.skillId ? (reg.skills.get(l.skillId)?.name as string | undefined) ?? l.skillId : '';
    const order = l.orderId ? (reg.orders.get(l.orderId)?.name as string | undefined) ?? l.orderId : '';
    switch (l.kind) {
      case 'skill': return `R${l.round} ${name(l.actor)} uses ${skill}${l.target ? ` on ${name(l.target)}` : ''}`;
      case 'hit': return `R${l.round} ${name(l.actor)} hits ${name(l.target)} for ${l.amount ?? 0}`;
      case 'crit': return `R${l.round} ${name(l.actor)} CRITS ${name(l.target)} for ${l.amount ?? 0}`;
      case 'heal': return `R${l.round} ${name(l.target)} recovers ${l.amount ?? 0}`;
      case 'downed': return `R${l.round} ${name(l.target)} is down`;
      case 'revived': return `R${l.round} ${name(l.target)} is back on their feet`;
      case 'order': return `R${l.round} ORDER ${order}${l.target ? ` → ${name(l.target)}` : ''}`;
      case 'order_refused': return `R${l.round} ${name(l.target)} REFUSES ${order}`;
      case 'breakdown': return `R${l.round} ${name(l.target)} BREAKS DOWN`;
      case 'status': return `R${l.round} ${name(l.target)} ${l.statusId ?? ''}`;
      case 'stress': return `R${l.round} ${name(l.target)} stress ${(l.amount ?? 0) > 0 ? '+' : ''}${l.amount ?? 0}`;
      case 'cover': return `R${l.round} ${name(l.actor)} covers the commander`;
      case 'intercept': return `R${l.round} ${name(l.actor)} takes the hit for ${name(l.target)}`;
      case 'miss': return `R${l.round} ${name(l.actor)} misfires`;
      case 'pass': return `R${l.round} ${name(l.actor)} holds`;
      case 'summon': return `R${l.round} reinforcements arrive`;
      default: return `R${l.round} ${l.kind}`;
    }
  }

  function headCrop(state: CampaignState, c: Combatant): HTMLElement {
    const box = h('div', { class: 'alius-cc-head' });
    if (c.side === 'enemy') {
      const ascii = (reg.enemies.get(c.enemyId ?? '')?.portrait as { ascii: string[] } | undefined)?.ascii ?? [];
      const pre = h('pre', { class: 'alius-cc-ascii' });
      pre.textContent = ascii.join('\n');
      box.append(pre);
      return box;
    }
    const unit = unitOf(state, c);
    if (!unit) return box;
    if (unit.kind === 'grunt' || !unit.cardRef) {
      const pre = h('pre', { class: 'alius-cc-ascii' });
      pre.textContent = unit.asciiPortrait ?? '';
      box.append(pre);
      return box;
    }
    const img = h('img', { class: 'alius-cc-img', alt: '', src: st.getAvatarUrl(unit.cardRef) }) as HTMLImageElement;
    box.append(img);
    const key = unit.cardRef;
    const apply = (url: string | null) => { if (url) img.src = url; };
    if (sprites.has(key)) apply(sprites.get(key)!);
    else {
      void st.getSpriteUrl(key, 'neutral').then((u) => { sprites.set(key, u); apply(u); }, () => sprites.set(key, null));
    }
    return box;
  }

  function card(state: CampaignState, c: Combatant, synergyNames: string[], legal: boolean, selected: boolean): HTMLElement {
    const cs = state.combat!;
    const band = c.side === 'squad' ? stressBand(c.stress) : 'calm';
    const el = h('div', {
      class: `alius-cc${c.downed ? ' alius-cc-down' : ''}${c.cid === cs.awaitingCid ? ' alius-cc-active' : ''}${legal ? ' alius-cc-legal' : ''}${selected ? ' alius-cc-selected' : ''}`,
      'data-cid': c.cid, 'data-legal': legal ? 'true' : 'false', 'data-side': c.side,
      role: 'button', tabindex: '-1', onclick: () => { const s = ctx.getState(); if (s) clickCard(s, c.cid); },
    });
    const lines: HTMLElement[] = [h('div', { class: 'alius-cc-name' }, `${nameOf(state, c)}${c.level > 1 ? ` L${c.level}` : ''}`)];
    lines.push(h('div', { class: 'alius-cc-hp' }, `HP ${bar(c.hp, c.maxHp)} ${c.hp}/${c.maxHp}`));
    if (c.side === 'squad') lines.push(h('div', { class: 'alius-cc-st' }, `ST ${bar(c.stress, 100)} ${c.stress}`));
    const tags: string[] = c.statuses.map((s) => statusGlyph(s.id, s.stacks));
    if (c.downed) tags.push('DOWN');
    if (band === 'strained') tags.push('STRAINED');
    if (band === 'breaking') tags.push('BREAKING');
    if (c.breakdown) tags.push('BREAKDOWN');
    if (tags.length > 0) lines.push(h('div', { class: 'alius-cc-tags' }, tags.map((t) => `[${t}]`).join(' ')));
    if (synergyNames.length > 0) lines.push(h('div', { class: 'alius-cc-syn' }, synergyNames.join(' · ')));
    el.append(headCrop(state, c), h('div', { class: 'alius-cc-body' }, ...lines));
    return el;
  }

  function resultPanel(state: CampaignState): HTMLElement {
    const r = state.lastCombat!;
    const unitName = (id: string) => state.squad.find((u) => u.id === id)?.displayName ?? id;
    const rows: string[] = [`OUTCOME: ${r.outcome.toUpperCase()} · ${r.rounds} ROUNDS`];
    const xp = Object.entries(r.xp);
    if (xp.length > 0) rows.push(`XP: ${xp.map(([id, n]) => `${unitName(id)} +${n}`).join(', ')}`);
    if (r.levelUps.length > 0) rows.push(`LEVEL UP: ${r.levelUps.map((l) => `${unitName(l.unitId)} → ${l.level}`).join(', ')}`);
    if (r.loot.length > 0) {
      rows.push(`LOOT${r.banked ? '' : ' (NOT BANKED YET)'}: ${r.loot.map((d) => d.kind === 'item'
        ? `${(reg.items.get(d.item.itemId)?.name as string | undefined) ?? d.item.itemId} [${d.item.rarity}]`
        : `${d.amount} ${d.kind}`).join(', ')}`);
    }
    if (r.injuries.length > 0) rows.push(`INJURED: ${r.injuries.map(unitName).join(', ')}`);
    if (r.deaths.length > 0) rows.push(`LOST: ${r.deaths.map(unitName).join(', ')}`);
    if (r.breakdowns.length > 0) rows.push(`BREAKDOWN: ${r.breakdowns.map(unitName).join(', ')}`);
    if (r.commanderInjured) rows.push('THE COMMANDER WAS INJURED');
    return h(
      'section', { class: 'alius-combat-result' },
      h('h2', {}, '[ COMBAT REPORT ]'),
      ...rows.map((t) => h('div', { class: 'alius-combat-result-row' }, t)),
      h('button', { type: 'button', class: 'alius-btn', 'data-act': 'continue', onclick: () => ctx.onClose() }, '[CONTINUE]'),
    );
  }

  function render(): void {
    const state = ctx.getState();
    root.replaceChildren();
    if (!state) return;
    const cs = state.combat;
    if (!cs) {
      if (state.lastCombat) root.append(resultPanel(state));
      return;
    }
    const legal = new Set(targetsOfSelection(state));
    const fielded = cs.combatants.filter((c) => c.side === 'squad' && c.unitId).map((c) => c.unitId!);
    const synergyOf = (unitId?: string): string[] => unitId
      ? getSynergies(state, reg, fielded).filter((s) => s.unitId === unitId).map((s) => (reg.synergies.get(s.synergyId)?.name as string | undefined) ?? s.synergyId)
      : [];
    const row = (side: 'enemy' | 'squad', r: 'front' | 'back'): HTMLElement => {
      const cards = cs.combatants.filter((c) => c.side === side && c.row === r)
        .map((c) => card(state, c, side === 'squad' ? synergyOf(c.unitId) : [], legal.has(c.cid), selTarget === c.cid));
      if (side === 'squad' && r === 'back' && cs.commander) {
        const cmd = cs.commander;
        cards.push(h('div', { class: `alius-cc alius-cc-commander${cmd.downed ? ' alius-cc-down' : ''}${legal.has('commander') ? ' alius-cc-legal' : ''}`, 'data-cid': 'commander', 'data-side': 'squad' },
          h('div', { class: 'alius-cc-body' }, h('div', { class: 'alius-cc-name' }, 'COMMANDER'), h('div', { class: 'alius-cc-hp' }, `HP ${bar(cmd.hp, cmd.maxHp)} ${cmd.hp}/${cmd.maxHp}`))));
      }
      return h('div', { class: `alius-combat-row alius-combat-${side}-${r}`, 'data-row': `${side}-${r}` }, ...cards);
    };

    const timeline = h('div', { class: 'alius-combat-timeline', 'aria-label': 'Turn order' },
      ...cs.timeline.map((cid, i) => {
        const c = cs.combatants.find((x) => x.cid === cid)!;
        return h('span', { class: `alius-tl${i === cs.turn ? ' alius-tl-now' : ''}${c.downed ? ' alius-tl-down' : ''}`, 'data-cid': cid }, nameOf(state, c).slice(0, 6));
      }));

    const waiting = cs.phase === 'awaiting' && cs.awaitingCid;
    const skillButtons: HTMLElement[] = [];
    if (waiting) {
      skillRows(state, cs.awaitingCid!).forEach((r, i) => {
        skillButtons.push(h('button', {
          type: 'button', class: `alius-btn alius-skill${selSkill === r.skill.id ? ' alius-skill-selected' : ''}`,
          'data-skill': r.skill.id, 'data-key': String(i + 1), disabled: r.reason !== null, title: r.skill.description,
          onclick: () => {
            const s = ctx.getState();
            if (!s) return;
            pickSkill(s, i);
            if (!needsTarget(r.skill)) confirm(s);
          },
        }, `[${i + 1}] ${r.skill.name}${r.skill.cp ? ` ${r.skill.cp}CP` : ''}${r.reason ? ` (${r.reason})` : ''}`));
      });
    }

    const e = effCtx(state);
    const orders = [...reg.orders.values()].map((o, i) => {
      const id = o.id;
      const kind = (o as unknown as { target: 'none' | 'ally' | 'enemy' }).target;
      const pool = kind === 'none' ? [undefined] : cs.combatants.filter((c) => c.side === (kind === 'enemy' ? 'enemy' : 'squad') && !c.downed).map((c) => c.cid);
      const blocked = !waiting || !pool.some((t) => checkOrder(e, id, t) === null);
      const cost = waiting ? orderCost(e, id, kind === 'ally' ? cs.awaitingCid : undefined) : (o.cost as number);
      return h('button', {
        type: 'button', class: `alius-btn alius-order${orderMode === id ? ' alius-skill-selected' : ''}`,
        'data-order': id, 'data-key': 'QWERT'[i], disabled: blocked,
        title: String(o.summary),
        onclick: () => {
          const s = ctx.getState();
          if (!s?.combat) return;
          if (kind === 'none') issueOrder(s, i);
          else { orderMode = orderMode === id ? null : id; selSkill = null; selTarget = null; render(); }
        },
      }, `[${'QWERT'[i]}] ${o.name} ${cost}CP`);
    });

    const controls = cs.phase === 'lost_pending'
      ? [
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'retry', onclick: () => ctx.onRetry() }, '[RETRY]'),
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'accept', onclick: () => ctx.onAccept() }, '[ACCEPT DEFEAT]'),
      ]
      : [
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'guard', disabled: !waiting, onclick: () => { const s = ctx.getState(); if (s) act(s, { kind: 'guard' }); } }, '[G] GUARD'),
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'swap', disabled: !waiting, onclick: () => { const s = ctx.getState(); if (s) act(s, { kind: 'swap' }); } }, '[S] SWAP'),
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'pass', disabled: !waiting, onclick: () => { const s = ctx.getState(); if (s) act(s, { kind: 'pass' }); } }, '[P] PASS'),
        h('button', { type: 'button', class: `alius-btn${cs.auto ? ' alius-skill-selected' : ''}`, 'data-act': 'auto', onclick: () => ctx.onAuto(!cs.auto) }, `[A] AUTO${cs.auto ? ' ON' : ''}`),
        h('button', { type: 'button', class: 'alius-btn', 'data-act': 'retreat', onclick: () => ctx.onRetreat() }, '[RETREAT]'),
        compelState(state) !== 'none'
          ? h('button', {
            type: 'button', class: 'alius-btn', 'data-act': 'compel', disabled: compelState(state) === 'blocked',
            title: compelState(state) === 'blocked' ? 'Every authorization is already pledged.' : 'Force the refused order through the Leash.',
            onclick: () => ctx.onCompel!(),
          }, '[C] COMPEL')
          : null,
      ];

    const logBox = h('div', { class: 'alius-combat-log', 'aria-label': 'Combat log' },
      ...cs.log.slice(-LOG_LINES).map((l) => { const d = h('div', { class: 'alius-log-line' }); d.textContent = logLine(state, l); return d; }));

    root.append(
      h('div', { class: 'alius-combat-head' },
        h('span', {}, `ROUND ${cs.round}`),
        h('span', { class: 'alius-combat-cp' }, `CP ${'●'.repeat(cs.cp)}${'○'.repeat(Math.max(0, 5 - cs.cp))}`),
        ctx.onCompel ? h('span', { class: 'alius-combat-leash' }, `LEASH ${Math.max(0, state.leash.authorizationsLeft - (cs.compels?.length ?? 0))}`) : null,
        cs.phase === 'lost_pending' ? h('span', { class: 'alius-combat-lost' }, 'DEFEAT') : null),
      timeline,
      h('div', { class: 'alius-combat-field' },
        row('enemy', 'back'), row('enemy', 'front'),
        h('div', { class: 'alius-combat-mid' }, '═'.repeat(40)),
        row('squad', 'front'), row('squad', 'back')),
      h('div', { class: 'alius-combat-skills' }, ...skillButtons),
      h('div', { class: 'alius-combat-orders' }, ...orders),
      h('div', { class: 'alius-combat-controls' }, ...controls),
      logBox,
    );
  }

  render();

  function handle(events: EngineEvent[]): void {
    const state = ctx.getState();
    for (const ev of events) {
      if (ev.type !== 'combat_cutin') continue;
      const unit = state?.squad.find((u) => u.id === ev.unitId);
      const kind = String(ev.kind ?? 'combat');
      const text = String(ev.text ?? '');
      const show = (url?: string) => cutIn(host, kind, text, url);
      if (unit?.cardRef) {
        void st.getSpriteUrl(unit.cardRef, kind === 'breakdown' ? 'sadness' : 'neutral').then((u) => show(u ?? undefined), () => show());
      } else show();
    }
  }

  return {
    refresh: render,
    handle,
    dispose: () => {
      keysOff();
      root.remove();
    },
  };
}
