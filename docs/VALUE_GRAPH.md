# Value Graph Documentation

The value graph system extracts, processes, and visualizes personal values from conversational data using LLM-powered analysis.

## Overview

The value graph transforms raw chat conversations into a structured representation of user values:

```
Chat Messages → Windows → Extraction → Processing → Value Nodes → Visualization
```

## Concepts

### Topic

A subject or theme extracted from conversations that relates to user values.

**Properties**:
- `label`: Primary identifier (e.g., "work-life balance")
- `related_labels`: Alternative labels merged into this topic
- `embedding`: Vector representation for similarity search
- `reasoning`: AI-generated explanation

### Context

A life domain that categorizes topics:

| Context | Description |
|---------|-------------|
| Work | Professional life, career, job-related topics |
| Leisure | Hobbies, entertainment, relaxation activities |
| Culture | Arts, traditions, cultural practices and beliefs |
| Education | Learning, academic pursuits, skill development |
| People | Relationships, family, friends, social connections |
| Lifestyle | Daily habits, health, living arrangements |

### Value Node

A topic-context pair with a sentiment score:

**Properties**:
- `topic_id`: Reference to the topic
- `context_id`: Reference to the context
- `score`: Sentiment from -7 (negative) to +7 (positive)
- `reasoning`: AI explanation of the score
- `chat_ids`: Conversation evidence
- `item_ids`: Related items

### Item

A specific entity mentioned in conversations (places, products, people, etc.):

**Properties**:
- `name`: Item identifier
- `chat_ids`: Conversations where mentioned
- `embedding`: Vector for deduplication

## Processing Pipeline

### Step 1: Chat Windowing

**Service**: `app/chat/services/chatlog-service.ts`

Conversations are grouped into sliding windows:
- Window size: 4 message pairs
- Stride: 3 message pairs
- Time threshold: 5 minutes between messages

```typescript
generateChatWindows(userId): Promise<ChatWindow[]>
```

### Step 2: Potential Extraction

**Service**: `app/synthesis/services/gemini-potential-client.ts`

Gemini analyzes each window to extract:
- Potential topics (explicit and implicit)
- Potential contexts (life domains)
- Potential items (concrete entities)

```typescript
analyzeConversationWindow(window): Promise<{
  topics: string[],
  contexts: string[],
  items: string[]
}>
```

### Step 3: Topic Processing

**Service**: `app/synthesis/services/graph-service.ts`

Topics are filtered and deduplicated:

1. **Narrowing**: Reduce to 1-2 high-confidence topics
2. **Similarity Check**: Find similar existing topics
3. **Decision**: CREATE_NEW, MERGE_WITH_EXISTING, or DISCARD
4. **Normalization**: Clean labels (lowercase, remove slashes)

**Thresholds**:
- Confidence threshold: 0.75
- Similarity threshold: 0.6

### Step 4: Reasoning Generation

**Service**: `app/synthesis/services/graph-service.ts`

For each topic-context pair, Gemini generates:
- Sentiment score (-7 to +7)
- Confidence (0-1)
- Evidence (message snippets)
- Reasoning text

Only pairs with confidence ≥ 0.75 and non-zero sentiment are kept.

### Step 5: Value Node Creation

**Service**: `app/synthesis/services/graph-service.ts`

Create or update value nodes:
- Check for existing topic-context pair
- If exists: merge scores (weighted average)
- If new: create with initial score
- Link relevant items

### Step 6: Item Association

**Service**: `app/synthesis/services/item-service.ts`

Items are:
- Extracted from conversations
- Checked for relevance to topics
- Deduplicated via embedding similarity
- Linked to value nodes

## Services Reference

### graph-service.ts

Main orchestration service:

```typescript
// Process a single window
processWindowForValueGraph(windowId): Promise<ProcessingResult>

// Key internal functions
narrowTopics(potentialTopics): Promise<NarrowedTopic[]>
processTopics(topics): Promise<ProcessedTopic[]>
generateReasoning(topic, context, chatData): Promise<Reasoning>
```

### embedding-service.ts

Vector embedding operations:

```typescript
// Generate embedding
generateEmbedding(text): Promise<number[]>

// Find similar topics
findSimilarTopics(embedding, threshold, limit, userId): Promise<SimilarTopic[]>

// Find similar items
findSimilarItems(embedding, threshold, limit, userId): Promise<SimilarItem[]>

// Store embeddings
storeTopicEmbedding(topicId, embedding): Promise<void>
storeItemEmbedding(itemId, embedding): Promise<void>
```

**Model**: OpenAI `text-embedding-3-small` (1536 dimensions)

**Fallback**: Text-based similarity if OpenAI not configured

### database-service.ts

Database operations:

```typescript
// Update window status
updateWindowSynthesisStatus(windowId, synthesized): Promise<void>

// Get windows for processing
getWindowsForSynthesis(userId): Promise<ChatWindow[]>

// Normalize labels
normalizeExistingTopicLabels(userId): Promise<void>

// Merge duplicate topics
mergeTopics(sourceId, targetId): Promise<void>
```

### gemini-potential-client.ts

LLM-based extraction:

```typescript
// Analyze window
analyzeConversationWindow(chatData): Promise<PotentialExtraction>

// Extract topics
generatePotentialTopics(humanMessages): Promise<string[]>

// Extract contexts
generatePotentialContexts(humanMessages): Promise<string[]>

// Extract items
generatePotentialItems(humanMessages): Promise<string[]>
```

### item-service.ts

Item management:

```typescript
// Extract items from text
extractSpecificItems(conversationText): Promise<string[]>

// Process and deduplicate
processItem(name, chatIds, userId): Promise<Item>

// Link to value node
associateItemsWithValueNode(nodeId, itemIds): Promise<void>
```

## Visualization

### Graph Component

**Location**: `components/visualization/Graph.tsx`

D3.js force-directed graph with:
- Many-body charge force (-500)
- Link force (distance 100px)
- Collision detection
- Custom orbital positioning

### Node Rendering

**Context Nodes**:
- Shape: Circle (radius 40px)
- Color: Gray (#e9e9e9)
- Fixed positions in outer ring

**Topic Nodes**:
- Shape: Rounded rectangle
- Color: Score-based (red negative → green positive)
- Size: Scales with absolute score
- Position: Orbits around context

**Item Nodes**:
- Shape: Small rounded rectangle
- Color: Blue shades (by occurrence count)
- Size: Scales with occurrences
- Position: Orbits around topic

### Interactions

- **Pan & Zoom**: Mouse/trackpad
- **Drag**: Move nodes
- **Click Topic**: Show detail modal with evidence
- **Click Item**: Highlight related nodes
- **Controls**: Zoom buttons, fullscreen, refresh

## Database Schema

### topics

```sql
CREATE TABLE topics (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES value_graph_users(id),
  label TEXT NOT NULL,
  related_labels TEXT[],
  embedding VECTOR(1536),
  reasoning TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### contexts

```sql
CREATE TABLE contexts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID, -- NULL for default contexts
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### value_nodes

```sql
CREATE TABLE value_nodes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES value_graph_users(id),
  topic_id UUID REFERENCES topics(id),
  context_id UUID REFERENCES contexts(id),
  score INTEGER CHECK (score >= -7 AND score <= 7),
  reasoning TEXT,
  chat_ids UUID[],
  item_ids UUID[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(topic_id, context_id)
);
```

### items

```sql
CREATE TABLE items (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES value_graph_users(id),
  name TEXT NOT NULL,
  chat_ids UUID[],
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Configuration

### Environment Variables

```bash
# Required for extraction
GEMINI_API_KEY=...
GEMINI_MODEL_PRO=gemini-2.5-pro

# Optional for embeddings
OPENAI_API_KEY=...
```

### Thresholds

In `app/synthesis/services/graph-service.ts`:

```typescript
const CONFIDENCE_THRESHOLD = 0.75;
const SIMILARITY_THRESHOLD = 0.6;
const MAX_TOPICS_PER_WINDOW = 2;
```

## Customization

### Adding New Contexts

1. Add to database:
```sql
INSERT INTO contexts (name, description)
VALUES ('Health', 'Physical and mental wellbeing');
```

2. Update `setup/database.sql` for new installations

### Modifying Extraction Prompts

Edit `app/synthesis/services/gemini-potential-client.ts`:

```typescript
const extractionPrompt = `
  Your custom extraction instructions...
`;
```

### Changing Visualization Colors

Edit `contexts/VisualizationContext.tsx`:

```typescript
function getTopicColor(score: number): string {
  // Modify color mapping
}

function getItemColor(occurrenceCount: number): string {
  // Modify color mapping
}
```

### Adjusting Graph Physics

Edit `components/visualization/Graph.tsx`:

```typescript
const simulation = d3.forceSimulation(nodes)
  .force('charge', d3.forceManyBody().strength(-500))  // Adjust
  .force('link', d3.forceLink().distance(100))         // Adjust
  .force('collision', d3.forceCollide().radius(...));  // Adjust
```

## Troubleshooting

### No Topics Extracted

- Check Gemini API key is valid
- Verify chat messages have content
- Review extraction prompts
- Check `thinking_logs` table for errors

### Duplicate Topics

- Run "Normalize Topic Labels" in admin
- Check similarity threshold (lower = more merging)
- Manually merge via SQL if needed

### Missing Embeddings

- Verify OpenAI API key (optional)
- System falls back to text similarity
- Check network connectivity

### Graph Not Rendering

- Verify user has value nodes
- Check browser console for D3 errors
- Ensure contexts exist in database

### Slow Processing

- Reduce batch size
- Check API rate limits
- Monitor Supabase connection
- Use retries with exponential backoff
