"""
Exercise service - handles exercise-related tool operations
"""

import re
from typing import Dict, Any, List
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

logger = structlog.get_logger()


class ExerciseService:
    """Service for exercise-related operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def add_exercise(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add an exercise to the user's personal exercise library"""
        try:
            # Build strain object with defaults
            strain_input = args.get("strain", {})
            strain = {
                "intensity": strain_input.get("intensity", "moderate"),
                "load": strain_input.get("load", "bodyweight"),
                "durationType": strain_input.get("durationType", "reps"),
                "typicalVolume": strain_input.get("typicalVolume", "3x10")
            }

            exercise_data = {
                "name": args["name"],
                "description": args.get("description", f"{args['name']} - a {args.get('difficulty', 'intermediate')} level exercise"),
                "muscles": args.get("muscles", ["Full Body"]),
                "secondaryMuscles": args.get("secondaryMuscles", []),
                "discipline": args.get("discipline", ["General Fitness"]),
                "equipment": args.get("equipment", []),
                "difficulty": args.get("difficulty", "intermediate"),
                "instructions": args.get("instructions", [f"Perform {args['name']} with proper form and control"]),
                "strain": strain,
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.exercises.insert_one(exercise_data)

            if result.inserted_id:
                logger.info(f"Added exercise {args['name']} for user {user_id}")
                return {
                    "success": True,
                    "message": f"Added '{args['name']}' to your exercise library!",
                    "exercise_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to add exercise"}

        except Exception as e:
            logger.error(f"Error adding exercise: {e}")
            return {"success": False, "message": str(e)}

    async def list_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List exercises from the database with optional filters"""
        try:
            # Build the base ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build additional filters
            additional_filters: List[Dict[str, Any]] = []

            # Name search (for finding specific exercises like "toes to bar")
            if args.get("name"):
                additional_filters.append({
                    "name": {"$regex": args["name"], "$options": "i"}
                })

            # Muscle filter (search primary and secondary muscles)
            if args.get("muscle"):
                muscle_pattern = args["muscle"]
                additional_filters.append({
                    "$or": [
                        {"muscles": {"$regex": muscle_pattern, "$options": "i"}},
                        {"secondaryMuscles": {"$regex": muscle_pattern, "$options": "i"}}
                    ]
                })

            # Discipline filter
            if args.get("discipline"):
                additional_filters.append({
                    "discipline": {"$regex": args["discipline"], "$options": "i"}
                })

            # Difficulty filter
            if args.get("difficulty"):
                additional_filters.append({"difficulty": args["difficulty"]})

            # Equipment filter
            if args.get("equipment"):
                additional_filters.append({
                    "equipment": {"$regex": args["equipment"], "$options": "i"}
                })

            # Combine all filters with $and
            if additional_filters:
                query = {"$and": [ownership_filter] + additional_filters}
            else:
                query = ownership_filter

            limit = args.get("limit", 20)

            logger.info(f"list_exercises query for user {user_id}: {query}")

            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "secondaryMuscles": 1, "difficulty": 1, "equipment": 1, "discipline": 1, "description": 1}
            ).limit(limit).to_list(None)

            logger.info(f"list_exercises found {len(exercises)} exercises")

            # Format results
            results = []
            for ex in exercises:
                results.append({
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "equipment": ex.get("equipment", []),
                    "discipline": ex.get("discipline", [])
                })

            return {
                "success": True,
                "count": len(results),
                "exercises": results
            }

        except Exception as e:
            logger.error(f"Error listing exercises: {e}")
            return {"success": False, "message": str(e)}

    async def grep_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across exercises using regex.
        Similar to ripgrep - searches all exercises and returns matches per pattern.
        Also finds SIMILAR exercises when exact match fails (fuzzy matching).
        """
        try:
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            output_mode = args.get("output_mode", "both")
            limit_per_pattern = args.get("limit", 5)

            # Build ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Extract keywords from all patterns for broader search
            all_keywords = set()
            for pattern in patterns:
                # Extract words (remove special chars, split)
                words = re.findall(r'[a-zA-Z]+', pattern.lower())
                # Filter out very short words and common words
                stopwords = {'to', 'the', 'a', 'an', 'in', 'on', 'with', 'for', 'and', 'or'}
                keywords = [w for w in words if len(w) > 2 and w not in stopwords]
                all_keywords.update(keywords)

            # Build broader search: match ANY keyword for fuzzy results
            keyword_regex = "|".join(all_keywords) if all_keywords else "|".join(patterns)

            query = {
                "$and": [
                    ownership_filter,
                    {"name": {"$regex": keyword_regex, "$options": "i"}}
                ]
            }

            # Fetch all potentially matching exercises (broader search)
            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "difficulty": 1, "discipline": 1, "equipment": 1, "description": 1, "_id": 1}
            ).to_list(None)

            # Build lookup with descriptions for user context
            all_exercises = [
                {
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "discipline": ex.get("discipline", []),
                    "equipment": ex.get("equipment", []),
                    "description": ex.get("description", "")[:100]  # First 100 chars of description
                }
                for ex in exercises
            ]

            # Helper function to calculate similarity score
            def similarity_score(pattern: str, exercise_name: str) -> float:
                """Calculate how similar a pattern is to an exercise name"""
                pattern_lower = pattern.lower()
                name_lower = exercise_name.lower()

                # Exact match
                if pattern_lower == name_lower:
                    return 1.0

                # Pattern is substring of name or vice versa
                if pattern_lower in name_lower or name_lower in pattern_lower:
                    return 0.9

                # Word overlap scoring
                pattern_words = set(re.findall(r'[a-zA-Z]+', pattern_lower))
                name_words = set(re.findall(r'[a-zA-Z]+', name_lower))

                if not pattern_words or not name_words:
                    return 0.0

                # Calculate Jaccard-like similarity
                intersection = len(pattern_words & name_words)
                union = len(pattern_words | name_words)

                if union == 0:
                    return 0.0

                base_score = intersection / union

                # Boost if key words match (longer words are more significant)
                key_matches = sum(1 for w in pattern_words if len(w) > 3 and w in name_words)
                boost = key_matches * 0.15

                return min(base_score + boost, 0.85)  # Cap at 0.85 for non-exact matches

            # Match each pattern to its results
            results_by_pattern = {}
            similar_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                scored_matches = []
                for ex in all_exercises:
                    score = similarity_score(pattern, ex["name"])
                    if score > 0:
                        scored_matches.append((score, ex))

                # Sort by score descending
                scored_matches.sort(key=lambda x: x[0], reverse=True)

                # Separate exact/high matches from similar matches
                exact_matches = [ex for score, ex in scored_matches if score >= 0.85]
                similar_matches = [
                    {**ex, "similarity": f"{int(score * 100)}%"}
                    for score, ex in scored_matches
                    if 0.3 <= score < 0.85
                ][:limit_per_pattern]

                if exact_matches:
                    results_by_pattern[pattern] = exact_matches[:limit_per_pattern]
                    matched_patterns.add(pattern)
                elif similar_matches:
                    # No exact match but found similar exercises
                    similar_by_pattern[pattern] = similar_matches
                    missing_patterns.append(pattern)
                else:
                    missing_patterns.append(pattern)

            # Build response based on output_mode
            response: Dict[str, Any] = {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns)
            }

            if output_mode in ("matches", "both"):
                response["matches"] = results_by_pattern

            if output_mode in ("missing", "both"):
                response["missing"] = missing_patterns

            # Add similar matches (always include if found)
            if similar_by_pattern:
                response["similar"] = similar_by_pattern
                response["has_similar"] = True

            # Summary for quick overview
            response["summary"] = f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            if similar_by_pattern:
                response["summary"] += f". Found {len(similar_by_pattern)} similar exercise(s) that might be what you're looking for"
            elif missing_patterns and len(missing_patterns) <= 10:
                response["summary"] += f". Missing: {', '.join(missing_patterns[:5])}"
                if len(missing_patterns) > 5:
                    response["summary"] += f" (+{len(missing_patterns) - 5} more)"

            return response

        except Exception as e:
            logger.error(f"Error in grep_exercises: {e}")
            return {"success": False, "message": str(e)}

    async def grep_workouts(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across workout templates using regex.
        """
        try:
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            limit_per_pattern = args.get("limit", 5)
            search_fields = args.get("search_fields", ["name", "goal"])

            # Build ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build combined regex pattern
            combined_regex = "|".join(f"({p})" for p in patterns)

            # Build field search conditions
            field_conditions = []
            if "name" in search_fields:
                field_conditions.append({"name": {"$regex": combined_regex, "$options": "i"}})
            if "goal" in search_fields:
                field_conditions.append({"goal": {"$regex": combined_regex, "$options": "i"}})
            if "tags" in search_fields:
                field_conditions.append({"tags": {"$regex": combined_regex, "$options": "i"}})

            query = {
                "$and": [
                    ownership_filter,
                    {"$or": field_conditions} if field_conditions else {}
                ]
            }

            # Fetch matching workouts
            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "tags": 1, "blocks": 1, "_id": 1}
            ).to_list(None)

            # Build lookup
            all_workouts = [
                {
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "tags": w.get("tags", []),
                    "exercise_count": sum(len(b.get("exercises", [])) for b in w.get("blocks", []))
                }
                for w in workouts
            ]

            # Match each pattern
            results_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                try:
                    regex = re.compile(pattern, re.IGNORECASE)
                    matches = []
                    for w in all_workouts:
                        # Search in configured fields
                        if ("name" in search_fields and regex.search(w["name"])) or \
                           ("goal" in search_fields and regex.search(w["goal"])) or \
                           ("tags" in search_fields and any(regex.search(t) for t in w["tags"])):
                            matches.append(w)

                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)
                except re.error:
                    pattern_lower = pattern.lower()
                    matches = [w for w in all_workouts if pattern_lower in w["name"].lower() or pattern_lower in w["goal"].lower()]
                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)

            return {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns),
                "matches": results_by_pattern,
                "missing": missing_patterns,
                "summary": f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            }

        except Exception as e:
            logger.error(f"Error in grep_workouts: {e}")
            return {"success": False, "message": str(e)}
