import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { rollRules } from '../../src/engine/bonds';
import { ContextBuilder } from '../../src/llm/context';
import { createBonds } from '../../src/bonds/controller';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';
import { withBond } from '../helpers/bonds';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';
const flush = () => new Promise((res) => setTimeout(res, 0));
const rules = (h: WorldHarness) => h.state().bonds?.rules ?? [];
const records = (h: WorldHarness) => h.state().generations?.records ?? [];

/** A proposal whose wording failed: the template text was delivered. */
async function delivered() {
  const s = campaign(reg, 4);
  s.day = 10;
  for (const u of s.squad) u.defects = [];
  setRelation(s, ANN, { stateId: 'lover' });
  withBond(s, ANN, { leadStyle: 'dominant' });
  const h = worldHarness(reg, s, { ruleWording: true, autoRetry: 0 });
  const bonds = createBonds({ ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), startScene: vi.fn(async () => true) });
  for (let seed = 1; seed < 400; seed++) {
    const events: Array<{ type: string }> = [];
    h.setState((st) => {
      const d = structuredClone(st);
      events.push(...rollRules(d, { registries: reg, rng: new Rng(seedRng(seed)) }));
      Object.keys(st).forEach((k) => delete (st as never as Record<string, unknown>)[k]);
      Object.assign(st, d);
    });
    if (rules(h).length > 0) {
      bonds.onEvents(events);
      await flush();
      return { h, bonds };
    }
  }
  throw new Error('nothing was proposed');
}

describe('flavor.rule', () => {
  it('a failed rule wording delivers the template and leaves a quiet record', async () => {
    const { h } = await delivered();
    expect(rules(h)[0]).toMatchObject({ status: 'proposed', delivered: true });
    expect(records(h)).toMatchObject([{ siteId: 'flavor.rule', key: rules(h)[0].id, quiet: true, fallbackApplied: true }]);
    expect(h.toasts).toEqual([]);
  });

  it('RETRY rewords it before an answer', async () => {
    const { h } = await delivered();
    h.st.mainReplies = ['{"text":"Tell me before you go out."}'];
    expect((await h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(rules(h)[0].text).toBe('Tell me before you go out.');
    expect(h.state().dms[ANN].find((m) => m.id === rules(h)[0].dmId)?.text ?? 'Tell me before you go out.').toBe('Tell me before you go out.');
    expect(records(h)).toEqual([]);
  });

  it('REROLL rewords a delivered proposal; after the answer it is refused', async () => {
    const { h, bonds } = await delivered();
    const id = rules(h)[0].id;
    h.st.mainReplies = ['{"text":"Another way of asking."}'];
    await bonds.reword(id);
    expect(rules(h)[0].text).toBe('Another way of asking.');
    bonds.answerRule(id, 'refuse');
    expect(h.deps.generations.rerollState('flavor.rule', id)).toEqual({ enabled: false, reason: 'It was answered.' });
  });
});
