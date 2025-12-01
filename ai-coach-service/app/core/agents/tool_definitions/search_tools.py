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
                "description": "Search the web for fitness-related information, exercise tutorials, form guides, and educational content. Use this when users ask 'how to do' an exercise, want video tutorials, need form tips, or want external resources about fitness topics. Returns snippets and links - use read_url for full content.",
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
