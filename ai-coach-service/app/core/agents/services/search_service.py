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

    async def read_url(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Read and extract full content from a specific URL using Tavily Extract"""
        try:
            url = args.get("url")
            if not url:
                return {"success": False, "message": "URL is required"}

            # Validate URL format
            if not url.startswith(("http://", "https://")):
                return {"success": False, "message": "Invalid URL format. Must start with http:// or https://"}

            # Warn about YouTube URLs (they don't have useful text content)
            is_youtube = "youtube.com" in url or "youtu.be" in url
            if is_youtube:
                return {
                    "success": False,
                    "message": "YouTube URLs don't have readable text content. Use web_search to find and embed videos instead."
                }

            max_length = min(args.get("max_length", 5000), 10000)  # Cap at 10k

            # Check if Tavily API key is configured
            if not self.tavily_api_key:
                return {
                    "success": False,
                    "message": "URL reading is not configured. Please add TAVILY_API_KEY to your environment."
                }

            # Initialize Tavily client and extract content
            tavily = TavilyClient(api_key=self.tavily_api_key)

            logger.info(f"Reading URL for user {user_id}: {url}")
            response = tavily.extract(urls=[url])

            # Get the extracted content
            results = response.get("results", [])
            if not results:
                return {
                    "success": False,
                    "message": f"Could not extract content from {url}. The page may be blocked or require authentication."
                }

            content = results[0].get("raw_content", "")
            if not content:
                return {
                    "success": False,
                    "message": f"No readable content found at {url}."
                }

            # Truncate if needed
            truncated = len(content) > max_length
            if truncated:
                content = content[:max_length] + "\n\n[Content truncated...]"

            return {
                "success": True,
                "message": f"Successfully read content from {url}",
                "content": content,
                "url": url,
                "truncated": truncated,
                "original_length": len(results[0].get("raw_content", ""))
            }

        except Exception as e:
            logger.error(f"Error reading URL: {e}")
            return {"success": False, "message": f"Failed to read URL: {str(e)}"}

    async def research(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Conduct deep research on a topic by searching and reading multiple sources"""
        try:
            topic = args.get("topic")
            if not topic:
                return {"success": False, "message": "Research topic is required"}

            max_sources = min(args.get("max_sources", 3), 5)  # Cap at 5
            focus = args.get("focus", "general")

            # Check if Tavily API key is configured
            if not self.tavily_api_key:
                return {
                    "success": False,
                    "message": "Research is not configured. Please add TAVILY_API_KEY to your environment."
                }

            tavily = TavilyClient(api_key=self.tavily_api_key)

            # Enhance query based on focus
            enhanced_topic = topic
            focus_domains = None

            if focus == "scientific":
                enhanced_topic = f"{topic} research study evidence science"
                focus_domains = ["pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "examine.com",
                                "strongerbyscience.com", "renaissanceperiodization.com"]
            elif focus == "practical":
                enhanced_topic = f"{topic} practical guide tips how to"
                focus_domains = ["t-nation.com", "bodybuilding.com", "strongerbyscience.com",
                                "strengthlog.com", "fitnessvolt.com"]
            elif focus == "programs":
                enhanced_topic = f"{topic} program routine template workout plan"
                focus_domains = ["liftvault.com", "strengthlog.com", "t-nation.com",
                                "muscleandstrength.com", "bodybuilding.com"]

            logger.info(f"Research for user {user_id}: {enhanced_topic} (focus: {focus})")

            # Step 1: Search for relevant sources
            search_response = tavily.search(
                query=enhanced_topic,
                max_results=max_sources + 2,  # Get extra in case some fail
                search_depth="advanced",  # Use advanced for research
                include_answer=True,
                include_domains=focus_domains
            )

            search_results = search_response.get("results", [])
            ai_summary = search_response.get("answer", "")

            if not search_results:
                return {
                    "success": False,
                    "message": f"No sources found for topic: {topic}"
                }

            # Step 2: Filter out YouTube URLs and collect article URLs
            article_urls = []
            video_results = []

            for result in search_results:
                url = result.get("url", "")
                if "youtube.com" in url or "youtu.be" in url:
                    # Save video info but don't try to read it
                    video_id = None
                    patterns = [r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)']
                    for pattern in patterns:
                        match = re.search(pattern, url)
                        if match:
                            video_id = match.group(1)
                            break
                    video_results.append({
                        "title": result.get("title", ""),
                        "url": url,
                        "video_id": video_id
                    })
                else:
                    article_urls.append({
                        "url": url,
                        "title": result.get("title", ""),
                        "snippet": result.get("content", "")[:200]
                    })

            # Step 3: Read full content from article URLs (up to max_sources)
            sources = []
            urls_to_extract = [a["url"] for a in article_urls[:max_sources]]

            if urls_to_extract:
                try:
                    extract_response = tavily.extract(urls=urls_to_extract)
                    extracted = extract_response.get("results", [])

                    for i, ext in enumerate(extracted):
                        raw_content = ext.get("raw_content", "")
                        # Limit content per source to avoid token explosion
                        content_preview = raw_content[:3000] if raw_content else ""

                        sources.append({
                            "url": ext.get("url", urls_to_extract[i] if i < len(urls_to_extract) else ""),
                            "title": article_urls[i]["title"] if i < len(article_urls) else "",
                            "content": content_preview,
                            "full_length": len(raw_content)
                        })
                except Exception as extract_error:
                    logger.warning(f"Extract failed, using snippets: {extract_error}")
                    # Fall back to using snippets from search
                    for article in article_urls[:max_sources]:
                        sources.append({
                            "url": article["url"],
                            "title": article["title"],
                            "content": article["snippet"],
                            "full_length": len(article["snippet"])
                        })

            # Build the research response
            research_content = f"## Research: {topic}\n\n"

            if ai_summary:
                research_content += f"### Quick Summary\n{ai_summary}\n\n"

            research_content += f"### Detailed Findings ({len(sources)} sources analyzed)\n\n"

            for i, source in enumerate(sources, 1):
                research_content += f"**Source {i}: [{source['title']}]({source['url']})**\n"
                research_content += f"{source['content']}\n\n"
                research_content += "---\n\n"

            # Add video references if any
            if video_results:
                research_content += "### Related Videos\n"
                for video in video_results[:2]:  # Max 2 videos
                    if video["video_id"]:
                        research_content += f"<video-embed videoid=\"{video['video_id']}\" title=\"{video['title']}\" />\n\n"

            return {
                "success": True,
                "message": research_content,
                "topic": topic,
                "focus": focus,
                "sources_count": len(sources),
                "sources": sources,
                "videos": video_results,
                "ai_summary": ai_summary
            }

        except Exception as e:
            logger.error(f"Error in research: {e}")
            return {"success": False, "message": f"Research failed: {str(e)}"}
