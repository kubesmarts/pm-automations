const test = require('node:test');
const assert = require('node:assert/strict');

const { mapStatus } = require('./field-mapper');

test('mapStatus maps active work statuses to In progress', () => {
  assert.equal(mapStatus('IN PROGRESS'), 'In progress');
  assert.equal(mapStatus('ON_DEV'), 'In progress');
});

test('mapStatus maps review statuses to In review', () => {
  assert.equal(mapStatus('CODE REVIEW'), 'In review');
  assert.equal(mapStatus('CODE_REVIEW'), 'In review');
  assert.equal(mapStatus('CORE_REVIEW'), 'In review');
  assert.equal(mapStatus('ON_QA'), 'In review');
});

test('mapStatus preserves existing non-review mappings', () => {
  assert.equal(mapStatus('NEW'), 'Next');
  assert.equal(mapStatus('REFINEMENT'), 'Next');
  assert.equal(mapStatus('RELEASE PENDING'), 'Done');
  assert.equal(mapStatus('CLOSED'), 'Done');
  assert.equal(mapStatus('BACKLOG'), 'Backlog');
});

test('mapStatus normalizes case before mapping', () => {
  assert.equal(mapStatus('code review'), 'In review');
  assert.equal(mapStatus('in progress'), 'In progress');
  assert.equal(mapStatus('on_qa'), 'In review');
});

test('mapStatus returns empty string for missing status', () => {
  assert.equal(mapStatus(''), '');
  assert.equal(mapStatus(null), '');
  assert.equal(mapStatus(undefined), '');
});

test('mapStatus returns normalized original value when no mapping exists', () => {
  assert.equal(mapStatus('custom status'), 'CUSTOM STATUS');
});

test('mapStatus: QUARKUS workflow mappings', () => {
  assert.equal(mapStatus('Backlog', 'QUARKUS'), 'Backlog');
  assert.equal(mapStatus('BACKLOG', 'QUARKUS-100'), 'Backlog');

  assert.equal(mapStatus('New', 'QUARKUS'), 'Next');
  assert.equal(mapStatus('Refinement', 'QUARKUS'), 'Next');
  assert.equal(mapStatus('Tasking and Estimation', 'QUARKUS'), 'Next');
  assert.equal(mapStatus('To Do', 'QUARKUS'), 'Next');
  assert.equal(mapStatus('TODO', 'QUARKUS-200'), 'Next');

  assert.equal(mapStatus('In Progress', 'QUARKUS'), 'In progress');
  assert.equal(mapStatus('IN_PROGRESS', 'QUARKUS-300'), 'In progress');

  assert.equal(mapStatus('Code review', 'QUARKUS'), 'In review');
  assert.equal(mapStatus('Review', 'QUARKUS'), 'In review');
  assert.equal(mapStatus('Dev Complete', 'QUARKUS'), 'In review');
  assert.equal(mapStatus('Testing', 'QUARKUS-400'), 'In review');

  assert.equal(mapStatus('Verified', 'QUARKUS'), 'Done');
  assert.equal(mapStatus('Release Pending', 'QUARKUS'), 'Done');
  assert.equal(mapStatus('Resolved', 'QUARKUS'), 'Done');
  assert.equal(mapStatus('Closed', 'QUARKUS-500'), 'Done');
});

test('mapStatus: SRVLOGIC workflow mappings', () => {
  assert.equal(mapStatus('BACKLOG', 'SRVLOGIC'), 'Backlog');
  assert.equal(mapStatus('NEW', 'SRVLOGIC-1'), 'Next');
  assert.equal(mapStatus('REFINEMENT', 'SRVLOGIC'), 'Next');
  assert.equal(mapStatus('IN PROGRESS', 'SRVLOGIC'), 'In progress');
  assert.equal(mapStatus('ON_DEV', 'SRVLOGIC-2'), 'In progress');
  assert.equal(mapStatus('CODE REVIEW', 'SRVLOGIC'), 'In review');
  assert.equal(mapStatus('ON_QA', 'SRVLOGIC-3'), 'In review');
  assert.equal(mapStatus('RELEASE PENDING', 'SRVLOGIC'), 'Done');
  assert.equal(mapStatus('CLOSED', 'SRVLOGIC-4'), 'Done');
});

test('mapStatus: fallback to matching SRVLOGIC or QUARKUS for other projects', () => {
  // From SRVLOGIC
  assert.equal(mapStatus('ON_DEV', 'OTHER-1'), 'In progress');
  assert.equal(mapStatus('ON_QA', 'OTHER-2'), 'In review');

  // From QUARKUS
  assert.equal(mapStatus('Tasking and Estimation', 'OTHER-3'), 'Next');
  assert.equal(mapStatus('To Do', 'OTHER-4'), 'Next');
  assert.equal(mapStatus('Testing', 'OTHER-5'), 'In review');
  assert.equal(mapStatus('Verified', 'OTHER-6'), 'Done');
  assert.equal(mapStatus('Resolved', 'OTHER-7'), 'Done');

  // Unknown status
  assert.equal(mapStatus('UNKNOWN_STATUS', 'OTHER-8'), 'UNKNOWN_STATUS');
});
