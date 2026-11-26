/**
 * P10e-e: importing this module registers every instrument with the host (`host.ts`), in the order below (the first that matches a run
 * wins). Chunks e3–e11 add one import line each.
 */
export { instrumentFor, registerInstrument, syncInstruments, unmountInstruments } from './host';
import './breath/breath';
import './weight/weight';
import './scent/scent';
import './jaw/jaw';
import './activity/frame';
import './shoe/shoe';
import './gulp/gulp';
export type { HerLook, InstrumentDef, InstrumentEnv, InstrumentRun } from './types';
