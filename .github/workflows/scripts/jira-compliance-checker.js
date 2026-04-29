const JiraClient = require('./jira-client');
const IssueDiscovery = require('./issue-discovery');
const PolicyValidator = require('./policy-validator');
const LabelManager = require('./label-manager');
const ReportGenerator = require('./report-generator');

async function main() {
    console.log('='.repeat(60));
    console.log('JIRA ISSUES COMPLIANCE CHECKER');
    console.log('='.repeat(60));
    console.log(`Run Date: ${new Date().toISOString()}`);
    
    // Get configuration from environment variables
    const config = {
        jiraBaseUrl: process.env.JIRA_BASE_URL,
        jiraEmail: process.env.JIRA_EMAIL,
        jiraToken: process.env.JIRA_TOKEN,
        jiraFilters: process.env.JIRA_FILTERS,
        jiraJql: process.env.JIRA_JQL,
        jiraProjects: process.env.JIRA_PROJECTS,
        dryRun: process.env.DRY_RUN === 'true'
    };

    // Validate required configuration
    if (!config.jiraBaseUrl || !config.jiraEmail || !config.jiraToken) {
        console.error('ERROR: Missing required configuration:');
        if (!config.jiraBaseUrl) console.error('  - JIRA_BASE_URL');
        if (!config.jiraEmail) console.error('  - JIRA_EMAIL');
        if (!config.jiraToken) console.error('  - JIRA_TOKEN');
        process.exit(1);
    }

    // Check if at least one discovery method is configured
    if (!config.jiraFilters && !config.jiraJql && !config.jiraProjects) {
        console.error('ERROR: At least one of JIRA_FILTERS, JIRA_JQL, or JIRA_PROJECTS must be configured');
        process.exit(1);
    }

    console.log('\nConfiguration:');
    console.log(`  JIRA Base URL: ${config.jiraBaseUrl}`);
    console.log(`  JIRA Email: ${config.jiraEmail}`);
    console.log(`  JIRA Filters: ${config.jiraFilters || 'Not configured'}`);
    console.log(`  JIRA JQL: ${config.jiraJql || 'Not configured'}`);
    console.log(`  JIRA Projects: ${config.jiraProjects || 'Not configured'}`);
    console.log(`  Dry Run: ${config.dryRun}`);
    console.log('');

    try {
        // Initialize components
        const jiraClient = new JiraClient(config.jiraBaseUrl, config.jiraEmail, config.jiraToken);
        const issueDiscovery = new IssueDiscovery(jiraClient);
        const policyValidator = new PolicyValidator();
        const labelManager = new LabelManager(jiraClient, policyValidator);
        const reportGenerator = new ReportGenerator();

        // Set report sources
        reportGenerator.setSources(config.jiraFilters, config.jiraJql, config.jiraProjects);

        // Discover issues
        console.log('Starting issue discovery...\n');
        const issues = await issueDiscovery.discoverIssues(
            config.jiraFilters,
            config.jiraJql,
            config.jiraProjects
        );

        if (issues.length === 0) {
            console.log('No issues found. Exiting.');
            reportGenerator.updateTotals(0, 0);
            reportGenerator.saveReport();
            return;
        }

        // Process each issue
        console.log('Processing issues for compliance...\n');
        let issuesWithViolations = 0;

        for (const issue of issues) {
            console.log(`\nProcessing ${issue.key}: ${issue.fields.summary}`);

            // Skip CLOSED tickets whose resolution is not Done (Duplicate, Won't Fix, Obsolete, etc.)
            if (policyValidator.isSkippedIssue(issue, jiraClient)) {
                const resolution = jiraClient.extractResolution(issue);
                console.log(`  Skipped (CLOSED / ${resolution}) — no compliance check needed`);

                if (!config.dryRun) {
                    await labelManager.updateLabels(issue, [], false, { shouldSync: false, labelsToAdd: [], labelsToRemove: [] });
                    try {
                        const result = await jiraClient.deleteComplianceComment(issue.key);
                        if (result.action === 'deleted') {
                            console.log(`  ✓ Stale compliance comment removed`);
                        }
                    } catch (error) {
                        console.log(`  ⚠️  Comment cleanup failed: ${error.message}`);
                    }
                }
                continue;
            }

            // Validate issue
            const validationResult = policyValidator.validateIssue(issue, jiraClient);
            console.log(`  Status: ${validationResult.status} (${validationResult.policyStage})`);

            // Auto-clear remaining estimate for Done issues
            if (!config.dryRun && validationResult.policyStage === 'Done' && validationResult.fields.remainingEstimate) {
                try {
                    await jiraClient.clearRemainingEstimate(issue.key, validationResult.fields.originalEstimate);
                    console.log(`  ✓ Remaining estimate auto-cleared`);
                    validationResult.violations = validationResult.violations.filter(v => v !== 'REMAINING_WORK_NOT_CLEARED');
                } catch (error) {
                    console.log(`  ⚠️  Could not clear remaining estimate: ${error.message}`);
                }
            }

            if (validationResult.violations.length > 0) {
                console.log(`  Violations: ${validationResult.violations.join(', ')}`);
                issuesWithViolations++;

                // Update labels (errors handled gracefully inside labelManager)
                const labelUpdate = await labelManager.updateLabels(
                    issue,
                    ['compliance-alerts'],
                    config.dryRun,
                    validationResult.componentAreaSync
                );

                // Add to report (including any errors)
                reportGenerator.addViolation(validationResult, labelUpdate, config.jiraBaseUrl);

                // Log if label update failed
                if (labelUpdate.error) {
                    console.log(`  ⚠️  Label update skipped due to JIRA restrictions`);
                }

                // Upsert compliance comment (create on first detection, update if violations changed)
                if (!config.dryRun) {
                    const assigneeAccountId = jiraClient.extractAssigneeAccountId(issue);
                    const assigneeDisplayName = jiraClient.extractAssignee(issue);
                    try {
                        const result = await jiraClient.upsertComplianceComment(issue.key, validationResult.violations, assigneeAccountId, assigneeDisplayName);
                        if (result.action === 'created') {
                            console.log(`  ✓ Comment added${assigneeDisplayName ? ` (notified ${assigneeDisplayName})` : ''}`);
                        } else if (result.action === 'updated') {
                            console.log(`  ✓ Comment updated with new violations`);
                        } else {
                            console.log(`  ℹ  Comment unchanged, skipped`);
                        }
                    } catch (error) {
                        console.log(`  ⚠️  Comment failed: ${error.message}`);
                    }
                }
            } else {
                console.log(`  ✓ No violations`);
                
                // Remove any existing violation labels and sync area labels if needed
                const labelUpdate = await labelManager.updateLabels(
                    issue,
                    [],
                    config.dryRun,
                    validationResult.componentAreaSync
                );
                
                if (labelUpdate.changed && !labelUpdate.error) {
                    console.log(`  Removed resolved violation labels or synced area labels`);
                } else if (labelUpdate.error) {
                    console.log(`  ⚠️  Label update skipped due to JIRA restrictions`);
                }

                // Delete compliance comment when all violations are resolved
                if (!config.dryRun) {
                    try {
                        const result = await jiraClient.deleteComplianceComment(issue.key);
                        if (result.action === 'deleted') {
                            console.log(`  ✓ Compliance comment deleted (violations resolved)`);
                        } else if (result.action === 'permission_denied') {
                            console.log(`  ⚠️  Cannot delete comment (permission denied)`);
                        }
                    } catch (error) {
                        console.log(`  ⚠️  Comment deletion failed: ${error.message}`);
                    }
                }
            }
        }

        // Finalize report
        reportGenerator.updateTotals(issues.length, issuesWithViolations);
        reportGenerator.generateJiraFilterUrls(config.jiraBaseUrl);
        reportGenerator.printSummary();
        reportGenerator.saveReport();

        // Exit with error code if violations found (for CI/CD integration)
        if (issuesWithViolations > 0) {
            console.log(`⚠️  Found ${issuesWithViolations} issues with violations`);
            process.exit(0); // Don't fail the workflow, just report
        } else {
            console.log('✓ All issues are compliant!');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the main function
main();

