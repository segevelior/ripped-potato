"""Data Reader Prompts

This module contains prompts for the data reading agent.
"""

DATA_READER_PROMPTS = {
    "analyze_message": """Analyze this message to determine what user data needs to be loaded:
Message: {message}

Determine which data types are relevant:
- exercises: If discussing specific exercises, alternatives, or form
- workouts: If discussing workout history, patterns, or planning
- goals: If discussing fitness goals, progress, or achievements
- user_profile: If discussing fitness level, preferences, or capabilities

Return a JSON object with boolean flags for each data type needed.""",

    "format_context": """Format the loaded user data into a concise context summary.
Focus on relevant information that helps understand the user's:
- Current fitness level
- Recent activity patterns
- Goals and preferences
- Available equipment
Keep the summary brief and relevant to the conversation."""
}