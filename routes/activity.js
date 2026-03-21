const express = require('express');
const Task = require('../models/Task');
const FocusSession = require('../models/FocusSession');
const Reflection = require('../models/Reflection');
const Project = require('../models/Project');
const User = require('../models/User');

const router = express.Router();

// TASKS
router.get('/tasks/:userId', async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.taskId, req.body, { new: true });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FOCUS SESSIONS
router.post('/focus', async (req, res) => {
  try {
    const session = new FocusSession(req.body);
    await session.save();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/focus/:userId', async (req, res) => {
  try {
    const sessions = await FocusSession.find({ userId: req.params.userId }).sort({ startTime: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// REFLECTIONS
router.post('/reflections', async (req, res) => {
  try {
    const reflection = new Reflection(req.body);
    await reflection.save();
    res.json(reflection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reflections/:userId', async (req, res) => {
  try {
    const reflections = await Reflection.find({ userId: req.params.userId }).sort({ date: -1 });
    res.json(reflections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PROJECTS
router.get('/projects/:userId', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.params.userId });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const project = new Project(req.body);
    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
