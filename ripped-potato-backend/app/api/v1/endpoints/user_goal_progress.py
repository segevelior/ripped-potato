from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or

from app.api.deps import get_current_user
from app.models.user import User
from app.models.user_goal_progress import UserGoalProgress
from app.schemas.user_goal_progress import (
    UserGoalProgressCreateSchema,
    UserGoalProgressUpdateSchema,
    UserGoalProgressResponseSchema,
    UserGoalProgressListSchema,
    UserGoalProgressStatsSchema,
    AddMeasurementSchema,
    AddMilestoneSchema,
    ProgressSummarySchema,
    ProgressSearchSchema,
    TrendAnalysisSchema,
    PredictCompletionSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[UserGoalProgressListSchema])
async def list_user_goal_progress(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    is_completed: Optional[bool] = Query(None),
    requires_attention: Optional[bool] = Query(None),
    goal_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """List user's goal progress records"""
    query = {"user_id": current_user.id}
    
    if is_active is not None:
        query["is_active"] = is_active
    if is_completed is not None:
        query["is_completed"] = is_completed
    if requires_attention is not None:
        query["requires_attention"] = requires_attention
    if goal_type:
        query["goal_type"] = goal_type
    
    progress_records = await UserGoalProgress.find(
        query,
        sort=[("last_updated", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return progress_records


@router.post("/search", response_model=List[UserGoalProgressListSchema])
async def search_goal_progress(
    search_params: ProgressSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for goal progress records"""
    filters = [{"user_id": current_user.id}]
    
    if search_params.goal_type:
        filters.append({"goal_type": search_params.goal_type})
    
    if search_params.is_active is not None:
        filters.append({"is_active": search_params.is_active})
    
    if search_params.is_completed is not None:
        filters.append({"is_completed": search_params.is_completed})
    
    if search_params.is_on_track is not None:
        filters.append({"is_on_track": search_params.is_on_track})
    
    if search_params.requires_attention is not None:
        filters.append({"requires_attention": search_params.requires_attention})
    
    if search_params.min_progress_percentage is not None:
        filters.append({"progress_percentage": {"$gte": search_params.min_progress_percentage}})
    
    if search_params.max_progress_percentage is not None:
        filters.append({"progress_percentage": {"$lte": search_params.max_progress_percentage}})
    
    if search_params.target_completion_from:
        filters.append({"target_completion_date": {"$gte": search_params.target_completion_from}})
    
    if search_params.target_completion_to:
        filters.append({"target_completion_date": {"$lte": search_params.target_completion_to}})
    
    if search_params.tags:
        filters.append(In(UserGoalProgress.tags, search_params.tags))
    
    progress_records = await UserGoalProgress.find(
        And(*filters),
        sort=[("progress_percentage", -1), ("last_updated", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return progress_records


@router.get("/stats", response_model=UserGoalProgressStatsSchema)
async def get_progress_stats(current_user: User = Depends(get_current_user)):
    """Get user's goal progress statistics"""
    progress_records = await UserGoalProgress.find({"user_id": current_user.id}).to_list()
    
    total_goals_tracked = len(progress_records)
    active_goals = len([p for p in progress_records if p.is_active])
    completed_goals = len([p for p in progress_records if p.is_completed])
    goals_on_track = len([p for p in progress_records if p.is_on_track])
    goals_requiring_attention = len([p for p in progress_records if p.requires_attention])
    
    # Calculate averages
    if progress_records:
        average_progress_percentage = sum(p.progress_percentage for p in progress_records) / len(progress_records)
        average_consistency_score = sum(p.consistency_score for p in progress_records) / len(progress_records)
        total_measurements = sum(p.total_measurements for p in progress_records)
    else:
        average_progress_percentage = 0.0
        average_consistency_score = 0.0
        total_measurements = 0
    
    # Group by goal type
    goals_by_type = {}
    for progress in progress_records:
        goals_by_type[progress.goal_type] = goals_by_type.get(progress.goal_type, 0) + 1
    
    # Get recent achievements (milestones achieved in last 30 days)
    recent_achievements = []
    cutoff_date = datetime.utcnow() - timedelta(days=30)
    
    for progress in progress_records:
        for milestone in progress.milestones:
            if (milestone.is_achieved and milestone.achieved_date and 
                milestone.achieved_date >= cutoff_date):
                recent_achievements.append(milestone)
    
    # Sort by achievement date (most recent first)
    recent_achievements.sort(key=lambda x: x.achieved_date, reverse=True)
    recent_achievements = recent_achievements[:10]  # Limit to 10 most recent
    
    return UserGoalProgressStatsSchema(
        total_goals_tracked=total_goals_tracked,
        active_goals=active_goals,
        completed_goals=completed_goals,
        goals_on_track=goals_on_track,
        goals_requiring_attention=goals_requiring_attention,
        average_progress_percentage=average_progress_percentage,
        average_consistency_score=average_consistency_score,
        total_measurements=total_measurements,
        goals_by_type=goals_by_type,
        recent_achievements=recent_achievements
    )


@router.get("/{progress_id}", response_model=UserGoalProgressResponseSchema)
async def get_goal_progress(
    progress_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific goal progress record"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    return progress


@router.get("/{progress_id}/summary", response_model=ProgressSummarySchema)
async def get_progress_summary(
    progress_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get progress summary for a specific goal"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    summary = progress.get_progress_summary()
    return ProgressSummarySchema(**summary)


@router.get("/goal/{goal_id}", response_model=UserGoalProgressResponseSchema)
async def get_progress_by_goal(
    goal_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get progress record for a specific goal"""
    progress = await UserGoalProgress.find_one({
        "goal_id": goal_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    return progress


@router.post("/", response_model=UserGoalProgressResponseSchema)
async def create_goal_progress(
    progress_data: UserGoalProgressCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new goal progress record"""
    # Check if progress record already exists for this goal
    existing = await UserGoalProgress.find_one({
        "goal_id": progress_data.goal_id,
        "user_id": current_user.id
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Progress record already exists for this goal"
        )
    
    progress = UserGoalProgress(
        user_id=current_user.id,
        **progress_data.model_dump()
    )
    
    # Calculate initial progress if values are provided
    if progress.current_value is not None:
        progress.calculate_progress()
    
    await progress.insert()
    return progress


@router.put("/{progress_id}", response_model=UserGoalProgressResponseSchema)
async def update_goal_progress(
    progress_id: PydanticObjectId,
    progress_data: UserGoalProgressUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a goal progress record"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    # Update fields
    update_data = progress_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(progress, field, value)
    
    # Recalculate progress if current_value was updated
    if "current_value" in update_data:
        progress.calculate_progress()
        progress.check_if_on_track()
        progress.predict_completion_date()
    
    progress.updated_at = datetime.utcnow()
    await progress.save()
    
    return progress


@router.post("/{progress_id}/measurements", response_model=UserGoalProgressResponseSchema)
async def add_measurement(
    progress_id: PydanticObjectId,
    measurement_data: AddMeasurementSchema,
    current_user: User = Depends(get_current_user)
):
    """Add a new progress measurement"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    # Add the measurement
    measurement = progress.add_measurement(
        value=measurement_data.value,
        unit=measurement_data.unit,
        measurement_type=measurement_data.measurement_type,
        workout_id=measurement_data.workout_id,
        exercise_id=measurement_data.exercise_id,
        notes=measurement_data.notes,
        conditions=measurement_data.conditions
    )
    
    # Update other calculations
    progress.check_if_on_track()
    progress.calculate_consistency_score()
    progress.predict_completion_date()
    progress.check_milestone_achievements()
    
    progress.updated_at = datetime.utcnow()
    await progress.save()
    
    return progress


@router.post("/{progress_id}/milestones", response_model=UserGoalProgressResponseSchema)
async def add_milestone(
    progress_id: PydanticObjectId,
    milestone_data: AddMilestoneSchema,
    current_user: User = Depends(get_current_user)
):
    """Add a new milestone to goal progress"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    # Check if milestone ID already exists
    existing_milestone = next(
        (m for m in progress.milestones if m.milestone_id == milestone_data.milestone_id),
        None
    )
    
    if existing_milestone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone with this ID already exists"
        )
    
    # Add the milestone
    milestone = progress.add_milestone(
        milestone_id=milestone_data.milestone_id,
        name=milestone_data.name,
        target_value=milestone_data.target_value,
        target_unit=milestone_data.target_unit,
        description=milestone_data.description
    )
    
    # Check if milestone is already achieved
    progress.check_milestone_achievements()
    
    progress.updated_at = datetime.utcnow()
    await progress.save()
    
    return progress


@router.post("/{progress_id}/analyze-trend", response_model=UserGoalProgressResponseSchema)
async def analyze_trend(
    progress_id: PydanticObjectId,
    trend_params: TrendAnalysisSchema,
    current_user: User = Depends(get_current_user)
):
    """Trigger trend analysis for a goal progress record"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    # Update trend analysis
    progress.update_trend_analysis(days_back=trend_params.days_back)
    progress.calculate_velocity()
    progress.predict_completion_date()
    
    progress.updated_at = datetime.utcnow()
    await progress.save()
    
    return progress


@router.post("/{progress_id}/predict-completion", response_model=Dict[str, Any])
async def predict_completion(
    progress_id: PydanticObjectId,
    prediction_params: PredictCompletionSchema,
    current_user: User = Depends(get_current_user)
):
    """Get completion prediction for a goal"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    if prediction_params.use_current_trend:
        progress.update_trend_analysis()
        progress.calculate_velocity()
    
    predicted_date = progress.predict_completion_date()
    
    if not predicted_date:
        return {
            "prediction_available": False,
            "message": "Unable to predict completion date with current data"
        }
    
    confidence = progress.confidence_in_prediction or 0.0
    
    if confidence < prediction_params.confidence_threshold:
        return {
            "prediction_available": True,
            "predicted_completion_date": predicted_date,
            "confidence": confidence,
            "warning": f"Low confidence prediction (threshold: {prediction_params.confidence_threshold})"
        }
    
    return {
        "prediction_available": True,
        "predicted_completion_date": predicted_date,
        "confidence": confidence,
        "days_remaining": (predicted_date - datetime.utcnow()).days,
        "current_velocity": progress.velocity,
        "trend_direction": progress.current_trend.trend_direction if progress.current_trend else None
    }


@router.delete("/{progress_id}")
async def delete_goal_progress(
    progress_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a goal progress record"""
    progress = await UserGoalProgress.find_one({
        "_id": progress_id,
        "user_id": current_user.id
    })
    
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal progress record not found"
        )
    
    await progress.delete()
    return {"message": "Goal progress record deleted successfully"}