const axios = require('axios');

// Build auth headers — uses Personal Access Token if set in .env for 5000 req/hr
function buildHeaders() {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Fetch commit count for a specific GitHub user on a given date (YYYY-MM-DD, UTC).
 * Uses the /search/commits API — extremely accurate and includes all branches.
 */
async function getCommitCountForDate(username, dateStr) {
  try {
    // Generate IST Day Boundary (12:00 AM IST to 11:59 PM IST)
    const baseDate = new Date(dateStr);
    const prevDay = new Date(baseDate);
    prevDay.setDate(prevDay.getDate() - 1);
    
    const startTimeStr = `${prevDay.toISOString().split('T')[0]}T18:30:00Z`;
    const endTimeStr = `${baseDate.toISOString().split('T')[0]}T18:30:00Z`;
    const queryRange = `${startTimeStr}..${endTimeStr}`;

    const url = `https://api.github.com/search/commits?q=author:${username}+committer-date:${queryRange}`;
    const response = await axios.get(url, { 
      headers: {
        ...buildHeaders(),
        ...{ 'Accept': 'application/vnd.github.cloak-preview' }
      } 
    });

    const count = response.data.total_count || 0;
    console.log(`[GitHub API] Fetched ${count} commits (IST Range: ${queryRange}) for ${username}`);
    return count;
    
  } catch (error) {
    console.error(`[GitHub Search] Error for ${username}:`, error.message);
    return 0;
  }
}

/**
 * Convenience wrapper — fetch today's commit count (IST aware).
 * Indian Standard Time (IST) starts at UTC Yesterday 18:30.
 */
async function getTodayCommitCount(username) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // To match IST, we search for the specific range of the local "Today"
  // For simplicity and matching the 14-count graph:
  // We'll search for the literal 'committer-date:YYYY-MM-DD' 
  // AND also the previous few hours just in case of TZ overlap
  return getCommitCountForDate(username, today);
}

/**
 * Fetch the last N days of commit activity for a user.
 * Returns array of { date: 'YYYY-MM-DD', commits: N }
 */
async function getRecentActivity(username, days = 30) {
  try {
    const url = `https://api.github.com/users/${username}/events?per_page=100`;
    const response = await axios.get(url, { headers: buildHeaders() });

    const events = response.data;
    if (!Array.isArray(events)) return [];

    const buckets = {};
    events.forEach(event => {
      if (event.type === 'PushEvent') {
        // Adjust UTC to IST (+5.5h) for local day grouping
        const utcDate = new Date(event.created_at);
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        const eventDate = istDate.toISOString().split('T')[0];
        
        const count = event.payload.size || (Array.isArray(event.payload.commits) ? event.payload.commits.length : 1);
        buckets[eventDate] = (buckets[eventDate] || 0) + count;
      }
    });

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push({ date: dateStr, commits: buckets[dateStr] || 0 });
    }
    return result;
  } catch (error) {
    console.error(`[GitHub] Error fetching activity:`, error.message);
    return [];
  }
}

/**
 * Extract repository insights (most active, last updated) from the latest events.
 */
async function getRepoInsights(username) {
  try {
    const url = `https://api.github.com/users/${username}/events?per_page=100`;
    const response = await axios.get(url, { headers: buildHeaders() });

    const events = response.data;
    if (!Array.isArray(events)) return { mostActive: 'N/A', lastUpdated: 'N/A' };

    const repoStats = {};
    let lastUpdatedRepo = 'N/A';

    events.forEach(event => {
      const repoName = event.repo ? event.repo.name.split('/')[1] : null;
      if (!repoName) return;

      // Track last updated repo (it's simply the first repo encountered in the events list)
      if (lastUpdatedRepo === 'N/A') {
        lastUpdatedRepo = repoName;
      }

      // Track commit counts for activity
      if (event.type === 'PushEvent') {
        const count = event.payload.size || (Array.isArray(event.payload.commits) ? event.payload.commits.length : 1);
        repoStats[repoName] = (repoStats[repoName] || 0) + count;
      }
    });

    // Find most active
    let mostActiveRepo = 'N/A';
    let maxCommits = 0;
    for (const [repo, count] of Object.entries(repoStats)) {
      if (count > maxCommits) {
        maxCommits = count;
        mostActiveRepo = repo;
      }
    }

    return {
      mostActive: mostActiveRepo,
      lastUpdated: lastUpdatedRepo
    };
  } catch (error) {
    console.error(`[GitHub] Error fetching repo insights:`, error.message);
    return { mostActive: 'N/A', lastUpdated: 'N/A' };
  }
}

/**
 * Check if a GitHub user exists
 */
async function userExists(username) {
  try {
    const url = `https://api.github.com/users/${username}`;
    await axios.get(url, { headers: buildHeaders() });
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getTodayCommitCount,
  getCommitCountForDate,
  getRecentActivity,
  getRepoInsights,
  userExists
};
