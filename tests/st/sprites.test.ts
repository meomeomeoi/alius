import { describe, it, expect } from 'vitest';
import { spriteFolder, pickSprite } from '../../src/st/sprites';

describe('sprites', () => {
  it('override path wins', () => {
    expect(spriteFolder('rhea.png', 'Rhea', [{ name: 'rhea', path: 'rhea_alt' }])).toBe('rhea_alt');
  });

  it('no override uses the name', () => {
    expect(spriteFolder('rhea.png', 'Rhea', [])).toBe('Rhea');
    expect(spriteFolder('rhea.png', 'Rhea', 'garbage')).toBe('Rhea');
  });

  it('pickSprite finds neutral', () => {
    const list = [{ label: 'joy', path: '/a/joy.png' }, { label: 'neutral', path: '/a/n.png' }];
    expect(pickSprite(list, 'neutral')).toBe('/a/n.png');
    expect(pickSprite(list, 'anger')).toBeNull();
  });

  it('pickSprite on garbage is null', () => {
    expect(pickSprite(null, 'neutral')).toBeNull();
    expect(pickSprite({}, 'neutral')).toBeNull();
    expect(pickSprite([{ label: 1 }], 'neutral')).toBeNull();
  });
});
