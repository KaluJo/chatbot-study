# Chat System Documentation

The chat system implements "Day", a human-like conversational AI companion that serves as the data collection mechanism for studying human-AI value alignment and agency.

## Overview

Day is designed to engage users in natural, casual conversation over extended periods (days to weeks). The system:

- Uses Anthropic Claude for generating responses
- Employs Google Gemini for personalized conversation strategies
- Logs all conversations for later analysis
- Supports multiple concurrent users with session isolation

## Architecture

```
User Input
    │
    ▼
┌────────────────────┐
│   ChatInterface    │
│   (React Client)   │
└─────────┬──────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌────────┐  ┌──────────────────┐
│ Backup │  │ Strategy Service │
│ Save   │  │   (Gemini)       │
└────────┘  └────────┬─────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Claude Service │
            │ (with strategy)│
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │   Supabase     │
            │   (chatlog)    │
            └────────────────┘
```

## Key Components

### ChatInterface (`components/chat/ChatInterface.tsx`)

The main chat UI component that handles:

- Session management (UUID-based session IDs)
- Message state (user and AI messages)
- Time-of-day awareness for contextual greetings
- Session timer (5-minute minimum)
- Auto-save and backup mechanisms
- Feedback collection after sessions

### Claude Service (`app/chat/services/claude-service.ts`)

Handles communication with the Anthropic Claude API:

```typescript
// Key functions
getClaudeInitialGreeting(timeOfDay, strategy): Promise<string>
getClaudeResponse(messages, strategy, isFirstMessage, timeOfDay): Promise<string>
```

**Chatbot Persona Configuration:**

The chatbot name is configurable via environment variable:

```bash
NEXT_PUBLIC_CHATBOT_NAME=Day  # Default: "Day"
```

The system prompt establishes Day's persona:
- Presents as a casual friend, not an AI
- Has a "body" (can eat, sleep, feel)
- Matches user's language
- Can get bored and change topics
- Keeps responses to 1-3 sentences

### Strategy Service (`app/chat/services/strategy-service.ts`)

Generates personalized conversation strategies using Gemini:

```typescript
interface ConversationStrategy {
  insights: Array<{pattern: string, approach: string}>;
  shared_memories: Array<{
    what_happened: string,
    when_it_happened: string,
    how_to_reference: string,
    memory_type: string
  }>;
  user_profile: string;
  conversation_goals: string[];
}
```

**Strategy Types:**

The system supports two distinct conversation strategies based on the CHI 2026 paper "Does My Chatbot Have an Agenda?":

1. **Vertical (Depth)**: Pre-programmed motive to persistently explore topics in depth
   - Maintains focus despite deflection attempts
   - Asks probing follow-up questions: "How did that make you feel?" "What made you decide that?"
   - Tries to capture nuance and discover more about subjects mentioned
   - When users give short answers, pushes for more: "C'mon, that's it? Tell me more."
   - Gently brings conversation back: "Wait, but going back to what you said about..."
   - **User perception**: Participants described this as "pushy" and "persistent"

2. **Horizontal (Breadth)**: Pre-programmed motive to follow user cues and prioritize variety
   - Switches topics spontaneously when things feel stale
   - Gets "bored" and says so: "Okay I'm kinda bored talking about this. What else is going on?"
   - Has intrinsic motivation to "want to learn new things" about the human
   - Follows user's lead readily when they hint at new topics
   - Keeps it light - doesn't push hard on any one topic
   - **User perception**: Participants experienced this as "spontaneous" with "a mind of its own"

**Strategy Implementation:**

Both strategies are implemented at two levels:
1. **Strategy Service** (Gemini): Generates personalized strategy data (insights, memories, goals)
2. **Claude Service**: Applies behavioral rules that determine HOW Day converses

**Changing Strategy Type:**

1. Go to Admin Dashboard
2. Find the user in the table
3. Click the Strategy button (purple = Vertical, teal = Horizontal)
4. The change takes effect on the user's next chat session

You can also set the initial strategy when creating a new user.

**Research Note:** These strategies enable comparative analysis of how different AI motivations influence conversational dynamics, user satisfaction, and perceived control - key questions explored in the agency paper.

### Chatlog Service (`app/chat/services/chatlog-service.ts`)

Manages all database operations for chat:

```typescript
// Key functions
saveChatSession(userId, messages, sessionId): Promise<void>
saveIndividualMessage(userId, humanMsg, llmMsg, sessionId): Promise<void>
saveToBackupTable(sessionId, userId, humanMsg, llmMsg): Promise<void>
getLatestUserSessionTimestamp(userId): Promise<Date | null>
generateChatWindows(userId): Promise<ChatWindow[]>
```

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_CLAUDE_MODEL=claude-sonnet-4-20250514

# Required for strategy generation
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# Optional customization
NEXT_PUBLIC_CHATBOT_NAME=Day
NEXT_PUBLIC_SESSION_COOLDOWN_MS=3600000  # 1 hour
NEXT_PUBLIC_MIN_SESSION_MINUTES=5
```

### Session Cooldown

By default, users must wait 1 hour between chat sessions. This encourages longitudinal data collection rather than single long sessions.

To modify, change the cooldown check in `app/chat/page.tsx`:

```typescript
const COOLDOWN_PERIOD = parseInt(
  process.env.NEXT_PUBLIC_SESSION_COOLDOWN_MS || '3600000'
);
```

## Database Tables

### chatlog

Main table for chat messages:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| session_id | UUID | Groups messages into sessions |
| human_message | TEXT | User's message |
| llm_message | TEXT | AI's response |
| timestamp | TIMESTAMPTZ | When message was sent |
| potential_topics | TEXT[] | Extracted topics (post-analysis) |
| potential_contexts | TEXT[] | Extracted contexts (post-analysis) |
| potential_items | TEXT[] | Extracted items (post-analysis) |

### chat_backup

Failsafe backup table (RLS disabled):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | Session identifier |
| user_id | UUID | User identifier |
| human_message | TEXT | User's message |
| llm_message | TEXT | AI's response |
| original_timestamp | TIMESTAMPTZ | Original send time |
| backup_timestamp | TIMESTAMPTZ | When backup was created |

### conversation_strategies

Stores AI-generated strategies:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to users |
| session_id | UUID | Session identifier |
| strategy_data | JSONB | Full strategy object |
| time_of_day | TEXT | morning/afternoon/evening/night |

### chat_feedback

User feedback after sessions:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| user_id | UUID | Foreign key to users |
| session_id | UUID | Session identifier |
| rating | INTEGER | 1-5 rating |
| feedback_text | TEXT | Optional text feedback |

## Customization Guide

### Modifying the Chatbot Persona

Edit `app/chat/services/claude-service.ts`:

```typescript
let systemPrompt = `Your name is ${CHATBOT_NAME}. A friend in conversation...`;
```

Key persona elements to customize:
- Name and identity
- Communication style
- Topics of interest
- Boundaries and limitations

### Changing Conversation Strategies

Edit `app/chat/services/strategy-service.ts`:

The strategy generation prompt can be modified to change how Day approaches conversations. Key parameters:

- `insights`: Communication patterns to follow
- `shared_memories`: Things to reference from past conversations
- `user_profile`: User characteristics
- `conversation_goals`: What to achieve in the conversation

### Adding New Time-of-Day Behaviors

Modify the time-specific prompts in both Claude and Strategy services:

```typescript
switch (timeOfDay) {
  case 'morning':
    timeSpecificPrompt = `morning greeting...`;
    break;
  // Add custom time periods
  case 'late_night':
    timeSpecificPrompt = `late night greeting...`;
    break;
}
```

## Data Export

Chat data can be exported via the Admin Dashboard:

1. Go to Admin → Dashboard
2. Find the user in the user list
3. Click "Export Chats"
4. Download JSON file

Export format:

```json
{
  "sessions": {
    "session-uuid-1": [
      {
        "human_message": "...",
        "llm_message": "...",
        "timestamp": "..."
      }
    ]
  }
}
```

## Troubleshooting

### Chat Not Responding

1. Check browser console for API errors
2. Verify `ANTHROPIC_API_KEY` is set
3. Check Anthropic console for rate limits

### Strategy Generation Fails

1. Verify `GEMINI_API_KEY` is set
2. Check Google AI Studio for quotas
3. Strategy will fall back to basic mode if Gemini fails

### Messages Not Saving

1. Check Supabase connection
2. Verify user is authenticated
3. Check `chat_backup` table for failsafe saves
4. Review browser console for errors
