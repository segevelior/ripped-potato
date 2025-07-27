from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.workout_type import WorkoutType
from app.schemas.workout_type import (
    WorkoutTypeCreateSchema,
    WorkoutTypeUpdateSchema,
    WorkoutTypeResponseSchema,
    WorkoutTypeListSchema,
    WorkoutTypeStatsSchema,
    WorkoutTypeSearchSchema,
    WorkoutTypeInfoSchema,
    AddRatingSchema,
    CalorieBurnEstimateSchema,
    CompatibilityCheckSchema,
    SuitabilityCheckSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[WorkoutTypeListSchema])
async def list_workout_types(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
    skill_level: Optional[str] = Query(None),
    intensity_level: Optional[str] = Query(None),
    is_featured: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(True),
    current_user: User = Depends(get_current_user)
):
    """List all workout types"""
    query = {}
    
    if is_active is not None:
        query["is_active"] = is_active
    if category:
        query["category"] = category
    if skill_level:
        query["skill_level_required"] = skill_level
    if intensity_level:
        query["characteristics.intensity_level"] = intensity_level
    if is_featured is not None:
        query["is_featured"] = is_featured
    
    workout_types = await WorkoutType.find(
        query,
        sort=[("is_featured", -1), ("popularity_score", -1), ("name", 1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    # Transform to list schema format
    result = []
    for workout_type in workout_types:
        duration_range = workout_type.get_duration_range()
        result.append(WorkoutTypeListSchema(
            **workout_type.model_dump(),
            intensity_level=workout_type.characteristics.intensity_level,
            duration_range=duration_range
        ))
    
    return result


@router.post("/search", response_model=List[WorkoutTypeListSchema])
async def search_workout_types(
    search_params: WorkoutTypeSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for workout types"""
    filters = [{"is_active": True}]
    
    if search_params.query:
        filters.append(Or(
            Regex(WorkoutType.name, search_params.query, "i"),
            Regex(WorkoutType.description, search_params.query, "i"),
            In(WorkoutType.keywords, [search_params.query.lower()])
        ))
    
    if search_params.category:
        filters.append({"category": search_params.category})
    
    if search_params.subcategory:
        filters.append({"subcategory": search_params.subcategory})
    
    if search_params.skill_level_required:
        filters.append({"skill_level_required": search_params.skill_level_required})
    
    if search_params.intensity_level:
        filters.append({"characteristics.intensity_level": search_params.intensity_level})
    
    if search_params.primary_benefits:
        filters.append(In(WorkoutType.primary_benefits, search_params.primary_benefits))
    
    if search_params.equipment_required:
        filters.append(In(WorkoutType.equipment_required, search_params.equipment_required))
    
    if search_params.space_requirements:
        filters.append(In(WorkoutType.space_requirements, search_params.space_requirements))
    
    if search_params.suitable_for_goals:
        filters.append(In(WorkoutType.suitable_for_goals, search_params.suitable_for_goals))
    
    if search_params.min_duration:
        filters.append({"characteristics.typical_duration_min": {"$gte": search_params.min_duration}})
    
    if search_params.max_duration:
        filters.append({"characteristics.typical_duration_max": {"$lte": search_params.max_duration}})
    
    if search_params.energy_system:
        filters.append({"characteristics.primary_energy_system": search_params.energy_system})
    
    if search_params.is_featured is not None:
        filters.append({"is_featured": search_params.is_featured})
    
    if search_params.min_rating:
        filters.append({"user_rating_average": {"$gte": search_params.min_rating}})
    
    if search_params.tags:
        filters.append(In(WorkoutType.tags, search_params.tags))
    
    workout_types = await WorkoutType.find(
        And(*filters),
        sort=[("popularity_score", -1), ("user_rating_average", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    # Transform to list schema format
    result = []
    for workout_type in workout_types:
        duration_range = workout_type.get_duration_range()
        result.append(WorkoutTypeListSchema(
            **workout_type.model_dump(),
            intensity_level=workout_type.characteristics.intensity_level,
            duration_range=duration_range
        ))
    
    return result


@router.get("/stats", response_model=WorkoutTypeStatsSchema)
async def get_workout_type_stats(current_user: User = Depends(get_current_user)):
    """Get workout type statistics"""
    workout_types = await WorkoutType.find({"is_active": True}).to_list()
    
    total_workout_types = len(workout_types)
    featured_types_count = len([wt for wt in workout_types if wt.is_featured])
    
    # Group by category, skill level, and intensity
    types_by_category = {}
    types_by_skill_level = {}
    types_by_intensity = {}
    total_usage_count = 0
    ratings = []
    
    for workout_type in workout_types:
        # Category distribution
        types_by_category[workout_type.category] = types_by_category.get(workout_type.category, 0) + 1
        
        # Skill level distribution
        types_by_skill_level[workout_type.skill_level_required] = types_by_skill_level.get(workout_type.skill_level_required, 0) + 1
        
        # Intensity distribution
        intensity = workout_type.characteristics.intensity_level
        types_by_intensity[intensity] = types_by_intensity.get(intensity, 0) + 1
        
        # Totals
        total_usage_count += workout_type.usage_count
        
        # Ratings
        if workout_type.user_rating_count > 0:
            ratings.append(workout_type.user_rating_average)
    
    # Calculate average rating
    average_rating = sum(ratings) / len(ratings) if ratings else 0.0
    
    # Get most popular workout types (top 5)
    most_popular = await WorkoutType.find(
        {"is_active": True},
        sort=[("popularity_score", -1)],
        limit=5
    ).to_list()
    
    most_popular_list = []
    for workout_type in most_popular:
        duration_range = workout_type.get_duration_range()
        most_popular_list.append(WorkoutTypeListSchema(
            **workout_type.model_dump(),
            intensity_level=workout_type.characteristics.intensity_level,
            duration_range=duration_range
        ))
    
    return WorkoutTypeStatsSchema(
        total_workout_types=total_workout_types,
        types_by_category=types_by_category,
        types_by_skill_level=types_by_skill_level,
        types_by_intensity=types_by_intensity,
        featured_types_count=featured_types_count,
        most_popular_types=most_popular_list,
        average_rating=average_rating,
        total_usage_count=total_usage_count
    )


@router.get("/{workout_type_id}", response_model=WorkoutTypeResponseSchema)
async def get_workout_type(
    workout_type_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific workout type"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    return workout_type


@router.get("/slug/{slug}", response_model=WorkoutTypeResponseSchema)
async def get_workout_type_by_slug(
    slug: str,
    current_user: User = Depends(get_current_user)
):
    """Get a workout type by its slug"""
    workout_type = await WorkoutType.find_one({"slug": slug, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    return workout_type


@router.get("/{workout_type_id}/info", response_model=WorkoutTypeInfoSchema)
async def get_workout_type_comprehensive_info(
    workout_type_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive workout type information"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    info = workout_type.get_comprehensive_info()
    return WorkoutTypeInfoSchema(**info)


@router.get("/category/{category}", response_model=List[WorkoutTypeListSchema])
async def get_workout_types_by_category(
    category: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get workout types by category"""
    workout_types = await WorkoutType.find(
        {"category": category, "is_active": True},
        sort=[("is_featured", -1), ("popularity_score", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    result = []
    for workout_type in workout_types:
        duration_range = workout_type.get_duration_range()
        result.append(WorkoutTypeListSchema(
            **workout_type.model_dump(),
            intensity_level=workout_type.characteristics.intensity_level,
            duration_range=duration_range
        ))
    
    return result


@router.post("/{workout_type_id}/estimate-calories", response_model=Dict[str, float])
async def estimate_calorie_burn(
    workout_type_id: PydanticObjectId,
    calorie_data: CalorieBurnEstimateSchema,
    current_user: User = Depends(get_current_user)
):
    """Estimate calorie burn for a workout type"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    calories_per_hour = workout_type.estimate_calories_burned_per_hour(calorie_data.user_weight_kg)
    
    if not calories_per_hour:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to estimate calories for this workout type"
        )
    
    duration_range = workout_type.get_duration_range()
    result = {"calories_per_hour": calories_per_hour}
    
    if duration_range:
        result["calories_per_typical_session_min"] = (calories_per_hour / 60) * duration_range["min_minutes"]
        result["calories_per_typical_session_max"] = (calories_per_hour / 60) * duration_range["max_minutes"]
        result["calories_per_typical_session_avg"] = (calories_per_hour / 60) * duration_range["average_minutes"]
    
    return result


@router.post("/{workout_type_id}/check-suitability", response_model=Dict[str, Any])
async def check_suitability(
    workout_type_id: PydanticObjectId,
    suitability_data: SuitabilityCheckSchema,
    current_user: User = Depends(get_current_user)
):
    """Check if a workout type is suitable for user's conditions"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    suitable_for_skill = workout_type.is_suitable_for_skill_level(suitability_data.user_skill_level)
    suitable_for_equipment = workout_type.can_be_performed_with_equipment(suitability_data.available_equipment)
    suitable_for_space = workout_type.can_be_performed_in_space(suitability_data.available_space)
    
    overall_suitable = suitable_for_skill and suitable_for_equipment and suitable_for_space
    
    limitations = []
    if not suitable_for_skill:
        limitations.append(f"Requires {workout_type.skill_level_required} skill level")
    if not suitable_for_equipment:
        missing_equipment = set(workout_type.equipment_required) - set(suitability_data.available_equipment)
        limitations.append(f"Missing equipment: {', '.join(missing_equipment)}")
    if not suitable_for_space:
        limitations.append(f"Requires one of: {', '.join(workout_type.space_requirements)}")
    
    return {
        "overall_suitable": overall_suitable,
        "skill_level_suitable": suitable_for_skill,
        "equipment_suitable": suitable_for_equipment,
        "space_suitable": suitable_for_space,
        "limitations": limitations,
        "progression_suggestions": workout_type.get_progression_suggestions()
    }


@router.post("/{workout_type_id}/check-compatibility", response_model=Dict[str, Any])
async def check_compatibility(
    workout_type_id: PydanticObjectId,
    compatibility_data: CompatibilityCheckSchema,
    current_user: User = Depends(get_current_user)
):
    """Check compatibility with other workout types"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    # Get other workout types
    other_types = await WorkoutType.find(
        {"_id": {"$in": compatibility_data.other_workout_type_ids}, "is_active": True}
    ).to_list()
    
    compatibility_results = []
    for other_type in other_types:
        is_compatible = workout_type.is_compatible_with(other_type.slug)
        compatibility_results.append({
            "workout_type_id": str(other_type.id),
            "workout_type_name": other_type.name,
            "is_compatible": is_compatible,
            "can_combine": other_type.slug in workout_type.can_be_combined_with,
            "conflicts": other_type.slug in workout_type.conflicts_with
        })
    
    return {
        "base_workout_type": workout_type.name,
        "compatibility_results": compatibility_results,
        "recovery_recommendation": workout_type.get_recovery_recommendation()
    }


@router.post("/", response_model=WorkoutTypeResponseSchema)
async def create_workout_type(
    workout_type_data: WorkoutTypeCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new workout type (admin only in production)"""
    # Check if slug already exists
    existing = await WorkoutType.find_one({"slug": workout_type_data.slug})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workout type with this slug already exists"
        )
    
    workout_type = WorkoutType(
        created_by_user_id=current_user.id,
        is_system_type=False,  # User-created types are not system types
        approved_by_admin=False,  # Require admin approval
        **workout_type_data.model_dump()
    )
    
    # Validate structure
    if not workout_type.validate_workout_structure():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workout type structure"
        )
    
    # Calculate initial popularity score
    workout_type.calculate_popularity_score()
    
    await workout_type.insert()
    return workout_type


@router.put("/{workout_type_id}", response_model=WorkoutTypeResponseSchema)
async def update_workout_type(
    workout_type_id: PydanticObjectId,
    workout_type_data: WorkoutTypeUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a workout type (creator or admin only)"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    # Check permissions (in production, add admin check)
    if workout_type.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this workout type"
        )
    
    # Update fields
    update_data = workout_type_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workout_type, field, value)
    
    # Validate structure
    if not workout_type.validate_workout_structure():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workout type structure"
        )
    
    # Recalculate popularity score
    workout_type.calculate_popularity_score()
    workout_type.updated_at = datetime.utcnow()
    
    await workout_type.save()
    return workout_type


@router.post("/{workout_type_id}/rate", response_model=WorkoutTypeResponseSchema)
async def rate_workout_type(
    workout_type_id: PydanticObjectId,
    rating_data: AddRatingSchema,
    current_user: User = Depends(get_current_user)
):
    """Add a rating to a workout type"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    # Add rating
    workout_type.add_rating(rating_data.rating)
    
    # Recalculate popularity score
    workout_type.calculate_popularity_score()
    workout_type.updated_at = datetime.utcnow()
    
    await workout_type.save()
    return workout_type


@router.post("/{workout_type_id}/increment-usage", response_model=WorkoutTypeResponseSchema)
async def increment_usage(
    workout_type_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Increment usage count for a workout type"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id, "is_active": True})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    # Increment usage
    workout_type.increment_usage()
    
    # Recalculate popularity score
    workout_type.calculate_popularity_score()
    workout_type.updated_at = datetime.utcnow()
    
    await workout_type.save()
    return workout_type


@router.delete("/{workout_type_id}")
async def delete_workout_type(
    workout_type_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a workout type (soft delete - mark as inactive)"""
    workout_type = await WorkoutType.find_one({"_id": workout_type_id})
    
    if not workout_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout type not found"
        )
    
    # Check permissions
    if workout_type.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this workout type"
        )
    
    # Soft delete - mark as inactive
    workout_type.is_active = False
    workout_type.updated_at = datetime.utcnow()
    
    await workout_type.save()
    return {"message": "Workout type deactivated successfully"}