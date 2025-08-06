# 🤖 AI Coach Service Architecture Plan
## Next-Generation Fitness AI Assistant using MCP, RAG, and Modern AI Stack

---

## 📋 Executive Summary

Transform the current basic AI integration into a sophisticated, context-aware AI coaching system that provides personalized fitness guidance using state-of-the-art AI technologies.

### Document Structure:
1. **Architecture Review** - Current system analysis
2. **System Architecture** - High-level design
3. **Core Components** - Technical implementation details
4. **Key Features** - Pydantic models, MCP, RAG, Agents
5. **Implementation Timeline** - 12-week detailed plan
6. **Infrastructure & Deployment** - Scalability, security, costs
7. **Quick Start Guide** - Get running immediately

### Key Technologies:
- **MCP (Model Context Protocol)** - For standardized AI tool interactions
- **RAG (Retrieval Augmented Generation)** - For contextual, data-driven responses
- **Vector Databases** - For semantic search and memory
- **LangChain/LlamaIndex** - For orchestration
- **FastAPI** - For high-performance Python service
- **Poetry** - For dependency management and packaging
- **Pydantic V2** - For data validation and settings management
- **Multiple LLM Support** - OpenAI, Anthropic Claude, local models

---

## 🔄 Architecture Review & Modifications (Updated: August 2025)

### Current System Analysis
Based on review of the existing system:
- **Backend**: Node.js/Express with MongoDB (50+ endpoints)
- **Authentication**: JWT-based with ownership tracking
- **Data Models**: User, Exercise, Workout, Goal, Plan, PredefinedWorkout
- **Frontend**: React with Base44 components
- **Current AI**: Basic OpenAI integration in Node.js

### Key Integration Points Identified
1. **MongoDB Shared Access**: AI service will read from same MongoDB instance
2. **JWT Token Validation**: Reuse existing JWT tokens for AI endpoints
3. **User Context**: Leverage existing user profiles, workout history, goals
4. **Exercise Database**: 1000+ exercises with detailed metadata
5. **API Gateway**: Route `/api/v1/ai/*` to new Python service

### Proposed Architectural Enhancements

#### 1. **Hybrid Database Strategy**
- **MongoDB**: Source of truth for user data, exercises, workouts
- **PostgreSQL**: AI-specific data (conversations, feedback, analytics)
- **Redis**: Session cache and real-time state
- **Pinecone/Qdrant**: Vector storage for embeddings

#### 2. **Enhanced Security Layer**
- **OAuth2 + JWT**: Maintain compatibility with existing auth
- **API Key Management**: For external AI service calls
- **Rate Limiting**: Per-user and per-endpoint limits
- **Content Filtering**: Medical advice disclaimers, harmful content detection

#### 3. **Observability & Monitoring**
- **OpenTelemetry**: Distributed tracing across services
- **Structured Logging**: JSON logs with correlation IDs
- **Metrics**: Prometheus + Grafana dashboards
- **Cost Tracking**: Per-user AI usage monitoring

#### 4. **Development & Testing Strategy**
- **Poetry + Pyenv**: Reproducible Python environments
- **Pytest + Hypothesis**: Property-based testing for AI responses
- **Locust**: Load testing for concurrent users
- **Docker Compose**: Local development environment

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
├─────────────────────────────────────────────────────────────┤
│                   API Gateway (Kong/Traefik)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  Node.js     │  │  Python AI  │  │   Background     │  │
│  │  Backend     │  │   Service   │  │    Workers       │  │
│  │  (Existing)  │  │   (New)     │  │  (Celery/RQ)     │  │
│  └──────────────┘  └─────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │   MongoDB    │  │  Pinecone/  │  │     Redis        │  │
│  │  (Primary)   │  │   Weaviate  │  │    (Cache)       │  │
│  └──────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Components

### 1. **Python AI Service** (`ai-coach-service/`)

```python
ai-coach-service/
├── pyproject.toml              # Poetry configuration
├── poetry.lock                 # Locked dependencies
├── .env.example               # Environment variables template
├── .python-version            # Python version for pyenv
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Pydantic Settings management
│   │
│   ├── core/
│   │   ├── mcp/               # MCP Protocol Implementation
│   │   │   ├── server.py      # MCP Server
│   │   │   ├── tools.py       # Custom fitness tools
│   │   │   └── handlers.py    # Tool execution handlers
│   │   │
│   │   ├── rag/               # RAG Pipeline
│   │   │   ├── embeddings.py  # Document embeddings
│   │   │   ├── retriever.py   # Context retrieval
│   │   │   ├── indexer.py     # Document indexing
│   │   │   └── reranker.py    # Result reranking
│   │   │
│   │   ├── agents/            # AI Agents
│   │   │   ├── base.py        # Base agent class
│   │   │   ├── coach.py       # Main coaching agent
│   │   │   ├── nutritionist.py # Nutrition specialist
│   │   │   ├── form_checker.py # Exercise form analyzer
│   │   │   └── planner.py     # Workout planning agent
│   │   │
│   │   └── memory/            # Memory Systems
│   │       ├── short_term.py  # Session memory
│   │       ├── long_term.py   # User history
│   │       └── episodic.py    # Workout episodes
│   │
│   ├── models/                # Data Models
│   │   ├── chat.py
│   │   ├── context.py
│   │   └── recommendations.py
│   │
│   ├── services/              # Business Logic
│   │   ├── llm_service.py     # LLM orchestration
│   │   ├── vector_service.py  # Vector DB operations
│   │   ├── analytics.py       # User analytics
│   │   └── personalization.py # Recommendation engine
│   │
│   └── api/                   # API Endpoints
│       ├── v1/
│       │   ├── chat.py        # Chat endpoints
│       │   ├── analysis.py    # Analysis endpoints
│       │   ├── recommendations.py
│       │   └── mcp.py         # MCP protocol endpoint
│       └── webhooks.py        # Event webhooks
│
├── data/
│   ├── knowledge/             # Static Knowledge Base
│   │   ├── exercises/         # Exercise database
│   │   ├── nutrition/         # Nutrition info
│   │   ├── anatomy/           # Body mechanics
│   │   └── research/          # Scientific papers
│   │
│   └── prompts/               # Prompt Templates
│       ├── system/            # System prompts
│       └── tools/             # Tool-specific prompts
│
├── tests/
├── docker/
└── requirements.txt
```

---

## 💡 Key Features Implementation

### 1. **Pydantic Models & Configuration**

```python
# app/models/schemas.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class WorkoutDifficulty(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"

class ChatMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None

class UserContext(BaseModel):
    user_id: str
    fitness_level: WorkoutDifficulty
    goals: List[str]
    injuries: Optional[List[str]] = []
    preferred_equipment: Optional[List[str]] = []
    workout_history_summary: Optional[Dict[str, Any]] = None

class AIResponse(BaseModel):
    message: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    sources: Optional[List[str]] = []
    suggestions: Optional[List[Dict[str, Any]]] = []
    disclaimer: Optional[str] = None

# app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # API Configuration
    api_title: str = "AI Coach Service"
    api_version: str = "1.0.0"
    debug: bool = False
    
    # MongoDB Configuration (existing database)
    mongodb_url: str
    mongodb_database: str = "ripped-potato"
    
    # PostgreSQL (AI-specific data)
    postgres_url: Optional[str] = None
    
    # Redis Configuration
    redis_url: str = "redis://localhost:6379"
    redis_ttl: int = 3600
    
    # AI Model Configuration
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    cohere_api_key: Optional[str] = None
    
    # Vector Database
    pinecone_api_key: Optional[str] = None
    pinecone_environment: Optional[str] = None
    qdrant_url: Optional[str] = None
    
    # Security
    jwt_secret_key: str  # Same as Node.js backend
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    
    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 3600
    
    # Observability
    enable_tracing: bool = True
    jaeger_endpoint: Optional[str] = None
    
@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

### 2. **MCP (Model Context Protocol) Integration with FastAPI**

```python
# app/core/mcp/server.py
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import asyncio
from fastapi import WebSocket

class MCPTool(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]
    
class MCPRequest(BaseModel):
    id: str
    method: str
    params: Optional[Dict[str, Any]] = None

class MCPResponse(BaseModel):
    id: str
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None

class FitnessCoachMCPServer:
    """MCP server for fitness coaching tools with Pydantic validation"""
    
    def __init__(self, mongo_client, redis_client):
        self.mongo = mongo_client
        self.redis = redis_client
        self.tools = self._register_tools()
        
    def _register_tools(self) -> List[MCPTool]:
        return [
            MCPTool(
                name="analyze_exercise_form",
                description="Analyze exercise form from description",
                parameters={
                    "type": "object",
                    "properties": {
                        "exercise_name": {"type": "string"},
                        "description": {"type": "string"},
                        "user_context": {"type": "object"}
                    },
                    "required": ["exercise_name", "description"]
                }
            ),
            MCPTool(
                name="generate_workout",
                description="Create personalized workout plan",
                parameters={
                    "type": "object",
                    "properties": {
                        "duration_minutes": {"type": "integer"},
                        "difficulty": {"type": "string"},
                        "focus_areas": {"type": "array", "items": {"type": "string"}},
                        "equipment": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["duration_minutes", "difficulty"]
                }
            ),
            MCPTool(
                name="calculate_macros",
                description="Calculate nutritional requirements",
                parameters={
                    "type": "object",
                    "properties": {
                        "weight_kg": {"type": "number"},
                        "height_cm": {"type": "number"},
                        "age": {"type": "integer"},
                        "gender": {"type": "string"},
                        "activity_level": {"type": "string"},
                        "goal": {"type": "string"}
                    },
                    "required": ["weight_kg", "height_cm", "age", "gender", "activity_level", "goal"]
                }
            ),
            MCPTool(
                name="track_progress",
                description="Analyze user progress trends",
                parameters={
                    "type": "object",
                    "properties": {
                        "user_id": {"type": "string"},
                        "metric": {"type": "string"},
                        "timeframe_days": {"type": "integer"}
                    },
                    "required": ["user_id", "metric"]
                }
            ),
            MCPTool(
                name="get_exercise_alternatives",
                description="Find alternative exercises",
                parameters={
                    "type": "object",
                    "properties": {
                        "exercise_id": {"type": "string"},
                        "reason": {"type": "string"},
                        "equipment_available": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["exercise_id"]
                }
            )
        ]
    
    async def handle_tool_call(self, tool_name: str, params: dict) -> Dict[str, Any]:
        """Execute MCP tool calls with validation"""
        handler_map = {
            "analyze_exercise_form": self._analyze_form,
            "generate_workout": self._generate_workout,
            "calculate_macros": self._calculate_macros,
            "track_progress": self._track_progress,
            "get_exercise_alternatives": self._get_alternatives
        }
        
        handler = handler_map.get(tool_name)
        if not handler:
            raise ValueError(f"Unknown tool: {tool_name}")
            
        return await handler(**params)
    
    async def _analyze_form(self, exercise_name: str, description: str, user_context: Optional[dict] = None):
        # Implementation using MongoDB exercise data
        exercise = await self.mongo.exercises.find_one({"name": exercise_name})
        # RAG retrieval for form analysis
        # Return analysis with confidence score
        pass
    
    async def handle_websocket(self, websocket: WebSocket):
        """Handle MCP protocol over WebSocket"""
        await websocket.accept()
        try:
            while True:
                data = await websocket.receive_json()
                request = MCPRequest(**data)
                
                if request.method == "tools/list":
                    response = MCPResponse(
                        id=request.id,
                        result={"tools": [tool.dict() for tool in self.tools]}
                    )
                elif request.method == "tools/call":
                    try:
                        result = await self.handle_tool_call(
                            request.params["name"],
                            request.params["arguments"]
                        )
                        response = MCPResponse(id=request.id, result=result)
                    except Exception as e:
                        response = MCPResponse(
                            id=request.id,
                            error={"code": -32603, "message": str(e)}
                        )
                else:
                    response = MCPResponse(
                        id=request.id,
                        error={"code": -32601, "message": "Method not found"}
                    )
                
                await websocket.send_json(response.dict())
        except Exception as e:
            await websocket.close(code=1000)
```

### 3. **Cloud-First RAG Pipeline (No Local Models)**

```python
# app/core/rag/pipeline.py
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_cohere import CohereRerank
from typing import List, Dict, Any
import asyncio

class CloudRAGPipeline:
    """RAG Pipeline using only cloud APIs - no local models"""
    
    def __init__(self, settings):
        # Use OpenAI's API for embeddings (no local storage)
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",  # Cheapest option
            openai_api_key=settings.openai_api_key
        )
        
        # Use Pinecone cloud vector DB (serverless option available)
        self.vector_store = PineconeVectorStore(
            index_name="fitness-knowledge",
            embedding=self.embeddings,
            pinecone_api_key=settings.pinecone_api_key
        )
        
        # Optional: Cohere for reranking (can skip to save costs)
        self.reranker = CohereRerank(
            cohere_api_key=settings.cohere_api_key,
            model="rerank-english-v2.0"
        ) if settings.cohere_api_key else None
    
    async def retrieve_context(self, query: str, user_profile: dict):
        """Retrieve relevant context using cloud services only"""
        # 1. Semantic search via Pinecone
        docs = await self.vector_store.asimilarity_search(
            query, 
            k=5,  # Retrieve top 5
            filter={"user_level": user_profile.get("fitness_level")}
        )
        
        # 2. Optional reranking with Cohere
        if self.reranker:
            docs = await self.reranker.arerank(
                query=query,
                documents=[d.page_content for d in docs]
            )
            return docs[:3]
        
        return docs[:3]  # Top 3 most relevant

# Alternative: Using only OpenAI (no Pinecone needed)
class MinimalRAGPipeline:
    """Minimal RAG using MongoDB + OpenAI embeddings only"""
    
    def __init__(self, mongo_client, openai_key):
        self.mongo = mongo_client
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=openai_key
        )
        
    async def index_exercise(self, exercise: dict):
        """Store exercise with embedding in MongoDB"""
        embedding = await self.embeddings.aembed_query(
            f"{exercise['name']} {exercise['description']} {exercise['targetMuscles']}"
        )
        
        await self.mongo.exercises.update_one(
            {"_id": exercise["_id"]},
            {"$set": {"embedding": embedding}}
        )
    
    async def semantic_search(self, query: str, limit: int = 5):
        """Search using MongoDB Atlas Vector Search (free tier available)"""
        query_embedding = await self.embeddings.aembed_query(query)
        
        # MongoDB Atlas Vector Search (requires Atlas cluster)
        pipeline = [
            {
                "$search": {
                    "index": "exercise_embeddings",
                    "knnBeta": {
                        "vector": query_embedding,
                        "path": "embedding",
                        "k": limit
                    }
                }
            }
        ]
        
        results = await self.mongo.exercises.aggregate(pipeline).to_list(limit)
        return results
```

### 3. **Multi-Agent System with Priority Rules**

```python
# app/core/agents/orchestrator.py
from enum import IntEnum
from typing import List, Dict, Any

class ResponsePriority(IntEnum):
    """Priority levels for response handling"""
    SAFETY = 1      # Injury prevention, form correction
    PLANNING = 2    # Workout/nutrition planning
    EDUCATION = 3   # Exercise explanation, tips
    MOTIVATION = 4  # Encouragement, progress celebration
    GENERAL = 5     # General conversation

class CoachingOrchestrator:
    """Orchestrates multiple agents with conflict resolution"""
    
    def __init__(self):
        self.agents = {
            "general": (GeneralCoachAgent(), ResponsePriority.GENERAL),
            "nutrition": (NutritionAgent(), ResponsePriority.PLANNING),
            "form": (FormAnalysisAgent(), ResponsePriority.SAFETY),
            "planner": (WorkoutPlannerAgent(), ResponsePriority.PLANNING),
            "motivator": (MotivationAgent(), ResponsePriority.MOTIVATION)
        }
        self.router = IntentRouter()
    
    async def process_request(self, message: str, context: dict):
        # 1. Route to appropriate agent(s)
        intent = await self.router.classify_intent(message)
        
        # 2. Gather context (simple MongoDB lookup, no RAG complexity)
        user_context = await self.get_user_context(context["user_id"])
        
        # 3. Execute agent(s) with priority handling
        if intent.requires_multi_agent:
            responses = await self.execute_multi_agent(
                intent.agents, message, user_context
            )
            return self.resolve_conflicts(responses)
        else:
            agent, priority = self.agents[intent.primary_agent]
            return await agent.generate_response(message, user_context)
    
    def resolve_conflicts(self, responses: List[Dict]) -> Dict:
        """Resolve conflicts based on priority"""
        # Sort by priority (lower number = higher priority)
        sorted_responses = sorted(
            responses, 
            key=lambda x: x["priority"]
        )
        
        # Merge responses, with higher priority overriding
        final_response = sorted_responses[0]
        
        # Add context from lower priority responses if non-conflicting
        for resp in sorted_responses[1:]:
            if "additional_info" in resp:
                final_response.setdefault("additional_info", []).extend(
                    resp["additional_info"]
                )
        
        return final_response

# Priority Rules:
# 1. Safety always wins (form corrections, injury prevention)
# 2. Planning takes precedence over general advice
# 3. Education supplements but doesn't override
# 4. Motivation is added when appropriate
# 5. General chat is lowest priority
```

### 4. **Simplified Memory Management (Redis-First)**

```python
# app/core/memory.py
from typing import List, Dict, Any, Optional
import json
from datetime import datetime, timedelta

class SessionMemoryManager:
    """Simple, efficient memory using Redis only - no vector DBs needed"""
    
    def __init__(self, redis_client, mongo_client):
        self.redis = redis_client
        self.mongo = mongo_client
        
    async def store_interaction(self, user_id: str, message: str, response: str):
        """Store conversation in Redis with automatic expiration"""
        session_key = f"session:{user_id}"
        
        interaction = {
            "timestamp": datetime.utcnow().isoformat(),
            "user_message": message,
            "ai_response": response
        }
        
        # Store in Redis list (auto-expires after 1 hour)
        await self.redis.rpush(session_key, json.dumps(interaction))
        await self.redis.expire(session_key, 3600)  # 1 hour TTL
        
        # Keep only last 10 messages to limit context size
        await self.redis.ltrim(session_key, -10, -1)
    
    async def get_session_context(self, user_id: str) -> List[Dict]:
        """Retrieve current session context from Redis"""
        session_key = f"session:{user_id}"
        
        # Get last 5 interactions for context
        raw_messages = await self.redis.lrange(session_key, -5, -1)
        return [json.loads(msg) for msg in raw_messages]
    
    async def get_user_context(self, user_id: str) -> Dict:
        """Get user profile + recent workouts from MongoDB"""
        # User profile (cached in Redis for 10 minutes)
        cache_key = f"user_context:{user_id}"
        cached = await self.redis.get(cache_key)
        
        if cached:
            return json.loads(cached)
        
        # Fetch from MongoDB
        user = await self.mongo.users.find_one({"_id": user_id})
        recent_workouts = await self.mongo.workouts.find(
            {"userId": user_id}
        ).sort("date", -1).limit(5).to_list(5)
        
        context = {
            "fitness_level": user.get("fitnessLevel"),
            "goals": user.get("goals", []),
            "recent_workouts": [w["type"] for w in recent_workouts],
            "preferences": user.get("preferences", {})
        }
        
        # Cache for 10 minutes
        await self.redis.setex(cache_key, 600, json.dumps(context))
        return context

# Why this approach is better:
# 1. No vector DB complexity/costs
# 2. Redis handles TTL automatically
# 3. MongoDB already has user data
# 4. Fast, simple, maintainable
# 5. No embeddings storage needed
```

---

## 🔀 Scalability & Multi-Tenancy

### **Built-in Multi-Tenancy (Simple Approach)**
```python
# app/core/auth.py
from fastapi import Depends, HTTPException, status
from jose import JWTError, jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Extract user from JWT - automatic tenant isolation"""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "tenant_id": user_id}  # User IS the tenant
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# All queries automatically scoped to user
@router.post("/chat")
async def chat(
    message: ChatMessage,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    # Automatically scoped to user's data only
    user_data = await db.users.find_one({"_id": current_user["user_id"]})
    # Process with user-specific context
```

### **Horizontal Scaling Strategy**
1. **Stateless Service Design**
   - All state in Redis/MongoDB
   - No local file storage
   - JWT tokens for auth (no sessions)

2. **Load Balancing Ready**
   ```yaml
   # docker-compose.scale.yml
   services:
     ai-service:
       image: ai-coach-service
       deploy:
         replicas: 3  # Scale horizontally
       environment:
         - REDIS_URL=redis://redis:6379
         - MONGODB_URL=${MONGODB_URL}
   ```

3. **Caching Strategy for Scale**
   - User context: 10-minute cache
   - Common responses: 1-hour cache
   - Embeddings: Permanent in MongoDB

### **Cost Control at Scale**
```python
# app/core/rate_limit.py
class UserRateLimiter:
    """Per-user rate limiting for cost control"""
    
    async def check_limit(self, user_id: str) -> bool:
        key = f"rate_limit:{user_id}:{datetime.utcnow().hour}"
        count = await self.redis.incr(key)
        await self.redis.expire(key, 3600)
        
        # Free tier: 100 requests/hour
        # Paid tier: 1000 requests/hour
        user = await self.db.users.find_one({"_id": user_id})
        limit = 1000 if user.get("subscription") == "premium" else 100
        
        return count <= limit
```

## 🚀 Detailed Implementation Timeline

### **Week 1: Quick Foundation & Replace Node.js AI**
**Goal:** Get Python service running and replace existing Node.js AI endpoints

**Day 1-2: Project Setup**
```bash
# Deliverables:
- Poetry project initialized
- FastAPI basic structure
- .env configuration
- Docker setup
```

**Day 3-4: MongoDB Integration & Auth**
```python
# Deliverables:
- Connect to existing MongoDB
- JWT validation (reuse Node.js tokens)
- Basic error handling
- User context loading
```

**Day 5-7: Basic Chat Endpoint**
```python
# Deliverables:
- /api/v1/ai/chat endpoint
- OpenAI integration
- Simple prompt templates
- Replace Node.js AI route
```

**Success Criteria:**
✅ Python service responds to chat requests
✅ Frontend can call new endpoint
✅ JWT auth working
✅ Can query user's exercises/workouts from MongoDB
✅ Node.js AI endpoint deprecated

---

### **Week 2: Core AI Agents (Read & Suggest)**
**Goal:** AI can read user data and make intelligent suggestions

**Day 1-2: Exercise & Workout Reader**
```python
# Deliverables:
- Load user's exercises
- Load workout history
- Format data for LLM context
- Implement context size management
```

**Day 3-4: Suggestion Engine**
```python
# Deliverables:
- Suggest workout modifications
- Recommend exercises based on goals
- Generate basic workout plans
- Return structured responses (JSON)
```

**Day 5-7: Integration & Testing**
```python
# Deliverables:
- Test with real user data
- Handle edge cases
- Add response caching (Redis)
- Deploy to staging
```

**Success Criteria:**
✅ AI knows user's exercise history
✅ Can suggest relevant exercises
✅ Generates workouts based on user goals
✅ Frontend displays AI suggestions
✅ Response time < 3 seconds

---

### **Week 3-4: Database Interaction & CRUD Operations with User Confirmation**
**Goal:** AI can create and modify data in MongoDB with user approval workflow

**Architecture Approach:**
1. **Schema Alignment**: Python service calls Node.js backend APIs to ensure schema consistency
2. **User Confirmation**: All CRUD operations require explicit user approval via Accept/Reject buttons
3. **Transactional Safety**: Operations are atomic with rollback capability

**Week 3: Confirmation UI & Backend Integration**
```python
# Deliverables:
- Pending changes data model
- Accept/Reject UI components in chat
- Python service calls Node.js APIs for CRUD
- Validation layer for schema consistency
```

**Implementation Details:**

```python
# app/models/pending_changes.py
class PendingChange(BaseModel):
    """Model for changes awaiting user confirmation"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    change_type: Literal["create", "update", "delete"]
    entity_type: Literal["workout", "exercise", "goal", "plan"]
    proposed_data: Dict[str, Any]
    current_data: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime  # Auto-expire after 5 minutes
    status: Literal["pending", "accepted", "rejected", "expired"] = "pending"
    
# app/services/crud_service.py
class CRUDService:
    """Service to interact with Node.js backend APIs"""
    
    async def create_pending_change(self, change: PendingChange) -> str:
        """Store pending change in Redis with TTL"""
        await self.redis.setex(
            f"pending:{change.id}",
            300,  # 5 minute TTL
            change.json()
        )
        return change.id
    
    async def execute_change(self, change_id: str, user_id: str) -> bool:
        """Execute approved change via Node.js API"""
        change = await self.get_pending_change(change_id)
        
        if change.user_id != user_id:
            raise PermissionError("Unauthorized")
        
        # Call appropriate Node.js endpoint
        endpoint_map = {
            "workout": f"{NODE_BACKEND_URL}/api/v1/workouts",
            "exercise": f"{NODE_BACKEND_URL}/api/v1/exercises",
            "goal": f"{NODE_BACKEND_URL}/api/v1/goals",
            "plan": f"{NODE_BACKEND_URL}/api/v1/plans"
        }
        
        async with httpx.AsyncClient() as client:
            if change.change_type == "create":
                response = await client.post(
                    endpoint_map[change.entity_type],
                    json=change.proposed_data,
                    headers=self._get_auth_headers(user_id)
                )
            elif change.change_type == "update":
                response = await client.put(
                    f"{endpoint_map[change.entity_type]}/{change.entity_id}",
                    json=change.proposed_data,
                    headers=self._get_auth_headers(user_id)
                )
            # ... handle delete
        
        return response.status_code == 200
```

**Frontend Integration:**
```javascript
// FloatingAIAssistant.jsx additions
const PendingChangeCard = ({ change, onAccept, onReject }) => (
  <div className="pending-change-card">
    <h4>AI Suggestion: {change.change_type} {change.entity_type}</h4>
    <pre>{JSON.stringify(change.proposed_data, null, 2)}</pre>
    <div className="action-buttons">
      <button onClick={() => onAccept(change.id)} className="accept-btn">
        ✅ Accept
      </button>
      <button onClick={() => onReject(change.id)} className="reject-btn">
        ❌ Reject
      </button>
    </div>
  </div>
);
```

**Week 4: MCP Tools with Confirmation Flow**
```python
# MCP Tools with user confirmation:
1. propose_workout_plan(name, exercises, duration) -> pending_id
2. propose_exercise_addition(exercise_data) -> pending_id
3. propose_goal_modification(goal_id, changes) -> pending_id
4. propose_workout_schedule(workout_id, date) -> pending_id
5. confirm_change(pending_id) -> success/failure

# Each tool returns a pending change ID that requires user confirmation
```

**API Flow Example:**
```python
# 1. AI proposes a workout
pending_id = await ai_service.propose_workout_plan(
    name="Upper Body Strength",
    exercises=[...],
    duration=45
)

# 2. Return to user with pending change
return {
    "message": "I've created an Upper Body Strength workout for you!",
    "pending_change": {
        "id": pending_id,
        "type": "create_workout",
        "preview": workout_preview
    },
    "requires_confirmation": True
}

# 3. User clicks Accept
await crud_service.execute_change(pending_id, user_id)

# 4. Workout created via Node.js API
```

**Success Criteria:**
✅ AI proposes changes that appear with Accept/Reject buttons
✅ Changes only execute after user confirmation
✅ All CRUD operations go through Node.js backend APIs
✅ Schemas remain perfectly aligned
✅ Pending changes expire after 5 minutes
✅ Full audit trail of accepted/rejected changes

---

### **Week 5-6: Multi-Agent System**
**Goal:** Specialized agents for different tasks

**Week 5: Agent Framework**
```python
# Agents to implement:
1. WorkoutPlannerAgent - Creates structured plans
2. FormCoachAgent - Provides exercise guidance
3. NutritionAgent - Basic macro calculations
4. ProgressAnalyzer - Tracks user progress
```

**Week 6: Orchestration & Routing**
```python
# Deliverables:
- Intent classification
- Agent routing logic
- Response merging
- Priority handling (safety > planning > general)
```

**Success Criteria:**
✅ Correct agent handles each query type
✅ Complex questions use multiple agents
✅ Consistent response format
✅ **MVP READY** - Full replacement of Node.js AI

---

### **Week 7-8: Memory & Personalization**
**Goal:** AI remembers context and personalizes responses

**Week 7: Session Memory**
```python
# Deliverables:
- Redis session storage
- Conversation context (last 10 messages)
- User preference learning
- Context injection in prompts
```

**Week 8: Personalization Engine**
```python
# Deliverables:
- Adapt tone to user preference
- Remember user's equipment
- Track favorite exercises
- Personalized encouragement
```

**Success Criteria:**
✅ AI remembers conversation context
✅ Responses feel personalized
✅ User preferences persist
✅ Reduced repetition in responses

---

### **Week 9-10: RAG Implementation (Now we have data!)**
**Goal:** Enhanced context with semantic search

**Week 9: Data Indexing**
```python
# Deliverables:
- Index existing exercises in MongoDB
- Create embeddings for exercise descriptions
- Implement semantic search
- Cache embeddings
```

**Week 10: RAG Pipeline**
```python
# Deliverables:
- Context retrieval for queries
- Similar exercise finder
- Knowledge base integration
- Response quality improvement
```

**Success Criteria:**
✅ AI finds relevant exercises semantically
✅ Better exercise recommendations
✅ Can answer "why" questions with context
✅ **Full Feature Set Ready**

---

### **Week 11-12: Production Optimization**
**Goal:** Ready for scale and production traffic

**Week 11: Performance & Cost**
```python
# Optimizations:
- Response streaming
- Aggressive caching
- Token optimization
- Rate limiting per user
- Cost monitoring dashboard
```

**Week 12: Production Deployment**
```python
# Deliverables:
- Load testing (100+ concurrent users)
- Error recovery
- Monitoring alerts
- Documentation
- Deployment scripts
```

**Success Criteria:**
✅ P95 latency < 2s
✅ Cost per user < $0.10/month
✅ 99.9% uptime
✅ Auto-scaling configured
✅ **Production Ready**

---

## 🎯 Milestone Summary

| Week | Milestone | Key Outcome |
|------|-----------|-------------|
| **1** | Node.js Replaced | Python service handling AI requests |
| **2** | Basic AI Working | Can read data and suggest workouts |
| **4** | Database Writes | AI can create/modify user data |
| **6** | **MVP Complete** | Full AI coach functionality |
| **8** | Personalized | Remembers users, adapts responses |
| **10** | **Full Features** | RAG-enhanced, semantic search |
| **12** | **Production** | Scaled, optimized, monitored |

---

## 🛠️ Technology Stack

### **Core Technologies**
| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Framework** | FastAPI | High performance, async support, automatic OpenAPI |
| **MCP Library** | `mcp-python` | Official MCP implementation |
| **LLM Orchestration** | LangChain | Mature ecosystem, tool support |
| **Vector DB** | Pinecone/Weaviate | Scalable, hybrid search |
| **Embeddings** | OpenAI Ada-002 / Cohere | Quality vs cost balance |
| **Cache** | Redis | Fast, flexible data structures |
| **Queue** | Celery + Redis | Async task processing |
| **Monitoring** | Prometheus + Grafana | Metrics and observability |

### **Cloud-First AI Models (No Local Storage)**
| Use Case | Primary Model | Fallback | Notes |
|----------|--------------|----------|-------|
| **General Chat** | GPT-4 Turbo | GPT-3.5 Turbo | API-only, no local models |
| **Form Analysis** | GPT-4 Vision | Claude 3 Haiku | Cloud APIs only |
| **Quick Responses** | GPT-3.5 Turbo | Claude 3 Haiku | Fastest cloud options |
| **Embeddings** | text-embedding-3-small | Cohere embed-english-light-v3.0 | Cheapest options |
| **Vector Storage** | MongoDB Atlas | Pinecone Serverless | Both have free tiers |

---

## 📊 Data Pipeline

```mermaid
graph LR
    A[User Input] --> B[Intent Classification]
    B --> C[Context Retrieval]
    C --> D[RAG Pipeline]
    D --> E[Agent Selection]
    E --> F[Response Generation]
    F --> G[Memory Update]
    G --> H[User Response]
    
    I[Knowledge Base] --> D
    J[User History] --> C
    K[Exercise DB] --> D
```

---

## 🔒 Security, Privacy & Compliance

### **Data Protection & Privacy**
- **Data Minimization**: Only store essential user data
- **What We Store**:
  - User profile metadata (goals, fitness level, preferences)
  - Workout history references (IDs only, details in main DB)
  - Session context (Redis, auto-expires in 1 hour)
  - Aggregated metrics (anonymized)
- **What We DON'T Store**:
  - Full chat histories (only session-based)
  - Health conditions (referenced by ID only)
  - Personal identifiable information in AI context

### **Compliance Considerations**
```python
# app/core/privacy.py
class PrivacyManager:
    """Handles data privacy and compliance"""
    
    @staticmethod
    def sanitize_user_context(user_data: dict) -> dict:
        """Remove PII before sending to LLM"""
        return {
            "user_id": hashlib.sha256(user_data["_id"].encode()).hexdigest()[:8],
            "fitness_level": user_data.get("fitness_level"),
            "goals": [g["type"] for g in user_data.get("goals", [])],
            "age_range": PrivacyManager._get_age_range(user_data.get("age")),
            # Never send: email, name, exact age, location, medical details
        }
    
    @staticmethod
    def get_gdpr_export(user_id: str) -> dict:
        """Export all user data for GDPR compliance"""
        # Collect from MongoDB, Redis, and any logs
        pass
```

### **AI Safety**
- Content filtering for medical advice
- Automatic disclaimer injection for health recommendations
- No diagnosis or medical treatment suggestions
- Audit logging with automatic PII removal

---

## 💰 Cost Optimization & Minimal Infrastructure

### **Minimal Infrastructure Requirements (Server-Friendly)**
1. **Free/Low-Cost Services**
   - MongoDB Atlas Free Tier (512MB storage)
   - Redis Cloud Free Tier (30MB)
   - Render.com Free Tier for hosting
   - GitHub Actions for CI/CD

2. **API-Only Strategy (No Local Models)**
   - OpenAI API: ~$0.002 per 1K tokens (GPT-3.5)
   - No GPU requirements
   - Minimal RAM (2GB sufficient)
   - Small disk footprint (<500MB)

3. **Progressive Enhancement Path**
   ```
   Phase 1: MongoDB + OpenAI only
   Phase 2: Add Redis caching
   Phase 3: Add vector search (MongoDB Atlas)
   Phase 4: Add Pinecone/reranking
   ```

### **Cost-Saving Strategies**
1. **Smart Model Selection**
   ```python
   async def select_model(query_complexity: str) -> str:
       if query_complexity == "simple":
           return "gpt-3.5-turbo"  # $0.002/1K tokens
       elif query_complexity == "moderate":
           return "gpt-3.5-turbo-16k"  # $0.003/1K tokens
       else:
           return "gpt-4-turbo-preview"  # $0.01/1K tokens
   ```

2. **Aggressive Caching**
   - Cache embeddings in MongoDB
   - Redis for session state
   - Response caching for common queries

3. **Token Optimization**
   - Prompt compression
   - Context window management
   - Streaming responses to reduce perceived latency

---

## 📈 Success Metrics & Measurement

### **Phase 1: Technical Health (Week 1-2)**
```python
# app/core/metrics.py
class MetricsCollector:
    """Simple metrics collection without complex tools"""
    
    async def track_request(self, endpoint: str, duration_ms: float, success: bool):
        # Store in Redis for real-time dashboard
        key = f"metrics:{datetime.utcnow().strftime('%Y%m%d')}"
        await self.redis.hincrby(key, f"{endpoint}:count", 1)
        await self.redis.hincrbyfloat(key, f"{endpoint}:duration", duration_ms)
        if not success:
            await self.redis.hincrby(key, f"{endpoint}:errors", 1)
```

**Metrics to Track:**
- Response latency (target: < 2s for p95)
- Error rate (target: < 1%)
- Token usage per request (optimize for cost)
- Cache hit rate (target: > 30%)

### **Phase 2: User Engagement (Week 3-4)**
**Simple Metrics (via MongoDB aggregation):**
- Daily active users
- Average session length
- Messages per session
- Feature usage (which agents are most used)

### **Phase 3: Business Value (Month 2+)**
**Outcome Metrics:**
- Workout completion rate (from app data)
- Goal progression (existing Goal model)
- User retention (7-day, 30-day)
- Recommendation acceptance rate

### **Simple Dashboard Implementation**
```python
# app/api/v1/metrics.py
@router.get("/dashboard")
async def get_metrics_dashboard(
    db: AsyncIOMotorDatabase = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """Simple metrics endpoint for monitoring"""
    
    # Today's metrics from Redis
    today = datetime.utcnow().strftime('%Y%m%d')
    today_metrics = await redis.hgetall(f"metrics:{today}")
    
    # User engagement from MongoDB
    active_users = await db.users.count_documents({
        "lastActive": {"$gte": datetime.utcnow() - timedelta(days=1)}
    })
    
    # AI usage stats
    total_sessions = await redis.get("ai:total_sessions") or 0
    
    return {
        "health": {
            "avg_latency_ms": float(today_metrics.get("chat:duration", 0)) / 
                              max(int(today_metrics.get("chat:count", 1)), 1),
            "error_rate": float(today_metrics.get("chat:errors", 0)) / 
                         max(int(today_metrics.get("chat:count", 1)), 1),
            "cache_hit_rate": float(today_metrics.get("cache:hits", 0)) / 
                             max(int(today_metrics.get("cache:total", 1)), 1)
        },
        "engagement": {
            "daily_active_users": active_users,
            "total_ai_sessions": int(total_sessions),
            "avg_messages_per_session": 4.2  # Calculate from Redis
        },
        "cost": {
            "tokens_used_today": int(today_metrics.get("tokens:total", 0)),
            "estimated_cost_usd": float(today_metrics.get("tokens:total", 0)) * 0.002 / 1000
        }
    }
```

### **What NOT to Measure (Avoiding Complexity)**
- ❌ Complex ML model performance metrics
- ❌ A/B testing infrastructure  
- ❌ Real-time streaming analytics
- ❌ Distributed tracing (start with simple logs)

### **Actionable Insights Focus**
Instead of complex metrics, focus on simple questions:
1. Are users coming back? (Retention)
2. Are responses fast enough? (Latency)
3. Are we staying within budget? (Cost)
4. Are users achieving goals? (Outcomes)

---

## 🔄 Migration Strategy

### **Step 1: Parallel Deployment**
- Deploy Python service alongside Node.js
- Route 10% traffic to new service
- A/B test responses

### **Step 2: Feature Parity**
- Implement all current AI features
- Migrate conversation history
- Update frontend integration

### **Step 3: Enhanced Features**
- Enable RAG pipeline
- Activate specialized agents
- Launch personalization

### **Step 4: Full Migration**
- Route 100% traffic to Python service
- Deprecate old AI endpoints
- Monitor and optimize

---

## 🚀 Quick Start Guide (Minimal Setup)

### **Day 1: Basic Service Setup**
```bash
# 1. Create project
mkdir ai-coach-service && cd ai-coach-service

# 2. Initialize Poetry
poetry init -n --name ai-coach-service --python "^3.11"

# 3. Add minimal dependencies
poetry add fastapi uvicorn[standard] motor openai pydantic-settings python-jose[cryptography]

# 4. Create basic structure
mkdir -p app/{api,core,models,services}
touch app/__init__.py app/main.py app/config.py

# 5. Copy .env.example to .env and configure
cp .env.example .env

# 6. Run service
poetry run uvicorn app.main:app --reload
```

### **Day 2-3: Core Features**
- [ ] JWT authentication middleware
- [ ] Basic chat endpoint
- [ ] MongoDB connection
- [ ] OpenAI integration

### **Week 1: MVP Features**
- [ ] User context loading
- [ ] Exercise recommendations
- [ ] Workout generation
- [ ] Basic caching

### **Week 2-4: Enhanced Features**
- [ ] MCP tool implementation
- [ ] RAG with MongoDB Atlas Search
- [ ] Multi-turn conversations
- [ ] Performance optimization

## 🚦 Next Steps

1. **Immediate Actions**
   - [ ] Create `ai-coach-service` directory
   - [ ] Set up Poetry project
   - [ ] Configure `.env` with existing MongoDB
   - [ ] Implement basic FastAPI structure

2. **Week 1 Goals**
   - [ ] FastAPI service running locally
   - [ ] Basic chat endpoint working
   - [ ] Connected to existing MongoDB
   - [ ] JWT auth validated

3. **Month 1 Milestone**
   - [ ] Full MCP implementation
   - [ ] Basic RAG operational
   - [ ] Deployed to Render/Railway
   - [ ] Integrated with frontend

---

## 📚 Resources & References

### **Documentation**
- [MCP Protocol Spec](https://modelcontextprotocol.io)
- [LangChain Docs](https://python.langchain.com)
- [FastAPI Best Practices](https://fastapi.tiangolo.com)
- [RAG Survey Paper](https://arxiv.org/abs/2312.10997)

### **Example Implementations**
- [Anthropic MCP Examples](https://github.com/anthropics/mcp)
- [LangChain RAG Template](https://github.com/langchain-ai/rag-template)
- [Production FastAPI](https://github.com/tiangolo/full-stack-fastapi-template)

### **Fitness AI Research**
- Exercise form detection papers
- Personalized workout generation studies
- Nutrition recommendation systems
- Behavior change through AI coaching

---

## 💡 Innovation Opportunities

### **Future Enhancements**
1. **Computer Vision Integration**
   - Real-time form correction
   - Rep counting
   - Pose estimation

2. **Wearable Integration**
   - Heart rate-based recommendations
   - Recovery insights
   - Sleep optimization

3. **Social Features**
   - AI-mediated group challenges
   - Personalized community matching
   - Peer coaching assistance

4. **Advanced Analytics**
   - Predictive injury prevention
   - Performance forecasting
   - Genetic-based optimization

---

## 🎯 Expected Outcomes

### **User Benefits**
- **10x Better Responses**: Context-aware, personalized guidance
- **Instant Expertise**: Access to comprehensive fitness knowledge
- **24/7 Availability**: Always-on coaching support
- **Continuous Learning**: System improves with each interaction

### **Business Benefits**
- **Reduced Costs**: Efficient resource utilization
- **Scalability**: Handle 1000x more users
- **Differentiation**: State-of-the-art AI features
- **Data Insights**: Deep user behavior understanding

---

## 📝 Implementation Checklist

### **Prerequisites**
- [ ] Python 3.11+ environment
- [ ] Poetry installed (`curl -sSL https://install.python-poetry.org | python3 -`)
- [ ] OpenAI API key
- [ ] MongoDB Atlas account (free tier) or existing MongoDB
- [ ] Redis Cloud account (free tier) or local Redis
- [ ] Docker setup (optional)

### **Poetry-Based Development Setup**
```bash
# Create project structure
mkdir ai-coach-service
cd ai-coach-service

# Initialize Poetry project
poetry init

# Set Python version
poetry env use python3.11

# Create pyproject.toml with dependencies
```

### **pyproject.toml Configuration**
```toml
[tool.poetry]
name = "ai-coach-service"
version = "0.1.0"
description = "AI Coach Service for personalized fitness guidance"
authors = ["Your Team <team@example.com>"]
readme = "README.md"
packages = [{include = "app"}]

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
uvicorn = {extras = ["standard"], version = "^0.27.0"}
pydantic = "^2.5.0"
pydantic-settings = "^2.1.0"
motor = "^3.3.0"  # Async MongoDB driver
redis = "^5.0.0"
httpx = "^0.26.0"
python-jose = {extras = ["cryptography"], version = "^3.3.0"}  # JWT
python-multipart = "^0.0.6"
# AI/ML Dependencies (all cloud-based, no local models)
openai = "^1.10.0"
langchain = "^0.1.0"
langchain-openai = "^0.0.5"
langchain-community = "^0.0.10"
tiktoken = "^0.5.0"  # Token counting
# Optional cloud services
pinecone-client = "^3.0.0"  # Optional: for vector DB
cohere = "^4.37.0"  # Optional: for reranking
# Observability
prometheus-client = "^0.19.0"
opentelemetry-api = "^1.22.0"
opentelemetry-sdk = "^1.22.0"
opentelemetry-instrumentation-fastapi = "^0.43b0"
structlog = "^24.1.0"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
black = "^23.12.0"
ruff = "^0.1.0"
mypy = "^1.8.0"
pre-commit = "^3.6.0"
ipython = "^8.19.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

[tool.black]
line-length = 100
target-version = ['py311']

[tool.ruff]
line-length = 100
select = ["E", "F", "I", "N", "W", "B", "C90", "D", "UP"]
ignore = ["D203", "D213"]

[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### **Install Dependencies with Poetry**
```bash
# Install all dependencies
poetry install

# Add a new dependency
poetry add langchain-anthropic  # Example

# Install dev dependencies only
poetry install --only dev

# Update dependencies
poetry update

# Export requirements.txt (for Docker)
poetry export -f requirements.txt --output requirements.txt --without-hashes
```

### **Docker Configuration (Optimized for Poetry)**
```dockerfile
# Multi-stage build for smaller image
FROM python:3.11-slim as builder

WORKDIR /app
ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

RUN pip install poetry==1.7.1

COPY pyproject.toml poetry.lock ./
RUN --mount=type=cache,target=$POETRY_CACHE_DIR poetry install --without dev --no-root

FROM python:3.11-slim as runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

WORKDIR /app
COPY ./app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### **Main FastAPI Application Structure**
```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

from app.config import get_settings, Settings
from app.api.v1 import chat, mcp, health
from app.core.auth import verify_jwt_token
from app.core.middleware import (
    RequestIdMiddleware,
    LoggingMiddleware,
    RateLimitMiddleware
)

logger = structlog.get_logger()

# Global clients
mongo_client = None
redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    settings = get_settings()
    
    # Startup
    global mongo_client, redis_client
    
    # Connect to MongoDB (existing database)
    mongo_client = AsyncIOMotorClient(settings.mongodb_url)
    app.state.db = mongo_client[settings.mongodb_database]
    logger.info("Connected to MongoDB")
    
    # Connect to Redis
    redis_client = redis.from_url(settings.redis_url)
    app.state.redis = redis_client
    logger.info("Connected to Redis")
    
    yield
    
    # Shutdown
    mongo_client.close()
    await redis_client.close()
    logger.info("Closed database connections")

app = FastAPI(
    title="AI Coach Service",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if get_settings().debug else None,
    redoc_url="/redoc" if get_settings().debug else None,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5001"],  # Add production URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Middleware
app.add_middleware(RequestIdMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)

# Include routers
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(chat.router, prefix="/api/v1/ai/chat", tags=["chat"])
app.include_router(mcp.router, prefix="/api/v1/ai/mcp", tags=["mcp"])

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "request_id": request.state.request_id}
    )
```

### **.env.example Configuration**
```bash
# API Configuration
API_TITLE="AI Coach Service"
API_VERSION="1.0.0"
DEBUG=false

# MongoDB (use existing database)
MONGODB_URL="mongodb+srv://username:password@cluster.mongodb.net/"
MONGODB_DATABASE="ripped-potato"

# Redis (use Redis Cloud free tier or local)
REDIS_URL="redis://localhost:6379"
REDIS_TTL=3600

# AI Models (required)
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-3.5-turbo"  # Start with cheaper model

# Optional AI Services
ANTHROPIC_API_KEY=""  # Optional
COHERE_API_KEY=""  # Optional for reranking

# Vector Database (optional - can use MongoDB Atlas Search instead)
PINECONE_API_KEY=""  # Optional
PINECONE_ENVIRONMENT=""  # Optional

# Security (must match Node.js backend)
JWT_SECRET_KEY="your-existing-jwt-secret"
JWT_ALGORITHM="HS256"
JWT_EXPIRATION_HOURS=24

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=3600

# Observability (optional)
ENABLE_TRACING=false
JAEGER_ENDPOINT=""
```

---

## 🤝 Team Requirements

### **Roles Needed**
- **Python Developer**: Core service development
- **ML Engineer**: Model optimization, RAG tuning
- **DevOps Engineer**: Deployment, monitoring
- **Data Scientist**: Analytics, personalization algorithms

### **Skills Required**
- FastAPI/async Python
- LLM prompt engineering
- Vector database experience
- Distributed systems knowledge
- MLOps best practices

---

## 📅 Timeline Summary

**Total Duration**: 12 weeks

### Priority-Driven Phases:
- **Week 1**: Quick Foundation & Replace Node.js AI
- **Week 2**: Core AI Agents (Read & Suggest)
- **Weeks 3-4**: Database Interaction & CRUD Operations
- **Weeks 5-6**: Multi-Agent System Development
- **Weeks 7-8**: Memory & Personalization
- **Weeks 9-10**: RAG Implementation (After collecting data)
- **Weeks 11-12**: Production Optimization & Scale

### Key Milestones:
- **Week 1**: Node.js AI replaced ✅
- **Week 2**: Basic AI working with UI ✅
- **Week 4**: AI can write to database ✅
- **Week 6**: **MVP Ready** - Full AI coach functionality
- **Week 10**: **Full Feature Set** - RAG-enhanced
- **Week 12**: **Production Ready** - Scaled & optimized