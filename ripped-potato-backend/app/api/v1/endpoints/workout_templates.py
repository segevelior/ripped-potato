from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie.operators import In, And, Or, Regex

from app.api.deps import get_current_user
from app.models.user import User
from app.models.workout_template import WorkoutTemplate
from app.schemas.workout_template import (
    WorkoutTemplateCreateSchema,
    WorkoutTemplateUpdateSchema,
    WorkoutTemplateResponseSchema,
    WorkoutTemplateListSchema,
    WorkoutTemplateStatsSchema,
    WorkoutTemplateSearchSchema,
    RateTemplateSchema,
    UseTemplateSchema,
    TemplateVolumeSchema,
    TemplateSupersetSchema,
    TemplateEquipmentCheckSchema,
    TemplateEquipmentCheckResponseSchema,
    DuplicateTemplateSchema
)
from app.models.utils import PydanticObjectId

router = APIRouter()


@router.get("/", response_model=List[WorkoutTemplateListSchema])
async def list_workout_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    workout_type: Optional[str] = Query(None),
    difficulty_level: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    include_system: bool = Query(True),
    current_user: User = Depends(get_current_user)
):
    """List workout templates"""
    query = []
    
    # Always include user's own templates
    user_query = {"user_id": current_user.id}
    
    # Build public/system template query
    public_conditions = []
    if is_public is None or is_public:
        public_conditions.append({"is_public": True})
    if include_system:
        public_conditions.append({"is_system_template": True})
    
    if public_conditions:
        query.append(Or(user_query, *public_conditions))
    else:
        query.append(user_query)
    
    # Add filters
    if workout_type:
        query.append({"workout_type": workout_type})
    if difficulty_level:
        query.append({"difficulty_level": difficulty_level})
    
    templates = await WorkoutTemplate.find(
        And(*query) if len(query) > 1 else query[0],
        sort=[("rating_average", -1), ("usage_count", -1), ("created_at", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return templates


@router.post("/search", response_model=List[WorkoutTemplateListSchema])
async def search_workout_templates(
    search_params: WorkoutTemplateSearchSchema,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Advanced search for workout templates"""
    filters = []
    
    # Base access control
    access_filter = Or(
        {"user_id": current_user.id},
        {"is_public": True},
        {"is_system_template": True}
    )
    filters.append(access_filter)
    
    # Text search
    if search_params.query:
        filters.append(Or(
            Regex(WorkoutTemplate.name, search_params.query, "i"),
            Regex(WorkoutTemplate.description, search_params.query, "i"),
            In(WorkoutTemplate.tags, [search_params.query])
        ))
    
    # Category filters
    if search_params.workout_type:
        filters.append({"workout_type": search_params.workout_type})
    
    if search_params.difficulty_level:
        filters.append({"difficulty_level": search_params.difficulty_level})
    
    if search_params.category:
        filters.append({"category": search_params.category})
    
    # Multiple choice filters
    if search_params.target_muscle_groups:
        filters.append(In(WorkoutTemplate.target_muscle_groups, search_params.target_muscle_groups))
    
    if search_params.equipment_required:
        filters.append(In(WorkoutTemplate.equipment_required, search_params.equipment_required))
    
    if search_params.tags:
        filters.append(In(WorkoutTemplate.tags, search_params.tags))
    
    if search_params.space_requirements:
        filters.append(In(WorkoutTemplate.space_requirements, search_params.space_requirements))
    
    # Boolean filters
    if search_params.is_public is not None:
        filters.append({"is_public": search_params.is_public})
    
    if search_params.is_system_template is not None:
        filters.append({"is_system_template": search_params.is_system_template})
    
    # Range filters
    if search_params.min_duration:
        filters.append({"estimated_duration_minutes": {"$gte": search_params.min_duration}})
    
    if search_params.max_duration:
        filters.append({"estimated_duration_minutes": {"$lte": search_params.max_duration}})
    
    if search_params.min_rating:
        filters.append({"rating_average": {"$gte": search_params.min_rating}})
    
    templates = await WorkoutTemplate.find(
        And(*filters),
        sort=[("rating_average", -1), ("usage_count", -1), ("created_at", -1)],
        skip=skip,
        limit=limit
    ).to_list()
    
    return templates


@router.get("/stats", response_model=WorkoutTemplateStatsSchema)
async def get_template_stats(current_user: User = Depends(get_current_user)):
    """Get workout template statistics"""
    user_templates = await WorkoutTemplate.find({"user_id": current_user.id}).to_list()
    public_templates = await WorkoutTemplate.find({"is_public": True}).to_list()
    system_templates = await WorkoutTemplate.find({"is_system_template": True}).to_list()
    
    all_accessible = user_templates + public_templates + system_templates
    
    total_templates = len(user_templates)
    public_count = len([t for t in user_templates if t.is_public])
    private_count = total_templates - public_count
    system_count = len(system_templates)
    
    # Calculate average rating for accessible templates
    rated_templates = [t for t in all_accessible if t.rating_count > 0]
    average_rating = (
        sum(t.rating_average for t in rated_templates) / len(rated_templates)
        if rated_templates else 0.0
    )
    
    # Group by type and difficulty
    templates_by_type = {}
    templates_by_difficulty = {}
    total_usage = 0
    
    for template in all_accessible:
        templates_by_type[template.workout_type] = templates_by_type.get(template.workout_type, 0) + 1
        templates_by_difficulty[template.difficulty_level] = templates_by_difficulty.get(template.difficulty_level, 0) + 1
        total_usage += template.usage_count
    
    # Find most popular type
    most_popular_type = max(templates_by_type.items(), key=lambda x: x[1])[0] if templates_by_type else "strength"
    
    return WorkoutTemplateStatsSchema(
        total_templates=total_templates,
        public_templates=public_count,
        private_templates=private_count,
        system_templates=system_count,
        average_rating=average_rating,
        most_popular_type=most_popular_type,
        templates_by_type=templates_by_type,
        templates_by_difficulty=templates_by_difficulty,
        total_usage=total_usage
    )


@router.get("/{template_id}", response_model=WorkoutTemplateResponseSchema)
async def get_workout_template(
    template_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get a specific workout template"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template


@router.get("/{template_id}/volume", response_model=TemplateVolumeSchema)
async def get_template_volume(
    template_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get volume analysis for a template"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    volume_data = template.get_estimated_volume()
    difficulty_score = template.calculate_difficulty_score()
    
    return TemplateVolumeSchema(
        total_exercises=volume_data["total_exercises"],
        estimated_total_sets=volume_data["estimated_total_sets"],
        exercises_per_muscle_group=volume_data["exercises_per_muscle_group"],
        estimated_duration_minutes=template.estimated_duration_minutes,
        difficulty_score=difficulty_score
    )


@router.get("/{template_id}/supersets", response_model=List[TemplateSupersetSchema])
async def get_template_supersets(
    template_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Get superset groupings for a template"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    supersets = template.get_superset_groups()
    return [
        TemplateSupersetSchema(superset_group=group_id, exercises=exercises)
        for group_id, exercises in supersets.items()
    ]


@router.post("/{template_id}/equipment-check", response_model=TemplateEquipmentCheckResponseSchema)
async def check_equipment_compatibility(
    template_id: PydanticObjectId,
    equipment_check: TemplateEquipmentCheckSchema,
    current_user: User = Depends(get_current_user)
):
    """Check if template can be performed with available equipment"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    can_perform = template.can_be_performed_with_equipment(equipment_check.available_equipment)
    
    required_equipment = set(template.equipment_required)
    available_equipment = set(equipment_check.available_equipment)
    missing_equipment = list(required_equipment - available_equipment)
    
    return TemplateEquipmentCheckResponseSchema(
        can_perform=can_perform,
        missing_equipment=missing_equipment,
        alternative_exercises=[]  # Could be implemented to suggest alternatives
    )


@router.post("/", response_model=WorkoutTemplateResponseSchema)
async def create_workout_template(
    template_data: WorkoutTemplateCreateSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a new workout template"""
    template = WorkoutTemplate(
        user_id=current_user.id,
        **template_data.model_dump()
    )
    
    # Validate exercise ordering
    if not template.validate_exercise_order():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exercise order values must be unique"
        )
    
    # Reorder exercises
    template.reorder_exercises()
    
    await template.insert()
    return template


@router.put("/{template_id}", response_model=WorkoutTemplateResponseSchema)
async def update_workout_template(
    template_id: PydanticObjectId,
    template_data: WorkoutTemplateUpdateSchema,
    current_user: User = Depends(get_current_user)
):
    """Update a workout template"""
    template = await WorkoutTemplate.find_one({"_id": template_id, "user_id": current_user.id})
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    if template.is_system_template:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify system templates"
        )
    
    # Update fields
    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    # Validate and reorder if exercises were updated
    if "exercises" in update_data:
        if not template.validate_exercise_order():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exercise order values must be unique"
            )
        template.reorder_exercises()
    
    template.updated_at = datetime.utcnow()
    await template.save()
    
    return template


@router.post("/{template_id}/duplicate", response_model=WorkoutTemplateResponseSchema)
async def duplicate_template(
    template_id: PydanticObjectId,
    duplicate_data: DuplicateTemplateSchema,
    current_user: User = Depends(get_current_user)
):
    """Duplicate a workout template"""
    original_template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not original_template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Create new template based on original
    template_dict = original_template.model_dump(exclude={"id", "user_id", "created_at", "updated_at", "usage_count", "rating_average", "rating_count"})
    template_dict["name"] = duplicate_data.new_name
    template_dict["is_public"] = duplicate_data.make_public
    template_dict["based_on_template_id"] = template_id
    template_dict["user_id"] = current_user.id
    
    # Apply modifications if provided
    if duplicate_data.modifications:
        template_dict.update(duplicate_data.modifications)
    
    new_template = WorkoutTemplate(**template_dict)
    await new_template.insert()
    
    return new_template


@router.post("/{template_id}/rate", response_model=WorkoutTemplateResponseSchema)
async def rate_template(
    template_id: PydanticObjectId,
    rating_data: RateTemplateSchema,
    current_user: User = Depends(get_current_user)
):
    """Rate a workout template"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not public"
        )
    
    if template.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rate your own template"
        )
    
    template.update_rating(rating_data.rating)
    template.updated_at = datetime.utcnow()
    await template.save()
    
    return template


@router.post("/{template_id}/use", response_model=Dict[str, str])
async def use_template(
    template_id: PydanticObjectId,
    use_data: UseTemplateSchema,
    current_user: User = Depends(get_current_user)
):
    """Mark template as used (increment usage count)"""
    template = await WorkoutTemplate.find_one({
        "_id": template_id,
        "$or": [
            {"user_id": current_user.id},
            {"is_public": True},
            {"is_system_template": True}
        ]
    })
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    template.increment_usage()
    template.updated_at = datetime.utcnow()
    await template.save()
    
    return {"message": "Template usage recorded"}


@router.delete("/{template_id}")
async def delete_workout_template(
    template_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """Delete a workout template"""
    template = await WorkoutTemplate.find_one({"_id": template_id, "user_id": current_user.id})
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    if template.is_system_template:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete system templates"
        )
    
    await template.delete()
    return {"message": "Template deleted successfully"}