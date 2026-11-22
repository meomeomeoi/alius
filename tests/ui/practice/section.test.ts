// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import '../../../src/engine/actions/practice';
import { buildKnowledge } from '../../../src/analysis/knowledge';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { renderDynamicSection, resetDynamicSection } from '../../../src/ui/dynamic/section';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; resetDynamicSection(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Words only she wrote.', summary: 'fetch the roster',
  status: 'open', acceptForm: 'button_cost', day: 19, ...over,
});

/** Ann holds at role with a hold of 30; the commander has open tasks, a routine, a posture she named and her favour is `favour`. */
function holding(over: { tasks?: Task[]; favour?: number } = {}): CampaignState {
  const s = withService(world(reg, 'role'));
  s.practices = { ...blankPractices(), seq: 9, tasks: over.tasks ?? [task()], postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'the post', day: 18 }] } };
  dynamicOf(s, ANN)!.favour = over.favour ?? 11.11;
  return s;
}
function section(s: CampaignState, over: Partial<AliusSettings> = {}): { host: HTMLElement; drawn: boolean; env: AnalyzeEnv } {
  const settings = { ...DEFAULT_SETTINGS, ...over } as AliusSettings;
  const host = h('div');
  document.body.append(host);
  const drawn = renderDynamicSection(host, { state: s, reg, unitId: ANN, knowledge: buildKnowledge(s, settings), hidden: settings.dynamicHidden === true });
  return { host, drawn, env: { state: s, registries: reg, settings } as unknown as AnalyzeEnv };
}
const block = (host: HTMLElement): HTMLElement | null => host.querySelector<HTMLElement>('[data-practices-block]');

describe('the PRACTICES block of her DYNAMIC section', () => {
  it('lists her open tasks by summary with the accept form as words, a day word for the deadline and "until she decides" for a hidden one', () => {
    const s = holding({ tasks: [
      task({ id: 'pt1', deadline: { day: 21, slot: 'evening' } }),
      task({ id: 'pt2', summary: 'wear the token', acceptForm: 'words', stakes: 'major', noDuration: true, deadline: { day: 24 } }),
      task({ id: 'pt3', summary: 'stay out of the armory', acceptForm: 'signed', stakes: 'severe', deadline: { day: 20 } }),
      task({ id: 'pt4', status: 'offered', summary: 'not accepted yet' }),
      task({ id: 'pt5', status: 'offered', sealed: true, acceptForm: 'sealed', summary: 'SENTINEL_SEALED_SUMMARY', text: 'SENTINEL_SEALED_TEXT' }),
      task({ id: 'pt6', status: 'kept', summary: 'already done' }),
    ] });
    const { host } = section(s);
    const rows = [...host.querySelectorAll<HTMLElement>('[data-practice-task]')];
    expect(rows.map((r) => r.getAttribute('data-practice-task'))).toEqual(['pt1', 'pt2', 'pt3', 'pt4', 'pt5']);
    const text = (id: string) => rows.find((r) => r.getAttribute('data-practice-task') === id)!.textContent!;
    expect(text('pt1')).toContain('fetch the roster');
    expect(text('pt1')).toMatch(/in two days, in the evening|evening/i);
    expect(text('pt1')).toMatch(/on a button/i);
    expect(text('pt2')).toMatch(/until she decides/i);
    expect(text('pt2')).not.toMatch(/\d/);
    expect(text('pt2')).toMatch(/in words/i);
    expect(text('pt3')).toMatch(/words and a signature/i);
    expect(text('pt3')).toMatch(/today/i);
    expect(text('pt5')).toMatch(/sealed/i);
    expect(host.textContent).not.toMatch(/SENTINEL_SEALED|Words only she wrote/);
  });

  it('shows her protocol and routine, her favour as a word, and the names she gave her postures', () => {
    const s = holding({ tasks: [task({ id: 'pt3', routine: true, summary: 'her morning routine' })] });
    s.relations[ANN].stateId = 'lover';
    dynamicOf(s, ANN)!.domains = [{ id: 'others', since: s.day }, { id: 'household', since: s.day }];
    s.bonds = { ...(s.bonds ?? { rules: [] }), rules: [{ id: 'r1', unitId: ANN, templateId: [...reg.relationshipRuleTemplates.values()].find((t) => (t as { contentTags?: string[] }).contentTags?.includes('service'))!.id, text: 'Stand when I come in.', status: 'active', day: 19, brokenCount: 0 }] } as never;
    const { host } = section(s);
    expect(host.querySelector('[data-practice-protocol]')!.textContent).toContain('Stand when I come in');
    expect(host.querySelector('[data-practice-routine]')!.textContent).toContain('her morning routine');
    expect(host.querySelector('[data-practice-favour]')!.textContent).toMatch(/WARM/);
    expect(host.querySelector('[data-practice-posture]')!.textContent).toContain('the post');
  });

  it('favour is warm, even or cool and never a number, also with show raw values', () => {
    for (const [favour, word] of [[11.11, 'WARM'], [2, 'EVEN'], [-13.37, 'COOL']] as const) {
      for (const showRawValues of [false, true]) {
        const { host } = section(holding({ favour }), { showRawValues });
        const chip = host.querySelector('[data-practice-favour]')!;
        expect(chip.textContent, `${favour} raw ${showRawValues}`).toContain(word);
        expect(block(host)!.textContent).not.toMatch(/11|13|37/);
      }
    }
  });

  it('immersive mode draws none of it', () => {
    const { host } = section(holding(), { dynamicHidden: true });
    expect(block(host)).toBeNull();
    expect(host.textContent).not.toMatch(/fetch the roster|WARM|the post/);
  });

  it('draws nothing for a woman with no practices, and never a pronoun for the commander', () => {
    const none = section(withService(world(reg, 'role')));
    expect(block(none.host)).toBeNull();
    const { host } = section(holding());
    expect(hasCommanderPronoun(block(host)!.textContent ?? '')).toBe(false);
    const frozen = holding();
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(block(section(frozen).host)).toBeNull();
  });

  it('every element is addressed, resolves and can be reached with the keyboard', () => {
    const s = holding({ tasks: [task(), task({ id: 'pt3', routine: true, summary: 'her morning routine' }), task({ id: 'pt5', status: 'offered', sealed: true, acceptForm: 'sealed' })] });
    const { host, env } = section(s);
    const b = block(host)!;
    expect(b.querySelectorAll('[data-analyze]').length).toBeGreaterThan(3);
    expect(markedWithout(b)).toEqual([]);
    expect(unresolved(b, env)).toEqual([]);
    expect(unreachable(b)).toEqual([]);
  });
});
