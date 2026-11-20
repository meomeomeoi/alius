import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The `social` line is shown on the defect card ("Social: …") and sent to the main model in scenes: player text, not designer notes.
const defects = JSON.parse(readFileSync('content/core/defects.json', 'utf8')) as Array<{ id: string; social: string }>;

describe('defect social lines are player text', () => {
  it('no raw ids, no notes about the player or the design', () => {
    for (const d of defects) {
      const text = d.social.replace(/^AUTHOR TO WRITE:\s*/, '');
      expect(text, d.id).not.toMatch(/\b[a-z]+_[a-z_]+\b/); // a snake_case id
      expect(text, d.id).not.toMatch(/\bthe player\b|\bmoral trap\b|\bfeeds the \w+ state\b|\(liquidation\)/i);
    }
  });
});
