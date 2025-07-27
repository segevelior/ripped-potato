from fastapi import APIRouter
from app.api.v1.auth.auth import router as auth_router
from app.api.v1.endpoints.exercises import router as exercises_router
from app.api.v1.endpoints.workouts import router as workouts_router
from app.api.v1.endpoints.goals import router as goals_router
from app.api.v1.endpoints.plans import router as plans_router
from app.api.v1.endpoints.workout_templates import router as workout_templates_router
from app.api.v1.endpoints.predefined_workouts import router as predefined_workouts_router
from app.api.v1.endpoints.progression_paths import router as progression_paths_router
from app.api.v1.endpoints.user_goal_progress import router as user_goal_progress_router
from app.api.v1.endpoints.disciplines import router as disciplines_router
from app.api.v1.endpoints.workout_types import router as workout_types_router
from app.api.v1.endpoints.training_plans import router as training_plans_router
from app.api.v1.endpoints.user_training_patterns import router as user_training_patterns_router
from app.api.v1.endpoints.external_activities import router as external_activities_router

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

api_router.include_router(
    workouts_router,
    prefix="/workouts",
    tags=["workouts"]
)

api_router.include_router(
    goals_router,
    prefix="/goals",
    tags=["goals"]
)

api_router.include_router(
    plans_router,
    prefix="/plans",
    tags=["plans"]
)

api_router.include_router(
    workout_templates_router,
    prefix="/workout-templates",
    tags=["workout-templates"]
)

api_router.include_router(
    predefined_workouts_router,
    prefix="/predefined-workouts",
    tags=["predefined-workouts"]
)

api_router.include_router(
    progression_paths_router,
    prefix="/progression-paths",
    tags=["progression-paths"]
)

api_router.include_router(
    user_goal_progress_router,
    prefix="/user-goal-progress",
    tags=["user-goal-progress"]
)

api_router.include_router(
    disciplines_router,
    prefix="/disciplines",
    tags=["disciplines"]
)

api_router.include_router(
    workout_types_router,
    prefix="/workout-types",
    tags=["workout-types"]
)

api_router.include_router(
    training_plans_router,
    prefix="/training-plans",
    tags=["training-plans"]
)

api_router.include_router(
    user_training_patterns_router,
    prefix="/user-training-patterns",
    tags=["user-training-patterns"]
)

api_router.include_router(
    external_activities_router,
    prefix="/external-activities",
    tags=["external-activities"]
) 