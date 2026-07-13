const axios = require('axios');

const LINEAR_API_BASE = 'https://api.linear.app/graphql';
const LABEL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Module-scope label cache: { labels: [{ id, name }], fetchedAt }
let labelCache = null;

const CATEGORY_LABEL_NAMES = {
  bug: 'Bug',
  feature_request: 'Feature Request',
  ui_ux: 'UI/UX',
  performance: 'Performance',
  general: 'General',
  other: 'Other'
};

class LinearService {
  /**
   * Execute a GraphQL request against the Linear API
   */
  static async graphql(query, variables = {}) {
    const response = await axios.post(
      LINEAR_API_BASE,
      { query, variables },
      {
        headers: {
          // Personal API keys are passed raw (no Bearer prefix)
          Authorization: process.env.LINEAR_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.errors?.length) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data;
  }

  /**
   * Fetch team labels with a 1-hour TTL cache. Non-fatal: returns [] on failure.
   */
  static async getTeamLabels() {
    if (labelCache && Date.now() - labelCache.fetchedAt < LABEL_CACHE_TTL_MS) {
      return labelCache.labels;
    }

    try {
      const data = await this.graphql(
        `query TeamLabels($teamId: String!) {
          team(id: $teamId) {
            labels { nodes { id name } }
          }
        }`,
        { teamId: process.env.LINEAR_TEAM_ID }
      );
      const labels = data?.team?.labels?.nodes || [];
      labelCache = { labels, fetchedAt: Date.now() };
      return labels;
    } catch (error) {
      console.error('Failed to fetch Linear labels (continuing without):', error.message);
      return [];
    }
  }

  /**
   * Find a label id matching the feedback category (case-insensitive), or null.
   */
  static async findLabelIdForCategory(category) {
    const targetName = CATEGORY_LABEL_NAMES[category] || category;
    const labels = await this.getTeamLabels();
    const match = labels.find(
      (label) => label.name.toLowerCase() === targetName.toLowerCase()
    );
    return match?.id || null;
  }

  /**
   * Create a Linear issue from a site feedback submission.
   * Throws on failure — callers are expected to catch and log.
   */
  static async createFeedbackIssue({ rating, feedbackText, category, page, userAgent, user }) {
    // Include the submitter so a recovered log line can be attributed and followed up
    const payload = { rating, feedbackText, category, page, userAgent, user: user?.email || user?.id };

    try {
      if (!process.env.LINEAR_API_KEY || !process.env.LINEAR_TEAM_ID) {
        throw new Error('LINEAR_API_KEY / LINEAR_TEAM_ID not configured');
      }

      const ratingEmoji = rating === 'thumbs_up' ? '👍' : '👎';
      const title = `[Feedback][${category}] ${ratingEmoji} ${page || 'unknown page'}`;

      const description = [
        `**Rating:** ${ratingEmoji} ${rating}`,
        `**Category:** ${category}`,
        `**Page:** ${page || 'unknown'}`,
        `**Submitted by:** ${user?.name || 'unknown'} (${user?.email || 'no email'})`,
        `**Submitted at:** ${new Date().toISOString()}`,
        `**User agent:** ${userAgent || 'unknown'}`,
        '',
        '---',
        '',
        feedbackText ? feedbackText : '_No feedback text provided._'
      ].join('\n');

      const labelId = await this.findLabelIdForCategory(category);

      if (!process.env.LINEAR_FEEDBACK_PROJECT_ID) {
        console.warn(
          'LINEAR_FEEDBACK_PROJECT_ID not set — feedback issue will be created without a project'
        );
      }

      const input = {
        teamId: process.env.LINEAR_TEAM_ID,
        title,
        description,
        ...(labelId ? { labelIds: [labelId] } : {}),
        // Route feedback into the "Feedback Inbox" project when configured
        ...(process.env.LINEAR_FEEDBACK_PROJECT_ID
          ? { projectId: process.env.LINEAR_FEEDBACK_PROJECT_ID }
          : {})
      };

      const issueCreateMutation = `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { identifier url }
        }
      }`;

      let data;
      try {
        data = await this.graphql(issueCreateMutation, { input });
      } catch (error) {
        // A stale/invalid project id must not lose the feedback — retry without it
        if (!input.projectId) throw error;
        console.error(
          'Linear issueCreate failed with projectId, retrying without it:',
          error.message
        );
        const { projectId, ...inputWithoutProject } = input;
        data = await this.graphql(issueCreateMutation, { input: inputWithoutProject });
      }

      if (!data?.issueCreate?.success) {
        throw new Error('Linear issueCreate returned success=false');
      }

      const issue = data.issueCreate.issue;
      console.log(`Feedback → Linear issue created: ${issue.identifier} (${issue.url})`);
      return issue;
    } catch (error) {
      console.error(
        'Linear issue creation failed:',
        error.response?.data || error.message,
        JSON.stringify(payload)
      );
      throw error;
    }
  }
}

module.exports = LinearService;
