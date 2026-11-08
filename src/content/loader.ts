import { BaseEntrySchema, registrySchemas } from './schemas';
import { getRefExtractors } from './refs';
import {
  PackManifestSchema, REGISTRY_NAMES, emptyRegistries,
  type ContentError, type Entry, type PackManifest, type RegistryName, type Registries,
} from './types';

export { registerRefs } from './refs';

type Raw = Record<string, unknown>;
interface Origin { entry: Raw; pack: string; file: string; index: number }
type Fetch = (path: string) => Promise<unknown>;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlain = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge recursively, arrays and primitives are replaced. */
function deepMerge(base: Raw, over: Raw): Raw {
  const out: Raw = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (UNSAFE_KEYS.has(k)) continue;
    const cur = out[k];
    out[k] = isPlain(cur) && isPlain(v) ? deepMerge(cur, v) : structuredClone(v);
  }
  return out;
}

function fmtPath(path: ReadonlyArray<string | number>, index?: number): string {
  let s = index === undefined ? '' : `[${index}]`;
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : s === '' ? p : `.${p}`;
  return s;
}

const settle = (fetchJson: Fetch, path: string) =>
  fetchJson(path).then(
    (value) => ({ ok: true as const, value }),
    (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }),
  );

export async function loadPacks(
  packRoots: string[],
  fetchJson: Fetch,
): Promise<{ registries: Registries; errors: ContentError[] }> {
  const errors: ContentError[] = [];

  // 1. manifests
  const manifestResults = await Promise.all(packRoots.map((root) => settle(fetchJson, `${root}/manifest.json`)));
  const packs: Array<{ root: string; manifest: PackManifest }> = [];
  manifestResults.forEach((res, i) => {
    const root = packRoots[i];
    if (!res.ok) {
      errors.push({ pack: root, file: 'manifest.json', path: '', message: res.message });
      return;
    }
    const parsed = PackManifestSchema.safeParse(res.value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ pack: root, file: 'manifest.json', path: fmtPath(issue.path), message: issue.message });
      }
      return;
    }
    packs.push({ root, manifest: parsed.data });
  });
  packs.sort((a, b) => a.manifest.priority - b.manifest.priority);

  // 2. registry files
  const jobs = packs.flatMap(({ root, manifest }) =>
    (Object.entries(manifest.files) as Array<[RegistryName, string]>).map(([registry, file]) => ({
      pack: manifest.id, root, registry, file,
    })),
  );
  const fileResults = await Promise.all(jobs.map((j) => settle(fetchJson, `${j.root}/${j.file}`)));

  // 3. collect raw entries, in priority order, as per-id version chains
  const versions = Object.fromEntries(REGISTRY_NAMES.map((n) => [n, new Map<string, Origin[]>()])) as Record<
    RegistryName, Map<string, Origin[]>
  >;
  jobs.forEach((job, ji) => {
    const res = fileResults[ji];
    const err = (path: string, message: string) => errors.push({ pack: job.pack, file: job.file, path, message });
    if (!res.ok) return err('', res.message);
    if (!Array.isArray(res.value)) return err('', 'registry file must contain a JSON array');
    const seen = new Set<string>();
    res.value.forEach((raw, index) => {
      const parsed = BaseEntrySchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) err(fmtPath(issue.path, index), issue.message);
        return;
      }
      const id = parsed.data.id;
      if (seen.has(id)) return err(fmtPath(['id'], index), `duplicate id "${id}" in this file`);
      seen.add(id);
      const chain = versions[job.registry].get(id) ?? [];
      chain.push({ entry: raw as Raw, pack: job.pack, file: job.file, index });
      versions[job.registry].set(id, chain);
    });
  });

  // 4. resolve `extends` (after all packs are in)
  const resolved = new Map<string, Raw | null>();
  const visiting = new Set<string>();
  const resolve = (reg: RegistryName, id: string, k: number): Raw | null => {
    const key = `${reg}\0${id}\0${k}`;
    if (resolved.has(key)) return resolved.get(key)!;
    const origin = versions[reg].get(id)![k];
    const fail = (message: string): null => {
      errors.push({ pack: origin.pack, file: origin.file, path: fmtPath(['extends'], origin.index), message });
      resolved.set(key, null);
      return null;
    };
    const { extends: ext, ...rest } = origin.entry;
    if (ext === undefined) {
      resolved.set(key, rest);
      return rest;
    }
    const baseRef = ext === id ? { id, k: k - 1 } : { id: ext as string, k: (versions[reg].get(ext as string)?.length ?? 0) - 1 };
    if (baseRef.k < 0) {
      return fail(ext === id ? `"${id}" extends itself but no lower-priority definition exists` : `extends unknown ${reg} id "${ext}"`);
    }
    if (visiting.has(key)) return fail(`extends cycle through "${id}"`);
    visiting.add(key);
    const base = resolve(reg, baseRef.id, baseRef.k);
    visiting.delete(key);
    if (base === null) {
      resolved.set(key, null);
      return null;
    }
    const merged = deepMerge(base, rest);
    merged.id = id;
    resolved.set(key, merged);
    return merged;
  };

  // 5. validate resolved entries against their registry schema
  const registries = emptyRegistries();
  const finalOrigin = new Map<string, Origin>();
  for (const reg of REGISTRY_NAMES) {
    for (const [id, chain] of versions[reg]) {
      const k = chain.length - 1;
      const entry = resolve(reg, id, k);
      if (entry === null) continue;
      const origin = chain[k];
      const parsed = registrySchemas[reg].safeParse(entry);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ pack: origin.pack, file: origin.file, path: fmtPath(issue.path, origin.index), message: issue.message });
        }
        continue;
      }
      registries[reg].set(id, parsed.data as Entry);
      finalOrigin.set(`${reg}\0${id}`, origin);
    }
  }

  // 6. cross-references, reported together
  for (const [reg, list] of getRefExtractors()) {
    for (const [id, entry] of registries[reg]) {
      const origin = finalOrigin.get(`${reg}\0${id}`)!;
      for (const extract of list) {
        for (const ref of extract(entry)) {
          if (registries[ref.registry].has(ref.id)) continue;
          errors.push({
            pack: origin.pack,
            file: origin.file,
            path: fmtPath([ref.path], origin.index),
            message: `references unknown ${ref.registry} id "${ref.id}"`,
          });
        }
      }
    }
  }

  return { registries, errors };
}
