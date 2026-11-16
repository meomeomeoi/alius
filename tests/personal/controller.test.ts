import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dueBooking } from '../../src/engine/personal/bookings';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { sanitizeDmEdit } from '../../src/llm/calls/flavor';
import { createPersonal, type PersonalController, type PersonalDeps } from '../../src/personal/controller';
import { createComms } from '../../src/scene/comms';
import { createBonds } from '../../src/bonds/controller';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { ANN, BEA, atImpunity, enable, ofType, partner, plain, setRelation } from '../helpers/personal';
import { loadCore } from '../helpers/world';
import { harness, intentJson } from '../helpers/sceneHarness';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';
import { startSmother } from '../../src/engine/bonds/smother';
import '../../src/engine/actions/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const flush = () => new Promise((res) => setTimeout(res, 0));

/** Ann: a dominant lover (level 4), jealousy_games on. Some seed makes her intercept; `seed` picks the rng. */
function stateWith(seed = 7, tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 80 });
  enable(s, 'jealousy_games');
  s.rng = seedRng(seed);
  tweak(s);
  return s;
}

interface Rig {
  h: WorldHarness;
  ctx: ContextBuilder;
  refresh: ReturnType<typeof vi.fn>;
  startScene: ReturnType<typeof vi.fn>;
  confirmEdit: ReturnType<typeof vi.fn>;
  personal: PersonalController;
}
function rig(initial: CampaignState, opts: { wording?: boolean; confirm?: 'keep' | 'revert' | null } = {}): Rig {
  const h = worldHarness(reg, initial, { dmEditWording: opts.wording ?? true });
  const ctx = new ContextBuilder();
  const refresh = vi.fn();
  const startScene = vi.fn(async (o: { locationId: string; participants: string[] }) => {
    const r = h.app().dispatch({ type: 'scene/start', payload: { locationId: o.locationId, participants: o.participants, origin: 'event', startIndex: 0 } });
    return !r.some((e) => e.type === 'error');
  });
  const confirmEdit = vi.fn(async () => opts.confirm ?? 'revert');
  const deps: PersonalDeps = { ...h.deps, context: ctx, refreshContext: refresh, startScene, ...(opts.confirm === null ? {} : { confirmEdit }) };
  return { h, ctx, refresh, startScene, confirmEdit, personal: createPersonal(deps) };
}

/** The first seed whose roll makes Ann intercept a DM to Bea, as a state to start a rig from. */
function hitting(channel: 'dm' | 'leash' | 'recruit' = 'dm'): CampaignState {
  for (let seed = 1; seed < 300; seed++) {
    const s = stateWith(seed);
    const h = worldHarness(reg, s);
    const events = h.app().dispatch({ type: 'device/intercept', payload: { channel, ...(channel === 'dm' ? { toUnitId: BEA, text: 'probe' } : {}) } });
    if (ofType(events, 'device_intercept')[0]?.hit === true) return stateWith(seed);
  }
  throw new Error('no seed intercepts');
}
const dm = (original = 'Meet me by the yard, Bea.') => ({ original });

describe('the edit of an outgoing DM', () => {
  it('beforeSend returns the original when nobody intercepts and calls no model', async () => {
    const r = rig(plain(reg));
    const before = r.h.state();
    expect(await r.personal.beforeSend(BEA, 'Hello.')).toEqual({ text: 'Hello.' });
    expect(r.h.st.calls).toHaveLength(0);
    expect(r.h.state()).toBe(before); // nothing was dispatched
    expect(r.h.log).toEqual([]);
  });

  it('an intercept words the text with dm_edit', async () => {
    const r = rig(hitting());
    r.h.st.mainReplies = ['{"text":"Meet me by the yard, Bea. — Ann made sure it was clear."}'];
    const res = await r.personal.beforeSend(BEA, dm().original);
    expect(res.intercept).toEqual({ id: expect.any(String), editorId: ANN });
    expect(res.text).toBe('Meet me by the yard, Bea. — Ann made sure it was clear.');
    expect(r.h.st.calls).toHaveLength(1);
    const call = r.h.st.calls[0];
    expect((call.system ?? '') + call.prompt).toContain('<dm>');
    expect(call.prompt).toContain('Meet me by the yard, Bea.');
    expect(call.prompt).toContain('Ann');
    // no pronoun for the commander in what the model reads (lore §0)
    expect((call.system ?? '') + call.prompt.split('\n').filter((l: string) => !l.startsWith('How she feels')).join(' ').replace(dm().original, '')).not.toMatch(/\b(he|him|his|himself|they|them|their|theirs)\b/i);
    // the engine knows the waiting edit, and what the commander wrote
    expect(r.h.state().personal!.intercepts!.open).toMatchObject({ unitId: ANN, channel: 'dm', toUnitId: BEA, status: 'open', original: dm().original });
  });

  it('a failed call uses an editLines fallback with {text} filled', async () => {
    const r = rig(hitting());
    r.h.st.mainReplies = []; // the model gives nothing
    const res = await r.personal.beforeSend(BEA, dm().original);
    expect(res.intercept).toBeDefined();
    const lines = ([...reg.deviceAccessRules.values()].find((e) => e.level === 4)!.editLines as string[]).map((l) => l.replaceAll('{text}', dm().original).replaceAll('{name}', 'Ann'));
    expect(lines).toContain(res.text);
    expect(res.text).not.toContain('{');
  });

  it('with dmEditWording off no model is called', async () => {
    const r = rig(hitting(), { wording: false });
    const res = await r.personal.beforeSend(BEA, dm().original);
    expect(res.intercept).toBeDefined();
    expect(res.text).toContain(dm().original);
    expect(r.h.st.calls).toHaveLength(0);
  });

  it('KEEP sends the edited text with interceptId; REVERT sends the original after the defiance', async () => {
    const keep = rig(hitting());
    keep.h.st.mainReplies = ['{"text":"Edited by Ann."}'];
    const sent = await keep.personal.beforeSend(BEA, dm().original);
    const kept = await keep.personal.answerEdit(true);
    expect(kept).toEqual({ unitId: BEA, text: 'Edited by Ann.', interceptId: sent.intercept!.id });
    expect(keep.h.state().personal!.intercepts!.open!.status).toBe('kept');
    const delivered = keep.h.app().dispatch({ type: 'dm/send', payload: { unitId: BEA, text: kept!.text, interceptId: kept!.interceptId } });
    expect(delivered.some((e) => e.type === 'error')).toBe(false);
    expect(keep.h.state().dms[BEA].at(-1)).toMatchObject({ text: 'Edited by Ann.', editedBy: ANN });

    const revert = rig(hitting());
    revert.h.st.mainReplies = ['{"text":"Edited by Ann."}'];
    await revert.personal.beforeSend(BEA, dm().original);
    const before = revert.h.state().relations[ANN];
    const reverted = await revert.personal.answerEdit(false);
    expect(reverted).toEqual({ unitId: BEA, text: dm().original });
    expect(revert.h.state().relations[ANN].history.filter((x) => x.kind === 'event').at(-1)).toMatchObject({ type: 'overrode_her' });
    expect(revert.h.state().relations[ANN].trust).toBeLessThan(before.trust);
    expect(revert.h.state().personal!.intercepts!.open).toBeUndefined();
    expect(await revert.personal.answerEdit(false)).toBeNull(); // nothing waits any more
  });

  it('an open intercept survives a reload: the chip comes back freshly worded from what the commander wrote', async () => {
    const r = rig(hitting());
    r.h.st.mainReplies = ['{"text":"First wording."}'];
    const first = await r.personal.beforeSend(BEA, dm().original);
    const saved = JSON.parse(JSON.stringify(r.h.state())) as CampaignState;
    const again = rig(saved);
    again.h.st.mainReplies = ['{"text":"Second wording."}'];
    const pending = await again.personal.pendingEdit();
    expect(pending).toMatchObject({ id: first.intercept!.id, editorId: ANN, channel: 'dm', toUnitId: BEA, original: dm().original, edited: 'Second wording.' });
    expect((await again.personal.answerEdit(true))!.interceptId).toBe(first.intercept!.id);
    expect(await again.personal.pendingEdit()).toBeNull(); // a kept edit is waiting to be sent, not to be answered
  });

  it('through the DM thread: nothing is sent until KEEP; then the edited message goes once, with who edited it', async () => {
    const h = harness(reg);
    h.set(hitting());
    h.st.mainReplies = ['{"text":"Edited by Ann."}', 'Understood.', intentJson([])];
    const ui: Array<{ type: string; [k: string]: unknown }> = [];
    const deps = {
      st: h.st, app: { dispatch: h.dispatch, current: () => ({ state: h.state() }), context: h.context, refreshContext: () => {} },
      restore: () => false, registries: () => reg, settings: () => h.settings, toast: () => {}, onUi: (e: { type: string }) => ui.push(e), scene: h.controller,
    };
    const personal = createPersonal({ ...deps, context: h.context, refreshContext: () => {} } as never);
    const comms = createComms({ ...deps, personal } as never);
    await comms.send(BEA, 'Meet me by the yard, Bea.');
    expect(ui).toContainEqual(expect.objectContaining({ type: 'edit', unitId: BEA, original: 'Meet me by the yard, Bea.', edited: 'Edited by Ann.', editorId: ANN }));
    expect(h.state().dms[BEA] ?? []).toHaveLength(0);
    await comms.answerEdit(true);
    const thread = h.state().dms[BEA];
    expect(thread[0]).toMatchObject({ from: 'commander', text: 'Edited by Ann.', editedBy: ANN });
    expect(thread.filter((m) => m.from === 'commander')).toHaveLength(1);
    expect(h.state().personal!.intercepts!.open).toBeUndefined();
    // a plain send without a hit goes straight through
    h.set(plain(reg));
    await comms.send(BEA, 'Plain.');
    expect(h.state().dms[BEA].find((m) => m.text === 'Plain.')).toBeDefined();
  });

  it('REVERT sends what the commander wrote, after the defiance', async () => {
    const h = harness(reg);
    h.set(hitting());
    h.st.mainReplies = ['{"text":"Edited by Ann."}', 'Understood.', intentJson([])];
    const deps = {
      st: h.st, app: { dispatch: h.dispatch, current: () => ({ state: h.state() }), context: h.context, refreshContext: () => {} },
      restore: () => false, registries: () => reg, settings: () => h.settings, toast: () => {}, onUi: () => {}, scene: h.controller,
    };
    const personal = createPersonal({ ...deps, context: h.context, refreshContext: () => {} } as never);
    const comms = createComms({ ...deps, personal } as never);
    await comms.send(BEA, 'Meet me by the yard, Bea.');
    await comms.answerEdit(false);
    expect(h.state().dms[BEA][0]).toMatchObject({ from: 'commander', text: 'Meet me by the yard, Bea.' });
    expect(h.state().dms[BEA][0].editedBy).toBeUndefined();
    expect(h.state().relations[ANN].history.filter((x) => x.kind === 'event').some((x) => x.type === 'overrode_her')).toBe(true);
  });
});

describe('a request the commander is about to file', () => {
  it('beforeRequest cancels a Leash request on KEEP and files it on REVERT', async () => {
    const keep = rig(hitting('leash'), { confirm: 'keep' });
    expect(await keep.personal.beforeRequest('leash')).toMatchObject({ cancelled: true, intercept: { editorId: ANN } });
    expect(keep.confirmEdit).toHaveBeenCalledOnce();
    expect(keep.h.state().personal!.intercepts!.open).toBeUndefined();
    expect(keep.h.state().relations[ANN].history.filter((x) => x.kind === 'event').some((x) => x.type === 'overrode_her')).toBe(false);

    const revert = rig(hitting('leash'), { confirm: 'revert' });
    expect(await revert.personal.beforeRequest('leash')).toMatchObject({ cancelled: false });
    expect(revert.h.state().relations[ANN].history.filter((x) => x.kind === 'event').at(-1)).toMatchObject({ type: 'overrode_her' });
  });

  it('a recruit order goes the same way; no intercept files at once; no way to ask means no roll', async () => {
    const recruit = rig(hitting('recruit'), { confirm: 'keep' });
    expect(await recruit.personal.beforeRequest('recruit')).toMatchObject({ cancelled: true });
    const none = rig(plain(reg));
    expect(await none.personal.beforeRequest('leash')).toEqual({ cancelled: false });
    const mute = rig(hitting('leash'), { confirm: null });
    expect(await mute.personal.beforeRequest('leash')).toEqual({ cancelled: false });
    expect(mute.h.state().personal).toBeUndefined();
  });
});

/** Ann has a booking due this slot (the clock is day 5, evening). */
function booked(tweak: (s: CampaignState) => void = () => {}): CampaignState {
  const s = stateWith(1);
  atImpunity(s, reg, ANN, 55);
  s.day = 5;
  s.slot = 'evening';
  s.personal = { seq: 1, bookings: [{ id: 'bk_1', unitId: ANN, kindId: 'evening_with_me', day: 5, slot: 'evening', status: 'booked', source: 'roll', made: 4 }] };
  tweak(s);
  return s;
}

describe('a due booking', () => {
  it('the controller never opens a booking scene twice', async () => {
    const r = rig(booked());
    expect(await r.personal.onSlotAdvanced()).toBe(true);
    expect(r.startScene).toHaveBeenCalledWith({ locationId: 'quarters_unit', participants: [ANN], origin: 'event' });
    expect(r.h.state().personal!.bookings![0].status).toBe('played');
    expect(await r.personal.onSlotAdvanced()).toBe(false);
    expect(await r.personal.onLoaded()).toBe(false);
    expect(r.startScene).toHaveBeenCalledTimes(1);
  });

  it('a played booking with no scene (the chat reloaded after booking/play) is not replayed', async () => {
    const s = booked();
    s.personal!.bookings![0].status = 'played';
    const r = rig(s);
    expect(await r.personal.onLoaded()).toBe(false);
    expect(r.startScene).not.toHaveBeenCalled();
  });

  it('onLoaded plays a booking that is due when the chat opens', async () => {
    const r = rig(booked());
    expect(await r.personal.onLoaded()).toBe(true);
    expect(r.startScene).toHaveBeenCalledTimes(1);
  });

  it('nothing opens in the Night, with a scene open, or for a booking she cannot keep', async () => {
    const night = rig(booked((s) => { s.slot = 'night'; }));
    expect(await night.personal.onSlotAdvanced()).toBe(false);
    const busy = rig(booked());
    busy.h.setState((x) => { x.scene = { id: 's1', day: x.day, slot: x.slot, locationId: 'mess_hall', participants: [BEA], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 }; });
    expect(await busy.personal.onSlotAdvanced()).toBe(false);
    const brig = rig(booked((s) => { s.discipline = { defiance: [], threats: [], applications: [], restrictions: [{ unitId: ANN, kind: 'confined', untilDay: 9 }], demands: [], demandLog: [] }; }));
    expect(await brig.personal.onSlotAdvanced()).toBe(false);
    expect(brig.startScene).not.toHaveBeenCalled();
    expect(dueBooking(brig.h.state())?.status).toBe('booked'); // it lapses free when the slot passes
  });

  it('a conflict settles itself and its winner is played', async () => {
    const s = booked((x) => {
      partner(x, BEA, { lead: 'balanced', stateId: 'lover', affinity: 80 });
      x.personal!.bookings!.push({ id: 'bk_2', unitId: BEA, kindId: 'evening_with_me', day: 5, slot: 'evening', status: 'booked', source: 'roll', made: 4, conflict: true });
      x.personal!.bookings![0].conflict = true;
    });
    const r = rig(s);
    expect(await r.personal.onSlotAdvanced()).toBe(true);
    expect(r.startScene).toHaveBeenCalledWith(expect.objectContaining({ participants: [ANN] }));
  });

  it('cancelBooking, resolveConflict and answerClaim go through the engine and toast a refusal', () => {
    const r = rig(booked((s) => { s.day = 4; s.personal!.bookings![0].day = 5; }));
    expect(r.personal.cancelBooking('bk_1')).toBe(true);
    expect(r.h.state().personal!.bookings![0].status).toBe('cancelled');
    expect(r.refresh).toHaveBeenCalled();
    expect(r.personal.cancelBooking('bk_1')).toBe(false);
    expect(r.h.toasts.at(-1)).toMatchObject({ kind: 'error' });
    expect(r.personal.resolveConflict({ bookingId: 'nope' })).toBe(false);
    expect(r.personal.answerClaim(ANN, true)).toBe(false); // no claim to refuse
    expect(r.personal.answerClaim(ANN, false)).toBe(true); // LET IT STAND is only closing the card
  });
});

describe('the smother', () => {
  it("the smother hold's scene is opened by its booking, not by the bonds controller", async () => {
    const s = partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 80 });
    s.day = 5;
    s.slot = 'morning';
    startSmother(s, ANN, reg);
    expect(s.personal!.bookings![0]).toMatchObject({ source: 'smother', slot: 'afternoon' });
    s.slot = 'afternoon';
    // the bonds controller no longer opens anything
    const bondsRig = worldHarness(reg, s);
    const bondStart = vi.fn(async () => true);
    const bonds = createBonds({ ...bondsRig.deps, context: new ContextBuilder(), refreshContext: () => {}, startScene: bondStart } as never);
    expect((bonds as unknown as { onSlotAdvanced?: unknown }).onSlotAdvanced).toBeUndefined();
    expect(bondStart).not.toHaveBeenCalled();
    // the booking opens it
    const r = rig(s);
    expect(await r.personal.onSlotAdvanced()).toBe(true);
    expect(r.startScene).toHaveBeenCalledWith(expect.objectContaining({ participants: [ANN] }));
  });
});

describe('events', () => {
  it('onEvents refreshes the context for the events that change a directive, and ignores the rest', () => {
    const r = rig(plain(reg));
    r.personal.onEvents([{ type: 'dm_sent' }]);
    expect(r.refresh).not.toHaveBeenCalled();
    r.personal.onEvents([{ type: 'claimed', unitId: ANN, reactions: [] }, { type: 'booking_cancelled', bookingId: 'x', unitId: ANN }]);
    expect(r.refresh).toHaveBeenCalled();
  });

  it('a booking conflict is announced', () => {
    const r = rig(plain(reg));
    r.personal.onEvents([{ type: 'booking_conflict', day: 6, slot: 'evening', bookingIds: ['a', 'b'] }]);
    expect(r.h.toasts.at(-1)).toMatchObject({ kind: 'info', text: expect.stringContaining('evening') });
  });
});

describe('the dm_edit sanitizer', () => {
  it('keeps plain text of at most 300 characters and fails soft', () => {
    expect(sanitizeDmEdit({ text: '  A <b>plain</b>\n line.  ' })).toEqual({ text: 'A plain line.' });
    expect(sanitizeDmEdit({ text: 'x'.repeat(400) })!.text).toHaveLength(300);
    expect(sanitizeDmEdit({ text: '   ' })).toBeNull();
    expect(sanitizeDmEdit({ text: 5 })).toBeNull();
    expect(sanitizeDmEdit(null)).toBeNull();
    expect(sanitizeDmEdit([])).toBeNull();
  });
});

describe('settings', () => {
  it('dmEditWording is on by default', () => {
    expect(DEFAULT_SETTINGS.dmEditWording).toBe(true);
  });
});

void setRelation;
