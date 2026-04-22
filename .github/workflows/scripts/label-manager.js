class LabelManager {
    constructor(jiraClient, policyValidator) {
        this.jiraClient = jiraClient;
        this.policyValidator = policyValidator;
    }

    async updateLabels(issue, currentViolations, dryRun = false, componentAreaSync = null) {
        const existingViolationLabels = this.policyValidator.getViolationLabels(issue);
        
        // Determine which violation labels to add and remove
        const labelsToAdd = currentViolations.filter(v => !existingViolationLabels.includes(v));
        const labelsToRemove = existingViolationLabels.filter(v => !currentViolations.includes(v));

        // Add Component/Area sync labels if needed
        if (componentAreaSync && componentAreaSync.shouldSync) {
            labelsToAdd.push(...componentAreaSync.labelsToAdd);
            labelsToRemove.push(...componentAreaSync.labelsToRemove);
            
            if (componentAreaSync.labelsToAdd.length > 0 || componentAreaSync.labelsToRemove.length > 0) {
                console.log(`  Component/Area sync needed:`);
                if (componentAreaSync.labelsToAdd.length > 0) {
                    console.log(`    Area labels to add: ${componentAreaSync.labelsToAdd.join(', ')}`);
                }
                if (componentAreaSync.labelsToRemove.length > 0) {
                    console.log(`    Area labels to remove: ${componentAreaSync.labelsToRemove.join(', ')}`);
                }
            }
        }

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
                return {
                    changed: true,
                    labelsAdded: labelsToAdd,
                    labelsRemoved: labelsToRemove,
                    error: null
                };
            } catch (error) {
                // Handle errors gracefully like sync-project-reporting-metrics workflow
                console.error(`  ✗ Warning: Label update failed: ${error.message}`);
                return {
                    changed: false,
                    labelsAdded: [],
                    labelsRemoved: [],
                    error: error.message
                };
            }
        } else {
            console.log(`  [DRY RUN] Would update labels`);
        }

        return {
            changed: true,
            labelsAdded: labelsToAdd,
            labelsRemoved: labelsToRemove,
            error: null
        };
    }
}

module.exports = LabelManager;

