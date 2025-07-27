from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.discipline import Discipline
from app.schemas.discipline import (
    DisciplineCreateSchema,
    DisciplineUpdateSchema,
    DisciplineResponseSchema,
    DisciplineListSchema,
    DisciplineStatsSchema,
    DisciplineSearchSchema,
    DisciplineInfoSchema,
    UpdateMetricsSchema,
    DifficultyDistributionSchema
)
from beanie import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[DisciplineListSchema])
async def list_disciplines(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
    difficulty_level: Optional[str] = Query(None),
    is_featured: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(True),
    current_user: User = Depends(get_current_user)
):
    """List all disciplines"""
    query = {}
    
    if is_active is not None:
        query["is_active"] = is_active
    if category:
        query["category"] = category
    if difficulty_level:
        query["difficulty_level"] = difficulty_level
    if is_featured is not None:
        query["is_featured"] = is_featured
    
    disciplines = await Discipline.find(
        query,
        sort=[("is_featured", -1), ("popularity_score", -1), ("name", 1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    # Transform to list schema format
    result = []
    for discipline in disciplines:
        result.append(DisciplineListSchema(
            **discipline.model_dump(),
            active_practitioners=discipline.metrics.active_practitioners,
            total_exercises=discipline.metrics.total_exercises
        ))
    
    return result


@router.post("/search", response_model=List[DisciplineListSchema])
async def search_disciplines(
    search_params: DisciplineSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for disciplines"""
    filters = [{"is_active": True}]
    
    if search_params.query:
        filters.append(Or(
            Regex(Discipline.name, search_params.query, "i"),
            Regex(Discipline.description, search_params.query, "i"),
            In(Discipline.keywords, [search_params.query.lower()])
        ))
    
    if search_params.category:
        filters.append({"category": search_params.category})
    
    if search_params.subcategory:
        filters.append({"subcategory": search_params.subcategory})
    
    if search_params.difficulty_level:
        filters.append({"difficulty_level": search_params.difficulty_level})
    
    if search_params.primary_focus:
        filters.append(In(Discipline.primary_focus, search_params.primary_focus))
    
    if search_params.movement_patterns:
        filters.append(In(Discipline.movement_patterns, search_params.movement_patterns))
    
    if search_params.muscle_groups:
        filters.append(In(Discipline.muscle_groups_targeted, search_params.muscle_groups))
    
    if search_params.equipment_required:
        filters.append(In(Discipline.requirements.equipment_required, search_params.equipment_required))
    
    if search_params.space_requirements:
        filters.append(In(Discipline.requirements.space_requirements, search_params.space_requirements))
    
    if search_params.is_featured is not None:
        filters.append({"is_featured": search_params.is_featured})
    
    if search_params.tags:
        filters.append(In(Discipline.tags, search_params.tags))
    
    if search_params.min_popularity_score:
        filters.append({"popularity_score": {"$gte": search_params.min_popularity_score}})
    
    disciplines = await Discipline.find(
        And(*filters),
        sort=[("popularity_score", -1), ("name", 1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    # Transform to list schema format
    result = []
    for discipline in disciplines:
        result.append(DisciplineListSchema(
            **discipline.model_dump(),
            active_practitioners=discipline.metrics.active_practitioners,
            total_exercises=discipline.metrics.total_exercises
        ))
    
    return result


@router.get("/stats", response_model=DisciplineStatsSchema)
async def get_discipline_stats(current_user: User = Depends(get_current_user)):
    """Get discipline statistics"""
    disciplines = await Discipline.find({"is_active": True}).to_list()
    
    total_disciplines = len(disciplines)
    featured_disciplines_count = len([d for d in disciplines if d.is_featured])
    
    # Group by category and difficulty
    disciplines_by_category = {}
    disciplines_by_difficulty = {}
    total_practitioners = 0
    total_exercises = 0
    
    for discipline in disciplines:
        # Category distribution
        disciplines_by_category[discipline.category] = disciplines_by_category.get(discipline.category, 0) + 1
        
        # Difficulty distribution
        disciplines_by_difficulty[discipline.difficulty_level] = disciplines_by_difficulty.get(discipline.difficulty_level, 0) + 1
        
        # Totals
        total_practitioners += discipline.metrics.active_practitioners
        total_exercises += discipline.metrics.total_exercises
    
    # Calculate averages
    average_exercises_per_discipline = total_exercises / total_disciplines if total_disciplines > 0 else 0.0
    
    # Get most popular disciplines (top 5)
    most_popular = await Discipline.find(
        {"is_active": True},
        sort=[("popularity_score", -1)],
        limit=5
    ).to_list()
    
    most_popular_list = []
    for discipline in most_popular:
        most_popular_list.append(DisciplineListSchema(
            **discipline.model_dump(),
            active_practitioners=discipline.metrics.active_practitioners,
            total_exercises=discipline.metrics.total_exercises
        ))
    
    return DisciplineStatsSchema(
        total_disciplines=total_disciplines,
        disciplines_by_category=disciplines_by_category,
        disciplines_by_difficulty=disciplines_by_difficulty,
        featured_disciplines_count=featured_disciplines_count,
        most_popular_disciplines=most_popular_list,
        total_practitioners=total_practitioners,
        average_exercises_per_discipline=average_exercises_per_discipline
    )


@router.get("/{discipline_id}", response_model=DisciplineResponseSchema)
async def get_discipline(
    discipline_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific discipline"""
    discipline = await Discipline.find_one({"_id": discipline_id, "is_active": True})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    return discipline


@router.get("/slug/{slug}", response_model=DisciplineResponseSchema)
async def get_discipline_by_slug(
    slug: str,
    current_user: User = Depends(get_current_user)
):
    """Get a discipline by its slug"""
    discipline = await Discipline.find_one({"slug": slug, "is_active": True})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    return discipline


@router.get("/{discipline_id}/info", response_model=DisciplineInfoSchema)
async def get_discipline_comprehensive_info(
    discipline_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive discipline information"""
    discipline = await Discipline.find_one({"_id": discipline_id, "is_active": True})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    info = discipline.get_comprehensive_info()
    return DisciplineInfoSchema(**info)


@router.get("/category/{category}", response_model=List[DisciplineListSchema])
async def get_disciplines_by_category(
    category: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Get disciplines by category"""
    disciplines = await Discipline.find(
        {"category": category, "is_active": True},
        sort=[("is_featured", -1), ("popularity_score", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    result = []
    for discipline in disciplines:
        result.append(DisciplineListSchema(
            **discipline.model_dump(),
            active_practitioners=discipline.metrics.active_practitioners,
            total_exercises=discipline.metrics.total_exercises
        ))
    
    return result


@router.post("/", response_model=DisciplineResponseSchema)
async def create_discipline(
    discipline_data: DisciplineCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new discipline (admin only in production)"""
    # Check if slug already exists
    existing = await Discipline.find_one({"slug": discipline_data.slug})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discipline with this slug already exists"
        )
    
    discipline = Discipline(
        created_by_user_id=current_user.id,
        is_system_discipline=False,  # User-created disciplines are not system disciplines
        approved_by_admin=False,  # Require admin approval
        **discipline_data.model_dump()
    )
    
    # Calculate initial popularity score
    discipline.calculate_popularity_score()
    
    await discipline.insert()
    return discipline


@router.put("/{discipline_id}", response_model=DisciplineResponseSchema)
async def update_discipline(
    discipline_id: PydanticObjectId,
    discipline_data: DisciplineUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a discipline (creator or admin only)"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    # Check permissions (in production, add admin check)
    if discipline.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this discipline"
        )
    
    # Update fields
    update_data = discipline_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(discipline, field, value)
    
    # Recalculate popularity score
    discipline.calculate_popularity_score()
    discipline.updated_at = datetime.utcnow()
    
    await discipline.save()
    return discipline


@router.post("/{discipline_id}/metrics", response_model=DisciplineResponseSchema)
async def update_discipline_metrics(
    discipline_id: PydanticObjectId,
    metrics_data: UpdateMetricsSchema,
    current_user: User = Depends(get_current_user)
):
    """Update discipline metrics (admin only in production)"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    # Update metrics
    discipline.update_metrics(
        exercise_count=metrics_data.exercise_count,
        workout_count=metrics_data.workout_count,
        practitioner_count=metrics_data.practitioner_count
    )
    
    # Recalculate popularity score
    discipline.calculate_popularity_score()
    discipline.updated_at = datetime.utcnow()
    
    await discipline.save()
    return discipline


@router.post("/{discipline_id}/difficulty-distribution", response_model=DisciplineResponseSchema)
async def update_difficulty_distribution(
    discipline_id: PydanticObjectId,
    distribution_data: DifficultyDistributionSchema,
    current_user: User = Depends(get_current_user)
):
    """Update difficulty distribution for a discipline"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    # Update difficulty distribution
    distribution_dict = distribution_data.model_dump()
    discipline.update_difficulty_distribution(distribution_dict)
    
    discipline.updated_at = datetime.utcnow()
    await discipline.save()
    
    return discipline


@router.post("/{discipline_id}/related/{related_discipline_id}", response_model=DisciplineResponseSchema)
async def add_related_discipline(
    discipline_id: PydanticObjectId,
    related_discipline_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Add a related discipline"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    # Check if related discipline exists
    related_discipline = await Discipline.find_one({"_id": related_discipline_id})
    if not related_discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Related discipline not found"
        )
    
    discipline.add_related_discipline(related_discipline_id)
    discipline.updated_at = datetime.utcnow()
    
    await discipline.save()
    return discipline


@router.delete("/{discipline_id}/related/{related_discipline_id}", response_model=DisciplineResponseSchema)
async def remove_related_discipline(
    discipline_id: PydanticObjectId,
    related_discipline_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Remove a related discipline"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    discipline.remove_related_discipline(related_discipline_id)
    discipline.updated_at = datetime.utcnow()
    
    await discipline.save()
    return discipline


@router.delete("/{discipline_id}")
async def delete_discipline(
    discipline_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a discipline (soft delete - mark as inactive)"""
    discipline = await Discipline.find_one({"_id": discipline_id})
    
    if not discipline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Discipline not found"
        )
    
    # Check permissions
    if discipline.created_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this discipline"
        )
    
    # Soft delete - mark as inactive
    discipline.is_active = False
    discipline.updated_at = datetime.utcnow()
    
    await discipline.save()
    return {"message": "Discipline deactivated successfully"}