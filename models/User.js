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
  
  // NEW Intelligent Features
  personalityMode: {
    type: String,
    enum: ['chill', 'coach', 'savage'],
    default: 'coach',
  },
  dailyGoal: {
    type: Number,
    default: 1, // Number of commits per day
  },
  weeklyGoal: {
    type: Number,
    default: 5, // Number of active days per week
  },
  activeMission: {
    title: { type: String, default: "7-Day Consistency Challenge" },
    currentDay: { type: Number, default: 0 },
    totalDays: { type: Number, default: 7 },
  },

  disciplineScore: {
    type: Number,
    default: 0,
  },
  skillProgress: [{
    skill: String,
    level: Number,
    daysConsistent: Number,
  }],
  streaks: {
    coding: { type: Number, default: 0 },
    focus: { type: Number, default: 0 },
    learning: { type: Number, default: 0 },
  },
  noZeroDayMode: {
    type: Boolean,
    default: true,
  },
  autoDiscipline: {
    type: Boolean,
    default: true,
  },
  aiPlan: {
    dailyMission: { type: String, default: "1 commit + 30m focus" },
    tasks: [{ title: String, completed: { type: Boolean, default: false } }],
  },
  distractionAlerts: {
    type: Number,
    default: 0,
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
