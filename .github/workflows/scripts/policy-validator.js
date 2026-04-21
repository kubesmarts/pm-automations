class PolicyValidator {
    constructor() {
        // JIRA Status to Policy Stage mapping
        this.statusMapping = {
            'NEW': 'Next',
            'REFINEMENT': 'Next',
            'IN PROGRESS': 'In Progress',
            'ON_DEV': 'In Progress',
            'CORE_REVIEW': 'In Review',
            'ON_QA': 'In Review',
            'RELEASE PENDING': 'Done',
            'CLOSED': 'Done'
        };

        // Required fields per policy stage
        this.requiredFields = {
            'Backlog': [],
            'Next': ['area', 'priority', 'fixVersions'],
            'In Progress': ['area', 'priority', 'fixVersions', 'originalEstimate', 'remainingEstimate', 'assignee'],
            'In Review': ['area', 'priority', 'fixVersions', 'originalEstimate', 'remainingEstimate', 'assignee'],
            'Done': ['area', 'priority', 'fixVersions', 'originalEstimate', 'timeSpent', 'assignee']
        };

        // Violation codes
        this.violationCodes = {
            'area': 'NO_AREA',
            'priority': 'NO_PRIORITY',
            'fixVersions': 'NO_VERSION',
            'originalEstimate': 'NO_ESTIMATE',
            'remainingEstimate': 'NO_REMAINING_WORK',
            'timeSpent': 'NO_TIME_SPENT',
            'assignee': 'NO_ASSIGNEE'
        };
    }

    mapStatusToPolicyStage(jiraStatus) {
        const stage = this.statusMapping[jiraStatus];
        if (!stage) {
            console.warn(`Unknown JIRA status: ${jiraStatus}, defaulting to Backlog`);
            return 'Backlog';
        }
        return stage;
    }

    validateIssue(issue, jiraClient) {
        const status = jiraClient.extractStatus(issue);
        const policyStage = this.mapStatusToPolicyStage(status);
        const requiredFields = this.requiredFields[policyStage] || [];

        const violations = [];
        const fieldValues = {
            status: status,
            policyStage: policyStage,
            area: jiraClient.extractAreaLabel(issue),
            priority: jiraClient.extractPriority(issue),
            fixVersions: jiraClient.extractFixVersions(issue),
            originalEstimate: jiraClient.extractOriginalEstimate(issue),
            remainingEstimate: jiraClient.extractRemainingEstimate(issue),
            timeSpent: jiraClient.extractTimeSpent(issue),
            assignee: jiraClient.extractAssignee(issue)
        };

        // Check each required field
        for (const field of requiredFields) {
            if (!this.isFieldValid(field, fieldValues[field])) {
                violations.push(this.violationCodes[field]);
            }
        }

        // Special check: Remaining Work should be cleared when Done
        if (policyStage === 'Done' && fieldValues.remainingEstimate && fieldValues.remainingEstimate !== '0m') {
            violations.push('REMAINING_WORK_NOT_CLEARED');
        }

        return {
            issueKey: issue.key,
            status: status,
            policyStage: policyStage,
            violations: violations,
            fields: fieldValues
        };
    }

    isFieldValid(fieldName, fieldValue) {
        if (fieldName === 'fixVersions') {
            return Array.isArray(fieldValue) && fieldValue.length > 0;
        }
        
        if (fieldName === 'timeSpent') {
            // For timeSpent, field must be set (can be 0, but not null)
            return fieldValue !== null && fieldValue !== undefined;
        }

        // For other fields, check if they exist and are not empty
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    }

    getViolationLabels(issue) {
        const labels = issue.fields.labels || [];
        const violationLabels = Object.values(this.violationCodes);
        violationLabels.push('REMAINING_WORK_NOT_CLEARED');
        
        return labels.filter(label => violationLabels.includes(label));
    }
}

module.exports = PolicyValidator;

