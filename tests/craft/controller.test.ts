/**
 * P16b Task 18: the craft controller opens the sparring hold's scene. A `headlock_offered` event (the hook after a bout she won) opens a short scene at the training yard with her alone,
 * without a slot (the bout spent it), and then dispatches `craft/headlock_start`. It does nothing without a mark for today, with a scene already open, or without the app's scene and dispatch.
 */
import { describe, expect, it, vi } from 'vitest';
import { createCraft } from '../../src/craft/controller';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';

const ANN = 'unit_ann';
const stateWith = (over: { mark?: boolean; scene?: boolean } = {}): CampaignState =>
  ({ day: 4, scene: over.scene === true ? { id: 's1' } : undefined, relations: { [ANN]: { craft: over.mark === false ? {} : { headlock: { day: 4, witnesses: [] } } } } }) as unknown as CampaignState;
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function build(state: CampaignState | null, over: Partial<Parameters<typeof createCraft>[0]> = {}) {
  const calls: string[] = [];
  const startScene = vi.fn(async () => { calls.push('startScene'); return true; });
  const dispatch = vi.fn((a: { type: string }) => { calls.push(a.type); return [] as never[]; });
  const toast = vi.fn();
  const refreshContext = vi.fn();
  const c = createCraft({ context: new ContextBuilder(), refreshContext, state: () => state, dispatch: dispatch as never, chatId: () => 'chat-1', startScene, toast, ...over });
  return { c, startScene, dispatch, toast, refreshContext, calls };
}
const offered = { type: 'headlock_offered', unitId: ANN, locationId: 'training_yard' };

describe('the sparring hold\'s scene', () => {
  it('opens the scene at the yard with her alone and no slot, then starts the hold, with the chat checked', async () => {
    const t = build(stateWith());
    t.c.onEvents([offered]);
    expect(t.startScene).not.toHaveBeenCalled(); // deferred until the dispatch that offered it has settled
    await flush();
    expect(t.startScene).toHaveBeenCalledWith({ locationId: 'training_yard', participants: [ANN], origin: 'event', consumesSlot: false });
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'craft/headlock_start', payload: { unitId: ANN } }, { expectChatId: 'chat-1' });
    expect(t.calls).toEqual(['startScene', 'craft/headlock_start']);
  });

  it('does nothing without a mark for her today, with a scene open, with no campaign, or without the app\'s scene and dispatch', async () => {
    const cases = [build(stateWith({ mark: false })), build(stateWith({ scene: true })), build(null)];
    for (const t of cases) {
      t.c.onEvents([offered]);
      await flush();
      expect(t.startScene).not.toHaveBeenCalled();
      expect(t.dispatch).not.toHaveBeenCalled();
    }
    for (const t of [build(stateWith(), { startScene: undefined }), build(stateWith(), { dispatch: undefined })]) {
      t.c.onEvents([offered]);
      await flush();
      expect(t.dispatch).not.toHaveBeenCalled();
    }
  });

  it('a scene that did not open says so and starts no hold; a refused hold toasts its reason', async () => {
    const failing = build(stateWith(), { startScene: vi.fn(async () => false) });
    failing.c.onEvents([offered]);
    await flush();
    expect(failing.toast).toHaveBeenCalledWith('warn', 'The scene did not open.');
    expect(failing.dispatch).not.toHaveBeenCalled();
    const refused = build(stateWith(), { dispatch: vi.fn(() => [{ type: 'error', message: 'No hold waiting.' }]) as never });
    refused.c.onEvents([offered]);
    await flush();
    expect(refused.toast).toHaveBeenCalledWith('warn', 'No hold waiting.');
  });

  it('any other event does not open anything, and an event with no place is ignored', async () => {
    const t = build(stateWith());
    t.c.onEvents([{ type: 'wager_resolved' }, { type: 'headlock_offered', unitId: ANN }]);
    await flush();
    expect(t.startScene).not.toHaveBeenCalled();
  });
});
