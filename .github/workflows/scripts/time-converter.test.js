'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  jiraTimeToWeeks,
  formatTimeValue,
  formatAggregateTimeValue,
} = require('./time-converter');

// ---------------------------------------------------------------------------
// jiraTimeToWeeks
// ---------------------------------------------------------------------------

test('jiraTimeToWeeks: 0 seconds returns 0', () => {
  assert.equal(jiraTimeToWeeks(0), 0);
});

test('jiraTimeToWeeks: null returns 0', () => {
  assert.equal(jiraTimeToWeeks(null), 0);
});

test('jiraTimeToWeeks: undefined returns 0', () => {
  assert.equal(jiraTimeToWeeks(undefined), 0);
});

test('jiraTimeToWeeks: 30m (1800s) is not rounded to 0', () => {
  // 1800s = 0.5h = 0.0125w — must survive with 4-decimal precision
  assert.equal(jiraTimeToWeeks(1800), 0.0125);
});

test('jiraTimeToWeeks: 1h (3600s) = 0.025w', () => {
  assert.equal(jiraTimeToWeeks(3600), 0.025);
});

test('jiraTimeToWeeks: 4h (14400s) = 0.1w', () => {
  assert.equal(jiraTimeToWeeks(14400), 0.1);
});

test('jiraTimeToWeeks: 1 day (8h = 28800s) = 0.2w', () => {
  assert.equal(jiraTimeToWeeks(28800), 0.2);
});

test('jiraTimeToWeeks: 1 week (40h = 144000s) = 1w', () => {
  assert.equal(jiraTimeToWeeks(144000), 1);
});

test('jiraTimeToWeeks: 2 weeks (80h = 288000s) = 2w', () => {
  assert.equal(jiraTimeToWeeks(288000), 2);
});

test('jiraTimeToWeeks: result is rounded to 4 decimals', () => {
  // 7200s = 2h = 0.05w — exact, no rounding needed
  const result = jiraTimeToWeeks(7200);
  assert.equal(result, 0.05);
  // Confirm no extra precision beyond 4 decimals is retained
  assert.ok(String(result).replace('.', '').replace(/^0+/, '').length <= 4,
    `Expected at most 4 significant decimal digits, got ${result}`);
});

// ---------------------------------------------------------------------------
// formatTimeValue
// ---------------------------------------------------------------------------

test('formatTimeValue: 0 returns "0"', () => {
  assert.equal(formatTimeValue(0), '0');
});

test('formatTimeValue: 0 with emptyIfZero=true returns ""', () => {
  assert.equal(formatTimeValue(0, true), '');
});

test('formatTimeValue: negative value returns "0"', () => {
  assert.equal(formatTimeValue(-1), '0');
});

test('formatTimeValue: 30m (0.0125w) is not zeroed out', () => {
  assert.equal(formatTimeValue(0.0125), '0.0125');
});

test('formatTimeValue: 1w formats to "1"', () => {
  assert.equal(formatTimeValue(1), '1');
});

test('formatTimeValue: 0.1w (4h) formats to "0.1"', () => {
  assert.equal(formatTimeValue(0.1), '0.1');
});

// ---------------------------------------------------------------------------
// formatAggregateTimeValue
// ---------------------------------------------------------------------------

test('formatAggregateTimeValue: 0 returns ""', () => {
  assert.equal(formatAggregateTimeValue(0), '');
});

test('formatAggregateTimeValue: null returns ""', () => {
  assert.equal(formatAggregateTimeValue(null), '');
});

test('formatAggregateTimeValue: 30m (0.0125w) is not zeroed out', () => {
  assert.equal(formatAggregateTimeValue(0.0125), '0.0125');
});

test('formatAggregateTimeValue: 2w formats to "2"', () => {
  assert.equal(formatAggregateTimeValue(2), '2');
});
