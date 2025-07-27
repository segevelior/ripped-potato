from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import And

from app.api.deps import get_current_user
from app.models.user import User
from app.models.external_activity import ExternalActivity
from app.schemas.external_activity import (
    ExternalActivityCreateSchema,
    ExternalActivityUpdateSchema,
    ExternalActivityResponseSchema,
    ExternalActivityListSchema,
    SyncExternalActivitiesSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[ExternalActivityListSchema])
async def list_external_activities(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    platform: Optional[str] = Query(None),
    activity_type: Optional[str] = Query(None),
    include_in_stats: Optional[bool] = Query(None),
    days_back: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    """List user's external activities"""
    filters = [{"user_id": current_user.id}]
    
    # Date filter
    since_date = datetime.utcnow() - timedelta(days=days_back)
    filters.append({"start_time": {"$gte": since_date}})
    
    if platform:
        filters.append({"external_platform": platform})
    if activity_type:
        filters.append({"activity_type": activity_type})
    if include_in_stats is not None:
        filters.append({"include_in_stats": include_in_stats})
    
    activities = await ExternalActivity.find(
        And(*filters),
        sort=[("start_time", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    # Transform to list schema format
    result = []
    for activity in activities:
        result.append(ExternalActivityListSchema(
            **activity.model_dump(),
            duration_minutes=activity.metrics.duration_minutes,
            distance_km=activity.metrics.distance_km,
            calories_burned=activity.metrics.calories_burned
        ))
    
    return result


@router.get("/{activity_id}", response_model=ExternalActivityResponseSchema)
async def get_external_activity(
    activity_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific external activity"""
    activity = await ExternalActivity.find_one({
        "_id": activity_id,
        "user_id": current_user.id
    })
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="External activity not found"
        )
    
    return activity


@router.post("/", response_model=ExternalActivityResponseSchema)
async def create_external_activity(
    activity_data: ExternalActivityCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new external activity record"""
    # Check if activity already exists
    existing = await ExternalActivity.find_one({
        "external_platform": activity_data.external_platform,
        "external_id": activity_data.external_id,
        "user_id": current_user.id
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="External activity already exists"
        )
    
    activity = ExternalActivity(
        user_id=current_user.id,
        **activity_data.model_dump()
    )
    
    await activity.insert()
    return activity


@router.put("/{activity_id}", response_model=ExternalActivityResponseSchema)
async def update_external_activity(
    activity_id: PydanticObjectId,
    activity_data: ExternalActivityUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update an external activity"""
    activity = await ExternalActivity.find_one({
        "_id": activity_id,
        "user_id": current_user.id
    })
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="External activity not found"
        )
    
    # Update fields
    update_data = activity_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(activity, field, value)
    
    activity.updated_at = datetime.utcnow()
    await activity.save()
    
    return activity


@router.post("/sync", response_model=List[ExternalActivityResponseSchema])
async def sync_external_activities(
    sync_data: SyncExternalActivitiesSchema,
    current_user: User = Depends(get_current_user)
):
    """Sync activities from external platform (placeholder implementation)"""
    # This would typically integrate with external APIs like Strava, Garmin, etc.
    # For now, return empty list as placeholder
    
    # In a real implementation, this would:
    # 1. Authenticate with external platform
    # 2. Fetch activities from the last N days
    # 3. Create/update ExternalActivity records
    # 4. Return the synced activities
    
    return []


@router.delete("/{activity_id}")
async def delete_external_activity(
    activity_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete an external activity"""
    activity = await ExternalActivity.find_one({
        "_id": activity_id,
        "user_id": current_user.id
    })
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="External activity not found"
        )
    
    await activity.delete()
    return {"message": "External activity deleted successfully"}