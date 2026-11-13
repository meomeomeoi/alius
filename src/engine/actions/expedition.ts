import { readRoutePick } from '../commander/checks';
import { registerAction } from '../dispatch';
import {
  checkExpedition, chooseOption, cleanRecap, moveTo, resolveCombat, retreatFromExpedition, returnFromExpedition, setFormation, startExpedition, treat, type StartExpedition, type TreatKind,
} from '../world/expedition';

// Importing this module registers the expedition actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

function readFormation(v: unknown): { front: string[]; back: string[] } {
  const front = isObj(v) ? strList(v.front) : null;
  const back = isObj(v) ? strList(v.back) : null;
  if (!front || !back) throw new Error('A formation needs { front: string[], back: string[] }.');
  return { front, back };
}

registerAction('expedition/start', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('expedition/start needs a payload.');
  const unitIds = strList(payload.unitIds);
  if (!unitIds) throw new Error('expedition/start needs { unitIds: string[] }.');
  const p: StartExpedition = { unitIds, formation: readFormation(payload.formation), supplies: payload.supplies as number };
  if (typeof payload.missionId === 'string') p.missionId = payload.missionId;
  if (isObj(payload.poi) && typeof payload.poi.regionId === 'string' && typeof payload.poi.poiId === 'string') {
    p.poi = { regionId: payload.poi.regionId, poiId: payload.poi.poiId };
  }
  const problem = checkExpedition(draft, ctx.registries, p);
  if (problem) throw new Error(problem);
  return startExpedition(draft, ctx, p);
});

registerAction('expedition/move', (draft, payload, ctx) => {
  const nodeId = isObj(payload) ? payload.nodeId : undefined;
  if (typeof nodeId !== 'string') throw new Error('expedition/move needs { nodeId }.');
  return moveTo(draft, ctx, nodeId);
});

registerAction('expedition/set_formation', (draft, payload) => {
  setFormation(draft, readFormation(isObj(payload) ? payload.formation : undefined));
  return [];
});

registerAction('expedition/treat', (draft, payload, ctx) => {
  const unitId = isObj(payload) ? payload.unitId : undefined;
  const kind = isObj(payload) ? payload.kind : undefined;
  if (typeof unitId !== 'string' || typeof kind !== 'string') throw new Error('expedition/treat needs { unitId, kind }.');
  return treat(draft, ctx, unitId, kind as TreatKind);
});

registerAction('expedition/resolve_combat', (draft, _payload, ctx) => resolveCombat(draft, ctx));

registerAction('expedition/choose', (draft, payload, ctx) => {
  const option = isObj(payload) ? payload.option : undefined;
  if (typeof option !== 'number') throw new Error('expedition/choose needs { option }.');
  return chooseOption(draft, ctx, option, readRoutePick(isObj(payload) ? payload.route : undefined));
});

registerAction('expedition/return', (draft, _payload, ctx) => returnFromExpedition(draft, ctx));

registerAction('expedition/retreat', (draft, _payload, ctx) => retreatFromExpedition(draft, ctx));

registerAction('expedition/ack_report', (draft) => {
  if (!draft.lastExpedition) throw new Error('There is no report.');
  draft.lastExpedition.acknowledged = true;
  return [];
});

registerAction('expedition/mark_debriefed', (draft) => {
  if (!draft.lastExpedition) throw new Error('There is no report.');
  draft.lastExpedition.debriefed = true;
  return [];
});

/** The main model's narrative recap, stored on the report it belongs to (a late answer for an older report is refused). */
registerAction('expedition/set_recap', (draft, payload) => {
  const reportId = isObj(payload) ? payload.reportId : undefined;
  if (!draft.lastExpedition || reportId !== draft.lastExpedition.id) throw new Error('That report is no longer the last one.');
  const text = cleanRecap(isObj(payload) ? payload.text : undefined);
  if (text === '') throw new Error('The recap is empty.');
  draft.lastExpedition.recap = text;
  return [{ type: 'expedition_recap_set', reportId }];
});
