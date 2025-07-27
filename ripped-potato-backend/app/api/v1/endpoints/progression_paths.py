from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.progression_path import ProgressionPath
from app.schemas.progression_path import (
    ProgressionPathCreateSchema,
    ProgressionPathUpdateSchema,
    ProgressionPathResponseSchema,
    ProgressionPathListSchema,
    ProgressionPathStatsSchema,
    ProgressionSummarySchema,
    ProgressionSearchSchema,
    StartProgressionSchema,
    FollowProgressionSchema,
    CompleteProgressionSchema,
    ProgressionStepAdvanceSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[ProgressionPathListSchema])
async def list_progression_paths(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
    difficulty_level: Optional[str] = Query(None),
    movement_pattern: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """List progression paths (public + user's own)"""
    # Build query to include public paths and user's own paths
    query_filters = [
        Or(
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        )
    ]
    
    if category:
        query_filters.append({"category": category})
    if difficulty_level:
        query_filters.append({"difficulty_level": difficulty_level})
    if movement_pattern:
        query_filters.append({"movement_pattern": movement_pattern})
    if is_public is not None:
        query_filters.append({"is_public": is_public})
    
    # Only show active paths
    query_filters.append({"is_active": True})
    
    paths = await ProgressionPath.find(
        And(*query_filters) if len(query_filters) > 1 else query_filters[0],
        sort=[("users_following", -1), ("created_at", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return paths


@router.post("/search", response_model=List[ProgressionPathListSchema])
async def search_progression_paths(
    search_params: ProgressionSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for progression paths"""
    filters = [
        Or(
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        ),
        {"is_active": True}
    ]
    
    if search_params.query:
        filters.append(Or(
            Regex(ProgressionPath.name, search_params.query, "i"),
            Regex(ProgressionPath.description, search_params.query, "i")
        ))
    
    if search_params.category:
        filters.append({"category": search_params.category})
    
    if search_params.difficulty_level:
        filters.append({"difficulty_level": search_params.difficulty_level})
    
    if search_params.movement_pattern:
        filters.append({"movement_pattern": search_params.movement_pattern})
    
    if search_params.muscle_groups:
        filters.append(In(ProgressionPath.muscle_groups, search_params.muscle_groups))
    
    if search_params.equipment_required:
        filters.append(In(ProgressionPath.equipment_required, search_params.equipment_required))
    
    if search_params.is_public is not None:
        filters.append({"is_public": search_params.is_public})
    
    if search_params.is_system_path is not None:
        filters.append({"is_system_path": search_params.is_system_path})
    
    if search_params.min_steps:
        filters.append({"total_steps": {"$gte": search_params.min_steps}})
    
    if search_params.max_steps:
        filters.append({"total_steps": {"$lte": search_params.max_steps}})
    
    if search_params.min_duration_weeks:
        filters.append({"estimated_duration_weeks": {"$gte": search_params.min_duration_weeks}})
    
    if search_params.max_duration_weeks:
        filters.append({"estimated_duration_weeks": {"$lte": search_params.max_duration_weeks}})
    
    if search_params.tags:
        filters.append(In(ProgressionPath.tags, search_params.tags))
    
    paths = await ProgressionPath.find(
        And(*filters),
        sort=[("completion_rate", -1), ("users_following", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return paths


@router.get("/stats", response_model=ProgressionPathStatsSchema)
async def get_progression_path_stats(current_user: User = Depends(get_current_user)):
    """Get progression path statistics"""
    # Get all accessible paths (public + user's own)
    paths = await ProgressionPath.find(
        Or(
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        )
    ).to_list()
    
    total_paths = len(paths)
    
    # Group by category, difficulty, and movement
    paths_by_category = {}
    paths_by_difficulty = {}
    paths_by_movement = {}
    
    system_paths_count = 0
    user_created_paths_count = 0
    completion_rates = []
    
    for path in paths:
        # Category distribution
        paths_by_category[path.category] = paths_by_category.get(path.category, 0) + 1
        
        # Difficulty distribution
        paths_by_difficulty[path.difficulty_level] = paths_by_difficulty.get(path.difficulty_level, 0) + 1
        
        # Movement pattern distribution
        paths_by_movement[path.movement_pattern] = paths_by_movement.get(path.movement_pattern, 0) + 1
        
        # System vs user created
        if path.is_system_path:
            system_paths_count += 1
        else:
            user_created_paths_count += 1
        
        # Completion rates
        if path.completion_rate > 0:
            completion_rates.append(path.completion_rate)
    
    # Calculate average completion rate
    average_completion_rate = sum(completion_rates) / len(completion_rates) if completion_rates else 0.0
    
    # Get most popular paths (top 5)
    most_popular_paths = await ProgressionPath.find(
        And(
            Or(
                {"is_public": True},
                {"created_by_user_id": current_user.id}
            ),
            {"is_active": True}
        ),
        sort=[("users_following", -1)],
        limit=5
    ).to_list()
    
    return ProgressionPathStatsSchema(
        total_paths=total_paths,
        paths_by_category=paths_by_category,
        paths_by_difficulty=paths_by_difficulty,
        paths_by_movement=paths_by_movement,
        average_completion_rate=average_completion_rate,
        most_popular_paths=most_popular_paths,
        system_paths_count=system_paths_count,
        user_created_paths_count=user_created_paths_count
    )


@router.get("/{path_id}", response_model=ProgressionPathResponseSchema)
async def get_progression_path(
    path_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific progression path"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "$or": [
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        ]
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found"
        )
    
    return path


@router.get("/{path_id}/summary", response_model=ProgressionSummarySchema)
async def get_progression_summary(
    path_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get summary statistics for a progression path"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "$or": [
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        ]
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found"
        )
    
    summary = path.get_progression_summary()
    return ProgressionSummarySchema(**summary)


@router.post("/", response_model=ProgressionPathResponseSchema)
async def create_progression_path(
    path_data: ProgressionPathCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new progression path"""
    path = ProgressionPath(
        created_by_user_id=current_user.id,
        **path_data.model_dump()
    )
    
    # Calculate total steps
    path.calculate_total_steps()
    
    # Validate step sequence
    if not path.validate_step_sequence():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid step sequence. Steps must be numbered sequentially starting from 1."
        )
    
    # Reorder steps to ensure proper sequence
    path.reorder_steps()
    
    await path.insert()
    return path


@router.put("/{path_id}", response_model=ProgressionPathResponseSchema)
async def update_progression_path(
    path_id: PydanticObjectId,
    path_data: ProgressionPathUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a progression path (only creator can update)"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "created_by_user_id": current_user.id
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found or you don't have permission to update it"
        )
    
    # Update fields
    update_data = path_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(path, field, value)
    
    # Recalculate total steps if steps were updated
    if "steps" in update_data:
        path.calculate_total_steps()
        
        # Validate step sequence
        if not path.validate_step_sequence():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid step sequence. Steps must be numbered sequentially starting from 1."
            )
        
        # Reorder steps
        path.reorder_steps()
    
    path.updated_at = datetime.utcnow()
    await path.save()
    
    return path


@router.post("/{path_id}/follow", response_model=ProgressionPathResponseSchema)
async def follow_progression_path(
    path_id: PydanticObjectId,
    follow_data: FollowProgressionSchema,
    current_user: User = Depends(get_current_user)
):
    """Follow or unfollow a progression path"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "$or": [
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        ]
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found"
        )
    
    # Update usage stats
    if follow_data.follow:
        path.update_usage_stats(new_follower=True)
    else:
        # Unfollow (decrease followers, but don't go below 0)
        path.users_following = max(0, path.users_following - 1)
    
    path.updated_at = datetime.utcnow()
    await path.save()
    
    return path


@router.post("/{path_id}/complete", response_model=ProgressionPathResponseSchema)
async def complete_progression_path(
    path_id: PydanticObjectId,
    completion_data: CompleteProgressionSchema,
    current_user: User = Depends(get_current_user)
):
    """Mark a progression path as completed"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "$or": [
            {"is_public": True},
            {"created_by_user_id": current_user.id}
        ]
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found"
        )
    
    # Update completion statistics
    path.update_usage_stats(
        completion=True,
        completion_time=completion_data.completion_time_days
    )
    
    path.updated_at = datetime.utcnow()
    await path.save()
    
    return path


@router.delete("/{path_id}")
async def delete_progression_path(
    path_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a progression path (only creator can delete)"""
    path = await ProgressionPath.find_one({
        "_id": path_id,
        "created_by_user_id": current_user.id
    })
    
    if not path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progression path not found or you don't have permission to delete it"
        )
    
    await path.delete()
    return {"message": "Progression path deleted successfully"}