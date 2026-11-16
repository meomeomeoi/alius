import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { addSecret } from '../../src/engine/personal/secrets';
import { personalOf } from '../../src/engine/personal/state';
import type { CampaignState, SquadSecret } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { createPersonal } from '../../src/personal/controller';
import { DERIVED, personalDirectives, refreshPersonalDirectives } from '../../src/personal/directives';
import { ANN, BEA, CAT, plain } from '../helpers/personal';
import { loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** The commander has no pronoun in any text a player or the model reads (lore §0), "they" and "their" included. */
const PRONOUN = /\bthe commander\b[^.]*\b(he|him|his|himself|they|them|their|theirs)\b/i;

function scene(s: CampaignState, ...ids: string[]): CampaignState {
  s.scene = { id: 'sc', day: s.day, slot: s.slot, participants: ids, mode: ids.length > 1 ? 'group' : 'private', locationId: 'mess_hall', exchanges: 0 } as never;
  return s;
}
function withSecret(status: SquadSecret['status'] = 'kept', knownBy = [ANN, BEA]): { s: CampaignState; x: SquadSecret } {
  const s = plain(reg);
  addSecret(s, reg, { kindId: 'hidden_injury', knownBy, subjectId: ANN, vars: { name: 'Ann' } });
  const x = personalOf(s).secrets![0];
  x.status = status;
  if (status === 'used') x.usedUntil = s.day + 14;
  return { s, x };
}
const ids = (s: CampaignState, present: string[]) => personalDirectives(s, reg, present).map((d) => d.id);

describe('personal:secret directives', () => {
  it('a scene with a knower gets the do-not-reveal directive; the context never shows the text outside it (acceptance 5)', () => {
    const { s, x } = withSecret();
    const withKnower = personalDirectives(scene(structuredClone(s), BEA), reg, [BEA]).find((d) => d.id === `personal:secret:${x.id}`)!;
    expect(withKnower.text).toContain(x.text);
    expect(withKnower.text).toMatch(/^Bea knows/);
    expect(withKnower.text).toMatch(/She does NOT reveal it to the commander/);
    const both = personalDirectives(scene(structuredClone(s), ANN, BEA), reg, [ANN, BEA]).find((d) => d.id === `personal:secret:${x.id}`)!;
    expect(both.text).toMatch(/^Ann and Bea know /);
    expect(both.text).toMatch(/They do NOT reveal it to the commander/);

    const present = scene(structuredClone(s), BEA);
    const b = new ContextBuilder();
    refreshPersonalDirectives(b, present, reg);
    const built = b.build(present, 5000);
    expect(built.directives).toContain(x.text);
    expect(built.block).not.toContain(x.text);

    const absent = scene(structuredClone(s), CAT);
    const b2 = new ContextBuilder();
    refreshPersonalDirectives(b2, absent, reg);
    const none = b2.build(absent, 5000);
    expect(none.directives + none.block).not.toContain(x.text);
    expect(ids(absent, [CAT])).toEqual([]);
  });

  it('names only the knowers who are in the scene', () => {
    const { s, x } = withSecret();
    expect(personalDirectives(s, reg, [BEA]).find((d) => d.id === `personal:secret:${x.id}`)!.text).toMatch(/^Bea knows/);
  });

  it('pretend keeps the directive; use switches it; confront drops it; a found one waits without one', () => {
    const { s, x } = withSecret('pretend');
    expect(ids(s, [ANN])).toEqual([`personal:secret:${x.id}`]);
    x.status = 'used';
    x.usedUntil = s.day + 14;
    const used = personalDirectives(s, reg, [ANN]).find((d) => d.id === `personal:secret:${x.id}`)!;
    expect(used.text).toMatch(/^The commander knows/);
    expect(used.text).toContain('hold it over Ann');
    expect(used.text).not.toMatch(/do not reveal/i);
    x.usedUntil = s.day; // the hold is over
    expect(ids(s, [ANN])).toEqual([]);
    x.status = 'confronted';
    expect(ids(s, [ANN])).toEqual([]);
    x.status = 'found';
    expect(ids(s, [ANN])).toEqual([]);
  });

  it('follows a reload and is dropped on a chat switch; it is registered as derived', () => {
    const { s } = withSecret();
    scene(s, ANN);
    const reloaded = JSON.parse(JSON.stringify(s)) as CampaignState;
    const b = new ContextBuilder();
    refreshPersonalDirectives(b, reloaded, reg);
    expect(b.build(reloaded, 5000).directives).toContain('does NOT reveal it');
    expect(DERIVED).toContain('personal:secret:');
  });

  it('no commander pronoun in any secret directive', () => {
    for (const status of ['kept', 'pretend', 'used'] as const) {
      const { s } = withSecret(status);
      for (const d of personalDirectives(s, reg, [ANN, BEA])) expect(PRONOUN.test(d.text), d.text).toBe(false);
    }
  });
});

describe('the controller and the secret', () => {
  const rig = (s: CampaignState) => {
    const h = worldHarness(reg, s);
    const onSecretFound = vi.fn();
    const refresh = vi.fn();
    const personal = createPersonal({ ...h.deps, context: new ContextBuilder(), refreshContext: refresh, onSecretFound });
    return { h, personal, onSecretFound, refresh };
  };

  it('a found secret opens its card; the card asks again after a reload until it is answered', () => {
    const { s, x } = withSecret('found');
    const r = rig(s);
    r.personal.onEvents([{ type: 'secret_found', secretId: x.id, route: 'slip' }]);
    expect(r.onSecretFound).toHaveBeenCalledWith(x.id);
    expect(r.refresh).toHaveBeenCalled();
    r.onSecretFound.mockClear();
    r.personal.reopenSecrets();
    expect(r.onSecretFound).toHaveBeenCalledTimes(1);
    expect(r.onSecretFound).toHaveBeenCalledWith(x.id);
    expect(r.personal.answerSecret(x.id, 'use')).toBe(true);
    r.onSecretFound.mockClear();
    r.personal.reopenSecrets();
    expect(r.onSecretFound).not.toHaveBeenCalled();
  });

  it('two secrets found at once open one card; answering shows the next (review)', () => {
    const { s, x } = withSecret('found');
    addSecret(s, reg, { kindId: 'trader_deal', knownBy: [ANN, BEA] });
    const y = personalOf(s).secrets![1];
    y.status = 'found';
    const r = rig(s);
    r.personal.onEvents([{ type: 'secret_found', secretId: x.id, route: 'slip' }, { type: 'secret_found', secretId: y.id, route: 'insight' }]);
    expect(r.onSecretFound.mock.calls).toEqual([[x.id]]);
    r.onSecretFound.mockClear();
    expect(r.personal.answerSecret(x.id, 'pretend')).toBe(true);
    expect(r.onSecretFound.mock.calls).toEqual([[y.id]]);
    r.onSecretFound.mockClear();
    expect(r.personal.answerSecret(y.id, 'pretend')).toBe(true);
    expect(r.onSecretFound).not.toHaveBeenCalled();
  });

  it('answerSecret dispatches secret/respond (acceptance 5) and a refusal toasts', () => {
    const { s, x } = withSecret('found');
    const r = rig(s);
    expect(r.personal.answerSecret(x.id, 'confront')).toBe(true);
    expect(r.h.app().current().state?.personal?.secrets?.[0].status).toBe('confronted');
    expect(r.personal.answerSecret(x.id, 'confront')).toBe(false);
  });

  it('without a card host the discovery is only a toast with no text', () => {
    const { s, x } = withSecret('found');
    const h = worldHarness(reg, s);
    const personal = createPersonal({ ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn() });
    personal.onEvents([{ type: 'secret_found', secretId: x.id, route: 'night' }]);
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0].text).not.toContain(x.text);
  });
});
