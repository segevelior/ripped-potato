"""
Memory tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_memory_tools() -> List[Dict[str, Any]]:
    """Return memory-related tool definitions"""
    return [
        # ==================== MEMORY TOOL ====================
        {
            "type": "function",
            "function": {
                "name": "save_memory",
                "description": "Save important information about the user to memory. Use this when you learn something significant about the user that would help personalize future coaching - such as injuries, preferences, goals, lifestyle factors, or training history. Also use when user explicitly asks you to remember something or uses #memorize tag.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The information to remember about the user. Be concise but specific. Example: 'Has chronic knee pain - avoid deep squats and high-impact jumping'"
                        },
                        "category": {
                            "type": "string",
                            "enum": ["health", "preference", "goal", "lifestyle", "general"],
                            "description": "Category of the memory: 'health' for injuries/conditions, 'preference' for training style/content preferences, 'goal' for fitness objectives, 'lifestyle' for schedule/equipment/environment, 'general' for other important info"
                        },
                        "importance": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                            "description": "How important this memory is. 'high' for safety-critical info (injuries, conditions), 'medium' for preferences that affect recommendations, 'low' for nice-to-know details"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tags to categorize the memory (e.g., ['knee', 'injury', 'squats'])"
                        }
                    },
                    "required": ["content", "category"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_memory",
                "description": "Delete a memory about the user. Use when user asks to forget something, says information is outdated, or wants to remove a previously saved memory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "search_text": {
                            "type": "string",
                            "description": "Text to search for in the memory content. Will delete memories containing this text. Example: 'knee pain' to delete the memory about knee issues."
                        },
                        "category": {
                            "type": "string",
                            "enum": ["health", "preference", "goal", "lifestyle", "general"],
                            "description": "Optional: Only delete memories in this category"
                        }
                    },
                    "required": ["search_text"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_memories",
                "description": "List all memories saved about the user. Use when user asks what you know/remember about them.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": ["health", "preference", "goal", "lifestyle", "general"],
                            "description": "Optional: Filter to only show memories in this category"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_memory",
                "description": "Update an existing memory with new information. Use when user wants to modify a previously saved memory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "search_text": {
                            "type": "string",
                            "description": "Text to search for in the memory content to find the memory to update."
                        },
                        "new_content": {
                            "type": "string",
                            "description": "The new content to replace the old memory with."
                        },
                        "category": {
                            "type": "string",
                            "enum": ["health", "preference", "goal", "lifestyle", "general"],
                            "description": "Optional: New category for the memory"
                        },
                        "importance": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                            "description": "Optional: New importance level"
                        }
                    },
                    "required": ["search_text", "new_content"]
                }
            }
        },
    ]
