import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

// --- Core Data Types (Representing Processed/Aggregated Backend Output) ---

export interface ContextDefinition {
  id: string; // UUID from database
  name: string; // e.g., "Work", "Leisure"
  description: string;
}

// Represents a node in the processed graph data structure
export interface GraphNode extends SimulationNodeDatum {
  id: string; // Unique ID for D3 (e.g., context-Work, topic-Leisure-Travel, item-People-Family-Mom)
  type: 'context' | 'topic' | 'valueItem';
  label: string; // Display name (e.g., "Work", "Travel", "Mom Bday")
  
  // Database IDs
  uuid?: string; // Database UUID for the underlying entity (Topic.id, Item.id, Context.id)
  dbId?: string; // Database primary key ID of the specific instance (ValueNode.id, Item.id, Context.id)

  // Linking / Identification
  contextId?: string; // ID of the context this belongs to (for topics and items)
  contextName?: string; // Name of the context (for display)
  topicId?: string; // For item nodes: ID of the parent topic GraphNode. For topic nodes: ID of the canonical Topic.
  canonicalItemUUID?: string; // For valueItems: References the Item.id from the database.

  // Data Payload
  score?: number; // Aggregated sentiment score (-7 to +7), primarily for topics
  reasoning?: string; // LLM reasoning for score or topic creation
  occurrenceCount?: number; // Global occurrence count for canonical items / specific count for topic-item pairing
  conversationUUIDs?: string[]; // Array of UUIDs referencing conversations relevant to this node
  // valueItemUUIDs?: string[]; // DEPRECATED: For Topic nodes: array of CanonicalItem UUIDs they connect to
  item_ids?: string[]; // Temporary, to hold item_ids from value_node before transformation if needed
  color?: string; // Calculated color (e.g., based on score or type)
  radius?: number; // Calculated radius (e.g., based on score, occurrences, or type)

  // D3 Simulation properties (optional, D3 adds these)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;

  // Positioning hints for items around topics
  initialAngle?: number;
  initialRadius?: number;
}

// Represents a link in the processed graph data structure
export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string; // ID of the source GraphNode
  target: string; // ID of the target GraphNode
  value?: number; // Optional value for link strength/distance calculation
  type?: 'context-topic' | 'topic-item'; // For styling or specific logic
}

// The main data structure passed to the Visualization component
export interface GraphData {
  contexts: ContextDefinition[]; // List of available contexts
  nodes: GraphNode[];           // Combined list of ALL graph nodes (contexts, topics, items)
  links: GraphLink[];           // Combined list of ALL graph links (context-topic, topic-item)
  // items: CanonicalItem[];    // DEPRECATED: Replaced by item nodes in the main `nodes` array
}

// Canonical items from database (might still be used for fetching, but not directly in GraphData.items)
export interface CanonicalItem {
  id?: string; // Database primary key ID (this is the item.id from DB)
  uuid: string; // Usually same as id for items from DB
  name: string;
  globalOccurrenceCount?: number; 
  conversationUUIDs?: string[]; // All conversations mentioning this canonical item
  embedding?: number[]; // Vector embedding (not used in visualization)
}

// Database model interfaces (as provided)
export interface Topic {
  id: string;
  label: string;
  related_labels?: string[];
  reasoning?: string;
  embedding?: number[];
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ValueNode {
  id: string;
  // uuid: string; // value_nodes table does not have a uuid field, it has id which is uuid
  topic_id: string;
  context_id: string;
  context_name?: string; // This seems to be a denormalized field, usually fetched via context_id
  score: number;
  reasoning?: string;
  chat_ids: string[];
  item_ids: string[]; // This is key for linking items
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseItem {
  id: string; // This is the primary key for items table (uuid type)
  // uuid: string; // items table does not have a separate uuid field, its id is the uuid
  name: string;
  chat_ids: string[];
  embedding?: number[];
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Supporting Types (May still be needed for Modals etc.) ---

export interface Conversation {
  uuid: string;
  llm_message: string;
  human_message: string;
  timestamp: string;
  sessionId?: string;
  reasoning?: string;
  score?: number;
}

// --- Deprecated / Replaced Types ---
// Original Topic, Connection, TopicConnection, ValueItem are replaced by the aggregated GraphNode/GraphLink structure.
// Removing old definitions:
// export interface Connection { ... }
// export interface Topic { ... }
// export interface Context { ... } // Replaced by ContextDefinition
// export interface SimulationNode extends SimulationNodeDatum { ... } // Replaced by GraphNode
// export interface SimulationLink { ... } // Replaced by GraphLink
// export interface TopicConnection { ... }
// export interface ValueItem { ... } 