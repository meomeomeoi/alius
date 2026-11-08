import { createApp } from './app';
import { loadPacks } from './content/loader';
import { RealStAdapter } from './st/real';

const CONTENT_ROOTS = ['../content/core']; // relative to dist/index.js

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(new URL(path, import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

function addMenuItem(menu: HTMLElement, id: string, icon: string, label: string, onClick: () => void): void {
  if (document.getElementById(id)) return;
  const item = document.createElement('div');
  item.id = id;
  item.className = 'list-group-item flex-container flexGap5';
  item.tabIndex = 0;
  const iconEl = document.createElement('div');
  iconEl.className = `${icon} extensionsMenuExtensionButton`;
  item.append(iconEl, document.createTextNode(label));
  item.addEventListener('click', onClick);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });
  menu.append(item);
}

async function main(): Promise<void> {
  const st = new RealStAdapter();
  const app = createApp(st, { loadContent: () => loadPacks(CONTENT_ROOTS, fetchJson) });
  await app.start();

  // #extensionsMenu exists in SillyTavern's static markup, but retry briefly in case we load early.
  for (let attempt = 0; attempt < 20; attempt++) {
    const menu = document.getElementById('extensionsMenu');
    if (menu) {
      addMenuItem(menu, 'alius_menu_open', 'fa-solid fa-satellite-dish', 'Alius', () => app.shell.open());
      addMenuItem(menu, 'alius_menu_init', 'fa-solid fa-flag-checkered', 'Alius: Initialize campaign (debug)', () => void app.initCampaign());
      addMenuItem(menu, 'alius_menu_ping', 'fa-solid fa-satellite', 'Alius: Ping mechanic model (debug)', () => void app.pingMechanic());
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn('[Alius] #extensionsMenu not found; use Alt+Shift+A to open the shell');
}

main().catch((e) => console.error('[Alius] failed to start', e));
