/** `████░░░░░░`: `value` of `max` as filled blocks (rounded), `width` cells wide. */
export function bar(value: number, max: number, width = 10): string {
  const v = Math.min(max, Math.max(0, value));
  const filled = max > 0 ? Math.round((width * v) / max) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const GLYPHS: Record<string, string> = {
  bleed: 'BLD', burn: 'BRN', stun: 'STN', mark: 'MRK', guard: 'GRD', taunt: 'TNT', corrode: 'CRD', infect: 'INF',
  overheat: 'OVH', shield: 'SHD', hold_line: 'HLD', authorized: 'AUT', untargetable: 'UNT', focus: 'FOC',
};

/** A short tag for a status: `BLD`, `BLD×2` for stacks; unknown ids show their first three letters. */
export function statusGlyph(id: string, stacks = 1): string {
  const g = GLYPHS[id] ?? id.slice(0, 3).toUpperCase();
  return stacks > 1 ? `${g}×${stacks}` : g;
}
