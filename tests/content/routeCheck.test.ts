import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { DilemmaTemplateSchema, RouteCheckSchema } from '../../src/content/schemas';

const body = { kind: 'body', stat: 'strength', min: 3 };
const delegate = { kind: 'delegate', cost: { trustCheck: 'low', stress: 5 } };
const option = (label: string, effects: unknown[], routeCheck?: unknown) => ({ label, effects, ...(routeCheck ? { routeCheck } : {}) });
const cost = { type: 'party_stress', amount: 5 };
const tplWith = (routeCheck: unknown) => ({
  id: 'evt_x', scale: 'minor', contexts: ['expedition_event'],
  fixed: { title: 'T', setup: 'S', options: [option('A', [cost], routeCheck), option('B', [{ type: 'resource', resource: 'credits', amount: -10 }])] },
});

describe('RouteCheckSchema', () => {
  it('a body-only check is rejected', () => {
    const r = RouteCheckSchema.safeParse({ id: 'c', routes: [body, { ...body, stat: 'reflexes', min: 2 }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify((r as { error: unknown }).error)).toContain('a check needs at least one route that is not body (overview P10)');
  });

  it('body plus delegate is accepted', () => {
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [body, delegate] }).success).toBe(true);
  });

  it('every route kind parses', () => {
    const all = [
      body, delegate, { kind: 'social', stat: 'authority', min: 3 }, { kind: 'item', itemId: 'item_blade' },
      { kind: 'bypass', cost: { resource: 'supplies', amount: 2 } },
    ];
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: all }).success).toBe(true);
  });

  it('0 and 6 routes, a body min of 6 and a zero-cost bypass are rejected', () => {
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [] }).success).toBe(false);
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [delegate, delegate, delegate, delegate, delegate, delegate] }).success).toBe(false);
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [{ ...body, min: 6 }, delegate] }).success).toBe(false);
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [{ kind: 'bypass', cost: { resource: 'credits', amount: 0 } }] }).success).toBe(false);
  });

  it('unknown keys are rejected (strict)', () => {
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [delegate], extra: 1 }).success).toBe(false);
    expect(RouteCheckSchema.safeParse({ id: 'c', routes: [{ ...delegate, extra: 1 }] }).success).toBe(false);
  });

  it('an event option may carry a routeCheck, and a body-only one fails the template', () => {
    expect(DilemmaTemplateSchema.safeParse(tplWith({ id: 'c', routes: [body, delegate] })).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse(tplWith({ id: 'c', routes: [body] })).success).toBe(false);
  });
});

/** The core pack with one extra event template, read through the real loader. */
async function loadWith(routeCheck: unknown) {
  return loadPacks(['content/core'], async (p) => {
    const json = JSON.parse(await readFile(p, 'utf8'));
    return p.endsWith('/dilemmaTemplates.json') ? [...json, tplWith(routeCheck)] : json;
  });
}

describe('routeCheck references', () => {
  it('a valid check loads', async () => {
    const r = await loadWith({ id: 'c', routes: [body, { ...delegate, unitFilter: { roles: ['assault'] } }, { kind: 'item', itemId: 'item_blade' }] });
    expect(r.errors).toEqual([]);
  });

  it('an unknown role in unitFilter is a broken reference', async () => {
    const r = await loadWith({ id: 'c', routes: [{ ...delegate, unitFilter: { roles: ['no_such_role'] } }] });
    expect(r.errors.map((e) => JSON.stringify(e)).join('\n')).toMatch(/no_such_role/);
  });

  it('an unknown itemId is a broken reference', async () => {
    const r = await loadWith({ id: 'c', routes: [delegate, { kind: 'item', itemId: 'no_such_item' }] });
    expect(r.errors.map((e) => JSON.stringify(e)).join('\n')).toMatch(/no_such_item/);
  });
});
