class IssueDiscovery {
    constructor(jiraClient) {
        this.jiraClient = jiraClient;
    }

    async discoverIssues(filters, jqlQueries, projects) {
        const issueMap = new Map(); // Use Map to deduplicate by issue key

        // Process JIRA Filters
        if (filters) {
            console.log('\n=== Processing JIRA Filters ===');
            const filterIds = filters.split(',').map(id => id.trim()).filter(id => id);
            for (const filterId of filterIds) {
                try {
                    const issues = await this.fetchIssuesFromFilter(filterId);
                    issues.forEach(issue => issueMap.set(issue.key, issue));
                    console.log(`Filter ${filterId}: Added ${issues.length} issues`);
                } catch (error) {
                    console.error(`Error processing filter ${filterId}:`, error.message);
                }
            }
        }

        // Process JQL Queries
        if (jqlQueries) {
            console.log('\n=== Processing JQL Queries ===');
            const queries = jqlQueries.split(';').map(q => q.trim()).filter(q => q);
            for (let i = 0; i < queries.length; i++) {
                const jql = queries[i];
                try {
                    const issues = await this.fetchIssuesFromJql(jql);
                    issues.forEach(issue => issueMap.set(issue.key, issue));
                    console.log(`JQL Query ${i + 1}: Added ${issues.length} issues`);
                } catch (error) {
                    console.error(`Error processing JQL query "${jql}":`, error.message);
                }
            }
        }

        // Process JIRA Projects
        if (projects) {
            console.log('\n=== Processing JIRA Projects ===');
            const projectKeys = projects.split(',').map(p => p.trim()).filter(p => p);
            if (projectKeys.length > 0) {
                try {
                    const jql = `project IN (${projectKeys.join(',')}) AND status != Closed`;
                    const issues = await this.fetchIssuesFromJql(jql);
                    issues.forEach(issue => issueMap.set(issue.key, issue));
                    console.log(`Projects ${projectKeys.join(', ')}: Added ${issues.length} issues`);
                } catch (error) {
                    console.error(`Error processing projects ${projectKeys.join(', ')}:`, error.message);
                }
            }
        }

        const uniqueIssues = Array.from(issueMap.values());
        console.log(`\n=== Total Unique Issues: ${uniqueIssues.length} ===\n`);
        
        return uniqueIssues;
    }

    async fetchIssuesFromFilter(filterId) {
        const filter = await this.jiraClient.fetchFilter(filterId);
        const jql = filter.jql;
        return await this.jiraClient.fetchAllIssuesFromJql(jql);
    }

    async fetchIssuesFromJql(jql) {
        return await this.jiraClient.fetchAllIssuesFromJql(jql);
    }
}

module.exports = IssueDiscovery;

