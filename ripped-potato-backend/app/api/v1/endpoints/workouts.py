from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from beanie import PydanticObjectId
from app.models.workout import Workout
from app.models.user import User
from app.schemas.workout import (
    WorkoutCreate,
    WorkoutUpdate,
    WorkoutResponse,
    WorkoutListResponse,
    WorkoutSearchRequest
)
from app.api.deps import get_current_user
import math

router = APIRouter()


@router.get("/", response_model=WorkoutListResponse)
async def list_workouts(
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    sort: str = Query("-date"),
    is_completed: Optional[bool] = None,
    workout_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None
):
    """
    List workouts for the current user with pagination and filters
    """
    # Build query
    query = {"user_id": current_user.id}
    
    if is_completed is not None:
        query["is_completed"] = is_completed
    
    if workout_type:
        query["workout_type"] = workout_type
    
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            query["date"] = date_query
    
    # Get total count
    total = await Workout.find(query).count()
    
    # Calculate pagination
    pages = math.ceil(total / size)
    skip = (page - 1) * size
    
    # Parse sort parameter
    sort_field = sort.lstrip("-")
    sort_order = -1 if sort.startswith("-") else 1
    
    # Get workouts
    workouts = await Workout.find(query).sort(
        [(sort_field, sort_order)]
    ).skip(skip).limit(size).to_list()
    
    # Convert to response model
    items = [WorkoutResponse(**workout.dict(by_alias=True)) for workout in workouts]
    
    return WorkoutListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
        size=size
    )


@router.post("/", response_model=WorkoutResponse, status_code=201)
async def create_workout(
    workout: WorkoutCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new workout
    """
    # Create workout document
    workout_doc = Workout(
        user_id=current_user.id,
        **workout.dict()
    )
    
    # Save to database
    await workout_doc.save()
    
    return WorkoutResponse(**workout_doc.dict(by_alias=True))


@router.get("/{workout_id}", response_model=WorkoutResponse)
async def get_workout(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """
    Get a specific workout by ID
    """
    workout = await Workout.find_one({
        "_id": workout_id,
        "user_id": current_user.id
    })
    
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    return WorkoutResponse(**workout.dict(by_alias=True))


@router.put("/{workout_id}", response_model=WorkoutResponse)
async def update_workout(
    workout_id: PydanticObjectId,
    workout_update: WorkoutUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update a workout
    """
    # Find workout
    workout = await Workout.find_one({
        "_id": workout_id,
        "user_id": current_user.id
    })
    
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    # Update fields
    update_data = workout_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workout, field, value)
    
    # Save changes
    await workout.save()
    
    return WorkoutResponse(**workout.dict(by_alias=True))


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a workout
    """
    workout = await Workout.find_one({
        "_id": workout_id,
        "user_id": current_user.id
    })
    
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    await workout.delete()


@router.post("/search", response_model=WorkoutListResponse)
async def search_workouts(
    search: WorkoutSearchRequest,
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    sort: str = Query("-date")
):
    """
    Search workouts with advanced filters
    """
    # Build query
    query = {"user_id": current_user.id}
    
    # Add search filters
    if search.name:
        query["name"] = {"$regex": search.name, "$options": "i"}
    
    if search.workout_type:
        query["workout_type"] = search.workout_type
    
    if search.is_completed is not None:
        query["is_completed"] = search.is_completed
    
    if search.template_id:
        query["template_id"] = search.template_id
    
    if search.mood:
        query["mood"] = search.mood
    
    # Date range
    if search.date_from or search.date_to:
        date_query = {}
        if search.date_from:
            date_query["$gte"] = search.date_from
        if search.date_to:
            date_query["$lte"] = search.date_to
        if date_query:
            query["date"] = date_query
    
    # Energy level range
    if search.energy_level_min or search.energy_level_max:
        energy_query = {}
        if search.energy_level_min:
            energy_query["$gte"] = search.energy_level_min
        if search.energy_level_max:
            energy_query["$lte"] = search.energy_level_max
        if energy_query:
            query["energy_level"] = energy_query
    
    # Get total count
    total = await Workout.find(query).count()
    
    # Calculate pagination
    pages = math.ceil(total / size)
    skip = (page - 1) * size
    
    # Parse sort parameter
    sort_field = sort.lstrip("-")
    sort_order = -1 if sort.startswith("-") else 1
    
    # Get workouts
    workouts = await Workout.find(query).sort(
        [(sort_field, sort_order)]
    ).skip(skip).limit(size).to_list()
    
    # Convert to response model
    items = [WorkoutResponse(**workout.dict(by_alias=True)) for workout in workouts]
    
    return WorkoutListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
        size=size
    )


@router.post("/{workout_id}/complete", response_model=WorkoutResponse)
async def complete_workout(
    workout_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """
    Mark a workout as completed
    """
    workout = await Workout.find_one({
        "_id": workout_id,
        "user_id": current_user.id
    })
    
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    workout.is_completed = True
    workout.end_time = datetime.utcnow()
    
    await workout.save()
    
    return WorkoutResponse(**workout.dict(by_alias=True))


@router.post("/from-template/{template_id}", response_model=WorkoutResponse, status_code=201)
async def create_workout_from_template(
    template_id: PydanticObjectId,
    workout_data: WorkoutCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a workout from a template
    """
    # This will be implemented when WorkoutTemplate is created
    # For now, just create a regular workout with template_id
    
    workout_doc = Workout(
        user_id=current_user.id,
        template_id=template_id,
        **workout_data.dict()
    )
    
    await workout_doc.save()
    
    return WorkoutResponse(**workout_doc.dict(by_alias=True))


@router.get("/stats/summary", response_model=dict)
async def get_workout_stats(
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=1, le=365)
):
    """
    Get workout statistics for the current user
    """
    from datetime import timedelta
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # Get workouts in date range
    workouts = await Workout.find({
        "user_id": current_user.id,
        "date": {"$gte": start_date},
        "is_completed": True
    }).to_list()
    
    # Calculate stats
    total_workouts = len(workouts)
    total_duration = sum(w.duration_minutes or 0 for w in workouts)
    total_volume = sum(w.total_volume or 0 for w in workouts)
    
    # Group by workout type
    workout_types = {}
    for workout in workouts:
        wtype = workout.workout_type or "other"
        workout_types[wtype] = workout_types.get(wtype, 0) + 1
    
    # Average per week
    weeks = days / 7
    avg_per_week = total_workouts / weeks if weeks > 0 else 0
    
    return {
        "total_workouts": total_workouts,
        "total_duration_minutes": total_duration,
        "total_volume": total_volume,
        "average_per_week": round(avg_per_week, 1),
        "workout_types": workout_types,
        "date_range": {
            "start": start_date.isoformat(),
            "end": datetime.utcnow().isoformat()
        }
    }