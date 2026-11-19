// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { descriptor } from '../../src/engine/commander/profile';
import type { SetupResult } from '../../src/engine/setup';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../src/settings';
import { Wizard } from '../../src/setup/wizard';
import { FakeStAdapter } from '../../src/st/fake';
import { h } from '../../src/ui/dom';
import { fillLine } from '../../src/ui/setup/prologueSteps';
import { renderSetupScreen } from '../../src/ui/setup/setupScreen';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  document.body.innerHTML = '';
});

function make(opts: { reducedMotion?: boolean; canBind?: boolean } = {}) {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  const wizard = new Wizard(
    { registries: reg, desireBondDefects: false, importer: vi.fn(async () => ({ kind: 'manual', reason: 'test' })) as never, onChange: () => {} },
    { personaName: 'Vale', canBindCurrent: opts.canBind ?? false },
  );
  const host = h('div');
  document.body.append(host);
  const settings: AliusSettings = { ...DEFAULT_SETTINGS, reducedMotion: opts.reducedMotion ?? false };
  const play = vi.fn();
  const onConfirm = vi.fn(async (_r: SetupResult, _t: 'new_group' | 'current_group') => {});
  renderSetupScreen(host, {
    wizard, registries: reg, st, settings: () => settings, sound: { play } as never,
    onCancel: vi.fn(), onConfirm, modal: vi.fn(async () => null) as never,
  });
  return { wizard, host, play, onConfirm };
}
type M = ReturnType<typeof make>;

/** Walks the wizard (no units, so calibration is skipped) to a step, with start and crime chosen. */
function goTo(m: M, step: string, crime = true): M {
  m.wizard.setStart('start_vesper');
  if (crime) m.wizard.setCrime('mutiny');
  for (let i = 0; i < 12 && m.wizard.state.step !== step; i++) m.wizard.next();
  expect(m.wizard.state.step).toBe(step);
  return m;
}
const q = <T extends HTMLElement = HTMLElement>(m: M, sel: string) => m.host.querySelector<T>(sel);
const qa = (m: M, sel: string) => [...m.host.querySelectorAll<HTMLElement>(sel)];
const text = (m: M) => m.host.textContent ?? '';

describe('fillLine', () => {
  it('replaces {KEY} and leaves unknown keys alone', () => {
    expect(fillLine('{FIELD}: {VALUE}. Write it down.', { FIELD: 'Build', VALUE: 'slight' })).toBe('Build: slight. Write it down.');
    expect(fillLine('Held by {CORPORATION} {OTHER}.', { CORPORATION: 'Vesper' })).toBe('Held by Vesper {OTHER}.');
    expect(fillLine('{A}{A}', { A: 'x' })).toBe('xx');
  });
});

describe('cold open', () => {
  const lines = () => (reg.prologues.get('prologue_vesper')!.steps as Record<string, { authoredText: string[] }>).cold_open.authoredText;

  it('shows every authoredText line in a paper card', () => {
    const m = goTo(make(), 'cold_open', false);
    const card = q(m, 'article.alius-voice-paper')!;
    expect(card).not.toBeNull();
    expect([...card.querySelectorAll('.alius-cold-line')].map((p) => p.textContent)).toEqual(lines());
    expect(card.querySelector('.alius-voice-title')!.textContent).toBe('TRANSFER ORDER');
  });

  it('a head start shows its own recollection instead of the transport, and none at arrival (P11b)', () => {
    const steps = reg.prologues.get('prologue_vesper')!.steps as Record<string, { headStartText?: string[]; headStartTitle?: string }>;
    const own = steps.cold_open.headStartText!;
    expect(own.length).toBeGreaterThanOrEqual(2);
    const m = make();
    m.wizard.setStart('start_vesper');
    m.wizard.setHeadStart(14);
    goTo(m, 'cold_open', false);
    const card = q(m, 'article.alius-voice-paper')!;
    expect([...card.querySelectorAll('.alius-cold-line')].map((p) => p.textContent)).toEqual(own);
    expect(card.querySelector('.alius-voice-title')!.textContent).toBe(steps.cold_open.headStartTitle);
    expect(text(m)).not.toContain('The transport');
    const plain = goTo(make(), 'cold_open', false);
    expect([...q(plain, 'article.alius-voice-paper')!.querySelectorAll('.alius-cold-line')].map((p) => p.textContent)).toEqual(lines());
  });

  it('types the lines out at 60 characters a second', () => {
    const m = goTo(make(), 'cold_open', false);
    const first = q(m, '.alius-cold-line')!;
    expect(first.classList.contains('is-typing')).toBe(true);
    expect(first.style.getPropertyValue('--type-ms')).toBe(String(Math.round((lines()[0].length / 60) * 1000)));
    // each line waits for the one before it
    const delays = qa(m, '.alius-cold-line').map((p) => Number(p.style.getPropertyValue('--type-delay')));
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('lines appear at once under reduced motion', () => {
    const m = goTo(make({ reducedMotion: true }), 'cold_open', false);
    expect(qa(m, '.alius-cold-line').every((p) => !p.classList.contains('is-typing'))).toBe(true);
    expect(m.host.querySelector('[style*="--type"]')).toBeNull();
  });

  it('the Kestrel start reads its own cold open', () => {
    const m = make();
    m.wizard.setStart('start_kestrel');
    for (let i = 0; i < 3; i++) m.wizard.next();
    expect(text(m)).toContain('Corridor K-12');
  });

  it('Next is enabled: nothing is asked on the cold open', () => {
    const m = goTo(make(), 'cold_open', false);
    expect(q<HTMLButtonElement>(m, 'button[data-action="next"]')!.disabled).toBe(false);
  });
});

describe('intake', () => {
  it('crime cards drive setCrime', () => {
    const m = goTo(make(), 'intake', false);
    expect(m.wizard.state.crimeId).toBeNull();
    q(m, '.alius-crime-card[data-id="purge"]')!.click();
    expect(m.wizard.state.crimeId).toBe('purge');
    expect(q(m, '.alius-crime-card[data-id="purge"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(qa(m, '.alius-crime-card')).toHaveLength(reg.crimes.size);
  });

  it('the name input drives setCommanderName', () => {
    const m = goTo(make(), 'intake', false);
    const input = q<HTMLInputElement>(m, 'input[data-key="name"]')!;
    input.value = 'Ash';
    input.dispatchEvent(new Event('input'));
    expect(m.wizard.state.commanderName).toBe('Ash');
  });

  it('the owner line names the start\'s corporation', () => {
    const m = goTo(make(), 'intake', false);
    const raw = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string> }>).intake.lines.confirm_owner;
    expect(text(m)).toContain(fillLine(raw, { CORPORATION: 'Vesper Somatics' }));
    expect(text(m)).not.toContain('{CORPORATION}');
  });

  it('asks the clerk\'s questions as lines above the fields', () => {
    const m = goTo(make(), 'intake', false);
    const lines = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string> }>).intake.lines;
    expect(text(m)).toContain(lines.ask_crime);
    expect(text(m)).toContain(lines.ask_name);
    expect(q(m, 'article.alius-voice-paper')).not.toBeNull();
  });

  it('a head start asks its own questions and keeps the start\'s flavour (P11b)', () => {
    const intake = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string>; headStartLines: Record<string, string>; headStartTitle: string; title: string }>).intake;
    const m = make();
    m.wizard.setStart('start_vesper');
    m.wizard.setHeadStart(14);
    goTo(m, 'intake', false);
    expect(text(m)).toContain(intake.headStartLines.ask_crime);
    expect(text(m)).toContain(intake.headStartLines.ask_name);
    expect(text(m)).toContain(fillLine(intake.headStartLines.confirm_owner, { CORPORATION: 'Vesper Somatics' }));
    expect(text(m)).not.toContain(intake.lines.ask_crime);
    expect(q(m, 'article.alius-voice-paper .alius-voice-title')!.textContent).toBe(intake.headStartTitle);
    const plain = goTo(make(), 'intake', false);
    expect(text(plain)).toContain(intake.lines.ask_crime);
    expect(q(plain, 'article.alius-voice-paper .alius-voice-title')!.textContent).toBe(intake.title);
  });

  it('Next follows the wizard: it needs a crime', () => {
    const m = goTo(make(), 'intake', false);
    expect(q<HTMLButtonElement>(m, 'button[data-action="next"]')!.disabled).toBe(true);
    q(m, '.alius-crime-card[data-id="mutiny"]')!.click();
    expect(q<HTMLButtonElement>(m, 'button[data-action="next"]')!.disabled).toBe(false);
  });
});

describe('exam', () => {
  it('a head start reads the last examination back instead of staging a new one (P11b)', () => {
    const exam = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string>; headStartLines: Record<string, string>; headStartTitle: string }>).exam;
    const m = make();
    m.wizard.setStart('start_vesper');
    m.wizard.setHeadStart(7);
    goTo(m, 'exam');
    expect(text(m)).toContain(exam.headStartLines.intro);
    expect(text(m)).not.toContain(exam.lines.intro);
    expect(qa(m, '.alius-dictate').every((p) => p.textContent!.includes('As the last examination found.'))).toBe(true);
    expect(qa(m, '.alius-dictate').some((p) => p.textContent!.includes('Write it down.'))).toBe(false);
    expect(text(m)).toContain(exam.lines.traits_note); // no alternative needed
    expect(q(m, 'article.alius-voice-paper .alius-voice-title')!.textContent).toBe(exam.headStartTitle);
  });

  it('a body change shows the dictate line with the descriptor', () => {
    const m = goTo(make(), 'exam');
    m.wizard.setBody('strength', 1);
    const dictate = qa(m, '.alius-dictate').map((p) => p.textContent);
    expect(dictate.some((t) => t!.includes(descriptor('strength', 1)) && t!.includes('Write it down.'))).toBe(true);
    m.wizard.setBody('strength', 2);
    expect(qa(m, '.alius-dictate').some((p) => p.textContent!.includes(descriptor('strength', 2)))).toBe(true);
    expect(qa(m, '.alius-dictate').some((p) => p.textContent!.includes(descriptor('strength', 1)))).toBe(false);
  });

  it('has a dictate line for every body stat, the expression and the seasoning', () => {
    const m = goTo(make(), 'exam');
    expect(qa(m, '.alius-dictate')).toHaveLength(5);
    const c = m.wizard.state.commander;
    const all = qa(m, '.alius-dictate').map((p) => p.textContent).join('\n');
    for (const [k, v] of [['strength', c.body.strength], ['endurance', c.body.endurance], ['reflexes', c.body.reflexes], ['expression', c.expression], ['seasoning', c.seasoning]] as const) {
      expect(all, k).toContain(descriptor(k, v));
    }
  });

  it('trait toggles go through toggleTrait', () => {
    const m = goTo(make(), 'exam');
    const id = [...reg.commanderTraits.values()].find((t) => t.kind === 'regular')!.id as string;
    q(m, `[data-trait="${id}"]`)!.click();
    expect(m.wizard.state.commander.traits.regular).toContain(id);
    q(m, `[data-trait="${id}"]`)!.click();
    expect(m.wizard.state.commander.traits.regular).not.toContain(id);
  });

  it('persona prefill button calls prefillFromPersona', () => {
    const m = goTo(make(), 'exam');
    const spy = vi.spyOn(m.wizard, 'prefillFromPersona').mockImplementation(() => {});
    q(m, 'button[data-action="prefill"]')!.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows the medic\'s intro and the note about traits', () => {
    const m = goTo(make(), 'exam');
    const lines = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string> }>).exam.lines;
    expect(text(m)).toContain(lines.intro);
    expect(text(m)).toContain(lines.traits_note);
  });
});

describe('file', () => {
  it('shows the review lines and a SIGN button disabled until canAdvance', () => {
    const m = goTo(make(), 'file');
    expect(q(m, 'pre.alius-review')!.textContent).toContain('COMMANDER   : Vale');
    expect(q(m, 'pre.alius-review')!.textContent).toContain('CRIME');
    const sign = q<HTMLButtonElement>(m, 'button[data-action="sign"]')!;
    expect(sign.textContent).toContain('SIGN');
    expect(sign.disabled).toBe(false);
    m.wizard.setCommanderName('');
    expect(q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.disabled).toBe(true);
    expect(text(m)).toContain('Commander name must be 1 to 60 characters');
  });

  it('there is no Next on the dossier, and no second confirm button', () => {
    const m = goTo(make(), 'file');
    expect(q(m, 'button[data-action="next"]')).toBeNull();
    expect(q(m, 'button[data-action="confirm"]')).toBeNull();
  });

  it('SIGN calls onConfirm once, plays stamp and shows the FILED stamp', async () => {
    const m = goTo(make(), 'file');
    q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.click();
    q<HTMLButtonElement>(m, 'button[data-action="sign"]')?.click(); // a second press while deploying does nothing
    expect(m.onConfirm).toHaveBeenCalledTimes(1);
    expect(m.onConfirm.mock.calls[0][0].onboarding).toEqual({ prologueId: 'prologue_vesper', veteran: false });
    expect(m.onConfirm.mock.calls[0][1]).toBe('new_group');
    expect(m.play).toHaveBeenCalledWith('stamp');
    expect(q(m, '.alius-stamp')!.textContent).toBe('FILED');
    await new Promise((r) => setTimeout(r, 0));
  });

  it('the stamp stays only while the deployment runs', async () => {
    const m = goTo(make(), 'file');
    let finish!: () => void;
    m.onConfirm.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.click();
    expect(q(m, '.alius-stamp')!.textContent).toBe('FILED');
    expect(q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.disabled).toBe(true);
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(q(m, '.alius-stamp')).toBeNull(); // the deployment ended without leaving the screen: nothing was filed
    expect(q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.disabled).toBe(false);
  });

  it('edit links jump back to intake and exam', () => {
    const m = goTo(make(), 'file');
    q(m, 'button[data-action="edit-intake"]')!.click();
    expect(m.wizard.state.step).toBe('intake');
    m.wizard.next(); // exam
    m.wizard.next(); // file
    expect(m.wizard.state.step).toBe('file');
    q(m, 'button[data-action="edit-exam"]')!.click();
    expect(m.wizard.state.step).toBe('exam');
  });

  it('target radios appear only when binding is possible', () => {
    expect(q(goTo(make(), 'file'), 'input[name="target"]')).toBeNull();
    const m = goTo(make({ canBind: true }), 'file');
    expect(qa(m, 'input[name="target"]')).toHaveLength(2);
    (q<HTMLInputElement>(m, 'input[name="target"][value="current_group"]')!).click();
    q<HTMLButtonElement>(m, 'button[data-action="sign"]')!.click();
    expect(m.onConfirm.mock.calls[0][1]).toBe('current_group');
  });

  it('the sign prompt is shown', () => {
    const m = goTo(make(), 'file');
    const prompt = (reg.prologues.get('prologue_vesper')!.steps as Record<string, { lines: Record<string, string> }>).dossier.lines.sign_prompt;
    expect(text(m)).toContain(prompt);
  });
});

describe('dossier step and the step list', () => {
  const labels = (m: M) => qa(m, '.alius-step').map((li) => li.textContent);

  it('the Veteran toggle switches mode and the step list', () => {
    const m = make();
    m.wizard.setStart('start_vesper');
    expect(labels(m)).toHaveLength(8);
    expect(labels(m)[0]).toBe('01 DOSSIER');
    expect(labels(m)[4]).toContain('TRANSPORT');
    const toggle = q(m, 'button[data-action="veteran"]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(m.wizard.state.mode).toBe('veteran');
    expect(labels(m)).toEqual(['01 DOSSIER', '02 WORLD PARAMETERS', '03 COMMANDER FILE', '04 UNIT ASSIGNMENT', '05 PROFILE CALIBRATION', '06 REVIEW']);
    expect(q(m, 'button[data-action="veteran"]')!.getAttribute('aria-pressed')).toBe('true');
    q(m, 'button[data-action="veteran"]')!.click();
    expect(m.wizard.state.mode).toBe('prologue');
    expect(labels(m)).toHaveLength(8);
  });

  it('prologue mode asks only for the start: no name field and no crime cards here', () => {
    const m = make();
    expect(q(m, 'input[data-key="name"]')).toBeNull();
    expect(qa(m, '.alius-crime-card')).toHaveLength(0);
    expect(qa(m, '.alius-start-card')).toHaveLength(reg.starts.size);
  });

  it('veteran mode keeps the classic dossier with name and crime', () => {
    const m = make();
    q(m, 'button[data-action="veteran"]')!.click();
    expect(q(m, 'input[data-key="name"]')).not.toBeNull();
    expect(qa(m, '.alius-crime-card')).toHaveLength(reg.crimes.size);
  });

  it('a start without a prologue hides the toggle', () => {
    const noPrologue = { ...reg, prologues: new Map() } as Registries;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const wizard = new Wizard({ registries: noPrologue, desireBondDefects: false, importer: vi.fn() as never, onChange: () => {} }, { personaName: 'V', canBindCurrent: false });
    const host = h('div');
    document.body.append(host);
    renderSetupScreen(host, { wizard, registries: noPrologue, st, settings: () => DEFAULT_SETTINGS, onCancel: vi.fn(), onConfirm: vi.fn(async () => {}), modal: vi.fn(async () => null) as never });
    expect(host.querySelector('button[data-action="veteran"]')).toBeNull();
    expect(host.querySelector('input[data-key="name"]')).not.toBeNull();
  });
});
