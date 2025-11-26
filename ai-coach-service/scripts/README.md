# AI Coach Scripts

Scripts for maintaining and improving the AI Coach service.

## Feedback Analysis Script

`analyze_feedback.py` - Analyzes negative user feedback to identify patterns and generate improvement suggestions.

### Purpose

This script helps you:
1. **Identify AI mistakes** - Find common patterns in what the AI is doing wrong
2. **Generate improvements** - Get actionable suggestions for prompts and tools
3. **Track progress** - Mark feedback as processed to avoid re-analyzing
4. **Build history** - Keep records of past analyses and improvements

### Usage

```bash
# Navigate to the ai-coach-service directory
cd ai-coach-service

# Basic usage - analyze new feedback from last 30 days
poetry run python scripts/analyze_feedback.py

# Specify time period
poetry run python scripts/analyze_feedback.py --days 7

# Save report to file
poetry run python scripts/analyze_feedback.py --output feedback_report.md

# Mark feedback as processed after reviewing
poetry run python scripts/analyze_feedback.py --mark-processed

# Re-analyze all feedback (including already processed)
poetry run python scripts/analyze_feedback.py --include-processed

# Quick stats only (skip LLM analysis)
poetry run python scripts/analyze_feedback.py --no-llm

# View history of past analyses
poetry run python scripts/analyze_feedback.py --show-history
```

### Workflow

**Recommended workflow for improving the AI:**

1. **Run analysis** to see new feedback:
   ```bash
   poetry run python scripts/analyze_feedback.py --output report.md
   ```

2. **Review the report** - Look at:
   - Pattern analysis (what's going wrong)
   - Root causes (why it's happening)
   - Suggested improvements (how to fix)

3. **Implement fixes** - Update:
   - System prompt in `app/core/agents/orchestrator.py`
   - Tool definitions if needed
   - Add new tools if suggested

4. **Mark as processed** after implementing fixes:
   ```bash
   poetry run python scripts/analyze_feedback.py --mark-processed
   ```

5. **Test the changes** - Try the scenarios that were failing

6. **Repeat** - Run again later to catch new feedback

### What Gets Analyzed

The script looks at:
- **User question** - What the user asked
- **AI response** - What the AI said (that was wrong)
- **User feedback** - The complaint/correction from the user

### Output

The report includes:
1. **Statistics** - Count of feedback, keyword frequency
2. **LLM Analysis** - AI-generated analysis with:
   - Pattern identification
   - Root cause analysis
   - Specific prompt improvements (with exact text)
   - Tool improvements
   - Priority ranking
   - Quick wins
3. **Raw examples** - Actual feedback for manual review

### Database Collections

The script uses:
- `conversations` - Reads feedback from conversation records
- `feedback_analysis_tracking` - Stores:
  - `type: "processed_ids"` - IDs of processed feedback
  - `type: "analysis_record"` - History of past analyses

### Environment Variables

Uses variables from `.env`:
- `MONGODB_URL` - MongoDB connection string
- `MONGODB_DATABASE` - Database name
- `OPENAI_API_KEY` - For LLM analysis (optional)

### Examples of Improvements Made

Based on feedback analysis, we've made improvements like:

1. **Muscle group vs exercise name confusion**
   - Problem: AI used `grep_exercises` with "core" instead of `list_exercises` with muscle filter
   - Fix: Added explicit guidance in system prompt about when to use each tool

2. **Hallucinated exercises**
   - Problem: AI reported exercises that didn't exist in the database
   - Fix: Added rule "ONLY report exercises that actually exist - NEVER hallucinate"

### Tips

- Run weekly to catch issues early
- Always review before marking as processed
- Keep the `--output` reports for historical reference
- Use `--no-llm` for quick checks when OpenAI API is slow/unavailable
