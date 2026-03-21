const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Log = require('../models/Log');
const Task = require('../models/Task');
const FocusSession = require('../models/FocusSession');
const { getTodayCommitCount, getRecentActivity, getRepoInsights } = require('../services/githubService');

const router = express.Router();

/**
 * Derived analytics helpers
 */
const calculateStreak = (activityMap, focusActivity, taskActivity, noZeroDayMode) => {
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  
  // Combine all activity into a daily map
  const dailyActive = {};
  
  // GitHub activity
  activityMap.forEach(day => {
    if (day.commits > 0) dailyActive[day.date] = true;
  });

  if (noZeroDayMode) {
    // Focus activity
    focusActivity.forEach(session => {
      const date = session.startTime.toISOString().split('T')[0];
      if (session.durationMinutes > 0) dailyActive[date] = true;
    });

    // Task activity
    taskActivity.forEach(task => {
      if (task.isCompleted && task.dueDate) {
        const date = task.dueDate.toISOString().split('T')[0];
        dailyActive[date] = true;
      }
    });
  }

  // Calculate streak from today backwards
  const sortedDates = Object.keys(dailyActive).sort().reverse();
  
  let checkDate = new Date();
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (dailyActive[dateStr]) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // If it's today and no activity yet, don't break the streak
      if (dateStr === today) {
        checkDate.setDate(checkDate.getDate() - 1);
        continue;
      }
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

const getAiNudge = (hasActivity, streak, hour, personality) => {
  const nudges = {
    chill: {
      done: { title: "Chilling now.", subtitle: "Streak secured. You've earned a break." },
      risk: { title: "No pressure.", subtitle: "One commit or focus session keeps the engine warm." },
      critical: { title: "Quick push?", subtitle: "Almost midnight. Just a tiny fix?" }
    },
    coach: {
      done: { title: "Streak maintained.", subtitle: "Consistency is the key to mastery. Good job." },
      risk: { title: "Consistency check.", subtitle: "Your momentum is at stake. Save it." },
      critical: { title: "Deadline approaching.", subtitle: "Less than 3 hours left. Time to ship." }
    },
    savage: {
      done: { title: "Monster mode.", subtitle: "Another day dominated. Keep that fire burning." },
      risk: { title: "Don't be weak.", subtitle: "Your streak is dying. Do something or it's gone." },
      critical: { title: "CRITICAL: Midnight.", subtitle: "Tick tock. Save your streak or face the shame." }
    }
  };

  const p = nudges[personality] || nudges.coach;

  if (hasActivity) return p.done;
  if (hour >= 21) return p.critical;
  if (hour >= 18) return p.risk;
  
  return hour < 12 
    ? { title: "Morning mission.", subtitle: "Start early, ship fast." }
    : { title: "Daily discipline.", subtitle: "The goal is waiting. One session is enough." };
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

    // 1. Fetch data from various sources
    const todayCommits = await getTodayCommitCount(user.username);
    const activityMap = await getRecentActivity(user.username, 30);
    const repoInsights = await getRepoInsights(user.username);

    // Fetch Tasks
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayTasks = await Task.find({
      userId,
      dueDate: { $gte: startOfToday, $lte: endOfToday }
    });

    // Fetch Focus Sessions
    const todayFocus = await FocusSession.find({
      userId,
      startTime: { $gte: startOfToday, $lte: endOfToday }
    });

    const totalFocusMins = todayFocus.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const tasksCompleted = todayTasks.filter(t => t.isCompleted).length;

    // 2. Intelligence Calculations
    const hasActivityToday = todayCommits > 0 || totalFocusMins > 0 || tasksCompleted > 0;
    
    const currentStreak = calculateStreak(activityMap, todayFocus, todayTasks, user.noZeroDayMode);
    const lastCommitDate = getRecentCommitDate(activityMap);
    const now = new Date();
    const currentHour = now.getHours();
    
    // Deadline Timer
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const msLeft = endOfDay - now;
    const timeLeftStr = `${Math.floor(msLeft / (1000 * 60 * 60))}h ${Math.floor((msLeft / (1000 * 60)) % 60)}m left`;

    // Discipline Score Calculation
    // 30% commits, 40% focus (goal 2h), 30% consistency (last 30 days)
    const activeDays30 = activityMap.filter(day => day.commits > 0).length;
    const consistencyScore = (activeDays30 / 30) * 30;
    const focusScore = Math.min((totalFocusMins / 120) * 40, 40);
    const commitScore = todayCommits > 0 ? 30 : 0;
    const disciplineScore = Math.round(consistencyScore + focusScore + commitScore);

    // Risk Logic
    let riskLevel = 'SAFE';
    if (!hasActivityToday) {
      if (currentHour >= 21) riskLevel = 'CRITICAL';
      else if (currentHour >= 18) riskLevel = 'AT_RISK';
    }

    // AI Nudge
    const nudge = getAiNudge(hasActivityToday, currentStreak, currentHour, user.personalityMode || 'coach');

    // Failure Impact (NEW)
    const failureImpact = {
      from: currentStreak,
      to: 0,
       isCritical: !hasActivityToday && currentHour >= 21,
       message: !hasActivityToday ? `DANGER: ${currentStreak} → 0 if missed.` : `SECURED: ${currentStreak} maintained.`
    };

    // AI Daily Plan (NEW)
    const aiPlan = user.aiPlan || {
      dailyMission: todayCommits > 0 ? "Commit detected. Next: 30m Deep Work." : "MISSION: 1 Commit + 30m Focus",
      recommendedDuration: 45
    };

    // Heatmap Story Mode (NEW - last 7 days details)
    const storyMode = activityMap.slice(-7).map(day => ({
      date: day.date,
      commits: day.commits,
      tasks: 0, // Mock for now
      focusMins: 0, // Mock for now
    }));

    res.json({
      success: true,
      data: {
        user: {
          username: user.username,
          mode: (user.personalityMode || 'coach').toUpperCase(),
          disciplineScore: disciplineScore,
          autoDiscipline: user.autoDiscipline
        },
        streak: {
          count: currentStreak,
          label: `${currentStreak} Day Streak`,
          riskLevel: riskLevel,
          statusColor: riskLevel === 'SAFE' ? '#10B981' : (riskLevel === 'AT_RISK' ? '#F59E0B' : '#EF4444'),
          failureImpact
        },
        deadline: {
          timeLeft: timeLeftStr,
          rawSeconds: Math.floor(msLeft / 1000),
          percentDayLeft: Math.round((msLeft / (24 * 60 * 60 * 1000)) * 100)
        },
        aiPlan,
        storyMode,
        deepWork: {
          todayMins: totalFocusMins,
          goalMins: 120,
          progress: Math.min(Math.round((totalFocusMins / 120) * 100), 100)
        },
        tasks: {
          total: todayTasks.length,
          completed: tasksCompleted,
          list: todayTasks
        },
        nudge: nudge,
        activity: activityMap,
        disciplineScore: disciplineScore
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error parsing dashboard aggregates.' });
  }
});

module.exports = router;
