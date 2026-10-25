import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ORDER_BUDGET_OPTIONS } from '../src/constants.js';

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}

test('everything users see is in English: no Cyrillic anywhere in src/', () => {
  const offenders = [];
  for (const file of jsFiles('src')) {
    readFileSync(file, 'utf-8').split('\n').forEach((line, n) => {
      if (/[А-Яа-яЁё]/.test(line)) offenders.push(`${file}:${n + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('budget options are in euros', () => {
  for (const opt of ORDER_BUDGET_OPTIONS) {
    assert.match(opt.label, /€/, opt.label);
    assert.doesNotMatch(opt.label, /\$/, opt.label);
  }
});

test('no deprecated `ephemeral:` option left in src/', () => {
  const offenders = jsFiles('src').filter((f) => /ephemeral\s*:/.test(readFileSync(f, 'utf-8')));
  assert.deepEqual(offenders, []);
});
