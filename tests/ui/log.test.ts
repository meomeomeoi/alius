// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { h } from '../../src/ui/dom';
import { renderLogTab } from '../../src/ui/log/logTab';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('LOG tab', () => {
  it('forum order and headings: weeks, then days, then scene lines, newest first', () => {
    const s = campaign(reg, 4);
    s.memory.chronicle = [
      { id: 'c1', kind: 'week', day: 1, toDay: 7, text: 'Week one summary.' },
      { id: 'c2', kind: 'week', day: 8, toDay: 14, text: 'Week two summary.' },
      { id: 'c3', kind: 'day', day: 15, text: 'Day 15 summary.' },
      { id: 'c4', kind: 'day', day: 16, text: 'Day 16 summary.' },
      { id: 'c5', kind: 'scene', day: 17, slot: 'morning', text: 'Early talk.' },
      { id: 'c6', kind: 'scene', day: 17, slot: 'evening', text: 'Late talk.' },
    ];
    const host = h('div');
    document.body.append(host);
    renderLogTab(host, { getState: () => s });
    expect(host.querySelector('h2')!.textContent).toContain('CCP INCIDENT LOG');
    const posts = [...host.querySelectorAll('.alius-post')];
    expect(posts.map((p) => p.querySelector('.alius-post-head')!.textContent)).toEqual([
      'DAYS 008–014 // WEEK', 'DAYS 001–007 // WEEK', 'DAY 016 // SUMMARY', 'DAY 015 // SUMMARY', 'DAY 017 // EVENING', 'DAY 017 // MORNING',
    ]);
    expect(posts.map((p) => p.querySelector('.alius-post-text')!.textContent)).toEqual([
      'Week two summary.', 'Week one summary.', 'Day 16 summary.', 'Day 15 summary.', 'Late talk.', 'Early talk.',
    ]);
  });

  it('entry text is not HTML', () => {
    const s = campaign(reg, 4);
    s.memory.chronicle = [{ id: 'c1', kind: 'scene', day: 1, text: '<img src=x onerror=alert(1)><script>1</script>' }];
    const host = h('div');
    document.body.append(host);
    renderLogTab(host, { getState: () => s });
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('.alius-post-text')!.textContent).toContain('<img');
  });

  it('a scene line without a slot shows only the day; an empty log and no campaign say so', () => {
    const s = campaign(reg, 4);
    s.memory.chronicle = [{ id: 'c1', kind: 'scene', day: 2, text: 'x' }];
    const host = h('div');
    document.body.append(host);
    renderLogTab(host, { getState: () => s });
    expect(host.querySelector('.alius-post-head')!.textContent).toBe('DAY 002');
    s.memory.chronicle = [];
    renderLogTab(host, { getState: () => s });
    expect(host.textContent).toMatch(/NO ENTRIES/);
    renderLogTab(host, { getState: () => null });
    expect(host.textContent).toMatch(/NO ACTIVE CAMPAIGN/);
  });
});
