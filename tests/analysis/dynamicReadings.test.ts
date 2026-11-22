import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { buildKnowledge } from '../../src/analysis/knowledge';
import { CORE_GLOSSARY_IDS, registerCoreProviders } from '../../src/analysis/providers/core';
import type { Registries } from '../../src/content/types';
import { addCompromat, mentionCompromat } from '../../src/engine/dynamic/compromat';
import { blankDynamic, blankReading, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { DYNAMIC_KNOWLEDGE_TAG } from '../../src/engine/dynamic/types';
import { expectTag, zoneTag } from '../../src/engine/dynamic/zones';
import { addFact } from '../../src/engine/memory/facts';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { keysWithoutSample } from '../helpers/analyze';
import { analyze } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const settings = (over: Partial<AliusSettings> = {}): AliusSettings => ({ ...DEFAULT_SETTINGS, ...over });
const envOf = (s: CampaignState, over: Partial<AliusSettings> = {}): AnalyzeEnv => ({ state: s, registries: reg, settings: settings(over) });

/** Ann holds at role (the device); her profile says a lot, and nothing of it has been shown. Bea is a woman who watches. */
function world(): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  unitOf(s, ANN).expectations = {
    holdsUntil: 'limit', tells: { irritation: 'she taps the table', pleasure: 'she hums' }, scent: { base: { feet: 4 } },
    worship: { feet: { attitude: 'craves', meaning: 'intimacy' }, hands: { attitude: 'dislikes' } },
  };
  s.content = { enabled: ['restraint', 'worship'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = {
    ...blankDynamic(s.day), frame: 'role', hold: 62, domains: [{ id: 'device', since: 1 }], tracks: { restraint: { xp: 40, level: 2 } },
    readOf: { ...blankReading(), region: 'proud', updates: 4 },
  };
  s.relations[ANN].regard = 61.61;
  s.dynamic.knowledge = { [BEA]: { [ANN]: { suspicion: 59.59, level: 'knows_dynamic', levelDay: 3 } } };
  return s;
}

describe('Knowledge.dynamic', () => {
  it('the view shows only what the commander could know', () => {
    const s = world();
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander once did something.', [BEA]);
    addFact(s, { about: [BEA, ANN], text: 'AUTHOR TO WRITE: Bea knows that Ann holds authority over the commander.', tags: [DYNAMIC_KNOWLEDGE_TAG, 'knows_dynamic'], importance: 3, day: 3, knownBy: [BEA], hiddenFromCommander: true });
    s.relations[ANN].dynamic!.probes.answers = ['yielded'];
    let view = buildKnowledge(s, settings()).dynamic(ANN, reg);
    expect(view.expectations).toEqual({}); // nothing of her profile was shown
    expect(view.compromat).toEqual([]); // she has not mentioned it
    expect(view.knownLevels).toEqual([]); // Bea has not shown what she knows
    expect(JSON.stringify(view)).not.toMatch(/regard|61\.61|59\.59|taps the table|AUTHOR TO WRITE: the commander/i); // Regard, suspicion, tells and unmentioned compromat: never
    expect(Object.keys(view)).not.toContain('regard');

    // a fact of hers shows one field; her tells stay hers
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: Ann goes on until she says stop.', tags: [expectTag('holdsUntil')], importance: 2, day: 4, knownBy: [ANN] });
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: Ann likes her feet looked after.', tags: [zoneTag('feet')], importance: 2, day: 4, knownBy: [ANN] });
    mentionCompromat(s, undefined, ANN, undefined, 'the commander once did something');
    delete s.memory.facts.find((f) => f.tags.includes(DYNAMIC_KNOWLEDGE_TAG))!.hiddenFromCommander; // Bea showed it in a later scene
    view = buildKnowledge(s, settings()).dynamic(ANN, reg);
    expect(view.expectations.holdsUntil).toBe('limit');
    expect(view.expectations.worship).toEqual({ feet: { attitude: 'craves', meaning: 'intimacy' } }); // not the hands she dislikes
    expect(view.expectations.tells).toBeUndefined();
    expect(view.compromat.map((f) => f.text)).toEqual(['AUTHOR TO WRITE: the commander once did something.']);
    expect(view.knownLevels).toEqual([{ observerId: BEA, level: 'knows_dynamic' }]);
  });

  it('its frame, band, domains, tracks, vow and her reading, as words', () => {
    const s = world();
    s.dynamic!.open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'body', day: s.day });
    s.relations[ANN].dynamic!.sworn = { day: 3 };
    const view = buildKnowledge(s, settings()).dynamic(ANN, reg);
    expect(view.frame).toBe('Role');
    expect(view.band).toBe('Owning');
    expect(view.raw).toBeUndefined();
    expect(view.domains.find((d) => d.id === 'device')).toMatchObject({ label: 'The device', claimed: true });
    expect(view.domains.find((d) => d.id === 'household')).toMatchObject({ claimed: false }); // she may claim it
    expect(view.domains.find((d) => d.id === 'body')).toBeUndefined(); // already asked
    expect(view.tracks).toEqual([{ id: 'restraint', band: 'some' }]);
    expect(view.sworn).toBe(true);
    expect(view.reading).toBe('proud');
    expect(view.heldBy).toEqual([{ unitId: ANN, domains: ['device'] }]);
    expect(buildKnowledge(s, settings({ showRawValues: true })).dynamic(ANN, reg).raw).toBe(62);
  });

  it('a woman with no dynamic, and no campaign, give an empty view', () => {
    const s = world();
    const empty = buildKnowledge(s, settings()).dynamic(BEA, reg);
    expect(empty).toMatchObject({ domains: [], tracks: [], sworn: false, expectations: {}, signs: [], compromat: [], knownLevels: [] });
    expect(empty.frame).toBeUndefined();
    expect(buildKnowledge(null, settings()).dynamic(ANN, reg)).toMatchObject({ domains: [], heldBy: [] });
    s.content = { enabled: [] }; // off
    expect(buildKnowledge(s, settings()).dynamic(ANN, reg)).toMatchObject({ domains: [], heldBy: [], sworn: false });
  });

  it('immersive: band is felt and the analyze answer is glossary:dynamic_felt', () => {
    const s = world();
    const view = buildKnowledge(s, settings({ dynamicHidden: true, showRawValues: true })).dynamic(ANN, reg);
    expect(view.band).toBe('felt');
    expect(view.frame).toBeUndefined();
    expect(view.raw).toBeUndefined(); // never in immersive mode, even with raw values on
    expect(view.tracks.map((t) => t.band)).toEqual(['felt']);
    for (const address of ['glossary:hold', 'glossary:frame', 'dynamicTracks:restraint']) {
      const lines = analyze(address, envOf(s, { dynamicHidden: true, showRawValues: true }), { unitId: ANN }).join(' ');
      expect(lines, address).toContain('[[dynamic_felt]]');
      expect(lines, address).not.toMatch(/\b62\b|owning|Owning|role|Role/);
    }
    expect(reg.glossary.get('dynamic_felt')).toBeDefined();
  });
});

describe('the providers', () => {
  it('hold: the band, and the number only with raw values', () => {
    const s = world();
    const plain = analyze('glossary:hold', envOf(s), { unitId: ANN }).join(' ');
    expect(plain).toContain('Owning');
    expect(plain).not.toContain('62');
    expect(analyze('glossary:hold', envOf(s, { showRawValues: true }), { unitId: ANN }).join(' ')).toContain('62');
  });

  it('frame, domain, track, her reading and the dynamic read what is hers', () => {
    const s = world();
    s.dynamic!.open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'body', day: s.day });
    expect(analyze('glossary:frame', envOf(s), { unitId: ANN }).join(' ')).toContain('Role');
    expect(analyze('dynamicFrames:play', envOf(s), { unitId: ANN }).join(' ')).not.toContain('Ann is here');
    expect(analyze('dynamicFrames:role', envOf(s), { unitId: ANN }).join(' ')).toContain('Ann');
    expect(analyze('dynamicDomains:device', envOf(s), { unitId: ANN }).join(' ')).toMatch(/holds it/);
    expect(analyze('dynamicDomains:household', envOf(s), { unitId: ANN }).join(' ')).toMatch(/may claim/);
    expect(analyze('dynamicDomains:body', envOf(s), { unitId: ANN }).join(' ')).toMatch(/asked/);
    expect(analyze('dynamicTracks:restraint', envOf(s), { unitId: ANN }).join(' ')).toContain('some');
    expect(analyze('dynamicTracks:restraint', envOf(s), { unitId: ANN }).join(' ')).not.toContain('40');
    expect(analyze('glossary:her_reading', envOf(s), { unitId: ANN }).join(' ')).toContain('proud');
    expect(analyze('glossary:her_reading', envOf(s), { unitId: BEA })).toEqual([]);
    const all = analyze('glossary:dynamic', envOf(s), { unitId: ANN }).join(' ');
    expect(all).toContain('Role');
    expect(all).toContain('The device');
  });

  it('the body map\'s zones read only what has been shown, with the mastery level and never the xp', () => {
    const s = world();
    s.relations[ANN].mastery = { feet: 23.23 }; // level one: the xp never shows
    expect(analyze('worshipTargets:feet', envOf(s), { unitId: ANN }).join(' ')).toMatch(/Not known yet/i);
    addFact(s, { about: [ANN], text: 'AUTHOR TO WRITE: Ann likes her feet looked after.', tags: [zoneTag('feet')], importance: 2, day: 4, knownBy: [ANN] });
    const text = analyze('worshipTargets:feet', envOf(s), { unitId: ANN }).join(' ');
    expect(text).toMatch(/craves/i);
    expect(text).toMatch(/one of five/);
    expect(text).not.toContain('23');
    expect(text).toContain('Shown: Ann likes her feet looked after.'); // the fact that showed it (M16)
    expect(buildKnowledge(s, { ...DEFAULT_SETTINGS }).dynamic(ANN, reg).zones.feet).toEqual({ mastery: 1, facts: ['AUTHOR TO WRITE: Ann likes her feet looked after.'] });
    s.memory.facts.at(-1)!.hiddenFromCommander = true;
    expect(analyze('worshipTargets:feet', envOf(s), { unitId: ANN }).join(' ')).not.toContain('Shown:');
    delete s.memory.facts.at(-1)!.hiddenFromCommander;
    expect(analyze('worshipTargets:hands', envOf(s), { unitId: ANN }).join(' ')).not.toMatch(/dislikes/i); // hers: not shown
  });

  it('the compromat she has mentioned is read, the rest is not', () => {
    const s = world();
    addCompromat(s, ANN, 'AUTHOR TO WRITE: the commander once did something.', []);
    expect(analyze('glossary:compromat', envOf(s), { unitId: ANN }).join(' ')).not.toContain('did something');
    mentionCompromat(s, undefined, ANN, undefined, 'the commander once did something');
    expect(analyze('glossary:compromat', envOf(s), { unitId: ANN }).join(' ')).toContain('did something');
  });

  it('what others know of her is read only once they have shown it', () => {
    const s = world();
    expect(analyze('glossary:dynamic', envOf(s), { unitId: ANN }).join(' ')).not.toMatch(/Bea/);
    addFact(s, { about: [BEA, ANN], text: 'AUTHOR TO WRITE: Bea knows that Ann holds authority over the commander.', tags: [DYNAMIC_KNOWLEDGE_TAG, 'knows_dynamic'], importance: 3, day: 3, knownBy: [BEA] });
    expect(analyze('glossary:dynamic', envOf(s), { unitId: ANN }).join(' ')).toMatch(/Bea knows/);
  });

  it('nothing is read for a campaign without the dynamic', () => {
    const s = world();
    s.content = { enabled: [] };
    for (const a of ['glossary:hold', 'glossary:frame', 'glossary:dynamic', 'glossary:her_reading', 'dynamicDomains:device', 'dynamicTracks:restraint', 'glossary:compromat']) {
      expect(analyze(a, envOf(s), { unitId: ANN }), a).toEqual([]);
    }
  });

  it('every provider key has a sample address', () => {
    expect(keysWithoutSample()).toEqual([]);
  });
});

describe('the glossary', () => {
  it('the glossary ids match CORE_GLOSSARY_IDS exactly', () => {
    const wanted = ['dynamic', 'hold', 'frame', 'domain', 'milestone', 'vow', 'aftermath', 'leash_block', 'oversight_inquiry', 'compromat', 'regard', 'her_reading', 'probe', 'offer', 'mastery', 'body_map', 'holder_override', 'dynamic_felt', 'dynamic_exit'];
    for (const id of wanted) {
      expect(reg.glossary.has(id), id).toBe(true);
      expect(CORE_GLOSSARY_IDS, id).toContain(id);
    }
    expect(reg.glossary.has('setting_dynamic_hidden')).toBe(true);
    const concepts = [...reg.glossary.keys()].filter((id) => !id.startsWith('setting_')).sort();
    expect(concepts).toEqual([...CORE_GLOSSARY_IDS].sort());
    for (const id of wanted) expect(String(reg.glossary.get(id)!.short).length, id).toBeGreaterThan(20);
  });

  it('Regard is explained and never read', () => {
    const s = world();
    expect(analyze('glossary:regard', envOf(s), { unitId: ANN })).toEqual([]);
    expect(String(reg.glossary.get('regard')!.short)).toMatch(/hers|her own/i);
  });
});
