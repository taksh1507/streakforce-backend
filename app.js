require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

// Services & Cron
const { initCronJobs } = require('./cron/cronJobs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON buffers
app.use(express.urlencoded({ extended: true }));

// Database Integration
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/streakforce';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[DB] MongoDB successfully connected');
    // Once DB relies are mapped, initialize Cron daemon loops
    initCronJobs();
  })
  .catch(err => {
    console.error('[DB] Connection Exception:', err.message);
  });

// Setup Clean Mount Paths
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);

// Health Endpoint suitable for initial server verification
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'StreakForce Backend Runtime active.' });
});

// Start Server Loop
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SYS] StreakForce Backend actively listening on port ${PORT}`);
});
