'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  sortByReportingDate,
  removeDuplicates,
  filterByReportingDate,
  getLatestReportingDate,
  removeActiveItems,
  mergeDoneItems
} = require('./done-items-merger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function item(issueNum, date, extra = {}) {
  return {
    'Issue Number': String(issueNum),
    'Issue URL': `https://jira.example.com/browse/PROJ-${issueNum}`,
    'Title': `Issue ${issueNum}`,
    'Reporting Date': date,
    'Alerts': '',
    ...extra
  };
}

function urlOf(issueNum) {
  return `https://jira.example.com/browse/PROJ-${issueNum}`;
}

// ---------------------------------------------------------------------------
// sortByReportingDate
// ---------------------------------------------------------------------------

test('sortByReportingDate: sorts descending', () => {
  const items = [item(1, '2026-08-01'), item(2, '2026-09-01'), item(3, '2026-07-01')];
  const result = sortByReportingDate(items);
  assert.deepEqual(result.map(i => i['Reporting Date']), ['2026-09-01', '2026-08-01', '2026-07-01']);
});

test('sortByReportingDate: handles single item', () => {
  assert.equal(sortByReportingDate([item(1, '2026-08-01')]).length, 1);
});

// ---------------------------------------------------------------------------
// removeDuplicates
// ---------------------------------------------------------------------------

test('removeDuplicates: keeps item with newer reporting date', () => {
  const old   = item(1, '2026-08-25', { Alerts: 'NO_ESTIMATE' });
  const fresh = item(1, '2026-09-05', { Alerts: '' });
  const result = removeDuplicates([fresh, old]);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Alerts'], '');
  assert.equal(result[0]['Reporting Date'], '2026-09-05');
});

test('removeDuplicates: keeps newer item regardless of insertion order', () => {
  const old   = item(1, '2026-08-25', { Alerts: 'NO_ESTIMATE' });
  const fresh = item(1, '2026-09-05', { Alerts: '' });
  const result = removeDuplicates([old, fresh]);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Alerts'], '');
});

test('removeDuplicates: keeps unique items with different URLs', () => {
  assert.equal(removeDuplicates([item(1, '2026-09-01'), item(2, '2026-09-01')]).length, 2);
});

// ---------------------------------------------------------------------------
// filterByReportingDate
// ---------------------------------------------------------------------------

test('filterByReportingDate: returns all items when no latestDate', () => {
  assert.equal(filterByReportingDate([item(1, '2026-07-01')], null).length, 1);
});

test('filterByReportingDate: blocks items older than threshold', () => {
  assert.equal(filterByReportingDate([item(1, '2026-08-01')], '2026-09-16').length, 0);
});

test('filterByReportingDate: passes items on or after threshold', () => {
  assert.equal(filterByReportingDate([item(1, '2026-09-16')], '2026-09-16').length, 1);
});

// ---------------------------------------------------------------------------
// getLatestReportingDate
// ---------------------------------------------------------------------------

test('getLatestReportingDate: returns first item date (assumes sorted descending)', () => {
  assert.equal(getLatestReportingDate([item(1, '2026-09-16'), item(2, '2026-08-01')]), '2026-09-16');
});

test('getLatestReportingDate: returns null for empty array', () => {
  assert.equal(getLatestReportingDate([]), null);
});

test('getLatestReportingDate: returns null for null input', () => {
  assert.equal(getLatestReportingDate(null), null);
});

// ---------------------------------------------------------------------------
// removeActiveItems
// ---------------------------------------------------------------------------

test('removeActiveItems: evicts existing row whose URL is in active set', () => {
  const existing = [item(1, '2026-08-25', { Alerts: 'NO_ESTIMATE' }), item(2, '2026-09-01')];
  const activeUrls = new Set([urlOf(1)]);
  const result = removeActiveItems(existing, activeUrls);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Issue Number'], '2');
});

test('removeActiveItems: keeps all rows when active set is empty', () => {
  const existing = [item(1, '2026-08-25'), item(2, '2026-09-01')];
  assert.equal(removeActiveItems(existing, new Set()).length, 2);
});

test('removeActiveItems: keeps all rows when activeUrls is undefined', () => {
  const existing = [item(1, '2026-08-25'), item(2, '2026-09-01')];
  assert.equal(removeActiveItems(existing, undefined).length, 2);
});

test('removeActiveItems: evicts multiple rows matching active set', () => {
  const existing = [item(1, '2026-08-25'), item(2, '2026-09-01'), item(3, '2026-09-05')];
  const activeUrls = new Set([urlOf(1), urlOf(3)]);
  const result = removeActiveItems(existing, activeUrls);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Issue Number'], '2');
});

test('removeActiveItems: returns all rows when no URL matches active set', () => {
  const existing = [item(1, '2026-08-25'), item(2, '2026-09-01')];
  const activeUrls = new Set([urlOf(99)]);
  assert.equal(removeActiveItems(existing, activeUrls).length, 2);
});

// ---------------------------------------------------------------------------
// mergeDoneItems
// ---------------------------------------------------------------------------

test('mergeDoneItems: sorts only when no existing items', () => {
  const result = mergeDoneItems([item(2, '2026-08-01'), item(1, '2026-09-01')], []);
  assert.equal(result[0]['Reporting Date'], '2026-09-01');
});

test('mergeDoneItems: adds new item that meets date threshold', () => {
  const existing = [item(1, '2026-09-10')];
  const result = mergeDoneItems([item(2, '2026-09-16')], existing);
  assert.equal(result.length, 2);
  assert.ok(result.some(i => i['Issue Number'] === '2'));
});

test('mergeDoneItems: blocks new item older than threshold', () => {
  const existing = [item(1, '2026-09-10')];
  const result = mergeDoneItems([item(99, '2026-08-01')], existing);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Issue Number'], '1');
});

test('mergeDoneItems: evicts ghost done-items row for ticket now Active', () => {
  // SRVLOGIC-1119 scenario: existing done row with stale alert, ticket is now Active
  const existing = [
    item(2, '2026-09-16'),
    item(1, '2026-08-25', { Alerts: 'NO_ESTIMATE' }) // ghost row
  ];
  const activeUrls = new Set([urlOf(1)]);
  const result = mergeDoneItems([], existing, activeUrls);
  assert.equal(result.length, 1);
  assert.equal(result[0]['Issue Number'], '2');
  assert.ok(!result.some(i => i['Issue Number'] === '1'));
});

test('mergeDoneItems: does not evict rows when no active set provided', () => {
  const existing = [item(1, '2026-08-25', { Alerts: 'NO_ESTIMATE' }), item(2, '2026-09-16')];
  const result = mergeDoneItems([], existing);
  assert.equal(result.length, 2);
});

test('mergeDoneItems: does not evict rows when active set is empty', () => {
  const existing = [item(1, '2026-08-25'), item(2, '2026-09-16')];
  const result = mergeDoneItems([], existing, new Set());
  assert.equal(result.length, 2);
});

test('mergeDoneItems: result is sorted by reporting date descending', () => {
  const existing = [item(1, '2026-09-10')];
  const result = mergeDoneItems([item(2, '2026-09-16'), item(3, '2026-09-12')], existing);
  const dates = result.map(i => i['Reporting Date']);
  assert.deepEqual(dates, [...dates].sort((a, b) => new Date(b) - new Date(a)));
});

test('mergeDoneItems: handles null existingItems', () => {
  assert.equal(mergeDoneItems([item(1, '2026-09-01')], null).length, 1);
});
