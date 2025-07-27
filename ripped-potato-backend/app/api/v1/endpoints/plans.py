from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.plan import Plan, PlanProgress
from app.schemas.plan import (
    PlanCreateSchema,
    PlanUpdateSchema,
    PlanResponseSchema,
    PlanListSchema,
    PlanStatsSchema,
    PlanWeekScheduleSchema,
    StartPlanSchema,
    CompletePlanSchema,
    PlanProgressUpdateSchema,
    PlanSearchSchema
)
from app.models.utils import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[PlanListSchema])
async def list_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    plan_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """List user's training plans"""
    query = {"user_id": current_user.id}
    
    if status:
        query["status"] = status
    if is_active is not None:
        query["is_active"] = is_active
    if plan_type:
        query["plan_type"] = plan_type
    
    plans = await Plan.find(
        query,
        sort=[("created_at", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return plans


@router.post("/search", response_model=List[PlanListSchema])
async def search_plans(
    search_params: PlanSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for training plans"""
    filters = [{"user_id": current_user.id}]
    
    if search_params.query:
        filters.append(Or(
            Regex(Plan.name, search_params.query, "i"),
            Regex(Plan.description, search_params.query, "i")
        ))
    
    if search_params.plan_type:
        filters.append({"plan_type": search_params.plan_type})
    
    if search_params.difficulty_level:
        filters.append({"difficulty_level": search_params.difficulty_level})
    
    if search_params.status:
        filters.append({"status": search_params.status})
    
    if search_params.is_active is not None:
        filters.append({"is_active": search_params.is_active})
    
    if search_params.tags:
        filters.append(In(Plan.tags, search_params.tags))
    
    if search_params.min_duration_weeks:
        filters.append({"duration_weeks": {"$gte": search_params.min_duration_weeks}})
    
    if search_params.max_duration_weeks:
        filters.append({"duration_weeks": {"$lte": search_params.max_duration_weeks}})
    
    if search_params.start_date_from:
        filters.append({"start_date": {"$gte": search_params.start_date_from}})
    
    if search_params.start_date_to:
        filters.append({"start_date": {"$lte": search_params.start_date_to}})
    
    plans = await Plan.find(
        And(*filters),
        sort=[("created_at", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return plans


@router.get("/stats", response_model=PlanStatsSchema)
async def get_plan_stats(current_user: User = Depends(get_current_user)):
    """Get user's plan statistics"""
    user_plans = await Plan.find({"user_id": current_user.id}).to_list()
    
    total_plans = len(user_plans)
    active_plans = len([p for p in user_plans if p.is_active])
    completed_plans = len([p for p in user_plans if p.status == "completed"])
    
    # Calculate average adherence rate
    adherence_rates = [p.adherence_rate for p in user_plans if p.adherence_rate > 0]
    average_adherence_rate = sum(adherence_rates) / len(adherence_rates) if adherence_rates else 0.0
    
    # Calculate totals
    total_planned_workouts = sum(p.total_planned_workouts for p in user_plans)
    total_completed_workouts = sum(p.completed_workouts for p in user_plans)
    
    # Group by type and difficulty
    plans_by_type = {}
    plans_by_difficulty = {}
    
    for plan in user_plans:
        plans_by_type[plan.plan_type] = plans_by_type.get(plan.plan_type, 0) + 1
        plans_by_difficulty[plan.difficulty_level] = plans_by_difficulty.get(plan.difficulty_level, 0) + 1
    
    return PlanStatsSchema(
        total_plans=total_plans,
        active_plans=active_plans,
        completed_plans=completed_plans,
        average_adherence_rate=average_adherence_rate,
        total_planned_workouts=total_planned_workouts,
        total_completed_workouts=total_completed_workouts,
        plans_by_type=plans_by_type,
        plans_by_difficulty=plans_by_difficulty
    )


@router.get("/{plan_id}", response_model=PlanResponseSchema)
async def get_plan(
    plan_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific training plan"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    return plan


@router.get("/{plan_id}/schedule/{week_number}", response_model=PlanWeekScheduleSchema)
async def get_week_schedule(
    plan_id: PydanticObjectId,
    week_number: int,
    current_user: User = Depends(get_current_user)
):
    """Get the workout schedule for a specific week"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    if week_number < 1 or week_number > plan.duration_weeks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid week number"
        )
    
    week_data = next(
        (week for week in plan.weeks if week.week_number == week_number),
        None
    )
    
    if not week_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Week not found in plan"
        )
    
    # Convert workout schedule to day names
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    schedule = {}
    
    for workout in week_data.workouts:
        day_name = days[workout.day_of_week]
        schedule[day_name] = workout
    
    return PlanWeekScheduleSchema(
        week_number=week_number,
        schedule=schedule,
        weekly_goals=week_data.weekly_goals,
        focus=week_data.focus,
        notes=week_data.notes
    )


@router.post("/", response_model=PlanResponseSchema)
async def create_plan(
    plan_data: PlanCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new training plan"""
    plan = Plan(
        user_id=current_user.id,
        **plan_data.model_dump()
    )
    
    # Calculate total planned workouts
    plan.total_planned_workouts = plan.calculate_total_workouts()
    
    await plan.insert()
    return plan


@router.put("/{plan_id}", response_model=PlanResponseSchema)
async def update_plan(
    plan_id: PydanticObjectId,
    plan_data: PlanUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a training plan"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    # Update fields
    update_data = plan_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(plan, field, value)
    
    # Recalculate total workouts if weeks were updated
    if "weeks" in update_data:
        plan.total_planned_workouts = plan.calculate_total_workouts()
        plan.update_overall_progress()
    
    plan.updated_at = datetime.utcnow()
    await plan.save()
    
    return plan


@router.post("/{plan_id}/start", response_model=PlanResponseSchema)
async def start_plan(
    plan_id: PydanticObjectId,
    start_data: StartPlanSchema,
    current_user: User = Depends(get_current_user)
):
    """Start a training plan"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    if plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan is already active"
        )
    
    # Deactivate other active plans
    await Plan.find({"user_id": current_user.id, "is_active": True}).update(
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    # Start this plan
    plan.is_active = True
    plan.status = "active"
    plan.start_date = start_data.start_date
    plan.current_week = 1
    plan.updated_at = datetime.utcnow()
    
    await plan.save()
    return plan


@router.post("/{plan_id}/complete", response_model=PlanResponseSchema)
async def complete_plan(
    plan_id: PydanticObjectId,
    complete_data: CompletePlanSchema,
    current_user: User = Depends(get_current_user)
):
    """Mark a plan as completed"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    plan.status = "completed"
    plan.is_active = False
    plan.actual_end_date = datetime.utcnow()
    plan.overall_completion_percentage = 100.0
    plan.updated_at = datetime.utcnow()
    
    await plan.save()
    return plan


@router.post("/{plan_id}/progress", response_model=PlanResponseSchema)
async def update_plan_progress(
    plan_id: PydanticObjectId,
    progress_data: PlanProgressUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update progress for a specific week"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    week_number = progress_data.week_number
    if week_number < 1 or week_number > plan.duration_weeks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid week number"
        )
    
    # Find or create progress for this week
    week_progress = next(
        (p for p in plan.progress if p.week_number == week_number),
        None
    )
    
    if not week_progress:
        week_progress = PlanProgress(week_number=week_number)
        plan.progress.append(week_progress)
    
    # Update progress data
    if progress_data.completed_workouts is not None:
        week_progress.completed_workouts = progress_data.completed_workouts
        
        # Get total workouts for this week
        week_data = next(
            (w for w in plan.weeks if w.week_number == week_number),
            None
        )
        if week_data:
            week_progress.total_workouts = len([w for w in week_data.workouts if not w.is_rest_day])
            if week_progress.total_workouts > 0:
                week_progress.completion_percentage = (
                    week_progress.completed_workouts / week_progress.total_workouts
                ) * 100.0
    
    if progress_data.goals_achieved is not None:
        week_progress.goals_achieved = progress_data.goals_achieved
    
    if progress_data.notes is not None:
        week_progress.notes = progress_data.notes
    
    # Update overall plan progress
    plan.completed_workouts = sum(p.completed_workouts for p in plan.progress)
    plan.update_overall_progress()
    plan.updated_at = datetime.utcnow()
    
    await plan.save()
    return plan


@router.post("/{plan_id}/advance-week", response_model=PlanResponseSchema)
async def advance_to_next_week(
    plan_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Advance the plan to the next week"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan is not active"
        )
    
    if not plan.advance_to_next_week():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan is already at the final week"
        )
    
    # Check if plan is now complete
    if plan.is_plan_complete():
        plan.status = "completed"
        plan.is_active = False
        plan.actual_end_date = datetime.utcnow()
    
    plan.updated_at = datetime.utcnow()
    await plan.save()
    
    return plan


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a training plan"""
    plan = await Plan.find_one({"_id": plan_id, "user_id": current_user.id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    await plan.delete()
    return {"message": "Plan deleted successfully"}