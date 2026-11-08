/**
 * Request-body override that asks a thinking model to think little (or not at all), by provider.
 * Providers that do not support it get an empty payload.
 */
export function reasoningPayload(api: string, think: 'min' | 'low' | 'auto'): Record<string, unknown> {
  if (think === 'auto') return {};
  if (api === 'openrouter') return { reasoning_effort: think === 'min' ? 'minimal' : 'low' };
  if (api === 'makersuite' || api === 'vertexai') return { reasoning_effort: think === 'min' ? 'min' : 'low' };
  return {};
}
