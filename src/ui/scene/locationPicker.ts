import type { Registries } from '../../content/types';
import { isLiving } from '../../engine/economy';
import type { CampaignState, Unit } from '../../engine/state/types';
import { h } from '../dom';
import type { ModalOpts } from '../shell/modal';

export interface PickCtx {
  registries: Registries;
  state: CampaignState;
  /** The unit the commander is talking to; always a participant. */
  firstUnitId: string;
  candidates: Unit[];
}

export const MAX_PARTICIPANTS = 3;

/**
 * Asks where the scene takes place and who else joins (up to two more named, living units). Offers only the locations that
 * exist in the current slot. Resolves null when the player cancels.
 */
export async function pickLocation(
  modal: (o: ModalOpts) => Promise<string | null>, ctx: PickCtx,
): Promise<{ locationId: string; participants: string[] } | null> {
  const first = ctx.state.squad.find((u) => u.id === ctx.firstUnitId);
  const locations = [...ctx.registries.locations.values()].filter((l) => !(l.slots as string[] | undefined) || (l.slots as string[]).includes(ctx.state.slot));
  const extras = ctx.candidates.filter((u) => u.id !== ctx.firstUnitId && u.kind === 'named' && isLiving(u));

  const radios = locations.map((l, i) => {
    const radio = h('input', { type: 'radio', name: 'location', value: l.id, checked: i === 0 }) as HTMLInputElement;
    const name = l.perUnit === true && first ? `${first.displayName}'s quarters` : String(l.name);
    return h('label', { class: 'alius-check', 'data-location': l.id }, radio, ` ${name} — ${String(l.summary)}`);
  });
  const boxes = extras.map((u) => h('input', { type: 'checkbox', name: 'extra', value: u.id }) as HTMLInputElement);
  const limit = (): void => {
    const picked = boxes.filter((b) => b.checked).length;
    for (const b of boxes) b.disabled = !b.checked && picked >= MAX_PARTICIPANTS - 1;
  };
  for (const b of boxes) b.addEventListener('change', limit);

  const body = h('div', { class: 'alius-location-picker' },
    h('p', {}, `Where do you talk${first ? ` with ${first.displayName}` : ''}?`),
    ...radios,
    ...(extras.length > 0
      ? [h('p', {}, `Bring someone along? (up to ${MAX_PARTICIPANTS - 1} more)`), ...extras.map((u, i) => h('label', { class: 'alius-check' }, boxes[i], ` ${u.displayName}`))]
      : []),
  );
  const answer = await modal({ title: 'Start a conversation', body, actions: [{ label: 'Begin', value: 'ok' }, { label: 'Cancel', value: 'cancel' }] });
  if (answer !== 'ok') return null;
  const picked = (radios.map((r) => r.querySelector('input') as HTMLInputElement).find((r) => r.checked) ?? { value: locations[0]?.id }).value;
  if (!picked) return null;
  const extraIds = boxes.filter((b) => b.checked).map((b) => b.value).slice(0, MAX_PARTICIPANTS - 1);
  return { locationId: picked, participants: [ctx.firstUnitId, ...extraIds] };
}
