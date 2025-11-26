#!/usr/bin/env python3
"""
Feedback Analysis Script for AI Coach

Reads user feedback from conversations, analyzes patterns in negative feedback,
and generates actionable improvement suggestions for prompts and tools.

Features:
- Tracks processed feedback to avoid re-analyzing
- Stores improvement history
- Generates actionable reports

Usage:
    python scripts/analyze_feedback.py [--days 7] [--output report.md]
    python scripts/analyze_feedback.py --mark-processed  # Mark current feedback as processed
    python scripts/analyze_feedback.py --show-history    # Show improvement history
    python scripts/analyze_feedback.py --include-processed  # Re-analyze all feedback
"""

import asyncio
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any
from collections import defaultdict
import hashlib
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# Configuration - match the .env variable names
MONGODB_URI = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "ripped-potato")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def generate_feedback_id(conversation_id: str, message_index: int, timestamp: str) -> str:
    """Generate a unique ID for a feedback item"""
    raw = f"{conversation_id}:{message_index}:{timestamp}"
    return hashlib.md5(raw.encode()).hexdigest()


async def get_processed_feedback_ids(db) -> set:
    """Get set of already processed feedback IDs"""
    tracking = await db.feedback_analysis_tracking.find_one({"type": "processed_ids"})
    if tracking:
        return set(tracking.get("ids", []))
    return set()


async def mark_feedback_as_processed(db, feedback_ids: List[str], analysis_summary: str = ""):
    """Mark feedback items as processed and store analysis record"""

    # Update processed IDs
    await db.feedback_analysis_tracking.update_one(
        {"type": "processed_ids"},
        {
            "$addToSet": {"ids": {"$each": feedback_ids}},
            "$set": {"updated_at": datetime.utcnow()}
        },
        upsert=True
    )

    # Store analysis record
    if analysis_summary:
        await db.feedback_analysis_tracking.insert_one({
            "type": "analysis_record",
            "timestamp": datetime.utcnow(),
            "feedback_count": len(feedback_ids),
            "feedback_ids": feedback_ids,
            "summary": analysis_summary[:2000]  # Truncate for storage
        })

    print(f"Marked {len(feedback_ids)} feedback items as processed.")


async def get_analysis_history(db, limit: int = 10) -> List[Dict[str, Any]]:
    """Get history of past analyses"""
    records = await db.feedback_analysis_tracking.find(
        {"type": "analysis_record"}
    ).sort("timestamp", -1).limit(limit).to_list(None)
    return records


async def get_feedback_data(db, days: int = 7, include_processed: bool = False) -> tuple[List[Dict[str, Any]], List[str]]:
    """Fetch conversations with negative feedback from the last N days"""

    cutoff_date = datetime.utcnow() - timedelta(days=days)

    # Get already processed IDs
    processed_ids = set() if include_processed else await get_processed_feedback_ids(db)

    # Find conversations with thumbs_down feedback
    pipeline = [
        {
            "$match": {
                "feedback": {
                    "$elemMatch": {
                        "rating": "thumbs_down"
                    }
                }
            }
        },
        {
            "$project": {
                "conversation_id": 1,
                "title": 1,
                "messages": 1,
                "feedback": {
                    "$filter": {
                        "input": "$feedback",
                        "as": "fb",
                        "cond": {"$eq": ["$$fb.rating", "thumbs_down"]}
                    }
                }
            }
        },
        {"$limit": 100}
    ]

    conversations = await db.chatConversations.aggregate(pipeline).to_list(None)

    # Filter out processed feedback and collect new feedback IDs
    new_feedback_ids = []
    filtered_conversations = []

    for conv in conversations:
        new_feedback = []
        for fb in conv.get("feedback", []):
            fb_id = generate_feedback_id(
                conv.get("conversation_id", ""),
                fb.get("message_index", 0),
                fb.get("timestamp", "")
            )
            if fb_id not in processed_ids:
                new_feedback.append(fb)
                new_feedback_ids.append(fb_id)

        if new_feedback:
            conv["feedback"] = new_feedback
            filtered_conversations.append(conv)

    return filtered_conversations, new_feedback_ids


def extract_feedback_context(conversation: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract the question/answer context for each piece of negative feedback"""

    contexts = []
    messages = conversation.get("messages", [])

    for feedback in conversation.get("feedback", []):
        msg_index = feedback.get("message_index", 0)

        # Get the AI response that received negative feedback
        ai_response = messages[msg_index] if msg_index < len(messages) else None

        # Get the user question that preceded it
        user_question = messages[msg_index - 1] if msg_index > 0 and msg_index - 1 < len(messages) else None

        contexts.append({
            "conversation_id": conversation.get("conversation_id"),
            "user_question": user_question.get("content") if user_question else "N/A",
            "ai_response": ai_response.get("content") if ai_response else "N/A",
            "feedback_text": feedback.get("feedback_text", ""),
            "timestamp": feedback.get("timestamp", "")
        })

    return contexts


async def analyze_with_llm(feedback_contexts: List[Dict[str, Any]]) -> str:
    """Use an LLM to analyze feedback patterns and generate improvement suggestions"""

    if not OPENAI_API_KEY:
        return "Error: OPENAI_API_KEY not set. Cannot perform LLM analysis."

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    # Format feedback for analysis
    feedback_summary = "\n\n".join([
        f"---\n**User Question:** {ctx['user_question']}\n\n**AI Response (excerpt):** {ctx['ai_response'][:500]}...\n\n**User Feedback:** {ctx['feedback_text']}"
        for ctx in feedback_contexts[:20]  # Limit to 20 for context window
    ])

    analysis_prompt = f"""You are an AI system analyst reviewing negative user feedback for a fitness coaching AI.

Below are examples of user questions, AI responses that received negative feedback, and the user's complaint.

FEEDBACK DATA:
{feedback_summary}

Analyze this feedback and provide:

## 1. Pattern Analysis
Identify common patterns in what the AI is doing wrong. Group similar issues together.

## 2. Root Causes
For each pattern, explain the likely root cause (e.g., wrong tool selection, hallucination, misunderstanding user intent).

## 3. Specific Improvements

### Prompt Improvements
Suggest specific additions or changes to the system prompt that would prevent these errors. Include exact text to add.

### Tool Usage Improvements
Suggest improvements to tool descriptions or new tool parameters that would help.

### New Tool Suggestions
If needed, suggest new tools that should be added.

## 4. Priority Ranking
Rank the improvements by impact (how many issues they would fix) and effort (how hard to implement).

## 5. Quick Wins
List any simple fixes that can be done immediately (single line prompt additions, etc.).

Be specific and actionable. Include exact prompt text that should be added where relevant."""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert AI systems analyst specializing in improving AI assistants based on user feedback."},
            {"role": "user", "content": analysis_prompt}
        ],
        temperature=0.3,
        max_tokens=2500
    )

    return response.choices[0].message.content


def generate_stats_report(feedback_contexts: List[Dict[str, Any]]) -> str:
    """Generate basic statistics about the feedback"""

    total = len(feedback_contexts)
    if total == 0:
        return "## Feedback Statistics\n\nNo new feedback to analyze.\n"

    # Count feedback with text vs without
    with_text = sum(1 for ctx in feedback_contexts if ctx.get("feedback_text"))

    # Simple keyword analysis
    keywords = defaultdict(int)
    keyword_list = ["hallucin", "wrong", "incorrect", "not in", "doesn't exist", "made up",
                    "muscle", "exercise", "workout", "tool", "search", "find", "can't",
                    "doesn't work", "error", "missing", "database", "db"]

    for ctx in feedback_contexts:
        text = (ctx.get("feedback_text", "") + " " + ctx.get("user_question", "")).lower()
        for kw in keyword_list:
            if kw in text:
                keywords[kw] += 1

    report = f"""## Feedback Statistics

- **Total new feedback items:** {total}
- **Feedback with user comments:** {with_text} ({with_text/total*100:.1f}%)

### Keyword Frequency in Feedback
"""

    for kw, count in sorted(keywords.items(), key=lambda x: -x[1]):
        if count > 0:
            report += f"- `{kw}`: {count} occurrences\n"

    return report


async def show_history(db):
    """Display analysis history"""
    records = await get_analysis_history(db)

    if not records:
        print("No analysis history found.")
        return

    print("\n" + "="*80)
    print("FEEDBACK ANALYSIS HISTORY")
    print("="*80 + "\n")

    for record in records:
        print(f"**Date:** {record['timestamp'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"**Feedback Items Processed:** {record['feedback_count']}")
        print(f"**Summary:**\n{record.get('summary', 'N/A')[:500]}...")
        print("-"*40 + "\n")


async def main():
    parser = argparse.ArgumentParser(description="Analyze AI Coach feedback and generate improvement suggestions")
    parser.add_argument("--days", type=int, default=30, help="Number of days to look back (default: 30)")
    parser.add_argument("--output", type=str, default=None, help="Output file path (default: print to stdout)")
    parser.add_argument("--no-llm", action="store_true", help="Skip LLM analysis (just show stats)")
    parser.add_argument("--mark-processed", action="store_true", help="Mark analyzed feedback as processed")
    parser.add_argument("--include-processed", action="store_true", help="Include already processed feedback")
    parser.add_argument("--show-history", action="store_true", help="Show past analysis history")
    args = parser.parse_args()

    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]

    # Show history and exit
    if args.show_history:
        await show_history(db)
        client.close()
        return

    print(f"Fetching feedback from the last {args.days} days...")
    if not args.include_processed:
        print("(Excluding already processed feedback. Use --include-processed to include all)")

    # Fetch feedback data
    conversations, feedback_ids = await get_feedback_data(db, args.days, args.include_processed)

    if not conversations:
        print("\nNo new negative feedback found in the specified time period.")
        print("All feedback may have been processed already. Use --include-processed to re-analyze.")
        client.close()
        return

    # Extract contexts
    all_contexts = []
    for conv in conversations:
        all_contexts.extend(extract_feedback_context(conv))

    print(f"Found {len(all_contexts)} new feedback items from {len(conversations)} conversations.")

    # Generate report
    report = f"""# AI Coach Feedback Analysis Report

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Period:** Last {args.days} days
**Total Conversations with New Feedback:** {len(conversations)}
**Total New Feedback Items:** {len(all_contexts)}

"""

    # Add stats
    report += generate_stats_report(all_contexts)

    # Add LLM analysis
    llm_analysis = ""
    if not args.no_llm and OPENAI_API_KEY:
        print("Running LLM analysis...")
        llm_analysis = await analyze_with_llm(all_contexts)
        report += f"\n\n## LLM Analysis\n\n{llm_analysis}"
    elif args.no_llm:
        report += "\n\n*LLM analysis skipped (--no-llm flag)*"
    else:
        report += "\n\n*LLM analysis skipped (OPENAI_API_KEY not set)*"

    # Add raw feedback examples
    report += "\n\n## Raw Feedback Examples\n\n"
    for i, ctx in enumerate(all_contexts[:10], 1):
        report += f"""### Example {i}
**Question:** {ctx['user_question'][:200]}{'...' if len(ctx['user_question']) > 200 else ''}
**AI Response:** {ctx['ai_response'][:300]}{'...' if len(ctx['ai_response']) > 300 else ''}
**User Feedback:** {ctx['feedback_text'] or '(no comment)'}

"""

    # Output
    if args.output:
        with open(args.output, "w") as f:
            f.write(report)
        print(f"\nReport saved to {args.output}")
    else:
        print("\n" + "="*80 + "\n")
        print(report)

    # Mark as processed if requested
    if args.mark_processed and feedback_ids:
        summary = llm_analysis[:500] if llm_analysis else "Stats only analysis"
        await mark_feedback_as_processed(db, feedback_ids, summary)
    elif feedback_ids and not args.mark_processed:
        print(f"\nNote: {len(feedback_ids)} feedback items were analyzed but NOT marked as processed.")
        print("Run with --mark-processed to mark them as handled.")

    # Close connection
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
