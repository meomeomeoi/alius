import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bondOf, defectAllowedFor, DESIRE_LEVELS, leadRank, LEAD_STYLES, MODEST_BOND, validateBond } from '../../../src/engine/bonds';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState } from '../../../src/engine/state/types';
import '../../../src/engine/actions/squad';
import { campaign, loadCore, run, errors } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN] = ['unit_ann'];

describe('bondOf and the ranks', () => {
  it('bondOf returns MODEST_BOND for a named unit without bond and null for a grunt', () => {
    const s = campaign(reg, 4);
    const named = s.squad[0];
    expect(bondOf(named)).toBe(MODEST_BOND);
    expect(MODEST_BOND).toEqual({ leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known' });
    expect(bondOf({ ...named, kind: 'grunt' })).toBeNull();
    withBond(s, ANN, { leadStyle: 'dominant' });
    expect(bondOf(s.squad[0])!.leadStyle).toBe('dominant');
  });

  it('the shared modest profile cannot be changed by a caller', () => {
    expect(Object.isFrozen(MODEST_BOND)).toBe(true);
    expect(Object.isFrozen(MODEST_BOND.ownLimits)).toBe(true);
  });

  it('leadRank orders yielding < balanced < assertive < dominant', () => {
    expect([...LEAD_STYLES]).toEqual(['yielding', 'balanced', 'assertive', 'dominant']);
    expect(LEAD_STYLES.map(leadRank)).toEqual([0, 1, 2, 3]);
    expect([...DESIRE_LEVELS]).toEqual(['low', 'medium', 'high']);
  });
});

describe('validateBond', () => {
  it('keeps a legal profile as it is', () => {
    const raw = { leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: true, ownLimits: { categories: ['restraint'], note: 'Never in front of the squad.' }, publicity: 'secret' };
    const r = validateBond(raw, reg);
    expect(r.issues).toEqual([]);
    expect(r.bond).toEqual(raw);
  });

  it('drops unknown limit ids and cuts the note at 160', () => {
    const r = validateBond({ ...MODEST_BOND, ownLimits: { categories: ['restraint', 'not_a_category', 'restraint', 7], note: 'x'.repeat(2000) } }, reg);
    expect(r.bond.ownLimits.categories).toEqual(['restraint']);
    expect(r.bond.ownLimits.note).toHaveLength(160);
    expect(r.issues.join('\n')).toMatch(/not_a_category/);
    expect(r.issues.join('\n')).toMatch(/note/);
  });

  it('a hostile section becomes modest defaults per field, never throws', () => {
    const r = validateBond({ leadStyle: 'tyrant', attachment: 7, desire: null, caretaker: 'yes', ownLimits: 'everything', publicity: ['public'] }, reg);
    expect(r.bond).toEqual(MODEST_BOND);
    expect(r.issues).toHaveLength(6);
    for (const raw of [null, 'bond', 42, [], undefined]) {
      const x = validateBond(raw, reg);
      expect(x.bond).toEqual(MODEST_BOND);
    }
    expect(validateBond(null, reg).issues).toHaveLength(1);
    expect(validateBond(undefined, reg).issues).toEqual([]);
  });

  it('a good field survives next to a bad one', () => {
    const r = validateBond({ leadStyle: 'assertive', attachment: 'huge', desire: 'high' }, reg);
    expect(r.bond).toMatchObject({ leadStyle: 'assertive', attachment: 'steady', desire: 'high', caretaker: false });
    expect(r.issues).toHaveLength(1);
  });

  it('the result never shares arrays with its input or with MODEST_BOND', () => {
    const raw = { ownLimits: { categories: ['restraint'] } };
    const r = validateBond(raw, reg);
    r.bond.ownLimits.categories.push('humiliation');
    expect(raw.ownLimits.categories).toEqual(['restraint']);
    expect(MODEST_BOND.ownLimits.categories).toEqual([]);
  });
});

/** A registry where one ordinary defect needs a caretaker. */
const withCaretakerDefect = (): Registries => {
  const r = structuredClone(reg);
  r.defects.set('needs_caretaker', { ...structuredClone(r.defects.get('echo_bleed')!), id: 'needs_caretaker', requiresBond: { caretaker: true } });
  return r;
};

describe('defects that need a bond', () => {
  it('defectAllowedFor reads requiresBond, never an id', () => {
    const r = withCaretakerDefect();
    expect(defectAllowedFor(r, 'echo_bleed', null)).toBe(true);
    expect(defectAllowedFor(r, 'needs_caretaker', null)).toBe(false);
    expect(defectAllowedFor(r, 'needs_caretaker', MODEST_BOND)).toBe(false);
    expect(defectAllowedFor(r, 'needs_caretaker', { ...MODEST_BOND, caretaker: true })).toBe(true);
    expect(defectAllowedFor(r, 'no_such_defect', null)).toBe(true);
  });
});

describe('removeFromService (Review Focus 5)', () => {
  it('forgets her rules, smother and want', () => {
    const s = campaign(reg, 4);
    s.relations[ANN].want = 80;
    s.relations[ANN].wantBreakDay = 3;
    s.relations['unit_bea'].want = 55;
    s.bonds = {
      rules: [
        { id: 'r1', unitId: ANN, templateId: 't', text: 'x', status: 'active', day: 1, brokenCount: 0 },
        { id: 'r2', unitId: 'unit_bea', templateId: 't', text: 'y', status: 'proposed', day: 1, brokenCount: 0 },
      ],
      smother: { unitId: ANN, untilDay: 9 },
    };
    const d: CampaignState = structuredClone(s);
    removeFromService(d, ANN, 'deserted');
    expect(d.bonds!.rules.map((r) => r.id)).toEqual(['r2']);
    expect(d.bonds!.smother).toBeUndefined();
    expect(d.relations[ANN].want).toBeUndefined();
    expect(d.relations[ANN].wantBreakDay).toBeUndefined();
    expect(d.relations['unit_bea'].want).toBe(55);
  });

  it('leaves a save without P9d fields alone', () => {
    const s = campaign(reg, 4);
    const d = structuredClone(s);
    removeFromService(d, ANN, 'terminated');
    expect(d.bonds).toBeUndefined();
    expect(Object.keys(d.relations[ANN])).not.toContain('want');
  });

  it('keeps a smother held for someone else', () => {
    const s = campaign(reg, 4);
    s.bonds = { rules: [], smother: { unitId: 'unit_bea', untilDay: 9 } };
    removeFromService(s, ANN, 'deserted');
    expect(s.bonds.smother).toEqual({ unitId: 'unit_bea', untilDay: 9 });
  });
});

describe('squad/resync with bond', () => {
  it('replaces the profile and keeps want and publicity', () => {
    const s = campaign(reg, 4);
    s.relations[ANN].want = 42;
    s.relations[ANN].publicity = { level: 'secret', since: 2 };
    const bond = { leadStyle: 'dominant', attachment: 'intense', desire: 'high', caretaker: false, ownLimits: { categories: ['restraint'], note: 'Not in public.' }, publicity: 'secret' };
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { bond } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.events).toEqual([{ type: 'unit_resynced', unitId: ANN, sections: ['bond'] }]);
    expect(r.state.squad[0].bond).toEqual(bond);
    expect(r.state.relations[ANN].want).toBe(42);
    expect(r.state.relations[ANN].publicity).toEqual({ level: 'secret', since: 2 });
    // nothing else of the unit moved
    expect({ ...r.state.squad[0], bond: undefined }).toEqual({ ...s.squad[0], bond: undefined });
  });

  it('an illegal profile is refused and changes nothing', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { bond: { leadStyle: 'tyrant' } } } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });

  it('removing the caretaker flag from a unit who holds a caretaker-only defect is refused', () => {
    const r0 = withCaretakerDefect();
    const s = campaign(r0, 4);
    s.squad[0].bond = { ...MODEST_BOND, caretaker: true, ownLimits: { categories: [] } };
    s.squad[0].defects = [{ id: 'needs_caretaker' }];
    const r = run(s, r0, { type: 'squad/resync', payload: { unitId: ANN, patch: { bond: { ...MODEST_BOND, caretaker: false } } } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state.squad[0].bond!.caretaker).toBe(true);
  });
});
