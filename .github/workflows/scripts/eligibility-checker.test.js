'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { isDoneItem, isActiveItem } = require('./eligibility-checker');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue({ status = 'IN PROGRESS', resolution = null } = {}) {
  return {
    fields: {
      status:     { name: status },
      resolution: resolution ? { name: resolution } : null,
    },
  };
}

// ---------------------------------------------------------------------------
// isDoneItem
// ---------------------------------------------------------------------------

test('isDoneItem: RELEASE PENDING is done', () => {
  assert.ok(isDoneItem(makeIssue({ status: 'RELEASE PENDING' })));
});

test('isDoneItem: RELEASE PENDING is case-insensitive', () => {
  assert.ok(isDoneItem(makeIssue({ status: 'release pending' })));
});

test('isDoneItem: DONE is done (next-gen Jira)', () => {
  assert.ok(isDoneItem(makeIssue({ status: 'Done' })));
});

test('isDoneItem: DONE is case-insensitive', () => {
  assert.ok(isDoneItem(makeIssue({ status: 'done' })));
});

test('isDoneItem: CLOSED with resolution Done is done', () => {
  assert.ok(isDoneItem(makeIssue({ status: 'CLOSED', resolution: 'Done' })));
});

test('isDoneItem: CLOSED with non-Done resolution is not done', () => {
  assert.equal(isDoneItem(makeIssue({ status: 'CLOSED', resolution: 'Duplicate' })), false);
  assert.equal(isDoneItem(makeIssue({ status: 'CLOSED', resolution: "Won't Fix" })), false);
  assert.equal(isDoneItem(makeIssue({ status: 'CLOSED', resolution: 'Obsolete' })), false);
});

test('isDoneItem: CLOSED with no resolution is not done', () => {
  assert.equal(isDoneItem(makeIssue({ status: 'CLOSED' })), false);
});

test('isDoneItem: active statuses are not done', () => {
  assert.equal(isDoneItem(makeIssue({ status: 'IN PROGRESS' })), false);
  assert.equal(isDoneItem(makeIssue({ status: 'CODE REVIEW' })), false);
  assert.equal(isDoneItem(makeIssue({ status: 'NEW' })), false);
  assert.equal(isDoneItem(makeIssue({ status: 'BACKLOG' })), false);
});

// ---------------------------------------------------------------------------
// isActiveItem
// ---------------------------------------------------------------------------

test('isActiveItem: IN PROGRESS is active', () => {
  assert.ok(isActiveItem(makeIssue({ status: 'IN PROGRESS' })));
});

test('isActiveItem: CODE REVIEW is active', () => {
  assert.ok(isActiveItem(makeIssue({ status: 'CODE REVIEW' })));
});

test('isActiveItem: NEW is active', () => {
  assert.ok(isActiveItem(makeIssue({ status: 'NEW' })));
});

test('isActiveItem: BACKLOG is active', () => {
  assert.ok(isActiveItem(makeIssue({ status: 'BACKLOG' })));
});

test('isActiveItem: RELEASE PENDING is not active', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'RELEASE PENDING' })), false);
});

test('isActiveItem: RELEASE PENDING is case-insensitive', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'release pending' })), false);
});

test('isActiveItem: DONE is not active (next-gen Jira)', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'Done' })), false);
});

test('isActiveItem: DONE is case-insensitive', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'done' })), false);
});

test('isActiveItem: CLOSED with resolution Done is not active', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'CLOSED', resolution: 'Done' })), false);
});

test('isActiveItem: CLOSED with non-Done resolution is not active', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'CLOSED', resolution: 'Duplicate' })), false);
  assert.equal(isActiveItem(makeIssue({ status: 'CLOSED', resolution: "Won't Fix" })), false);
  assert.equal(isActiveItem(makeIssue({ status: 'CLOSED', resolution: 'Obsolete' })), false);
});

test('isActiveItem: CLOSED with no resolution is not active', () => {
  assert.equal(isActiveItem(makeIssue({ status: 'CLOSED' })), false);
});
