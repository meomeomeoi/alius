import type { Registries } from '../../src/content/types';
import type { Action, EngineEvent } from '../../src/engine/dispatch';
import type { CampaignState } from '../../src/engine/state/types';
import { createEnvelope, type Envelope } from '../../src/llm/envelope';
import '../../src/llm/sites';
import '../../src/engine/actions/generations'; // the failure records the envelope writes
import type { AliusSettings } from '../../src/settings';
import type { StAdapter } from '../../src/st/adapter';

/** The envelope of a test world: the same host the app builds, over the test's own state, dispatch and toasts. */
export function testEnvelope(w: {
  st: StAdapter;
  reg: Registries;
  settings: () => AliusSettings;
  state: () => CampaignState | null;
  dispatch: (a: Action, o?: { expectChatId?: string }) => EngineEvent[];
  restore: (before: CampaignState, expected: CampaignState) => boolean;
  toast?: (kind: 'info' | 'warn' | 'error', text: string) => void;
  contentLine?: () => string;
}): Envelope {
  return createEnvelope({
    st: w.st,
    settings: w.settings,
    registries: () => w.reg,
    state: w.state,
    chatId: () => w.st.getActiveChat()?.chatId,
    dispatch: w.dispatch,
    restoreSnapshot: w.restore,
    contentLine: w.contentLine ?? (() => ''),
    toast: w.toast ?? (() => {}),
  });
}

/** An envelope with no campaign behind it (the setup wizard imports before one exists): failures are never recorded, only returned. */
export function standaloneEnvelope(st: StAdapter, reg: Registries, settings: () => AliusSettings): Envelope {
  return testEnvelope({ st, reg, settings, state: () => null, dispatch: () => [], restore: () => false });
}
