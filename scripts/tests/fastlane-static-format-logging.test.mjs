import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../ops/publish-original-news-five-minute-fastlane.ts', import.meta.url), 'utf8');
for (const collector of ['macro', 'mineral']) {
  test(`${collector} externally derived receipt uses a literal console format`, () => {
    assert.ok(source.includes(`console.log("%s", JSON.stringify(${collector}.receipt));`));
    assert.ok(!source.includes(`console.log(JSON.stringify(${collector}.receipt));`));
  });
}
