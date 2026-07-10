from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from functools import lru_cache
import os


def read_secret_file(filename: str) -> Optional[str]:
    """Read a secret from Render's secret files location"""
    secret_path = f"/etc/secrets/{filename}"
    if os.path.exists(secret_path):
        with open(secret_path, 'r') as f:
            return f.read().strip()
    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # MongoDB Configuration (existing database)
    mongodb_url: str
    mongodb_database: str = "ripped-potato"

    # Redis Configuration
    redis_url: str = "redis://localhost:6379"
    redis_ttl: int = 3600

    # AI Model Configuration — required, set in .env (OPENAI_MODEL / OPENAI_MODEL_FAST)
    openai_api_key: str
    openai_model: str
    # Model for auxiliary calls (suggestions, train-now, reflection).
    openai_model_fast: str
    # Optional stronger model for plan generation only (macro/periodization
    # reasoning). None = fall back to openai_model; resolve at the call site.
    openai_model_planner: Optional[str] = None

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:5001"

    # Tavily Web Search API
    tavily_api_key: Optional[str] = None

    # YouTube Data API v3 — used to find and quality-rank exercise-demo videos.
    # Env: YOUTUBE_API_KEY. Optional: without it, video search falls back to Tavily.
    youtube_api_key: Optional[str] = None

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Try to load API keys from Render secret files if not set via env
        if not self.tavily_api_key:
            secret_key = read_secret_file("TAVILY_API_KEY")
            if secret_key:
                object.__setattr__(self, 'tavily_api_key', secret_key)
        if not self.youtube_api_key:
            secret_key = read_secret_file("YOUTUBE_API_KEY")
            if secret_key:
                object.__setattr__(self, 'youtube_api_key', secret_key)


@lru_cache()
def get_settings() -> Settings:
    return Settings()