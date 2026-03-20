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
  const sorted = [...activity].reverse();

  for (let day of sorted) {
    if (day.commits > 0) {
      streak++;
    } else {
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

const getAiNudge = (commits, streak, hour, personality) => {
  const isDone = commits > 0;
  
  const nudges = {
    chill: {
      done: { title: "Chilling now.", subtitle: "Streak secured. You've earned a break." },
      risk: { title: "No pressure.", subtitle: "One commit keeps the engine warm." },
      critical: { title: "Quick push?", subtitle: "Almost midnight. Just a tiny fix?" }
    },
    coach: {
      done: { title: "Streak maintained.", subtitle: "Consistency is the key to mastery. Good job." },
      risk: { title: "Consistency check.", subtitle: "Your 3-day momentum is at stake. Save it." },
      critical: { title: "Deadline approaching.", subtitle: "Less than 3 hours left. Time to ship." }
    },
    savage: {
      done: { title: "Monster mode.", subtitle: "Another day dominated. Keep that fire burning." },
      risk: { title: "Don't be weak.", subtitle: "Your streak is dying. One commit or it's gone." },
      critical: { title: "CRITICAL: Midnight.", subtitle: "Tick tock. Save your streak or face the shame." }
    }
  };

  const p = nudges[personality] || nudges.coach;

  if (isDone) return p.done;
  if (hour >= 21) return p.critical;
  if (hour >= 18) return p.risk;
  
  // Default morning/afternoon
  return hour < 12 
    ? { title: "Morning mission.", subtitle: "Start early, ship fast." }
    : { title: "Daily discipline.", subtitle: "The goal is waiting. One commit is enough." };
};

/**
 * GET /dashboard/:userId
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId || userId.length !== 24) {
      return res.status(400).json({ error: 'Valid ID string required.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User does not exist.' });

    // 1. Fetch data from GitHub
    const todayCommits = await getTodayCommitCount(user.username);
    const activityMap = await getRecentActivity(user.username, 30);
    const repoInsights = await getRepoInsights(user.username);

    // 2. Intelligence Calculations
    const currentStreak = calculateStreak(activityMap);
    const lastCommitDate = getRecentCommitDate(activityMap);
    const now = new Date();
    const currentHour = now.getHours();
    
    // Deadline Timer Calculation
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const msLeft = endOfDay - now;
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
    const minsLeft = Math.floor((msLeft / (1000 * 60)) % 60);
    const timeLeftStr = `${hoursLeft}h ${minsLeft}m left`;

    // Consistency Score (Last 30 days)
    const activeDays30 = activityMap.filter(day => day.commits > 0).length;
    const consistencyScore = Math.round((activeDays30 / 30) * 100);

    // Risk Logic
    let riskLevel = 'SAFE';
    if (todayCommits === 0) {
      if (currentHour >= 21) riskLevel = 'CRITICAL';
      else if (currentHour >= 18) riskLevel = 'AT_RISK';
    }

    // AI Nudge
    const nudge = getAiNudge(todayCommits, currentStreak, currentHour, user.personalityMode || 'coach');

    // Goals & Missions progress logic
    const dailyProgress = Math.min(Math.round((todayCommits / (user.dailyGoal || 1)) * 100), 100);
    
    // Last 7 days summary
    const last7Days = activityMap.slice(-7);
    const totalCommits7 = last7Days.reduce((sum, day) => sum + day.commits, 0);
    const activeDays7 = last7Days.filter(day => day.commits > 0).length;

    // 4. Fetch latest 20 logs
    const logs = await Log.find({ userId }).sort({ timestamp: -1 }).limit(10).lean();

    res.json({
      success: true,
      data: {
        user: {
          username: user.username,
          mode: (user.personalityMode || 'coach').toUpperCase(),
          timezone: user.timezone || 'IST'
        },
        streak: {
          count: currentStreak,
          label: `${currentStreak} Day Streak`,
          pressureLabel: `${currentStreak} days at stake`,
          lastCommit: lastCommitDate,
          riskLevel: riskLevel,
          statusColor: riskLevel === 'SAFE' ? '#10B981' : (riskLevel === 'AT_RISK' ? '#F59E0B' : '#EF4444')
        },
        deadline: {
          timeLeft: timeLeftStr,
          rawSeconds: Math.floor(msLeft / 1000)
        },
        goals: {
          daily: {
            target: user.dailyGoal || 1,
            current: todayCommits,
            progress: dailyProgress,
            label: `${todayCommits} / ${user.dailyGoal || 1} commits`
          },
          weekly: {
            target: user.weeklyGoal || 5,
            current: activeDays7,
            label: `${activeDays7} / ${user.weeklyGoal || 5} days active`
          }
        },
        insights: {
          consistencyScore: consistencyScore,
          activeDays7: activeDays7,
          missedDays7: 7 - activeDays7,
          mostActiveRepo: repoInsights.mostActive,
          lastUpdated: repoInsights.lastUpdated
        },
        mission: user.activeMission || {
          title: "7-Day Consistency Challenge",
          currentDay: 0,
          totalDays: 7
        },
        activity: activityMap,
        nudge: nudge,
        syncStatus: "Just now",
        logs: logs.map(l => ({
          type: l.type,
          message: l.message,
          time: l.timestamp,
        }))
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error parsing dashboard aggregates.' });
  }
});

module.exports = router;
