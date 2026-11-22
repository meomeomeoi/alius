// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import { buildKnowledge, resetKnowledgeRules } from '../../../src/analysis/knowledge';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { bodyMapFor, renderBodyMap } from '../../../src/ui/dynamic/bodyMap';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderCmdrCard } from '../../../src/ui/commander/cmdrCard';
import { h } from '../../../src/ui/dom';
import { dynamicNotices } from '../../../src/ui/dynamic/notices';
import { tonightItems } from '../../../src/ui/hub/model';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { hiddenFixture } from '../../fixtures/analyze/hidden';
import { leaks } from '../../helpers/analyze';
import { loadCore } from '../../helpers/world';
import { plainDraft } from '../../../src/content/draft';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  resetKnowledgeRules();
});

const DECIMALS = [37.37, 61.61, 59.59, 0.4141, 23.23, 7.77, 44.44];
const TEXTS = ['SENTINEL_COMPROMAT_P15', 'SENTINEL_TELL', 'SENTINEL_WORSHIP_HOW', 'SENTINEL_KNOWLEDGE_P15'];

/** Every screen the dynamic draws from what it keeps, as one text. */
function screens(over: Partial<AliusSettings>): string {
  const { state, unitId } = hiddenFixture(reg);
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const squad = h('div');
  const cmdr = h('div');
  const map = h('div');
  document.body.append(squad, cmdr, map);
  renderSquadTab(squad, {
    st, getState: () => state, getLoad: () => ({ kind: 'ok', state, chatId: 'c' }), registries: reg, settings: () => settings,
    onNewCampaign: vi.fn(), onPunish: vi.fn(), onLeash: vi.fn(),
  } as never);
  renderCmdrCard(cmdr, { state, registries: reg, raw: settings.showRawValues });
  renderBodyMap(map, bodyMapFor(state, reg, buildKnowledge(state, settings), unitId, false));
  const tonight = tonightItems(state, reg).map((i) => i.text).join('\n');
  const notices = JSON.stringify(dynamicNotices([
    { type: 'frame_changed', unitId, from: 'equal', to: 'play', milestoneId: 'first_yes' }, { type: 'aftermath_started', unitId, id: 'da1', kind: 'grief' },
    { type: 'domain_lost', unitId, domainId: 'device', reason: 'band' }, { type: 'sworn', unitId, day: 8 }, { type: 'leash_blocked', unitId: state.squad[1].id, holderId: unitId, kind: 'compel' },
    { type: 'compromat_revealed', unitId, factId: 'fr1' }, { type: 'compromat_told', unitId, factId: 'fr1', audience: 'squad' }, { type: 'oversight_inquiry', stage: 'transfer_threat', unitId },
  ], state, reg, { hidden: settings.dynamicHidden }));
  return [squad.textContent, cmdr.textContent, map.textContent, tonight, notices, [...document.querySelectorAll('[aria-label],[title]')].map((e) => `${e.getAttribute('aria-label')} ${e.getAttribute('title')}`).join('\n')].join('\n');
}

describe('what the dynamic keeps never reaches a screen, a label or a toast', () => {
  it('the screens are not vacuous: her section, the CMDR line and the notices are there', () => {
    const text = screens({});
    expect(text).toContain('HOLD'); // her section
    expect(text).toContain('TESTING'); // the band, as a word
    expect(text).toContain('Held by Ann'); // the CMDR line
    expect(text).toContain(plainDraft(String(reg.dynamicMilestones.get('first_yes')!.text)).replaceAll('{name}', 'Ann')); // her notice
  });

  for (const [raw, hidden] of [[false, false], [true, false], [false, true], [true, true]] as const) {
    it(`no sentinel text or decimal appears (raw values ${raw ? 'on' : 'off'}, immersive ${hidden ? 'on' : 'off'})`, () => {
      const text = screens({ showRawValues: raw, dynamicHidden: hidden });
      expect(leaks(text, { numbers: [], texts: TEXTS })).toEqual([]);
      for (const d of DECIMALS) expect(text, String(d)).not.toContain(String(d));
      if (hidden) expect(text).not.toContain('TESTING'); // immersive: no band on a screen
      if (!raw) expect(text).not.toContain('(37)'); // the hold's whole number only with raw values
    });
  }
});
