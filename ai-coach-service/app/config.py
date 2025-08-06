from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # MongoDB Configuration (existing database)
    mongodb_url: str
    mongodb_database: str = "ripped-potato"
    
    # AI Model Configuration
    openai_api_key: str
    openai_model: str = "gpt-3.5-turbo"
    
    # Security
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    
    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:5001"
    
    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()