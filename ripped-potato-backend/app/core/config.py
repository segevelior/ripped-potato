from typing import Optional, List
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Ripped Potato API"
    DEBUG: bool = True
    VERSION: str = "1.0.0"
    
    # Database
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ripped_potato"
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-change-this"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = None

    @property
    def BACKEND_CORS_ORIGINS_LIST(self) -> List[str]:
        base_origins = [self.FRONTEND_URL]
        return base_origins + [str(origin) for origin in self.BACKEND_CORS_ORIGINS]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings() 