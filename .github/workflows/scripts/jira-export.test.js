'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { issueToActiveItemRow, issueToDoneItemRow } = require('./jira-export');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JIRA issue suitable for issueToActiveItemRow.
 */
function makeIssue({ key = 'PROJ-1', status = 'IN PROGRESS', labels = [], updated = '2025-03-15T10:00:00.000Z' } = {}) {
  return {
    key,
    fields: {
      summary:   'Test issue title',
      status:    { name: status },
      assignee:  { displayName: 'Alice', accountId: 'acc-1' },
      labels,
      priority:  { name: 'High' },
      fixVersions: [{ name: '1.39.0' }],
      project:   { name: 'My Project' },
      issuetype: { name: 'Feature' },
      parent:    null,
      timetracking: {},
      aggregatetimeoriginalestimate: null,
      aggregatetimespent: null,
      aggregatetimeestimate: null,
      updated,
    },
  };
}

/**
 * Stub JiraClient that returns a preset alerts string via extractComplianceAlerts.
 */
function makeJiraClient(alertsValue = '') {
  return {
    extractComplianceAlerts: async () => alertsValue,
  };
}

// Provide a minimal JIRA_BASE_URL via env so buildIssueUrl works
process.env.PSYNC_JIRA_BASE_URL = 'https://jira.example.com';

// ---------------------------------------------------------------------------
// issueToActiveItemRow — Alerts field
// ---------------------------------------------------------------------------

test('issueToActiveItemRow: Alerts is empty for an issue without compliance-alerts label', async () => {
  const issue  = makeIssue({ labels: [] });
  const client = makeJiraClient('SHOULD_NOT_BE_CALLED');
  // extractComplianceAlerts must NOT be called — spy to verify
  let called = false;
  client.extractComplianceAlerts = async () => { called = true; return 'SHOULD_NOT_BE_CALLED'; };

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], '', 'Alerts must be empty when no compliance-alerts label');
  assert.equal(called, false, 'extractComplianceAlerts must not be called for clean issues');
});

test('issueToActiveItemRow: Alerts is populated from extractComplianceAlerts when compliance-alerts label is present', async () => {
  const issue  = makeIssue({ labels: ['compliance-alerts'] });
  const client = makeJiraClient('NO_ESTIMATE, NO_REMAINING_WORK');

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], 'NO_ESTIMATE, NO_REMAINING_WORK');
});

test('issueToActiveItemRow: Alerts is empty string when compliance-alerts label is present but comment returns empty', async () => {
  const issue  = makeIssue({ labels: ['compliance-alerts'] });
  const client = makeJiraClient('');

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], '');
});

test('issueToActiveItemRow: Alerts column is present in returned row object', async () => {
  const issue  = makeIssue();
  const client = makeJiraClient();

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Alerts'), 'row must have an Alerts key');
});

test('issueToActiveItemRow: Reporting Date is derived from issue.fields.updated', async () => {
  const issue  = makeIssue({ updated: '2025-06-20T08:30:00.000Z' });
  const client = makeJiraClient();

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Reporting Date'), 'row must have a Reporting Date key');
  assert.equal(row['Reporting Date'], '2025-06-20');
});

test('issueToActiveItemRow: Reporting Date falls back to today when updated is absent', async () => {
  const issue  = makeIssue({ updated: null });
  const client = makeJiraClient();

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  const today = new Date().toISOString().split('T')[0];
  assert.equal(row['Reporting Date'], today);
});

test('issueToActiveItemRow: other fields are unaffected when Alerts is populated', async () => {
  const issue  = makeIssue({ key: 'PROJ-42', labels: ['compliance-alerts'], updated: '2025-05-01T00:00:00.000Z' });
  const client = makeJiraClient('NO_AREA');

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Issue Number'], '42');
  assert.equal(row['Title'], 'Test issue title');
  assert.equal(row['Reporting Date'], '2025-05-01');
  assert.equal(row['Alerts'], 'NO_AREA');
});

// ---------------------------------------------------------------------------
// issueToDoneItemRow — Alerts field
// ---------------------------------------------------------------------------

test('issueToDoneItemRow: Alerts is empty for an issue without compliance-alerts label', async () => {
  const issue  = makeIssue({ labels: [] });
  const client = makeJiraClient('SHOULD_NOT_BE_CALLED');
  // extractComplianceAlerts must NOT be called
  let called = false;
  client.extractComplianceAlerts = async () => { called = true; return 'SHOULD_NOT_BE_CALLED'; };

  const row = await issueToDoneItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], '', 'Alerts must be empty when no compliance-alerts label');
  assert.equal(called, false, 'extractComplianceAlerts must not be called for clean issues');
});

test('issueToDoneItemRow: Alerts is populated from extractComplianceAlerts when compliance-alerts label is present', async () => {
  const issue  = makeIssue({ labels: ['compliance-alerts'] });
  const client = makeJiraClient('NO_TIME_SPENT');

  const row = await issueToDoneItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], 'NO_TIME_SPENT');
});

test('issueToDoneItemRow: Alerts is empty string when compliance-alerts label is present but comment returns empty', async () => {
  const issue  = makeIssue({ labels: ['compliance-alerts'] });
  const client = makeJiraClient('');

  const row = await issueToDoneItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Alerts'], '');
});

test('issueToDoneItemRow: Alerts column is present in returned row object', async () => {
  const issue  = makeIssue();
  const client = makeJiraClient();

  const row = await issueToDoneItemRow(issue, 'https://jira.example.com', null, client);

  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Alerts'), 'row must have an Alerts key');
});

test('issueToDoneItemRow: done items have correct columns including Alerts', async () => {
  const issue  = makeIssue({ key: 'PROJ-99', labels: ['compliance-alerts'], updated: '2025-07-10T00:00:00.000Z' });
  const client = makeJiraClient('NO_ESTIMATE, NO_TIME_SPENT');

  const row = await issueToDoneItemRow(issue, 'https://jira.example.com', null, client);

  // Verify all expected done item columns are present
  assert.equal(row['Issue Number'], '99');
  assert.equal(row['Title'], 'Test issue title');
  assert.equal(row['Reporting Date'], '2025-07-10');
  assert.equal(row['Alerts'], 'NO_ESTIMATE, NO_TIME_SPENT');

  // Verify done items have the expected columns
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Issue Number'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Parent Issue'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Issue URL'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Title'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Assignees'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Type'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Area'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Priority'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Initiative'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Target Milestone'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Size'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Estimate'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Time Spent'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Reporting Date'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'External Reference'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Comments'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'Alerts'));
});
