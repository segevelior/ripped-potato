const CalendarEvent = require('../models/CalendarEvent');
const WorkoutLog = require('../models/WorkoutLog');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const { validationResult } = require('express-validator');

// Get calendar events for a date range
const getEvents = async (req, res) => {
  try {
    const { startDate, endDate, type, status } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    // Use static method for basic query, then apply additional filters
    let events = await CalendarEvent.getByDateRange(
      req.user._id,
      new Date(startDate),
      new Date(endDate)
    );

    // Apply additional filters if provided
    if (type) {
      events = events.filter(e => e.type === type);
    }
    if (status) {
      events = events.filter(e => e.status === status);
    }

    // Populate workoutLogId for additional data
    await CalendarEvent.populate(events, {
      path: 'workoutLogId',
      select: 'actualDuration completedAt'
    });

    res.json({
      success: true,
      data: { events }
    });
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting calendar events'
    });
  }
};

// Get single event
const getEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id
    })
    .populate('workoutTemplateId')
    .populate('workoutLogId');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    res.json({
      success: true,
      data: { event }
    });
  } catch (error) {
    console.error('Get calendar event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting calendar event'
    });
  }
};

// Create calendar event (schedule workout, rest day, etc.)
const createEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const eventData = {
      ...req.body,
      userId: req.user._id
    };

    // If a workout template is provided, populate workout details
    if (req.body.workoutTemplateId) {
      const template = await PredefinedWorkout.findById(req.body.workoutTemplateId);
      if (template) {
        eventData.title = eventData.title || template.name;
        eventData.workoutDetails = {
          type: template.primary_disciplines?.[0]?.toLowerCase() || 'strength',
          estimatedDuration: template.estimated_duration,
          exercises: template.blocks?.flatMap(block =>
            block.exercises?.map(ex => ({
              exerciseId: ex.exercise_id,
              exerciseName: ex.exercise_name,
              targetSets: parseInt(ex.volume?.split('x')[0]) || 3,
              targetReps: parseInt(ex.volume?.split('x')[1]) || 8,
              notes: ex.notes
            }))
          ) || []
        };
      }
    }

    const event = new CalendarEvent(eventData);
    await event.save();

    // Populate for response
    await event.populate('workoutTemplateId', 'name goal primary_disciplines estimated_duration');

    res.status(201).json({
      success: true,
      message: 'Calendar event created successfully',
      data: { event }
    });
  } catch (error) {
    console.error('Create calendar event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating calendar event'
    });
  }
};

// Update calendar event
const updateEvent = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    // Single query with ownership check
    const updatedEvent = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    ).populate('workoutTemplateId', 'name goal primary_disciplines estimated_duration');

    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    res.json({
      success: true,
      message: 'Calendar event updated successfully',
      data: { event: updatedEvent }
    });
  } catch (error) {
    console.error('Update calendar event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating calendar event'
    });
  }
};

// Delete calendar event
const deleteEvent = async (req, res) => {
  try {
    const event = await CalendarEvent.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    res.json({
      success: true,
      message: 'Calendar event deleted successfully'
    });
  } catch (error) {
    console.error('Delete calendar event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting calendar event'
    });
  }
};

// Move event to different date (drag & drop)
const moveEvent = async (req, res) => {
  try {
    const { newDate } = req.body;

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: 'newDate is required'
      });
    }

    const event = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { date: new Date(newDate) },
      { new: true }
    ).populate('workoutTemplateId', 'name goal primary_disciplines estimated_duration');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Calendar event not found'
      });
    }

    res.json({
      success: true,
      message: 'Event moved successfully',
      data: { event }
    });
  } catch (error) {
    console.error('Move calendar event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error moving calendar event'
    });
  }
};

// Start workout (changes status to in_progress)
const startWorkout = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'workout'
    }).populate('workoutTemplateId');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Workout event not found'
      });
    }

    // Update event status (will save after linking workoutLogId to avoid double save)
    event.status = 'in_progress';

    // Create a workout log entry
    const workoutLog = new WorkoutLog({
      userId: req.user._id,
      calendarEventId: event._id,
      title: event.title,
      type: event.workoutDetails?.type || 'strength',
      startedAt: new Date(),
      exercises: event.workoutDetails?.exercises?.map((ex, i) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        order: i,
        sets: Array(ex.targetSets || 3).fill(null).map((_, setNum) => ({
          setNumber: setNum + 1,
          targetReps: ex.targetReps,
          targetWeight: ex.targetWeight,
          isCompleted: false
        })),
        notes: ex.notes
      })) || []
    });

    await workoutLog.save();

    // Link log to event and save (single save for both status and workoutLogId)
    event.workoutLogId = workoutLog._id;
    await event.save();

    res.json({
      success: true,
      message: 'Workout started',
      data: {
        event,
        workoutLog
      }
    });
  } catch (error) {
    console.error('Start workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error starting workout'
    });
  }
};

// Complete workout
const completeWorkout = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'workout'
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Workout event not found'
      });
    }

    // Update event status
    event.status = 'completed';
    await event.save();

    // Update workout log if exists
    if (event.workoutLogId) {
      const workoutLog = await WorkoutLog.findById(event.workoutLogId);
      if (workoutLog) {
        workoutLog.completedAt = new Date();
        workoutLog.actualDuration = Math.round((new Date() - workoutLog.startedAt) / 60000); // minutes

        // Merge any additional data from request
        if (req.body.exercises) {
          workoutLog.exercises = req.body.exercises;
        }
        if (req.body.perceivedDifficulty) {
          workoutLog.perceivedDifficulty = req.body.perceivedDifficulty;
        }
        if (req.body.mood) {
          workoutLog.mood = req.body.mood;
        }
        if (req.body.notes) {
          workoutLog.notes = req.body.notes;
        }

        await workoutLog.save();
      }
    }

    res.json({
      success: true,
      message: 'Workout completed',
      data: { event }
    });
  } catch (error) {
    console.error('Complete workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error completing workout'
    });
  }
};

// Skip workout
const skipWorkout = async (req, res) => {
  try {
    // Build update - append skip reason to existing notes instead of overwriting
    const skipNote = req.body.reason ? `Skipped: ${req.body.reason}` : 'Skipped';

    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'workout'
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Workout event not found'
      });
    }

    event.status = 'skipped';
    event.notes = event.notes ? `${event.notes}\n${skipNote}` : skipNote;
    await event.save();

    res.json({
      success: true,
      message: 'Workout skipped',
      data: { event }
    });
  } catch (error) {
    console.error('Skip workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error skipping workout'
    });
  }
};

// Get today's events
const getTodayEvents = async (req, res) => {
  try {
    // Debug logging
    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    console.log('📅 [getTodayEvents] Server time:', now.toISOString());
    console.log('📅 [getTodayEvents] Query range:', {
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString()
    });

    const events = await CalendarEvent.getToday(req.user._id);

    console.log('📅 [getTodayEvents] Found events:', events.length);
    events.forEach(e => {
      console.log(`📅 [getTodayEvents] Event: "${e.title}" | date: ${e.date?.toISOString()} | type: ${e.type} | status: ${e.status}`);
    });

    res.json({
      success: true,
      data: { events }
    });
  } catch (error) {
    console.error('Get today events error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting today events'
    });
  }
};

module.exports = {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  moveEvent,
  startWorkout,
  completeWorkout,
  skipWorkout,
  getTodayEvents
};
