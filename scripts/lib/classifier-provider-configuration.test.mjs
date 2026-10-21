import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {configuredClassifierProviders, requireConfiguredClassifier,
  createOptionalGroqClient} from './classifier-provider-configuration.mjs';
import {buildClassifyPrompt} from './canonical-risk-classification-prompt.mjs';

test('every existing fallback works without a Groq key and constructor is not invoked', () => {
  for (const [provider, name] of [['gemini','GEMINI_API_KEY'],
    ['mistral','MISTRAL_API_KEY'], ['cerebras','CEREBRAS_API_KEY']]) {
    assert.deepEqual(requireConfiguredClassifier({[name]:'fixture'}), [provider]);
  }
  class MustNotConstruct { constructor() { throw Error('unexpected constructor'); } }
  for (const apiKey of [undefined, '', '  '])
    assert.equal(createOptionalGroqClient(MustNotConstruct, {apiKey}), null);
});
test('configuration respects selected order and rejects absent, excluded or invalid providers', () => {
  assert.deepEqual(configuredClassifierProviders({CLASSIFIER_PROVIDER_ORDER:'mistral,groq,mistral',
    GROQ_API_KEY:'fixture', MISTRAL_API_KEY:'fixture'}), ['mistral','groq']);
  for (const env of [{}, {GROQ_API_KEY:' '},
    {CLASSIFIER_PROVIDER_ORDER:'groq', GEMINI_API_KEY:'fixture'},
    {CLASSIFIER_PROVIDER_ORDER:'unknown', GROQ_API_KEY:'fixture'}])
    assert.throws(() => requireConfiguredClassifier(env), /CLASSIFIER_/);
  class Client { constructor(options) { this.key = options.apiKey; } }
  assert.equal(createOptionalGroqClient(Client, {apiKey:' fixture '}).key, 'fixture');
});
test('shared canonical prompt retains exact pre-extraction bytes and versions', () => {
  const prompt=buildClassifyPrompt([{title:'Official material policy change',
    description:'Original issuer statement.'}], 'macro');
  assert.equal(createHash('sha256').update(prompt).digest('hex'), 'a3803a9db030867dc999475d3af75e92128fe2e2ac5941821d86d3f55a4862f6');
  const ingest=readFileSync(new URL('../ingest-news.js',import.meta.url),'utf8');
  assert.match(ingest, /import \{buildClassifyPrompt\} from '.\/lib\/canonical-risk-classification-prompt.mjs'/);
  assert.doesNotMatch(ingest, /function buildClassifyPrompt\(/);
});
