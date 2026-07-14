"""Tests for workout template management (self-describing list + delete tool)."""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.services.workout_service import WorkoutService

USER = ObjectId()


def _tmpl(name, created_by=USER, common=False):
    return {"_id": ObjectId(), "name": name, "createdBy": created_by,
            "isCommon": common, "blocks": []}


def _service(own_templates=None, total_matching=None, deleted=0):
    db = MagicMock()
    own_templates = own_templates or []

    find_result = MagicMock()
    find_result.to_list = AsyncMock(return_value=own_templates)
    limited = MagicMock()
    limited.to_list = AsyncMock(return_value=own_templates)
    find_result.limit = MagicMock(return_value=limited)
    db.predefinedworkouts.find = MagicMock(return_value=find_result)
    db.predefinedworkouts.count_documents = AsyncMock(
        return_value=total_matching if total_matching is not None else len(own_templates))
    db.predefinedworkouts.delete_many = AsyncMock(
        return_value=MagicMock(deleted_count=deleted))
    # Deletion guard: no calendar events reference these templates by default.
    db.calendarevents.count_documents = AsyncMock(return_value=0)
    svc = WorkoutService(db)
    return svc, db


class TestListSelfDescribing:
    @pytest.mark.asyncio
    async def test_reports_filter_and_totals(self):
        svc, db = _service([_tmpl("A"), _tmpl("B")], total_matching=12)
        res = await svc.list_workout_templates(str(USER), {"include_common": False})
        assert res["success"] is True
        assert res["total_matching"] == 12
        assert res["truncated"] is True
        assert res["filter_used"]["include_common"] is False
        assert res["filter_used"]["limit"] == 50

    @pytest.mark.asyncio
    async def test_not_truncated_when_all_returned(self):
        svc, _ = _service([_tmpl("A")], total_matching=1)
        res = await svc.list_workout_templates(str(USER), {})
        assert res["truncated"] is False


class TestDeleteTemplate:
    @pytest.mark.asyncio
    async def test_requires_a_selector(self):
        svc, db = _service()
        res = await svc.delete_workout_template(str(USER), {})
        assert res["success"] is False
        db.predefinedworkouts.delete_many.assert_not_called()

    @pytest.mark.asyncio
    async def test_preview_without_confirm(self):
        svc, db = _service([_tmpl("Endurance 2 (Jul 16)"), _tmpl("Endurance 2")])
        res = await svc.delete_workout_template(
            str(USER), {"name": "endurance 2 (jul 16)"})
        assert res["needs_confirmation"] is True
        assert [t["name"] for t in res["would_delete"]] == ["Endurance 2 (Jul 16)"]
        db.predefinedworkouts.delete_many.assert_not_called()

    @pytest.mark.asyncio
    async def test_keep_only_matches_case_insensitively(self):
        own = [_tmpl("Strength and Conditioning"), _tmpl("Endurance 1"),
               _tmpl("Endurance 2"), _tmpl("Endurance 2 (Jul 16)"), _tmpl("Strength A")]
        svc, db = _service(own)
        res = await svc.delete_workout_template(str(USER), {
            "keep_only": ["strength and conditioning", "ENDURANCE 1", "Endurance 2"],
        })
        assert res["needs_confirmation"] is True
        assert sorted(t["name"] for t in res["would_delete"]) == \
            ["Endurance 2 (Jul 16)", "Strength A"]
        assert res["unmatched_keep_names"] == []

    @pytest.mark.asyncio
    async def test_keep_only_reports_unmatched_keep_names(self):
        svc, _ = _service([_tmpl("Endurance 1"), _tmpl("Endurance 2")])
        res = await svc.delete_workout_template(str(USER), {
            "keep_only": ["Endurance 1", "Endurance 3"],  # typo: no Endurance 3
        })
        assert res["unmatched_keep_names"] == ["Endurance 3"]
        assert "Endurance 3" in res["message"]

    @pytest.mark.asyncio
    async def test_confirmed_delete_scopes_to_own_non_common(self):
        own = [_tmpl("Old A"), _tmpl("Old B")]
        svc, db = _service(own, deleted=2)
        res = await svc.delete_workout_template(str(USER), {
            "keep_only": [], "name": "", "template_id": str(own[0]["_id"]), "confirm": True,
        })
        assert res["success"] is True and res["deleted"] == 2
        query = db.predefinedworkouts.delete_many.call_args.args[0]
        assert query["createdBy"] == USER
        assert query["isCommon"] == {"$ne": True}

    @pytest.mark.asyncio
    async def test_no_match_returns_gracefully(self):
        svc, db = _service([_tmpl("Keep Me")])
        res = await svc.delete_workout_template(str(USER), {"name": "Does Not Exist"})
        assert res["success"] is True and res["deleted"] == 0
        db.predefinedworkouts.delete_many.assert_not_called()

    @pytest.mark.asyncio
    async def test_template_with_upcoming_events_is_refused(self):
        # Calendar events reference templates — deleting one that upcoming
        # events link to would empty those sessions.
        own = [_tmpl("Scheduled One")]
        svc, db = _service(own)
        db.calendarevents.count_documents = AsyncMock(return_value=2)
        res = await svc.delete_workout_template(str(USER), {
            "template_id": str(own[0]["_id"]), "confirm": True,
        })
        assert res["success"] is False
        assert res["skipped_referenced"][0]["upcoming_events"] == 2
        db.predefinedworkouts.delete_many.assert_not_called()

    @pytest.mark.asyncio
    async def test_referenced_templates_skipped_others_deleted(self):
        own = [_tmpl("Scheduled One"), _tmpl("Unused One")]
        svc, db = _service(own, deleted=1)
        db.calendarevents.count_documents = AsyncMock(
            side_effect=lambda q: 3 if q["workoutTemplateId"] == own[0]["_id"] else 0)
        res = await svc.delete_workout_template(str(USER), {"keep_only": ["nothing kept"], "confirm": True})
        assert res["success"] is True and res["deleted"] == 1
        assert res["skipped_referenced"][0]["name"] == "Scheduled One"
        deleted_ids = db.predefinedworkouts.delete_many.call_args.args[0]["_id"]["$in"]
        assert deleted_ids == [own[1]["_id"]]
