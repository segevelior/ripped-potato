# Prewarm and Streaming Implementation Guide

## Overview
This guide provides a complete implementation blueprint for adding prewarm functionality and token/reasoning streaming to a chatbot service. The implementation includes:

1. **Prewarm Endpoint**: Initialize AI agents before first use for instant response times
2. **Token Streaming**: Real-time token-by-token response streaming using Server-Sent Events (SSE)
3. **Reasoning Streaming**: Optional display of agent's internal reasoning process
4. **Singleton Pattern**: Efficient agent reuse across requests

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Implementation Steps](#implementation-steps)
- [Testing](#testing)
- [Frontend Integration](#frontend-integration)
- [Performance Optimization](#performance-optimization)

## Architecture Overview

### Component Relationships
```
┌─────────────────┐
│   FastAPI App   │
├─────────────────┤
│  /prewarm       │ ──► Initializes GraphCompiler Singleton
│  /ask_stream    │ ──► Uses GraphCompiler + StreamService
└─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ GraphCompiler   │────►│ LangGraph Agents │
│  (Singleton)    │     └──────────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ StreamService   │────►│ Memory Services  │
│ (Event Handler) │     │ (Redis/MongoDB)  │
└─────────────────┘     └──────────────────┘
```

### Key Design Patterns
1. **Singleton Pattern**: GraphCompiler uses singleton to ensure only one agent instance exists
2. **Dependency Injection**: FastAPI's Depends() for agent instance management
3. **Event Streaming**: SSE for real-time token delivery
4. **Configurable Streaming**: Support for different event types (L1 tokens, L2 reasoning)

## Core Components

### 1. Endpoint Implementation (`app/api/v1/endpoints/ask_stream.py`)

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Any

from app.models.base_models import QuestionRequest
from app.graph.builder import GraphCompiler, get_agent
from app.core import logger
from app.core.context import get_alteco_context
from app.services.stream_service import StreamService

router = APIRouter()


@router.get("/prewarm")
async def prewarm_agent(agent: GraphCompiler = Depends(get_agent)):
    """
    Pre-warm the agent to initialize connections and models.
    Call this when the chat UI opens to ensure fast first response.

    Returns:
        Status indicating if agent is ready
    """
    logger.info("Pre-warm request received")

    # Just accessing the agent triggers initialization if needed
    is_ready = agent._initialized
    agent_id = id(agent)

    logger.info(f"Agent pre-warm complete - Ready: {is_ready}, ID: {agent_id}")

    return {
        "status": "ready" if is_ready else "initializing",
        "agent_id": agent_id,
        "initialized": is_ready
    }


@router.post("/ask_stream")
async def ask_question(
    request: QuestionRequest,
    http_request: Request,
    agent: GraphCompiler = Depends(get_agent),
) -> Any:
    """
    Ask a question about the products using the LangGraph agent.
    Supports both streaming and non-streaming modes via x-stream header.

    Headers:
        x-stream: "true" for streaming mode, "false" or absent for non-streaming

    Returns:
        StreamingResponse for streaming mode, QuestionResponse for non-streaming
    """
    logger.info(f"Received request body: {request}")
    logger.info(f"Request headers: {dict(http_request.headers)}")

    try:
        # Extract context from headers
        context = get_alteco_context(http_request)

        # Check if streaming is requested (default: false for easier terminal reading)
        stream_flag = http_request.headers.get("x-stream", "false").lower() == "true"

        # Initialize stream service with configured event types
        # Level 1 (L1) - Token streaming only (default)
        # stream_service = StreamService(allowed_event_types=["token"])

        # Level 2 (L2) - Full agent reasoning (includes tools, thinking, agent events)
        # stream_service = StreamService(allowed_event_types=["token", "tool_start", "tool_end", "agent_start", "thinking"])

        # Current configuration: Token-only streaming
        stream_service = StreamService(allowed_event_types=["token"])

        # Process the question
        response = await stream_service.process_question(
            request=request,
            context=context,
            agent=agent,
            stream_mode=stream_flag
        )

        # Return appropriate response type
        if stream_flag:
            return StreamingResponse(response, media_type="text/event-stream")
        else:
            return response  # QuestionResponse object

    except Exception as e:
        logger.error(f"Error in ask_stream endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

### 2. GraphCompiler Singleton (`app/graph/builder.py`)

```python
from langgraph.graph import StateGraph
from app.graph.agents import Manager
from app.core import logger
from app.graph.router import AGENT_REGISTRY
from app.graph.state import AgentState
import time


class GraphCompiler:
    _instance = None
    _creation_count = 0

    def __new__(cls):
        if cls._instance is None:
            cls._creation_count += 1
            logger.info(f"Creating NEW GraphCompiler instance (#{cls._creation_count})")
            cls._instance = super(GraphCompiler, cls).__new__(cls)
            cls._instance._initialized = False
            logger.info(f"GraphCompiler instance created at memory address: {id(cls._instance)}")
        else:
            logger.debug(f"Reusing existing GraphCompiler instance at: {id(cls._instance)}")
        return cls._instance

    def __init__(self):
        if self._initialized:
            self.logger.debug(f"GraphCompiler already initialized, skipping init (instance: {id(self)})")
            return

        self.logger = logger
        start_time = time.time()
        self.logger.info(f"Starting GraphCompiler initialization (instance: {id(self)})")
        self.logger.info("Compiling agent graph...")
        self.agent_app = self.compile_full_graph()
        self.conversation_history = []
        self._initialized = True
        elapsed_time = time.time() - start_time
        self.logger.info(f"GraphCompiler initialization completed in {elapsed_time:.2f} seconds")

    @staticmethod
    def compile_full_graph():
        logger.info(f"Starting graph compilation with {len(AGENT_REGISTRY)} agents")
        full_graph = StateGraph(AgentState)

        for name, AgentClass in AGENT_REGISTRY.items():
            logger.info(f"Creating agent instance: {name}")
            agent_start = time.time()
            agent = AgentClass()
            agent_time = time.time() - agent_start
            logger.info(f"Agent {name} created in {agent_time:.2f} seconds")

            subgraph = agent.subgraph()
            full_graph.add_node(name, subgraph)
            logger.debug(f"Added {name} subgraph to full graph")

        full_graph.set_entry_point(Manager.__name__)
        logger.info(f"Set entry point to: {Manager.__name__}")

        logger.info("Compiling final graph...")
        compiled_graph = full_graph.compile()
        logger.info("Graph compilation complete")
        return compiled_graph


def get_agent():
    """FastAPI dependency that returns the singleton GraphCompiler instance"""
    return GraphCompiler()
```

### 3. StreamService Implementation (`app/services/stream_service.py`)

```python
from typing import Any, AsyncGenerator, Optional, List, TYPE_CHECKING
from langchain_core.messages import HumanMessage, AIMessage
import json
import traceback

from app.models.base_models import QuestionRequest, QuestionResponse
from app.core import logger
from app.services.memory_service import ConversationMemory

if TYPE_CHECKING:
    from app.graph.builder import GraphCompiler


class StreamService:
    """Service for handling streaming and non-streaming chat responses."""

    def __init__(self, allowed_event_types: Optional[List[str]] = None):
        """
        Initialize StreamService with configurable event types.

        Args:
            allowed_event_types: List of event types to stream. Defaults to ["token"]
                Available types: ["token", "tool_start", "tool_end", "agent_start", "thinking"]
        """
        self.allowed_event_types = allowed_event_types or ["token"]

    async def process_question(
        self,
        request: QuestionRequest,
        context: Any,
        agent: "GraphCompiler",
        stream_mode: bool = False
    ) -> Any:
        """
        Process a question with optional streaming.

        Args:
            request: The question request
            context: Context with user information
            agent: The GraphCompiler agent
            stream_mode: Whether to stream the response

        Returns:
            AsyncGenerator for streaming mode, QuestionResponse for non-streaming
        """
        import time
        request_start_time = time.time()

        try:
            # Essential logging at info level
            logger.info(
                f"[REQUEST START] Question received - Conversation: {request.conversation_id}, "
                f"User: {context.user_id}, Streaming: {stream_mode}",
                extra={"conversation_id": request.conversation_id, "user_id": context.user_id}
            )
            logger.info(f"GraphCompiler instance being used: {id(agent)}")

            if not context.tenant_id:
                logger.warning("No tenant ID provided in headers")

            # Retrieve conversation history from Redis
            memory = ConversationMemory(conversation_id=request.conversation_id)
            conversation_history = memory.get_conversation()

            # Add the new message to the conversation
            messages = conversation_history + [HumanMessage(content=request.question)]

            state = {
                "messages": messages,
                "metadata": {
                    "conversation_id": request.conversation_id,
                    "user_id": context.user_id,
                    "user_name": context.user_name,
                    "user_email": context.user_email,
                    "tenant_id": context.tenant_id,
                    "tenant_ids": context.tenant_ids,
                    "customer_id": context.customer_id,
                    "role": context.role,
                    "is_alteco": context.is_alteco,
                    "log_id": context.log_id,
                    "user_systems": context.user_systems,
                    "groups": context.groups,
                    "charge_points": context.charge_points,
                    "storage": context.storage,
                },
                "tool_history": [],
                "error_count": 0,
                "memory": [],
            }
            logger.info(f"Initialized agent state: {state}")

            # Check if streaming is enabled and requested
            if stream_mode:
                logger.info(f"Starting streaming response for conversation {request.conversation_id}")
                return self._generate_stream(state, agent, memory, request, request_start_time)
            else:
                # Non-streaming mode - keep original logic
                logger.info("Starting agent execution (non-streaming)")
                execution_start = time.time()
                result = await agent.agent_app.ainvoke(state)
                execution_time = time.time() - execution_start
                logger.info(f"Agent execution completed in {execution_time:.2f} seconds")
                logger.debug(f"Agent execution completed with result: {result}")

                # Extract the last AIMessage content
                answer = self._extract_answer_from_result(result, request.conversation_id)

                logger.info(f"Answer generated for conversation {request.conversation_id}")
                memory.store_conversation(request.question, answer, context=state["metadata"])

                total_time = time.time() - request_start_time
                logger.info(f"[REQUEST COMPLETE] Total request time: {total_time:.2f} seconds")

                return QuestionResponse(answer=answer, conversation_id=request.conversation_id)

        except Exception as e:
            logger.error(
                f"Error processing question for conversation {request.conversation_id}: {str(e)}"
            )
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise Exception(f"Error processing question: {str(e)}")

    async def _generate_stream(
        self,
        state: dict,
        agent: "GraphCompiler",
        memory: ConversationMemory,
        request: QuestionRequest,
        start_time: float
    ) -> AsyncGenerator:
        """
        Generate streaming response with both L1 (tokens) and L2 (reasoning) events.

        Event Types:
        - token: Individual text tokens from the AI response
        - tool_start: When an agent starts using a tool
        - tool_end: When an agent finishes using a tool
        - agent_start: When a new agent begins processing
        - thinking: Agent reasoning/processing indicators

        Args:
            state: The agent state
            agent: The GraphCompiler agent
            memory: ConversationMemory instance
            request: The question request
            start_time: Request start timestamp

        Yields:
            SSE formatted events
        """
        accumulated_answer = []

        try:
            async for event in agent.agent_app.astream_events(state, version="v2"):
                event_type = event["event"]
                event_name = event.get("name", "")
                event_data = event.get("data", {})

                # Handle token streaming (L1)
                if event_type == "on_chat_model_stream" and "token" in self.allowed_event_types:
                    chunk_data = event_data.get("chunk")
                    if chunk_data and hasattr(chunk_data, 'content'):
                        text = self._extract_text_from_content(chunk_data.content)
                        if text:
                            accumulated_answer.append(text)
                            yield self._format_sse({'type': 'token', 'content': text})

                # Handle tool events (L2)
                elif event_type == "on_tool_start" and "tool_start" in self.allowed_event_types:
                    yield self._format_sse({
                        'type': 'tool_start',
                        'tool': event_name,
                        'input': str(event_data.get("input", ""))[:100]
                    })

                elif event_type == "on_tool_end" and "tool_end" in self.allowed_event_types:
                    yield self._format_sse({
                        'type': 'tool_end',
                        'tool': event_name,
                        'result': str(event_data.get("output", ""))[:200]
                    })

                # Handle agent events (L2)
                elif event_type == "on_chain_start" and "agent_start" in self.allowed_event_types:
                    # Filter out noisy chains
                    noisy_chains = ["RunnableSequence", "ChannelWrite", "ChannelRead",
                                    "RunnablePassthrough", "RunnableLambda", "RunnableParallel"]
                    if event_name and event_name not in noisy_chains:
                        yield self._format_sse({'type': 'agent_start', 'agent': event_name})

                # Handle thinking/reasoning events (L2)
                elif event_type == "on_llm_start" and "thinking" in self.allowed_event_types:
                    # Skip ChatBedrockConverse events to reduce noise
                    if "ChatBedrockConverse" not in str(event_name):
                        yield self._format_sse({'type': 'thinking', 'message': 'Agent is processing...'})

            # Handle completion
            answer = "".join(accumulated_answer) or "I apologize, but I couldn't generate a response."
            if not accumulated_answer:
                logger.warning(f"No content streamed for conversation {request.conversation_id}")

            memory.store_conversation(request.question, answer, context=state["metadata"])
            logger.info(f"Streamed answer stored for conversation {request.conversation_id}")

            import time
            total_time = time.time() - start_time
            logger.info(f"[REQUEST COMPLETE] Streaming completed in {total_time:.2f} seconds")

            yield self._format_sse({'type': 'complete'})

        except Exception as e:
            logger.error(f"Streaming error for conversation {request.conversation_id}: {str(e)}")
            yield self._format_sse({'type': 'error', 'message': str(e)})

    def _format_sse(self, data: dict) -> str:
        """Format data as Server-Sent Event."""
        return f"data: {json.dumps(data)}\n\n"

    def _extract_text_from_content(self, content: Any) -> Optional[str]:
        """Extract text from various content formats."""
        if isinstance(content, str):
            return content
        elif isinstance(content, list) and content:
            first_item = content[0]
            if isinstance(first_item, dict) and 'text' in first_item:
                return first_item.get('text', '')
            return str(first_item) if first_item else ''
        return None

    def _extract_answer_from_result(self, result: dict, conversation_id: str) -> str:
        """
        Extract answer from agent result.

        Args:
            result: The agent result
            conversation_id: The conversation ID for logging

        Returns:
            Extracted answer string
        """
        answer = None
        message_types = [type(msg).__name__ for msg in result["messages"]]
        logger.debug(f"Message types in result: {message_types}")

        for message in reversed(result["messages"]):
            if isinstance(message, AIMessage):
                # Handle both string content and structured content (list of blocks)
                if isinstance(message.content, str):
                    answer = message.content
                elif isinstance(message.content, list):
                    # Extract text from content blocks
                    text_parts = []
                    for block in message.content:
                        if isinstance(block, dict) and block.get('type') == 'text':
                            text_parts.append(block.get('text', ''))
                        elif isinstance(block, str):
                            text_parts.append(block)
                    answer = '\n'.join(text_parts) if text_parts else None
                else:
                    answer = str(message.content)
                break

        if answer is None:
            answer = "I apologize, but I couldn't generate a response."
            logger.warning(f"No AIMessage found in conversation {conversation_id}")

        return answer
```

### 4. Request/Response Models (`app/models/base_models.py`)

```python
from typing import Optional
from pydantic import BaseModel


class QuestionRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None  # UUID for conversation tracking


class QuestionResponse(BaseModel):
    answer: str
    conversation_id: Optional[str] = None  # Return conversation ID in response
```

### 5. Context Extraction (`app/core/context.py`)

```python
from dataclasses import dataclass
from typing import Optional, List
from fastapi import Request
import json
import base64
import uuid
from app.core import logger

@dataclass
class AltecoContext:
    """Context object containing user and tenant information extracted from headers."""

    site_id: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    tenant_id: Optional[str] = None
    tenant_ids: Optional[str] = None
    customer_id: Optional[str] = None
    role: Optional[str] = None
    log_id: str = ""
    user_systems: Optional[List[str]] = None
    groups: Optional[List[str]] = None
    charge_points: Optional[List[str]] = None
    storage: Optional[List[str]] = None
    access_token: Optional[str] = None
    is_alteco: bool = False


def extract_alteco_context(request: Request) -> AltecoContext:
    """Extract context from request headers."""
    headers = request.headers

    # Helper function to get header with multiple possible names
    def get_header(names):
        for name in names:
            # Check both with and without x- prefix
            value = headers.get(name)
            if value:
                return value
            # Also check with x- prefix
            x_prefixed = f"x-{name}"
            value = headers.get(x_prefixed)
            if value:
                return value
        return None

    # Generate or use provided log ID
    log_id = get_header(["alteco-log-id", "ALTECO_LOG_ID", "alteco_log_id"]) or str(
        uuid.uuid4()
    )

    # Decode base64 user name if present
    user_name = None
    raw_user_name = get_header(
        ["alteco-user-name", "ALTECO_USER_NAME", "alteco_user_name"]
    )
    if raw_user_name:
        try:
            user_name = base64.b64decode(raw_user_name).decode()
        except Exception:
            user_name = raw_user_name

    # Parse JSON arrays if present
    user_systems = None
    raw_user_systems = get_header(
        ["alteco-user-systems", "ALTECO_USER_SYSTEMS", "alteco_user_systems"]
    )
    if raw_user_systems:
        try:
            user_systems = json.loads(raw_user_systems)
        except Exception:
            user_systems = None

    # Similar parsing for groups, charge_points, storage...

    # Determine if user is superAdmin
    role = get_header(["alteco-user-role", "ALTECO_USER_ROLE", "alteco_user_role"])
    is_alteco = role == "superAdmin"

    return AltecoContext(
        site_id=get_header(["alteco-site-id", "ALTECO_SITE_ID", "alteco_site_id"]),
        user_id=get_header(["alteco-user-id", "ALTECO_USER_ID", "alteco_user_id"]),
        user_name=user_name,
        user_email=get_header(["alteco-user-email", "ALTECO_USER_EMAIL", "alteco_user_email"]),
        tenant_id=get_header(["alteco-user-tenant-id", "ALTECO_USER_TENANT_ID", "alteco_user_tenant_id"]),
        tenant_ids=get_header(["alteco-user-tenant-ids", "ALTECO_USER_TENANT_IDS", "alteco_user_tenant_ids"]),
        customer_id=get_header(["alteco-user-customer-id", "ALTECO_USER_CUSTOMER_ID", "alteco_user_customer_id"]),
        role=role,
        log_id=log_id,
        user_systems=user_systems,
        groups=groups,
        charge_points=charge_points,
        storage=storage,
        access_token=get_header(["alteco-access-token", "ALTECO_ACCESS_TOKEN", "alteco_access_token"]),
        is_alteco=is_alteco,
    )


def get_alteco_context(request: Request) -> AltecoContext:
    """FastAPI dependency to get context from request headers."""
    logger.info(f"Extracting context from request headers: {request.headers}")
    alteco_context = extract_alteco_context(request)
    logger.info(f"Context extracted: {alteco_context}")
    return alteco_context
```

### 6. Router Configuration (`app/api/v1/api.py`)

```python
from app.api.v1.endpoints import ask_stream
from app.core.config import settings
from fastapi import APIRouter

api_router = APIRouter(prefix=settings.API_V1_STR)

chatbot_router = APIRouter(prefix="/chatbot")

# Include the ask_stream router with prewarm and ask_stream endpoints
chatbot_router.include_router(ask_stream.router, tags=["streaming"])

api_router.include_router(chatbot_router)
```

## Implementation Steps

### Step 1: Set Up Dependencies

```toml
# pyproject.toml or requirements.txt
fastapi = "^0.104.1"
uvicorn = "^0.24.0"
langchain = "^0.1.0"
langgraph = "^0.0.20"
redis = "^5.0.0"
pymongo = "^4.5.0"
pydantic = "^2.5.0"
```

### Step 2: Environment Configuration

```env
# .env file
PROJECT_NAME="Chatbot Service"
VERSION="1.0.0"
API_V1_STR="/api/v1"

# AWS Settings (for Bedrock LLM)
AWS_ACCESS_KEY=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-west-1

# Redis Settings (for conversation memory)
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# MongoDB Settings (for long-term storage)
MONGO_URI=mongodb://localhost:27017
MONGO_DB=chatbot
CHATBOT_MEMORY_COLLECTION=conversations
```

### Step 3: Create Directory Structure

```
app/
├── api/
│   └── v1/
│       ├── api.py
│       └── endpoints/
│           └── ask_stream.py
├── core/
│   ├── config.py
│   ├── context.py
│   └── logger.py
├── graph/
│   ├── builder.py
│   ├── agents.py
│   ├── router.py
│   └── state.py
├── models/
│   └── base_models.py
├── services/
│   ├── stream_service.py
│   └── memory_service.py
├── connectors/
│   ├── redis_client.py
│   └── mongo_client.py
└── main.py
```

### Step 4: Implement Core Files

Follow the code examples above for each component.

### Step 5: Memory Service Implementation

```python
# app/services/memory_service.py
import json
from typing import Union, Optional
from langchain_core.messages import AIMessage, HumanMessage

from app.connectors import RedisClient
from app.connectors import MongoConnector
from app.core import settings, logger


class ConversationMemory:
    """Manages conversation history using Redis for short-term and MongoDB for long-term storage."""

    _old_conversation = []

    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        self.redis_key = f"chatbot_{conversation_id}"
        self.redis_client = RedisClient()
        self.mongo_client = MongoConnector(settings.CHATBOT_MEMORY_COLLECTION)

    def store_conversation(self, query: str, answer: str, context: dict = None):
        """Store conversation in both Redis and MongoDB."""
        self._old_conversation.extend([f"HumanMessage: {query}", f"AIMessage: {answer}"])
        context["query"] = query
        context["answer"] = answer
        logger.info("Storing conversation in Redis", extra=context)
        serialized = json.dumps(self._old_conversation)
        self.redis_client.set(self.redis_key, serialized)

    def get_conversation(self):
        """Retrieve conversation history from Redis."""
        old_conversation = self.redis_client.get(self.redis_key)
        if not old_conversation:
            return []
        self._old_conversation = old_conversation
        parsed_conversation = self.parse_conversation(old_conversation)
        return parsed_conversation

    def parse_conversation(self, old_conversation):
        """Parse stored conversation into LangChain message objects."""
        if not old_conversation:
            return []
        else:
            return [self._parse_message(message) for message in old_conversation if
                    self._parse_message(message) is not None]

    @staticmethod
    def _parse_message(message) -> Union[HumanMessage, AIMessage, None]:
        """Parse individual message string into message object."""
        message_type, message_content = message.split("Message: ", 1)
        if message_type == "Human":
            return HumanMessage(content=message_content.strip())
        elif message_type == "AI":
            return AIMessage(content=message_content.strip())
        else:
            return None
```

## Testing

### Test Prewarm Endpoint

```bash
# Test pre-warm
curl -X GET "http://localhost:8000/api/v1/chatbot/prewarm"

# Expected response:
# {
#   "status": "ready",
#   "agent_id": 6050759632,
#   "initialized": true
# }
```

### Test Non-Streaming Question

```bash
curl -X POST "http://localhost:8000/api/v1/chatbot/ask_stream" \
  -H "Content-Type: application/json" \
  -H "x-stream: false" \
  -d '{"question": "What is solar energy?", "conversation_id": "test-123"}'
```

### Test Streaming Question (Token-Only)

```bash
curl -N -X POST "http://localhost:8000/api/v1/chatbot/ask_stream" \
  -H "Content-Type: application/json" \
  -H "x-stream: true" \
  -d '{"question": "How does CAPEX calculation work?", "conversation_id": "test-456"}'
```

## Frontend Integration

### React/TypeScript Example

```typescript
// hooks/useChat.ts
import { useEffect, useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'agent_start' | 'thinking' | 'complete' | 'error';
  content?: string;
  tool?: string;
  agent?: string;
  message?: string;
  input?: string;
  result?: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId] = useState(`user-${Date.now()}`);

  // Prewarm on mount
  useEffect(() => {
    fetch('/api/v1/chatbot/prewarm')
      .then(res => res.json())
      .then(data => {
        console.log('Chat agent ready:', data);
      });
  }, []);

  const sendMessage = useCallback(async (question: string) => {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsStreaming(true);

    // Create empty assistant message
    const assistantMessageIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/v1/chatbot/ask_stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-stream': 'true'
        },
        body: JSON.stringify({
          question,
          conversation_id: conversationId
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6);
            if (eventData.trim()) {
              try {
                const event: StreamEvent = JSON.parse(eventData);

                // Handle different event types
                switch (event.type) {
                  case 'token':
                    // Append token to assistant message
                    setMessages(prev => {
                      const newMessages = [...prev];
                      newMessages[assistantMessageIndex].content += event.content || '';
                      return newMessages;
                    });
                    break;

                  case 'tool_start':
                    console.log(`Tool started: ${event.tool}`);
                    break;

                  case 'tool_end':
                    console.log(`Tool finished: ${event.tool}`);
                    break;

                  case 'agent_start':
                    console.log(`Agent started: ${event.agent}`);
                    break;

                  case 'thinking':
                    console.log('Agent is thinking...');
                    break;

                  case 'complete':
                    setIsStreaming(false);
                    break;

                  case 'error':
                    console.error('Stream error:', event.message);
                    setIsStreaming(false);
                    break;
                }
              } catch (e) {
                console.error('Error parsing SSE event:', e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsStreaming(false);
    }
  }, [messages, conversationId]);

  return {
    messages,
    sendMessage,
    isStreaming,
    conversationId
  };
};
```

### Vue.js Example

```vue
<template>
  <div class="chat-container">
    <div class="messages">
      <div v-for="msg in messages" :key="msg.id" :class="msg.role">
        {{ msg.content }}
      </div>
    </div>
    <input
      v-model="input"
      @keyup.enter="sendMessage"
      :disabled="isStreaming"
      placeholder="Type your message..."
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const messages = ref([]);
const input = ref('');
const isStreaming = ref(false);
const conversationId = `user-${Date.now()}`;

// Prewarm on mount
onMounted(async () => {
  const response = await fetch('/api/v1/chatbot/prewarm');
  const data = await response.json();
  console.log('Chat agent ready:', data);
});

const sendMessage = async () => {
  if (!input.value.trim()) return;

  const question = input.value;
  input.value = '';

  // Add user message
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: question
  });

  // Add empty assistant message
  const assistantMsg = {
    id: Date.now() + 1,
    role: 'assistant',
    content: ''
  };
  messages.value.push(assistantMsg);

  isStreaming.value = true;

  try {
    const response = await fetch('/api/v1/chatbot/ask_stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-stream': 'true'
      },
      body: JSON.stringify({
        question,
        conversation_id: conversationId
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const eventData = line.slice(6).trim();
          if (eventData) {
            try {
              const event = JSON.parse(eventData);

              if (event.type === 'token') {
                assistantMsg.content += event.content || '';
              } else if (event.type === 'complete') {
                isStreaming.value = false;
              } else if (event.type === 'error') {
                console.error('Stream error:', event.message);
                isStreaming.value = false;
              }
            } catch (e) {
              console.error('Error parsing event:', e);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
    isStreaming.value = false;
  }
};
</script>
```

## Performance Optimization

### 1. Singleton Pattern Benefits
- **First initialization**: ~8 seconds (loads models, compiles graph)
- **Subsequent requests**: <100ms overhead
- **Memory efficiency**: Single instance shared across all requests

### 2. Prewarm Strategy
- Call prewarm when:
  - Application starts
  - Chat UI component mounts
  - After periods of inactivity (>5 minutes)
  - Before high-traffic periods

### 3. Streaming Configuration

```python
# Level 1 (L1) - Best for production, minimal overhead
stream_service = StreamService(allowed_event_types=["token"])

# Level 2 (L2) - Debugging/development, shows agent reasoning
stream_service = StreamService(
    allowed_event_types=["token", "tool_start", "tool_end", "agent_start", "thinking"]
)

# Custom - Show only specific events
stream_service = StreamService(allowed_event_types=["token", "tool_start", "tool_end"])
```

### 4. Caching Strategies
- **Redis**: Short-term conversation memory (TTL: 1 hour)
- **MongoDB**: Long-term conversation storage
- **In-memory**: GraphCompiler singleton

### 5. Error Handling Best Practices

```python
# Graceful degradation for streaming
try:
    async for event in stream:
        # Process event
        pass
except Exception as e:
    # Log error but continue
    yield self._format_sse({'type': 'error', 'message': str(e)})
    # Optionally fall back to non-streaming response
```

## Monitoring and Debugging

### 1. Key Metrics to Track
- Prewarm initialization time
- Time to first token (TTFT)
- Total streaming duration
- Agent instance reuse count
- Memory cache hit rate

### 2. Logging Configuration

```python
# Essential logs at INFO level
logger.info(f"[REQUEST START] Conversation: {id}, Streaming: {mode}")
logger.info(f"[REQUEST COMPLETE] Time: {duration}s")

# Debug logs for development
logger.debug(f"Agent state: {state}")
logger.debug(f"Stream event: {event}")
```

### 3. Health Check Endpoint

```python
@router.get("/health")
async def health_check(agent: GraphCompiler = Depends(get_agent)):
    """Check if the service and agent are healthy."""
    return {
        "status": "healthy",
        "agent_initialized": agent._initialized,
        "agent_id": id(agent),
        "timestamp": datetime.utcnow().isoformat()
    }
```

## Troubleshooting

### Common Issues and Solutions

1. **Slow first response after deployment**
   - Solution: Call prewarm endpoint during deployment
   - Add health check that includes prewarm

2. **Memory leaks with long-running service**
   - Solution: Implement connection pooling for Redis/MongoDB
   - Set appropriate TTLs for cached data

3. **Streaming connection drops**
   - Solution: Implement client-side reconnection logic
   - Add heartbeat events in SSE stream

4. **Agent not reusing singleton**
   - Check FastAPI dependency injection configuration
   - Ensure get_agent() is properly imported

## Security Considerations

1. **Authentication/Authorization**
   - Add authentication middleware
   - Validate user context from headers
   - Implement rate limiting

2. **Input Validation**
   - Sanitize user questions
   - Limit question length
   - Validate conversation IDs

3. **Data Privacy**
   - Encrypt conversation data in Redis/MongoDB
   - Implement data retention policies
   - Add user consent tracking

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Redis and MongoDB connections verified
- [ ] AWS credentials for Bedrock configured
- [ ] Prewarm endpoint called on startup
- [ ] Health check endpoint implemented
- [ ] Logging configured appropriately
- [ ] CORS settings configured for frontend
- [ ] SSL/TLS configured for production
- [ ] Rate limiting implemented
- [ ] Monitoring/alerting set up

## Conclusion

This implementation provides a production-ready chatbot service with:
- **Instant responses** through prewarm functionality
- **Real-time streaming** for better user experience
- **Flexible configuration** for different streaming levels
- **Efficient resource usage** with singleton pattern
- **Comprehensive error handling** and logging
- **Scalable architecture** with proper separation of concerns

The system is designed to be maintainable, performant, and easily extensible for future enhancements.