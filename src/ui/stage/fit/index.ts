import { SLOT_INFO, type SlotKey } from '../slots';
import { activityPanel } from './activity';
import type { FitPanel } from './panel';
import { shoePanel } from './shoe';
import { slapPanel } from './slap';
import { thronePanel } from './throne';
import { weightPanel } from './weight';

/** P10e-f: the panel of each prototype, by file. */
const PANELS: Readonly<Record<string, FitPanel>> = Object.fromEntries([weightPanel, activityPanel, thronePanel, shoePanel, slapPanel].map((p) => [p.prototype, p]));
/** The panel of a slot's prototype (`SLOT_INFO[key].prototype`). */
export const panelOf = (key: SlotKey): FitPanel => PANELS[SLOT_INFO[key].prototype] ?? slapPanel;
