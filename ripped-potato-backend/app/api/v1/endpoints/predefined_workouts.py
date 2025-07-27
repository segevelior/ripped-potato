from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.predefined_workout import PredefinedWorkout
from app.schemas.predefined_workout import (
    PredefinedWorkoutResponseSchema,
    PredefinedWorkoutListSchema,
    PredefinedWorkoutSearchSchema,
    PredefinedWorkoutStatsSchema,
    WorkoutVolumeAnalysisSchema,
    WorkoutDifficultyAnalysisSchema,
    WorkoutRecommendationSchema,
    WorkoutSuitabilitySchema,
    RatePredefinedWorkoutSchema,
    WorkoutEquipmentCheckSchema,
    WorkoutFilterSchema,
    WorkoutRecommendationRequestSchema,
    CreateFromPredefinedSchema
)
from app.models.utils import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[PredefinedWorkoutListSchema])
async def list_predefined_workouts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    workout_type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    difficulty_level: Optional[str] = Query(None),
    is_featured: Optional[bool] = Query(None),
    sort_by: str = Query("popularity", regex="^(popularity|rating|newest|duration|name)$"),
    current_user: User = Depends(get_current_user)
):
    """List predefined workouts with filtering and sorting"""
    query = {"is_active": True}
    
    # Apply filters
    if workout_type:
        query["workout_type"] = workout_type
    if category:
        query["category"] = category
    if difficulty_level:
        query["difficulty_level"] = difficulty_level
    if is_featured is not None:
        query["is_featured"] = is_featured
    
    # Determine sort order
    sort_field = {
        "popularity": [("popularity_score", -1), ("rating_average", -1)],
        "rating": [("rating_average", -1), ("rating_count", -1)],
        "newest": [("created_at", -1)],
        "duration": [("estimated_duration_minutes", 1)],
        "name": [("name", 1)]
    }.get(sort_by, [("popularity_score", -1)])
    
    workouts = await PredefinedWorkout.find(
        query,
        sort=sort_field,
        skip=skip,
        limit=limit
    ).to_list()
    
    return workouts


@router.post("/search", response_model=List[PredefinedWorkoutListSchema])
async def search_predefined_workouts(
    search_params: PredefinedWorkoutSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for predefined workouts"""
    filters = [{"is_active": True}]
    
    # Text search
    if search_params.query:
        filters.append(Or(
            Regex(PredefinedWorkout.name, search_params.query, "i"),
            Regex(PredefinedWorkout.description, search_params.query, "i"),
            In(PredefinedWorkout.tags, [search_params.query])
        ))
    
    # Category filters
    if search_params.workout_type:
        filters.append({"workout_type": search_params.workout_type})
    
    if search_params.category:
        filters.append({"category": search_params.category})
    
    if search_params.difficulty_level:
        filters.append({"difficulty_level": search_params.difficulty_level})
    
    if search_params.intensity_level:
        filters.append({"intensity_level": search_params.intensity_level})
    
    if search_params.best_time_of_day:
        filters.append({"best_time_of_day": search_params.best_time_of_day})
    
    # Array filters
    if search_params.primary_muscle_groups:
        filters.append(In(PredefinedWorkout.primary_muscle_groups, search_params.primary_muscle_groups))
    
    if search_params.equipment_required:
        filters.append(In(PredefinedWorkout.equipment_required, search_params.equipment_required))
    
    if search_params.tags:
        filters.append(In(PredefinedWorkout.tags, search_params.tags))
    
    if search_params.primary_goals:
        filters.append(In(PredefinedWorkout.primary_goals, search_params.primary_goals))
    
    if search_params.space_requirements:
        filters.append(In(PredefinedWorkout.space_requirements, search_params.space_requirements))
    
    # Boolean filters
    if search_params.is_featured is not None:
        filters.append({"is_featured": search_params.is_featured})
    
    # Range filters
    if search_params.min_duration:
        filters.append({"estimated_duration_minutes": {"$gte": search_params.min_duration}})
    
    if search_params.max_duration:
        filters.append({"estimated_duration_minutes": {"$lte": search_params.max_duration}})
    
    if search_params.min_rating:
        filters.append({"rating_average": {"$gte": search_params.min_rating}})
    
    workouts = await PredefinedWorkout.find(
        And(*filters),
        sort=[("popularity_score", -1), ("rating_average", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return workouts


@router.get("/stats", response_model=PredefinedWorkoutStatsSchema)
async def get_predefined_workout_stats(current_user: User = Depends(get_current_user)):
    """Get statistics about predefined workouts"""
    workouts = await PredefinedWorkout.find({"is_active": True}).to_list()
    
    total_workouts = len(workouts)
    featured_count = len([w for w in workouts if w.is_featured])
    premium_count = len([w for w in workouts if w.is_premium])
    
    # Calculate average rating
    rated_workouts = [w for w in workouts if w.rating_count > 0]
    average_rating = (
        sum(w.rating_average for w in rated_workouts) / len(rated_workouts)
        if rated_workouts else 0.0
    )
    
    # Group by categories
    workouts_by_type = {}
    workouts_by_category = {}
    workouts_by_difficulty = {}
    
    for workout in workouts:
        workouts_by_type[workout.workout_type] = workouts_by_type.get(workout.workout_type, 0) + 1
        workouts_by_category[workout.category] = workouts_by_category.get(workout.category, 0) + 1
        workouts_by_difficulty[workout.difficulty_level] = workouts_by_difficulty.get(workout.difficulty_level, 0) + 1
    
    # Find most popular workout
    most_popular = max(workouts, key=lambda w: w.popularity_score) if workouts else None
    most_popular_name = most_popular.name if most_popular else None
    
    return PredefinedWorkoutStatsSchema(
        total_workouts=total_workouts,
        workouts_by_type=workouts_by_type,
        workouts_by_category=workouts_by_category,
        workouts_by_difficulty=workouts_by_difficulty,
        average_rating=average_rating,
        most_popular_workout=most_popular_name,
        featured_count=featured_count,
        premium_count=premium_count
    )


@router.get("/featured", response_model=List[PredefinedWorkoutListSchema])
async def get_featured_workouts(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user)
):
    """Get featured workouts"""
    workouts = await PredefinedWorkout.find(
        {"is_active": True, "is_featured": True},
        sort=[("popularity_score", -1)],
        limit=limit
    ).to_list()
    
    return workouts


@router.post("/recommendations", response_model=List[PredefinedWorkoutListSchema])
async def get_workout_recommendations(
    request: WorkoutRecommendationRequestSchema,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user)
):
    """Get personalized workout recommendations"""
    filters = [{"is_active": True}]
    
    # Filter by difficulty level
    filters.append({"difficulty_level": request.difficulty_level})
    
    # Filter by duration
    filters.append({"estimated_duration_minutes": {"$lte": request.max_duration_minutes}})
    
    # Filter by equipment if specified
    if request.available_equipment:
        # Find workouts that require only available equipment
        workouts_query = await PredefinedWorkout.find(And(*filters)).to_list()
        suitable_workouts = [
            w for w in workouts_query 
            if w.is_suitable_for_equipment(request.available_equipment)
        ]
    else:
        suitable_workouts = await PredefinedWorkout.find(And(*filters)).to_list()
    
    # Filter by goals
    if request.user_goals:
        suitable_workouts = [
            w for w in suitable_workouts
            if w.is_suitable_for_goals(request.user_goals)
        ]
    
    # Filter by muscle groups if specified
    if request.preferred_muscle_groups:
        suitable_workouts = [
            w for w in suitable_workouts
            if any(mg in w.primary_muscle_groups for mg in request.preferred_muscle_groups)
        ]
    
    # Filter by workout type if specified
    if request.workout_type:
        suitable_workouts = [w for w in suitable_workouts if w.workout_type == request.workout_type]
    
    # Filter by intensity if specified
    if request.intensity_preference:
        suitable_workouts = [w for w in suitable_workouts if w.intensity_level == request.intensity_preference]
    
    # Filter by space requirements if specified
    if request.space_requirements:
        suitable_workouts = [
            w for w in suitable_workouts
            if any(sr in w.space_requirements for sr in request.space_requirements)
        ]
    
    # Sort by popularity and rating
    suitable_workouts.sort(key=lambda w: (w.popularity_score, w.rating_average), reverse=True)
    
    return suitable_workouts[:limit]


@router.get("/{workout_id}", response_model=PredefinedWorkoutResponseSchema)
async def get_predefined_workout(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific predefined workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    return workout


@router.get("/{workout_id}/volume", response_model=WorkoutVolumeAnalysisSchema)
async def get_workout_volume_analysis(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get volume analysis for a predefined workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    volume_data = workout.calculate_estimated_volume()
    superset_groups = workout.get_superset_groups()
    muscle_groups = workout.get_muscle_groups()
    
    return WorkoutVolumeAnalysisSchema(
        total_exercises=volume_data["total_exercises"],
        total_sets=volume_data["total_sets"],
        sets_per_exercise=volume_data["sets_per_exercise"],
        estimated_duration=volume_data["estimated_duration"],
        superset_count=len(superset_groups),
        muscle_groups_targeted=len(muscle_groups)
    )


@router.get("/{workout_id}/difficulty", response_model=WorkoutDifficultyAnalysisSchema)
async def get_workout_difficulty_analysis(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get difficulty analysis for a predefined workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    factors = workout.get_difficulty_factors()
    
    return WorkoutDifficultyAnalysisSchema(**factors)


@router.post("/{workout_id}/recommendations", response_model=WorkoutRecommendationSchema)
async def get_personalized_workout_recommendations(
    workout_id: PydanticObjectId,
    user_level: str = Query(..., regex="^(beginner|intermediate|advanced|expert)$"),
    user_goals: List[str] = Query(...),
    current_user: User = Depends(get_current_user)
):
    """Get personalized recommendations for a specific workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    recommendations = workout.get_personalized_recommendations(user_level, user_goals)
    
    return WorkoutRecommendationSchema(**recommendations)


@router.post("/{workout_id}/suitability", response_model=WorkoutSuitabilitySchema)
async def check_workout_suitability(
    workout_id: PydanticObjectId,
    filter_params: WorkoutFilterSchema,
    current_user: User = Depends(get_current_user)
):
    """Check if a workout is suitable for user's constraints"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    equipment_match = workout.is_suitable_for_equipment(filter_params.available_equipment)
    duration_match = workout.is_suitable_for_duration(filter_params.max_duration_minutes)
    goal_match = workout.is_suitable_for_goals(filter_params.user_goals)
    difficulty_appropriate = workout.difficulty_level in filter_params.difficulty_levels
    
    # Calculate overall score
    factors = [equipment_match, duration_match, goal_match, difficulty_appropriate]
    overall_score = sum(factors) / len(factors)
    
    return WorkoutSuitabilitySchema(
        equipment_match=equipment_match,
        duration_match=duration_match,
        goal_match=goal_match,
        difficulty_appropriate=difficulty_appropriate,
        overall_score=overall_score
    )


@router.post("/{workout_id}/equipment-check", response_model=Dict[str, Any])
async def check_equipment_requirements(
    workout_id: PydanticObjectId,
    equipment_check: WorkoutEquipmentCheckSchema,
    current_user: User = Depends(get_current_user)
):
    """Check equipment requirements for a workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    can_perform = workout.is_suitable_for_equipment(equipment_check.available_equipment)
    
    required_equipment = set(workout.equipment_required)
    available_equipment = set(equipment_check.available_equipment)
    missing_equipment = list(required_equipment - available_equipment)
    
    return {
        "can_perform": can_perform,
        "required_equipment": workout.equipment_required,
        "missing_equipment": missing_equipment,
        "alternatives": []  # Could implement exercise alternatives
    }


@router.post("/{workout_id}/rate", response_model=PredefinedWorkoutResponseSchema)
async def rate_predefined_workout(
    workout_id: PydanticObjectId,
    rating_data: RatePredefinedWorkoutSchema,
    current_user: User = Depends(get_current_user)
):
    """Rate a predefined workout"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    workout.update_rating(rating_data.rating)
    workout.updated_at = datetime.utcnow()
    await workout.save()
    
    return workout


@router.post("/{workout_id}/use", response_model=Dict[str, str])
async def use_predefined_workout(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Mark predefined workout as used (increment usage count)"""
    workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found"
        )
    
    workout.increment_usage()
    workout.updated_at = datetime.utcnow()
    await workout.save()
    
    return {"message": "Workout usage recorded"}


@router.post("/{workout_id}/create-workout", response_model=Dict[str, Any])
async def create_workout_from_predefined(
    workout_id: PydanticObjectId,
    create_data: CreateFromPredefinedSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a personal workout from a predefined workout template"""
    predefined_workout = await PredefinedWorkout.find_one({"_id": workout_id, "is_active": True})
    
    if not predefined_workout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Predefined workout not found"
        )
    
    # Increment usage count
    predefined_workout.increment_usage()
    await predefined_workout.save()
    
    # Here you would create a new Workout instance based on the predefined workout
    # This is a placeholder response
    return {
        "message": "Workout created successfully from predefined template",
        "predefined_workout_id": str(workout_id),
        "scheduled_date": create_data.scheduled_date,
        "customizations": create_data.customizations
    }