import { createApp } from './app';
import { loadPacks } from './content/loader';
import { RealStAdapter } from './st/real';
import { installLauncher } from './ui/launcher';

const CONTENT_ROOTS = ['../content/core']; // relative to dist/index.js

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function main(): Promise<void> {
  const st = new RealStAdapter();
  const app = createApp(st, { loadContent: () => loadPacks(CONTENT_ROOTS, fetchJson) });

  // Launcher first: a failing start must never hide the extension from the user.
  const launcher = installLauncher({
    open: () => app.shell.open(),
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
