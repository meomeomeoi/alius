// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { focusConfirm } from '../../src/engine/activities';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { activityCard, type OpsTabCtx } from '../../src/ui/ops/opsTab';
import { loadCore } from '../helpers/world';
import { specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const card = (trait?: 'secret_frequency') => {
  const s = specialCampaign(reg, trait);
  s.base.facilities.medbay = 1;
  s.slot = 'morning';
  return activityCard(reg.activities.get('medbay')!, s, { registries: reg, settings: DEFAULT_SETTINGS, onDo: () => {} } as unknown as OpsTabCtx);
};
const options = (el: HTMLElement) => [...el.querySelectorAll<HTMLOptionElement>('select[name="focus"] option')].map((o) => o.value);

describe('the medbay focus that burns the frequency implant (P12)', () => {
  it('is listed only to a commander with the frequency', () => {
    expect(options(card('secret_frequency'))).toContain('burn_implant');
    expect(options(card())).not.toContain('burn_implant');
    expect(options(card())).toEqual(['units', 'commander']);
  });

  it('asks first: the focus carries its question, an ordinary one carries none', () => {
    expect(focusConfirm(reg, { activityId: 'medbay', focus: 'burn_implant' })).toMatch(/Burn out the frequency implant\?/);
    expect(focusConfirm(reg, { activityId: 'medbay', focus: 'commander' })).toBeNull();
    expect(focusConfirm(reg, { activityId: 'medbay', companionId: 'unit_ann' })).toBeNull();
    expect(focusConfirm(reg, { activityId: 'rest' })).toBeNull();
  });
});
