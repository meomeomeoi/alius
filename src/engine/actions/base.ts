import { GENERATED_NAME, GRUNT_BIO_MAX, generateGrunt, gruntRelation } from '../grunts';
import { activeRosterUnits, checkRecruit, checkUpgrade, facilityLevel, facilityLevels, isLiving } from '../economy';
import { registerAction } from '../dispatch';
import { TUNING } from '../tuning';

// Importing this module registers the base and roster actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('base/upgrade', (draft, payload, ctx) => {
  const id = isObj(payload) ? payload.facilityId : undefined;
  if (typeof id !== 'string') throw new Error('base/upgrade needs { facilityId }');
  const reason = checkUpgrade(draft, ctx.registries, id);
  if (reason) throw new Error(reason);
  const level = facilityLevel(draft, id);
  const up = facilityLevels(ctx.registries, id)[level].upgrade!;

  draft.resources.credits -= up.credits;
  draft.resources.plyx -= up.plyx;
  (draft.base.upgrades ??= []).push({ facilityId: id, toLevel: level + 1, daysLeft: up.days });
  return [
    { type: 'resource_changed', resource: 'credits', amount: -up.credits },
    { type: 'resource_changed', resource: 'plyx', amount: -up.plyx },
    { type: 'upgrade_started', facilityId: id, toLevel: level + 1, days: up.days },
  ];
});

/** Closes the supply loop until expeditions (P5) bring supplies: credits → supplies at a fixed rate. */
registerAction('base/requisition', (draft, payload) => {
  const n = isObj(payload) ? payload.supplies : undefined;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new Error('base/requisition: supplies must be a positive integer');
  const credits = n * TUNING.requisition.creditsPerSupply;
  if (draft.resources.credits < credits) throw new Error(`Not enough credits: ${n} supplies cost ${credits}.`);
  draft.resources.credits -= credits;
  draft.resources.supplies += n;
  return [{ type: 'requisitioned', supplies: n, credits }];
});

registerAction('roster/set_active', (draft, payload) => {
  const ids = isObj(payload) ? payload.activeIds : undefined;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) throw new Error('roster/set_active needs { activeIds: string[] }');
  if (ids.length === 0 && draft.squad.some(isLiving)) throw new Error('The active roster needs at least one unit.');
  if (ids.length > TUNING.rosterActiveMax) throw new Error(`The active roster holds at most ${TUNING.rosterActiveMax} units.`);
  if (new Set(ids).size !== ids.length) throw new Error('A unit was listed twice.');
  for (const id of ids) {
    const u = draft.squad.find((x) => x.id === id);
    if (!u || !isLiving(u)) throw new Error(`Unit "${id}" cannot join the active roster.`);
  }
  const chosen = new Set(ids);
  for (const u of draft.squad) {
    if (chosen.has(u.id)) {
      if (u.status === 'reserve') u.status = 'active';
    } else if (u.status === 'active') {
      u.status = 'reserve';
    }
  }
  draft.roster.activeIds = [...ids];
  return [{ type: 'roster_changed', activeIds: [...ids] }];
});

registerAction('base/recruit_grunt', (draft, _payload, ctx) => {
  const reason = checkRecruit(draft);
  if (reason) throw new Error(reason);
  // dead units leave the active list before the newcomer takes a place
  draft.roster.activeIds = activeRosterUnits(draft).map((u) => u.id);
  const grunt = generateGrunt(draft, ctx.registries, ctx.rng);
  draft.resources.credits -= TUNING.recruit.credits;
  draft.squad.push(grunt);
  draft.relations[grunt.id] = gruntRelation(draft, ctx.registries);
  if (grunt.status === 'active') draft.roster.activeIds.push(grunt.id);
  return [
    { type: 'resource_changed', resource: 'credits', amount: -TUNING.recruit.credits },
    { type: 'grunt_recruited', unitId: grunt.id, designation: grunt.designation },
  ];
});

/** Applies a generated name and bio to a grunt (the designation stays). The numbers never change. */
registerAction('squad/set_flavor', (draft, payload) => {
  const p = isObj(payload) ? payload : {};
  const unit = draft.squad.find((u) => u.id === p.unitId);
  if (!unit || unit.kind !== 'grunt') throw new Error('squad/set_flavor: only grunts take a generated name');
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!GENERATED_NAME.test(name)) throw new Error('squad/set_flavor: the name must be 1 to 24 letters, digits, spaces, apostrophes or hyphens');
  if (typeof p.bio !== 'string' || p.bio.length > GRUNT_BIO_MAX) throw new Error(`squad/set_flavor: the bio must be at most ${GRUNT_BIO_MAX} characters`);
  unit.displayName = name;
  unit.bio = p.bio.trim();
  return [{ type: 'unit_flavored', unitId: unit.id, name }];
});
