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
