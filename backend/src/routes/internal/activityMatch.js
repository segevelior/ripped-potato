const express = require('express');
const mongoose = require('mongoose');
const ExternalActivity = require('../../models/ExternalActivity');
const CalendarEvent = require('../../models/CalendarEvent');
const StravaIntegrationService = require('../../services/StravaIntegrationService');
const ActivityMatchingService = require('../../services/activityMatchingService');
const { internalAuth } = require('../../middleware/internalAuth');

const router = express.Router();

/**
 * POST /internal/v1/activity-match/resolve
 *
 * Coach-side resolution of an activity↔planned-event match (the pilot
 * endpoint of the §8 single-writer plan — the Python skill never writes these
 * collections directly). Body: { userId, activityId, resolution, eventId? }
 *  - 'merge'    → merge the activity into eventId (matchStatus 'confirmed')
 *  - 'separate' → pending activity is NOT the planned session; keep its own
 *                 calendar entry, never re-match
 *  - 'unmerge'  → undo a merge (tolerates a dangling matchedEventId)
 *
 * Refusals are machine-readable ({ success: false, reason }) so the skill can
 * relay them: stored candidate lists go stale, so everything is re-validated
 * here at resolve time.
 */
router.post('/resolve', internalAuth, async (req, res) => {
  try {
    const { userId, activityId, resolution, eventId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({ success: false, reason: 'invalid_ids' });
    }
    if (!['merge', 'separate', 'unmerge'].includes(resolution)) {
      return res.status(400).json({ success: false, reason: 'invalid_resolution' });
    }

    const activity = await ExternalActivity.findOne({ _id: activityId, userId }).lean();
    if (!activity) {
      return res.status(404).json({ success: false, reason: 'activity_not_found' });
    }

    const discipline = StravaIntegrationService.mapStravaTypeToDiscipline(activity.sportType);
    const linked = await CalendarEvent.findOne({ userId, externalActivityId: activity._id }).lean();
    const isMerged = Boolean(linked && linked.sessionDetails?.source === 'strava-matched');

    if (resolution === 'merge') {
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ success: false, reason: 'event_id_required' });
      }
      if (isMerged) {
        return res.status(409).json({ success: false, reason: 'already_merged', eventId: linked._id });
      }
      const event = await CalendarEvent.findOne({ _id: eventId, userId, type: 'session' }).lean();
      if (!event) {
        return res.status(404).json({ success: false, reason: 'event_not_found' });
      }
      if (event.externalActivityId && String(event.externalActivityId) !== String(activity._id)) {
        return res.status(409).json({ success: false, reason: 'event_already_linked' });
      }
      await ActivityMatchingService.mergeActivityIntoEvent(activity, event, {
        actor: 'coach',
        matchStatus: 'confirmed',
        action: 'coach_merge'
      });
      return res.json({ success: true, resolution, eventId: event._id, eventTitle: event.title });
    }

    if (resolution === 'unmerge') {
      if (!isMerged && !activity.matchedEventId) {
        return res.status(409).json({ success: false, reason: 'not_merged' });
      }
      // Dangling matchedEventId (merged event deleted) is fine — unmerge
      // still recreates the mirror and pins the activity 'separate'.
      await ActivityMatchingService.unmergeActivity(activity, discipline, {
        actor: 'coach',
        action: 'coach_unmerge'
      });
      return res.json({ success: true, resolution });
    }

    // resolution === 'separate' — resolving a pending question, not a merge
    if (isMerged) {
      return res.status(409).json({ success: false, reason: 'is_merged_use_unmerge' });
    }
    const previous = { matchStatus: activity.matchStatus, matchedEventId: activity.matchedEventId };
    await ExternalActivity.updateOne(
      { _id: activity._id },
      { $set: { matchStatus: 'separate', matchCandidateIds: [] }, $unset: { matchedEventId: 1 } }
    );
    await ActivityMatchingService.writeAudit({
      userId: activity.userId,
      activityId: activity._id,
      action: 'coach_separate',
      actor: 'coach',
      previous
    });
    return res.json({ success: true, resolution });
  } catch (error) {
    console.error('Internal activity-match resolve error:', error);
    res.status(500).json({ success: false, reason: 'server_error', error: error.message });
  }
});

module.exports = router;
