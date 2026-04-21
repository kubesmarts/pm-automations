class LabelManager {
    constructor(jiraClient, policyValidator) {
        this.jiraClient = jiraClient;
        this.policyValidator = policyValidator;
    }

    async updateLabels(issue, currentViolations, dryRun = false) {
        const existingViolationLabels = this.policyValidator.getViolationLabels(issue);
        
        // Determine which labels to add and remove
        const labelsToAdd = currentViolations.filter(v => !existingViolationLabels.includes(v));
        const labelsToRemove = existingViolationLabels.filter(v => !currentViolations.includes(v));

        // If no changes needed, skip
        if (labelsToAdd.length === 0 && labelsToRemove.length === 0) {
            return {
                changed: false,
                labelsAdded: [],
                labelsRemoved: []
            };
        }

        // Log the changes
        if (labelsToAdd.length > 0) {
            console.log(`  Labels to add: ${labelsToAdd.join(', ')}`);
        }
        if (labelsToRemove.length > 0) {
            console.log(`  Labels to remove: ${labelsToRemove.join(', ')}`);
        }

        // Update labels in JIRA (unless dry run)
        if (!dryRun) {
            try {
                await this.jiraClient.updateIssueLabels(issue.key, labelsToAdd, labelsToRemove);
                console.log(`  ✓ Labels updated successfully`);
            } catch (error) {
                console.error(`  ✗ Error updating labels: ${error.message}`);
                throw error;
            }
        } else {
            console.log(`  [DRY RUN] Would update labels`);
        }

        return {
            changed: true,
            labelsAdded: labelsToAdd,
            labelsRemoved: labelsToRemove
        };
    }
}

module.exports = LabelManager;

