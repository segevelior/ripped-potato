"""
Guards + fixtures for the real-LLM eval suite.

These tests cost real OpenAI tokens and hit the Atlas cluster (scratch DB).
They never run by default: the directory is outside pyproject's testpaths AND
every test is skipped unless RUN_LLM_EVALS=1.
"""
import os
import time

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings


def pytest_collection_modifyitems(config, items):
    if os.environ.get("RUN_LLM_EVALS") != "1":
        skip = pytest.mark.skip(
            reason="real-LLM evals: set RUN_LLM_EVALS=1 to run (costs tokens)"
        )
        for item in items:
            item.add_marker(skip)


@pytest.fixture
async def scratch_db():
    """A per-test scratch database on the configured cluster, dropped after.
    Follows the project convention: no local Mongo — throwaway data on the
    Atlas cluster, removed unconditionally in teardown."""
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    name = f"sensei-evals-{os.getpid()}-{int(time.time() * 1000)}"
    assert name != settings.mongodb_database, "scratch DB must never be the real DB"
    db = client[name]
    try:
        yield db
    finally:
        await client.drop_database(name)
        client.close()
