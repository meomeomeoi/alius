import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ANN, harness, intentJson, praised, reply } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const intentCalls = (h: ReturnType<typeof harness>) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));
const open = async (h: ReturnType<typeof harness>) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
};

describe('editing messages in a scene', () => {
  it('editing the last reply rewrites it in the chat, undoes its extraction and reads the new text', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'You are an idiot.')]];
    h.st.mainReplies = [intentJson([praised(ANN, { type: 'insulted' })]), intentJson([praised()])];
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('Hello');
    expect(h.state().relations[ANN].affinity).toBe(base - 10);
    await h.controller.edit(1, 'Thank you, commander.');
    await h.controller.idle();
    expect(h.st.getChatMessages()[1].text).toBe('Thank you, commander.');
    expect(h.state().relations[ANN].affinity).toBe(base + 4); // the insult is gone, the new text was read once
    expect(h.state().relations[ANN].history.filter((x) => x.kind === 'event').map((x) => x.type)).toEqual(['praised']);
    expect((intentCalls(h).at(-1) as { prompt: string }).prompt).toContain('Thank you, commander.');
  });

  it('editing your own message of the last exchange does the same', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'ok')]];
    h.st.mainReplies = [intentJson([praised(ANN, { type: 'insulted' })]), intentJson()];
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('You are useless.');
    await h.controller.edit(0, 'You are doing fine.');
    await h.controller.idle();
    expect(h.state().relations[ANN].affinity).toBe(base);
    expect((intentCalls(h).at(-1) as { prompt: string }).prompt).toContain('You are doing fine.');
  });

  it('editing an older message only changes the text; what was read stays read', async () => {
    const h = harness(reg, { settings: { debug: true } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'one')], [reply('Ann', 'two')]];
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()])];
    await h.controller.send('first');
    await h.controller.send('second');
    const applied = h.state().relations[ANN].affinity;
    await h.controller.edit(1, 'one, edited');
    await h.controller.idle();
    expect(h.st.getChatMessages()[1].text).toBe('one, edited');
    expect(h.state().relations[ANN].affinity).toBe(applied);
    expect(intentCalls(h)).toHaveLength(2);
    expect(h.toasts.some((t) => /already been read/i.test(t.text))).toBe(true);
  });

  it('an edit made in SillyTavern itself is handled once, not twice', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'rude')]];
    h.st.mainReplies = [intentJson([praised(ANN, { type: 'insulted' })]), intentJson()];
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('Hi');
    h.st.on('message_edited', (i) => h.controller.onEdited(i as number));
    await h.controller.edit(1, 'polite'); // our own edit also fires the event: it must not be applied twice
    await h.controller.idle();
    expect(intentCalls(h)).toHaveLength(2);
    expect(h.state().relations[ANN].affinity).toBe(base);
  });

  it('a failing edit changes nothing and says so', async () => {
    const h = harness(reg);
    await open(h);
    await h.controller.edit(5, 'x');
    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
  });

  it('empty text is refused', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'ok')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('hi');
    await h.controller.edit(1, '   ');
    expect(h.st.getChatMessages()[1].text).toBe('ok');
  });
});

describe('stopping and silence', () => {
  it('stop() asks SillyTavern to stop the generation', async () => {
    const h = harness(reg);
    await open(h);
    h.controller.stop();
    expect(h.st.stopped).toBe(1);
  });

  it('a send that brings no reply says why instead of failing silently', async () => {
    const h = harness(reg);
    await open(h);
    // nothing scripted: the group answers with nobody
    await h.controller.send('Hello?');
    expect(h.toasts.some((t) => t.kind === 'warn' && /no reply/i.test(t.text))).toBe(true);
    expect(h.state().scene!.exchanges).toBe(0);
    expect(intentCalls(h)).toHaveLength(0);
  });
});
