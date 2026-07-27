const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getSessionLogs,
  getSessionLogStats,
  getSessionLog,
  createSessionLog,
  updateSessionLog,
  deleteSessionLog,
  validateSessionLog
} = require('../controllers/sessionLogController');

// @route   GET /api/v1/workout-logs
router.get('/', auth, getSessionLogs);

// @route   GET /api/v1/workout-logs/stats
router.get('/stats', auth, getSessionLogStats);

// @route   GET /api/v1/workout-logs/:id
router.get('/:id', auth, getSessionLog);

// @route   POST /api/v1/workout-logs
router.post('/', auth, validateSessionLog, createSessionLog);

// @route   PUT /api/v1/workout-logs/:id
router.put('/:id', auth, updateSessionLog);

// @route   DELETE /api/v1/workout-logs/:id
router.delete('/:id', auth, deleteSessionLog);

module.exports = router;
