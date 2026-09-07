import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL(
    '../../scripts/ingest-news.js',
    import.meta.url
  ),
  'utf8'
);

const envExample = readFileSync(
  new URL(
    '../../.env.example',
    import.meta.url
  ),
  'utf8'
);

const workflows = [
  '../../.github/workflows/auto-ingest-news.yml',
  '../../.github/workflows/dry-run-multisource-news.yml',
  '../../.github/workflows/reclassify-gri-evidence.yml',
].map((relativePath) =>
  readFileSync(
    new URL(
      relativePath,
      import.meta.url
    ),
    'utf8'
  )
);

describe(
  'permanent intelligence classifier fallback',
  () => {
    it(
      'keeps the four-provider production defaults',
      () => {
        expect(source).toContain(
          "'groq,gemini,mistral,cerebras'"
        );

        expect(source).toContain(
          "'openai/gpt-oss-20b'"
        );

        expect(source).toContain(
          "'gemini-3.8-flash'"
        );

        expect(source).toContain(
          "'mistral-small-2603'"
        );

        expect(source).toContain(
          "'gpt-oss-120b'"
        );
      }
    );

    it(
      'keeps per-provider circuits and fail-closed exhaustion',
      () => {
        expect(source).toContain(
          'geminiCircuitOpen'
        );

        expect(source).toContain(
          'mistralCircuitOpen'
        );

        expect(source).toContain(
          'hasHealthyClassifierProvider'
        );

        expect(source).toContain(
          'No healthy classification provider remains for this ingestion run.'
        );
      }
    );

    it(
      'keeps env and workflow wiring for Gemini and Mistral',
      () => {
        expect(envExample).toContain(
          'GEMINI_API_KEY='
        );

        expect(envExample).toContain(
          'MISTRAL_API_KEY='
        );

        for (const workflow of workflows) {
          expect(workflow).toContain(
            'GEMINI_API_KEY:'
          );

          expect(workflow).toContain(
            'MISTRAL_API_KEY:'
          );

          expect(workflow).toContain(
            'CLASSIFIER_PROVIDER_ORDER: ${{ vars.CLASSIFIER_PROVIDER_ORDER }}'
          );
        }
      }
    );
  }
);
