"""
Web search tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_search_tools() -> List[Dict[str, Any]]:
    """Return web search-related tool definitions"""
    return [
        # ==================== WEB SEARCH TOOL ====================
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for fitness-related information, exercise tutorials, form guides, and educational content. Use this when users ask 'how to do' an exercise, want video tutorials, need form tips, or want external resources about fitness topics.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query. Be specific and include 'tutorial', 'how to', 'form guide', etc. for better results. Example: 'how to do muscle ups tutorial' or 'proper deadlift form guide'"
                        },
                        "search_type": {
                            "type": "string",
                            "enum": ["general", "video", "article"],
                            "description": "Type of content to search for. 'video' prioritizes YouTube/video results, 'article' prioritizes written guides, 'general' returns mixed results. Default: general"
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-5). Default: 3"
                        }
                    },
                    "required": ["query"]
                }
            }
        },
    ]
