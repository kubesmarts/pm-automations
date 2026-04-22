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

            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`Error making request to ${url}:`, error.message);
            throw error;
        }
    }

    async fetchFilter(filterId) {
        console.log(`Fetching filter ${filterId}...`);
        return await this.makeRequest(`/rest/api/3/filter/${filterId}`);
    }

    async searchIssues(jql, startAt = 0, maxResults = 100) {
        const encodedJql = encodeURIComponent(jql);
        const fields = 'summary,key,status,priority,fixVersions,timetracking,worklog,assignee,labels,components';
        const endpoint = `/rest/api/3/search/jql?jql=${encodedJql}&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`;
        
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
        const fields = 'summary,key,status,priority,fixVersions,timetracking,worklog,assignee,labels,components';
        return await this.makeRequest(`/rest/api/3/issue/${issueKey}?fields=${fields}`);
    }

    async updateIssueLabels(issueKey, labelsToAdd, labelsToRemove) {
        const issue = await this.fetchIssue(issueKey);
        const currentLabels = this.extractLabels(issue);

        const newLabels = [
            ...currentLabels.filter(l => !labelsToRemove.includes(l)),
            ...labelsToAdd.filter(l => !currentLabels.includes(l))
        ];

        console.log(`Updating labels for ${issueKey}: +${labelsToAdd.length} -${labelsToRemove.length}`);
        return await this.makeRequest(`/rest/api/2/issue/${issueKey}`, 'PUT', { fields: { labels: newLabels } });
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
        const seconds = issue.fields.timetracking?.originalEstimateSeconds;
        return seconds > 0 ? issue.fields.timetracking.originalEstimate : null;
    }

    extractRemainingEstimate(issue) {
        const seconds = issue.fields.timetracking?.remainingEstimateSeconds;
        return seconds > 0 ? issue.fields.timetracking.remainingEstimate : null;
    }

    extractTimeSpent(issue) {
        const seconds = issue.fields.timetracking?.timeSpentSeconds;
        return seconds > 0 ? issue.fields.timetracking.timeSpent : null;
    }

    extractAssignee(issue) {
        return issue.fields.assignee?.displayName || null;
    }

    extractAssigneeAccountId(issue) {
        return issue.fields.assignee?.accountId || null;
    }

    buildComplianceCommentBody(violations, assigneeAccountId, assigneeDisplayName) {
        const violationText = violations.join(', ');
        const contentNodes = [];

        if (assigneeAccountId) {
            contentNodes.push({
                type: 'mention',
                attrs: { id: assigneeAccountId, text: `@${assigneeDisplayName}` }
            });
            contentNodes.push({ type: 'text', text: ' ' });
        }

        contentNodes.push({
            type: 'text',
            text: `Compliance violations detected: ${violationText}. Please review and resolve.`
        });

        return {
            version: 1,
            type: 'doc',
            content: [{ type: 'paragraph', content: contentNodes }]
        };
    }

    async upsertComplianceComment(issueKey, violations, assigneeAccountId, assigneeDisplayName) {
        const existing = await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment?maxResults=100&orderBy=-created`);
        const existingComment = existing.comments?.find(c =>
            JSON.stringify(c.body).includes('Compliance violations detected:')
        );

        const newBody = this.buildComplianceCommentBody(violations, assigneeAccountId, assigneeDisplayName);
        const violationText = violations.join(', ');

        if (existingComment) {
            const existingText = JSON.stringify(existingComment.body);
            if (existingText.includes(violationText)) {
                return { action: 'skipped' };
            }
            await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment/${existingComment.id}`, 'PUT', { body: newBody });
            return { action: 'updated' };
        }

        await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment`, 'POST', { body: newBody });
        return { action: 'created' };
    }

    extractAreaLabel(issue) {
        const labels = issue.fields.labels || [];
        const areaLabel = labels.find(label => label.startsWith('area/'));
        return areaLabel || null;
    }

    extractLabels(issue) {
        return issue.fields.labels || [];
    }

    extractComponents(issue) {
        return issue.fields.components?.map(c => c.name) || [];
    }

    extractFirstComponent(issue) {
        const components = this.extractComponents(issue);
        return components.length > 0 ? components[0] : null;
    }

    extractAreaLabels(issue) {
        const labels = issue.fields.labels || [];
        return labels.filter(label => label.startsWith('area/'));
    }
}

module.exports = JiraClient;

