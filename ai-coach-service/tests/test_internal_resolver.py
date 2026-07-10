"""Tests for the internal weekly resolver (auth guard + per-plan processing)."""

from datetime import datetime, timedelta

import pytest
from bson import ObjectId
from fastapi import HTTPException
from unittest.mock import AsyncMock, MagicMock

import app.api.v1.internal as internal


class TestAuthGuard:
    def _settings(self, key):
        s = MagicMock()
        s.internal_api_key = key
        return s

    def test_rejects_when_key_unset(self, monkeypatch):
        monkeypatch.setattr(internal, "get_settings", lambda: self._settings(None))
        with pytest.raises(HTTPException) as exc:
            internal._check_internal_key("anything")
        assert exc.value.status_code == 403

    def test_rejects_wrong_key(self, monkeypatch):
        monkeypatch.setattr(internal, "get_settings", lambda: self._settings("secret"))
        with pytest.raises(HTTPException):
            internal._check_internal_key("wrong")

    def test_accepts_correct_key(self, monkeypatch):
        monkeypatch.setattr(internal, "get_settings", lambda: self._settings("secret"))
        internal._check_internal_key("secret")  # no raise


def _plan(current_week=1, advanced_days_ago=8):
    return {
        "_id": ObjectId(),
        "userId": ObjectId(),
        "status": "active",
        "skeleton": {"phases": [{"startWeek": 1, "endWeek": 8}]},
        "schedule": {"weeksTotal": 8},
        "startDate": datetime.utcnow() - timedelta(days=30),
        "progress": {
            "currentWeek": current_week,
            "weekAdvancedAt": datetime.utcnow() - timedelta(days=advanced_days_ago),
        },
        "weeks": [],
    }


def _ctx():
    ctx = MagicMock()
    ctx.db.plans.update_one = AsyncMock()
    return ctx


class TestResolvePlan:
    @pytest.mark.asyncio
    async def test_advances_week_resolves_and_schedules(self, monkeypatch):
        plan = _plan(current_week=2, advanced_days_ago=8)
        resolve_calls = iter([
            {"success": True, "week_number": 3},
            {"success": True, "noop": True},
        ])
        monkeypatch.setattr(internal, "resolve_week",
                            AsyncMock(side_effect=lambda *a, **k: next(resolve_calls)))
        sched = AsyncMock(return_value={"success": True, "events_created": 4})
        monkeypatch.setattr(internal, "schedule_plan_to_calendar", sched)

        ctx = _ctx()
        summary = await internal.resolve_plan(ctx, plan, datetime.utcnow())

        assert summary["advanced"] is True
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        assert update["progress.currentWeek"] == 3
        assert summary["resolved_weeks"] == [3]
        assert summary["scheduled"] == 4
        # scheduler called with weeks = currentWeek+1, confirmed write
        sched_args = sched.call_args.args[2]
        assert sched_args["weeks"] == 4 and sched_args["dry_run"] is False

    @pytest.mark.asyncio
    async def test_no_advance_before_seven_days(self, monkeypatch):
        plan = _plan(current_week=2, advanced_days_ago=3)
        monkeypatch.setattr(internal, "resolve_week",
                            AsyncMock(return_value={"success": True, "noop": True}))
        ctx = _ctx()
        summary = await internal.resolve_plan(ctx, plan, datetime.utcnow())
        assert summary["advanced"] is False
        assert summary["resolved_weeks"] == []
        ctx.db.plans.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_backend_written_further_week_respected(self, monkeypatch):
        # advanceToNextWeek (completion-based) already moved to week 5; the
        # time-based advance computes 3 -> take the later, write nothing older.
        plan = _plan(current_week=4, advanced_days_ago=8)
        monkeypatch.setattr(internal, "resolve_week",
                            AsyncMock(return_value={"success": True, "noop": True}))
        ctx = _ctx()
        summary = await internal.resolve_plan(ctx, plan, datetime.utcnow())
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        assert update["progress.currentWeek"] == 5

    @pytest.mark.asyncio
    async def test_no_schedule_call_when_nothing_resolved(self, monkeypatch):
        plan = _plan(advanced_days_ago=1)
        monkeypatch.setattr(internal, "resolve_week",
                            AsyncMock(return_value={"success": True, "noop": True}))
        sched = AsyncMock()
        monkeypatch.setattr(internal, "schedule_plan_to_calendar", sched)
        await internal.resolve_plan(_ctx(), plan, datetime.utcnow())
        sched.assert_not_called()

    @pytest.mark.asyncio
    async def test_resolve_cap_prevents_runaway(self, monkeypatch):
        plan = _plan(advanced_days_ago=1)
        # resolver never says noop -> the per-plan cap must stop the loop
        resolve = AsyncMock(return_value={"success": True, "week_number": 3})
        monkeypatch.setattr(internal, "resolve_week", resolve)
        monkeypatch.setattr(internal, "schedule_plan_to_calendar",
                            AsyncMock(return_value={"success": True, "events_created": 0}))
        summary = await internal.resolve_plan(_ctx(), plan, datetime.utcnow())
        assert len(summary["resolved_weeks"]) == internal._MAX_RESOLVES_PER_PLAN
