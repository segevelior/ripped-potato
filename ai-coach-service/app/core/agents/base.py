from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
from app.config import get_settings
import structlog

logger = structlog.get_logger()


class BaseAgent(ABC):
    """Base class for all AI agents"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        
    @abstractmethod
    async def process(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process a message with context and return structured response"""
        pass
    
    async def _call_llm(
        self, 
        messages: List[Dict[str, str]], 
        temperature: float = 0.7,
        max_tokens: int = 500,
        response_format: Optional[Dict] = None
    ) -> str:
        """Helper method to call OpenAI API"""
        try:
            kwargs = {
                "model": self.settings.openai_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            
            if response_format:
                kwargs["response_format"] = response_format
            
            response = await self.client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"LLM call failed in {self.name}: {e}")
            raise
    
    def _format_context(self, context: Dict[str, Any]) -> str:
        """Format context into a readable string for the LLM"""
        formatted = []
        
        if context.get("fitness_level"):
            formatted.append(f"Fitness Level: {context['fitness_level']}")
        
        if context.get("goals"):
            goals_str = ", ".join([g.get("name", str(g)) for g in context["goals"][:3]] if isinstance(context["goals"][0], dict) else context["goals"][:3])
            formatted.append(f"Goals: {goals_str}")
        
        if context.get("equipment"):
            equipment_str = ", ".join(context["equipment"][:5])  # Limit to 5 items
            formatted.append(f"Available Equipment: {equipment_str}")
        
        if context.get("recent_workouts"):
            recent_count = len(context["recent_workouts"])
            formatted.append(f"Recent Workouts: {recent_count} in the last week")
        
        # Add exercises to context
        if context.get("exercises"):
            exercises = context["exercises"]
            formatted.append(f"\nAvailable Exercises ({len(exercises)} total):")
            for ex in exercises[:10]:  # Show first 10 exercises
                name = ex.get("name", "Unknown")
                muscles = ", ".join(ex.get("target_muscles", []))
                equipment = ex.get("equipment", "N/A")
                formatted.append(f"- {name} (targets: {muscles}, equipment: {equipment})")
        
        # Add data summary if present
        if context.get("data_summary"):
            formatted.append(f"\nAdditional Context:\n{context['data_summary']}")
        
        return "\n".join(formatted) if formatted else "No user context available"