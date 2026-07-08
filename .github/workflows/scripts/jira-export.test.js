'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { issueToActiveItemRow } = require('./jira-export');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JIRA issue suitable for issueToActiveItemRow.
 */
function makeIssue({ key = 'PROJ-1', status = 'IN PROGRESS', labels = [] } = {}) {
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

test('issueToActiveItemRow: other fields are unaffected when Alerts is populated', async () => {
  const issue  = makeIssue({ key: 'PROJ-42', labels: ['compliance-alerts'] });
  const client = makeJiraClient('NO_AREA');

  const row = await issueToActiveItemRow(issue, 'https://jira.example.com', null, client);

  assert.equal(row['Issue Number'], '42');
  assert.equal(row['Title'], 'Test issue title');
  assert.equal(row['Alerts'], 'NO_AREA');
});
