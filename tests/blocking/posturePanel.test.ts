import { describe, expect, it, vi } from 'vitest';
import { createStaging } from '../../src/blocking/controller';
import type { Action } from '../../src/engine/dispatch';

/** P16b Task 23: the game of postures' reports go straight to the engine (`posture/correct`, `posture/slip`, `posture/end`), never staged; nothing after a reset. */
function make() {
  const dispatch = vi.fn((_a: Action, _o?: { expectChatId?: string }) => [{ type: 'posture_corrected', seen: true }]);
  const staging = createStaging({
    app: { dispatch, current: () => ({ state: null, load: { chatId: 'c1' } }) } as never, registries: () => ({}) as never, settings: () => ({}) as never,
    generations: { bind: () => undefined, generate: async () => 'ok' } as never, scene: { replyPending: () => false, end: async () => {} }, now: () => 0, toast: vi.fn(),
  });
  return { staging, dispatch };
}

describe('the staging controller: the posture reports', () => {
  it('dispatch the engine\'s actions for the chat that is open', () => {
    const { staging, dispatch } = make();
    expect(staging.postureCorrect({ point: 'arms', amount: 61.5, attention: 'watching', beat: 3 })).toEqual([{ type: 'posture_corrected', seen: true }]);
    staging.postureSlip('gaze');
    staging.postureEnd('released', 40);
    staging.postureEnd('released', undefined);
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'posture/correct', payload: { point: 'arms', amount: 61.5, attention: 'watching', beat: 3 } },
      { type: 'posture/slip', payload: { point: 'gaze' } },
      { type: 'posture/end', payload: { reason: 'released', beats: 40 } },
      { type: 'posture/end', payload: { reason: 'released' } },
    ]);
    expect(dispatch.mock.calls.every((c) => c[1]?.expectChatId === 'c1')).toBe(true);
  });

  it('say nothing after a reset (a chat switch)', () => {
    const { staging, dispatch } = make();
    staging.reset();
    expect(staging.postureCorrect({ point: 'arms', amount: 50, attention: 'busy', beat: 1 })).toEqual([]);
    expect(staging.postureSlip('arms')).toEqual([]);
    expect(staging.postureEnd('released', 3)).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
