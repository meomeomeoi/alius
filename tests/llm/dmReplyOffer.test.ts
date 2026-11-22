import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../../src/llm/calls/all';
import { getCallType } from '../../src/llm/callTypes';
import { DM_FIXTURE_INPUT, dmFixtureText } from './dmFixtureInput';

const ct = () => getCallType('dm_reply')!;
const pinned = readFileSync('tests/fixtures/dm_reply/prompt_without_offer.txt', 'utf8');

describe('the dm_reply prompt (P15, review I3)', () => {
  it('without an open offer it is byte-identical to the one made before the field existed (the pinned fixture)', () => {
    expect(dmFixtureText(ct())).toBe(pinned);
    expect(dmFixtureText(ct(), { offer: undefined })).toBe(pinned);
    expect(dmFixtureText(ct(), { offer: '' })).toBe(pinned);
  });

  it('with an offer line it carries the engine\'s answer for the reply, after her journal and before the messages', () => {
    const line = 'The commander offers her feet to Rhea. Rhea takes it up, in her own manner.';
    const text = String(ct().prompt({ ...DM_FIXTURE_INPUT, offer: line }));
    expect(text).toContain(line);
    expect(text.indexOf('Lately with the commander')).toBeLessThan(text.indexOf(line));
    expect(text.indexOf(line)).toBeLessThan(text.indexOf('Recent messages'));
  });
});
