import type { Registries } from '../content/types';
import { retrieveFacts, openPromises } from '../engine/memory';
import { affinityBand, attractionBand, stressBand, trustBand } from '../engine/relations/bands';
import { intimacyOf } from '../engine/relations/gain';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import type { AliusSettings } from '../settings';

const SLOT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' } as const;
const SOCIAL_STATS = ['authority', 'insight', 'empathy', 'cunning'] as const;
const CRIME_SUMMARY_MAX = 160;

interface Deps {
  registries: () => Registries;
  settings: () => AliusSettings;
}

const nameOf = (s: CampaignState, id: string): string => {
  if (id === 'commander') return s.commander.name;
  return s.squad.find((u) => u.id === id)?.displayName ?? id;
};

function presentUnits(s: CampaignState) {
  return (s.scene?.participants ?? []).map((id) => s.squad.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => u !== undefined);
}

/**
 * Registers the scene context providers: header, units, commander, facts, promises. All render nothing without an open
 * scene. A fact reaches the prompt only if every present participant knows it.
 */
export function registerSceneContext(builder: ContextBuilder, deps: Deps): void {
  builder.register({
    id: 'scene_header', priority: 95,
    render: (s) => {
      if (!s.scene) return null;
      const loc = deps.registries().locations.get(s.scene.locationId);
      const units = presentUnits(s);
      const place = loc?.perUnit === true && units[0] ? `${units[0].displayName}'s quarters` : String(loc?.name ?? s.scene.locationId);
      return `Scene: ${place}, Day ${s.day} ${SLOT_LABEL[s.slot]}. Present: ${units.map((u) => u.displayName).join(', ')}. ${s.scene.mode === 'group' ? 'Group' : 'Private'}.`;
    },
  });

  builder.register({
    id: 'units', priority: 90,
    render: (s) => {
      if (!s.scene) return null;
      const reg = deps.registries();
      const raw = deps.settings().showRawValues;
      const romance = intimacyOf(s).romance;
      const num = (n: number) => (raw ? ` (${n})` : '');
      const here = new Set(s.scene?.participants ?? []);
      return presentUnits(s).map((u) => {
        const rel = s.relations[u.id];
        if (!rel) return `${u.displayName}`;
        // a concealed romance is shown with its cover while the partner it is hidden from is in the room
        const covered = rel.affair?.hiddenFrom.some((id) => here.has(id)) === true;
        const st = reg.relationshipStates.get(covered ? 'comrade' : rel.stateId);
        const axes = [
          `trust ${trustBand(rel.trust)}${num(rel.trust)}`,
          `affinity ${affinityBand(rel.affinity)}${num(rel.affinity)}`,
          ...(romance && !covered ? [`attraction ${attractionBand(rel.attraction)}${num(rel.attraction)}`] : []),
        ].join(', ');
        const defects = u.defects.map((d) => {
          const def = reg.defects.get(d.id);
          return def ? `; defect ${String(def.name)}: ${String(def.social)}` : '';
        }).join('');
        return `${u.displayName} — state ${String(st?.name ?? 'Comrade')}${st ? ` (${String(st.promptHint)})` : ''}; ${axes}; stress ${stressBand(u.stress)}${num(u.stress)}${defects}`;
      }).join('\n');
    },
  });

  builder.register({
    id: 'commander', priority: 80,
    render: (s) => {
      if (!s.scene) return null;
      const reg = deps.registries();
      const corp = s.commander.corporationId ? reg.corporations.get(s.commander.corporationId) : undefined;
      const notable = SOCIAL_STATS.filter((k) => s.commander.socialStats[k] >= 3).map((k) => `${k} ${s.commander.socialStats[k]}`);
      const lines = [`Commander: ${s.commander.name}${corp ? ` (${String(corp.name)})` : ''}.${notable.length > 0 ? ` Notable: ${notable.join(', ')}.` : ''}`];
      const crime = s.commander.crimeId ? reg.crimes.get(s.commander.crimeId) : undefined;
      if (crime) {
        const units = presentUnits(s);
        const knows = units.filter((u) => s.relations[u.id]?.flags.includes('knows_crime'));
        const ignorant = units.filter((u) => !s.relations[u.id]?.flags.includes('knows_crime'));
        // the prompt is shared by everyone present: the crime is named only when nobody present is in the dark
        if (knows.length > 0 && ignorant.length === 0) {
          lines.push(`Crime: ${String(crime.name)} — ${String(crime.summary).slice(0, CRIME_SUMMARY_MAX)} (known to ${knows.map((u) => u.displayName).join(', ')}).`);
        } else if (ignorant.length > 0) {
          lines.push(`Crime: unknown to ${ignorant.map((u) => u.displayName).join(', ')}.${knows.length > 0 ? ' Do not bring it up while they are present.' : ''}`);
        }
      }
      return lines.join('\n');
    },
  });

  builder.register({
    id: 'facts', priority: 70,
    render: (s) => {
      if (!s.scene) return null;
      const units = presentUnits(s);
      const tags = units.flatMap((u) => [...u.likes, ...u.dislikes]);
      const facts = retrieveFacts(s, { participants: s.scene.participants, tags });
      if (facts.length === 0) return null;
      return ['Known facts:', ...facts.map((f) => `- ${f.text}`)].join('\n');
    },
  });

  builder.register({
    id: 'promises', priority: 60,
    render: (s) => {
      if (!s.scene) return null;
      const open = openPromises(s, s.scene.participants, s.scene.participants);
      if (open.length === 0) return null;
      return ['Open promises:', ...open.map((p) => `- ${nameOf(s, p.by)} promised ${nameOf(s, p.to)}: ${p.text}`)].join('\n');
    },
  });
}

/** Scene-scoped directives from the settings: the explicit-content rule and, with romance off, a ban on romance. */
export function sceneDirectives(builder: ContextBuilder, state: CampaignState, settings: AliusSettings): void {
  builder.setDirective({
    id: 'explicit', expiresAfter: 'scene',
    text: settings.explicitContent ? 'Explicit content: allowed.' : 'Explicit content: not allowed; fade out intimate moments.',
  });
  if (!intimacyOf(state).romance) {
    builder.setDirective({
      id: 'romance_off', expiresAfter: 'scene',
      text: 'Romance is disabled in this campaign: nobody starts or answers romantic or sexual advances; keep every relationship non-romantic.',
    });
  } else {
    builder.clearDirective('romance_off');
  }
}

export function clearSceneDirectives(builder: ContextBuilder): void {
  builder.clearDirective('explicit');
  builder.clearDirective('romance_off');
}
