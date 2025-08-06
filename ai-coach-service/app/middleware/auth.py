from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from typing import Optional, Dict, Any
from app.config import get_settings

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """Extract user from JWT - compatible with Node.js backend tokens"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
    
    settings = get_settings()
    token = credentials.credentials
    
    try:
        payload = jwt.decode(
            token, 
            settings.jwt_secret_key, 
            algorithms=[settings.jwt_algorithm]
        )
        
        # Node.js backend uses 'id' field for user ID
        user_id: str = payload.get("id")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Invalid token - no user ID"
            )
        
        return {
            "user_id": user_id,
            "email": payload.get("email"),
            "username": payload.get("username")
        }
    except JWTError as e:
        import structlog
        logger = structlog.get_logger()
        logger.error(f"JWT decode error: {e}")
        logger.error(f"Token: {token[:20]}...")
        logger.error(f"Secret: {settings.jwt_secret_key[:10]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"Invalid token: {str(e)}"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[Dict[str, Any]]:
    """Optional authentication - returns None if no token provided"""
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None