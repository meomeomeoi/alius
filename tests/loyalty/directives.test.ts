import { describe, expect, it } from 'vitest';
import {
  aftermathDirective, bandDirective, compelFailedDirective, compelledDirective, refusalDirective, traumaDirective,
} from '../../src/loyalty/directives';

describe('loyalty directives: exact texts', () => {
  it('refusal', () => {
    expect(refusalDirective('unit_ann', 'Ann', 'she openly doubts the commander\'s authority')).toEqual({
      id: 'refusal:unit_ann', expiresAfter: 'scene',
      text: "Ann REFUSES the commander's order this scene. Reason: she openly doubts the commander's authority. She will not comply under persuasion; only the Leash can force her.",
    });
  });

  it('compelled replaces the refusal for the next reply, a failed burst says so for the scene', () => {
    expect(compelledDirective('unit_ann', 'Ann')).toEqual({
      id: 'refusal:unit_ann', expiresAfter: 'next_reply',
      text: 'Ann has just been COMPELLED through the Leash: she carries out the order against her will. She knows exactly who filed the request.',
    });
    expect(compelFailedDirective('unit_ann', 'Ann')).toEqual({
      id: 'refusal:unit_ann', expiresAfter: 'scene',
      text: 'The Leash burst FAILED on Ann: she felt it, shook it off, and still refuses.',
    });
  });

  it('trauma and band', () => {
    expect(traumaDirective('unit_ann', 'Ann')).toEqual({
      id: 'leash_trauma:unit_ann', expiresAfter: 'scene', text: 'Ann remembers being forced through the Leash; she will not pretend otherwise.',
    });
    expect(bandDirective('unit_ann', 'Ann', 'wavering')).toEqual({
      id: 'loyalty:unit_ann', expiresAfter: 'scene', text: 'Ann openly doubts the commander in this scene; she questions the commander\'s decisions aloud.',
    });
    expect(bandDirective('unit_ann', 'Ann', 'breaking')!.text).toBe(
      'Ann is close to leaving the unit: she is cold and watchful, and if pressed she says she is thinking of going.',
    );
    expect(bandDirective('unit_ann', 'Ann', 'steady')).toBeNull();
  });

  it('aftermath', () => {
    expect(aftermathDirective('The evidence', 'Bury it')).toEqual({
      id: 'dilemma', expiresAfter: 'next_reply',
      text: 'The commander has just decided "The evidence": Bury it. Narrate the immediate aftermath; the decision is final and cannot be talked back.',
    });
    expect(aftermathDirective('T', 'L', 'scene').expiresAfter).toBe('scene');
  });
});
