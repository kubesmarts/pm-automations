'use strict';

const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');
const {
  arrayToCSV,
  readExistingCSV,
  writeCSV,
  ACTIVE_ITEMS_COLUMNS,
  DONE_ITEMS_COLUMNS
} = require('./csv-generator');
const { removeActiveItems } = require('./done-items-merger');

// ---------------------------------------------------------------------------
// Contributor Whitelist
// ---------------------------------------------------------------------------

/**
 * Load contributor whitelist from contributors.csv.
 * Returns a Set of active GitHub usernames (lowercased), or null if file not found.
 */
function loadContributorWhitelist(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`Warning: ${filePath} not found. Processing all contributors.\n`);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const activeUsers = new Set();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(',');
      if (parts.length >= 2) {
        const username = parts[0].trim();
        const active = parts[1].trim();
        if (active.toLowerCase() === 'true' && username) {
          activeUsers.add(username.toLowerCase());
        }
      }
    }

    if (activeUsers.size === 0) {
      console.log(`Warning: No active contributors found in ${filePath}. Processing all contributors.\n`);
      return null;
    }

    console.log(`Loaded contributor whitelist: ${activeUsers.size} active contributor(s)`);
    console.log(`Active usernames: ${Array.from(activeUsers).join(',')}\n`);
    return activeUsers;
  } catch (err) {
    console.warn(`Warning: Could not parse ${filePath}: ${err.message}. Processing all contributors.\n`);
    return null;
  }
}

/**
 * Check if at least one assignee is in the whitelist.
 * Returns true if whitelist is null (no whitelist active).
 */
function isWhitelisted(assigneesStr, whitelist) {
  if (!whitelist) return true;
  if (!assigneesStr) return false;

  const assignees = assigneesStr.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
  return assignees.some(assignee => whitelist.has(assignee));
}

// ---------------------------------------------------------------------------
// Field Extraction & Parent Mapping
// ---------------------------------------------------------------------------

/**
 * Extract a field value from a ProjectV2 item's fieldValues nodes by field name.
 */
function getField(item, fieldName) {
  const nodes = item.fieldValues?.nodes || [];
  for (const node of nodes) {
    if (node.field?.name === fieldName) {
      if (node.text != null) return String(node.text);
      if (node.number != null) return String(node.number);
      if (node.name != null) return String(node.name);
      if (node.date != null) return String(node.date);
    }
  }
  return '';
}

/**
 * Build a parent-child mapping from subIssues across all project items.
 * Returns Map: `${childOwner}/${childRepo}#${childNumber}` -> `${parentNumber}`.
 */
function buildParentMap(items) {
  const parentMap = new Map();

  for (const item of items) {
    const parentNum = item.content?.number;
    if (!parentNum) continue;

    const subIssues = item.content?.subIssues?.nodes || [];
    for (const child of subIssues) {
      if (!child.number) continue;
      const childOwner = child.repository?.owner?.login || '';
      const childRepo = child.repository?.name || '';
      const childKey = `${childOwner}/${childRepo}#${child.number}`;
      parentMap.set(childKey, String(parentNum));
    }
  }

  return parentMap;
}

// ---------------------------------------------------------------------------
// Row Builders
// ---------------------------------------------------------------------------

function extractCompositeKey(item) {
  const issueNum = item.content?.number || '';
  const repoOwner = item.content?.repository?.owner?.login || '';
  const repoName = item.content?.repository?.name || '';
  return `${repoOwner}/${repoName}#${issueNum}`;
}

/**
 * Returns 'PR' if the item is a PullRequest project item, 'Issue' otherwise.
 * A PullRequest item has a `merged` field (boolean) that issues never have.
 */
function getItemType(item) {
  return Object.prototype.hasOwnProperty.call(item.content || {}, 'merged') ? 'PR' : 'Issue';
}

function extractAssignees(item) {
  const nodes = item.content?.assignees?.nodes || [];
  return nodes.map(n => n.login).filter(Boolean).join(',');
}

/**
 * Convert a ProjectV2 item to an active items CSV row object.
 */
function itemToActiveRow(item, parentMap) {
  const issueNumber = String(item.content?.number || '');
  const compositeKey = extractCompositeKey(item);
  const parentIssue = parentMap.get(compositeKey) || '';
  const issueUrl = item.content?.url || '';
  const title = item.content?.title || '';
  const assignees = extractAssignees(item);

  return {
    'Issue Number': issueNumber,
    'Parent Issue': parentIssue,
    'Issue URL': issueUrl,
    'Title': title,
    'Assignees': assignees,
    'Status': getField(item, 'Status'),
    'Type': getField(item, 'Type'),
    'Area': getField(item, 'Area'),
    'Priority': getField(item, 'Priority'),
    'Initiative': getField(item, 'Initiative'),
    'Target Milestone': getField(item, 'Target Milestone'),
    'Size': getField(item, 'Size'),
    'Estimate': getField(item, 'Estimate'),
    'Time Spent': getField(item, 'Time Spent'),
    'Remaining Work': getField(item, 'Remaining Work'),
    'Σ Estimate': getField(item, 'Σ Estimate'),
    'Σ Time Spent': getField(item, 'Σ Time Spent'),
    'Σ Remaining Work': getField(item, 'Σ Remaining Work'),
    'External Reference': getField(item, 'External Reference'),
    'Comments': getField(item, 'Comments'),
    'Reporting Date': getField(item, 'Reporting Date'),
    'Alerts': getField(item, 'Alerts')
  };
}

/**
 * Convert a ProjectV2 item to a done items CSV row object.
 */
function itemToDoneRow(item, parentMap) {
  const issueNumber = String(item.content?.number || '');
  const compositeKey = extractCompositeKey(item);
  const parentIssue = parentMap.get(compositeKey) || '';
  const issueUrl = item.content?.url || '';
  const title = item.content?.title || '';
  const assignees = extractAssignees(item);

  return {
    'Issue Number': issueNumber,
    'Parent Issue': parentIssue,
    'Issue URL': issueUrl,
    'Title': title,
    'Assignees': assignees,
    'Type': getField(item, 'Type'),
    'Area': getField(item, 'Area'),
    'Priority': getField(item, 'Priority'),
    'Initiative': getField(item, 'Initiative'),
    'Target Milestone': getField(item, 'Target Milestone'),
    'Size': getField(item, 'Size'),
    'Estimate': getField(item, 'Estimate'),
    'Time Spent': getField(item, 'Time Spent'),
    'Reporting Date': getField(item, 'Reporting Date'),
    'External Reference': getField(item, 'External Reference'),
    'Comments': getField(item, 'Comments'),
    'Alerts': getField(item, 'Alerts')
  };
}

// ---------------------------------------------------------------------------
// Eligibility Checks
// ---------------------------------------------------------------------------

/**
 * Check if an item is eligible for Active export.
 */
function isActiveEligible(item, status, whitelist) {
  const statusLc = status.toLowerCase();

  // Must not be Done or Cancelled
  if (statusLc === 'done' || statusLc === 'cancelled') {
    return { eligible: false, reason: `Status is ${status}` };
  }

  const targetMilestone = getField(item, 'Target Milestone');
  const hasSpecificVersion = Boolean(targetMilestone && targetMilestone !== 'Future');

  // Backlog items require a specific target milestone
  if (statusLc === 'backlog' && !hasSpecificVersion) {
    return { eligible: false, reason: 'Backlog item without specific target milestone' };
  }

  const assignees = extractAssignees(item);

  // Whitelist check:
  // - If assignee set: check whitelist
  // - If no assignee: allow only if item has specific version
  if (assignees) {
    if (!isWhitelisted(assignees, whitelist)) {
      return { eligible: false, reason: 'Assignees not in contributor whitelist' };
    }
  } else {
    if (!hasSpecificVersion && whitelist) {
      return { eligible: false, reason: 'Unassigned item without specific version' };
    }
  }

  return { eligible: true };
}

/**
 * Check if an item is eligible for Done export.
 */
function isDoneEligible(item, status, whitelist) {
  const statusLc = status.toLowerCase();
  if (statusLc !== 'done') {
    return { eligible: false, reason: `Status is ${status} (not Done)` };
  }

  const state = item.content?.state || '';

  if (getItemType(item) === 'PR') {
    // PR items: CLOSED without merge = equivalent of "not planned" — skip.
    // MERGED and OPEN PR items in Done are eligible.
    const merged = item.content?.merged || false;
    if (state === 'CLOSED' && !merged) {
      return { eligible: false, reason: `PR closed without merging` };
    }
  } else {
    // Issue items: Done items whose underlying GH issue was closed but not as completed
    // (e.g. closed as "not planned") are skipped.
    // Done items whose repo issue is still OPEN are exported.
    const stateReason = item.content?.stateReason || '';
    if (state !== 'OPEN' && stateReason !== 'COMPLETED') {
      return { eligible: false, reason: `Closed with stateReason '${stateReason || 'null'}' (not COMPLETED)` };
    }
  }

  const reportingDate = getField(item, 'Reporting Date');
  if (!reportingDate) {
    return { eligible: false, reason: 'Missing Reporting Date' };
  }

  const assignees = extractAssignees(item);
  if (whitelist && !isWhitelisted(assignees, whitelist)) {
    return { eligible: false, reason: 'Assignees not in contributor whitelist' };
  }

  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Change Detection & Done Items Merging
// ---------------------------------------------------------------------------

const DONE_COMPARE_COLUMNS = [
  'Title',
  'Assignees',
  'Type',
  'Area',
  'Priority',
  'Initiative',
  'Target Milestone',
  'Size',
  'Estimate',
  'Time Spent',
  'External Reference',
  'Comments',
  'Alerts'
];

const NUMERIC_COLUMNS = new Set(['Size', 'Estimate', 'Time Spent']);

/**
 * Compare freshly built done row with existing stored row.
 * Normalizes numeric fields (e.g. '1.0' === '1') to prevent cosmetic false positives.
 * Returns array of diff strings.
 */
function compareDoneRows(oldRow, newRow) {
  const diffs = [];
  const cut = v => (v.length <= 80 ? v : v.slice(0, 77) + '...');

  for (const col of DONE_COMPARE_COLUMNS) {
    const oldVal = (oldRow[col] || '').trim();
    const newVal = (newRow[col] || '').trim();

    if (oldVal === newVal) continue;

    // For numeric columns, ignore cosmetic representation differences (e.g. '1.0' vs '1', '0.0' vs '0')
    if (NUMERIC_COLUMNS.has(col) && oldVal !== '' && newVal !== '') {
      const oldNum = Number(oldVal);
      const newNum = Number(newVal);
      if (!Number.isNaN(oldNum) && !Number.isNaN(newNum) && oldNum === newNum) {
        continue;
      }
    }

    diffs.push(`${col}: '${cut(oldVal)}' -> '${cut(newVal)}'`);
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// GraphQL Fetching
// ---------------------------------------------------------------------------

const PROJECT_QUERY = `
query($owner: String!, $number: Int!, $cursor: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isArchived
          content {
            ... on Issue {
              number
              title
              url
              state
              stateReason
              repository {
                name
                owner { login }
              }
              assignees(first: 10) { nodes { login } }
              subIssues(first: 50) {
                nodes {
                  number
                  repository {
                    name
                    owner { login }
                  }
                }
              }
            }
            ... on PullRequest {
              number
              title
              url
              state
              merged
              repository {
                name
                owner { login }
              }
              assignees(first: 10) { nodes { login } }
            }
          }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2SingleSelectField { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2Field { name } }
              }
            }
          }
        }
      }
    }
  }
}
`;

async function fetchProjectItems(owner, number, token) {
  let allNodes = [];
  let hasNext = true;
  let cursor = null;
  let page = 1;

  console.log(`Fetching project items for ${owner} #${number}...`);

  while (hasNext) {
    if (page > 1) {
      console.log(`Fetching page ${page}...`);
    }

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'pm-automations-gh-export'
      },
      body: JSON.stringify({
        query: PROJECT_QUERY,
        variables: { owner, number: parseInt(number, 10), cursor }
      })
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed with HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (data.errors && data.errors.length > 0) {
      throw new Error(`GraphQL query error for ${owner} #${number}: ${JSON.stringify(data.errors)}`);
    }

    const project = data.data?.organization?.projectV2;
    if (!project) {
      throw new Error(`Project ${owner} #${number} not found or inaccessible`);
    }

    const items = project.items?.nodes || [];
    allNodes.push(...items);

    hasNext = project.items?.pageInfo?.hasNextPage || false;
    cursor = project.items?.pageInfo?.endCursor || null;
    page++;
  }

  return allNodes;
}

// ---------------------------------------------------------------------------
// Processing & Export Generation
// ---------------------------------------------------------------------------

/**
 * Process a single project's items and build active rows, done rows, eviction stats.
 */
function processProjectItems(projectOwner, projectNumber, rawItems, existingDoneRows, whitelist) {
  const parentMap = buildParentMap(rawItems);

  const activeRows = [];
  const activeUrls = new Set();
  const eligibleDoneRows = [];
  const newOrUpdatedDoneRows = [];

  let skippedDraft = 0;
  let skippedNoDate = 0;
  let skippedUnchanged = 0;

  // 1. Process all raw items
  for (const item of rawItems) {
    if (item.isArchived) continue;

    const issueNumber = item.content?.number;
    if (!issueNumber) {
      skippedDraft++;
      continue;
    }

    const issueUrl = item.content?.url || '';
    const status = getField(item, 'Status');
    const statusLc = status.toLowerCase();

    if (statusLc === 'done') {
      const eligibility = isDoneEligible(item, status, whitelist);
      if (!eligibility.eligible) {
        if (eligibility.reason === 'Missing Reporting Date') {
          skippedNoDate++;
        }
        console.log(`  → Skipping issue #${issueNumber}: ${eligibility.reason}`);
        continue;
      }

      const doneRow = itemToDoneRow(item, parentMap);
      eligibleDoneRows.push(doneRow);

      const existingRow = existingDoneRows ? existingDoneRows.get(issueUrl) : null;
      if (!existingRow) {
        newOrUpdatedDoneRows.push(doneRow);
      } else {
        const diffs = compareDoneRows(existingRow, doneRow);
        if (diffs.length > 0) {
          console.log(`  → Re-exporting issue #${issueNumber} "${doneRow.Title}" (${issueUrl}): exported values changed — ${diffs.join('; ')}`);
          newOrUpdatedDoneRows.push(doneRow);
        } else {
          skippedUnchanged++;
        }
      }
    } else {
      // Non-Done item -> track active URL for ghost row eviction
      if (issueUrl) {
        activeUrls.add(issueUrl);
      }

      const eligibility = isActiveEligible(item, status, whitelist);
      if (eligibility.eligible) {
        const activeRow = itemToActiveRow(item, parentMap);
        activeRows.push(activeRow);
      }
    }
  }

  // 2. Sort active rows by Issue Number descending (numeric)
  activeRows.sort((a, b) => parseInt(b['Issue Number'], 10) - parseInt(a['Issue Number'], 10));

  // 3. Ghost row eviction and Done items merging
  let finalDoneRows = [];
  let evictedCount = 0;

  if (!existingDoneRows) {
    // First export for this project
    finalDoneRows = [...newOrUpdatedDoneRows].sort((a, b) => new Date(b['Reporting Date']) - new Date(a['Reporting Date']));
  } else {
    // Convert existing rows map to array
    const existingList = Array.from(existingDoneRows.values());

    // Evict rows for tickets that transitioned back to an active status
    const cleanedExisting = removeActiveItems(existingList, activeUrls);
    evictedCount = existingList.length - cleanedExisting.length;

    // Merge cleaned existing rows with new/updated done rows (deduplicating by Issue URL)
    const urlMap = new Map();
    for (const r of cleanedExisting) {
      urlMap.set(r['Issue URL'], r);
    }
    for (const r of newOrUpdatedDoneRows) {
      urlMap.set(r['Issue URL'], r); // fresh row wins
    }

    finalDoneRows = Array.from(urlMap.values()).sort((a, b) => new Date(b['Reporting Date']) - new Date(a['Reporting Date']));
  }

  return {
    activeRows,
    activeUrls,
    newOrUpdatedDoneRows,
    finalDoneRows,
    evictedCount,
    skippedNoDate,
    skippedUnchanged,
    skippedDraft
  };
}

// ---------------------------------------------------------------------------
// Main Workflow Runner
// ---------------------------------------------------------------------------

async function runExport({
  token = process.env.GH_TOKEN || process.env.PSYNC_PAT_GH,
  projects = process.env.PROJECTS || process.env.PSYNC_PROJECTS,
  exportsDir = path.join(process.cwd(), 'exports'),
  whitelistPath = path.join(process.cwd(), 'contributors.csv'),
  dryRun = process.env.DRY_RUN === 'true',
  fetchItemsFn = fetchProjectItems
} = {}) {
  if (dryRun) {
    console.log('*** DRY RUN MODE — no files will be written ***\n');
  }

  if (!token) {
    throw new Error('GH_TOKEN or PSYNC_PAT_GH is required');
  }

  if (!projects || !projects.trim()) {
    console.log('No projects configured in PROJECTS/PSYNC_PROJECTS');
    return { activeExported: 0, doneExported: 0, evictedCount: 0, hasExports: false };
  }

  const whitelist = loadContributorWhitelist(whitelistPath);
  const projectEntries = projects.trim().split(/\s+/).filter(Boolean);

  let totalActiveExported = 0;
  let totalDoneExported = 0;
  let totalEvicted = 0;

  for (const entry of projectEntries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) {
      console.warn(`Warning: Invalid project entry '${entry}' (expected owner:number). Skipping.`);
      continue;
    }

    const projectOwner = entry.slice(0, colonIdx);
    const projectNumber = entry.slice(colonIdx + 1);

    console.log('========================================');
    console.log(`Project: ${projectOwner} #${projectNumber}`);
    console.log('========================================');

    // 1. Fetch raw items
    const rawItems = await fetchItemsFn(projectOwner, projectNumber, token);

    // 2. Read existing done items CSV (if any) into Map<url, row>
    const doneFileName = `${projectOwner}-${projectNumber}-done-items.csv`;
    const existingList = readExistingCSV(exportsDir, doneFileName, DONE_ITEMS_COLUMNS);
    let existingDoneMap = null;
    if (existingList !== null) {
      existingDoneMap = new Map();
      for (const r of existingList) {
        if (r['Issue URL']) {
          existingDoneMap.set(r['Issue URL'], r);
        }
      }
      console.log(`Loaded ${existingDoneMap.size} existing exported items for change detection`);
    } else {
      console.log(`First export for ${projectOwner}:${projectNumber} - exporting all Done items`);
    }

    // 3. Process items
    const {
      activeRows,
      newOrUpdatedDoneRows,
      finalDoneRows,
      evictedCount,
      skippedNoDate,
      skippedUnchanged
    } = processProjectItems(projectOwner, projectNumber, rawItems, existingDoneMap, whitelist);

    // 4. Generate & save Active items CSV
    const activeFileName = `${projectOwner}-${projectNumber}-active-items.csv`;
    const activeCsvContent = arrayToCSV(activeRows, ACTIVE_ITEMS_COLUMNS);

    if (!dryRun) {
      writeCSV(exportsDir, activeFileName, activeCsvContent);
      console.log(`✓ Exported ${activeRows.length} active item(s) to ${path.join(exportsDir, activeFileName)}`);
    } else {
      console.log(`[DRY RUN] Would export ${activeRows.length} active item(s) to ${path.join(exportsDir, activeFileName)}`);
    }
    totalActiveExported += activeRows.length;

    // 5. Generate & save Done items CSV (if new/updated items or evictions)
    const doneHasChanges = existingDoneMap === null || newOrUpdatedDoneRows.length > 0 || evictedCount > 0;

    if (doneHasChanges) {
      const doneCsvContent = arrayToCSV(finalDoneRows, DONE_ITEMS_COLUMNS);
      if (!dryRun) {
        writeCSV(exportsDir, doneFileName, doneCsvContent);
        if (newOrUpdatedDoneRows.length > 0) {
          console.log(`✓ Exported ${newOrUpdatedDoneRows.length} item(s) to ${path.join(exportsDir, doneFileName)}`);
        }
      } else {
        if (newOrUpdatedDoneRows.length > 0) {
          console.log(`[DRY RUN] Would export ${newOrUpdatedDoneRows.length} item(s) to ${path.join(exportsDir, doneFileName)}`);
        }
      }
    } else {
      console.log('No new or updated Done items to export');
    }

    if (evictedCount > 0) {
      if (!dryRun) {
        console.log(`✓ Evicted ${evictedCount} ghost item(s) now in active status from ${path.join(exportsDir, doneFileName)}`);
      } else {
        console.log(`[DRY RUN] Would evict ${evictedCount} ghost item(s) now in active status from ${path.join(exportsDir, doneFileName)}`);
      }
      totalEvicted += evictedCount;
    }

    if (skippedNoDate > 0) {
      console.log(`  Skipped ${skippedNoDate} item(s) without Reporting Date`);
    }
    if (skippedUnchanged > 0) {
      console.log(`  Skipped ${skippedUnchanged} item(s) already up to date (exported values unchanged)`);
    }

    totalDoneExported += newOrUpdatedDoneRows.length;
    console.log('');
  }

  console.log('========================================');
  if (totalEvicted > 0) {
    console.log(`Total: ${totalActiveExported} active item(s) exported, ${totalDoneExported} done item(s) exported, ${totalEvicted} ghost item(s) evicted across all projects`);
  } else {
    console.log(`Total: ${totalActiveExported} active item(s) exported, ${totalDoneExported} done item(s) exported across all projects`);
  }
  console.log('========================================');

  const hasExports = (totalActiveExported + totalDoneExported + totalEvicted) > 0 && !dryRun;

  return {
    activeExported: totalActiveExported,
    doneExported: totalDoneExported,
    evictedCount: totalEvicted,
    hasExports
  };
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

if (require.main === module) {
  runExport()
    .then(result => {
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_exports=${result.hasExports}\n`);
      }
    })
    .catch(err => {
      console.error(`Error during GH export: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  loadContributorWhitelist,
  isWhitelisted,
  getField,
  buildParentMap,
  getItemType,
  itemToActiveRow,
  itemToDoneRow,
  isActiveEligible,
  isDoneEligible,
  compareDoneRows,
  processProjectItems,
  PROJECT_QUERY,
  runExport
};
