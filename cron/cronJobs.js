const cron = require('node-cron');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Log = require('../models/Log');
const Task = require('../models/Task');
const FocusSession = require('../models/FocusSession');
const { getTodayCommitCount } = require('../services/githubService');
const { sendNotification } = require('../services/notificationService');

/**
 * Helper to generate personalized AI-style messages
 */
const generateSmartMessage = (streak, type) => {
  if (type === 'critical') {
    return `⚠️ ${streak}-day discipline streak will break soon. Act now!`;
  }
  if (type === 'warning') {
    return `You're ${streak} days consistent. Don't lose that momentum today.`;
  }
  return "Morning push? Start early and protect your streak.";
};

/**
 * Initializes all automated scheduled background jobs.
 */
function initCronJobs() {
  // Run every 30 minutes to check user status
  cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON] Running smart verification process...');
    try {
      const users = await User.find({});
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentHour = now.getHours();

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      for (const user of users) {
        // 1. Tally activity
        const commits = await getTodayCommitCount(user.username);
        const focusSessionCount = await FocusSession.countDocuments({
          userId: user._id,
          startTime: { $gte: startOfToday, $lte: endOfToday }
        });
        const completedTasksCount = await Task.countDocuments({
          userId: user._id,
          isCompleted: true,
          dueDate: { $gte: startOfToday, $lte: endOfToday }
        });

        const hasActivity = commits > 0 || focusSessionCount > 0 || completedTasksCount > 0;
        
        // 2. Update Activity table (GitHub only for now)
        await Activity.findOneAndUpdate(
          { userId: user._id, date: new Date(todayStr) },
          { commitCount: commits },
          { upsert: true }
        );

        // 3. Streak Increment Logic
        const lastActivityStr = user.lastCommitDate ? user.lastCommitDate.toISOString().split('T')[0] : null;
        if (hasActivity && lastActivityStr !== todayStr) {
          user.currentStreak += 1;
          user.lastCommitDate = new Date(); // Using this as lastActivityDate
          await user.save();
          
          await Log.create({
            userId: user._id,
            type: 'activity',
            message: 'Discipline streak maintained!',
          });
        } 
        
        // 4. Auto-Discipline Mode Switching (NEW)
        if (user.autoDiscipline) {
          const score = user.disciplineScore || 0;
          if (score < 40 && user.personalityMode !== 'savage') {
            user.personalityMode = 'savage';
            await Log.create({ userId: user._id, type: 'system', message: 'Auto-Discipline: Switched to SAVAGE mode (Low Score)' });
          } else if (score > 85 && user.currentStreak >= 5 && user.personalityMode !== 'chill') {
            user.personalityMode = 'chill';
            await Log.create({ userId: user._id, type: 'system', message: 'Auto-Discipline: Switched to CHILL mode (High Consistency)' });
          }
        }

        // 5. Streak Break Logic
        if (!hasActivity && lastActivityStr && lastActivityStr !== todayStr && lastActivityStr !== yesterdayStr) {
          if (user.currentStreak > 0) {
            const oldStreak = user.currentStreak;
            user.currentStreak = 0;
            await user.save();
            await Log.create({
              userId: user._id,
              type: 'system',
              message: `Streak broken! Lost ${oldStreak} days of discipline.`
            });
            if (user.fcmToken) {
              await sendNotification(user.fcmToken, 'Streak Broken 💔', `You lost your ${oldStreak}-day discipline streak. Time to restart!`);
            }
          }
        }

        // 6. Smart Multi-Stage Notifications
        if (!hasActivity && user.fcmToken && user.currentStreak > 0) {
          const usualTime = user.usualCommitTime || 20;
          const reminderHour = 10; // 10 AM
          const warningHour = 18; // 6 PM
          const criticalHour = 22; // 10 PM

          let type = null;
          let title = "Discipline OS";

          if (currentHour === reminderHour) {
            type = 'reminder';
            title = 'Morning Goal 🌅';
          } else if (currentHour === warningHour) {
            type = 'warning';
            title = 'Streak at Risk! 🔥';
          } else if (currentHour === criticalHour) {
            type = 'critical';
            title = '🚨 DEADLINE APPROACHING';
          }

          if (type) {
            // Anti-Spam Check
            const sentAtKey = `${todayStr}-${type}`;
            if (user.lastNotificationSentAt !== sentAtKey) {
              const body = generateSmartMessage(user.currentStreak, type);
              await sendNotification(user.fcmToken, title, body);
              
              user.lastNotificationSentAt = sentAtKey;
              await user.save();

              await Log.create({
                userId: user._id,
                type: type === 'critical' ? 'alert' : 'system',
                message: `Push notification sent: ${type}`
              });
            }
          }
        }
      }
      console.log(`[CRON] Verification completed for ${users.length} users.`);
    } catch (error) {
      console.error('[CRON] Scheduled task error:', error);
    }
  });
}

module.exports = {
  initCronJobs
};
