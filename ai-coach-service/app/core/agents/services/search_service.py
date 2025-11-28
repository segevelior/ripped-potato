"""
Search service - handles web search operations
"""

import re
from typing import Dict, Any
from tavily import TavilyClient
import structlog

logger = structlog.get_logger()


class SearchService:
    """Service for web search operations"""

    def __init__(self, tavily_api_key: str = None):
        self.tavily_api_key = tavily_api_key

    async def web_search(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Search the web for fitness-related content using Tavily"""
        try:
            query = args.get("query")
            if not query:
                return {"success": False, "message": "Search query is required"}

            search_type = args.get("search_type", "general")
            max_results = min(args.get("max_results", 3), 5)  # Cap at 5

            # Check if Tavily API key is configured
            if not self.tavily_api_key:
                return {
                    "success": False,
                    "message": "Web search is not configured. Please add TAVILY_API_KEY to your environment."
                }

            # Initialize Tavily client
            tavily = TavilyClient(api_key=self.tavily_api_key)

            # Preferred fitness creators by category
            PREFERRED_CREATORS = {
                "calisthenics": ["Saturno Movement", "Calisthenicmovement", "FitnessFAQs", "Chris Heria", "Hybrid Calisthenics"],
                "bodyweight": ["Saturno Movement", "Calisthenicmovement", "FitnessFAQs", "Hybrid Calisthenics", "Minus The Gym"],
                "strength": ["Athlean-X", "Jeff Nippard", "Jeremy Ethier", "Renaissance Periodization"],
                "mobility": ["Tom Merrick", "Squat University", "GMB Fitness"],
                "flexibility": ["Tom Merrick", "GMB Fitness", "Yoga With Adriene"],
                "powerlifting": ["Juggernaut Training Systems", "Calgary Barbell", "Squat University"],
                "yoga": ["Yoga With Adriene", "Breathe and Flow"],
                "meditation": ["Yoga With Adriene", "Headspace"],
            }

            # Detect category from query to boost with preferred creators
            query_lower = query.lower()
            creator_boost = ""

            # Check for category keywords in query
            for category, creators in PREFERRED_CREATORS.items():
                if category in query_lower:
                    creator_boost = f" {creators[0]} OR {creators[1]}"
                    break

            # Also check for common exercise types
            if not creator_boost:
                calisthenics_keywords = ["pull up", "pull-up", "muscle up", "muscle-up", "dip", "handstand", "planche", "front lever", "back lever", "l-sit", "ring"]
                strength_keywords = ["deadlift", "squat", "bench press", "barbell", "dumbbell", "overhead press"]
                mobility_keywords = ["mobility", "stretch", "flexibility", "warm up", "warm-up"]

                if any(kw in query_lower for kw in calisthenics_keywords):
                    creator_boost = " Saturno Movement OR Calisthenicmovement"
                elif any(kw in query_lower for kw in strength_keywords):
                    creator_boost = " Athlean-X OR Jeff Nippard"
                elif any(kw in query_lower for kw in mobility_keywords):
                    creator_boost = " Tom Merrick OR Squat University"

            # Enhance query for fitness context
            enhanced_query = query
            if search_type == "video":
                enhanced_query = f"{query}{creator_boost} video tutorial youtube"
            elif search_type == "article":
                enhanced_query = f"{query} guide article"
            else:
                enhanced_query = f"{query}{creator_boost}"

            # Perform search
            logger.info(f"Web search for user {user_id}: {enhanced_query}")
            response = tavily.search(
                query=enhanced_query,
                max_results=max_results,
                search_depth="basic",
                include_answer=True,
                include_domains=["youtube.com", "bodybuilding.com", "menshealth.com",
                                "womenshealthmag.com", "stack.com", "t-nation.com",
                                "strengthlog.com", "exrx.net", "verywellfit.com"] if search_type != "general" else None
            )

            # Format results
            results = []
            for result in response.get("results", []):
                url = result.get("url", "")
                is_video = "youtube.com" in url or "youtu.be" in url
                video_id = None

                # Extract YouTube video ID
                if is_video:
                    patterns = [
                        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
                    ]
                    for pattern in patterns:
                        match = re.search(pattern, url)
                        if match:
                            video_id = match.group(1)
                            break

                results.append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("content", "")[:300] + "..." if len(result.get("content", "")) > 300 else result.get("content", ""),
                    "is_video": is_video,
                    "video_id": video_id
                })

            # Build response message
            if results:
                message = f"Found **{len(results)} results** for \"{query}\":"

                for i, r in enumerate(results, 1):
                    if r["is_video"] and r["video_id"]:
                        # Use video-embed tag for YouTube videos
                        message += f"\n\n<video-embed videoid=\"{r['video_id']}\" title=\"{r['title']}\" />"
                    else:
                        # Regular link for articles
                        message += f"\n\n**{i}. [{r['title']}]({r['url']})**\n{r['snippet']}"

                # Include Tavily's AI answer if available
                ai_answer = response.get("answer")
                if ai_answer:
                    message = f"**Quick Answer:** {ai_answer}\n\n---\n\n{message}"
            else:
                message = f"No results found for \"{query}\". Try a different search term."

            return {
                "success": True,
                "message": message,
                "results": results,
                "answer": response.get("answer")
            }

        except Exception as e:
            logger.error(f"Error in web search: {e}")
            return {"success": False, "message": f"Search failed: {str(e)}"}
