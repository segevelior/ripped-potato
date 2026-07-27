"""
Tests for the training-interest mix block (interest_mix.py) and the
update_sport_preferences skill.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId
from pymongo import ReturnDocument

from app.core.agents.interest_mix import (
    MIX_WINDOW_DAYS,
    build_interest_mix_block,
    load_recent_discipline_counts,
)
from app.core.agents.skills.update_sport_preferences_skill import (
    update_sport_preferences,
)

USER_ID = str(ObjectId())


class TestBuildInterestMixBlock:
    def test_no_interests_no_block(self):
        assert build_interest_mix_block([], {"strength": 6}) is None

    def test_too_little_activity_no_block(self):
        # < 3 recorded activities in the window -> say nothing about mix
        assert build_interest_mix_block(["climbing"], {"strength": 2}) is None

    def test_neglected_interests_listed(self):
        block = build_interest_mix_block(
            ["climbing", "yoga", "strength"], {"strength": 6, "cardio": 2}
        )
        assert "Declared interests: climbing, yoga, strength" in block
        assert "strength 6" in block
        assert "little/no recorded volume: climbing, yoga" in block
        # priority + anti-nag rules always ride along with the data
        assert "ALWAYS take priority" in block
        assert "ask, don't assert" in block

    def test_no_neglected_line_when_all_covered(self):
        block = build_interest_mix_block(["strength"], {"strength": 4})
        assert block is not None
        assert "little/no recorded volume" not in block

    def test_endurance_counts_toward_cardio_and_running(self):
        block = build_interest_mix_block(
            ["running", "cardio", "climbing"], {"endurance": 4}
        )
        assert "little/no recorded volume: climbing" in block

    def test_other_carries_no_signal(self):
        block = build_interest_mix_block(["climbing"], {"other": 5})
        assert "little/no recorded volume: climbing" in block


class TestLoadRecentDisciplineCounts:
    def _db(self, cal_rows, log_rows):
        db = MagicMock()
        cal_cursor = MagicMock()
        cal_cursor.to_list = AsyncMock(return_value=cal_rows)
        db.calendarevents.aggregate = MagicMock(return_value=cal_cursor)
        log_cursor = MagicMock()
        log_cursor.to_list = AsyncMock(return_value=log_rows)
        db.sessionlogs.aggregate = MagicMock(return_value=log_cursor)
        return db

    async def test_unions_calendar_and_unlinked_logs(self):
        db = self._db(
            [{"_id": "running", "count": 2}, {"_id": "strength", "count": 1}],
            [{"_id": "strength", "count": 3}, {"_id": None, "count": 9}],
        )
        counts = await load_recent_discipline_counts(db, USER_ID, datetime(2026, 7, 27))
        assert counts == {"running": 2, "strength": 4}

    async def test_log_query_skips_calendar_linked_and_uses_window(self):
        db = self._db([], [])
        local_now = datetime(2026, 7, 27, 8, 0, tzinfo=timezone.utc)
        await load_recent_discipline_counts(db, USER_ID, local_now)
        log_match = db.sessionlogs.aggregate.call_args[0][0][0]["$match"]
        # linked logs are excluded — they're already counted via their event
        assert log_match["calendarEventId"] is None
        # 21-day boundary, tz stripped for naive-UTC stored dates
        cutoff = log_match["startedAt"]["$gte"]
        assert cutoff == datetime(2026, 7, 27, 8, 0) - timedelta(days=MIX_WINDOW_DAYS)
        cal_match = db.calendarevents.aggregate.call_args[0][0][0]["$match"]
        assert cal_match["status"] == "completed"


class TestDataReaderSportPreferences:
    async def test_load_user_profile_returns_sport_preferences(self):
        from app.core.agents.data_reader import DataReaderAgent

        db = MagicMock()
        db.users.find_one = AsyncMock(return_value={
            "_id": ObjectId(USER_ID),
            "name": "Test",
            "profile": {"sportPreferences": ["climbing", "yoga"], "goals": []},
            "settings": {},
        })
        reader = DataReaderAgent(db)
        profile = await reader._load_user_profile(USER_ID)
        assert profile["sportPreferences"] == ["climbing", "yoga"]

    async def test_missing_field_defaults_to_empty_list(self):
        from app.core.agents.data_reader import DataReaderAgent

        db = MagicMock()
        db.users.find_one = AsyncMock(return_value={"_id": ObjectId(USER_ID), "profile": {}, "settings": {}})
        reader = DataReaderAgent(db)
        profile = await reader._load_user_profile(USER_ID)
        assert profile["sportPreferences"] == []


class TestUpdateSportPreferencesSkill:
    def _ctx(self, user_after):
        ctx = MagicMock()
        ctx.db.users.find_one_and_update = AsyncMock(return_value=user_after)
        return ctx

    async def test_add_and_remove_are_two_atomic_updates(self):
        ctx = self._ctx({"profile": {"sportPreferences": ["climbing", "yoga"]}})
        res = await update_sport_preferences(
            ctx, USER_ID, {"add": ["climbing"], "remove": ["strength"]}
        )
        assert res["success"] is True
        assert res["sportPreferences"] == ["climbing", "yoga"]
        calls = ctx.db.users.find_one_and_update.call_args_list
        assert len(calls) == 2  # $pull and $addToSet must not share one update
        assert calls[0][0][1] == {"$pull": {"profile.sportPreferences": {"$in": ["strength"]}}}
        assert calls[1][0][1] == {"$addToSet": {"profile.sportPreferences": {"$each": ["climbing"]}}}
        assert calls[1][1]["return_document"] == ReturnDocument.AFTER

    async def test_off_vocabulary_values_rejected(self):
        ctx = self._ctx({"profile": {"sportPreferences": []}})
        res = await update_sport_preferences(ctx, USER_ID, {"add": ["crossfit", ""]})
        assert res["success"] is False
        ctx.db.users.find_one_and_update.assert_not_called()

    async def test_same_sport_added_and_removed_is_dropped(self):
        ctx = self._ctx({"profile": {"sportPreferences": []}})
        res = await update_sport_preferences(
            ctx, USER_ID, {"add": ["climbing"], "remove": ["climbing"]}
        )
        assert res["success"] is False
        ctx.db.users.find_one_and_update.assert_not_called()

    async def test_values_normalized_to_lowercase(self):
        ctx = self._ctx({"profile": {"sportPreferences": ["climbing"]}})
        res = await update_sport_preferences(ctx, USER_ID, {"add": ["Climbing"]})
        assert res["success"] is True
        update = ctx.db.users.find_one_and_update.call_args[0][1]
        assert update == {"$addToSet": {"profile.sportPreferences": {"$each": ["climbing"]}}}

    async def test_user_not_found(self):
        ctx = self._ctx(None)
        res = await update_sport_preferences(ctx, USER_ID, {"add": ["climbing"]})
        assert res["success"] is False
