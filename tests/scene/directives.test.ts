import { describe, expect, it } from 'vitest';
import { nightDirective, proposalDirective, proposalDirectiveText, snapDirective } from '../../src/scene/directives';

describe('proposal directives', () => {
  it('receptive', () => {
    expect(proposalDirectiveText('Rhea', 'date', { receptive: true })).toBe(
      "Rhea is receptive to the commander's proposal (date). Play her accepting it in her own way.",
    );
  });
  it.each([
    ['too_soon', 'too soon'],
    ['no_trust', 'she does not trust him enough'],
    ['not_interested', 'she is not interested'],
    ['committed', 'he is already committed to someone else'],
  ] as const)('declining for %s', (reason, text) => {
    const t = proposalDirectiveText('Rhea', 'fwb', { receptive: false, reason });
    expect(t).toContain("Rhea DECLINES the commander's proposal (fwb).");
    expect(t).toContain(`Reason: ${text}.`);
    expect(t).toContain('She will not be talked into it this scene.');
  });
  it('underscores in the kind become spaces; an unavailable proposal is never entertained', () => {
    expect(proposalDirectiveText('Rhea', 'friendship_deepen', { receptive: true })).toContain('(friendship deepen)');
    expect(proposalDirectiveText('Rhea', 'date', { receptive: false, reason: 'unavailable' })).toContain('DECLINES');
  });
  it('the directive entry lasts one reply and is keyed by unit', () => {
    expect(proposalDirective('unit_ann', 'Ann', 'date', { receptive: true })).toEqual({
      id: 'proposal:unit_ann', expiresAfter: 'next_reply', text: proposalDirectiveText('Ann', 'date', { receptive: true }),
    });
  });
});

describe('night and snap directives', () => {
  it('night lasts the scene and carries the framing', () => {
    const d = nightDirective('Ann', 'Ann knocks on your door, late.');
    expect(d).toMatchObject({ id: 'night', expiresAfter: 'scene' });
    expect(d.text).toContain('Ann knocks on your door, late.');
  });
  it('snap names the unit', () => {
    expect(snapDirective('Ann')).toMatch(/^Ann: /);
    expect(snapDirective('Ann')).toMatch(/too many messages/);
  });
});
