"""End-to-end behaviour of the coach question's fingerprint cache.

The old cache regenerated the question every 45 minutes on a timer. These tests
pin the replacement: the question is held until an INPUT actually changes, and
regenerates when one does. Every case asserts on the number of LLM calls, since
that is the thing the change exists to reduce.
"""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

import pytest
from bson import ObjectId

import app.api.v1.coach_question as cq
from app.core import llm_cache

USER_ID = str(ObjectId())
CURRENT_USER = {"user_id": USER_ID, "email": "t@t.co", "username": "t"}

# One payload satisfying BOTH parsers, so the same mock serves the question
# endpoint and the reply endpoint (test_answering_invalidates).
LLM_ANSWER = {
    "question": "Ready for Endurance 2?",
    "chips": ["Yes", "Ease it"],
    "source": "your calendar",
    "reply": "Got it — I'll keep it steady.",
}

DATA_CONTEXT = {
    "user_profile": {"name": "Elior", "timezone": "UTC"},
    "workouts": [],
    "goals": [],
    "plans": [],
    "external_activities": [],
}


class _Clock:
    """Freezable stand-in for cq.datetime. `now()` must return a REAL datetime:
    the endpoint does arithmetic on it for the +/-14d calendar window and reads
    .hour for the part-of-day bucket."""

    current = datetime(2026, 7, 26, 9, 0, tzinfo=ZoneInfo("UTC"))

    @classmethod
    def now(cls, tz=None):
        return cls.current

    @classmethod
    def set(cls, *, month=7, day=26, hour=9, minute=0):
        cls.current = datetime(2026, month, day, hour, minute, tzinfo=ZoneInfo("UTC"))


def _event(date, title, status="scheduled", **extra):
    return {
        "date": date, "dayOfWeek": "Sunday", "type": "session",
        "title": title, "status": status, **extra,
    }


def _memory(content, updated=datetime(2026, 7, 25)):
    return {"category": "health", "content": content,
            "importance": "high", "updatedAt": updated}


class Harness:
    """Stateful fake cache + counted LLM, patched onto the classes the endpoint
    constructs per request (it builds CoachQuestionService(db) fresh each call,
    so instance patching would not stick)."""

    def __init__(self, monkeypatch):
        self.monkeypatch = monkeypatch
        self.store = {}
        self.saves = 0
        self.spawns = 0

        async def create(**kwargs):
            response = MagicMock()
            response.choices[0].message.content = json.dumps(LLM_ANSWER)
            return response

        self.client = MagicMock()
        self.client.chat.completions.create = AsyncMock(side_effect=create)
        monkeypatch.setattr(cq, "AsyncOpenAI", MagicMock(return_value=self.client))

        harness = self

        async def get_matching(_self, user_id, inputs_hash, max_age_minutes=None):
            from app.services.coach_question_service import CacheLookup
            if not inputs_hash:
                return CacheLookup(None, "no_hash")
            if max_age_minutes is not None and max_age_minutes <= 0:
                return CacheLookup(None, "disabled")
            doc = harness.store.get(user_id)
            if not doc:
                return CacheLookup(None, "no_doc")
            if doc.get("inputsHash") != inputs_hash:
                return CacheLookup(None, "hash_changed", doc.get("inputsHash"))
            if max_age_minutes:
                age = (datetime.utcnow() - doc["generatedAt"]).total_seconds() / 60
                if age > max_age_minutes:
                    return CacheLookup(None, "max_age", doc.get("inputsHash"))
            return CacheLookup(doc, "hit", doc.get("inputsHash"))

        async def save(_self, user_id, local_date, timezone, question, chips, source,
                       inputs_hash=None, part_of_day=None):
            harness.saves += 1
            harness.store[user_id] = {
                "localDate": local_date, "question": question, "chips": chips,
                "source": source, "inputsHash": inputs_hash, "partOfDay": part_of_day,
                "generatedAt": datetime.utcnow(),
            }
            return True

        async def invalidate(_self, user_id):
            harness.store.pop(user_id, None)

        monkeypatch.setattr(cq.CoachQuestionService, "get_matching", get_matching)
        monkeypatch.setattr(cq.CoachQuestionService, "save", save)
        monkeypatch.setattr(cq.CoachQuestionService, "invalidate", invalidate)

        def spawn(coro):
            harness.spawns += 1
            coro.close()

        monkeypatch.setattr(cq, "spawn_background", spawn)
        monkeypatch.setattr("app.main.db", MagicMock())
        monkeypatch.setattr(cq, "datetime", _Clock)
        _Clock.set()

        self.set_data(DATA_CONTEXT)
        self.set_memories([])
        self.set_calendar({"success": True, "events": []})
        monkeypatch.setattr(cq.ShortTermContextService, "get_recent", AsyncMock(return_value=[]))
        monkeypatch.setattr(cq.RecommendationService, "get_recent", AsyncMock(return_value=[]))

        self.settings = cq.get_settings()
        self.set_setting("coach_question_cache_max_age_minutes", 240)

    def set_data(self, data_context):
        self.monkeypatch.setattr(
            cq.DataReaderAgent, "process", AsyncMock(return_value=data_context))

    def set_memories(self, memories):
        self.monkeypatch.setattr(
            cq.MemoryService, "get_user_memories", AsyncMock(return_value=memories))

    def set_calendar(self, result):
        self.monkeypatch.setattr(
            cq.CalendarService, "get_calendar_events", AsyncMock(return_value=result))

    def set_setting(self, name, value):
        self.monkeypatch.setattr(self.settings, name, value)

    @property
    def llm_calls(self):
        return self.client.chat.completions.create.await_count

    async def get(self):
        return await cq.get_coach_question(current_user=CURRENT_USER)


@pytest.fixture
def h(monkeypatch):
    return Harness(monkeypatch)


class TestCacheHits:
    @pytest.mark.asyncio
    async def test_identical_inputs_serve_the_cache(self, h):
        first = await h.get()
        second = await h.get()
        assert h.llm_calls == 1
        assert second["cached"] is True
        assert second["question"] == first["question"]
        assert second["chips"] == first["chips"]

    @pytest.mark.asyncio
    async def test_two_hours_later_still_hits(self, h):
        """The headline case. Two hours is well past the old 45-minute TTL, and
        the minute-precision local time in the prompt differs between the two
        requests — so this proves both the TTL removal and the volatile-time
        normalization at once."""
        await h.get()
        _Clock.set(hour=11)
        result = await h.get()
        assert h.llm_calls == 1
        assert result["cached"] is True

    @pytest.mark.asyncio
    async def test_a_hit_does_not_rewrite_the_doc(self, h):
        """Otherwise generatedAt creeps forward on every dashboard open, a held
        question ages invisibly, and the max-age ceiling never fires."""
        await h.get()
        generated_at = h.store[USER_ID]["generatedAt"]
        await h.get()
        assert h.saves == 1
        assert h.store[USER_ID]["generatedAt"] == generated_at


class TestTimeRollover:
    @pytest.mark.asyncio
    async def test_part_of_day_rollover_regenerates(self, h):
        await h.get()
        _Clock.set(hour=14)
        assert (await h.get()).get("cached") is None
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_local_date_rollover_regenerates(self, h):
        await h.get()
        _Clock.set(day=27)
        await h.get()
        assert h.llm_calls == 2


class TestDataChanges:
    @pytest.mark.asyncio
    async def test_changed_calendar_event_regenerates(self, h):
        """A real production signal: logging or scheduling a session reaches the
        prompt through the calendar block."""
        h.set_calendar({"success": True, "events": [_event("2026-07-26", "Endurance 2")]})
        await h.get()
        h.set_calendar({"success": True, "events": [_event("2026-07-26", "Recovery spin")]})
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_changed_external_activity_regenerates(self, h):
        h.set_data({**DATA_CONTEXT, "external_activities": [
            {"date": "2026-07-25", "name": "Morning Run", "sport_type": "Run",
             "source": "strava", "duration_mins": 42}]})
        await h.get()
        h.set_data({**DATA_CONTEXT, "external_activities": [
            {"date": "2026-07-25", "name": "Evening Ride", "sport_type": "Ride",
             "source": "strava", "duration_mins": 60}]})
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_changed_memory_regenerates(self, h):
        h.set_memories([_memory("Left knee sore after runs")])
        await h.get()
        h.set_memories([_memory("Left knee fully recovered")])
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_changed_short_term_context_regenerates(self, h, monkeypatch):
        monkeypatch.setattr(cq.ShortTermContextService, "get_recent",
                            AsyncMock(return_value=[]))
        await h.get()
        monkeypatch.setattr(
            cq.ShortTermContextService, "format_for_prompt",
            staticmethod(lambda entries: "RECENT CONTEXT:\n- Jul 26 check-in: felt cooked"))
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_unchanged_workout_block_is_not_a_signal(self, h):
        """Honesty check, not a feature: data_reader.process("") never loads
        workouts (the keyword gate can't match an empty message), so RECENT
        WORKOUTS is a constant in production. Changing it here only exercises
        the fingerprint — it is NOT evidence that logging a workout invalidates
        the cache. That happens via the calendar/external-activity tests above.
        """
        await h.get()
        h.set_data({**DATA_CONTEXT, "workouts": [{"title": "5k", "date": "2026-07-25"}]})
        await h.get()
        assert h.llm_calls == 2


class TestPromptAndModelChanges:
    @pytest.mark.asyncio
    async def test_editing_the_task_prompt_regenerates(self, h, monkeypatch):
        """Regression for the classic bug: keying on data but not prompt text,
        so a prompt edit keeps serving answers written by the old prompt."""
        await h.get()
        monkeypatch.setattr(cq, "COACH_QUESTION_PROMPT",
                            cq.COACH_QUESTION_PROMPT + "\n9. Extra rule.")
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_editing_the_system_prompt_regenerates(self, h, monkeypatch):
        await h.get()
        monkeypatch.setattr(cq, "SYSTEM_PROMPT", cq.SYSTEM_PROMPT + "\nBe terse.")
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_prompt_version_bump_regenerates(self, h, monkeypatch):
        await h.get()
        monkeypatch.setattr(llm_cache, "PROMPT_VERSION", "test-2")
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_model_change_regenerates(self, h):
        await h.get()
        h.set_setting("openai_model_fast", "some-other-model")
        await h.get()
        assert h.llm_calls == 2


class TestCeilingAndKillSwitch:
    @pytest.mark.asyncio
    async def test_max_age_zero_disables_the_cache(self, h):
        h.set_setting("coach_question_cache_max_age_minutes", 0)
        await h.get()
        await h.get()
        assert h.llm_calls == 2

    @pytest.mark.asyncio
    async def test_doc_older_than_the_ceiling_regenerates(self, h):
        from datetime import timedelta
        await h.get()
        h.store[USER_ID]["generatedAt"] = datetime.utcnow() - timedelta(minutes=300)
        await h.get()
        assert h.llm_calls == 2


class TestInvalidationAndFailures:
    @pytest.mark.asyncio
    async def test_answering_invalidates_the_cache(self, h, monkeypatch):
        monkeypatch.setattr(cq, "_save_checkin_entry", AsyncMock())
        await h.get()
        assert USER_ID in h.store

        await cq.post_coach_reply(
            current_user=CURRENT_USER,
            payload={"question": "Ready for Endurance 2?", "answer": "Yes"},
        )
        assert h.store == {}

        await h.get()
        assert h.llm_calls == 3  # question, reply, question again

    @pytest.mark.asyncio
    async def test_fallback_is_never_cached(self, h):
        h.client.chat.completions.create = AsyncMock(side_effect=RuntimeError("openai down"))
        result = await h.get()
        assert result["fallback"] is True
        assert h.store == {}

    @pytest.mark.asyncio
    async def test_fingerprint_failure_degrades_to_always_regenerating(self, h, monkeypatch):
        """A keying bug must never 500 and must never serve a stale answer — it
        falls back to the old always-generate behaviour."""
        monkeypatch.setattr(cq, "fingerprint", MagicMock(side_effect=RuntimeError("boom")))
        first = await h.get()
        second = await h.get()
        assert first.get("fallback") is None
        assert first["question"] == LLM_ANSWER["question"]
        assert second.get("cached") is None
        assert h.llm_calls == 2
        # The doc is still written so the sensei's pending check-in survives.
        assert h.store[USER_ID]["inputsHash"] is None

    @pytest.mark.asyncio
    async def test_summarizer_spawns_exactly_once_per_request(self, h):
        """Guards the refactor that collapsed two spawn sites (the old cache-hit
        return and the pre-LLM path) into one."""
        await h.get()
        assert h.spawns == 1
        await h.get()  # cache hit
        assert h.spawns == 2


class TestSortDeterminism:
    """Equal sort keys have no guaranteed order in Mongo, and the fingerprint
    hashes the RENDERED block — so without an _id tiebreaker the cache would
    thrash for an athlete who changed nothing."""

    @pytest.mark.asyncio
    async def test_calendar_events_are_tiebroken_by_id(self, monkeypatch):
        from app.core.agents.services.calendar_service import CalendarService

        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=[])
        db = MagicMock()
        db.calendarevents.find = MagicMock(return_value=cursor)
        monkeypatch.setattr(
            "app.core.agents.services.calendar_service.get_user_today",
            AsyncMock(return_value=(datetime(2026, 7, 26), "UTC")),
        )

        await CalendarService(db).get_calendar_events(
            USER_ID, {"startDate": "2026-07-12", "endDate": "2026-08-09"})

        assert cursor.sort.call_args[0][0] == [("date", 1), ("_id", 1)]

    @pytest.mark.asyncio
    async def test_external_activities_are_tiebroken_by_id(self, monkeypatch):
        from app.core.agents.data_reader import DataReaderAgent

        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.limit = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=[])
        db = MagicMock()
        db.externalactivities.find = MagicMock(return_value=cursor)

        await DataReaderAgent(db)._load_external_activities(USER_ID, days=7)

        assert cursor.sort.call_args[0][0] == [("startDate", -1), ("_id", -1)]
