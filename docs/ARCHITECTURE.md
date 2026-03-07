# System Architecture

This document provides an overview of the Chatbot Study system architecture, explaining how components interact and data flows through the system.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Browser                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Chat (Day)   │  │   Survey     │  │    Admin     │          │
│  │  Interface   │  │  Interface   │  │  Dashboard   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────┴─────────────────┴─────────────────┴───────┐          │
│  │              React Contexts                       │          │
│  │  (AuthContext, ChatlogContext, VisualizationCtx) │          │
│  └──────────────────────┬────────────────────────────┘          │
└─────────────────────────┼────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Anthropic│   │  Google  │   │  OpenAI  │
    │  Claude  │   │  Gemini  │   │ Embeddings│
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │
         └──────────────┼──────────────┘
                        ▼
              ┌─────────────────┐
              │    Supabase     │
              │  ┌───────────┐  │
              │  │ PostgreSQL│  │
              │  │ + pgvector│  │
              │  └───────────┘  │
              └─────────────────┘
```

## Component Architecture

### Frontend (Next.js App Router)

```
app/
├── chat/                 # Day Chatbot Interface
│   ├── page.tsx          # Main chat page with cooldown logic
│   ├── layout.tsx        # Chat layout wrapper
│   └── services/
│       ├── claude-service.ts      # Anthropic Claude API integration
│       ├── strategy-service.ts    # Conversation strategy generation
│       ├── chatlog-service.ts     # Database operations for chat
│       └── feedback-service.ts    # User feedback handling
│
├── values/               # PVQ-RR Survey System
│   ├── page.tsx          # Multi-stage survey flow
│   └── services/
│       ├── prediction-service.ts          # Batch value predictions
│       ├── individual-prediction-service.ts # Per-question predictions
│       ├── chart-evaluation-service.ts    # Stage 3 chart comparisons
│       ├── chart-generation-service.ts    # Anti-person chart generation
│       └── stage2-service.ts              # Persona embodiment experiment
│
├── agency/               # Agency Interview Probes
│   ├── page.tsx          # Interview probe dashboard
│   └── services/
│       └── speech-pattern-service.ts  # Cross-user speech comparison
│
├── synthesis/            # Value Graph Processing
│   ├── page.tsx          # Synthesis interface
│   ├── value-graph-service.ts     # Main synthesis orchestration
│   └── services/
│       ├── graph-service.ts           # Value graph construction
│       ├── embedding-service.ts       # OpenAI embeddings
│       ├── gemini-potential-client.ts # Topic/context extraction
│       ├── database-service.ts        # Synthesis DB operations
│       └── item-service.ts            # Item extraction and linking
│
└── admin/                # Admin Dashboard
    ├── dashboard/        # User management and stats
    ├── strategies/       # View user conversation strategies
    ├── synthesis/        # Process user conversations
    ├── visualization/    # View user value graphs
    └── user/             # User detail pages
```

### React Contexts

| Context | Purpose | Location |
|---------|---------|----------|
| `AuthContext` | User authentication state, login/logout | `contexts/AuthContext.tsx` |
| `ChatlogContext` | Chat history for visualization | `contexts/ChatlogContext.tsx` |
| `VisualizationContext` | Graph data and selection state | `contexts/VisualizationContext.tsx` |

### Components

```
components/
├── chat/                 # Chat UI components
│   ├── ChatInterface.tsx # Main chat component
│   └── FeedbackModal.tsx # Post-session feedback
│
├── values/               # Survey UI components
│   ├── survey-form.tsx   # PVQ-RR question form
│   ├── value-utils.ts    # Value processing logic
│   ├── Stage0Modal.tsx   # Training introduction
│   ├── Stage2Modal.tsx   # Persona embodiment
│   ├── Stage2Modal.tsx   # Chart evaluation
│   └── visualizations/   # Value chart visualizations
│
├── visualization/        # Value Graph UI
│   ├── Visualization.tsx # Main container
│   ├── Graph.tsx         # D3.js force-directed graph
│   ├── Controls.tsx      # Zoom/fullscreen controls
│   ├── Legend.tsx        # Graph legend
│   └── DetailModal.tsx   # Node detail popup
│
└── ui/                   # Shadcn UI components
```

## Data Flow

### Chat Flow

```
User sends message
        │
        ▼
┌───────────────────┐
│  ChatInterface    │
│  (React Component)│
└────────┬──────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────────┐
│ Backup │ │ Get Strategy │
│ Save   │ │ (Gemini)     │
└────┬───┘ └──────┬───────┘
     │            │
     │    ┌───────┴────────┐
     │    ▼                │
     │ ┌───────────────┐   │
     │ │ Claude API    │   │
     │ │ (with strategy)│   │
     │ └───────┬───────┘   │
     │         │           │
     │         ▼           │
     │  ┌─────────────┐    │
     │  │ Response    │    │
     │  │ Processing  │    │
     │  └──────┬──────┘    │
     │         │           │
     └────┬────┘           │
          ▼                │
   ┌─────────────┐         │
   │  Supabase   │◄────────┘
   │  (chatlog)  │
   └─────────────┘
```

### Value Synthesis Flow

```
Chat Messages (chatlog)
         │
         ▼
┌─────────────────────┐
│ Generate Windows    │
│ (sliding window 4,  │
│  stride 3)          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Extract Potentials  │
│ (Gemini)            │
│ - Topics            │
│ - Contexts          │
│ - Items             │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Process Topics      │
│ - Similarity check  │
│ - Merge/Create      │
│ - Confidence filter │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Generate Reasoning  │
│ (Gemini)            │
│ - Sentiment scores  │
│ - Context mapping   │
│ - Evidence links    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Create Value Nodes  │
│ - Topic + Context   │
│ - Score (-7 to +7)  │
│ - Link items        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Store in Database   │
│ - topics            │
│ - value_nodes       │
│ - items             │
└─────────────────────┘
```

### Survey Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Survey Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Training      Survey: PVQ-RR     Stage 1: Topic-Context    │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │ Schwartz     │ ──▶ │ 57 Questions │ ──▶│ Explore      │  │
│  │ Values Intro │     │ + 3 Custom   │    │ Value Graph  │  │
│  └──────────────┘     └──────────────┘    └──────────────┘  │
│                              │                               │
│                              ▼                               │
│                       ┌──────────────┐                       │
│                       │ Calculate    │                       │
│                       │ MRAT, Center │                       │
│                       │ Scores       │                       │
│                       └──────────────┘                       │
│                              │                               │
│         ┌────────────────────┼────────────────────┐          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │ Stage 2:     │     │ Generate LLM │    │ Stage 3:     │  │
│  │ Persona      │     │ Predictions  │    │ Chart        │  │
│  │ Embodiment   │     │ (Gemini)     │    │ Evaluation   │  │
│  └──────────────┘     └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `value_graph_users` | User accounts with access code auth |
| `chatlog` | All chat messages with session tracking |
| `chat_windows` | Grouped messages for analysis |
| `chat_backup` | Failsafe backup (RLS disabled) |
| `conversation_strategies` | AI-generated strategies per session |

### Value Graph Tables

| Table | Purpose |
|-------|---------|
| `contexts` | Life domains (Work, Leisure, etc.) |
| `topics` | Extracted topics with embeddings |
| `items` | Concrete items mentioned |
| `value_nodes` | Topic-context pairs with scores |

### Survey Tables

| Table | Purpose |
|-------|---------|
| `user_pvq_responses` | Manual PVQ-RR responses |
| `user_llm_individual_responses` | Per-question AI predictions |
| `user_llm_batch_responses` | Batch value predictions |
| `stage3_experiment` | Chart evaluation data |
| `stage2_experiment` | Persona embodiment data |

### Entity Relationships

```
value_graph_users
       │
       ├──▶ chatlog ──▶ chat_windows
       │
       ├──▶ topics ◀─────┐
       │         │       │
       │         ▼       │
       │    value_nodes ◀┴─ contexts
       │         │
       │         ▼
       │      items
       │
       ├──▶ user_pvq_responses
       │
       ├──▶ user_llm_individual_responses
       │
       ├──▶ user_llm_batch_responses
       │
       ├──▶ stage3_experiment
       │
       └──▶ stage2_experiment
```

## External API Integration

### Anthropic Claude

- **Purpose**: Chat responses, greeting generation
- **Model**: `claude-sonnet-4-20250514` (configurable)
- **Integration**: `app/chat/services/claude-service.ts`

### Google Gemini

- **Purpose**: Strategy generation, topic extraction, value analysis
- **Models**: 
  - `gemini-2.5-flash` for fast operations
  - `gemini-2.5-pro` for complex analysis
- **Integration**: Multiple services use `@google/genai` SDK

### OpenAI

- **Purpose**: Text embeddings for similarity search
- **Model**: `text-embedding-3-small` (1536 dimensions)
- **Integration**: `app/synthesis/services/embedding-service.ts`
- **Fallback**: Text-based similarity if not configured

## Security Architecture

### Authentication

- Access code-based authentication (no passwords)
- User context stored in React Context and localStorage
- Database session context for RLS via `set_user_context()` RPC

### Row Level Security (RLS)

- Enabled on all research tables
- Users can only access their own data
- Admins can access all data
- `chat_backup` exempt for failsafe logging

### API Key Exposure

- All `NEXT_PUBLIC_*` variables are exposed to browser
- Acceptable for research/demo purposes
- Production should use server-side routes

## Deployment Architecture

### Recommended Stack

```
┌─────────────────┐
│     Vercel      │
│  (Next.js Host) │
└────────┬────────┘
         │
         ├─────────────────────────────┐
         ▼                             ▼
┌─────────────────┐           ┌─────────────────┐
│    Supabase     │           │   API Services  │
│  (Database +    │           │  - Anthropic    │
│   Auth infra)   │           │  - Google       │
│                 │           │  - OpenAI       │
└─────────────────┘           └─────────────────┘
```

### Environment Variables

See `.env.example` for complete list of required and optional variables.

## Performance Considerations

### Chat System

- Immediate backup saves for message resilience
- 1-hour cooldown between sessions (configurable)
- 5-minute minimum session length
- Strategy caching per session

### Synthesis

- Batch processing with progress tracking
- Confidence thresholds reduce noise (0.75)
- Similarity thresholds prevent duplicates (0.6)
- Retry logic with exponential backoff

### Visualization

- D3.js force simulation for graph layout
- Lazy loading of conversation data
- Portal-based modals for performance
