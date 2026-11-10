import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { buildDigest } from '../../../src/engine/world/director';
import { offerMission } from '../../../src/engine/world/missions';
import { campaign, ctxOf } from '../../helpers/world';
import { loadCore } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const thread = (id: string, status: 'open' | 'dormant' | 'resolved' | 'failed' = 'open', flags = 0) => ({
  id, title: `Thread ${id}`, status, flags: Array.from({ length: flags }, (_, i) => ({ id: `thread:${id}:flag_${i}`, description: `Flag ${i} of ${id}.` })),
  relatedUnits: [] as string[], relatedRegions: [] as string[], createdDay: 1,
});

describe('digest', () => {
  it('lists day, current beat with readiness, open threads, clocks, factions, last 8 flags, state names and the board', () => {
    const s = structuredClone(base);
    s.day = 5;
    s.world.flags = Array.from({ length: 11 }, (_, i) => `evidence_flag_${i}`);
    s.world.threads.push(thread('t1', 'open', 2), thread('t2', 'dormant'), thread('t3', 'resolved'), thread('t4', 'failed'));
    s.world.spine = { proposed: 'beat_1', proposedDay: 4, lastProposalDay: 4 };
    const mission = offerMission(s, ctxOf(s, reg), { templateId: 'tpl_sweep', regionId: 'quarantine_d7', source: 'command' }).mission!;
    s.lastExpedition = { id: 'rep_x', missionId: 'm0', missionTitle: 'Old job', regionId: 'ashway', day: 4, outcome: 'retreated', party: [], nodes: [], log: [], loot: [], injuries: [], deaths: [], breakdowns: [], acknowledged: true, debriefed: true };
    const d = buildDigest(s, reg);
    expect(d.day).toBe(5);
    expect(d.phase).toBe('spine');
    expect(d.beat).toEqual({ id: 'beat_1', title: 'First sample', goal: 'Recover the first Bloom sample.', ready: true, proposed: true });
    expect(d.threads.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(d.threads[0]).toEqual({ id: 't1', title: 'Thread t1', status: 'open', flags: ['thread:t1:flag_0', 'thread:t1:flag_1'] });
    expect(d.clocks).toHaveLength(5);
    expect(d.clocks.find((c) => c.id === 'garden_wake')).toMatchObject({ label: 'The Garden wakes', segments: 10, filled: 0, regionId: 'the_garden' });
    expect(d.factions).toEqual(s.world.factions);
    expect(d.flags).toEqual(s.world.flags.slice(-8));
    expect(d.flags).toHaveLength(8);
    expect(d.squad).toHaveLength(4);
    expect(d.squad[0]).toEqual({ name: s.squad[0].displayName, state: 'Stranger' });
    expect(d.board).toEqual([{ id: mission.id, source: 'command', title: mission.title, regionId: 'quarantine_d7', danger: mission.danger, daysLeft: mission.deadlineDay! - 5 }]);
    expect(d.boardRoom).toBe(2);
    expect(d.rumorRoom).toBe(1);
    expect(d.regions.map((r) => r.id).sort()).toEqual(['ashway', 'kestrel_corridor', 'quarantine_d7']);
    expect(d.regions.find((r) => r.id === 'ashway')).toEqual({ id: 'ashway', name: 'The Ashway', danger: 2 });
    expect(d.templates.find((t) => t.id === 'tpl_hunt')).toEqual({ id: 'tpl_hunt', sources: ['side', 'rumor'], objectives: ['elite'], tiers: ['tier_2', 'tier_3', 'tier_4'] });
    expect(d.templates.find((t) => t.id === 'tpl_outbreak')!.regions).toEqual(['quarantine_d7']);
    expect(d.lastExpedition).toEqual({ regionId: 'ashway', outcome: 'retreated', missionTitle: 'Old job' });
  });

  it('only living named units appear, with their relationship state name', () => {
    const s = structuredClone(base);
    s.squad[1].status = 'dead';
    s.squad[2].kind = 'grunt';
    const d = buildDigest(s, reg);
    expect(d.squad.map((u) => u.name)).toEqual([s.squad[0].displayName, s.squad[3].displayName]);
    s.relations[s.squad[0].id].stateId = 'friend';
    expect(buildDigest(s, reg).squad[0].state).toBe(String(reg.relationshipStates.get('friend')!.name));
  });

  it('contains no trust, affinity, attraction or stress numbers and no unit ids', () => {
    const s = structuredClone(base);
    for (const u of s.squad) u.stress = 77;
    for (const r of Object.values(s.relations)) { r.trust = 61; r.affinity = 52; r.attraction = 43; }
    const text = JSON.stringify(buildDigest(s, reg));
    for (const word of ['trust', 'affinity', 'attraction', 'stress', '"61"', ':61', ':52', ':43', ':77']) expect(text, word).not.toContain(word);
    for (const u of s.squad) expect(text).not.toContain(u.id);
    expect(text).not.toContain('cardRef');
  });

  it('stays under 4000 characters for a campaign with a full board, 6 threads and 5 clocks', () => {
    const s = structuredClone(base);
    s.day = 40;
    s.base.facilities.comms = 3;
    s.world.clearanceTier = 2;
    s.world.flags = Array.from({ length: 20 }, (_, i) => `a_declared_flag_number_${i}`);
    for (let i = 1; i <= 6; i++) s.world.threads.push(thread(`t${i}`, 'open', 12));
    s.world.spine = { proposed: 'beat_1' };
    for (const [templateId, regionId] of [['tpl_sweep', 'quarantine_d7'], ['tpl_sweep', 'kestrel_corridor'], ['tpl_sweep', 'ashway'], ['tpl_recover', 'quarantine_d7'], ['tpl_recover', 'drowned_market']]) {
      expect(offerMission(s, ctxOf(s, reg), { templateId, regionId, source: 'command', title: 'A mission title that is fairly long, up to sixty characters.' }).mission).not.toBeNull();
    }
    const d = buildDigest(s, reg);
    expect(d.board).toHaveLength(5);
    expect(d.threads).toHaveLength(6);
    expect(d.clocks).toHaveLength(5);
    expect(JSON.stringify(d).length).toBeLessThan(4000);
  });

  it('open-ended phase has no beat', () => {
    const s = structuredClone(base);
    s.world.spineProgress = 6;
    const d = buildDigest(s, reg);
    expect(d.phase).toBe('open');
    expect(d.beat).toBeUndefined();
    // a campaign without a start is open-ended too
    const t = structuredClone(base);
    delete t.world.startId;
    expect(buildDigest(t, reg).phase).toBe('open');
  });

  it('a beat that is not ready says so', () => {
    const s = structuredClone(base);
    s.world.spineProgress = 1;
    s.day = 2;
    expect(buildDigest(s, reg).beat).toMatchObject({ id: 'beat_2', ready: false, proposed: false });
  });
});
