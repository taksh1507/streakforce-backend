const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  currentStreak: {
    type: Number,
    default: 0,
  },
  lastCommitDate: {
    type: Date,
    default: null,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  fcmToken: {
    type: String,
    default: null,
  },
  usualCommitTime: {
    type: Number,
    default: 20, // Default to 8 PM
  },
  lastNotificationSentAt: {
    type: String, // YYYY-MM-DD-HH format for granular tracking
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('User', userSchema);
