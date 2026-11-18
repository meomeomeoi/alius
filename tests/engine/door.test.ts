import { beforeAll, describe, expect, it } from 'vitest';
import { RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { CONFRONTATION_KINDS } from '../../src/engine/loyalty/state';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const ANN = 'unit_ann';

/** Night, with Ann at the door (a plain visit). */
function knock(kind = 'visit'): CampaignState {
  const s = campaign(reg, 4);
  s.slot = 'night';
  s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind, priority: 50, framing: 'A knock.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
  return s;
}
const say = (s: CampaignState, text: string) => run(s, reg, { type: 'night/door_say', payload: { text } });
const reply = (s: CampaignState, text: string) => run(s, reg, { type: 'night/door_reply', payload: { text } });

describe('night/door_say', () => {
  it('stores the line on the open knock, emits door_said, and spends nothing', () => {
    const s = knock();
    const r = say(s, '  Who is it?  ');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'door_said')).toEqual([{ type: 'door_said', unitId: ANN }]);
    expect(r.state.calendar.nightEvent!.door).toEqual({ said: 'Who is it?' });
    expect(r.state.slot).toBe('night');
    expect(r.state.day).toBe(s.day);
    expect(r.state.relations).toEqual(s.relations);
    expect(r.state.dms).toEqual(s.dms);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('says once: a second line is rejected and the state is unchanged', () => {
    const once = say(knock(), 'First.').state;
    const r = say(once, 'Second.');
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(once);
  });

  it('1 to 300 characters', () => {
    expect(errors(say(knock(), '').events)).toHaveLength(1);
    expect(errors(say(knock(), '   ').events)).toHaveLength(1);
    expect(errors(say(knock(), 'x'.repeat(301)).events)).toHaveLength(1);
    expect(errors(say(knock(), 'x'.repeat(300)).events)).toEqual([]);
    expect(errors(run(knock(), reg, { type: 'night/door_say', payload: {} }).events)).toHaveLength(1);
  });

  it('needs an open knock in the night slot, and not a scene', () => {
    const day = knock();
    day.slot = 'evening';
    expect(errors(say(day, 'Hello').events)).toHaveLength(1);
    const none = knock();
    delete none.calendar.nightEvent;
    expect(errors(say(none, 'Hello').events)).toHaveLength(1);
    const open = run(knock(), reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0 } }).state;
    expect(errors(say(open, 'Hello').events)).toHaveLength(1);
  });

  it('confrontation entries refuse door_say (they keep their panel)', () => {
    for (const kind of CONFRONTATION_KINDS) {
      const s = knock(kind);
      const r = say(s, 'Hello');
      expect(errors(r.events), kind).toHaveLength(1);
      expect(r.state, kind).toEqual(s);
    }
  });
});

describe('night/door_reply', () => {
  it('stores her line after the said one and emits door_replied', () => {
    const said = say(knock(), 'Who is it?').state;
    const r = reply(said, 'Go away. No. Wait.');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'door_replied')).toEqual([{ type: 'door_replied', unitId: ANN }]);
    expect(r.state.calendar.nightEvent!.door).toEqual({ said: 'Who is it?', reply: 'Go away. No. Wait.' });
    expect(r.state.slot).toBe('night');
    expect(r.state.relations).toEqual(said.relations);
    expect(r.state.rng).toEqual(said.rng);
  });

  it('needs a said line, rejects a second reply and a bad length', () => {
    const s = knock();
    expect(errors(reply(s, 'Hello').events)).toHaveLength(1);
    const said = say(s, 'Hi').state;
    expect(errors(reply(said, '').events)).toHaveLength(1);
    expect(errors(reply(said, 'x'.repeat(401)).events)).toHaveLength(1);
    const full = reply(said, 'Hello').state;
    const again = reply(full, 'Again');
    expect(errors(again.events)).toHaveLength(1);
    expect(again.state).toEqual(full);
  });

  it('nothing is pushed to the DM thread', () => {
    const r = reply(say(knock(), 'Hi').state, 'Hello');
    expect(r.state.dms[ANN] ?? []).toEqual([]);
  });
});

describe('after a door exchange', () => {
  const exchanged = () => reply(say(knock(), 'Who is it?').state, 'Go away.').state;

  it('night/open still opens the scene', () => {
    const r = run(exchanged(), reg, { type: 'night/open', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'night_opened')).toHaveLength(1);
  });

  it('night/ignore applies the ignore consequence and rolls the day', () => {
    const s = exchanged();
    const before = s.relations[ANN].affinity;
    const r = run(s, reg, { type: 'night/ignore', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].affinity).toBe(before - 1);
    expect(r.state.day).toBe(s.day + 1);
    expect(r.state.calendar.nightEvent).toBeUndefined();
  });
});

describe('event types', () => {
  it('door_said and door_replied are reserved', () => {
    for (const t of ['door_said', 'door_replied']) expect(RESERVED_EVENT_TYPES).toContain(t);
  });
});
