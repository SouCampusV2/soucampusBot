import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeadline } from '../src/utils/dates.js';

// A fixed "today" so the relative cases do not depend on when the test runs.
const NOW = new Date('2026-10-25T12:00:00Z');

test('ISO and European day-first formats', () => {
  assert.equal(parseDeadline('2026-12-25', NOW), '2026-12-25');
  assert.equal(parseDeadline('25.12.2026', NOW), '2026-12-25');
  assert.equal(parseDeadline('25/12/2026', NOW), '2026-12-25');
  assert.equal(parseDeadline('5.1.2027', NOW), '2027-01-05');
  assert.equal(parseDeadline('  2026-12-25  ', NOW), '2026-12-25');
});

test('relative: in N days / weeks / months', () => {
  assert.equal(parseDeadline('in 10 days', NOW), '2026-11-04');
  assert.equal(parseDeadline('10 days', NOW), '2026-11-04');
  assert.equal(parseDeadline('2 weeks', NOW), '2026-11-08');
  assert.equal(parseDeadline('in 1 week', NOW), '2026-11-01');
  assert.equal(parseDeadline('1 month', NOW), '2026-11-25');
  assert.equal(parseDeadline('tomorrow', NOW), '2026-10-26');
});

test('impossible calendar dates are rejected, not rolled over', () => {
  assert.equal(parseDeadline('31.02.2027', NOW), null);
  assert.equal(parseDeadline('2026-13-01', NOW), null);
});

test('free text and empty input give null', () => {
  assert.equal(parseDeadline('asap', NOW), null);
  assert.equal(parseDeadline('next friday maybe', NOW), null);
  assert.equal(parseDeadline('', NOW), null);
  assert.equal(parseDeadline(undefined, NOW), null);
});
