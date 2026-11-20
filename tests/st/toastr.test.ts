import { describe, expect, it, vi } from 'vitest';
import { showToastr } from '../../src/st/toastr';

describe('toasts through toastr (0.1 audit)', () => {
  it('always asks toastr to escape the text, whatever its global option', () => {
    const t = { info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    expect(showToastr(t, 'warn', '<img src=x onerror=alert(1)>')).toBe(true);
    expect(t.warning).toHaveBeenCalledWith('<img src=x onerror=alert(1)>', 'Alius', { escapeHtml: true });
    showToastr(t, 'info', 'a');
    showToastr(t, 'error', 'b');
    expect(t.info.mock.calls[0][2]).toEqual({ escapeHtml: true });
    expect(t.error.mock.calls[0][2]).toEqual({ escapeHtml: true });
  });

  it('is false without toastr', () => {
    expect(showToastr(undefined, 'info', 'x')).toBe(false);
    expect(showToastr({}, 'error', 'x')).toBe(false);
  });
});
