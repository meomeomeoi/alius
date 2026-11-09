import { registerActivityHook, type ActivityHook } from '../activities';
import { consumeSlots, registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { countSent, dmMode, pushMessage, rollInitiative } from '../dms';
import { isLiving } from '../economy';
import { rollNight } from '../night';
import { applyRelationDelta } from '../relationGain';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { EventIntent } from '../relations/intents';
import type { EngineEvent } from '../dispatch';
import type { NightEntry } from '../state/types';
import './scene'; // registered first: its daily relationship pass must run before the night rolls

// Importing this module registers the DM, night and defect-social actions and hooks.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const TEXT_MAX = 1000;

interface Hook { activity: string; who: 'companion' | 'roster'; axis?: 'trust' | 'affinity' | 'attraction'; amount?: number; setFlag?: string }

/** Defect social hooks (Hunger Loop meals, Overclock Bias rest, need-controlling medbay visits). Named units only. */
export const defectSocialHook: ActivityHook = (draft, ctx, done) => {
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    if (unit.kind !== 'named' || !isLiving(unit)) continue;
    for (const d of unit.defects) {
      const hooks = (ctx.registries.defects.get(d.id)?.socialHooks as Hook[] | undefined) ?? [];
      for (const h of hooks) {
        if (h.activity !== done.activityId) continue;
        const involved = h.who === 'companion' ? done.companionId === unit.id : done.rosterIds.includes(unit.id);
        if (!involved) continue;
        if (h.axis && h.amount) applyRelationDelta(draft, unit.id, h.axis, h.amount, `defect_hook:${d.id}`);
        const rel = draft.relations[unit.id];
        if (h.setFlag && !rel.flags.includes(h.setFlag)) rel.flags.push(h.setFlag);
        events.push({ type: 'defect_social', unitId: unit.id, defectId: d.id });
      }
    }
  }
  return events;
};
registerActivityHook(defectSocialHook);

// night visits are rolled once a day, after the relationship pass and before the day-end night check
registerDayEndStep('dm_rumors', (draft, ctx) => rollNight(draft, ctx.registries, ctx.rng, 'daily'));

function namedUnit(draft: { squad: import('../state/types').Unit[] }, id: unknown) {
  const u = draft.squad.find((x) => x.id === id);
  if (!u || u.kind !== 'named' || !isLiving(u)) throw new Error('A DM needs a named living unit.');
  return u;
}

function textOf(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t === '' || t.length > TEXT_MAX) throw new Error(`A DM is 1 to ${TEXT_MAX} characters.`);
  return t;
}

registerAction('dm/send', (draft, payload) => {
  if (!isObj(payload)) throw new Error('dm/send needs { unitId, text }');
  const unit = namedUnit(draft, payload.unitId);
  const text = textOf(payload.text);
  pushMessage(draft, unit.id, { from: 'commander', text, day: draft.day, slot: draft.slot, read: true });
  countSent(draft, unit.id);
  return [{ type: 'dm_sent', unitId: unit.id, mode: dmMode(draft, unit.id) }];
});

registerAction('dm/receive', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('dm/receive needs { unitId, text }');
  const unit = namedUnit(draft, payload.unitId);
  const text = textOf(payload.text);
  const initiated = payload.initiated === true;
  pushMessage(draft, unit.id, { from: unit.id, text, day: draft.day, slot: draft.slot, read: false, ...(initiated ? { initiated: true } : {}) });
  return [{ type: 'dm_received', unitId: unit.id, initiated }, ...evaluateAutomatic(draft, ctx.registries, unit.id)];
});

registerAction('dm/read', (draft, payload) => {
  if (!isObj(payload)) throw new Error('dm/read needs { unitId }');
  const unit = namedUnit(draft, payload.unitId);
  for (const m of draft.dms[unit.id] ?? []) m.read = true;
  return [{ type: 'dm_read', unitId: unit.id }];
});

registerAction('dm/roll_initiative', (draft, _payload, ctx) => {
  return [{ type: 'dm_initiative', unitIds: rollInitiative(draft, ctx.registries, ctx.rng) }];
});

registerAction('night/open', (draft) => {
  if (draft.slot !== 'night' || !draft.calendar.nightEvent) throw new Error('night/open: there is no night event to open.');
  return [{ type: 'night_opened', entry: draft.calendar.nightEvent }];
});

registerAction('night/ignore', (draft, _payload, ctx) => {
  const entry = draft.calendar.nightEvent as NightEntry | undefined;
  if (draft.slot !== 'night' || !entry) throw new Error('night/ignore: there is no night event to ignore.');
  if (draft.scene || draft.calendar.pendingScene) throw new Error('night/ignore: a scene is open.');
  const events: EngineEvent[] = [{ type: 'night_ignored', unitId: entry.unitId, entryId: entry.id }];
  const consequence: EventIntent = {
    type: entry.ignore.event as EventIntent['type'], actor: 'commander', targets: [entry.unitId], severity: entry.ignore.severity,
    evidence: 'ignored the knock', confidence: 1,
  };
  events.push(...applyEventToUnit(draft, ctx.registries, entry.unitId, consequence));
  events.push(...evaluateAutomatic(draft, ctx.registries, entry.unitId));
  events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

/** Dispatched by the app after `commander_injured`: lovers, devoted and dependent units come to look in. */
registerAction('relations/commander_injured', (draft, _payload, ctx) => rollNight(draft, ctx.registries, ctx.rng, 'commander_injured'));
