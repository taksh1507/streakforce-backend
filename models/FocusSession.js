const mongoose = require('mongoose');

const focusSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
  },
  durationMinutes: {
    type: Number,
    default: 0,
  },
  project: {
    type: String, // Reference to a project name or ID
  },
  task: {
    type: String, // What they were working on
  },
  completed: {
    type: Boolean,
    default: false,
  }
});

module.exports = mongoose.model('FocusSession', focusSessionSchema);
