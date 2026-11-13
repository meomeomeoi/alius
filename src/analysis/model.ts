import type { Entry, Registries, RegistryName } from '../content/types';
import { REGISTRY_NAMES } from '../content/types';
import type { CampaignState } from '../engine/state/types';
import type { AliusSettings } from '../settings';
import { entryText, entryTitle } from './describe';
import { entryEffects } from './effects';
import { readingFor } from './providers';
import type { Subject } from './subject';

/** Everything a panel may read: content, the open campaign (if any) and the settings. */
export interface AnalyzeEnv {
  registries: Registries;
  state: CampaignState | null;
  settings: AliusSettings;
}

/** What a panel shows. Strings may carry `[[link]]` markup; the UI never parses them as HTML. */
export interface PanelModel {
  address: string;
  source: string;
  title: string;
  text: string | null;
  long: string | null;
  effects: string[];
  see: string[];
  reading: { lines: string[] } | null;
  missing: boolean;
}

const missing = (subject: Subject): PanelModel => ({
  address: subject.address, source: subject.source, title: 'NO DATA', text: subject.address,
  long: null, effects: [], see: [], reading: null, missing: true,
});

function glossaryModel(subject: Subject, entry: Entry, env: AnalyzeEnv): PanelModel {
  return {
    address: subject.address,
    source: subject.source,
    title: entryTitle('glossary', entry),
    text: entryText('glossary', entry),
    long: typeof entry.long === 'string' ? entry.long : null,
    effects: [],
    see: Array.isArray(entry.see) ? entry.see.map(String) : [],
    reading: readingFor(subject, env),
    missing: false,
  };
}

/** Turns a subject into a panel: static text from content, effects and readings added by later layers. */
export function buildPanelModel(subject: Subject, env: AnalyzeEnv): PanelModel {
  const { registries } = env;
  if (subject.source === 'setting') {
    const entry = registries.glossary.get(`setting_${subject.id}`);
    return entry ? glossaryModel(subject, entry, env) : missing(subject);
  }
  if (!(REGISTRY_NAMES as readonly string[]).includes(subject.source)) return missing(subject);
  const registry = subject.source as RegistryName;
  const entry = registries[registry].get(subject.id);
  if (!entry) return missing(subject);
  if (registry === 'glossary') return glossaryModel(subject, entry, env);
  return {
    address: subject.address,
    source: subject.source,
    title: entryTitle(registry, entry),
    text: entryText(registry, entry),
    long: null,
    effects: entryEffects(registry, entry, registries),
    see: [],
    reading: readingFor(subject, env),
    missing: false,
  };
}
