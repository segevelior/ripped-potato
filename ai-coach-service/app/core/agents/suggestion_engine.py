from typing import Dict, Any
from app.core.agents.base import BaseAgent
from app.prompts import FITNESS_COACH_PROMPTS
import structlog

logger = structlog.get_logger()


class SuggestionEngineAgent(BaseAgent):
    """Agent responsible for generating fitness suggestions and responses"""
    
    def __init__(self):
        super().__init__(
            name="SuggestionEngineAgent",
            description="Generates personalized fitness responses and suggestions"
        )
    
    async def process(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate response based on user message and context
        Let the LLM decide what type of response is appropriate
        """
        
        # Use prompts from centralized module
        system_prompt = FITNESS_COACH_PROMPTS["main_system"]
        
        # Build context string
        context_str = self._format_context(context)
        
        # Format user prompt using template
        user_prompt = FITNESS_COACH_PROMPTS["user_message_template"].format(
            message=message,
            context=context_str
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            response = await self._call_llm(
                messages, 
                temperature=0.7,
                max_tokens=800
            )
            
            # Determine action type based on what was actually generated
            action = None
            if "workout plan" in response.lower() and "created" in response.lower():
                action = {"type": "workout_created"}
            elif "alternative" in response.lower() and any(x in response.lower() for x in ["exercise", "pushup", "squat"]):
                action = {"type": "alternatives_provided"}
            
            return {
                "type": "response",
                "message": response,
                "action": action,
                "confidence": 0.9
            }
            
        except Exception as e:
            logger.error(f"Error in suggestion engine: {e}")
            return {
                "type": "error",
                "message": "I'm having trouble processing your request. Could you please try rephrasing it?",
                "confidence": 0.3
            }