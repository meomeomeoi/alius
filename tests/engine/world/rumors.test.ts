import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { offerMission, postRumor, rumorCap, rumorPostedEvent } from '../../../src/engine/world/missions';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const LEAD = { templateId: 'tpl_recover', regionId: 'ashway' };
const rumor = (text = 'Somebody is selling clean filters.') => ({ text, tags: ['d7'], leadsTo: 'none' as const });
const post = (s: CampaignState, r: Parameters<typeof postRumor>[2]) => {
  const draft = structuredClone(s);
  const result = postRumor(draft, ctxOf(draft, reg), r);
  return { draft, rumor: result };
};
const withComms = (level: number, insight = 1): CampaignState => {
  const s = structuredClone(base);
  s.base.facilities.comms = level;
  s.commander.socialStats.insight = insight;
  return s;
};

describe('rumor cap', () => {
  it('cap follows comms level and insight rank and never exceeds 3', () => {
    expect(rumorCap(withComms(1, 1), reg)).toBe(1);
    expect(rumorCap(withComms(2, 1), reg)).toBe(2);
    expect(rumorCap(withComms(3, 1), reg)).toBe(3);
    expect(rumorCap(withComms(1, TUNING.world.insightRumorRank), reg)).toBe(2);
    expect(rumorCap(withComms(2, 5), reg)).toBe(3);
    expect(rumorCap(withComms(3, 5), reg)).toBe(TUNING.director.maxRumors);
    expect(TUNING.director.maxRumors).toBe(3);
  });

  it('a rumor over the daily cap is not stored', () => {
    const s = withComms(1, 1);
    const first = post(s, rumor('One.'));
    expect(first.rumor).not.toBeNull();
    const second = postRumor(first.draft, ctxOf(first.draft, reg), rumor('Two.'));
    expect(second).toBeNull();
    expect(first.draft.rumors).toHaveLength(1);
    // a rumor of an earlier day does not count against today's cap
    first.draft.day += 1;
    expect(postRumor(first.draft, ctxOf(first.draft, reg), rumor('Three.'))).not.toBeNull();
    expect(first.draft.rumors).toHaveLength(2);
  });
});

describe('postRumor', () => {
  it('stores the rumor with an id, the day and status new', () => {
    const draft = structuredClone(base);
    const r = postRumor(draft, ctxOf(draft, reg), { text: '  Filters   sell well. ', tags: ['d7'], leadsTo: 'none' });
    expect(r).toMatchObject({ day: draft.day, text: 'Filters sell well.', tags: ['d7'], leadsTo: 'none', status: 'new' });
    expect(typeof r!.id).toBe('string');
    expect(draft.rumors).toEqual([r]);
  });

  it('rumorPostedEvent describes the new rumor for the caller to emit', () => {
    const draft = structuredClone(base);
    const r = postRumor(draft, ctxOf(draft, reg), rumor('Event check.'))!;
    expect(rumorPostedEvent(r)).toEqual({ type: 'rumor_posted', rumorId: r.id, text: 'Event check.', leadsTo: 'none' });
  });

  it('a 60-word text is cut to 40 words', () => {
    const text = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
    const r = post(base, rumor(text)).rumor!;
    expect(r.text.split(' ')).toHaveLength(TUNING.director.rumorWords);
    expect(r.text.endsWith('w39')).toBe(true);
  });

  it('plain text only: markup is kept as text, never as structure', () => {
    const r = post(base, rumor('<b>bold</b> <script>x</script>')).rumor!;
    expect(r.text).toBe('<b>bold</b> <script>x</script>');
  });

  it('a mission lead that cannot be offered is stored as leadsTo none; a valid one keeps its lead', () => {
    const ok = post(base, { text: 'A cache lies on the Ashway.', tags: [], leadsTo: 'mission', lead: LEAD }).rumor!;
    expect(ok).toMatchObject({ leadsTo: 'mission', lead: LEAD });
    const bad = post(base, { text: 'Nothing real.', tags: [], leadsTo: 'mission', lead: { templateId: 'ghost', regionId: 'ashway' } }).rumor!;
    expect(bad.leadsTo).toBe('none');
    expect(bad.lead).toBeUndefined();
    const noLead = post(base, { text: 'Missing lead.', tags: [], leadsTo: 'mission' }).rumor!;
    expect(noLead.leadsTo).toBe('none');
    // a template that does not allow source "rumor"
    const wrongSource = post(base, { text: 'Wrong.', tags: [], leadsTo: 'mission', lead: { templateId: 'tpl_outbreak', regionId: 'quarantine_d7' } }).rumor!;
    expect(wrongSource.leadsTo).toBe('none');
  });

  it('rumors keep the newest 20', () => {
    const s = withComms(3, 5);
    const draft = structuredClone(s);
    for (let i = 0; i < TUNING.world.rumorsMax + 6; i++) {
      draft.day = i + 1;
      expect(postRumor(draft, ctxOf(draft, reg), rumor(`Rumor number ${i}.`))).not.toBeNull();
    }
    expect(draft.rumors).toHaveLength(TUNING.world.rumorsMax);
    expect(draft.rumors.at(-1)!.text).toBe(`Rumor number ${TUNING.world.rumorsMax + 5}.`);
    expect(draft.rumors[0].text).toBe('Rumor number 6.');
  });
});

describe('rumor/follow', () => {
  const withRumor = (r: Parameters<typeof postRumor>[2], s = base) => {
    const p = post(s, r);
    return { state: p.draft, id: p.rumor!.id };
  };

  it('following a mission rumor offers a scouted rumor-source mission', () => {
    const { state, id } = withRumor({ text: 'A cache lies on the Ashway.', tags: [], leadsTo: 'mission', lead: LEAD });
    const r = run(state, reg, { type: 'rumor/follow', payload: { rumorId: id } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.missions.offered).toHaveLength(1);
    expect(r.state.missions.offered[0]).toMatchObject({ source: 'rumor', scouted: true, templateId: 'tpl_recover', regionId: 'ashway' });
    expect(r.state.rumors[0].status).toBe('followed');
    expect(ofType(r.events, 'rumor_followed')).toEqual([{ type: 'rumor_followed', rumorId: id, leadsTo: 'mission' }]);
    expect(ofType(r.events, 'mission_offered')).toHaveLength(1);
  });

  it('following with a full board keeps the rumor and reports why', () => {
    const { state, id } = withRumor({ text: 'A cache lies on the Ashway.', tags: [], leadsTo: 'mission', lead: LEAD });
    // fill the board (size 3) with three command missions
    for (const [templateId, regionId] of [['tpl_sweep', 'quarantine_d7'], ['tpl_sweep', 'kestrel_corridor'], ['tpl_sweep', 'ashway']]) {
      expect(offerMission(state, ctxOf(state, reg), { templateId, regionId, source: 'command' }).mission).not.toBeNull();
    }
    const r = run(state, reg, { type: 'rumor/follow', payload: { rumorId: id } });
    expect(errors(r.events)[0]).toMatchObject({ code: 'handler_failed' });
    expect(String(errors(r.events)[0].message)).toMatch(/board/i);
    expect(r.state).toBe(state);
    expect(state.rumors[0].status).toBe('new');
  });

  it('following a fact rumor adds one public fact', () => {
    const { state, id } = withRumor({ text: 'The east stairwell is avoided.', tags: ['d7', 'bloom'], leadsTo: 'fact' });
    const r = run(state, reg, { type: 'rumor/follow', payload: { rumorId: id } });
    expect(errors(r.events)).toEqual([]);
    const facts = r.state.memory.facts.filter((f) => f.text === 'The east stairwell is avoided.');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ about: [], knownBy: ['*'], importance: 2, day: state.day });
    expect(r.state.rumors[0].status).toBe('followed');
  });

  it('a rumor cannot be followed twice, and a none rumor cannot be followed', () => {
    const { state, id } = withRumor({ text: 'The east stairwell is avoided.', tags: [], leadsTo: 'fact' });
    const once = run(state, reg, { type: 'rumor/follow', payload: { rumorId: id } });
    const twice = run(once.state, reg, { type: 'rumor/follow', payload: { rumorId: id } });
    expect(errors(twice.events)).toHaveLength(1);
    expect(twice.state).toBe(once.state);
    const none = withRumor(rumor('Just talk.'));
    expect(errors(run(none.state, reg, { type: 'rumor/follow', payload: { rumorId: none.id } }).events)).toHaveLength(1);
    expect(errors(run(none.state, reg, { type: 'rumor/follow', payload: { rumorId: 'ghost' } }).events)).toHaveLength(1);
    expect(errors(run(none.state, reg, { type: 'rumor/follow', payload: {} }).events)).toHaveLength(1);
  });
});
