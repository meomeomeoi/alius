/**
 * P10e-f Task 9: the browser entry of the layout test's stage fixtures (`?fixture=stage|stageslot`): her page in SYS › STAGE (the sheet over
 * the shell) for Ann of the `one` state. `stage` is the page as it opens; `stageslot` the same with every slot holding the placeholder sprite,
 * so each slot's editor (LOAD, the fit, MARK ZONES, SAVE, CHECK, REMOVE, CLOSE) can be opened by the test. Nothing is saved: the adapter is a
 * fake, and the model is never called.
 */
import { loadPacks } from '../../src/content/loader';
import type { CampaignState } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { createArtSlots } from '../../src/ui/scene/art';
import type { StageFolder } from '../../src/ui/stage/load';
import type { StageCtx } from '../../src/ui/stage/section';
import { openStageSheet } from '../../src/ui/stage/sheet';
import { SLOT_KEYS } from '../../src/ui/stage/slots';

const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'stage';
const SPRITE = '/tests/fixtures/layout/sprite.svg';
const states = (await (await fetch('/.superpowers/layout/states.json')).json()) as Record<string, CampaignState>;
const loaded = await loadPacks(['content/core'], (p: string) => fetch('/' + p).then((r) => r.json()));
const state = states.one!;
const her = state.squad.find((u) => u.kind === 'named' && typeof u.cardRef === 'string')!;

const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
for (const label of ['neutral', 'joy', 'anger', 'sadness']) st.sprites.set(`${her.cardRef}:${label}`, SPRITE);
const folders = new Map<string, StageFolder>();
if (fixture === 'stageslot') {
  folders.set(her.cardRef!, { slots: new Map(SLOT_KEYS.map((k) => [k, { url: SPRITE, sidecar: {} }])), setup: { stand: { scale: 1, x: 0, y: 0 } } });
}

const root = document.createElement('div');
root.id = 'alius-shell';
root.dataset.screen = 'sys';
root.innerHTML = '<div class="alius-frame"><div class="alius-view"></div></div>';
document.body.append(root);

const ctx: StageCtx = {
  st, getState: () => state, getRegistries: () => loaded.registries,
  art: () => createArtSlots(null, (p) => p, () => null, folders), folders: () => folders,
  openSheet: () => {}, settings: () => ({ ...DEFAULT_SETTINGS, showExplicitSlots: true }), refresh: async () => {},
  toast: () => {}, modal: async () => null, assetUrl: (p: string) => '/' + p,
};
openStageSheet(her.id, ctx);
await new Promise((r) => setTimeout(r, 300));
document.body.dataset.ready = 'true';
