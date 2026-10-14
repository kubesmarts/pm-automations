'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');

const {
  loadContributorWhitelist,
  isWhitelisted,
  getField,
  buildParentMap,
  itemToActiveRow,
  itemToDoneRow,
  isActiveEligible,
  isDoneEligible,
  compareDoneRows,
  processProjectItems,
  runExport
} = require('./gh-export');
const { ACTIVE_ITEMS_COLUMNS, DONE_ITEMS_COLUMNS } = require('./csv-generator');

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = path.resolve(__dirname, '../gh-issues-export.yml');
const WORKFLOW_YML  = fs.readFileSync(WORKFLOW_PATH, 'utf8');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gh-export-test-'));
}

function makeFieldValues(map) {
  const nodes = [];
  for (const [name, val] of Object.entries(map)) {
    if (typeof val === 'number') {
      nodes.push({ field: { name }, number: val });
    } else if (name === 'Reporting Date' || name === 'Target Milestone Date') {
      nodes.push({ field: { name }, date: String(val) });
    } else {
      nodes.push({ field: { name }, name: String(val), text: String(val) });
    }
  }
  return { nodes };
}

function makeProjectItem({
  number = 1,
  title = 'Test Issue',
  url = 'https://github.com/org/repo/issues/1',
  repoOwner = 'org',
  repoName = 'repo',
  state = 'OPEN',
  stateReason = null,
  assignees = ['alice'],
  subIssues = [],
  fields = {}
} = {}) {
  return {
    id: `item_${number}`,
    isArchived: false,
    content: {
      number,
      title,
      url,
      state,
      stateReason,
      repository: {
        name: repoName,
        owner: { login: repoOwner }
      },
      assignees: {
        nodes: assignees.map(login => ({ login }))
      },
      subIssues: {
        nodes: subIssues.map(sub => ({
          number: sub.number,
          repository: {
            name: sub.repoName || repoName,
            owner: { login: sub.repoOwner || repoOwner }
          }
        }))
      }
    },
    fieldValues: makeFieldValues(fields)
  };
}

// ---------------------------------------------------------------------------
// SECTION 1: YAML Wiring Tests
// ---------------------------------------------------------------------------

test('workflow: name is "GH Issues Export"', () => {
  assert.match(WORKFLOW_YML, /name:\s*GH Issues Export/);
});

test('workflow: schedule triggers at 02:00 UTC daily and Tuesdays at 12:55 UTC', () => {
  assert.match(WORKFLOW_YML, /cron:\s*'0 2 \* \* \*'/);
  assert.match(WORKFLOW_YML, /cron:\s*'55 12 \* \* 2'/);
});

test('workflow: dry_run input declared as boolean with default false', () => {
  assert.match(WORKFLOW_YML, /dry_run:/);
  assert.match(WORKFLOW_YML, /type:\s*boolean/);
  assert.match(WORKFLOW_YML, /default:\s*false/);
});

test('workflow: invokes gh-export.js with correct environment variables', () => {
  assert.match(WORKFLOW_YML, /GH_TOKEN:\s*\${{\s*secrets\.PSYNC_PAT_GH\s*}}/);
  assert.match(WORKFLOW_YML, /PROJECTS:\s*\${{\s*vars\.PSYNC_PROJECTS\s*}}/);
  assert.match(WORKFLOW_YML, /DRY_RUN:\s*\${{\s*github\.event\.inputs\.dry_run/);
  assert.match(WORKFLOW_YML, /node \.github\/workflows\/scripts\/gh-export\.js/);
});

test('workflow: artifacts and git commit steps guarded by dry_run', () => {
  assert.match(WORKFLOW_YML, /upload-artifact/);
  assert.match(WORKFLOW_YML, /if:\s*\${{\s*github\.event\.inputs\.dry_run != 'true'\s*}}/);
});

// ---------------------------------------------------------------------------
// SECTION 2: Contributor Whitelist
// ---------------------------------------------------------------------------

test('loadContributorWhitelist: loads active contributors and lowercases usernames', () => {
  const dir = tmpDir();
  const csvFile = path.join(dir, 'contributors.csv');
  fs.writeFileSync(csvFile, 'GitHub Username,Active\nAlice,true\nBob,false\nCharlie,TRUE\n#comment,true\n');

  const whitelist = loadContributorWhitelist(csvFile);
  assert.ok(whitelist instanceof Set);
  assert.equal(whitelist.size, 2);
  assert.ok(whitelist.has('alice'));
  assert.ok(whitelist.has('charlie'));
  assert.ok(!whitelist.has('bob'));
});

test('loadContributorWhitelist: returns null if file does not exist', () => {
  const whitelist = loadContributorWhitelist('/non/existent/path/contributors.csv');
  assert.equal(whitelist, null);
});

test('isWhitelisted: handles comma-separated assignees and case-insensitivity', () => {
  const whitelist = new Set(['alice', 'bob']);
  assert.equal(isWhitelisted('Alice, Dave', whitelist), true);
  assert.equal(isWhitelisted('Eve, Dave', whitelist), false);
  assert.equal(isWhitelisted('', whitelist), false);
  assert.equal(isWhitelisted('Alice', null), true); // No whitelist active
});

// ---------------------------------------------------------------------------
// SECTION 3: Field Extraction & Parent Mapping
// ---------------------------------------------------------------------------

test('getField: extracts values of different types correctly', () => {
  const item = makeProjectItem({
    fields: {
      Status: 'In Progress',
      Estimate: 5,
      'Reporting Date': '2026-03-15'
    }
  });

  assert.equal(getField(item, 'Status'), 'In Progress');
  assert.equal(getField(item, 'Estimate'), '5');
  assert.equal(getField(item, 'Reporting Date'), '2026-03-15');
  assert.equal(getField(item, 'NonExistent'), '');
});

test('buildParentMap: maps child composite key to parent issue number', () => {
  const parentItem = makeProjectItem({
    number: 100,
    repoOwner: 'org',
    repoName: 'repo',
    subIssues: [
      { number: 101, repoOwner: 'org', repoName: 'repo' },
      { number: 201, repoOwner: 'other-org', repoName: 'other-repo' }
    ]
  });

  const parentMap = buildParentMap([parentItem]);
  assert.equal(parentMap.get('org/repo#101'), '100');
  assert.equal(parentMap.get('other-org/other-repo#201'), '100');
  assert.equal(parentMap.get('org/repo#999'), undefined);
});

// ---------------------------------------------------------------------------
// SECTION 4: Row Conversion & Columns
// ---------------------------------------------------------------------------

test('itemToActiveRow: produces 22 active columns', () => {
  const item = makeProjectItem({
    number: 42,
    title: 'Active Task',
    url: 'https://github.com/org/repo/issues/42',
    assignees: ['alice'],
    fields: {
      Status: 'In Progress',
      Type: 'Task',
      Area: 'Core',
      Priority: 'High',
      'Reporting Date': '2026-03-20',
      Alerts: 'NO_ESTIMATE'
    }
  });

  const row = itemToActiveRow(item, new Map());
  assert.equal(row['Issue Number'], '42');
  assert.equal(row['Title'], 'Active Task');
  assert.equal(row['Assignees'], 'alice');
  assert.equal(row['Status'], 'In Progress');
  assert.equal(row['Type'], 'Task');
  assert.equal(row['Alerts'], 'NO_ESTIMATE');

  for (const col of ACTIVE_ITEMS_COLUMNS) {
    assert.ok(Object.prototype.hasOwnProperty.call(row, col), `Missing active col: ${col}`);
  }
  assert.equal(Object.keys(row).length, ACTIVE_ITEMS_COLUMNS.length);
});

test('itemToDoneRow: produces 17 done columns', () => {
  const item = makeProjectItem({
    number: 43,
    title: 'Done Task',
    url: 'https://github.com/org/repo/issues/43',
    assignees: ['bob'],
    fields: {
      Status: 'Done',
      Type: 'Bug',
      'Reporting Date': '2026-03-25'
    }
  });

  const row = itemToDoneRow(item, new Map());
  assert.equal(row['Issue Number'], '43');
  assert.equal(row['Title'], 'Done Task');
  assert.equal(row['Reporting Date'], '2026-03-25');

  for (const col of DONE_ITEMS_COLUMNS) {
    assert.ok(Object.prototype.hasOwnProperty.call(row, col), `Missing done col: ${col}`);
  }
  assert.equal(Object.keys(row).length, DONE_ITEMS_COLUMNS.length);
});

// ---------------------------------------------------------------------------
// SECTION 5: Eligibility Checks
// ---------------------------------------------------------------------------

test('isActiveEligible: rejects Done and Cancelled status', () => {
  const doneItem = makeProjectItem({ fields: { Status: 'Done' } });
  const cancelledItem = makeProjectItem({ fields: { Status: 'Cancelled' } });
  const inProgressItem = makeProjectItem({ fields: { Status: 'In Progress' } });

  assert.equal(isActiveEligible(doneItem, 'Done', null).eligible, false);
  assert.equal(isActiveEligible(cancelledItem, 'Cancelled', null).eligible, false);
  assert.equal(isActiveEligible(inProgressItem, 'In Progress', null).eligible, true);
});

test('isActiveEligible: backlog items require specific target milestone', () => {
  const backlogNoMilestone = makeProjectItem({ fields: { Status: 'Backlog' } });
  const backlogFuture = makeProjectItem({ fields: { Status: 'Backlog', 'Target Milestone': 'Future' } });
  const backlogV1 = makeProjectItem({ fields: { Status: 'Backlog', 'Target Milestone': 'v1.0.0' } });

  assert.equal(isActiveEligible(backlogNoMilestone, 'Backlog', null).eligible, false);
  assert.equal(isActiveEligible(backlogFuture, 'Backlog', null).eligible, false);
  assert.equal(isActiveEligible(backlogV1, 'Backlog', null).eligible, true);
});

test('isDoneEligible: checks Done status, completion state, and Reporting Date', () => {
  const whitelist = new Set(['alice']);

  // Valid Done item
  const validDone = makeProjectItem({
    assignees: ['alice'],
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    fields: { Status: 'Done', 'Reporting Date': '2026-03-20' }
  });
  assert.equal(isDoneEligible(validDone, 'Done', whitelist).eligible, true);

  // Missing Reporting Date
  const noDate = makeProjectItem({
    assignees: ['alice'],
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    fields: { Status: 'Done' }
  });
  assert.equal(isDoneEligible(noDate, 'Done', whitelist).eligible, false);

  // Closed as NOT_PLANNED
  const notPlanned = makeProjectItem({
    assignees: ['alice'],
    state: 'CLOSED',
    stateReason: 'NOT_PLANNED',
    fields: { Status: 'Done', 'Reporting Date': '2026-03-20' }
  });
  assert.equal(isDoneEligible(notPlanned, 'Done', whitelist).eligible, false);

  // Still OPEN issue marked Done in project (eligible)
  const openDone = makeProjectItem({
    assignees: ['alice'],
    state: 'OPEN',
    fields: { Status: 'Done', 'Reporting Date': '2026-03-20' }
  });
  assert.equal(isDoneEligible(openDone, 'Done', whitelist).eligible, true);

  // Assignee not in whitelist
  const nonWhitelisted = makeProjectItem({
    assignees: ['charlie'],
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    fields: { Status: 'Done', 'Reporting Date': '2026-03-20' }
  });
  assert.equal(isDoneEligible(nonWhitelisted, 'Done', whitelist).eligible, false);
});

// ---------------------------------------------------------------------------
// SECTION 6: Change Detection & Ghost Row Eviction (Issues #114 & #115)
// ---------------------------------------------------------------------------

test('compareDoneRows: ignores Reporting Date and Parent Issue, detects other changes', () => {
  const rowA = {
    'Issue Number': '1',
    'Parent Issue': '',
    'Issue URL': 'https://github.com/org/repo/issues/1',
    'Title': 'Title A',
    'Assignees': 'alice',
    'Type': 'Task',
    'Area': 'Core',
    'Priority': 'High',
    'Initiative': '',
    'Target Milestone': '',
    'Size': '',
    'Estimate': '2',
    'Time Spent': '2',
    'Reporting Date': '2026-03-01',
    'External Reference': '',
    'Comments': '',
    'Alerts': ''
  };

  // Same content, different Reporting Date and Parent Issue -> no diffs
  const rowB = {
    ...rowA,
    'Parent Issue': '99',
    'Reporting Date': '2026-03-20'
  };
  assert.deepEqual(compareDoneRows(rowA, rowB), []);

  // Numeric formatting differences (e.g. '2.0' vs '2', '0.0' vs '0') -> no diffs
  const rowNumericFmt = {
    ...rowA,
    'Estimate': '2.0',
    'Time Spent': '2.00'
  };
  assert.deepEqual(compareDoneRows(rowA, rowNumericFmt), []);

  // Title changed -> diff detected
  const rowC = {
    ...rowA,
    Title: 'Title Changed'
  };
  const diffs = compareDoneRows(rowA, rowC);
  assert.equal(diffs.length, 1);
  assert.match(diffs[0], /Title: 'Title A' -> 'Title Changed'/);

  // Actual numeric change -> diff detected
  const rowEstimateChanged = {
    ...rowA,
    'Estimate': '3'
  };
  const numDiffs = compareDoneRows(rowA, rowEstimateChanged);
  assert.equal(numDiffs.length, 1);
  assert.match(numDiffs[0], /Estimate: '2' -> '3'/);
});

test('processProjectItems: evicts ghost rows when issue moves from Done to In Progress (#114)', () => {
  const item1 = makeProjectItem({
    number: 1,
    url: 'https://github.com/org/repo/issues/1',
    fields: { Status: 'In Progress' }
  });
  const item2 = makeProjectItem({
    number: 2,
    url: 'https://github.com/org/repo/issues/2',
    fields: { Status: 'Done', 'Reporting Date': '2026-03-25' }
  });

  // Existing export had BOTH items 1 and 2 recorded as Done
  const existingDoneMap = new Map();
  existingDoneMap.set('https://github.com/org/repo/issues/1', {
    'Issue Number': '1',
    'Issue URL': 'https://github.com/org/repo/issues/1',
    Title: 'Issue 1',
    'Reporting Date': '2026-03-01'
  });
  existingDoneMap.set('https://github.com/org/repo/issues/2', {
    'Issue Number': '2',
    'Issue URL': 'https://github.com/org/repo/issues/2',
    Title: 'Issue 2',
    'Reporting Date': '2026-03-25'
  });

  const result = processProjectItems('org', '1', [item1, item2], existingDoneMap, null);

  // Active items should include item 1
  assert.equal(result.activeRows.length, 1);
  assert.equal(result.activeRows[0]['Issue Number'], '1');

  // Done items should have evicted item 1 and kept item 2
  assert.equal(result.evictedCount, 1);
  assert.equal(result.finalDoneRows.length, 1);
  assert.equal(result.finalDoneRows[0]['Issue Number'], '2');
});

test('processProjectItems: sorts active items by Issue Number descending (numeric)', () => {
  const item2 = makeProjectItem({ number: 2, fields: { Status: 'In Progress' } });
  const item10 = makeProjectItem({ number: 10, fields: { Status: 'In Progress' } });
  const item100 = makeProjectItem({ number: 100, fields: { Status: 'In Progress' } });

  const result = processProjectItems('org', '1', [item2, item100, item10], null, null);

  assert.equal(result.activeRows.length, 3);
  assert.equal(result.activeRows[0]['Issue Number'], '100');
  assert.equal(result.activeRows[1]['Issue Number'], '10');
  assert.equal(result.activeRows[2]['Issue Number'], '2');
});

// ---------------------------------------------------------------------------
// SECTION 7: End-to-End runExport Integration
// ---------------------------------------------------------------------------

test('runExport: exports active and done CSVs to target directory with correct content', async () => {
  const dir = tmpDir();
  const exportsDir = path.join(dir, 'exports');
  const whitelistPath = path.join(dir, 'contributors.csv');
  fs.writeFileSync(whitelistPath, 'GitHub Username,Active\nalice,true\n');

  const items = [
    makeProjectItem({
      number: 10,
      title: 'Active Task',
      url: 'https://github.com/org/repo/issues/10',
      assignees: ['alice'],
      fields: { Status: 'In Progress', Type: 'Feature', 'Reporting Date': '2026-03-20' }
    }),
    makeProjectItem({
      number: 20,
      title: 'Done Task',
      url: 'https://github.com/org/repo/issues/20',
      assignees: ['alice'],
      state: 'CLOSED',
      stateReason: 'COMPLETED',
      fields: { Status: 'Done', Type: 'Bug', 'Reporting Date': '2026-03-22' }
    })
  ];

  const mockFetch = async () => items;

  const result = await runExport({
    token: 'dummy-token',
    projects: 'org:1',
    exportsDir,
    whitelistPath,
    dryRun: false,
    fetchItemsFn: mockFetch
  });

  assert.equal(result.activeExported, 1);
  assert.equal(result.doneExported, 1);
  assert.equal(result.evictedCount, 0);
  assert.equal(result.hasExports, true);

  // Check generated active CSV
  const activeCsvPath = path.join(exportsDir, 'org-1-active-items.csv');
  assert.ok(fs.existsSync(activeCsvPath));
  const activeContent = fs.readFileSync(activeCsvPath, 'utf8');
  assert.ok(activeContent.includes('Active Task'));

  // Check generated done CSV
  const doneCsvPath = path.join(exportsDir, 'org-1-done-items.csv');
  assert.ok(fs.existsSync(doneCsvPath));
  const doneContent = fs.readFileSync(doneCsvPath, 'utf8');
  assert.ok(doneContent.includes('Done Task'));
});

test('runExport: in dry-run mode, does not write any files', async () => {
  const dir = tmpDir();
  const exportsDir = path.join(dir, 'exports');

  const items = [
    makeProjectItem({ number: 1, fields: { Status: 'In Progress' } })
  ];

  const result = await runExport({
    token: 'dummy-token',
    projects: 'org:1',
    exportsDir,
    dryRun: true,
    fetchItemsFn: async () => items
  });

  assert.equal(result.activeExported, 1);
  assert.equal(fs.existsSync(exportsDir), false);
});
