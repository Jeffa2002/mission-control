import assert from 'node:assert/strict';
import test from 'node:test';
import { redactIncidentText } from './incident-bundle-model.ts';

test('redacts common secret forms from incident evidence', () => {
  const input = [
    'token=sentinel-one',
    '"password":"sentinel-two"',
    'Authorization: Bearer sentinel-three',
    'https://example.test/hook?signature=sentinel-four&ok=1',
    'operator@example.test',
  ].join('\n');
  const output = redactIncidentText(input);
  for (const sentinel of ['sentinel-one', 'sentinel-two', 'sentinel-three', 'sentinel-four', 'operator@example.test']) {
    assert.equal(output.includes(sentinel), false);
  }
});
