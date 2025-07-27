from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from beanie import PydanticObjectId
from app.models.exercise import Exercise
from app.models.user import User
from app.schemas.exercise import (
    ExerciseCreate,
    ExerciseUpdate,
    ExerciseResponse,
    ExerciseSearchRequest,
    ExerciseListResponse
)
from app.api.deps import get_current_active_user
from datetime import datetime

router = APIRouter()


@router.post("/search", response_model=ExerciseListResponse)
async def search_exercises(
    search_request: ExerciseSearchRequest,
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """Search exercises with GraphQL-style filtering."""
    # Build query from filters
    query = {}
    
    if search_request.filters:
        # Handle different filter types
        for key, value in search_request.filters.items():
            if key == "name" and value:
                # Case-insensitive name search
                query["name"] = {"$regex": value, "$options": "i"}
            elif key == "discipline" and value:
                # Match any discipline in the list
                if isinstance(value, list):
                    query["discipline"] = {"$in": value}
                else:
                    query["discipline"] = value
            elif key == "muscles" and value:
                # Match any muscle in the list
                if isinstance(value, list):
                    query["muscles"] = {"$in": value}
                else:
                    query["muscles"] = value
            elif key == "equipment" and value:
                if isinstance(value, list):
                    query["equipment"] = {"$in": value}
                else:
                    query["equipment"] = value
            elif key == "intensity" and value:
                query["strain.intensity"] = value
            elif key == "load" and value:
                query["strain.load"] = value
            elif key == "progression_group" and value:
                query["progression_group"] = value
    
    # Get total count
    total = await Exercise.find(query).count()
    
    # Get exercises with pagination and sorting
    sort_field = search_request.sort
    if sort_field.startswith("-"):
        sort_field = sort_field[1:]
        sort_direction = -1
    else:
        sort_direction = 1
    
    exercises = await Exercise.find(query).sort(
        [(sort_field, sort_direction)]
    ).skip(search_request.skip).limit(search_request.limit).to_list()
    
    # Convert to response format
    exercise_responses = [
        ExerciseResponse(
            id=str(exercise.id),
            name=exercise.name,
            discipline=exercise.discipline,
            muscles=exercise.muscles,
            equipment=exercise.equipment,
            strain=exercise.strain,
            similar_exercises=exercise.similar_exercises,
            progression_group=exercise.progression_group,
            progression_level=exercise.progression_level,
            next_progression=exercise.next_progression,
            previous_progression=exercise.previous_progression,
            description=exercise.description,
            created_at=exercise.created_at,
            updated_at=exercise.updated_at,
            created_by=exercise.created_by
        )
        for exercise in exercises
    ]
    
    return ExerciseListResponse(
        exercises=exercise_responses,
        total=total,
        skip=search_request.skip,
        limit=search_request.limit
    )


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    exercise_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get a specific exercise by ID."""
    exercise = await Exercise.get(exercise_id)
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    
    return ExerciseResponse(
        id=str(exercise.id),
        name=exercise.name,
        discipline=exercise.discipline,
        muscles=exercise.muscles,
        equipment=exercise.equipment,
        strain=exercise.strain,
        similar_exercises=exercise.similar_exercises,
        progression_group=exercise.progression_group,
        progression_level=exercise.progression_level,
        next_progression=exercise.next_progression,
        previous_progression=exercise.previous_progression,
        description=exercise.description,
        created_at=exercise.created_at,
        updated_at=exercise.updated_at,
        created_by=exercise.created_by
    )


@router.post("/", response_model=ExerciseResponse)
async def create_exercise(
    exercise_in: ExerciseCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new exercise."""
    # Check if exercise with same name already exists
    existing = await Exercise.find_one({"name": {"$regex": f"^{exercise_in.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exercise with this name already exists"
        )
    
    # Create exercise
    exercise = Exercise(
        **exercise_in.dict(),
        created_by=str(current_user.id)
    )
    await exercise.create()
    
    return ExerciseResponse(
        id=str(exercise.id),
        name=exercise.name,
        discipline=exercise.discipline,
        muscles=exercise.muscles,
        equipment=exercise.equipment,
        strain=exercise.strain,
        similar_exercises=exercise.similar_exercises,
        progression_group=exercise.progression_group,
        progression_level=exercise.progression_level,
        next_progression=exercise.next_progression,
        previous_progression=exercise.previous_progression,
        description=exercise.description,
        created_at=exercise.created_at,
        updated_at=exercise.updated_at,
        created_by=exercise.created_by
    )


@router.put("/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    exercise_id: str,
    exercise_update: ExerciseUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update an exercise."""
    exercise = await Exercise.get(exercise_id)
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    
    # Update only provided fields
    update_data = exercise_update.dict(exclude_unset=True)
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await exercise.update({"$set": update_data})
    
    # Refresh from database
    exercise = await Exercise.get(exercise_id)
    
    return ExerciseResponse(
        id=str(exercise.id),
        name=exercise.name,
        discipline=exercise.discipline,
        muscles=exercise.muscles,
        equipment=exercise.equipment,
        strain=exercise.strain,
        similar_exercises=exercise.similar_exercises,
        progression_group=exercise.progression_group,
        progression_level=exercise.progression_level,
        next_progression=exercise.next_progression,
        previous_progression=exercise.previous_progression,
        description=exercise.description,
        created_at=exercise.created_at,
        updated_at=exercise.updated_at,
        created_by=exercise.created_by
    )


@router.delete("/{exercise_id}")
async def delete_exercise(
    exercise_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete an exercise."""
    exercise = await Exercise.get(exercise_id)
    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
        )
    
    await exercise.delete()
    
    return {"message": "Exercise deleted successfully"} 