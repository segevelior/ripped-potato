from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.api.deps import get_current_user
from app.models.user import User
from app.models.user_training_pattern import UserTrainingPattern
from app.schemas.user_training_pattern import (
    UserTrainingPatternResponseSchema,
    AddSessionSchema,
    PatternInsightsSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=UserTrainingPatternResponseSchema)
async def get_user_training_pattern(
    days_back: int = Query(90, ge=30, le=365),
    current_user: User = Depends(get_current_user)
):
    """Get user's training pattern analysis"""
    # Try to find existing pattern
    pattern = await UserTrainingPattern.find_one({"user_id": current_user.id})
    
    if not pattern:
        # Create new pattern analysis
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        
        pattern = UserTrainingPattern(
            user_id=current_user.id,
            analysis_start_date=start_date,
            analysis_end_date=end_date,
            total_analysis_days=days_back
        )
        
        await pattern.insert()
    
    return pattern


@router.post("/sessions", response_model=UserTrainingPatternResponseSchema)
async def add_training_session(
    session_data: AddSessionSchema,
    current_user: User = Depends(get_current_user)
):
    """Add a training session to pattern analysis"""
    pattern = await UserTrainingPattern.find_one({"user_id": current_user.id})
    
    if not pattern:
        # Create new pattern
        pattern = UserTrainingPattern(
            user_id=current_user.id,
            analysis_start_date=datetime.utcnow() - timedelta(days=90),
            analysis_end_date=datetime.utcnow(),
            total_analysis_days=90
        )
    
    # Add session
    pattern.add_session(session_data.model_dump())
    
    await pattern.save()
    return pattern


@router.get("/insights", response_model=PatternInsightsSchema)
async def get_training_insights(
    current_user: User = Depends(get_current_user)
):
    """Get behavioral insights about user's training patterns"""
    pattern = await UserTrainingPattern.find_one({"user_id": current_user.id})
    
    if not pattern:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No training pattern data found"
        )
    
    insights = pattern.get_insights()
    return PatternInsightsSchema(**insights)


@router.post("/analyze")
async def trigger_pattern_analysis(
    current_user: User = Depends(get_current_user)
):
    """Trigger re-analysis of training patterns"""
    pattern = await UserTrainingPattern.find_one({"user_id": current_user.id})
    
    if not pattern:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No training pattern data found"
        )
    
    pattern.analyze_patterns()
    pattern.updated_at = datetime.utcnow()
    
    await pattern.save()
    return {"message": "Pattern analysis updated successfully"}