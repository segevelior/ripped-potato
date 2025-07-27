from typing import Optional
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str  # Subject (user ID)
    exp: int  # Expiration time
    type: str  # "access" or "refresh"


class RefreshTokenRequest(BaseModel):
    refresh_token: str 