/**
 * Check if issue has compliance-alerts label
 */
function hasComplianceAlerts(issue) {
  const labels = issue.fields?.labels || [];
  return labels.includes('compliance-alerts');
}

/**
 * Check if issue is in backlog status
 */
function isBacklogStatus(issue) {
  const status = (issue.fields?.status?.name || '').toUpperCase();
  return status === 'BACKLOG';
}

/**
 * Check if issue has no fixVersion set
 */
function hasNoFixVersion(issue) {
  const fixVersions = issue.fields?.fixVersions || [];
  return fixVersions.length === 0;
}

/**
 * Check if issue only has "Future" as fixVersion
 */
function hasFutureVersionOnly(issue) {
  const fixVersions = issue.fields?.fixVersions || [];
  if (fixVersions.length === 0) return false;
  if (fixVersions.length === 1 && fixVersions[0].name === 'Future') return true;
  return false;
}

/**
 * Check if issue has a specific fixVersion set (not empty, not Future)
 */
function hasSpecificFixVersion(issue) {
  const fixVersions = issue.fields?.fixVersions || [];
  if (fixVersions.length === 0) return false;

  // Has at least one version that is not "Future"
  return fixVersions.some(v => v.name !== 'Future');
}

/**
 * Check if assignee is in whitelist
 */
function isAssigneeInWhitelist(issue, resolvedAssignee, whitelist) {
  if (!whitelist) return true; // No whitelist = everyone eligible

  // If assignee was resolved to a username from whitelist, it's in whitelist
  const assignee = issue.fields?.assignee;
  if (!assignee) return false;

  // Check if resolved assignee is one of the whitelist usernames
  const whitelistUsernames = Array.from(whitelist.values());
  return whitelistUsernames.includes(resolvedAssignee);
}

/**
 * Check if issue is eligible for export
 * Returns { eligible: boolean, reason: string }
 */
function isEligibleForExport(issue, resolvedAssignee, whitelist) {
  // Rule 1: Has compliance-alerts label
  if (hasComplianceAlerts(issue)) {
    return {
      eligible: false,
      reason: 'compliance-alerts label'
    };
  }

  // Rule 2: Backlog without fixVersion
  if (isBacklogStatus(issue) && hasNoFixVersion(issue)) {
    return {
      eligible: false,
      reason: 'backlog without fixVersion'
    };
  }

  // Rule 3: Backlog with Future version only
  if (isBacklogStatus(issue) && hasFutureVersionOnly(issue)) {
    return {
      eligible: false,
      reason: 'backlog with Future version'
    };
  }

  // Rule 4 & 5: Whitelist enforcement
  if (whitelist) {
    const hasAssignee = !!issue.fields?.assignee;
    const inWhitelist = isAssigneeInWhitelist(issue, resolvedAssignee, whitelist);
    const hasSpecificVersion = hasSpecificFixVersion(issue);

    // Rule 4: Assignee not in whitelist AND no specific fixVersion
    if (hasAssignee && !inWhitelist && !hasSpecificVersion) {
      return {
        eligible: false,
        reason: 'assignee not in whitelist'
      };
    }

    // Rule 5: No assignee AND no specific fixVersion
    if (!hasAssignee && !hasSpecificVersion) {
      return {
        eligible: false,
        reason: 'no assignee and no specific fixVersion'
      };
    }
  }

  // All checks passed
  return {
    eligible: true,
    reason: null
  };
}

/**
 * Check if issue is a done item (for done items export)
 */
function isDoneItem(issue) {
  const status = (issue.fields?.status?.name || '').toUpperCase();
  const resolution = issue.fields?.resolution?.name;

  // RELEASE PENDING is considered done
  if (status === 'RELEASE PENDING') return true;

  // CLOSED with resolution = Done is considered done
  if (status === 'CLOSED' && resolution === 'Done') return true;

  return false;
}

/**
 * Check if issue is an active item (for active items export)
 */
function isActiveItem(issue) {
  const status = (issue.fields?.status?.name || '').toUpperCase();
  const resolution = issue.fields?.resolution?.name;

  // Not RELEASE PENDING and not CLOSED with Done resolution
  if (status === 'RELEASE PENDING') return false;
  if (status === 'CLOSED' && resolution === 'Done') return false;

  return true;
}

module.exports = {
  hasComplianceAlerts,
  isBacklogStatus,
  hasNoFixVersion,
  hasFutureVersionOnly,
  hasSpecificFixVersion,
  isAssigneeInWhitelist,
  isEligibleForExport,
  isDoneItem,
  isActiveItem
};
