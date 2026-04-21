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
            
            // Validate issue
            const validationResult = policyValidator.validateIssue(issue, jiraClient);
            console.log(`  Status: ${validationResult.status} (${validationResult.policyStage})`);
            
            if (validationResult.violations.length > 0) {
                console.log(`  Violations: ${validationResult.violations.join(', ')}`);
                issuesWithViolations++;

                // Update labels
                try {
                    const labelUpdate = await labelManager.updateLabels(
                        issue,
                        validationResult.violations,
                        config.dryRun
                    );

                    // Add to report
                    reportGenerator.addViolation(validationResult, labelUpdate, config.jiraBaseUrl);
                } catch (error) {
                    console.error(`  Error updating labels: ${error.message}`);
                    // Continue processing other issues
                }
            } else {
                console.log(`  ✓ No violations`);
                
                // Remove any existing violation labels
                try {
                    const labelUpdate = await labelManager.updateLabels(
                        issue,
                        [],
                        config.dryRun
                    );
                    
                    if (labelUpdate.changed) {
                        console.log(`  Removed resolved violation labels`);
                    }
                } catch (error) {
                    console.error(`  Error removing labels: ${error.message}`);
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

