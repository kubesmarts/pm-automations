class PolicyValidator {
    constructor() {
        // JIRA Status to Policy Stage mapping
        this.statusMapping = {
            'BACKLOG': 'Backlog',
            'NEW': 'Next',
            'REFINEMENT': 'Next',
            'IN PROGRESS': 'In Progress',
            'ON_DEV': 'In Progress',
            'CODE REVIEW': 'In Review',
            'ON_QA': 'In Review',
            'RELEASE PENDING': 'Done',
            'CLOSED': 'Done'
        };

        // Required fields per policy stage
        this.requiredFields = {
            'Backlog': [],
            'Next': ['area', 'priority', 'fixVersions'],
            'In Progress': ['area', 'priority', 'fixVersions', 'originalEstimate', 'remainingEstimate', 'assignee'],
            'In Review': ['area', 'priority', 'fixVersions', 'originalEstimate', 'assignee'],
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
            'assignee': 'NO_ASSIGNEE',
            'component': 'NO_COMPONENT'
        };

        // Component-to-Area label mapping (for SRVLOGIC issues only)
        this.componentAreaMapping = {
            'CI:Midstream': 'area/ci',
            'Documentation': 'area/docs',
            'Productization': 'area/productization',
            'Agile': 'area/pm',
            'Cloud:CLI': 'area/cloud',
            'Cloud:Images': 'area/cloud',
            'Cloud:Operator': 'area/cloud',
            'Event Orchestration': 'area/runtimes',
            'Integration': 'area/runtimes',
            'Job Service': 'area/runtimes',
            'Persistence': 'area/runtimes',
            'Service Orchestration': 'area/runtimes',
            'Security': 'area/runtimes',
            'Getting Started': 'area/docs',
            'Migration': 'area/runtimes',
            'Installation': 'area/docs',
            'Management Console': 'area/tooling',
            'Tooling:DataIndexWebapp': 'area/tooling',
            'Tooling:Editor': 'area/tooling',
            'Tooling:VSCode': 'area/tooling',
            'Tooling:Web Tools': 'area/tooling',
            'QE Test Suite': 'area/qe',
            'Runtimes': 'area/runtimes',
            'serverless workflow': 'area/runtimes'
        };
    }

    mapStatusToPolicyStage(jiraStatus) {
        const stage = this.statusMapping[jiraStatus?.toUpperCase()];
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
            assignee: jiraClient.extractAssignee(issue),
            component: jiraClient.extractFirstComponent(issue)
        };

        // Component/Area validation for SRVLOGIC issues only
        const componentAreaResult = this.validateComponentAndArea(issue, jiraClient);
        if (componentAreaResult.violations.length > 0) {
            violations.push(...componentAreaResult.violations);
        }

        // For SRVLOGIC issues area is validated via component mapping — skip it here
        const fieldsToCheck = issue.key.startsWith('SRVLOGIC-')
            ? requiredFields.filter(f => f !== 'area')
            : requiredFields;

        for (const field of fieldsToCheck) {
            if (!this.isFieldValid(field, fieldValues[field])) {
                violations.push(this.violationCodes[field]);
            }
        }

        // Special check: Remaining Work should be cleared when Done
        if (policyStage === 'Done' && fieldValues.remainingEstimate) {
            violations.push('REMAINING_WORK_NOT_CLEARED');
        }

        return {
            issueKey: issue.key,
            status: status,
            policyStage: policyStage,
            violations: violations,
            fields: fieldValues,
            componentAreaSync: componentAreaResult.sync
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

        if (fieldName === 'priority') {
            // Priority must be set and not be "Undefined" (JIRA's way of saying no priority)
            return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' && fieldValue !== 'Undefined';
        }

        // For other fields, check if they exist and are not empty
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    }

    validateComponentAndArea(issue, jiraClient) {
        const issueKey = issue.key;
        const violations = [];
        const sync = {
            shouldSync: false,
            labelsToAdd: [],
            labelsToRemove: []
        };

        // Only apply to SRVLOGIC issues that are not in Backlog
        if (!issueKey.startsWith('SRVLOGIC-')) {
            return { violations, sync };
        }

        const status = jiraClient.extractStatus(issue);
        if (this.mapStatusToPolicyStage(status) === 'Backlog') {
            return { violations, sync };
        }

        const component = jiraClient.extractFirstComponent(issue);
        const currentAreaLabels = jiraClient.extractAreaLabels(issue);

        // Check if component is set
        if (!component) {
            violations.push('NO_COMPONENT');
            return { violations, sync };
        }

        // Get expected area label from mapping
        const expectedAreaLabel = this.componentAreaMapping[component];
        
        if (!expectedAreaLabel) {
            console.warn(`  ⚠️  Component "${component}" not in mapping`);
            return { violations, sync };
        }

        // Check if area label needs to be synced
        const hasExpectedArea = currentAreaLabels.includes(expectedAreaLabel);
        const hasOtherAreas = currentAreaLabels.some(label => label !== expectedAreaLabel);

        if (!hasExpectedArea || hasOtherAreas) {
            sync.shouldSync = true;
            
            // Add expected area label if missing
            if (!hasExpectedArea) {
                sync.labelsToAdd.push(expectedAreaLabel);
            }
            
            // Remove other area labels
            if (hasOtherAreas) {
                const labelsToRemove = currentAreaLabels.filter(label => label !== expectedAreaLabel);
                sync.labelsToRemove.push(...labelsToRemove);
            }
        }

        return { violations, sync };
    }

    getViolationLabels(issue) {
        const labels = issue.fields.labels || [];
        return labels.includes('compliance-violation') ? ['compliance-violation'] : [];
    }
}

module.exports = PolicyValidator;

