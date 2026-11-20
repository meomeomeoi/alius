// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { unreadOf } from '../../src/engine/dms';
import type { CampaignState, DmMessage } from '../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { renderCommsTab, type CommsTabCtx } from '../../src/ui/comms/commsTab';
import { renderReceipt, renderTyping, splitBurst, TYPING_MS } from '../../src/ui/comms/living';
import { h } from '../../src/ui/dom';
import { markedWithout, unresolved } from '../helpers/analyzeCoverage';
import { campaign, loadCore } from '../helpers/world';
import { partner } from '../helpers/personal';

let core: Registries;
beforeAll(async () => {
  core = await loadCore();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** The core pack with every chance at 1. */
const eager = (): Registries => {
  const r = structuredClone(core);
  for (const e of r.dmBehaviours.values()) e.chance = 1;
  return r;
};

let seq = 0;
const m = (from: string, text: string, over: Partial<DmMessage> = {}): DmMessage =>
  ({ id: `m${++seq}`, from, text, day: 5, slot: 'afternoon', read: true, ...over });

function world(thread: DmMessage[]): CampaignState {
  const s = campaign(core, 4);
  s.day = 5;
  s.slot = 'evening';
  s.dms[ANN] = thread;
  return s;
}

function mount(state: CampaignState, o: { reg?: Registries; motion?: boolean; host?: HTMLElement; open?: boolean } = {}) {
  const ctx: CommsTabCtx = {
    getState: () => state, registries: o.reg ?? core, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(),
    ...(o.motion !== undefined ? { motion: () => o.motion! } : {}),
  };
  const host = o.host ?? h('div');
  document.body.append(host);
  renderCommsTab(host, ctx);
  if (o.open !== false) host.querySelector<HTMLButtonElement>(`button[data-unit="${ANN}"]`)!.click();
  return { host, ctx, again: () => renderCommsTab(host, ctx), q: (sel: string) => host.querySelector<HTMLElement>(sel), qa: (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)] };
}

describe('splitBurst', () => {
  it('splits at sentence ends into 2 or 3 parts, one part without a boundary', () => {
    expect(splitBurst('I am here. Are you coming?')).toEqual(['I am here.', 'Are you coming?']);
    expect(splitBurst('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
    expect(splitBurst('One. Two. Three. Four. Five.')).toHaveLength(3);
    expect(splitBurst('One. Two. Three. Four. Five.').join(' ')).toBe('One. Two. Three. Four. Five.');
    expect(splitBurst('no boundary at all')).toEqual(['no boundary at all']);
    expect(splitBurst('Only one sentence.')).toEqual(['Only one sentence.']);
    expect(splitBurst('')).toEqual(['']);
  });
});

describe('deleted message', () => {
  it('draws a placeholder before her bubble that is not a message: it is not unread and not in the thread', () => {
    const s = world([m('commander', 'hello', {}), m(ANN, 'Never mind.', { read: false, behaviours: ['deleted_after_conflict'] })]);
    const { qa } = mount(s);
    const kids = [...qa('.alius-thread .alius-msg')];
    expect(kids.map((k) => k.classList.contains('alius-msg-deleted'))).toEqual([false, true, false]);
    expect(kids[1].textContent).toContain('MESSAGE DELETED');
    expect(unreadOf(s, ANN)).toBe(1);
    expect(s.dms[ANN]).toHaveLength(2);
  });

  it('its chip is analyzable', () => {
    const s = world([m(ANN, 'x', { behaviours: ['deleted_after_conflict'] })]);
    const { q } = mount(s);
    expect(q('.alius-msg-deleted .alius-chip')!.getAttribute('data-analyze')).toBe('glossary:dm_behaviour');
  });
});

describe('double and triple texts', () => {
  it('a burst message is 2–3 bubbles with the stamp on the first only', () => {
    const s = world([m(ANN, 'I was thinking. Of you. Come by tonight.', { behaviours: ['burst_wanting'], initiated: true })]);
    const { qa } = mount(s);
    const bubbles = qa('.alius-msg.is-unit:not(.alius-msg-deleted)');
    expect(bubbles.map((b) => b.querySelector('.alius-msg-text')!.textContent)).toEqual(['I was thinking.', 'Of you.', 'Come by tonight.']);
    expect(bubbles[0].querySelector('.alius-msg-meta')).not.toBeNull();
    expect(bubbles[1].querySelector('.alius-msg-meta')).toBeNull();
  });

  it('a one-sentence message stays one bubble', () => {
    const s = world([m(ANN, 'Come by.', { behaviours: ['burst_wanting'] })]);
    expect(mount(s).qa('.alius-msg.is-unit')).toHaveLength(1);
  });

  it('an old message keeps its burst after the state changed (the stamp, not the state, decides)', () => {
    const s = world([m(ANN, 'One. Two.', { behaviours: ['burst_wanting'] })]);
    s.relations[ANN].want = 0;
    expect(mount(s).qa('.alius-msg.is-unit')).toHaveLength(2);
  });
});

describe('voice messages', () => {
  const voiced = () => world([m(ANN, 'I miss you. Come over.', { behaviours: ['voice_close'] })]);

  it('shows a waveform and [ PLAY ], and no text until it is played', () => {
    const { q, host } = mount(voiced());
    expect(q('.alius-voicemsg svg')).not.toBeNull();
    expect(q('.alius-voicemsg [data-play]')!.textContent).toBe('[ PLAY ]');
    expect(host.textContent).not.toContain('I miss you');
  });

  it('a click reveals the text, and a re-render of the same host keeps it revealed', () => {
    const r = mount(voiced());
    r.q('.alius-voicemsg [data-play]')!.click();
    expect(r.host.textContent).toContain('I miss you. Come over.');
    r.again();
    expect(r.host.textContent).toContain('I miss you. Come over.');
    expect(r.q('.alius-voicemsg [data-play]')).toBeNull();
  });

  it('a host that is built anew starts hidden again', () => {
    const s = voiced();
    const first = mount(s);
    first.q('.alius-voicemsg [data-play]')!.click();
    expect(mount(s).host.textContent).not.toContain('I miss you');
  });

  it('the button is analyzable', () => {
    expect(mount(voiced()).q('.alius-voicemsg [data-play]')!.getAttribute('data-analyze')).toBe('glossary:voice_message');
  });
});

describe('late messages', () => {
  it('carry a LATE chip, analyzable', () => {
    const s = world([m(ANN, 'You awake?', { initiated: true, slot: 'night', behaviours: ['late_wanting'] })]);
    const chip = mount(s).q('.alius-msg-meta .alius-chip')!;
    expect(chip.textContent).toContain('LATE');
    expect(chip.getAttribute('data-analyze')).toBe('glossary:dm_behaviour');
  });
});

describe('read receipts', () => {
  const texts = (state: CampaignState) => {
    const last = state.dms[ANN].filter((x) => x.from === 'commander').at(-1)!;
    return renderReceipt(state, ANN, last)?.textContent;
  };

  it('READ when she answered in the same slot, READ · 2 SLOTS AGO, SEEN · NO REPLY, DELIVERED', () => {
    const s = world([]);
    s.dms[ANN] = [m('commander', 'a', { day: 5, slot: 'evening' }), m(ANN, 'b', { day: 5, slot: 'evening' })];
    expect(texts(s)).toBe('READ');
    s.dms[ANN] = [m('commander', 'a', { day: 4, slot: 'evening' }), m(ANN, 'b', { day: 5, slot: 'morning' })];
    expect(texts(s)).toBe('READ · 2 SLOTS AGO');
    s.dms[ANN] = [m('commander', 'a', { day: 5, slot: 'morning' })];
    expect(texts(s)).toBe('SEEN · NO REPLY');
    s.dms[ANN] = [m('commander', 'a', { day: 5, slot: 'evening' })];
    expect(texts(s)).toBe('DELIVERED');
    s.dms[ANN] = [m('commander', 'a', { day: 5, slot: 'afternoon' }), m(ANN, 'b', { day: 5, slot: 'evening' })];
    expect(texts(s)).toBe('READ');
  });

  it('one slot is singular', () => {
    const s = world([]);
    s.dms[ANN] = [m('commander', 'a', { day: 5, slot: 'morning' }), m(ANN, 'b', { day: 5, slot: 'afternoon' })];
    expect(texts(s)).toBe('READ · 1 SLOT AGO');
  });

  it('is null for her own message', () => {
    const s = world([m(ANN, 'x')]);
    expect(renderReceipt(s, ANN, s.dms[ANN][0])).toBeNull();
  });

  it('shows under the last commander message of the thread only, analyzable', () => {
    const s = world([m('commander', 'one', { day: 5, slot: 'morning' }), m('commander', 'two', { day: 5, slot: 'morning' })]);
    const r = mount(s);
    const receipts = r.qa('.alius-receipt');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].textContent).toBe('SEEN · NO REPLY');
    expect(receipts[0].getAttribute('data-analyze')).toBe('glossary:read_receipt');
    expect(receipts[0].previousElementSibling!.textContent).toContain('two');
  });
});

describe('typing indicator', () => {
  const hesitant = (): CampaignState => {
    const s = partner(world([m(ANN, 'hi'), m('commander', 'Are you there?', { day: 5, slot: 'evening' })]), ANN, { attachment: 'avoidant', stateId: 'friend' });
    return s;
  };

  it('shows only when she hesitates and the thread ends with the commander', () => {
    expect(mount(hesitant(), { reg: eager() }).q('.alius-typing')).not.toBeNull();
    const answered = hesitant();
    answered.dms[ANN].push(m(ANN, 'yes'));
    expect(mount(answered, { reg: eager() }).q('.alius-typing')).toBeNull();
    const never = eager();
    for (const e of never.dmBehaviours.values()) e.chance = 0;
    expect(mount(hesitant(), { reg: never }).q('.alius-typing')).toBeNull(); // the hash does not pass
  });

  it('a unit who does not hesitate gets none, whatever the thread', () => {
    const s = world([m('commander', 'Are you there?')]);
    expect(mount(s, { reg: eager() }).q('.alius-typing')).toBeNull(); // steady, no quarrel
  });

  it('types for 2.5 s and then has stopped typing', () => {
    vi.useFakeTimers();
    const r = mount(hesitant(), { reg: eager(), motion: true });
    const el = r.q('.alius-typing')!;
    expect(el.getAttribute('data-state')).toBe('typing');
    expect(el.textContent).toContain('typing');
    vi.advanceTimersByTime(TYPING_MS + 10);
    expect(el.getAttribute('data-state')).toBe('stopped');
    expect(el.textContent).toBe('stopped typing');
  });

  it('a redraw after it played shows it stopped at once, and a redraw clears the pending timer', () => {
    vi.useFakeTimers();
    const r = mount(hesitant(), { reg: eager(), motion: true });
    const first = r.q('.alius-typing')!;
    r.again();
    expect(vi.getTimerCount()).toBe(1); // the first timer was cleared, the second one runs
    vi.advanceTimersByTime(TYPING_MS + 10);
    expect(first.getAttribute('data-state')).toBe('typing'); // the detached element was never touched
    r.again();
    expect(r.q('.alius-typing')!.getAttribute('data-state')).toBe('stopped');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a static line under reduced motion, with no timer', () => {
    vi.useFakeTimers();
    const r = mount(hesitant(), { reg: eager(), motion: false });
    const el = r.q('.alius-typing')!;
    expect(el.textContent).toBe('She started typing and stopped.');
    expect(el.getAttribute('data-state')).toBe('stopped');
    expect(vi.getTimerCount()).toBe(0);
    expect(renderTyping(false).querySelector('.alius-dots')).toBeNull();
  });

  it('is analyzable', () => {
    expect(mount(hesitant(), { reg: eager() }).q('.alius-typing')!.getAttribute('data-analyze')).toBe('glossary:dm_behaviour');
  });
});

describe('contact name', () => {
  const renamed = (faded?: number): CampaignState => {
    const s = world([m(ANN, 'hi')]);
    s.personal = { seq: 1, decor: { [ANN]: { since: 3, parts: ['contact'], contactName: 'Sweetheart', ...(faded !== undefined ? { fadedUntil: faded } : {}) } } };
    return s;
  };

  it('the contact row shows her contact name, the thread header keeps her real name in brackets', () => {
    const r = mount(renamed());
    const row = r.q(`button[data-unit="${ANN}"]`)!;
    expect(row.textContent).toContain('Sweetheart');
    expect(row.textContent).not.toContain('Ann');
    expect(r.q('.alius-thread h3')!.textContent).toBe('// SWEETHEART [ANN]');
  });

  it('while the decor fades the name is dimmed; once the fade is over the real name is back', () => {
    expect(mount(renamed(7)).q(`button[data-unit="${ANN}"]`)!.classList.contains('is-faded')).toBe(true);
    const gone = renamed(4); // day 5 > fadedUntil 4: decorOf is null
    const r = mount(gone);
    expect(r.q(`button[data-unit="${ANN}"]`)!.textContent).toContain('Ann');
    expect(r.q('.alius-thread h3')!.textContent).toBe('// ANN');
  });

  it('a decor without the contact part keeps the real name, and so does an ordinary unit', () => {
    const s = renamed();
    s.personal!.decor![ANN].parts = ['sticker'];
    expect(mount(s).q(`button[data-unit="${ANN}"]`)!.textContent).toContain('Ann');
    expect(mount(world([m(BEA, 'x')]), { open: false }).q(`button[data-unit="${BEA}"]`)!.textContent).toContain('Bea');
  });

  it('the name is text, never markup', () => {
    const s = renamed();
    s.personal!.decor![ANN].contactName = '<i>x</i>';
    const r = mount(s);
    expect(r.q(`button[data-unit="${ANN}"] i`)).toBeNull();
    expect(r.q(`button[data-unit="${ANN}"]`)!.textContent).toContain('<i>x</i>');
  });
});

describe('analysis coverage of the living thread', () => {
  it('every marked element resolves and every chip is marked', () => {
    const s = partner(world([
      m(ANN, 'Gone.', { behaviours: ['deleted_after_conflict', 'late_wanting'], initiated: true }),
      m(ANN, 'One. Two.', { behaviours: ['burst_wanting'] }),
      m(ANN, 'Words.', { behaviours: ['voice_close'] }),
      m('commander', 'Are you there?', { day: 5, slot: 'morning' }),
    ]), ANN, { attachment: 'avoidant', stateId: 'friend' });
    s.personal = { seq: 1, decor: { [ANN]: { since: 3, parts: ['contact'], contactName: 'Sweetheart' } } };
    const r = mount(s, { reg: eager() });
    expect(markedWithout(r.host)).toEqual([]);
    expect(unresolved(r.host, { registries: core, state: s, settings: DEFAULT_SETTINGS })).toEqual([]);
  });
});
