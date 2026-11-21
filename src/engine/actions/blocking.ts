import { blockingLive, setBlocking, type BlockingChange } from '../blocking';
import { registerWithdrawal } from '../bonds/content';
import { stripTagged } from '../blocking/blocking';
import { registerAction } from '../dispatch';

// Importing this module registers `blocking/set` (P15a) and lets a switched-off content category strip the blocking quietly.

registerWithdrawal(stripTagged);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** `blocking/set { person, field, value?, relTo?, with?, direction?, slot?, target?, at }`: a chip's change (the reading's come inside `intents/apply`). Draws no rng. */
registerAction('blocking/set', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('blocking/set needs a payload');
  if (!draft.scene) throw new Error('blocking/set: no scene is open');
  if (!blockingLive(draft, ctx.registries)) throw new Error('blocking/set: the blocking is not live in this scene');
  const at = payload.at;
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0) throw new Error('blocking/set: at must be a non-negative integer (the chat index)');
  const person = str(payload.person);
  const field = str(payload.field);
  if (person === undefined || field === undefined) throw new Error('blocking/set needs { person, field }');
  const direction = payload.direction;
  if (direction !== undefined && direction !== 'from' && direction !== 'to') throw new Error('blocking/set: direction is "from" or "to"');
  const change: BlockingChange = {
    person, field: field as BlockingChange['field'],
    ...(str(payload.value) !== undefined ? { value: str(payload.value) } : {}),
    ...(str(payload.relTo) !== undefined ? { relTo: str(payload.relTo) } : {}),
    ...(str(payload.with) !== undefined ? { with: str(payload.with) } : {}),
    ...(direction !== undefined ? { direction } : {}),
    ...(str(payload.slot) !== undefined ? { slot: str(payload.slot) } : {}),
    ...(str(payload.target) !== undefined ? { target: str(payload.target) } : {}),
  };
  return setBlocking(draft, ctx, change, { at, source: 'chip' });
});
