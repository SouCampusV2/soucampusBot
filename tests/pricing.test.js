import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, estimateOrder } from '../src/utils/pricing.js';

test('sizes the way clients type them', () => {
  assert.deepEqual(parseSize('150x150'), { width: 150, height: 150 });
  assert.deepEqual(parseSize('150 x 150'), { width: 150, height: 150 });
  assert.deepEqual(parseSize('200×100'), { width: 200, height: 100 });
  assert.deepEqual(parseSize('300*300 blocks'), { width: 300, height: 300 });
  assert.deepEqual(parseSize('about 400'), { width: 400, height: 400 });
  assert.equal(parseSize('big'), null);
  assert.equal(parseSize(''), null);
  assert.equal(parseSize('5x5'), null, 'too small to be a map — probably not a size');
});

// Same numbers as the site (FirstTry/src/lib/pricing.ts) and docs/SPEC.md → "Price".
test('price: €1.5 per block of side, side of the equal-area square', () => {
  assert.equal(estimateOrder('150x150').price, 225);
  assert.equal(estimateOrder('400x400').price, 600);
  assert.equal(estimateOrder('200x100').price, 212);
});

test('timeline follows the site anchors: 150 → 7 days, 400 → 14, 600 → 24.5', () => {
  assert.equal(estimateOrder('150x150').days, 7);
  assert.equal(estimateOrder('400x400').days, 14);
  assert.equal(estimateOrder('600x600').days, 25);
  assert.equal(estimateOrder('275x275').days, 11);
});

test('no estimate without a readable size', () => {
  assert.equal(estimateOrder('a castle'), null);
});
