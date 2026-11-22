import { registerActivityHook, type ActivityHook } from '../activities';
import { isOwnPanelNight } from '../special/state';
import { rollIntercepts } from '../special/frequency/intercepts';
import { WANT_VISIT_KIND } from '../bonds/scene';
import { confess, SECRET_NIGHT_KIND } from '../personal/secrets';
import { relieveWant } from '../bonds/want';
import { consumeSlots, registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { closeNews } from '../life/news';
import { stampBehaviours } from '../dmBehaviours';
import { writeDoorNote } from '../notes';
import { countSent, dmMode, pushMessage, rollInitiative } from '../dms';
import { isLiving } from '../economy';
import { commanderRestriction } from '../warden/punish';
import { takeKeptEdit } from '../personal/intercept';
import { rollNight } from '../night';
import { applyRelationDelta } from '../relationGain';
import { TUNING } from '../tuning';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { EventIntent } from '../relations/intents';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, NightEntry } from '../state/types';
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

registerAction('dm/send', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('dm/send needs { unitId, text }');
  const unit = namedUnit(draft, payload.unitId);
  const text = textOf(payload.text);
  const revoked = commanderRestriction(draft, ctx.registries, 'dm', undefined, unit.id); // P13: the warden revoked the commander's messages; P16: a holder barred them, or her cold shoulder
  if (revoked) throw new Error(revoked);
  // P9c: a DM the commander kept after a level-4 edit says who edited it (the edit is used once)
  const editedBy = payload.interceptId === undefined ? undefined : takeKeptEdit(draft, String(payload.interceptId), unit.id);
  pushMessage(draft, unit.id, { from: 'commander', text, day: draft.day, slot: draft.slot, read: true, ...(editedBy !== undefined ? { editedBy } : {}) });
  if (draft.relations[unit.id]) draft.relations[unit.id].contactDay = draft.day; // P9d: judges a daily-contact rule
  countSent(draft, unit.id);
  return [{ type: 'dm_sent', unitId: unit.id, mode: dmMode(draft, unit.id) }];
});

registerAction('dm/receive', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('dm/receive needs { unitId, text }');
  const unit = namedUnit(draft, payload.unitId);
  const text = textOf(payload.text);
  const initiated = payload.initiated === true;
  // P14c: a DM that tells her news closes its outbox entry (only one that is waiting for this unit)
  const lifeItemId = payload.lifeItemId;
  if (lifeItemId !== undefined && !(draft.life?.outbox ?? []).some((o) => o.itemId === lifeItemId && o.unitId === unit.id && o.channel === 'dm')) throw new Error('Already told.');
  // P10b: `curt` says the reply was asked for in that mode; it is the only mode a received message can carry
  if (payload.mode !== undefined && payload.mode !== 'curt') throw new Error("dm/receive: mode can only be 'curt'.");
  const msg = pushMessage(draft, unit.id, { from: unit.id, text, day: draft.day, slot: draft.slot, read: false, ...(initiated ? { initiated: true } : {}) });
  // P10b: the behaviours are decided once, here (no rng: a hash of the message id), and stay on the message
  const stamped = stampBehaviours(draft, ctx.registries, unit.id, msg, { curt: payload.mode === 'curt' });
  if (stamped.length > 0) msg.behaviours = stamped;
  const heard = rollIntercepts(draft, ctx, [unit.id], { private: false, dm: true }); // P12: at most once a day, at half rate
  const told = lifeItemId === undefined ? [] : closeNews(draft, String(lifeItemId)); // P14c: the fact is the commander's now
  return [{ type: 'dm_received', unitId: unit.id, initiated }, ...evaluateAutomatic(draft, ctx.registries, unit.id), ...heard, ...told];
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

/** A night entry answered from its own panel (a confrontation, P12's handler visit): `night/open`, the door and `night/ignore` refuse it. */
const isConfrontation = (entry: NightEntry): boolean => isOwnPanelNight(entry);

registerAction('night/open', (draft, _payload, ctx) => {
  if (draft.slot !== 'night' || !draft.calendar.nightEvent) throw new Error('night/open: there is no night event to open.');
  if (isConfrontation(draft.calendar.nightEvent)) throw new Error('This is not a knock: answer it from its own panel.');
  const entry = draft.calendar.nightEvent;
  // P9d: she took her Want visit
  const relief = entry.kind === WANT_VISIT_KIND ? relieveWant(draft, entry.unitId, TUNING.bonds.want.relief.wantVisit, 'want_visit') : [];
  // P9c: a knower at the door tells a squad secret
  const confession = entry.kind === SECRET_NIGHT_KIND ? confess(draft, ctx, entry.unitId) : [];
  return [{ type: 'night_opened', entry }, ...relief, ...confession];
});

const DOOR_SAY_MAX = 300;
const DOOR_REPLY_MAX = 400;

/** The knock at the door that can still be spoken through: night, an open entry, no scene, not a confrontation. */
function doorKnock(draft: CampaignState, what: string): NightEntry {
  const entry = draft.calendar.nightEvent as NightEntry | undefined;
  if (draft.slot !== 'night' || !entry) throw new Error(`${what}: there is no knock at the door.`);
  if (draft.scene || draft.calendar.pendingScene) throw new Error(`${what}: a scene is open.`);
  if (isConfrontation(entry)) throw new Error('This is not a knock: answer it from its own panel.');
  return entry;
}
const doorText = (v: unknown, max: number): string => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t === '' || t.length > max) throw new Error(`Through the door: 1 to ${max} characters.`);
  return t;
};

// P10b §3: one exchange through the door per knock. Nothing is spent or changed on a relation here: what she answers is read
// for intents separately (`intents/apply`, like a DM), and nothing goes into the DM thread.
registerAction('night/door_say', (draft, payload) => {
  const entry = doorKnock(draft, 'night/door_say');
  if (!isObj(payload)) throw new Error('night/door_say needs { text }');
  if (entry.door !== undefined) throw new Error('night/door_say: something was said through this door already.');
  entry.door = { said: doorText(payload.text, DOOR_SAY_MAX) };
  return [{ type: 'door_said', unitId: entry.unitId }];
});

registerAction('night/door_reply', (draft, payload) => {
  const entry = doorKnock(draft, 'night/door_reply');
  if (!isObj(payload)) throw new Error('night/door_reply needs { text }');
  if (entry.door === undefined) throw new Error('night/door_reply: nothing was said through this door.');
  if (entry.door.reply !== undefined) throw new Error('night/door_reply: she answered already.');
  entry.door.reply = doorText(payload.text, DOOR_REPLY_MAX);
  return [{ type: 'door_replied', unitId: entry.unitId }];
});

registerAction('night/ignore', (draft, _payload, ctx) => {
  const entry = draft.calendar.nightEvent as NightEntry | undefined;
  if (draft.slot !== 'night' || !entry) throw new Error('night/ignore: there is no night event to ignore.');
  if (draft.scene || draft.calendar.pendingScene) throw new Error('night/ignore: a scene is open.');
  if (isConfrontation(entry)) throw new Error('This cannot be ignored: answer it from its own panel.');
  const events: EngineEvent[] = [{ type: 'night_ignored', unitId: entry.unitId, entryId: entry.id }];
  const consequence: EventIntent = {
    type: entry.ignore.event as EventIntent['type'], actor: 'commander', targets: [entry.unitId], severity: entry.ignore.severity,
    evidence: 'ignored the knock', confidence: 1,
  };
  events.push(...applyEventToUnit(draft, ctx.registries, entry.unitId, consequence));
  events.push(...evaluateAutomatic(draft, ctx.registries, entry.unitId));
  events.push(...writeDoorNote(draft, ctx.registries, entry.unitId)); // P10b: an unanswered knock leaves a note under the door
  events.push(...consumeSlots(draft, 1, ctx));
  return events;
});

/** Dispatched by the app after `commander_injured`: lovers, devoted and dependent units come to look in. */
registerAction('relations/commander_injured', (draft, _payload, ctx) => rollNight(draft, ctx.registries, ctx.rng, 'commander_injured'));
