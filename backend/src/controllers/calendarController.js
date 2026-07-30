const CalendarEvent = require('../models/CalendarEvent');
const SessionLog = require('../models/SessionLog');
const SessionTemplate = require('../models/SessionTemplate');
const ActivityMatchingService = require('../services/activityMatchingService');
const { validationResult } = require('express-validator');
const { flattenTemplateExercises } = require('../utils/volume');
const {
  ensureTemplateForCustomEvent,
  applyExercisesCopyOnWrite
} = require('../services/templateMaterializer');

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

    // Populate sessionLogId for additional data
    await CalendarEvent.populate(events, {
      path: 'sessionLogId',
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
    .populate('sessionTemplateId')
    .populate('sessionLogId');

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

    // Events only reference workouts — exercises live on the template.
    if (req.body.sessionTemplateId) {
      const template = await SessionTemplate.findById(req.body.sessionTemplateId);
      if (template) {
        eventData.title = eventData.title || template.name;
        eventData.sessionDetails = {
          ...(eventData.sessionDetails || {}),
          discipline: template.primary_disciplines?.[0]?.toLowerCase() || 'strength',
          estimatedDuration: template.estimated_duration
        };
      }
    } else if (['session', 'deload'].includes(eventData.type) && eventData.status !== 'completed') {
      // Bare-exercises payload (chat flow, custom builds, legacy clients):
      // materialize a library template so the event can link it. Completed
      // events are historical records of performed sets and keep theirs.
      const templateId = await ensureTemplateForCustomEvent(req.user._id, eventData);
      if (templateId) eventData.sessionTemplateId = templateId;
    }

    // Scheduled events never persist an embedded exercise list, whatever the
    // client sent. Completed events keep actual performed sets (workout-log flow).
    if (eventData.status !== 'completed' && eventData.sessionDetails?.exercises) {
      delete eventData.sessionDetails.exercises;
    }

    const event = new CalendarEvent(eventData);
    await event.save();

    // Populate for response
    await event.populate('sessionTemplateId', 'name goal primary_disciplines estimated_duration');

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

    const updateData = { ...req.body };

    // Exercises never land on the event. If a client edits a workout's
    // exercise list, the edit goes to the linked template — copy-on-write
    // when the template is shared (common / other events reference it).
    const incomingExercises = updateData.sessionDetails?.exercises;
    if (incomingExercises) {
      updateData.sessionDetails = { ...updateData.sessionDetails };
      delete updateData.sessionDetails.exercises;

      const existing = await CalendarEvent.findOne({ _id: req.params.id, userId: req.user._id });
      if (existing && ['session', 'deload'].includes(existing.type) && existing.status !== 'completed') {
        const templateId = await applyExercisesCopyOnWrite(req.user._id, existing, incomingExercises);
        if (templateId) updateData.sessionTemplateId = templateId;
      }
    }

    // Single query with ownership check
    const updatedEvent = await CalendarEvent.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updateData,
      { new: true, runValidators: true }
    ).populate('sessionTemplateId', 'name goal primary_disciplines estimated_duration');

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

    // Deleting a Strava-linked event is a match correction: pin the activity
    // 'separate' so the consistency job can't resurrect it as an auto-merge.
    if (event.externalActivityId) {
      await ActivityMatchingService.handleLinkedEventDeletion(event, req.user._id);
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
    ).populate('sessionTemplateId', 'name goal primary_disciplines estimated_duration');

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
const startSession = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'session'
    }).populate('sessionTemplateId');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Workout event not found'
      });
    }

    // Update event status (will save after linking sessionLogId to avoid double save)
    event.status = 'in_progress';

    // The linked template is the source of truth for exercises; the embedded
    // list is a legacy fallback for unmigrated/orphan events.
    const templateExercises = flattenTemplateExercises(event.sessionTemplateId);
    const plannedExercises = templateExercises.length
      ? templateExercises
      : event.sessionDetails?.exercises || [];

    // Create a workout log entry
    const sessionLog = new SessionLog({
      userId: req.user._id,
      calendarEventId: event._id,
      title: event.title,
      discipline: event.sessionDetails?.discipline || 'strength',
      startedAt: new Date(),
      exercises: plannedExercises.map((ex, i) => ({
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
      }))
    });

    await sessionLog.save();

    // Link log to event and save (single save for both status and sessionLogId)
    event.sessionLogId = sessionLog._id;
    await event.save();

    res.json({
      success: true,
      message: 'Workout started',
      data: {
        event,
        sessionLog
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
const completeSession = async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'session'
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
    if (event.sessionLogId) {
      const sessionLog = await SessionLog.findById(event.sessionLogId);
      if (sessionLog) {
        sessionLog.completedAt = new Date();
        sessionLog.actualDuration = Math.round((new Date() - sessionLog.startedAt) / 60000); // minutes

        // Merge any additional data from request
        if (req.body.exercises) {
          sessionLog.exercises = req.body.exercises;
        }
        if (req.body.perceivedDifficulty) {
          sessionLog.perceivedDifficulty = req.body.perceivedDifficulty;
        }
        if (req.body.mood) {
          sessionLog.mood = req.body.mood;
        }
        if (req.body.notes) {
          sessionLog.notes = req.body.notes;
        }

        await sessionLog.save();
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
const skipSession = async (req, res) => {
  try {
    // Build update - append skip reason to existing notes instead of overwriting
    const skipNote = req.body.reason ? `Skipped: ${req.body.reason}` : 'Skipped';

    const event = await CalendarEvent.findOne({
      _id: req.params.id,
      userId: req.user._id,
      type: 'session'
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
  startSession,
  completeSession,
  skipSession,
  getTodayEvents
};
