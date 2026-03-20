const cron = require('node-cron');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Log = require('../models/Log');
const { getTodayCommitCount } = require('../services/githubService');
const { sendNotification } = require('../services/notificationService');

/**
 * Helper to generate personalized AI-style messages
 */
const generateSmartMessage = (streak, type) => {
  if (type === 'critical') {
    return `⚠️ ${streak}-day streak will break soon. Act now!`;
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

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      for (const user of users) {
        // 1. Tally live commits
        const commits = await getTodayCommitCount(user.username);
        
        // 2. Update Activity table
        await Activity.findOneAndUpdate(
          { userId: user._id, date: new Date(todayStr) },
          { commitCount: commits },
          { upsert: true }
        );

        // 3. Streak Increment Logic
        const lastCommitStr = user.lastCommitDate ? user.lastCommitDate.toISOString().split('T')[0] : null;
        if (commits > 0 && lastCommitStr !== todayStr) {
          user.currentStreak += 1;
          user.lastCommitDate = new Date();
          await user.save();
          
          await Log.create({
            userId: user._id,
            type: 'activity',
            message: 'Streak maintained!',
          });
        } 
        
        // 4. Streak Break Logic
        if (commits === 0 && lastCommitStr && lastCommitStr !== todayStr && lastCommitStr !== yesterdayStr) {
          if (user.currentStreak > 0) {
            const oldStreak = user.currentStreak;
            user.currentStreak = 0;
            await user.save();
            await Log.create({
              userId: user._id,
              type: 'system',
              message: `Streak broken! Lost ${oldStreak} days.`
            });
            if (user.fcmToken) {
              await sendNotification(user.fcmToken, 'Streak Broken 💔', `You lost your ${oldStreak}-day streak. Time to restart!`);
            }
          }
        }

        // 5. Smart Multi-Stage Notifications
        if (commits === 0 && user.fcmToken && user.currentStreak > 0) {
          const usualTime = user.usualCommitTime || 20;
          const reminderHour = usualTime - 2;
          const warningHour = usualTime;
          const criticalHour = usualTime + 2;

          let type = null;
          let title = "StreakForce AI";

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
            // Anti-Spam Check: Don't send the same type twice in one day
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
