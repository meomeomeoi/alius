// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fillProse, proseLength, proseRuns } from '../../../src/ui/scene/stage/prose';

const joined = (text: string): string => proseRuns(text).map((r) => r.text).join('');

describe('proseRuns (the reply as written)', () => {
  it('speech in straight and curly quotes', () => {
    expect(proseRuns('She nods. "Close it." Then: “Now.”')).toEqual([
      { kind: 'prose', text: 'She nods. ' },
      { kind: 'speech', text: '"Close it."' },
      { kind: 'prose', text: ' Then: ' },
      { kind: 'speech', text: '“Now.”' },
    ]);
  });

  it('asterisks become em and lose the marks', () => {
    expect(proseRuns('*She stretches.* "Sit."')).toEqual([
      { kind: 'em', text: 'She stretches.' },
      { kind: 'prose', text: ' ' },
      { kind: 'speech', text: '"Sit."' },
    ]);
  });

  it('speech inside an em stays em', () => {
    expect(proseRuns('*she says "no"*')).toEqual([{ kind: 'em', text: 'she says "no"' }]);
  });

  it('an em inside speech keeps the speech colour and loses its marks', () => {
    const runs = proseRuns('"I *really* mean it."');
    expect(runs.map((r) => r.text).join('')).toBe('"I really mean it."');
    expect(runs.map((r) => r.kind)).toEqual(['speech', 'em', 'speech']);
    expect(runs[1].speech).toBe(true);
  });

  it('unbalanced marks are text from the mark on', () => {
    expect(proseRuns('She leans in. "Close')).toEqual([
      { kind: 'prose', text: 'She leans in. ' },
      { kind: 'prose', text: '"Close' },
    ]);
    expect(joined('She leans in. "Close')).toBe('She leans in. "Close');
    expect(proseRuns('*half')).toEqual([{ kind: 'prose', text: '*half' }]);
    expect(proseRuns('*She leans in. "Close')).toEqual([{ kind: 'prose', text: '*She leans in. "Close' }]);
  });

  it('a stray mark does not eat the lines after it', () => {
    const text = 'She says *wait\n"Fine," she says.';
    expect(joined(text)).toBe(text);
    expect(proseRuns(text).some((r) => r.kind === 'speech' && r.text === '"Fine,"')).toBe(true);
  });

  it('literary prose', () => {
    expect(proseRuns('She stretches. "Close the door," she says.')).toEqual([
      { kind: 'prose', text: 'She stretches. ' },
      { kind: 'speech', text: '"Close the door,"' },
      { kind: 'prose', text: ' she says.' },
    ]);
  });

  it('empty marks and an empty text are plain', () => {
    expect(proseRuns('')).toEqual([]);
    expect(joined('a ** b')).toBe('a ** b');
    expect(joined('say "" now')).toBe('say "" now');
  });

  it('every character shows, in order, whatever the marks do', () => {
    for (const t of ['*a* "b" *c', '"a *b" c*', '“x" y”', '*"*"', '"*"*"', 'plain', '* "', '**"**"']) {
      const out = proseRuns(t).map((r) => r.text).join('');
      expect(out.replace(/\*/g, '')).toBe(t.replace(/\*/g, '')); // only the marks of a balanced em pair may go
      expect(out.length).toBeLessThanOrEqual(t.length);
    }
  });
});

describe('proseLength', () => {
  it('counts what shows (the asterisks of a balanced pair excluded)', () => {
    expect(proseLength('*ab* "c"')).toBe(6);
    expect(proseLength('*ab')).toBe(3);
    expect(proseLength('')).toBe(0);
  });
});

describe('fillProse', () => {
  it('shows the first visible characters across runs', () => {
    const el = document.createElement('div');
    fillProse(el, '*ab* "cd" ef', 3);
    expect(el.textContent).toBe('ab ');
    fillProse(el, '*ab* "cd" ef', 5);
    expect(el.textContent).toBe('ab "c');
    fillProse(el, '*ab* "cd" ef', Infinity);
    expect(el.textContent).toBe('ab "cd" ef');
  });

  it('speech gets the speech class, em is <em>', () => {
    const el = document.createElement('div');
    fillProse(el, '*She sits.* "Hi," she says.', Infinity, { speechClass: 'alius-speech' });
    expect(el.querySelector('em')!.textContent).toBe('She sits.');
    expect(el.querySelector('em')!.classList.contains('alius-glitch')).toBe(true);
    expect(el.querySelector('.alius-speech')!.textContent).toBe('"Hi,"');
  });

  it('never parses markup', () => {
    const el = document.createElement('div');
    fillProse(el, '<b>x</b> *<i>y</i>* "<u>z</u>"', Infinity);
    expect(el.querySelector('b, i, u')).toBeNull();
    expect(el.textContent).toBe('<b>x</b> <i>y</i> "<u>z</u>"');
  });

  it('runs from newestFrom on carry alius-prose-new', () => {
    const el = document.createElement('div');
    fillProse(el, 'one "two" three', Infinity, { newestFrom: 1 });
    const marked = [...el.querySelectorAll('.alius-prose-new')].map((e) => e.textContent);
    expect(marked).toEqual(['"two"', ' three']);
    fillProse(el, 'one "two" three', Infinity);
    expect(el.querySelector('.alius-prose-new')).toBeNull();
  });
});
