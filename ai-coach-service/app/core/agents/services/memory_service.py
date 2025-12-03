"""
Memory service - handles user memory operations (Sensei memory)
"""

from typing import Dict, Any, List
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

logger = structlog.get_logger()


class MemoryService:
    """Service for user memory operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def save_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Save important information about the user to memory"""
        try:
            content = args.get("content")
            if not content:
                return {"success": False, "message": "Memory content is required"}

            category = args.get("category", "general")
            importance = args.get("importance", "medium")
            tags = args.get("tags", [])

            # Ensure tags are lowercase strings
            if tags:
                tags = [str(t).lower().strip() for t in tags if t]

            memory_item = {
                "_id": ObjectId(),
                "content": content.strip()[:500],  # Limit to 500 chars
                "category": category,
                "tags": tags,
                "source": "sensei",  # Mark as AI-generated
                "importance": importance,
                "isActive": True,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Try to find existing user memory document
            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})

            if user_memory:
                # Add to existing memories array
                result = await self.db.usermemories.update_one(
                    {"user": ObjectId(user_id)},
                    {
                        "$push": {"memories": memory_item},
                        "$set": {"updatedAt": datetime.utcnow()}
                    }
                )
                success = result.modified_count > 0
            else:
                # Create new user memory document
                new_doc = {
                    "user": ObjectId(user_id),
                    "memories": [memory_item],
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }
                result = await self.db.usermemories.insert_one(new_doc)
                success = result.inserted_id is not None

            if success:
                # Build a friendly confirmation message
                category_emoji = {
                    "health": "",
                    "preference": "",
                    "goal": "",
                    "lifestyle": "",
                    "general": ""
                }
                emoji = category_emoji.get(category, "")

                logger.info(f"Saved memory for user {user_id}: {content[:50]}...")
                return {
                    "success": True,
                    "message": f"{emoji} I'll remember that! Saved to your memory under **{category}**.".strip(),
                    "memory_id": str(memory_item["_id"])
                }
            else:
                return {"success": False, "message": "Failed to save memory"}

        except Exception as e:
            logger.error(f"Error saving memory: {e}")
            return {"success": False, "message": f"Error saving memory: {str(e)}"}

    async def get_user_memories(self, user_id: str) -> List[Dict[str, Any]]:
        """Get active memories for a user (for prompt injection)"""
        try:
            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return []

            # Filter to only active memories and sort by importance
            active_memories = [m for m in user_memory.get("memories", []) if m.get("isActive", True)]

            # Sort by importance (high first)
            importance_order = {"high": 0, "medium": 1, "low": 2}
            active_memories.sort(key=lambda m: importance_order.get(m.get("importance", "medium"), 1))

            return active_memories
        except Exception as e:
            logger.error(f"Error getting user memories: {e}")
            return []

    async def delete_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a memory matching the search text"""
        try:
            search_text = args.get("search_text", "").lower()
            category_filter = args.get("category")

            if not search_text:
                return {"success": False, "message": "Please specify what memory to delete"}

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {"success": False, "message": "No memories found"}

            memories = user_memory.get("memories", [])
            original_count = len(memories)

            # Find memories matching the search text
            memories_to_keep = []
            deleted_memories = []

            for mem in memories:
                content_lower = mem.get("content", "").lower()
                category_match = not category_filter or mem.get("category") == category_filter

                if search_text in content_lower and category_match:
                    deleted_memories.append(mem)
                else:
                    memories_to_keep.append(mem)

            if not deleted_memories:
                return {"success": False, "message": f"No memories found matching '{search_text}'"}

            # Update the document
            result = await self.db.usermemories.update_one(
                {"user": ObjectId(user_id)},
                {
                    "$set": {
                        "memories": memories_to_keep,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                deleted_count = len(deleted_memories)
                deleted_preview = deleted_memories[0].get("content", "")[:50]
                logger.info(f"Deleted {deleted_count} memory(ies) for user {user_id}")
                return {
                    "success": True,
                    "message": f"Deleted {deleted_count} memory(ies) matching '{search_text}'.",
                    "deleted_count": deleted_count
                }
            else:
                return {"success": False, "message": "Failed to delete memory"}

        except Exception as e:
            logger.error(f"Error deleting memory: {e}")
            return {"success": False, "message": f"Error deleting memory: {str(e)}"}

    async def list_memories(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List all memories for the user"""
        try:
            category_filter = args.get("category")

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {
                    "success": True,
                    "message": "I don't have any memories saved about you yet.",
                    "memories": []
                }

            memories = user_memory.get("memories", [])

            # Filter by category if specified
            if category_filter:
                memories = [m for m in memories if m.get("category") == category_filter]

            # Filter to active only
            active_memories = [m for m in memories if m.get("isActive", True)]

            if not active_memories:
                if category_filter:
                    return {
                        "success": True,
                        "message": f"No active memories in the **{category_filter}** category.",
                        "memories": []
                    }
                return {
                    "success": True,
                    "message": "I don't have any active memories saved about you.",
                    "memories": []
                }

            # Format memories for display
            category_labels = {
                "health": "health",
                "preference": "preference",
                "goal": "goal",
                "lifestyle": "lifestyle",
                "general": "general"
            }

            formatted = []
            for mem in active_memories:
                cat = mem.get("category", "general")
                importance = mem.get("importance", "medium")
                imp_marker = "[!] " if importance == "high" else ""
                formatted.append({
                    "category": cat,
                    "content": mem.get("content"),
                    "importance": importance,
                    "display": f"{imp_marker}[{cat}] {mem.get('content')}"
                })

            # Build message
            message = f"Here's what I remember about you ({len(formatted)} memories):\n\n"
            for f in formatted:
                message += f"- {f['display']}\n"

            message += "\n_You can manage these in **Settings > Sensei Memory**_"

            return {
                "success": True,
                "message": message,
                "memories": formatted,
                "count": len(formatted)
            }

        except Exception as e:
            logger.error(f"Error listing memories: {e}")
            return {"success": False, "message": f"Error listing memories: {str(e)}"}

    async def update_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing memory"""
        try:
            search_text = args.get("search_text", "").lower()
            new_content = args.get("new_content")
            new_category = args.get("category")
            new_importance = args.get("importance")

            if not search_text or not new_content:
                return {"success": False, "message": "Please specify what memory to update and the new content"}

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {"success": False, "message": "No memories found"}

            memories = user_memory.get("memories", [])
            updated = False

            for mem in memories:
                content_lower = mem.get("content", "").lower()
                if search_text in content_lower:
                    # Preserve old content in history for audit trail
                    old_content = mem.get("content", "")
                    old_category = mem.get("category")
                    old_importance = mem.get("importance")

                    history_entry = {
                        "content": old_content,
                        "category": old_category,
                        "importance": old_importance,
                        "changedAt": datetime.utcnow()
                    }

                    # Initialize history array if it doesn't exist
                    if "history" not in mem:
                        mem["history"] = []
                    mem["history"].append(history_entry)

                    # Update the memory with new values
                    mem["content"] = new_content.strip()[:500]
                    mem["updatedAt"] = datetime.utcnow()
                    if new_category:
                        mem["category"] = new_category
                    if new_importance:
                        mem["importance"] = new_importance
                    updated = True
                    break  # Only update first match

            if not updated:
                # No existing memory found - create a new one instead
                logger.info(f"No memory found matching '{search_text}', creating new memory")
                return await self.save_memory(user_id, {
                    "content": new_content,
                    "category": new_category or "general",
                    "importance": new_importance or "medium"
                })

            result = await self.db.usermemories.update_one(
                {"user": ObjectId(user_id)},
                {
                    "$set": {
                        "memories": memories,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                logger.info(f"Updated memory for user {user_id} (history preserved)")
                return {
                    "success": True,
                    "message": f"Memory updated! New content: **{new_content[:100]}{'...' if len(new_content) > 100 else ''}**",
                    "history_preserved": True
                }
            else:
                return {"success": False, "message": "Failed to update memory"}

        except Exception as e:
            logger.error(f"Error updating memory: {e}")
            return {"success": False, "message": f"Error updating memory: {str(e)}"}
