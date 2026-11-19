import { describe, expect, it } from 'vitest';
import { WARDEN_DERIVED } from '../../src/warden/directives';

/** The prefixes older packages reserve for their own directives (the P9b / P9c test keeps the same list). */
const OLDER = [
  'loyalty:', 'refusal:', 'threat:', 'discipline:', 'demand:', 'reputation:', 'nickname', 'content', 'limits:', 'lead', 'boundary:', 'want:', 'rule:',
  'publicity:', 'co_command:', 'ask:', 'prologue:', 'world:', 'stance:', 'friction:', 'personal:', 'special:', 'power:',
];

describe('P13 directive ids', () => {
  it('every one starts with warden: and none starts with a prefix an older package reserves', () => {
    expect(WARDEN_DERIVED.length).toBeGreaterThanOrEqual(5);
    for (const id of WARDEN_DERIVED) {
      expect(id.startsWith('warden:'), id).toBe(true);
      expect(OLDER.some((p) => id.startsWith(p)), id).toBe(false);
    }
    expect(WARDEN_DERIVED).toEqual(expect.arrayContaining(['warden:reveal', 'warden:argue', 'warden:romance', 'warden:warning', 'warden:remote']));
  });
});
