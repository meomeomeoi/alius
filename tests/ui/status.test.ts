// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createCampaign } from '../../src/engine/state/create';
import { renderStatusHeader } from '../../src/ui/shell/status';
import { h } from '../../src/ui/dom';

afterEach(() => {
  document.body.innerHTML = '';
});

const render = (state: ReturnType<typeof createCampaign> | null) => {
  const host = h('div');
  document.body.append(host);
  renderStatusHeader(host, state);
  return host;
};
const campaign = () => {
  const s = createCampaign({ seed: 1, commanderName: 'Vale' });
  s.day = 12;
  s.slot = 'evening';
  s.resources = { credits: 120, supplies: 8, plyx: 3 };
  return s;
};

describe('status header', () => {
  it('shows day, slot and resources', () => {
    const t = render(campaign()).textContent!;
    expect(t).toContain('DAY 012 // EVENING');
    expect(t).toContain('CR 120');
    expect(t).toContain('SUP 8');
    expect(t).toContain('PLYX 3');
  });

  it('shows leash authorizations', () => {
    const s = campaign();
    s.leash.authorizationsLeft = 2;
    expect(render(s).textContent).toContain('LEASH 2');
  });

  it('shows the commander injury while it lasts', () => {
    const s = campaign();
    expect(render(s).textContent).not.toContain('INJURED');
    s.commander.injuredUntilDay = 15;
    expect(render(s).textContent).toContain('INJURED 3d');
    s.commander.injuredUntilDay = 12;
    expect(render(s).textContent).not.toContain('INJURED');
  });

  it('supply shortage is flagged', () => {
    const s = campaign();
    s.calendar.shortageStreak = 2;
    expect(render(s).querySelector('.alius-warn')?.textContent).toContain('SHORTAGE 2d');
  });

  it('no campaign', () => {
    expect(render(null).textContent).toContain('NO CAMPAIGN');
  });

  it('rendering twice replaces the content instead of stacking it', () => {
    const host = render(campaign());
    renderStatusHeader(host, campaign());
    expect(host.querySelectorAll('.alius-clock')).toHaveLength(1);
  });
});

describe('status header, quiet night (P7)', () => {
  it('the shell renders a quiet night', () => {
    const s = campaign();
    s.slot = 'night';
    expect(render(s).textContent).toContain('DAY 012 // NIGHT — QUIET');
  });
  it('a night with a knock is a plain NIGHT', () => {
    const s = campaign();
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: 'unit_ann', kind: 'talk', priority: 1, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 20 };
    const t = render(s).textContent!;
    expect(t).toContain('DAY 012 // NIGHT');
    expect(t).not.toContain('QUIET');
  });
});
