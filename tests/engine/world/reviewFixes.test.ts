import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CombatResult } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { applyDirectorOutput, buildDigest, validateDirectorOutput } from '../../../src/engine/world/director';
import { offerMission, runDeadlines } from '../../../src/engine/world/missions';
import { proposeBeat } from '../../../src/engine/world/spine';
import type { NodeMap, Thread } from '../../../src/engine/world/types';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const thread = (id: string, status: Thread['status'] = 'open'): Thread => ({ id, title: id, status, flags: [], relatedUnits: [], relatedRegions: [], createdDay: 1 });
const validate = (s: CampaignState, raw: unknown) => validateDirectorOutput(s, reg, raw, { cooldownDays: TUNING.director.beatCooldownDays });
const sources = (s: CampaignState) => s.missions.offered.map((m) => m.source);
const shortMap = (): NodeMap => ({
  layers: [['n0_0', 'n0_1']], objectiveId: 'obj',
  nodes: {
    n0_0: { id: 'n0_0', layer: 0, type: 'cache', edges: ['obj'], visited: false },
    n0_1: { id: 'n0_1', layer: 0, type: 'cache', edges: ['obj'], visited: false },
    obj: { id: 'obj', layer: 1, type: 'objective', edges: [], visited: false },
  },
});

describe('I2: the Commander Crisis follow-up runs during an expedition', () => {
  it('relations/commander_injured is not refused by the expedition guard', () => {
    const { state, mission } = withMission(reg, base);
    const s = depart(reg, state, mission.id);
    const r = run(s, reg, { type: 'relations/commander_injured', payload: {} });
    expect(r.events.find((e) => e.type === 'error' && e.code === 'expedition_open')).toBeUndefined();
    // other P3 actions stay out
    expect(run(s, reg, { type: 'dm/read', payload: { unitId: s.squad[0].id } }).events[0]).toMatchObject({ code: 'expedition_open' });
  });
});

describe('I3: the director cannot flood the board with command missions', () => {
  it('only the first offer of a tick becomes a command mission; the others are side missions or rejected', () => {
    const s = structuredClone(base);
    s.base.facilities.comms = 2;
    const r = validate(s, { missionOffers: [{ templateId: 'tpl_sweep', regionId: 'ashway' }, { templateId: 'tpl_recover', regionId: 'ashway' }] });
    expect(r.output.missionOffers).toHaveLength(2);
    const d = structuredClone(s);
    applyDirectorOutput(d, ctxOf(d, reg), r.output);
    expect(sources(d)).toEqual(['command', 'side']);
    // with a command mission open, a command-only template is rejected and dual templates become side missions
    const open = structuredClone(d);
    const again = validate(open, { missionOffers: [{ templateId: 'tpl_escort_data', regionId: 'kestrel_corridor' }, { templateId: 'tpl_recover', regionId: 'kestrel_corridor' }] });
    expect(again.output.missionOffers.map((o) => o.templateId)).toEqual(['tpl_recover']);
    expect(again.rejected[0].part).toBe('missionOffers[0]');
    expect(again.rejected[0].reason).toMatch(/command/i);
  });

  it('many ticks never leave more than one command mission open', () => {
    let s = structuredClone(base);
    s.base.facilities.comms = 3;
    const combos = [['tpl_sweep', 'quarantine_d7'], ['tpl_sweep', 'kestrel_corridor'], ['tpl_sweep', 'ashway'], ['tpl_recover', 'quarantine_d7'], ['tpl_recover', 'kestrel_corridor'], ['tpl_recover', 'ashway']];
    for (let tick = 0; tick < 6; tick++) {
      const offers = combos.slice(tick, tick + 2).map(([templateId, regionId]) => ({ templateId, regionId }));
      const d = structuredClone(s);
      applyDirectorOutput(d, ctxOf(d, reg), validate(d, { missionOffers: offers }).output);
      s = d;
    }
    expect(s.missions.offered.filter((m) => m.source === 'command').length).toBeLessThanOrEqual(1);
    expect(s.missions.offered.length).toBeLessThanOrEqual(5); // comms level 3: five slots
  });
});

describe('I4: threads stay bounded', () => {
  it('reopening a closed thread counts against the open-thread limit', () => {
    const s = structuredClone(base);
    for (let i = 1; i <= 6; i++) s.world.threads.push(thread(`t${i}`));
    s.world.threads.push(thread('old', 'dormant'), thread('done', 'resolved'));
    const r = validate(s, { threadUpdates: [{ threadId: 'old', status: 'open' }, { threadId: 'done', status: 'open' }] });
    expect(r.output.threadUpdates).toEqual([]);
    expect(r.rejected).toHaveLength(2);
    // with room it works, once
    const roomy = structuredClone(s);
    roomy.world.threads = roomy.world.threads.filter((t) => t.id !== 't6');
    const ok = validate(roomy, { threadUpdates: [{ threadId: 'old', status: 'open' }, { threadId: 'done', status: 'open' }] });
    expect(ok.output.threadUpdates.map((u) => u.threadId)).toEqual(['old']);
    // closing is always fine
    expect(validate(s, { threadUpdates: [{ threadId: 't1', status: 'resolved' }] }).output.threadUpdates).toHaveLength(1);
  });

  it('old closed and dormant threads are trimmed, spine threads and open ones never', () => {
    const s = structuredClone(base);
    s.world.threads.push(thread('spine:beat_1', 'resolved'), thread('keep_open'));
    for (let i = 0; i < 40; i++) s.world.threads.push(thread(`r${i}`, i % 2 === 0 ? 'resolved' : 'failed'));
    for (let i = 0; i < 12; i++) s.world.threads.push(thread(`d${i}`, 'dormant'));
    const d = structuredClone(s);
    applyDirectorOutput(d, ctxOf(d, reg), { missionOffers: [], rumors: [], threadUpdates: [], clockAdvances: [] });
    const ids = d.world.threads.map((t) => t.id);
    expect(ids).toContain('spine:beat_1');
    expect(ids).toContain('keep_open');
    expect(d.world.threads.filter((t) => (t.status === 'resolved' || t.status === 'failed') && !t.id.startsWith('spine:'))).toHaveLength(20);
    expect(d.world.threads.filter((t) => t.status === 'dormant')).toHaveLength(6);
    // the newest are the ones kept
    expect(ids).toContain('r39');
    expect(ids).not.toContain('r0');
    expect(ids).toContain('d11');
    expect(buildDigest(d, reg).threads.filter((t) => t.status === 'dormant')).toHaveLength(6);
  });
});

describe('M1: a story mission that expires gives its beat back', () => {
  it('the proposed beat is cleared when its mission vanished with its content', () => {
    const s = structuredClone(base);
    const draft = structuredClone(s);
    proposeBeat(draft, ctxOf(draft, reg), 'beat_1', 'The first sample.');
    expect(draft.world.spine!.proposed).toBe('beat_1');
    const regs = { ...reg, missionTemplates: new Map(reg.missionTemplates) } as Registries;
    regs.missionTemplates.delete('tpl_vesper_beat_1');
    const events = runDeadlines(draft, ctxOf(draft, regs));
    expect(ofType(events, 'mission_expired')).toHaveLength(1);
    expect(draft.world.spine!.proposed).toBeUndefined();
  });
});

describe('M2: an event whose template vanished resolves as nothing', () => {
  it('choose on a pending event without a template returns to travel (and finishes a reach objective)', () => {
    const { state, mission } = withMission(reg, base);
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map = shortMap();
    s.expedition!.at = 'obj';
    s.expedition!.phase = 'event';
    s.expedition!.pending = { kind: 'event', nodeId: 'obj', templateId: 'evt_gone' };
    const r = run(s, reg, { type: 'expedition/choose', payload: { option: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.phase).toBe('travel');
    expect(r.state.expedition!.pending).toBeUndefined();
    expect(r.state.expedition!.objectiveDone).toBe(true);
    expect(r.state.expedition!.log.at(-1)!.text).toContain('Nothing here.');
  });
});

describe('M3: an unbuildable fight at the objective does not strand the run', () => {
  it('a win objective whose encounter cannot be built counts as reached', () => {
    const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep' });
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map = shortMap();
    const regs = { ...reg, regions: new Map(reg.regions) } as Registries;
    regs.regions.set('quarantine_d7', { ...reg.regions.get('quarantine_d7')!, enemyTable: { categories: { ghost: 1 } } });
    const mid = run(s, regs, { type: 'expedition/move', payload: { nodeId: 'n0_0' } }).state;
    const end = run(mid, regs, { type: 'expedition/move', payload: { nodeId: 'obj' } }).state;
    expect(end.expedition!.phase).toBe('travel');
    expect(end.expedition!.objectiveDone).toBe(true);
    expect(errors(run(end, regs, { type: 'expedition/return', payload: {} }).events)).toEqual([]);
  });
});

describe('M8: retreating after a decided fight keeps its result', () => {
  const decided = (over: Partial<CombatResult> = {}): CampaignState => {
    const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep' });
    let s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map = shortMap();
    s.expedition!.map.nodes.n0_0.type = 'combat';
    s = run(s, reg, { type: 'expedition/move', payload: { nodeId: 'n0_0' } }).state;
    const [a, b] = s.expedition!.party;
    s.squad.find((u) => u.id === b)!.status = 'injured';
    s.lastCombat = {
      id: 'cmb_decided', day: s.day, outcome: 'won', rounds: 3, formation: s.expedition!.formation, participants: s.expedition!.party,
      enemies: [{ enemyId: 'husk', level: 1, affixes: [], name: 'Husk', downed: true }], log: [], xp: {}, levelUps: [], loot: [{ kind: 'credits', amount: 9 }],
      banked: false, injuries: [b], deaths: [], breakdowns: [], stressDelta: {}, commanderInjured: false,
      relationHints: [{ type: 'protected', actor: a, targets: ['commander'], severity: 'major' }], ...over,
    };
    return s;
  };

  it('a decided win is taken into the report before the squad pulls back', () => {
    const s = decided();
    const a = s.expedition!.party[0];
    const trust = s.relations[a].trust;
    const r = run(s, reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(r.events)).toEqual([]);
    const report = r.state.lastExpedition!;
    expect(report.outcome).toBe('retreated');
    expect(report.log.some((l) => l.kind === 'combat')).toBe(true);
    expect(report.injuries).toEqual([s.expedition!.party[1]]);
    expect(r.state.relations[a].trust).toBeGreaterThan(trust);
    expect(ofType(r.events, 'expedition_ended')).toHaveLength(1);
  });

  it('a decided loss still ends the run as failed', () => {
    const r = run(decided({ outcome: 'lost', loot: [] }), reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastExpedition!.outcome).toBe('failed');
    expect(ofType(r.events, 'expedition_ended')).toHaveLength(1);
  });

  it('an unfought combat node can still be left', () => {
    const s = decided();
    delete s.lastCombat;
    const r = run(s, reg, { type: 'expedition/retreat', payload: {} });
    expect(r.state.lastExpedition!.outcome).toBe('retreated');
  });
});

void offerMission;
