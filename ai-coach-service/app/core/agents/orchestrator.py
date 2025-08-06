from typing import Dict, Any, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.suggestion_engine import SuggestionEngineAgent
import structlog

logger = structlog.get_logger()


class AgentOrchestrator:
    """Orchestrates multiple agents to handle complex requests"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.data_reader = DataReaderAgent(db)
        self.suggestion_engine = SuggestionEngineAgent()
    
    async def process_request(
        self,
        message: str,
        user_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a user request by coordinating appropriate agents
        """
        
        # Step 1: Read relevant data
        logger.info(f"Reading data for user {user_context.get('user_id')}")
        data_context = await self.data_reader.process(message, user_context)
        
        # Combine user context with loaded data
        enriched_context = {
            **user_context,
            **data_context.get("user_profile", {}),
            "exercises": data_context.get("exercises", []),
            "workouts": data_context.get("workouts", []),
            "goals": data_context.get("goals", []),
            "data_summary": data_context.get("formatted_context", "")
        }
        
        # Step 2: Generate suggestions based on enriched context
        logger.info("Generating suggestions")
        suggestion_result = await self.suggestion_engine.process(message, enriched_context)
        
        # Step 3: Format final response
        response = {
            "message": suggestion_result.get("message", ""),
            "type": suggestion_result.get("type", "general"),
            "data": {
                "suggestion": suggestion_result.get("plan") or 
                             suggestion_result.get("alternatives") or 
                             suggestion_result.get("tips") or 
                             suggestion_result.get("suggestions", []),
                "context_used": {
                    "exercises_loaded": len(data_context.get("exercises", [])),
                    "workouts_analyzed": len(data_context.get("workouts", [])),
                    "goals_considered": len(data_context.get("goals", [])),
                    "user_level": enriched_context.get("fitness_level", "unknown")
                }
            },
            "action": suggestion_result.get("action"),
            "confidence": self._calculate_confidence(data_context, suggestion_result)
        }
        
        return response
    
    def _calculate_confidence(
        self,
        data_context: Dict[str, Any],
        suggestion_result: Dict[str, Any]
    ) -> float:
        """Calculate confidence score based on available context"""
        confidence = 0.5  # Base confidence
        
        # Increase confidence based on available data
        if data_context.get("user_profile"):
            confidence += 0.1
        
        if data_context.get("exercises"):
            confidence += 0.1
        
        if data_context.get("workouts"):
            confidence += 0.1
        
        if data_context.get("goals"):
            confidence += 0.1
        
        # Increase confidence for structured responses
        if suggestion_result.get("type") in ["workout_plan", "form_tips", "progression_plan"]:
            confidence += 0.1
        
        return min(confidence, 0.95)  # Cap at 0.95