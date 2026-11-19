// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import { reactsToCrime } from '../../../src/engine/memory/crime';
import { compatibility } from '../../../src/engine/power/ballot';
import type { EventIntent } from '../../../src/engine/relations/intents';
import { corporateWardenPick } from '../../../src/engine/warden/select';
import type { CampaignState, Development, Unit } from '../../../src/engine/state/types';
import { getSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import type { LoadResult } from '../../../src/st/persistence';
import { renderSquadTab } from '../../../src/ui/squad/squadTab';
import { ANN, harness, intentJson, praised, reply } from '../../helpers/sceneHarness';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const dev = (over: Partial<Development> = {}): Development => ({ drift: {}, acc: {}, anchors: [], counters: {}, pending: [], facts: [], moments: [], habits: [], nextId: 0, ...over });
/** ANN has imported corporate 0 and a drift of 1.5, so she reads as corporate 1; she is the only one with a development block. */
const withDrift = (s: CampaignState): CampaignState => {
  for (const u of s.squad) u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  s.squad[0].development = dev({ drift: { corporate: 1.5 } });
  return s;
};
const unitOf = (s: CampaignState, i: number): Unit => s.squad[i];

describe('a stepped value reaches every reader (P14b)', () => {
  it('the ballot: she is as alike a corporate-1 unit as two imports of corporate 1', () => {
    const s = withDrift(campaign(reg, 3));
    const other = unitOf(s, 1);
    other.values.corporate = 1;
    const twin = structuredClone(other);
    expect(compatibility(unitOf(s, 0), other)).toBe(compatibility(twin, other));
    expect(compatibility(unitOf(s, 0), other)).toBe(1);
  });

  it('the warden pick: she is picked over an equal-base unit', () => {
    const s = withDrift(campaign(reg, 3));
    expect(corporateWardenPick(s, reg)).toBe(unitOf(s, 0).id);
    const plain = campaign(reg, 3);
    for (const u of plain.squad) u.values = { ...u.values, corporate: 0, autonomy: 0 };
    expect(corporateWardenPick(plain, reg)).toBe(unitOf(plain, 0).id); // order breaks the tie, so make the others lose by development
    plain.squad[0].development = dev({ drift: { corporate: -1.5 } });
    expect(corporateWardenPick(plain, reg)).not.toBe(unitOf(plain, 0).id);
  });

  it('the crime reaction: a crime that reacts to corporate + reaches her', () => {
    const s = withDrift(campaign(reg, 2));
    const crime = { id: 'c', valueReactions: [{ axis: 'corporate', sign: '+', weight: 1 }] };
    expect(reactsToCrime(unitOf(s, 1), crime as never)).toBe(false);
    expect(reactsToCrime(unitOf(s, 0), crime as never)).toBe(true);
  });

  it('the delta chain: a tag she gained counts as liked', () => {
    const s = campaign(reg, 2);
    const id = unitOf(s, 0).id;
    const event: EventIntent = { type: 'praised', actor: 'commander', targets: [id], severity: 'moderate', evidence: 'x', confidence: 1, tags: ['tech'] };
    const before = computeDeltas(s, reg, id, event);
    s.squad[0].development = dev({ gained: { likes: ['tech'] } });
    const after = computeDeltas(s, reg, id, event);
    expect(after.affinity).toBeGreaterThan(before.affinity);
    s.squad[0].development = dev({ gained: { dislikes: ['tech'] } });
    expect(computeDeltas(s, reg, id, event).affinity).toBeLessThan(before.affinity);
  });

  it('the intent input carries her effective values and likes', async () => {
    const h = harness(reg, { tweak: (s) => { withDrift(s); s.squad[0].development = dev({ drift: { corporate: 1.5 }, gained: { likes: ['tech'] } }); } });
    expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
    h.st.groupReplies = [[reply('Ann', 'Thanks, commander.')]];
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('Good work today.');
    const call = h.st.calls.find((c) => (c.system ?? '').includes('rules referee'))!;
    expect(call.prompt).toContain('corporate 1,');
    expect(call.prompt).toContain('likes: tech;');
  });
});

describe('the squad tab', () => {
  it('shows the effective band, not the import', () => {
    const s = withDrift(campaign(reg, 2));
    s.squad[0].values.corporate = 0;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const load: LoadResult = { kind: 'ok', state: s, chatId: 'c' };
    const host = document.createElement('div');
    document.body.append(host);
    const settings = { ...getSettings(st), showRawValues: true };
    renderSquadTab(host, { st, getState: () => s, getLoad: () => load, registries: reg, settings: () => settings, onNewCampaign: () => {} });
    const text = host.textContent ?? '';
    expect(text).toContain('CORPORATE: +1');
  });
});
