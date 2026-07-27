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
    # Reasoning effort for all OpenAI calls: none | low | medium | high | xhigh.
    # Default "none": reasoning burns latency/tokens with no measured plan-quality
    # gain (A/B eval), and gpt-5.6 chat/completions rejects function tools unless
    # reasoning_effort is explicitly "none". Opt in per environment
    # (e.g. OPENAI_REASONING_EFFORT=medium on Render once verified).
    openai_reasoning_effort: str = "none"

    # Embeddings for exercise similarity search. Must match the Node backend's
    # EmbeddingService (EMBEDDING_MODEL / EMBEDDING_DIMS) — both services write
    # vectors to the same exercises.embedding field / Atlas vector index.
    embedding_model: str = "text-embedding-3-small"
    embedding_dims: int = 1536

    # Auto-promotion of durable facts from conversations/check-ins into the
    # persistent usermemories store. Env: MEMORY_AUTO_PROMOTE_ENABLED.
    memory_auto_promote_enabled: bool = True
    # Max durable memories kept per user before low-importance eviction kicks in.
    memory_max_per_user: int = 60

    # Read-time memory ranking: importance weight x exponential recency decay
    # on updatedAt. False = legacy importance-then-recency sort.
    memory_decay_enabled: bool = True
    memory_decay_half_life_days: float = 60.0
    # Goals decay slower than preferences/lifestyle/general.
    memory_decay_half_life_goal_days: float = 120.0
    # Categories that never decay (salience floor — injuries must not fade).
    memory_decay_exempt_categories: str = "health"
    # Memories scoring below this are not injected into prompts at all.
    memory_score_floor: float = 0.05

    # Check-in entries (transient state: sleep/fatigue/mood) older than this are
    # excluded from prompt context. Read-time gate only — the 14-day physical
    # TTL on shortTermContext is unchanged. Matches the coach-question prompt's
    # "older than 3 days = expired" rule.
    checkin_context_max_age_days: int = 3

    # Staleness ceiling on the fingerprint-cached Today coach question, and the
    # env-only escape hatch: 0 disables the cache entirely (every request
    # regenerates). NOT the primary freshness mechanism — the input fingerprint
    # is (app/core/llm_cache.py); this only caps the tail, bounding the
    # "generated at 07:00, served at 11:55, reads as 'this morning'" window
    # without touching the prompt. Env: COACH_QUESTION_CACHE_MAX_AGE_MINUTES.
    coach_question_cache_max_age_minutes: int = 240

    @property
    def memory_decay_exempt_set(self) -> set:
        return {c.strip() for c in self.memory_decay_exempt_categories.split(",") if c.strip()}

    def llm_tuning_params(self, temperature: Optional[float] = None) -> dict:
        """Sampling/reasoning kwargs for chat.completions.create.

        gpt-5.6 models accept only the default temperature (custom values 400),
        so temperature is never sent — the parameter is kept for call-site
        documentation of intent. reasoning_effort is always sent explicitly:
        gpt-5.6 rejects function tools on chat/completions unless it is "none".
        """
        return {"reasoning_effort": self.openai_reasoning_effort}

    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    # Shared secret for internal (cron-invoked) endpoints — X-Internal-Key
    # header. Unset = internal endpoints disabled (403).
    internal_api_key: Optional[str] = None

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