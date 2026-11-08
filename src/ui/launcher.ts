export interface LauncherActions {
  open(): void;
  newCampaign(): void;
  init(): void;
  ping(): void;
}

interface Opts {
  /** Poll interval while waiting for SillyTavern to create a container. */
  retryMs?: number;
  /** How many polls before giving up. */
  retries?: number;
}

const ITEMS: Array<{ id: string; icon: string; menuLabel: string; buttonLabel: string; action: keyof LauncherActions }> = [
  { id: 'open', icon: 'fa-solid fa-satellite-dish', menuLabel: 'Alius', buttonLabel: 'Open Alius', action: 'open' },
  { id: 'new', icon: 'fa-solid fa-file-signature', menuLabel: 'Alius: New campaign', buttonLabel: 'New campaign', action: 'newCampaign' },
  { id: 'init', icon: 'fa-solid fa-flag-checkered', menuLabel: 'Alius: Initialize campaign (debug)', buttonLabel: 'Initialize campaign (debug)', action: 'init' },
  { id: 'ping', icon: 'fa-solid fa-satellite', menuLabel: 'Alius: Ping mechanic model (debug)', buttonLabel: 'Ping mechanic model (debug)', action: 'ping' },
];

/** Polls until one of the selectors matches; earlier selectors win over later ones. */
async function waitFor(selectors: string[], retryMs: number, retries: number): Promise<HTMLElement | null> {
  for (let i = 0; i <= retries; i++) {
    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    await new Promise((r) => setTimeout(r, retryMs));
  }
  return null;
}

function addMenuItems(menu: HTMLElement, actions: LauncherActions): void {
  for (const it of ITEMS) {
    const id = `alius_menu_${it.id}`;
    if (document.getElementById(id)) continue;
    const item = document.createElement('div');
    item.id = id;
    item.className = 'list-group-item flex-container flexGap5';
    item.tabIndex = 0;
    const icon = document.createElement('div');
    icon.className = `${it.icon} extensionsMenuExtensionButton`;
    item.append(icon, document.createTextNode(it.menuLabel));
    const run = () => actions[it.action]();
    item.addEventListener('click', run);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        run();
      }
    });
    menu.append(item);
  }
}

function addDrawer(host: HTMLElement, actions: LauncherActions): void {
  if (document.getElementById('alius_settings')) return;
  const wrap = document.createElement('div');
  wrap.id = 'alius_settings';
  wrap.className = 'extension_container';

  const drawer = document.createElement('div');
  drawer.className = 'inline-drawer';
  const header = document.createElement('div');
  header.className = 'inline-drawer-toggle inline-drawer-header';
  const title = document.createElement('b');
  title.textContent = 'Alius';
  const chevron = document.createElement('div');
  chevron.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
  header.append(title, chevron);

  const content = document.createElement('div');
  content.className = 'inline-drawer-content';
  const row = document.createElement('div');
  row.className = 'flex-container flexFlowColumn';
  for (const it of ITEMS) {
    const btn = document.createElement('input');
    btn.type = 'button';
    btn.className = 'menu_button';
    btn.value = it.buttonLabel;
    btn.addEventListener('click', () => actions[it.action]());
    row.append(btn);
  }
  content.append(row);
  drawer.append(header, content);
  wrap.append(drawer);
  host.append(wrap);
}

/**
 * Puts Alius where SillyTavern users look for extensions: the wand menu next to the chat input
 * (created by ST only after extensions load, hence the polling) and the Extensions settings panel.
 */
export async function installLauncher(actions: LauncherActions, opts: Opts = {}): Promise<void> {
  const retryMs = opts.retryMs ?? 500;
  const retries = opts.retries ?? 20;

  // Independent: each entry point appears as soon as its own container exists.
  await Promise.all([
    waitFor(['#extensionsMenu'], retryMs, retries).then((menu) => {
      if (menu) addMenuItems(menu, actions);
      else console.warn('[Alius] #extensionsMenu not found; use Alt+Shift+A to open the shell');
    }),
    waitFor(['#extensions_settings2', '#extensions_settings'], retryMs, retries).then((settings) => {
      if (settings) addDrawer(settings, actions);
      else console.warn('[Alius] extension settings panel not found');
    }),
  ]);
}
