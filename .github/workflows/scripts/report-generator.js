const fs = require('fs');

class ReportGenerator {
    constructor() {
        this.report = {
            runDate: new Date().toISOString(),
            sources: {
                filters: [],
                jqlQueries: [],
                projects: []
            },
            totalIssues: 0,
            issuesWithViolations: 0,
            violations: [],
            summary: {
                byStatus: {},
                byViolationType: {}
            }
        };
    }

    setSources(filters, jqlQueries, projects) {
        if (filters) {
            this.report.sources.filters = filters.split(',').map(f => f.trim()).filter(f => f);
        }
        if (jqlQueries) {
            this.report.sources.jqlQueries = jqlQueries.split(';').map(q => q.trim()).filter(q => q);
        }
        if (projects) {
            this.report.sources.projects = projects.split(',').map(p => p.trim()).filter(p => p);
        }
    }

    addViolation(validationResult, labelUpdate, jiraBaseUrl) {
        const violation = {
            jiraKey: validationResult.issueKey,
            jiraUrl: `${jiraBaseUrl}/browse/${validationResult.issueKey}`,
            status: validationResult.status,
            policyStage: validationResult.policyStage,
            violations: validationResult.violations,
            labelsAdded: labelUpdate.labelsAdded || [],
            labelsRemoved: labelUpdate.labelsRemoved || [],
            fields: {
                area: validationResult.fields.area,
                priority: validationResult.fields.priority,
                fixVersions: validationResult.fields.fixVersions,
                originalEstimate: validationResult.fields.originalEstimate,
                remainingEstimate: validationResult.fields.remainingEstimate,
                timeSpent: validationResult.fields.timeSpent,
                assignee: validationResult.fields.assignee
            }
        };

        this.report.violations.push(violation);

        // Update summary by status
        if (!this.report.summary.byStatus[validationResult.status]) {
            this.report.summary.byStatus[validationResult.status] = {
                total: 0,
                violations: 0
            };
        }
        this.report.summary.byStatus[validationResult.status].violations++;

        // Update summary by violation type
        validationResult.violations.forEach(violationType => {
            if (!this.report.summary.byViolationType[violationType]) {
                this.report.summary.byViolationType[violationType] = 0;
            }
            this.report.summary.byViolationType[violationType]++;
        });
    }

    updateTotals(totalIssues, issuesWithViolations) {
        this.report.totalIssues = totalIssues;
        this.report.issuesWithViolations = issuesWithViolations;

        // Update total counts by status
        Object.keys(this.report.summary.byStatus).forEach(status => {
            // This is a simplified count - in a real scenario, you'd track this during processing
            this.report.summary.byStatus[status].total = this.report.summary.byStatus[status].violations;
        });
    }

    generateJiraFilterUrls(jiraBaseUrl) {
        const allViolationLabels = Object.keys(this.report.summary.byViolationType);
        
        this.report.jiraFilterUrls = {
            allViolations: `${jiraBaseUrl}/issues/?jql=${encodeURIComponent(`labels IN (${allViolationLabels.join(', ')})`)}`,
        };

        // Add individual filter URLs for each violation type
        allViolationLabels.forEach(violationType => {
            this.report.jiraFilterUrls[violationType] = `${jiraBaseUrl}/issues/?jql=${encodeURIComponent(`labels = ${violationType}`)}`;
        });
    }

    saveReport(filename = 'compliance-report.json') {
        fs.writeFileSync(filename, JSON.stringify(this.report, null, 2));
        console.log(`\nReport saved to ${filename}`);
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('COMPLIANCE CHECK SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Issues Checked: ${this.report.totalIssues}`);
        console.log(`Issues with Violations: ${this.report.issuesWithViolations}`);
        console.log(`Compliance Rate: ${((1 - this.report.issuesWithViolations / this.report.totalIssues) * 100).toFixed(1)}%`);
        
        if (this.report.issuesWithViolations > 0) {
            console.log('\nViolations by Type:');
            Object.entries(this.report.summary.byViolationType)
                .sort((a, b) => b[1] - a[1])
                .forEach(([type, count]) => {
                    console.log(`  ${type}: ${count}`);
                });

            console.log('\nViolations by Status:');
            Object.entries(this.report.summary.byStatus)
                .sort((a, b) => b[1].violations - a[1].violations)
                .forEach(([status, data]) => {
                    console.log(`  ${status}: ${data.violations} issues`);
                });
        }
        console.log('='.repeat(60) + '\n');
    }

    getReport() {
        return this.report;
    }
}

module.exports = ReportGenerator;

