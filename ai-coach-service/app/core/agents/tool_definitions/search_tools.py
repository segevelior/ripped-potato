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
                "description": "Search for fitness content. search_type='video' finds an exercise DEMO from YouTube, quality-ranked from trusted fitness channels (pass a CLEAN exercise name, e.g. 'toes to bar' — do NOT add creator names, 'youtube', or 'tutorial'). search_type='article'/'general' searches the web for written guides. Use for 'how to do X', form tips, or external resources.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query. For video demos, use just the exercise name (e.g. 'muscle up', 'toes to bar'). For articles, be specific (e.g. 'proper deadlift form guide')."
                        },
                        "search_type": {
                            "type": "string",
                            "enum": ["general", "video", "article"],
                            "description": "'video' = quality-ranked YouTube exercise demo, 'article' = written guides, 'general' = mixed web results. Default: general"
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-5). Default: 3"
                        },
                        "exclude_previous": {
                            "type": "boolean",
                            "description": "For search_type='video' only: set true when the user disliked the video you just showed and wants a DIFFERENT one. The system remembers what it showed and returns a fresh alternative — you do NOT pass video ids."
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        # ==================== READ URL TOOL ====================
        {
            "type": "function",
            "function": {
                "name": "read_url",
                "description": "Read and extract full content from a specific URL. Use this when you need detailed information from an article, guide, or program page. Do NOT use for YouTube URLs (just embed videos instead). Best for: workout programs, detailed form guides, scientific articles, training methodologies.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "The URL to read. Must be a valid http/https URL. Avoid YouTube URLs."
                        },
                        "max_length": {
                            "type": "integer",
                            "description": "Maximum characters to return (500-10000). Default: 5000. Use higher for detailed programs/articles."
                        }
                    },
                    "required": ["url"]
                }
            }
        },
        # ==================== RESEARCH TOOL ====================
        {
            "type": "function",
            "function": {
                "name": "research",
                "description": "Conduct deep research on a fitness topic by searching multiple sources and synthesizing information. Use this for questions requiring comprehensive answers like 'what's the science behind...', 'compare X vs Y', 'best approach for...', or any topic needing multi-source research. Returns synthesized information from multiple articles.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "The topic to research. Be specific. Example: 'optimal rep ranges for hypertrophy', 'periodization models for strength', 'push pull legs vs upper lower split'"
                        },
                        "max_sources": {
                            "type": "integer",
                            "description": "Maximum number of sources to read (1-5). Default: 3. More sources = more comprehensive but slower."
                        },
                        "focus": {
                            "type": "string",
                            "enum": ["scientific", "practical", "programs", "general"],
                            "description": "Research focus. 'scientific' for studies/evidence, 'practical' for real-world application, 'programs' for training templates, 'general' for balanced. Default: general"
                        }
                    },
                    "required": ["topic"]
                }
            }
        },
    ]
