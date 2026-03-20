const express = require('express');
const User = require('../models/User');
const Log = require('../models/Log');

const router = express.Router();

/**
 * POST /auth/login
 * Create or Fetch a User based totally on their GitHub login
 */
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Upsert equivalent functionality with GitHub validation
    let user = await User.findOne({ username });
    
    if (!user) {
      // 1. Verify username exists on GitHub first
      const { userExists } = require('../services/githubService');
      const exists = await userExists(username);
      
      if (!exists) {
        return res.status(404).json({ error: 'GitHub user not found. Please enter a valid username.' });
      }

      user = new User({ username });
      await user.save();
      
      // Seed a welcome log
      await Log.create({
        userId: user._id,
        type: 'system',
        message: 'Account initialized and tracked successfully.'
      });
    }

    // In a real OAuth flow we'd return a JWT
    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

/**
 * POST /auth/save-token
 * Store the FCM token for a user
 */
router.post('/save-token', async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    if (!userId || !fcmToken) {
      return res.status(400).json({ error: 'UserId and fcmToken required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.fcmToken = fcmToken;
    await user.save();

    res.json({ success: true, message: 'Token saved successfully' });
  } catch (error) {
    console.error('Token save error:', error);
    res.status(500).json({ error: 'Server error saving token' });
  }
});

/**
 * GET /auth/profile/:userId
 * Fetch user profile data
 */
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      success: true,
      profile: {
        username: user.username,
        github_url: `github.com/${user.username}`,
        connected: true,
        timezone: user.timezone || 'UTC',
        sessions: 1, // Simplified for now
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

/**
 * GET /auth/test-push/:userId
 * Force a test notification (TEMPORARY FOR TESTING)
 */
const { sendNotification } = require('../services/notificationService');
router.get('/test-push/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !user.fcmToken) {
      return res.status(404).json({ error: 'User or FCM token not found' });
    }

    await sendNotification(
      user.fcmToken,
      '🔥 StreakForce Test',
      'Test notification from StreakForce AI 🚀'
    );

    res.json({ success: true, message: 'Test notification sent!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
