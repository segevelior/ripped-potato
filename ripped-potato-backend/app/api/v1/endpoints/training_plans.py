from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or

from app.api.deps import get_current_user
from app.models.user import User
from app.models.training_plan import TrainingPlan
from app.schemas.training_plan import (
    TrainingPlanCreateSchema,
    TrainingPlanUpdateSchema,
    TrainingPlanResponseSchema,
    TrainingPlanListSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[TrainingPlanListSchema])
async def list_training_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    plan_type: Optional[str] = Query(None),
    difficulty_level: Optional[str] = Query(None),
    is_featured: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """List training plans"""
    query = {"is_active": True}
    
    if plan_type:
        query["plan_type"] = plan_type
    if difficulty_level:
        query["difficulty_level"] = difficulty_level
    if is_featured is not None:
        query["is_featured"] = is_featured
    
    plans = await TrainingPlan.find(
        query,
        sort=[("is_featured", -1), ("usage_count", -1), ("average_rating", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return plans


@router.get("/{plan_id}", response_model=TrainingPlanResponseSchema)
async def get_training_plan(
    plan_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific training plan"""
    plan = await TrainingPlan.find_one({"_id": plan_id, "is_active": True})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found"
        )
    
    return plan


@router.post("/", response_model=TrainingPlanResponseSchema)
async def create_training_plan(
    plan_data: TrainingPlanCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new training plan"""
    plan = TrainingPlan(
        created_by_user_id=current_user.id,
        is_system_plan=False,
        **plan_data.model_dump()
    )
    
    # Validate phases
    if not plan.validate_phases():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid phase sequence"
        )
    
    await plan.insert()
    return plan


@router.put("/{plan_id}", response_model=TrainingPlanResponseSchema)
async def update_training_plan(
    plan_id: PydanticObjectId,
    plan_data: TrainingPlanUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a training plan"""
    plan = await TrainingPlan.find_one({"_id": plan_id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found"
        )
    
    # Check permissions
    if plan.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this plan"
        )
    
    # Update fields
    update_data = plan_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(plan, field, value)
    
    # Validate phases if updated
    if "phases" in update_data and not plan.validate_phases():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid phase sequence"
        )
    
    plan.updated_at = datetime.utcnow()
    await plan.save()
    
    return plan


@router.delete("/{plan_id}")
async def delete_training_plan(
    plan_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a training plan"""
    plan = await TrainingPlan.find_one({"_id": plan_id})
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found"
        )
    
    # Check permissions
    if plan.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this plan"
        )
    
    # Soft delete
    plan.is_active = False
    plan.updated_at = datetime.utcnow()
    await plan.save()
    
    return {"message": "Training plan deactivated successfully"}