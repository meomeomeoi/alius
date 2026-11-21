import '../../src/engine/actions/blocking'; // P15a: blocking/set and blocking/rollback
import '../../src/engine/actions/moments'; // P15a: moment/answer
import '../../src/engine/actions/physics'; // P15a: the physics actions
import { dispatch as engineDispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import type { Registries } from '../../src/content/types';
import { ContextBuilder } from '../../src/llm/context';
import { createComms, type Comms } from '../../src/scene/comms';
import { createMemoryController, type MemoryController } from '../../src/scene/memoryController';
import { createSceneController, type SceneController, type SceneUiEvent } from '../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import type { Envelope } from '../../src/llm/envelope';
import { testEnvelope } from './envelopeHost';
import { campaign } from './world';


export interface Harness {
  st: FakeStAdapter;
  reg: Registries;
  context: ContextBuilder;
  controller: SceneController;
  comms: Comms;
  generations: Envelope;
  /** Only with `harness(reg, { memory: true })`. */
  memory?: MemoryController;
  ui: SceneUiEvent[];
  toasts: Array<{ kind: string; text: string }>;
  settings: AliusSettings;
  state(): CampaignState;
  set(state: CampaignState): void;
  /** Dispatches like the app does (chat check, state replacement). */
  dispatch(action: Action): EngineEvent[];
  actions: string[];
}

export const ANN = 'unit_ann';
export const BEA = 'unit_bea';
export const CAT = 'unit_cat';

/** A scene-ready world: fake ST with the squad's cards, a real engine and the real controllers. */
export function harness(reg: Registries, opts: { tweak?: (s: CampaignState) => void; settings?: Partial<AliusSettings>; /** P3b: wire a real memory controller into the scene (digest while it runs). */ memory?: boolean; /** Extra scene deps (a hook under test). */ deps?: Record<string, unknown> } = {}): Harness {
  const st = new FakeStAdapter({ chatId: 'chat-1', isGroup: true, groupId: 'g1' });
  st.personaName = 'Vale';
  let state = campaign(reg, 4);
  opts.tweak?.(state);
  for (const u of state.squad) {
    st.characters.push({ avatar: String(u.cardRef), name: u.displayName });
    st.members.push({ avatar: String(u.cardRef), name: u.displayName, active: true });
  }
  const context = new ContextBuilder();
  const ui: SceneUiEvent[] = [];
  const toasts: Array<{ kind: string; text: string }> = [];
  const actions: string[] = [];
  const settings: AliusSettings = { ...DEFAULT_SETTINGS, ...opts.settings };

  const dispatch = (action: Action, o?: { expectChatId?: string }): EngineEvent[] => {
    if (o?.expectChatId !== undefined && st.getActiveChat()?.chatId !== o.expectChatId) {
      return [{ type: 'error', code: 'chat_changed', message: 'The open chat changed; the action was dropped.' }];
    }
    actions.push(action.type);
    const r = engineDispatch(state, action, reg);
    state = r.state;
    return r.events;
  };
  const app = {
    dispatch,
    current: () => ({ load: { kind: 'ok', state, chatId: 'chat-1' } as never, state }),
    context,
    refreshContext: () => context.apply(st, state, settings.contextTokenCap),
  };
  const restore = (before: CampaignState, expected: CampaignState) => {
    if (state !== expected) return false;
    state = before;
    return true;
  };
  const generations = testEnvelope({
    st, reg, settings: () => settings, state: () => state, dispatch, restore, toast: (kind, text) => { toasts.push({ kind, text }); },
  });
  const memory = opts.memory ? createMemoryController({ st, app: app as never, settings: () => settings, registries: () => reg, generations }) : undefined;
  const deps = {
    st, app, registries: () => reg, settings: () => settings, generations, ...(memory ? { memory } : {}),
    restore,
    toast: (kind: string, text: string) => { toasts.push({ kind, text }); },
    onUi: (e: SceneUiEvent) => { ui.push(e); },
    ...opts.deps,
  };
  const controller = createSceneController(deps as never);
  const comms = createComms({ ...deps, scene: controller } as never);
  return {
    st, reg, context, controller, comms, generations, ui, toasts, settings, actions, ...(memory ? { memory } : {}),
    state: () => state,
    set: (s) => { state = s; },
    dispatch: (a) => dispatch(a),
  };
}

export const reply = (name: string, text: string) => ({ avatar: `${name.toLowerCase()}.png`, name, text });

/** A well-formed `intent_extract` answer. */
export const intentJson = (events: unknown[] = [], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ events, facts: [], proposals: [], promises: [], emotions: [], stressHints: [], ...extra });
export const praised = (target = ANN, over: Record<string, unknown> = {}) => ({
  type: 'praised', actor: 'commander', targets: [target], severity: 'major', evidence: 'well done', confidence: 0.9, ...over,
});
export const summaryJson = (chronicle: string, facts: unknown[] = []): string => JSON.stringify({ chronicle, facts });
