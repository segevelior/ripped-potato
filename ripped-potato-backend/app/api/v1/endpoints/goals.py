from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from beanie import PydanticObjectId
from app.models.goal import Goal, GoalProgress
from app.models.user import User
from app.schemas.goal import (
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalListResponse,
    GoalSearchRequest,
    AddProgressRequest
)
from app.api.deps import get_current_user
from app.core.config import settings

router = APIRouter()


@router.get("/", response_model=GoalListResponse)
async def list_goals(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    sort: str = Query("-created_at", regex="^-?(created_at|deadline|priority|progress_percentage)$"),
    status: Optional[str] = None,
    goal_type: Optional[str] = None,
    priority: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    List goals for the current user with pagination and filtering.
    
    Sort options:
    - created_at: Sort by creation time (ascending)
    - -created_at: Sort by creation time (descending)
    - deadline: Sort by deadline (ascending)
    - -deadline: Sort by deadline (descending)
    - priority: Sort by priority (ascending)
    - -priority: Sort by priority (descending)
    - progress_percentage: Sort by progress (ascending)
    - -progress_percentage: Sort by progress (descending)
    """
    # Build query
    query = {"user_id": current_user.id}
    if status:
        query["status"] = status
    if goal_type:
        query["goal_type"] = goal_type
    if priority:
        query["priority"] = priority
    
    # Calculate pagination
    skip = (page - 1) * size
    
    # Determine sort order
    sort_field = sort.lstrip("-")
    sort_order = -1 if sort.startswith("-") else 1
    
    # Get total count
    total = await Goal.find(query).count()
    
    # Get paginated results
    goals = await Goal.find(query).sort(
        [(sort_field, sort_order)]
    ).skip(skip).limit(size).to_list()
    
    # Calculate total pages
    pages = (total + size - 1) // size
    
    return GoalListResponse(
        items=[GoalResponse(**goal.dict()) for goal in goals],
        total=total,
        page=page,
        pages=pages,
        size=size
    )


@router.post("/search", response_model=List[GoalResponse])
async def search_goals(
    search: GoalSearchRequest,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """
    Search goals with advanced filtering options.
    """
    query = {"user_id": current_user.id}
    
    # Build search query
    if search.name:
        query["name"] = {"$regex": search.name, "$options": "i"}
    if search.goal_type:
        query["goal_type"] = search.goal_type
    if search.status:
        query["status"] = search.status
    if search.priority:
        query["priority"] = search.priority
    if search.category:
        query["category"] = search.category
    if search.tags:
        query["tags"] = {"$in": search.tags}
    
    # Deadline filtering
    if search.deadline_before or search.deadline_after:
        deadline_query = {}
        if search.deadline_before:
            deadline_query["$lte"] = search.deadline_before
        if search.deadline_after:
            deadline_query["$gte"] = search.deadline_after
        query["deadline"] = deadline_query
    
    # Progress filtering
    if search.progress_min is not None or search.progress_max is not None:
        progress_query = {}
        if search.progress_min is not None:
            progress_query["$gte"] = search.progress_min
        if search.progress_max is not None:
            progress_query["$lte"] = search.progress_max
        query["progress_percentage"] = progress_query
    
    # Execute search
    goals = await Goal.find(query).sort("-priority").limit(limit).to_list()
    
    return [GoalResponse(**goal.dict()) for goal in goals]


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific goal by ID.
    """
    goal = await Goal.find_one({
        "_id": goal_id,
        "user_id": current_user.id
    })
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return GoalResponse(**goal.dict())


@router.post("/", response_model=GoalResponse)
async def create_goal(
    goal_data: GoalCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Create a new goal.
    """
    goal = Goal(
        user_id=current_user.id,
        current_value=goal_data.starting_value,  # Initialize current value
        **goal_data.dict()
    )
    
    # Calculate initial progress
    goal.progress_percentage = goal.calculate_progress()
    
    await goal.save()
    
    return GoalResponse(**goal.dict())


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: PydanticObjectId,
    goal_update: GoalUpdate,
    current_user: User = Depends(get_current_user),
):
    """
    Update an existing goal.
    """
    goal = await Goal.find_one({
        "_id": goal_id,
        "user_id": current_user.id
    })
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Update fields
    update_data = goal_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(goal, field, value)
    
    # Check if status changed to completed
    if goal_update.status == "completed" and goal.status != "completed":
        goal.completed_date = datetime.utcnow()
    
    # Recalculate progress if values changed
    if any(field in update_data for field in ["current_value", "target_value", "starting_value"]):
        goal.progress_percentage = goal.calculate_progress()
    
    # Update timestamp
    goal.updated_at = datetime.utcnow()
    
    await goal.save()
    
    return GoalResponse(**goal.dict())


@router.delete("/{goal_id}")
async def delete_goal(
    goal_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a goal.
    """
    goal = await Goal.find_one({
        "_id": goal_id,
        "user_id": current_user.id
    })
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    await goal.delete()
    
    return {"message": "Goal deleted successfully"}


@router.post("/{goal_id}/progress", response_model=GoalResponse)
async def add_progress(
    goal_id: PydanticObjectId,
    progress_data: AddProgressRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Add a progress snapshot to a goal.
    """
    goal = await Goal.find_one({
        "_id": goal_id,
        "user_id": current_user.id
    })
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Create progress snapshot
    progress = GoalProgress(
        date=progress_data.date,
        value=progress_data.value,
        notes=progress_data.notes
    )
    
    # Add to snapshots
    goal.progress_snapshots.append(progress)
    
    # Update current value if requested
    if progress_data.update_current:
        goal.current_value = progress_data.value
        goal.progress_percentage = goal.calculate_progress()
        
        # Check if goal is completed
        if goal.target_value and goal.current_value >= goal.target_value:
            goal.status = "completed"
            goal.completed_date = datetime.utcnow()
    
    # Update timestamp
    goal.updated_at = datetime.utcnow()
    
    await goal.save()
    
    return GoalResponse(**goal.dict())


@router.post("/{goal_id}/complete", response_model=GoalResponse)
async def complete_goal(
    goal_id: PydanticObjectId,
    final_value: Optional[float] = None,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """
    Mark a goal as completed.
    """
    goal = await Goal.find_one({
        "_id": goal_id,
        "user_id": current_user.id
    })
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Update goal status
    goal.status = "completed"
    goal.completed_date = datetime.utcnow()
    
    if final_value is not None:
        goal.current_value = final_value
        # Add final progress snapshot
        progress = GoalProgress(
            date=datetime.utcnow(),
            value=final_value,
            notes=notes or "Goal completed"
        )
        goal.progress_snapshots.append(progress)
    
    goal.progress_percentage = goal.calculate_progress()
    goal.updated_at = datetime.utcnow()
    
    await goal.save()
    
    return GoalResponse(**goal.dict())


@router.get("/stats/summary")
async def get_goal_stats(
    current_user: User = Depends(get_current_user),
):
    """
    Get goal statistics for the current user.
    """
    # Get all user goals
    goals = await Goal.find({"user_id": current_user.id}).to_list()
    
    # Calculate statistics
    total_goals = len(goals)
    active_goals = sum(1 for g in goals if g.status == "active")
    completed_goals = sum(1 for g in goals if g.status == "completed")
    paused_goals = sum(1 for g in goals if g.status == "paused")
    abandoned_goals = sum(1 for g in goals if g.status == "abandoned")
    
    # Goals by type
    goals_by_type = {}
    for goal in goals:
        goal_type = goal.goal_type
        goals_by_type[goal_type] = goals_by_type.get(goal_type, 0) + 1
    
    # Average progress
    active_goals_list = [g for g in goals if g.status == "active"]
    avg_progress = sum(g.progress_percentage or 0 for g in active_goals_list) / len(active_goals_list) if active_goals_list else 0
    
    # Goals by priority
    goals_by_priority = {
        "high": sum(1 for g in goals if g.priority == "high"),
        "medium": sum(1 for g in goals if g.priority == "medium"),
        "low": sum(1 for g in goals if g.priority == "low")
    }
    
    return {
        "total_goals": total_goals,
        "active_goals": active_goals,
        "completed_goals": completed_goals,
        "paused_goals": paused_goals,
        "abandoned_goals": abandoned_goals,
        "goals_by_type": goals_by_type,
        "goals_by_priority": goals_by_priority,
        "average_progress": round(avg_progress, 1),
        "completion_rate": round((completed_goals / total_goals * 100) if total_goals > 0 else 0, 1)
    }