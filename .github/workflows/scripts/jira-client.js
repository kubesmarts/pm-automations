const fetch = require('node-fetch');

class JiraClient {
    constructor(baseUrl, email, token) {
        this.baseUrl = baseUrl;
        this.auth = Buffer.from(`${email}:${token}`).toString('base64');
    }

    async makeRequest(endpoint, method = 'GET', body = null) {
        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Basic ${this.auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`JIRA API error (${response.status}): ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error making request to ${url}:`, error.message);
            throw error;
        }
    }

    async fetchFilter(filterId) {
        console.log(`Fetching filter ${filterId}...`);
        return await this.makeRequest(`/rest/api/2/filter/${filterId}`);
    }

    async searchIssues(jql, startAt = 0, maxResults = 100) {
        const encodedJql = encodeURIComponent(jql);
        const fields = 'key,status,priority,fixVersions,timetracking,worklog,assignee,labels';
        const endpoint = `/rest/api/2/search?jql=${encodedJql}&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`;
        
        console.log(`Searching issues with JQL: ${jql} (startAt: ${startAt})`);
        return await this.makeRequest(endpoint);
    }

    async fetchAllIssuesFromJql(jql) {
        const allIssues = [];
        let startAt = 0;
        const maxResults = 100;
        let total = 0;

        do {
            const result = await this.searchIssues(jql, startAt, maxResults);
            allIssues.push(...result.issues);
            total = result.total;
            startAt += maxResults;
        } while (startAt < total);

        console.log(`Fetched ${allIssues.length} issues from JQL`);
        return allIssues;
    }

    async fetchIssue(issueKey) {
        const fields = 'key,status,priority,fixVersions,timetracking,worklog,assignee,labels';
        return await this.makeRequest(`/rest/api/2/issue/${issueKey}?fields=${fields}`);
    }

    async updateIssueLabels(issueKey, labelsToAdd, labelsToRemove) {
        const update = {
            update: {
                labels: []
            }
        };

        labelsToAdd.forEach(label => {
            update.update.labels.push({ add: label });
        });

        labelsToRemove.forEach(label => {
            update.update.labels.push({ remove: label });
        });

        console.log(`Updating labels for ${issueKey}: +${labelsToAdd.length} -${labelsToRemove.length}`);
        return await this.makeRequest(`/rest/api/2/issue/${issueKey}`, 'PUT', update);
    }

    extractStatus(issue) {
        return issue.fields.status?.name || null;
    }

    extractPriority(issue) {
        return issue.fields.priority?.name || null;
    }

    extractFixVersions(issue) {
        return issue.fields.fixVersions?.map(v => v.name) || [];
    }

    extractOriginalEstimate(issue) {
        return issue.fields.timetracking?.originalEstimate || null;
    }

    extractRemainingEstimate(issue) {
        return issue.fields.timetracking?.remainingEstimate || null;
    }

    extractTimeSpent(issue) {
        return issue.fields.timetracking?.timeSpent || null;
    }

    extractAssignee(issue) {
        return issue.fields.assignee?.displayName || null;
    }

    extractAreaLabel(issue) {
        const labels = issue.fields.labels || [];
        const areaLabel = labels.find(label => label.startsWith('area/'));
        return areaLabel || null;
    }

    extractLabels(issue) {
        return issue.fields.labels || [];
    }
}

module.exports = JiraClient;

