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

    extractProjectKey(jql) {
        // Try to extract project key from JQL
        // Matches: project=KEY or project = KEY or project IN (KEY1, KEY2)
        const match = jql.match(/project\s*(?:=|IN)\s*(?:\()?([A-Z][A-Z0-9_-]*)/i);
        return match ? match[1] : null;
    }

    shouldUseSplitWorkaround(jql) {
        // Use split workaround for complex queries with NOT IN or multiple conditions
        // that might trigger JIRA API pagination bug
        return jql.includes('NOT IN') ||
               (jql.includes('AND') && jql.length > 100);
    }

    async fetchIssuesFromFilter(filterId) {
        const filter = await this.jiraClient.fetchFilter(filterId);
        const jql = filter.jql;
        
        // Check if we should use the split workaround
        if (this.shouldUseSplitWorkaround(jql)) {
            const projectKey = this.extractProjectKey(jql);
            if (projectKey) {
                console.log(`Filter ${filterId} uses complex JQL, applying key-prefix split workaround`);
                return await this.jiraClient.fetchAllIssuesFromJqlWithSplit(jql, projectKey);
            }
        }
        
        return await this.jiraClient.fetchAllIssuesFromJql(jql);
    }

    async fetchIssuesFromJql(jql) {
        // Check if we should use the split workaround
        if (this.shouldUseSplitWorkaround(jql)) {
            const projectKey = this.extractProjectKey(jql);
            if (projectKey) {
                console.log(`JQL uses complex query, applying key-prefix split workaround`);
                return await this.jiraClient.fetchAllIssuesFromJqlWithSplit(jql, projectKey);
            }
        }
        
        return await this.jiraClient.fetchAllIssuesFromJql(jql);
    }
}

module.exports = IssueDiscovery;

