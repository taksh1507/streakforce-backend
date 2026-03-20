const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Log = require('../models/Log');
const { getTodayCommitCount, getRecentActivity, getRepoInsights } = require('../services/githubService');

const router = express.Router();

/**
 * Derived analytics helpers
 */
const calculateStreak = (activity) => {
  let streak = 0;
  // Activity map is already sorted from oldest to newest from githubService
  // Reverse to get latest first for streak counting
  const sorted = [...activity].reverse();

  for (let day of sorted) {
    if (day.commits > 0) {
      streak++;
    } else {
      // If we're looking at today and it's 0, we don't break yet, 
      // but if we're looking at yest and it's 0, we break.
      const today = new Date().toISOString().split('T')[0];
      if (day.date === today && day.commits === 0) continue;
      break;
    }
  }
  return streak;
};

const getRecentCommitDate = (activity) => {
  const sorted = [...activity].reverse();
  const commitDay = sorted.find(day => day.commits > 0);
  return commitDay ? commitDay.date : 'Never';
};

/**
 * GET /dashboard/:userId
 * Gathers complete stats directly requested by the flutter frontend
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId || userId.length !== 24) {
      return res.status(400).json({ error: 'Valid Invalid ID string required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User does not exist.' });
    }

    // 1. Fetch data from GitHub
    const todayCommits = await getTodayCommitCount(user.username);
    const activityMap = await getRecentActivity(user.username, 30);
    const repoInsights = await getRepoInsights(user.username);

    // 2. Derive analytics from data
    const currentStreak = calculateStreak(activityMap);
    const lastCommitDate = getRecentCommitDate(activityMap);
    const currentHour = new Date().getHours();
    
    // Improved Risk Level Logic
    let riskLevel = 'SAFE';
    if (todayCommits === 0) {
      if (currentHour >= 21) {
        riskLevel = 'CRITICAL';
      } else if (currentHour >= 18) {
        riskLevel = 'AT_RISK';
      }
    } else {
      riskLevel = 'SAFE';
    }

    // AI Nudge Logic (Time-Aware + Streak Pressure)
    let nudgeTitle = "Keep it up!";
    let nudgeSubtitle = "Consistency builds mastery. Start pushing.";
    
    if (todayCommits > 0) {
      nudgeTitle = "Streak maintained.";
      nudgeSubtitle = "Good job. Consistency is the key to mastery.";
    } else {
      if (currentHour < 12) {
        nudgeTitle = "Morning push?";
        nudgeSubtitle = "Start early. Keep your streak alive.";
      } else if (currentHour >= 18) {
        nudgeTitle = `${currentStreak}-day streak at risk.`;
        nudgeSubtitle = "One commit saves it. Don't lose the momentum.";
      } else if (currentHour >= 21) {
        nudgeTitle = "CRITICAL: Midnight deadline.";
        nudgeSubtitle = "Less than 3 hours left. Save your streak!";
      }
    }

    // Weekly summary
    const last7Days = activityMap.slice(-7);
    const totalCommits = last7Days.reduce((sum, day) => sum + day.commits, 0);
    const activeDays = last7Days.filter(day => day.commits > 0).length;
    const missedDays = 7 - activeDays;

    // 4. Fetch latest 20 logs for the feed
    const logs = await Log.find({ userId })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    // Dynamically build the dashboard aggregation
    res.json({
      success: true,
      streak: currentStreak,
      commitsToday: todayCommits,
      riskLevel: riskLevel,
      streakMeta: {
        isAtRisk: riskLevel !== 'SAFE',
        daysAtStake: currentStreak
      },
      sync: {
        lastUpdated: "Just now",
        status: "up_to_date"
      },
      weeklySummary: {
        totalCommits: totalCommits,
        activeDays: activeDays,
        missedDays: missedDays
      },
      repoInsights: {
        mostActive: repoInsights.mostActive,
        lastUpdated: repoInsights.lastUpdated
      },
      logs: logs.map(l => ({
        type: l.type,
        message: l.message,
        time: l.timestamp,
      })),
      data: {
        user: {
          username: user.username,
          usual_commit_time: '8 PM',
        },
        streak: {
          current: currentStreak,
          status: riskLevel.toLowerCase(),
          last_commit: lastCommitDate
        },
        today_progress: {
          commits_done: todayCommits,
          commits_goal: 1,
          remaining_hours: 24 - new Date().getHours(),
        },
        activity: activityMap,
        nudge: {
          title: nudgeTitle,
          subtitle: nudgeSubtitle
        }
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error parsing dashboard aggregates.' });
  }
});

module.exports = router;
