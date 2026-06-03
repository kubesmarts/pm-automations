/**
 * Extract project key from issue key
 * e.g., "SRVLOGIC-900" -> "SRVLOGIC"
 */
function extractProjectKey(issueKey) {
  if (!issueKey) return null;
  const parts = issueKey.split('-');
  return parts[0];
}

/**
 * Extract issue number from issue key
 * e.g., "SRVLOGIC-900" -> "900"
 */
function extractIssueNumber(issueKey) {
  if (!issueKey) return null;
  const parts = issueKey.split('-');
  return parts.length > 1 ? parts[1] : null;
}

/**
 * Extract area from area/* labels
 * Takes first label matching pattern, removes prefix, capitalizes appropriately
 * Rule: 2-letter areas are uppercase (CI, QE, PM), others capitalize first letter only
 * e.g., ["area/ci", "bug"] -> "CI", ["area/docs", "bug"] -> "Docs"
 */
function extractArea(labels) {
  if (!labels || labels.length === 0) return '';

  const areaLabel = labels.find(label => label.startsWith('area/'));
  if (!areaLabel) return '';

  const areaValue = areaLabel.substring(5); // Remove "area/" prefix
  if (!areaValue) return '';

  // Rule: 2-letter areas go uppercase (CI, QE, PM, etc.)
  if (areaValue.length === 2) {
    return areaValue.toUpperCase();
  }

  // Capitalize first letter only for longer values
  return areaValue.charAt(0).toUpperCase() + areaValue.slice(1).toLowerCase();
}

/**
 * Map JIRA priority to CSV priority
 * Uses JIRA priority name as-is
 */
function mapPriority(jiraPriority) {
  if (!jiraPriority) return '';
  return jiraPriority.name || '';
}

/**
 * Format target milestone from fixVersions
 * - Takes first fixVersion
 * - Appends " OSL" suffix for SRVLOGIC project (unless version contains "Future")
 */
function formatTargetMilestone(fixVersions, projectKey) {
  if (!fixVersions || fixVersions.length === 0) return '';

  let milestone = fixVersions[0].name;

  // SRVLOGIC special rule: append " OSL" suffix
  // Exception: do not append if version contains "Future" (case insensitive)
  if (projectKey === 'SRVLOGIC' && !milestone.toLowerCase().includes('future')) {
    milestone += ' OSL';
  }

  return milestone;
}

/**
 * Get project name (Initiative field)
 * Uses JIRA project name, falls back to project key
 */
function getProjectName(projectKey, projectName) {
  return projectName || projectKey || '';
}

/**
 * Extract parent issue number if exists
 */
function extractParentIssue(issue) {
  const parent = issue.fields?.parent;
  if (!parent) return '';

  return extractIssueNumber(parent.key);
}

/**
 * Build JIRA issue URL
 */
function buildIssueUrl(baseUrl, issueKey) {
  return `${baseUrl}/browse/${issueKey}`;
}

/**
 * Map JIRA status to CSV status
 * Based on JIRA Status to Policy Stage Mapping
 */
function mapStatus(jiraStatus) {
  if (!jiraStatus) return '';

  const status = jiraStatus.toUpperCase();

  const statusMap = {
    'NEW': 'Next',
    'REFINEMENT': 'Next',
    'IN PROGRESS': 'In Progress',
    'ON_DEV': 'In Progress',
    'CORE_REVIEW': 'In Review',
    'ON_QA': 'In Review',
    'RELEASE PENDING': 'Done',
    'CLOSED': 'Done', // Only if resolution = Done (checked before calling)
    'BACKLOG': 'Backlog'
  };

  return statusMap[status] || status;
}

/**
 * Format reporting date from JIRA updated timestamp
 * Converts ISO timestamp to YYYY-MM-DD format
 */
function formatReportingDate(updatedTimestamp) {
  if (!updatedTimestamp) {
    // Fallback to current date if not available
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  const date = new Date(updatedTimestamp);
  return date.toISOString().split('T')[0];
}

/**
 * Extract issue type name
 */
function extractIssueType(issue) {
  return issue.fields?.issuetype?.name || '';
}

module.exports = {
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
};
