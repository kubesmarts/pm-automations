const path = require('path');
const JiraClient = require('./jira-client');
const IssueDiscovery = require('./issue-discovery');
const { loadContributorWhitelist, resolveAssignee } = require('./contributor-matcher');
const { hasComplianceAlerts, isEligibleForExport, isDoneItem, isActiveItem } = require('./eligibility-checker');
const { extractTimeTracking, formatTimeValue, formatAggregateTimeValue } = require('./time-converter');
const {
  extractProjectKey,
  extractIssueNumber,
  extractArea,
  mapPriority,
  formatTargetMilestone,
  getProjectName,
  extractParentIssue,
  buildIssueUrl,
  mapStatus,
  formatReportingDate,
  extractIssueType
} = require('./field-mapper');
const {
  generateActiveItemsCSV,
  generateDoneItemsData,
  writeCSV,
  readExistingCSV,
  arrayToCSV,
  DONE_ITEMS_COLUMNS
} = require('./csv-generator');
const { mergeDoneItems } = require('./done-items-merger');

// Configuration from environment
const JIRA_BASE_URL = process.env.PSYNC_JIRA_BASE_URL;
const JIRA_EMAIL = process.env.PSYNC_JIRA_EMAIL;
const JIRA_TOKEN = process.env.PSYNC_PAT_JIRA;
const JIRA_FILTERS = process.env.PSYNC_JIRA_FILTERS;
const JIRA_JQL = process.env.PSYNC_JIRA_JQL;
const JIRA_PROJECTS = process.env.PSYNC_JIRA_PROJECTS;
const DRY_RUN = process.env.DRY_RUN === 'true';

const EXPORTS_DIR = path.join(process.cwd(), 'exports');
const CONTRIBUTORS_FILE = path.join(process.cwd(), 'contributors.csv');

/**
 * Convert JIRA issue to CSV row (active items)
 */
async function issueToActiveItemRow(issue, baseUrl, whitelist, jiraClient) {
  const projectKey = extractProjectKey(issue.key);
  const assignee = resolveAssignee(issue.fields?.assignee, whitelist);
  const timeTracking = extractTimeTracking(issue);

  // Fetch alert codes only for issues that carry the compliance-alerts label
  const alerts = hasComplianceAlerts(issue)
    ? await jiraClient.extractComplianceAlerts(issue.key)
    : '';

  return {
    'Issue Number': extractIssueNumber(issue.key),
    'Parent Issue': extractParentIssue(issue),
    'Issue URL': buildIssueUrl(baseUrl, issue.key),
    'Title': issue.fields?.summary || '',
    'Assignees': assignee || '',
    'Status': mapStatus(issue.fields?.status?.name),
    'Type': extractIssueType(issue),
    'Area': extractArea(issue.fields?.labels || []),
    'Priority': mapPriority(issue.fields?.priority),
    'Initiative': getProjectName(projectKey, issue.fields?.project?.name),
    'Target Milestone': formatTargetMilestone(issue.fields?.fixVersions || [], projectKey),
    'Size': '', // Not available in JIRA
    'Estimate': formatTimeValue(timeTracking.originalEstimate),
    'Time Spent': formatTimeValue(timeTracking.timeSpent),
    'Remaining Work': formatTimeValue(timeTracking.remainingEstimate),
    'Σ Estimate': formatAggregateTimeValue(timeTracking.aggregateOriginalEstimate),
    'Σ Time Spent': formatAggregateTimeValue(timeTracking.aggregateTimeSpent),
    'Σ Remaining Work': formatAggregateTimeValue(timeTracking.aggregateRemainingEstimate),
    'External Reference': '', // Reserved for future use
    'Comments': '', // Reserved for future use
    'Alerts': alerts
  };
}

/**
 * Convert JIRA issue to CSV row (done items)
 */
function issueToDoneItemRow(issue, baseUrl, whitelist) {
  const projectKey = extractProjectKey(issue.key);
  const assignee = resolveAssignee(issue.fields?.assignee, whitelist);
  const timeTracking = extractTimeTracking(issue);

  return {
    'Issue Number': extractIssueNumber(issue.key),
    'Parent Issue': extractParentIssue(issue),
    'Issue URL': buildIssueUrl(baseUrl, issue.key),
    'Title': issue.fields?.summary || '',
    'Assignees': assignee || '',
    'Type': extractIssueType(issue),
    'Area': extractArea(issue.fields?.labels || []),
    'Priority': mapPriority(issue.fields?.priority),
    'Initiative': getProjectName(projectKey, issue.fields?.project?.name),
    'Target Milestone': formatTargetMilestone(issue.fields?.fixVersions || [], projectKey),
    'Size': '', // Not available in JIRA
    'Estimate': formatTimeValue(timeTracking.originalEstimate),
    'Time Spent': formatTimeValue(timeTracking.timeSpent),
    'Reporting Date': formatReportingDate(issue.fields?.updated),
    'External Reference': '', // Reserved for future use
    'Comments': '' // Reserved for future use
  };
}

/**
 * Process and export issues
 */
async function processIssues(issues, whitelist, jiraClient) {
  const stats = {
    total: issues.length,
    activeExported: 0,
    doneExported: 0,
    skipped: 0,
    skipReasons: {}
  };

  // Group issues by project
  const projectActiveItems = {};
  const projectDoneItems = {};

  console.log('\n=== Processing Issues ===\n');

  for (const issue of issues) {
    const projectKey = extractProjectKey(issue.key);
    const assignee = resolveAssignee(issue.fields?.assignee, whitelist);

    // Check eligibility
    const eligibility = isEligibleForExport(issue, assignee, whitelist);

    if (!eligibility.eligible) {
      console.log(`${issue.key} → Skipped (${eligibility.reason})`);
      stats.skipped++;
      stats.skipReasons[eligibility.reason] = (stats.skipReasons[eligibility.reason] || 0) + 1;
      continue;
    }

    // Determine if active or done
    if (isDoneItem(issue)) {
      // Done item
      const row = issueToDoneItemRow(issue, JIRA_BASE_URL, whitelist);
      if (!projectDoneItems[projectKey]) {
        projectDoneItems[projectKey] = [];
      }
      projectDoneItems[projectKey].push(row);
      stats.doneExported++;
      console.log(`${issue.key} → Done (reported ${row['Reporting Date']})`);
    } else if (isActiveItem(issue)) {
      // Active item
      const row = await issueToActiveItemRow(issue, JIRA_BASE_URL, whitelist, jiraClient);
      if (!projectActiveItems[projectKey]) {
        projectActiveItems[projectKey] = [];
      }
      projectActiveItems[projectKey].push(row);
      stats.activeExported++;
      console.log(`${issue.key} → Active (assigned to ${assignee || 'unassigned'})`);
    }
  }

  return { projectActiveItems, projectDoneItems, stats };
}

/**
 * Generate export files
 */
function generateExports(projectActiveItems, projectDoneItems) {
  const generatedFiles = [];

  console.log('\n=== Generating Exports ===\n');

  // Generate active items exports
  for (const [projectKey, items] of Object.entries(projectActiveItems)) {
    const result = generateActiveItemsCSV(items, projectKey);
    if (result) {
      if (!DRY_RUN) {
        const filePath = writeCSV(EXPORTS_DIR, result.fileName, result.content);
        console.log(`${result.fileName} → ${result.count} items (replaced)`);
        generatedFiles.push(filePath);
      } else {
        console.log(`[DRY RUN] ${result.fileName} → ${result.count} items (would replace)`);
      }
    }
  }

  // Generate done items exports (with merging)
  for (const [projectKey, newItems] of Object.entries(projectDoneItems)) {
    const fileName = `${projectKey.toLowerCase()}-done-items.csv`;

    // Read existing done items
    const existingItems = readExistingCSV(EXPORTS_DIR, fileName, DONE_ITEMS_COLUMNS);

    if (existingItems === null) {
      // File doesn't exist or couldn't be read, create new
      console.log(`${fileName} → ${newItems.length} new items (created)`);
      const content = arrayToCSV(newItems, DONE_ITEMS_COLUMNS);
      if (!DRY_RUN) {
        const filePath = writeCSV(EXPORTS_DIR, fileName, content);
        generatedFiles.push(filePath);
      } else {
        console.log(`[DRY RUN] Would create ${fileName}`);
      }
    } else {
      // Merge with existing
      console.log(`${fileName} → merging ${newItems.length} new items with ${existingItems.length} existing`);
      const mergedItems = mergeDoneItems(newItems, existingItems);
      const addedCount = mergedItems.length - existingItems.length;

      console.log(`${fileName} → ${addedCount} new items added (total: ${mergedItems.length})`);

      const content = arrayToCSV(mergedItems, DONE_ITEMS_COLUMNS);
      if (!DRY_RUN) {
        const filePath = writeCSV(EXPORTS_DIR, fileName, content);
        generatedFiles.push(filePath);
      } else {
        console.log(`[DRY RUN] Would update ${fileName}`);
      }
    }
  }

  return generatedFiles;
}

/**
 * Print summary
 */
function printSummary(stats, generatedFiles) {
  console.log('\n=== Summary ===\n');
  console.log(`Total issues processed: ${stats.total}`);
  console.log(`Active items exported: ${stats.activeExported}`);
  console.log(`Done items exported: ${stats.doneExported}`);
  console.log(`Skipped issues: ${stats.skipped}`);

  if (stats.skipped > 0) {
    console.log('\nSkip reasons:');
    for (const [reason, count] of Object.entries(stats.skipReasons)) {
      console.log(`  - ${reason}: ${count}`);
    }
  }

  if (generatedFiles.length > 0) {
    console.log('\nGenerated files:');
    generatedFiles.forEach(file => console.log(`  - ${file}`));
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('=== JIRA Issues Export Workflow ===\n');

    if (DRY_RUN) {
      console.log('*** DRY RUN MODE - No files will be written ***\n');
    }

    // Validate configuration
    if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_TOKEN) {
      throw new Error('Missing required JIRA configuration (PSYNC_JIRA_BASE_URL, PSYNC_JIRA_EMAIL, PSYNC_PAT_JIRA)');
    }

    if (!JIRA_FILTERS && !JIRA_JQL && !JIRA_PROJECTS) {
      throw new Error('At least one of PSYNC_JIRA_FILTERS, PSYNC_JIRA_JQL, or PSYNC_JIRA_PROJECTS must be set');
    }

    // Initialize JIRA client
    const jiraClient = new JiraClient(JIRA_BASE_URL, JIRA_EMAIL, JIRA_TOKEN);

    // Load contributor whitelist
    console.log('Loading contributor whitelist...');
    const whitelist = loadContributorWhitelist(CONTRIBUTORS_FILE);
    console.log();

    // Discover issues
    const discovery = new IssueDiscovery(jiraClient);
    const issues = await discovery.discoverIssues(JIRA_FILTERS, JIRA_JQL, JIRA_PROJECTS);

    if (issues.length === 0) {
      console.log('No issues found to export');
      return;
    }

    // Process issues
    const { projectActiveItems, projectDoneItems, stats } = await processIssues(issues, whitelist, jiraClient);

    // Generate exports
    const generatedFiles = generateExports(projectActiveItems, projectDoneItems);

    // Print summary
    printSummary(stats, generatedFiles);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main, issueToActiveItemRow };
