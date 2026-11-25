import { createApp } from './app';
import { loadPacks } from './content/loader';
import { RealStAdapter } from './st/real';
import { installLauncher } from './ui/launcher';
import { loadArtManifest } from './ui/scene/art';

const CONTENT_ROOTS = ['../content/core', '../content/local']; // relative to dist/index.js; the second is the player's own pack (P15a) and may be absent

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function main(): Promise<void> {
  const st = new RealStAdapter();
  const app = createApp(st, {
    loadContent: () => loadPacks(CONTENT_ROOTS, fetchJson, { optional: ['../content/local'] }),
    assetUrl: (p) => new URL('../' + p, import.meta.url).href, // relative to dist/index.js
    loadArt: () => loadArtManifest(() => fetchJson('../content/local/art/art.json')), // P10e-e: the author's own art; absent = none
  });

  // Launcher first: a failing start must never hide the extension from the user.
  const launcher = installLauncher({
    open: () => app.shell.open(),
    newCampaign: () => app.openSetup(),
    init: () => void app.initCampaign(),
    ping: () => void app.pingMechanic(),
  });

  try {
    await app.start();
    console.info('[Alius] started');
  } catch (e) {
    console.error('[Alius] failed to start', e);
    st.toast('error', `Alius failed to start: ${e instanceof Error ? e.message : String(e)}`);
  }
  await launcher;
}

main().catch((e) => console.error('[Alius] fatal', e));
