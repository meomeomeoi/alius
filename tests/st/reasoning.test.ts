import { describe, it, expect } from 'vitest';
import { reasoningPayload } from '../../src/st/reasoning';

describe('reasoningPayload', () => {
  it('openrouter uses minimal/low', () => {
    expect(reasoningPayload('openrouter', 'min')).toEqual({ reasoning_effort: 'minimal' });
    expect(reasoningPayload('openrouter', 'low')).toEqual({ reasoning_effort: 'low' });
  });

  it('makersuite and vertexai use min/low', () => {
    expect(reasoningPayload('makersuite', 'min')).toEqual({ reasoning_effort: 'min' });
    expect(reasoningPayload('vertexai', 'min')).toEqual({ reasoning_effort: 'min' });
    expect(reasoningPayload('makersuite', 'low')).toEqual({ reasoning_effort: 'low' });
  });

  it('other providers and auto send nothing', () => {
    expect(reasoningPayload('openai', 'min')).toEqual({});
    expect(reasoningPayload('claude', 'low')).toEqual({});
    expect(reasoningPayload('openrouter', 'auto')).toEqual({});
  });
});
