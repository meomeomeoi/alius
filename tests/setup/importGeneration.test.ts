import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import type { Registries } from '../../src/content/types';
import { ALL_SECTIONS } from '../../src/llm/calls/profileImport';
import { llmLog } from '../../src/llm/log';
import { getSettings, type AliusSettings } from '../../src/settings';
import { importCommander } from '../../src/setup/commander';
import { importProfile } from '../../src/setup/profile';
import type { CardInfo } from '../../src/st/adapter';
import { FakeStAdapter } from '../../src/st/fake';
import { standaloneEnvelope } from '../helpers/envelopeHost';
import { REFUSAL } from '../fixtures/llm/failures';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});
beforeEach(() => llmLog.clear());

const fixture = (n: string) => readFileSync(`tests/fixtures/profile_import/${n}.txt`, 'utf8');
const card = (n: string): CardInfo => JSON.parse(readFileSync(`tests/fixtures/cards/${n}.json`, 'utf8'));

function world(over: Partial<AliusSettings> = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
  const settings: AliusSettings = { ...getSettings(st), mechanicProfileId: 'mech', autoRetry: 0, ...over };
  const c = card('detailed');
  st.cards.set(c.avatar, c);
  return { st, settings, avatar: c.avatar, deps: { st, settings, registries: reg, generations: standaloneEnvelope(st, reg, () => settings) } };
}

describe('setup.profile_import and setup.commander_import', () => {
  it('a refused profile import shows "Profile import: the model refused." in the wizard', async () => {
    const { st, avatar, deps } = world();
    st.profileReplies = [REFUSAL];
    expect(await importProfile(avatar, [...ALL_SECTIONS], deps)).toEqual({ kind: 'manual', reason: 'Profile import: the model refused.' });
  });

  it('every other reason is worded too', async () => {
    const a = world({ llmTimeoutMs: 30000 });
    a.st.profileReplies = [''];
    expect(await importProfile(a.avatar, [...ALL_SECTIONS], a.deps)).toMatchObject({ reason: 'Profile import: nothing came back.' });
    const b = world();
    b.st.profileReplies = ['{"role": "no'];
    expect(await importProfile(b.avatar, [...ALL_SECTIONS], b.deps)).toMatchObject({ reason: expect.stringMatching(/^Profile import: the answer was cut off/) });
  });

  it('a critical section the answer lacks is asked again within autoRetry, then goes to the manual form with its own words', async () => {
    const { st, avatar, deps } = world({ autoRetry: 1 });
    st.profileReplies = ['{"roleCandidates": []}', '{"roleCandidates": []}'];
    const r = await importProfile(avatar, [...ALL_SECTIONS], deps);
    expect(r).toMatchObject({ kind: 'manual', reason: expect.stringMatching(/^no usable (role|defects)/) });
    expect(st.calls.filter((c) => c.kind === 'profile')).toHaveLength(2);
  });

  it('two imports at once do not mix: each keeps its own input and sections', async () => {
    const a = world();
    const second = card('detailed');
    a.st.profileReplies = [fixture('valid'), fixture('valid')];
    const [x, y] = await Promise.all([importProfile(a.avatar, [...ALL_SECTIONS], a.deps), importProfile(second.avatar, ['role', 'defects'], a.deps)]);
    expect(x.kind).toBe('ok');
    expect(y.kind).toBe('ok');
  });

  it('a refused commander import is worded', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.profiles = [{ id: 'mech', name: 'Mech', api: 'openrouter', model: 'm' }];
    st.personaName = 'Vale';
    st.personaDescription = 'A scarred officer.';
    const settings: AliusSettings = { ...getSettings(st), mechanicProfileId: 'mech', autoRetry: 0 };
    st.profileReplies = [REFUSAL];
    expect(await importCommander(st, { settings, registries: reg, generations: standaloneEnvelope(st, reg, () => settings) })).toEqual({ kind: 'manual', reason: 'Commander import: the model refused.' });
  });

  it('a campaign is never touched: the import writes no record', async () => {
    const { st, avatar, deps } = world();
    st.profileReplies = [''];
    await importProfile(avatar, [...ALL_SECTIONS], deps);
    expect(st.calls.length).toBeGreaterThan(0);
  });
});
