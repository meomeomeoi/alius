import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/engine/actions/practice';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { buildKnowledge } from '../../src/analysis/knowledge';
import { CORE_GLOSSARY_IDS, registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { dynamicOf } from '../../src/engine/dynamic/state';
import { practiceView } from '../../src/engine/practice/view';
import { blankPractices, type OpenPunishment, type Task } from '../../src/engine/practice/state';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { hasCommanderPronoun } from '../../src/engine/dynamic/pronoun';
import { keysWithoutSample } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { loadCore } from '../helpers/world';
import { ANN, BEA, withService, world } from '../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});

const settings = (over: Partial<AliusSettings> = {}): AliusSettings => ({ ...DEFAULT_SETTINGS, ...over });
const envOf = (s: CampaignState, over: Partial<AliusSettings> = {}): AnalyzeEnv => ({ state: s, registries: reg, settings: settings(over) });
const viewOf = (s: CampaignState, over: Partial<AliusSettings> = {}) => buildKnowledge(s, settings(over)).practice(ANN, reg);

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Words only she wrote.', summary: 'fetch the roster',
  status: 'open', acceptForm: 'button_cost', day: 19, ...over,
});
const punishment = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'Words only she wrote.', summary: 'a day without messages', status: 'offered', day: 20, ...over,
});
function holding(over: Partial<NonNullable<CampaignState['practices']>> = {}): CampaignState {
  const s = withService(world(reg, 'role'));
  s.practices = { ...blankPractices(), seq: 9, ...over };
  return s;
}

describe('the view shows what the commander may know', () => {
  it('nothing without a campaign, without practices or for a woman who holds nothing', () => {
    const empty = buildKnowledge(null, settings()).practice(ANN, reg);
    expect(empty).toMatchObject({ tasks: [], punishments: [], demonstrations: [], held: null, protocol: [], routine: null, permission: null, postures: [], handovers: [], records: [] });
    expect(empty.favour).toBeUndefined();
    expect(viewOf(withService(world(reg, 'role')))).toMatchObject({ tasks: [], punishments: [], held: null });
    expect(buildKnowledge(holding({ tasks: [task()] }), settings()).practice(BEA, reg).tasks).toEqual([]);
    const equal = holding({ tasks: [task()] });
    equal.relations[ANN].dynamic!.frame = 'equal';
    expect(viewOf(equal).tasks).toEqual([]); // she holds nothing now: her practices are frozen
  });

  it('tasks: her open and offered ones by summary; a sealed one is only sealed until it is opened; a hidden deadline is not in the view', () => {
    const s = holding({ tasks: [
      task({ id: 'pt1', status: 'offered', deadline: { day: 24 }, noDuration: true }),
      task({ id: 'pt2', status: 'offered', sealed: true, acceptForm: 'sealed', summary: 'SENTINEL_SEALED_SUMMARY', text: 'SENTINEL_SEALED_TEXT' }),
      task({ id: 'pt3', status: 'open', sealed: true, acceptForm: 'sealed', summary: 'a thing that was sealed', text: 'x' }),
      task({ id: 'pt4', status: 'open', deadline: { day: 22, slot: 'evening' } }),
      task({ id: 'pt5', status: 'kept' }),
      task({ id: 'pt6', status: 'open', routine: true, summary: 'her morning routine', brokenDay: 20 }),
    ] });
    const v = viewOf(s);
    expect(v.tasks.map((t) => t.id)).toEqual(['pt1', 'pt2', 'pt3', 'pt4']);
    expect(v.tasks[0]).toMatchObject({ summary: 'fetch the roster', status: 'offered', due: null, noDuration: true });
    expect(v.tasks[1]).toMatchObject({ summary: null, sealed: true, status: 'offered' });
    expect(v.tasks[2]).toMatchObject({ summary: 'a thing that was sealed', sealed: true, status: 'open' });
    expect(v.tasks[3].due).toEqual({ day: 22, slot: 'evening' });
    expect(JSON.stringify(v)).not.toMatch(/SENTINEL_SEALED|Words only she wrote|brokenDay/);
    expect(v.routine).toBe('her morning routine'); // the routine is its own line, with no flag of today's
    expect(v.tasks.some((t) => t.id === 'pt6')).toBe(false);
  });

  it('punishments: no unfair flag and no count; a real and a false one render identically', () => {
    const fair = holding({ punishments: [punishment({ count: 26, hiddenCount: true, ceremony: { steps: ['fetch_implement', 'name_the_number'], done: ['fetch_implement'], number: 34 }, status: 'accepted' })] });
    const unfair = structuredClone(fair);
    unfair.practices!.punishments[0].offence = { kind: 'unfair', stakes: 'major', day: 20, unfair: true };
    unfair.practices!.unfair = { [ANN]: { kind: 'no_guilt', day: 20 } };
    const a = viewOf(fair);
    expect(a.punishments).toHaveLength(1);
    expect(a.punishments[0]).toMatchObject({ summary: 'a day without messages', status: 'accepted', severity: 'light', public: false, order: false });
    expect(a.punishments[0].ceremony).toEqual([{ id: 'fetch_implement', label: 'Fetch the implement', done: true }, { id: 'name_the_number', label: 'Name the number', done: false }]);
    expect(viewOf(unfair)).toEqual(a);
    expect(JSON.stringify(a)).not.toMatch(/\b26\b|\b34\b|unfair|"count"|"number"/);
  });

  it('a sealed punishment is sealed until it is opened; an order about a soldier is an order', () => {
    const s = holding({ punishments: [punishment({ id: 'pp1', sealed: true, summary: 'SENTINEL_SEALED_SUMMARY' }), punishment({ id: 'pp2', forUnitId: BEA, summary: 'a talking-to' })] });
    const v = viewOf(s);
    expect(v.punishments[0]).toMatchObject({ summary: null, sealed: true });
    expect(v.punishments[1]).toMatchObject({ summary: 'a talking-to', order: true });
    expect(JSON.stringify(v)).not.toContain('SENTINEL_SEALED');
  });

  it('the hold: her quarters, sensory or not, and no end while it is hidden', () => {
    const s = holding({ held: { by: ANN, since: { day: 20, slot: 'morning' }, until: { day: 20, slot: 'evening' }, sensory: false, extended: 0, bookingIds: ['bk1'] } });
    s.slot = 'morning';
    s.personal = { seq: 9, bookings: [{ id: 'bk1', unitId: ANN, kindId: 'held_in_quarters', day: 20, slot: 'morning', status: 'booked', source: 'practice', made: 20 }] } as never;
    expect(viewOf(s).held).toEqual({ sensory: false, until: { day: 20, slot: 'evening' } });
    s.practices!.held!.hidden = true;
    s.practices!.held!.sensory = true;
    expect(viewOf(s).held).toEqual({ sensory: true, until: null });
    expect(buildKnowledge(s, settings()).practice(BEA, reg).held).toBeNull(); // another woman keeps nothing
  });

  it('favour is a word and never a number, with raw values on or off; immersive mode has none', () => {
    const s = holding();
    for (const [favour, word] of [[11.11, 'warm'], [8, 'warm'], [7.9, 'even'], [0, 'even'], [-7.9, 'even'], [-8, 'cool'], [-13.37, 'cool']] as const) {
      dynamicOf(s, ANN)!.favour = favour;
      for (const showRawValues of [false, true]) {
        expect(viewOf(s, { showRawValues }).favour, `${favour} raw ${showRawValues}`).toBe(word);
        expect(JSON.stringify(viewOf(s, { showRawValues }))).not.toContain(String(Math.abs(favour)));
      }
    }
    expect(viewOf(s, { dynamicHidden: true }).favour).toBeUndefined();
  });

  it('her permission is shown only once it was asked, only the answer of today and a "not yet" that stands', () => {
    const s = holding({ permission: { holderId: ANN, ruleId: 'r1' } });
    expect(viewOf(s).permission).toBeNull();
    s.practices!.permission!.asked = { day: s.day, answer: 'grant' };
    expect(viewOf(s).permission).toBe('grant');
    s.practices!.permission!.asked = { day: s.day - 3, answer: 'deny' };
    expect(viewOf(s).permission).toBeNull();
    s.practices!.permission!.asked = { day: s.day - 1, answer: 'wait', untilDay: s.day + 1 };
    expect(viewOf(s).permission).toBe('wait');
  });

  it('postures by her name, standing handovers by kind and last day, the record lines, her standing forms', () => {
    const s = holding({
      postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'the post', day: 18 }] },
      handovers: [{ id: 'ph1', kind: 'key', holderId: ANN, untilDay: 23, days: 3, taskId: 'pt8' }],
      records: [{ day: 19, holderId: ANN, line: 'Signed: she keeps the roster. Day 19.' }, { day: 19, holderId: BEA, line: 'not hers' }],
    });
    const v = viewOf(s);
    expect(v.postures).toEqual([{ postureId: 'kneeling_upright', name: 'the post' }]);
    expect(v.handovers).toEqual([{ kind: 'key', untilDay: 23 }]);
    expect(v.records).toEqual([{ day: 19, line: 'Signed: she keeps the roster. Day 19.' }]);
    expect(JSON.stringify(v)).not.toMatch(/ph1|pt8|days/);
  });
});

describe('the readings (R24)', () => {
  const full = (): CampaignState => {
    const s = holding({
      tasks: [task({ id: 'pt1', status: 'open', summary: 'fetch the roster' }), task({ id: 'pt2', status: 'offered', sealed: true, acceptForm: 'sealed', summary: 'SENTINEL_SEALED_SUMMARY', text: 'SENTINEL_SEALED_TEXT' }), task({ id: 'pt3', status: 'open', routine: true, summary: 'her morning routine' })],
      punishments: [punishment({ status: 'accepted', ceremony: { steps: ['fetch_implement', 'name_the_number'], done: ['fetch_implement'] } })],
      postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'the post', day: 18 }] },
      handovers: [{ id: 'ph1', kind: 'device', holderId: ANN, untilDay: 21 }],
      records: [{ day: 19, holderId: ANN, line: 'Signed: the roster. Day 19.' }],
      permission: { holderId: ANN, ruleId: 'r1', asked: { day: 20, answer: 'deny' } },
    });
    dynamicOf(s, ANN)!.favour = 11.11;
    return s;
  };
  const read = (address: string, s = full(), over: Partial<AliusSettings> = {}) => analyze(address, envOf(s, over), { unitId: ANN });

  it('every glossary id of the practices has a core entry and one reading or none, and no reading names the commander with a pronoun', () => {
    const IDS = ['practice', 'practice_task', 'task_card', 'consent_ladder', 'accept_words', 'accept_signed', 'practice_record', 'holder_punishment', 'punishment_card', 'take_it_instead', 'demonstration', 'protocol', 'routine', 'confess', 'verdict', 'favour', 'denial', 'ask_permission', 'held', 'sensory_mode', 'ask_release', 'alarm', 'without_command', 'squad_call', 'ask_for_task', 'ask_for_punishment', 'sealed', 'no_duration', 'slap', 'ceremony', 'handover', 'ask_her', 'named_posture', 'posture_call', 'setting_practice_wording'];
    for (const id of IDS) {
      expect(reg.glossary.has(id), id).toBe(true);
      if (!id.startsWith('setting_')) expect(CORE_GLOSSARY_IDS, id).toContain(id); // a setting's entry is checked with the settings
      for (const raw of [false, true]) for (const line of read(`glossary:${id}`, full(), { showRawValues: raw })) expect(hasCommanderPronoun(line), `${id}: ${line}`).toBe(false);
    }
  });

  it('tasks and cards: the summaries she asked, a sealed one only as sealed', () => {
    for (const id of ['practice_task', 'task_card']) {
      const lines = read(`glossary:${id}`).join('\n');
      expect(lines, id).toContain('fetch the roster');
      expect(lines, id).toMatch(/sealed/i);
      expect(lines, id).not.toMatch(/SENTINEL_SEALED/);
    }
    expect(read('glossary:practice').join('\n')).toContain('fetch the roster');
  });

  it('her discipline and its ceremony: the steps done and the next, never a count', () => {
    for (const id of ['holder_punishment', 'punishment_card', 'ceremony']) {
      const lines = read(`glossary:${id}`).join('\n');
      expect(lines, id).toContain('a day without messages');
    }
    const c = read('glossary:ceremony').join('\n');
    expect(c).toContain('Fetch the implement');
    expect(c).toMatch(/Next: Name the number/);
  });

  it('protocol, routine, favour as a word, her permission, the hold, her postures, handovers and the record', () => {
    const s = full();
    expect(read('glossary:routine', s).join('\n')).toContain('her morning routine');
    expect(read('glossary:favour', s).join('\n')).toMatch(/warm/);
    expect(read('glossary:favour', s, { showRawValues: true }).join('\n')).not.toContain('11');
    expect(read('glossary:favour', s, { dynamicHidden: true }).join('\n')).toBe('[[dynamic_felt]]');
    for (const id of ['denial', 'ask_permission']) expect(read(`glossary:${id}`, s).join('\n'), id).toMatch(/refuse/i);
    expect(read('glossary:named_posture', s).join('\n')).toContain('the post');
    expect(read('glossary:handover', s).join('\n')).toMatch(/device/);
    expect(read('glossary:practice_record', s).join('\n')).toContain('Signed: the roster');
    const held = structuredClone(s);
    held.slot = 'morning';
    held.practices!.held = { by: ANN, since: { day: 20, slot: 'morning' }, until: { day: 20, slot: 'evening' }, sensory: false, extended: 0, bookingIds: ['bk1'] };
    held.personal = { seq: 9, bookings: [{ id: 'bk1', unitId: ANN, kindId: 'held_in_quarters', day: 20, slot: 'morning', status: 'booked', source: 'practice', made: 20 }] } as never;
    expect(read('glossary:held', held).join('\n')).toMatch(/end of the evening/);
    held.practices!.held.hidden = true;
    const hidden = read('glossary:held', held).join('\n');
    expect(hidden).toMatch(/not said how long/);
    expect(hidden).not.toMatch(/evening/);
    held.practices!.held.sensory = true;
    expect(read('glossary:sensory_mode', held).join('\n')).not.toMatch(/evening/);
  });

  it('a woman who holds nothing, or a campaign with no practices, reads nothing', () => {
    expect(read('glossary:practice_task', withService(world(reg, 'role')))).toEqual([]);
    expect(analyze('glossary:practice_task', { state: null, registries: reg, settings: settings() }, { unitId: ANN })).toEqual(['No campaign loaded.']);
  });

  it('registry readings: her punishment by its entry, the steps of a ceremony, an implement by what it leaves; the seeds have no player reading', () => {
    const s = full();
    expect(read('holderPunishments:no_messages', s).join('\n')).toContain('a day without messages');
    expect(read('holderPunishments:the_slap', s)).toEqual([]);
    expect(read('ceremonySteps:fetch_implement', s).join('\n')).toMatch(/done/i);
    expect(read('ceremonySteps:name_the_number', s).join('\n')).toMatch(/next/i);
    expect(read('ceremonySteps:the_thanks', s)).toEqual([]);
    expect(read('implements:belt', s).join('\n')).toMatch(/welt/);
    const sealed = holding({ punishments: [punishment({ sealed: true, summary: 'SENTINEL_SEALED_SUMMARY' })] });
    expect(read('holderPunishments:no_messages', sealed)).toEqual([]); // a sealed punishment does not say which kind it is
    expect(read(`practiceSeeds:${[...reg.practiceSeeds.keys()][0]}`, s)).toEqual([]);
  });

  it('every bare-source provider has a sample address', () => {
    expect(keysWithoutSample()).toEqual([]);
  });
});
