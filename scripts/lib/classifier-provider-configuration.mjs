/** Credential presence only. Never serialize keys or instantiate a provider
 * whose credential is absent. No provider calls or implicit paid fallback. */
const PROVIDERS = Object.freeze({
  groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY',
  mistral: 'MISTRAL_API_KEY', cerebras: 'CEREBRAS_API_KEY',
});
export function configuredClassifierProviders(env = process.env) {
  const order = [...new Set(String(env.CLASSIFIER_PROVIDER_ORDER ||
    'groq,gemini,mistral,cerebras').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))];
  if (!order.length || order.some(x => !Object.hasOwn(PROVIDERS, x)))
    throw Error('CLASSIFIER_PROVIDER_ORDER_INVALID');
  return order.filter(x => typeof env[PROVIDERS[x]] === 'string' && env[PROVIDERS[x]].trim());
}
export function requireConfiguredClassifier(env = process.env) {
  const providers = configuredClassifierProviders(env);
  if (!providers.length) throw Error('CLASSIFIER_CONFIGURED_PROVIDER_REQUIRED');
  return providers;
}
export function createOptionalGroqClient(Constructor, options) {
  return typeof options?.apiKey === 'string' && options.apiKey.trim()
    ? new Constructor({...options, apiKey: options.apiKey.trim()}) : null;
}
