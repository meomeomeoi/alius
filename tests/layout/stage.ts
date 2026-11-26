/**
 * P10e-f Task 9: the browser entry of the layout test's stage fixtures (`?fixture=stage|stageslot|stagecheck`): her page in SYS › STAGE (the
 * sheet over the shell) for Ann of the `one` state. `stage` is the page as it opens; `stageslot` the same with every slot holding the placeholder
 * sprite, so each slot's editor (LOAD, the fit, MARK ZONES, SAVE, CHECK, REMOVE, CLOSE) can be opened by the test; `stagecheck` is `stageslot`
 * with CHECK opened on `over` (the preview over the sheet). The shell's toast host and modal layer are the real ones, in the shell's order
 * (`window.__stageToast` / `window.__stageModal` raise one). Nothing is saved: the adapter is a fake, and the model is never called.
 */
// the app's actions, in the app's order (the preview runs the engine on its sandbox)
import '../../src/engine/actions/debug';
import '../../src/engine/actions/squad';
import '../../src/engine/actions/calendar';
import '../../src/engine/actions/base';
import '../../src/engine/actions/scene';
import '../../src/engine/actions/memory';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/combat';
import '../../src/engine/actions/progression';
import '../../src/engine/actions/world';
import '../../src/engine/actions/expedition';
import '../../src/engine/actions/leash';
import '../../src/engine/actions/loyalty';
import '../../src/engine/actions/discipline';
import '../../src/engine/actions/bonds';
import '../../src/engine/actions/personal';
import '../../src/engine/actions/immersion';
import '../../src/engine/actions/power';
import '../../src/engine/actions/dilemma';
import '../../src/engine/actions/arc';
import '../../src/engine/actions/items';
import '../../src/engine/actions/commander';
import '../../src/engine/actions/onboarding';
import '../../src/engine/actions/special';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/generations';
import '../../src/engine/actions/headStart';
import '../../src/engine/actions/development';
import '../../src/engine/actions/blocking';
import '../../src/engine/actions/moments';
import '../../src/engine/actions/physics';
import '../../src/engine/actions/life';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/practice';
import { loadPacks } from '../../src/content/loader';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { createArtSlots } from '../../src/ui/scene/art';
import { createModalHost } from '../../src/ui/shell/modal';
import { createToasts } from '../../src/ui/shell/toast';
import type { StageFolder } from '../../src/ui/stage/load';
import type { StageCtx } from '../../src/ui/stage/section';
import { openStageSheet } from '../../src/ui/stage/sheet';
import { SLOT_KEYS } from '../../src/ui/stage/slots';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'stage';
const SPRITE = '/tests/fixtures/layout/sprite.svg';
const states = (await (await fetch('/.superpowers/layout/states.json')).json()) as Record<string, CampaignState>;
const loaded = await loadPacks(['content/core'], (p: string) => fetch('/' + p).then((r) => r.json()));
// her page is setup outside any scene (CHECK is refused while the campaign has one): the `one` state without its scene
const state: CampaignState = { ...states.one! };
delete state.scene;
const her = state.squad.find((u) => u.kind === 'named' && typeof u.cardRef === 'string')!;

const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
for (const label of ['neutral', 'joy', 'anger', 'sadness']) st.sprites.set(`${her.cardRef}:${label}`, SPRITE);
const folders = new Map<string, StageFolder>();
if (fixture === 'stageslot' || fixture === 'stagecheck') {
  folders.set(her.cardRef!, { slots: new Map(SLOT_KEYS.map((k) => [k, { url: SPRITE, sidecar: {} }])), setup: { stand: { scale: 1, x: 0, y: 0 } } });
}

const root = document.createElement('div');
root.id = 'alius-shell';
root.dataset.screen = 'sys';
root.innerHTML = '<div class="alius-frame"><div class="alius-view"></div></div><div class="alius-toasts" aria-live="polite"></div><div class="alius-modal-layer"></div>';
document.body.append(root);
const toasts = createToasts(root.querySelector<HTMLElement>('.alius-toasts')!);
const modals = createModalHost(root.querySelector<HTMLElement>('.alius-modal-layer')!);
Object.assign(window, {
  __stageToast: (text: string) => toasts.show('warn', text),
  __stageModal: () => { void modals.show({ title: 'A MODAL', body: 'Over the stage setup.', actions: [{ label: '[ OK ]', value: 'ok' }] }); },
});

const ctx: StageCtx = {
  st, getState: () => state, getRegistries: () => loaded.registries,
  art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
  openSheet: () => {}, settings: () => ({ ...DEFAULT_SETTINGS, showExplicitSlots: true }), refresh: async () => {},
  toast: (kind, text) => toasts.show(kind, text), modal: (o) => modals.show(o), assetUrl: (p: string) => '/' + p,
};
openStageSheet(her.id, ctx);
await new Promise((r) => setTimeout(r, 300));
if (fixture === 'stagecheck') {
  document.querySelector<HTMLElement>('.alius-stage-slot-list li[data-slot="over"] [data-action="edit"]')!.click();
  await new Promise((r) => setTimeout(r, 100));
  document.querySelector<HTMLElement>('.alius-stage-slot-actions [data-action="check"]')!.click();
  await new Promise((r) => setTimeout(r, 500));
}
document.body.dataset.ready = 'true';
