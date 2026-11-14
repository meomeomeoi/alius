// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderBubble, renderVoiceCard, UNIT_ACCENTS, unitAccent } from '../../src/ui/voice/voiceCard';
import type { Voice } from '../../src/ui/voice/sources';
import { contrastRatio, cssVars } from '../helpers/css';
import { readFileSync } from 'node:fs';

afterEach(() => {
  document.body.innerHTML = '';
});

const VOICES: Voice[] = ['terminal', 'corporate', 'paper', 'personal'];

describe('renderVoiceCard', () => {
  it.each(VOICES)('the %s voice renders with its class and data-voice', (voice) => {
    const card = renderVoiceCard({ voice, title: 'T', body: 'body' });
    expect(card.tagName).toBe('ARTICLE');
    expect(card.classList.contains('alius-voice')).toBe(true);
    expect(card.classList.contains(`alius-voice-${voice}`)).toBe(true);
    expect(card.dataset.voice).toBe(voice);
  });

  it('shows the title, meta and sender, and a node body as it is', () => {
    const inner = document.createElement('div');
    inner.className = 'inner';
    const card = renderVoiceCard({ voice: 'paper', title: 'DOSSIER', meta: 'DAY 003', from: 'Records', body: inner });
    expect(card.querySelector('.alius-voice-title')!.textContent).toBe('DOSSIER');
    expect(card.querySelector('.alius-voice-meta')!.textContent).toBe('DAY 003');
    expect(card.querySelector('.alius-voice-from')!.textContent).toBe('Records');
    expect(card.querySelector('.alius-voice-body .inner')).toBe(inner);
  });

  it('the title level is configurable and defaults to h2', () => {
    expect(renderVoiceCard({ voice: 'paper', title: 'T', body: '' }).querySelector('h2.alius-voice-title')).not.toBeNull();
    expect(renderVoiceCard({ voice: 'paper', title: 'T', body: '', level: 3 }).querySelector('h3.alius-voice-title')).not.toBeNull();
  });

  it('a card without title, meta or sender has only a body', () => {
    const card = renderVoiceCard({ voice: 'terminal', body: 'x' });
    expect(card.querySelector('.alius-voice-head')).toBeNull();
    expect(card.querySelector('.alius-voice-body')!.textContent).toBe('x');
  });

  it('text is set as text', () => {
    const card = renderVoiceCard({ voice: 'corporate', title: '<i>t</i>', meta: '<u>m</u>', body: '<b>x</b>' });
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('i')).toBeNull();
    expect(card.querySelector('.alius-voice-body')!.textContent).toBe('<b>x</b>');
    expect(card.querySelector('.alius-voice-title')!.textContent).toBe('<i>t</i>');
  });

  it('a stamp renders as a rotated box with the text', () => {
    const card = renderVoiceCard({ voice: 'paper', body: 'x', stamp: 'APPROVED' });
    expect(card.querySelector('.alius-stamp')!.textContent).toBe('APPROVED');
    expect(renderVoiceCard({ voice: 'paper', body: 'x' }).querySelector('.alius-stamp')).toBeNull();
  });

  it('redact covers the given range and keeps the text out of textContent', () => {
    const card = renderVoiceCard({ voice: 'paper', body: 'The commander sold the orders.', redact: [[4, 13]] });
    const bars = card.querySelectorAll('.alius-redact');
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute('aria-label')).toBe('redacted');
    expect(card.textContent).not.toContain('commander');
    expect(card.textContent!.startsWith('The ')).toBe(true);
    expect(card.textContent!.endsWith(' sold the orders.')).toBe(true);
    expect(bars[0].textContent!.length).toBe(9);
  });

  it('redact takes several ranges in any order, clamps them, and skips overlapping and empty ones', () => {
    // sorted: [0,2] [1,4] (overlaps, skipped) [5,5] (empty, skipped) [7,99] (clamped to 7..10)
    const card = renderVoiceCard({ voice: 'paper', body: 'abcdefghij', redact: [[7, 99], [0, 2], [1, 4], [5, 5]] });
    expect(card.querySelectorAll('.alius-redact')).toHaveLength(2);
    expect(card.textContent!.replace(/█/g, '')).toBe('cdefg');
    expect(card.textContent).not.toMatch(/[abhij]/);
  });

  it('redact is ignored for a node body', () => {
    const inner = document.createElement('p');
    inner.textContent = 'secret';
    const card = renderVoiceCard({ voice: 'paper', body: inner, redact: [[0, 3]] });
    expect(card.querySelector('.alius-redact')).toBeNull();
    expect(card.textContent).toContain('secret');
  });

  it('the accent is exposed as a custom property', () => {
    expect(renderVoiceCard({ voice: 'personal', body: 'x', accent: '#ff9ec7' }).style.getPropertyValue('--voice-accent')).toBe('#ff9ec7');
  });
});

describe('renderBubble', () => {
  it('is a personal-voice bubble: hers on the left, the commander\'s on the right', () => {
    const hers = renderBubble('hi', false, '#ff9ec7');
    const mine = renderBubble('yo', true, '#ff9ec7');
    for (const b of [hers, mine]) {
      expect(b.classList.contains('alius-bubble')).toBe(true);
      expect(b.classList.contains('alius-voice-personal')).toBe(true);
      expect(b.dataset.voice).toBe('personal');
    }
    expect(hers.classList.contains('is-hers')).toBe(true);
    expect(mine.classList.contains('is-mine')).toBe(true);
    expect(hers.style.getPropertyValue('--bubble-accent')).toBe('#ff9ec7');
  });

  it('sets the text as text', () => {
    const b = renderBubble('<img src=x onerror=alert(1)>', false, '#ff9ec7');
    expect(b.querySelector('img')).toBeNull();
    expect(b.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('unitAccent', () => {
  it('is one of six fixed accents, stable per unit id, and spreads over units', () => {
    expect(UNIT_ACCENTS).toHaveLength(6);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const a = unitAccent(`unit_${i}`);
      expect(UNIT_ACCENTS).toContain(a);
      expect(unitAccent(`unit_${i}`)).toBe(a);
      seen.add(a);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('voice contrast (css/18-voices.css)', () => {
  const FILE = 'css/18-voices.css';
  const sel = (voice: string) => `#alius-shell .alius-voice-${voice}`;

  it.each(['corporate', 'paper', 'personal'])('%s: text and dim text read on its background at 4.5:1', (voice) => {
    const v = cssVars(FILE, sel(voice));
    for (const k of ['--voice-bg', '--voice-fg', '--voice-dim']) expect(v[k], `${voice} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrastRatio(v['--voice-fg'], v['--voice-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v['--voice-dim'], v['--voice-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('terminal reads the palette (no colours of its own)', () => {
    const v = cssVars(FILE, sel('terminal'));
    expect(v['--voice-bg']).toBe('var(--alius-bg)');
    expect(v['--voice-fg']).toBe('var(--alius-fg)');
    expect(v['--voice-dim']).toBe('var(--alius-dim)');
  });

  it('each of the six accents reads on the her-bubble and on the thread background at 4.5:1', () => {
    const p = cssVars(FILE, sel('personal'));
    for (const a of UNIT_ACCENTS) {
      expect(contrastRatio(a, p['--bubble-bg']), `${a} on bubble`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a, p['--voice-bg']), `${a} on thread`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('her bubble text reads on her bubble, the stamp and the paper reds read on paper', () => {
    const p = cssVars(FILE, sel('personal'));
    expect(contrastRatio(p['--bubble-fg'], p['--bubble-bg'])).toBeGreaterThanOrEqual(4.5);
    const paper = cssVars(FILE, sel('paper'));
    expect(contrastRatio(paper['--voice-stamp'], paper['--voice-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('readable mode drops the paper fibre and the stamp rotation, and the paper fibre is inline SVG (no url() asset)', () => {
    const css = readFileSync(FILE, 'utf8');
    expect(css).toMatch(/\.alius-readable\s+\.alius-fibre\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.alius-readable\s+\.alius-stamp\s*\{[^}]*transform:\s*none/s);
    expect(css).not.toMatch(/url\(/);
    const card = renderVoiceCard({ voice: 'paper', body: 'x' });
    expect(card.querySelector('svg.alius-fibre filter')).not.toBeNull();
  });
});
