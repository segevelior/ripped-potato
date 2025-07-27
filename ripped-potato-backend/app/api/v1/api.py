from fastapi import APIRouter
from app.api.v1.auth.auth import router as auth_router
from app.api.v1.endpoints.exercises import router as exercises_router

api_router = APIRouter()

# Auth routes
api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["authentication"]
)

# Entity routes
api_router.include_router(
    exercises_router,
    prefix="/exercises",
    tags=["exercises"]
) 