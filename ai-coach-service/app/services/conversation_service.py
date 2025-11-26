from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
import math
import re
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = structlog.get_logger()

COLLECTION_NAME = "chatConversations"


class ConversationService:
    """Service for conversation history operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[COLLECTION_NAME]

    async def ensure_indexes(self):
        """Create indexes for efficient querying"""
        try:
            # Unique index on conversation_id for fast lookups
            await self.collection.create_index(
                "conversation_id",
                unique=True,
                name="conversation_id_unique"
            )

            # Index on user_id for fetching user's conversations
            await self.collection.create_index(
                "metadata.user_id",
                name="user_id_idx"
            )

            # Compound index for user conversations sorted by date
            await self.collection.create_index(
                [("metadata.user_id", 1), ("updatedAt", -1)],
                name="user_conversations_sorted"
            )

            # Index on createdAt for general sorting
            await self.collection.create_index(
                "createdAt",
                name="created_at_idx"
            )

            # Index on feedback rating for admin queries
            await self.collection.create_index(
                "feedback.rating",
                name="feedback_rating_idx",
                sparse=True
            )

            logger.info(f"Indexes ensured for {COLLECTION_NAME} collection")
            return True

        except Exception as e:
            logger.error(f"Failed to create indexes: {e}")
            return False

    def _extract_clean_title(self, message: str) -> str:
        """Extract a clean title from a message, removing hidden prompts"""
        if not message:
            return "New Conversation"

        # Check if this is a workout request with hidden context
        if message.startswith("[WORKOUT REQUEST"):
            # Try to extract the user's actual input
            # Pattern: "Here's what I'm looking for: <user input>"
            user_input_match = re.search(r"Here's what I'm looking for:\s*(.+?)(?:\n|Please)", message, re.DOTALL)
            if user_input_match:
                clean_title = user_input_match.group(1).strip()
                return clean_title[:100] if clean_title else "Workout planning"
            # If no specific input, use a generic workout title
            return "Workout planning"

        # For regular messages, just use the first part
        return message[:100].strip()

    async def create_conversation(
        self,
        user_id: str,
        title: Optional[str] = None,
        initial_message: Optional[str] = None,
        model_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new conversation"""
        try:
            conversation_id = str(uuid.uuid4())
            now = datetime.utcnow()

            # Auto-generate title from initial message if not provided
            if not title and initial_message:
                title = self._extract_clean_title(initial_message)
            elif not title:
                title = "New Conversation"

            conversation_doc = {
                "conversation_id": conversation_id,
                "title": title,
                "messages": [],
                "metadata": {
                    "user_id": user_id
                },
                "model_info": model_info or {
                    "llm_provider": "openai",
                    "llm_model": "gpt-4o"
                },
                "feedback": [],
                "createdAt": now,
                "updatedAt": now
            }

            # Add initial message if provided
            if initial_message:
                conversation_doc["messages"].append({
                    "role": "human",
                    "content": initial_message,
                    "timestamp": now.isoformat() + "+00:00"
                })

            result = await self.collection.insert_one(conversation_doc)

            if result.inserted_id:
                logger.info(f"Created conversation {conversation_id} for user {user_id}")
                return {
                    "success": True,
                    "conversation_id": conversation_id,
                    "title": title,
                    "createdAt": now.isoformat()
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to create conversation"
                }

        except Exception as e:
            logger.error(f"Failed to create conversation: {e}")
            return {
                "success": False,
                "message": f"Error creating conversation: {str(e)}"
            }

    async def get_conversation(
        self,
        conversation_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get a conversation by ID"""
        try:
            query = {"conversation_id": conversation_id}
            if user_id:
                query["metadata.user_id"] = user_id

            conversation = await self.collection.find_one(query)

            if conversation:
                # Convert ObjectId to string
                conversation["_id"] = str(conversation["_id"])
                return conversation
            return None

        except Exception as e:
            logger.error(f"Failed to get conversation {conversation_id}: {e}")
            return None

    async def get_user_conversations(
        self,
        user_id: str,
        limit: int = 50,
        skip: int = 0
    ) -> Dict[str, Any]:
        """Get all conversations for a user"""
        try:
            query = {"metadata.user_id": user_id}

            # Get total count
            total = await self.collection.count_documents(query)

            # Get conversations sorted by updatedAt descending
            cursor = self.collection.find(
                query,
                {
                    "conversation_id": 1,
                    "title": 1,
                    "createdAt": 1,
                    "updatedAt": 1,
                    "messages": 1
                }
            ).sort("updatedAt", -1).skip(skip).limit(limit)

            conversations = []
            async for conv in cursor:
                conversations.append({
                    "conversation_id": conv["conversation_id"],
                    "title": conv["title"],
                    "createdAt": conv.get("createdAt"),
                    "updatedAt": conv.get("updatedAt"),
                    "message_count": len(conv.get("messages", []))
                })

            return {
                "conversations": conversations,
                "total": total
            }

        except Exception as e:
            logger.error(f"Failed to get conversations for user {user_id}: {e}")
            return {
                "conversations": [],
                "total": 0
            }

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        response_time_ms: Optional[int] = None,
        user_id: Optional[str] = None
    ) -> bool:
        """Add a message to a conversation"""
        try:
            now = datetime.utcnow()
            message = {
                "role": role,
                "content": content,
                "timestamp": now.isoformat() + "+00:00"
            }

            if response_time_ms is not None:
                message["response_time_ms"] = response_time_ms

            query = {"conversation_id": conversation_id}
            if user_id:
                query["metadata.user_id"] = user_id

            result = await self.collection.update_one(
                query,
                {
                    "$push": {"messages": message},
                    "$set": {"updatedAt": now}
                }
            )

            if result.modified_count > 0:
                logger.debug(f"Added {role} message to conversation {conversation_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Failed to add message to conversation {conversation_id}: {e}")
            return False

    async def add_feedback(
        self,
        conversation_id: str,
        message_index: int,
        rating: Optional[str] = None,
        feedback_text: Optional[str] = None,
        question_preview: Optional[str] = None,
        answer_preview: Optional[str] = None
    ) -> bool:
        """Add feedback to a conversation"""
        try:
            now = datetime.utcnow()
            feedback = {
                "message_index": message_index,
                "rating": rating,
                "feedback_text": feedback_text,
                "timestamp": now.isoformat() + "+00:00",
                "question_preview": question_preview,
                "answer_preview": answer_preview
            }

            result = await self.collection.update_one(
                {"conversation_id": conversation_id},
                {
                    "$push": {"feedback": feedback},
                    "$set": {"updatedAt": now}
                }
            )

            if result.modified_count > 0:
                logger.info(f"Added feedback to conversation {conversation_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Failed to add feedback to conversation {conversation_id}: {e}")
            return False

    async def update_title(
        self,
        conversation_id: str,
        title: str,
        user_id: Optional[str] = None
    ) -> bool:
        """Update conversation title"""
        try:
            query = {"conversation_id": conversation_id}
            if user_id:
                query["metadata.user_id"] = user_id

            result = await self.collection.update_one(
                query,
                {
                    "$set": {
                        "title": title,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            return result.modified_count > 0

        except Exception as e:
            logger.error(f"Failed to update title for conversation {conversation_id}: {e}")
            return False

    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str
    ) -> bool:
        """Delete a conversation"""
        try:
            result = await self.collection.delete_one({
                "conversation_id": conversation_id,
                "metadata.user_id": user_id
            })

            if result.deleted_count > 0:
                logger.info(f"Deleted conversation {conversation_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Failed to delete conversation {conversation_id}: {e}")
            return False

    async def get_paginated_feedbacks(
        self,
        page: int = 1,
        limit: int = 50,
        rating: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get paginated feedbacks across all conversations"""
        try:
            # Build aggregation pipeline
            pipeline = []

            # Unwind feedback array
            pipeline.append({"$unwind": "$feedback"})

            # Match filters
            match_stage = {}
            if rating:
                match_stage["feedback.rating"] = rating
            if user_id:
                match_stage["metadata.user_id"] = user_id

            if match_stage:
                pipeline.append({"$match": match_stage})

            # Get total count
            count_pipeline = pipeline + [{"$count": "total"}]
            count_result = await self.collection.aggregate(count_pipeline).to_list(1)
            total = count_result[0]["total"] if count_result else 0

            # Add projection and pagination
            pipeline.append({
                "$project": {
                    "conversation_id": 1,
                    "user_id": "$metadata.user_id",
                    "feedback": 1
                }
            })
            pipeline.append({"$sort": {"feedback.timestamp": -1}})
            pipeline.append({"$skip": (page - 1) * limit})
            pipeline.append({"$limit": limit})

            cursor = self.collection.aggregate(pipeline)
            feedbacks = []
            async for doc in cursor:
                feedbacks.append({
                    "conversation_id": doc["conversation_id"],
                    "message_index": doc["feedback"]["message_index"],
                    "rating": doc["feedback"].get("rating"),
                    "feedback_text": doc["feedback"].get("feedback_text"),
                    "question_preview": doc["feedback"].get("question_preview"),
                    "answer_preview": doc["feedback"].get("answer_preview"),
                    "timestamp": doc["feedback"].get("timestamp"),
                    "user_id": doc["user_id"]
                })

            return {
                "feedbacks": feedbacks,
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": math.ceil(total / limit) if total > 0 else 0
            }

        except Exception as e:
            logger.error(f"Failed to get paginated feedbacks: {e}")
            return {
                "feedbacks": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "total_pages": 0
            }

    async def get_or_create_conversation(
        self,
        conversation_id: Optional[str],
        user_id: str,
        initial_message: str,
        model_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Get existing conversation or create a new one"""
        if conversation_id:
            existing = await self.get_conversation(conversation_id, user_id)
            if existing:
                return {
                    "success": True,
                    "conversation_id": conversation_id,
                    "is_new": False,
                    "conversation": existing
                }

        # Create new conversation
        result = await self.create_conversation(
            user_id=user_id,
            initial_message=initial_message,
            model_info=model_info
        )

        if result.get("success"):
            result["is_new"] = True

        return result
