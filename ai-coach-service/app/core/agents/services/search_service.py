"""
Search service - handles web search operations
"""

import html
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog
from bson import ObjectId
from tavily import TavilyClient

from app.core.agents.services.youtube_search import enrich_youtube_ids, youtube_search_videos

logger = structlog.get_logger()

# Mongo collection used to cache YouTube query -> ranked results (conserves the
# 100-search/day quota). A TTL index expires entries after 30 days.
VIDEO_CACHE_COLLECTION = "videocache"
VIDEO_CACHE_TTL_DAYS = 30

# Per-user record of the videos we most recently SHOWED for a given exercise/query.
# The LLM can't reliably recall exact 11-char ids across turns, so save/exclude
# resolve against this instead of trusting model-supplied ids.
USER_VIDEO_CTX_COLLECTION = "uservideocontext"

_YT_ID_RE = re.compile(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)')


def norm_query(q: str) -> str:
    """Normalize an exercise/query string to a stable key (alphanumerics only)."""
    return re.sub(r"[^a-z0-9]", "", (q or "").lower())


def _embed(video_id: str, title: str) -> str:
    """Build a <video-embed> tag with a safe title: decode HTML entities (YouTube
    returns '&amp;' etc.) and neutralize double-quotes that would break the tag."""
    safe = html.unescape(title or "").replace('"', "'").strip()
    return f'<video-embed videoid="{video_id}" title="{safe}" />'


def _extract_video_id(url: str) -> Optional[str]:
    """Pull the 11-char video id out of a YouTube URL (or return a bare id)."""
    if not url:
        return None
    match = _YT_ID_RE.search(url)
    if match:
        return match.group(1)
    # Allow a bare id to be stored directly in mediaUrls.video
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url
    return None


class SearchService:
    """Service for web search operations.

    Video demonstrations come from the YouTube Data API (quality-ranked, curated),
    with Tavily as the fallback and as the engine for article/general/research text.
    """

    def __init__(self, tavily_api_key: str = None, youtube_api_key: str = None, db=None):
        self.tavily_api_key = tavily_api_key
        self.youtube_api_key = youtube_api_key
        self.db = db
        self._video_cache_ready = False

    # ------------------------------------------------------------------ #
    # Video search: curated -> YouTube (ranked, cached) -> Tavily fallback
    # ------------------------------------------------------------------ #

    async def _ensure_video_cache_index(self) -> None:
        if self.db is None or self._video_cache_ready:
            return
        try:
            await self.db[VIDEO_CACHE_COLLECTION].create_index(
                "createdAt", expireAfterSeconds=VIDEO_CACHE_TTL_DAYS * 86400
            )
            await self.db[VIDEO_CACHE_COLLECTION].create_index("query", unique=True)
            self._video_cache_ready = True
        except Exception as e:
            logger.warning(f"Could not ensure video cache index: {e}")

    async def _get_curated_video(self, query: str) -> Optional[Dict[str, Any]]:
        """Tier 0: if the query names an exercise that already has a curated
        video in the library, return it — no external call."""
        if self.db is None:
            return None
        try:
            q = query.lower()
            # Pull common + user exercises that have a curated video, match by name.
            cursor = self.db.exercises.find(
                {"mediaUrls.video": {"$exists": True, "$nin": [None, ""]}},
                {"name": 1, "mediaUrls": 1},
            )
            async for ex in cursor:
                name = (ex.get("name") or "").lower()
                if name and name in q:
                    video = ex["mediaUrls"].get("video")
                    vid = _extract_video_id(video)
                    if vid:
                        return {"video_id": vid, "title": ex.get("name"), "url": video, "curated": True}
            return None
        except Exception as e:
            logger.warning(f"Curated video lookup failed: {e}")
            return None

    async def _youtube_search_cached(self, query: str, exclude_ids: List[str]) -> List[Dict[str, Any]]:
        """Tier 1: YouTube search with a Mongo cache (skipped when excluding ids,
        i.e. when the user rejected a video and wants a fresh result)."""
        await self._ensure_video_cache_index()
        cache_key = query.strip().lower()
        if self.db is not None and not exclude_ids:
            try:
                cached = await self.db[VIDEO_CACHE_COLLECTION].find_one({"query": cache_key})
                if cached and cached.get("results"):
                    logger.info(f"YouTube cache hit for '{cache_key}'")
                    return cached["results"]
            except Exception as e:
                logger.warning(f"Video cache read failed: {e}")

        videos = await youtube_search_videos(
            self.youtube_api_key, f"{query} tutorial how to", exclude_ids=exclude_ids
        )

        if self.db is not None and videos and not exclude_ids:
            try:
                await self.db[VIDEO_CACHE_COLLECTION].update_one(
                    {"query": cache_key},
                    {"$set": {"query": cache_key, "results": videos, "createdAt": datetime.utcnow()}},
                    upsert=True,
                )
            except Exception as e:
                logger.warning(f"Video cache write failed: {e}")
        return videos

    async def _record_shown(self, user_id: str, query: str, shown_ids: List[str], top: Dict[str, Any]) -> None:
        """Remember which videos we showed this user for this exercise/query, so
        'save it' / 'show another' can resolve the real id (the LLM forgets it)."""
        if self.db is None or not shown_ids:
            return
        try:
            key = norm_query(query)
            existing = await self.db[USER_VIDEO_CTX_COLLECTION].find_one({"user_id": user_id, "query": key})
            prior = existing.get("shown_ids", []) if existing else []
            merged = list(dict.fromkeys(prior + shown_ids))[-12:]  # accumulated, for exclusion
            await self.db[USER_VIDEO_CTX_COLLECTION].update_one(
                {"user_id": user_id, "query": key},
                {"$set": {
                    "user_id": user_id, "query": key,
                    "shown_ids": merged,          # everything shown (for "show another")
                    "last_shown": shown_ids,      # THIS search's ids, in rank order (for "which")
                    "top_id": top.get("video_id"), "top_title": top.get("title"),
                    "updatedAt": datetime.utcnow(),
                }},
                upsert=True,
            )
        except Exception as e:
            logger.warning(f"Could not record shown videos: {e}")

    async def _prior_shown_ids(self, user_id: str, query: str) -> List[str]:
        if self.db is None:
            return []
        try:
            doc = await self.db[USER_VIDEO_CTX_COLLECTION].find_one({"user_id": user_id, "query": norm_query(query)})
            return doc.get("shown_ids", []) if doc else []
        except Exception:
            return []

    async def _video_search(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        query = args["query"]

        # The coach only tells us SEMANTICS: "show a different one" -> exclude_previous.
        # We deterministically fill in which ids to skip (everything already shown for
        # this exercise) — the LLM never handles raw video ids.
        exclude_ids: List[str] = []
        if args.get("exclude_previous"):
            exclude_ids = await self._prior_shown_ids(user_id, query)

        # Tier 0: curated library video
        curated = await self._get_curated_video(query)
        if curated and curated["video_id"] not in exclude_ids:
            message = (
                f"Here's the demo we've saved for **{curated['title']}**:\n\n"
                + _embed(curated['video_id'], curated['title'])
            )
            await self._record_shown(user_id, query, [curated["video_id"]], curated)
            return {"success": True, "message": message, "results": [curated], "source": "curated"}

        # Tier 1: YouTube Data API (quality-ranked)
        if self.youtube_api_key:
            videos = await self._youtube_search_cached(query, exclude_ids)
            top = [v for v in videos if v["video_id"] not in exclude_ids][:2]
            if top:
                best = top[0]
                message = f"Best demo I found for **{query}** — from **{best['channelTitle']}**:\n\n"
                message += _embed(best['video_id'], best['title'])
                if len(top) > 1:
                    message += "\n\nAlternative: " + _embed(top[1]["video_id"], top[1]["title"])
                await self._record_shown(user_id, query, [v["video_id"] for v in top], best)
                return {"success": True, "message": message, "results": top, "source": "youtube"}
            logger.info("YouTube returned no usable videos, falling back to Tavily")

        # Tier 2: Tavily fallback (no key / quota exhausted / no results)
        result = await self._tavily_video_fallback(user_id, query, exclude_ids)
        if result.get("results"):
            ids = [r["video_id"] for r in result["results"] if r.get("video_id")]
            if ids:
                await self._record_shown(user_id, query, ids, result["results"][0])
        return result

    async def _tavily_video_fallback(self, user_id: str, query: str, exclude_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        exclude = set(exclude_ids or [])
        if not self.tavily_api_key:
            return {"success": False, "message": "Video search isn't configured (no YouTube or Tavily key)."}
        try:
            tavily = TavilyClient(api_key=self.tavily_api_key)
            response = tavily.search(
                query=f"{query} tutorial", max_results=5, search_depth="basic",
                include_domains=["youtube.com"],
            )
            tavily_ids = []
            for result in response.get("results", []):
                vid = _extract_video_id(result.get("url", ""))
                if vid and vid not in exclude:
                    tavily_ids.append(vid)

            # If we have a YouTube key, enrich Tavily's ids through the Data API
            # (real stats/channel/duration) and rank them — Tavily's #1 may not be
            # the best. Returns a properly scored pick, not just "first youtube link".
            if self.youtube_api_key and tavily_ids:
                enriched = await enrich_youtube_ids(self.youtube_api_key, tavily_ids)
                enriched = [v for v in enriched if v["video_id"] not in exclude]
                if enriched:
                    best = enriched[0]
                    msg = f"Best demo I found for **{query}** — from **{best['channelTitle']}**:\n\n"
                    msg += _embed(best['video_id'], best['title'])
                    if len(enriched) > 1:
                        msg += "\n\nAlternative: " + _embed(enriched[1]["video_id"], enriched[1]["title"])
                    return {"success": True, "message": msg, "results": enriched[:2], "source": "tavily+youtube"}

            # No YouTube key — return Tavily's first youtube video raw.
            if tavily_ids:
                title = next((r.get("title", "") for r in response.get("results", []) if _extract_video_id(r.get("url", "")) == tavily_ids[0]), "")
                return {
                    "success": True,
                    "message": f"Here's a tutorial for **{query}**:\n\n" + _embed(tavily_ids[0], title),
                    "results": [{"video_id": tavily_ids[0], "title": title}],
                    "source": "tavily",
                }
            return {"success": True, "message": f"I couldn't find a solid video for \"{query}\". Want a written form guide instead?", "results": []}
        except Exception as e:
            logger.error(f"Tavily video fallback failed: {e}")
            return {"success": False, "message": f"Video search failed: {str(e)}"}

    async def web_search(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Search for fitness content. Video demos → YouTube (ranked); text → Tavily."""
        try:
            query = args.get("query")
            if not query:
                return {"success": False, "message": "Search query is required"}

            search_type = args.get("search_type", "general")

            # Video demonstrations use the dedicated curated/YouTube path.
            if search_type == "video":
                logger.info(f"Video search for user {user_id}: {query}")
                return await self._video_search(user_id, args)

            # Text (article / general) stays on Tavily.
            max_results = min(args.get("max_results", 3), 5)
            if not self.tavily_api_key:
                return {"success": False, "message": "Web search is not configured. Please add TAVILY_API_KEY to your environment."}

            tavily = TavilyClient(api_key=self.tavily_api_key)
            enhanced_query = f"{query} guide article" if search_type == "article" else query
            logger.info(f"Web search for user {user_id}: {enhanced_query}")
            response = tavily.search(
                query=enhanced_query,
                max_results=max_results,
                search_depth="basic",
                include_answer=True,
                include_domains=["bodybuilding.com", "menshealth.com", "womenshealthmag.com",
                                 "t-nation.com", "strengthlog.com", "exrx.net", "verywellfit.com"]
                if search_type == "article" else None,
            )

            results = []
            for result in response.get("results", []):
                url = result.get("url", "")
                content = result.get("content", "")
                results.append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": content[:300] + "..." if len(content) > 300 else content,
                    "is_video": False,
                    "video_id": None,
                })

            if results:
                message = f"Found **{len(results)} results** for \"{query}\":"
                for i, r in enumerate(results, 1):
                    message += f"\n\n**{i}. [{r['title']}]({r['url']})**\n{r['snippet']}"
                ai_answer = response.get("answer")
                if ai_answer:
                    message = f"**Quick Answer:** {ai_answer}\n\n---\n\n{message}"
            else:
                message = f"No results found for \"{query}\". Try a different search term."

            return {"success": True, "message": message, "results": results, "answer": response.get("answer")}

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
                        research_content += _embed(video["video_id"], video["title"]) + "\n\n"

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
