const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  commitCount: {
    type: Number,
    required: true,
  }
});

module.exports = mongoose.model('Activity', activitySchema);
