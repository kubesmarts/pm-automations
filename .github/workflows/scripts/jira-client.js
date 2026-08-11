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

    async searchIssues(jql, startAt = 0, maxResults = 1000) {
        const encodedJql = encodeURIComponent(jql);
        const fields = 'summary,key,status,resolution,priority,fixVersions,timetracking,worklog,assignee,labels,components,project,issuetype,parent,updated,aggregatetimeoriginalestimate,aggregatetimespent,aggregatetimeestimate';
        const endpoint = `/rest/api/3/search/jql?jql=${encodedJql}&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`;

        console.log(`Searching issues with JQL: ${jql} (startAt: ${startAt})`);
        return await this.makeRequest(endpoint);
    }

    async fetchAllIssuesFromJql(jql) {
        const allIssues = [];
        let startAt = 0;
        // Use 1000 (Jira Cloud maximum) to avoid a confirmed API bug: queries with NOT IN
        // and >100 results return isLast:false indefinitely, repeating the same first page
        // regardless of startAt. A page size of 1000 fetches typical filter results in one
        // request, bypassing the bug entirely.
        const maxResults = 1000;
        let isLast = false;

        do {
            const result = await this.searchIssues(jql, startAt, maxResults);
            allIssues.push(...result.issues);
            isLast = result.isLast === true || result.issues.length < maxResults;
            startAt += maxResults;
        } while (!isLast);

        console.log(`Fetched ${allIssues.length} issues from JQL`);
        return allIssues;
    }

    async fetchAllIssuesFromJqlWithSplit(jql, projectKey) {
        console.log(`Using key-prefix split workaround for project ${projectKey}`);
        const allIssues = [];
        const issueKeys = new Set(); // Track unique issue keys to avoid duplicates

        // Split by key prefix 0-9 to work around JIRA API pagination bug
        for (let digit = 0; digit <= 9; digit++) {
            const splitJql = `${jql} AND key ~ "${projectKey}-${digit}*"`;
            console.log(`  Fetching issues with key prefix ${projectKey}-${digit}*`);
            
            const issues = await this.fetchAllIssuesFromJql(splitJql);
            
            // Add only unique issues
            let addedCount = 0;
            for (const issue of issues) {
                if (!issueKeys.has(issue.key)) {
                    issueKeys.add(issue.key);
                    allIssues.push(issue);
                    addedCount++;
                }
            }
            
            console.log(`    Found ${issues.length} issues, added ${addedCount} unique`);
        }

        console.log(`Total unique issues fetched with split: ${allIssues.length}`);
        return allIssues;
    }

    async fetchIssue(issueKey) {
        const fields = 'summary,key,status,resolution,priority,fixVersions,timetracking,worklog,assignee,labels,components';
        return await this.makeRequest(`/rest/api/3/issue/${issueKey}?fields=${fields}`);
    }

    /**
     * Fetch linked pull requests for a JIRA issue via the dev-status API.
     * Returns an array of PR objects: { id, title, url, status, state }.
     * - status: 'OPEN' | 'MERGED' | 'DECLINED' (as returned by JIRA)
     * Returns an empty array when the API is unavailable or no PRs are linked.
     */
    async fetchLinkedPullRequests(issueId) {
        try {
            const endpoint = `/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=pullrequest`;
            const data = await this.makeRequest(endpoint);
            const repos = data?.detail?.[0]?.pullRequests ?? [];
            return repos.map(pr => ({
                id: pr.id,
                title: pr.name,
                url: pr.url,
                status: pr.status  // 'OPEN', 'MERGED', 'DECLINED'
            }));
        } catch (error) {
            console.warn(`  ⚠️  Could not fetch linked PRs for issue ${issueId}: ${error.message}`);
            return [];
        }
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

    extractResolution(issue) {
        return issue.fields.resolution?.name || null;
    }

    extractPriority(issue) {
        return issue.fields.priority?.name || null;
    }

    extractFixVersions(issue) {
        return issue.fields.fixVersions?.map(v => v.name) || [];
    }

    extractOriginalEstimate(issue) {
        const seconds = issue.fields.timetracking?.originalEstimateSeconds;
        if (seconds === undefined || seconds === null) return null;
        return seconds > 0 ? issue.fields.timetracking.originalEstimate : '0m';
    }

    extractRemainingEstimate(issue) {
        const seconds = issue.fields.timetracking?.remainingEstimateSeconds;
        return seconds > 0 ? issue.fields.timetracking.remainingEstimate : null;
    }

    extractTimeSpent(issue) {
        const seconds = issue.fields.timetracking?.timeSpentSeconds;
        if (seconds === undefined || seconds === null) return null;
        return seconds > 0 ? issue.fields.timetracking.timeSpent : 0;
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

    async clearRemainingEstimate(issueKey, originalEstimate) {
        return await this.makeRequest(`/rest/api/2/issue/${issueKey}`, 'PUT', {
            fields: { timetracking: { originalEstimate: originalEstimate || '0h', remainingEstimate: '0h' } }
        });
    }

    /**
     * Extract compliance alert codes from the latest compliance checker comment.
     * Returns a comma-separated string of codes (e.g. "NO_ESTIMATE, NO_REMAINING_WORK"),
     * or an empty string if no compliance comment exists.
     * The comment body format is:
     *   "Compliance violations detected: <codes>. Please review and resolve."
     */
    async extractComplianceAlerts(issueKey) {
        try {
            const existing = await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment?maxResults=100&orderBy=-created`);
            const comment = existing.comments?.find(c =>
                JSON.stringify(c.body).includes('Compliance violations detected:')
            );
            if (!comment) return '';

            // Walk the ADF document to extract all text nodes
            const fullText = this._extractTextFromADF(comment.body);
            const match = fullText.match(/Compliance violations detected:\s*(.+?)\.\s*Please review and resolve/);
            return match ? match[1].trim() : '';
        } catch (error) {
            console.warn(`Warning: Could not fetch compliance alerts for ${issueKey}: ${error.message}`);
            return '';
        }
    }

    /**
     * Recursively extract plain text from an Atlassian Document Format (ADF) node.
     */
    _extractTextFromADF(node) {
        if (!node) return '';
        if (node.type === 'text') return node.text || '';
        if (Array.isArray(node.content)) {
            return node.content.map(child => this._extractTextFromADF(child)).join('');
        }
        return '';
    }

    async deleteComplianceComment(issueKey) {
        const existing = await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment?maxResults=100&orderBy=-created`);
        const existingComment = existing.comments?.find(c =>
            JSON.stringify(c.body).includes('Compliance violations detected:')
        );

        if (existingComment) {
            try {
                await this.makeRequest(`/rest/api/3/issue/${issueKey}/comment/${existingComment.id}`, 'DELETE');
                return { action: 'deleted', commentId: existingComment.id };
            } catch (error) {
                // Handle permission errors gracefully
                if (error.message.includes('permission')) {
                    return { action: 'permission_denied', commentId: existingComment.id, error: error.message };
                }
                throw error;
            }
        }

        return { action: 'not_found' };
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

