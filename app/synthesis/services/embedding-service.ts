import { createClient } from '@/utils/supabase/client';

// Model to use for embeddings
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Generate embeddings for a text using OpenAI via API route
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    // Don't generate embeddings for empty or very short text
    if (!text || text.trim().length < 3) {
      console.warn('Text too short for embedding generation');
      return null;
    }

    // Call server API route instead of direct OpenAI call
    const response = await fetch('/api/openai/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        model: EMBEDDING_MODEL,
      }),
    });

    // 503 = not configured, use fallback
    if (response.status === 503) {
      console.warn('OpenAI not configured, using mock embeddings');
      return generateMockEmbedding(text);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return generateMockEmbedding(text); // Fallback to mock embedding on error
  }
}

/**
 * Check if embeddings are available (OpenAI configured)
 * Returns true if real embeddings can be generated
 */
export async function isEmbeddingsAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/openai/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });
    return response.ok; // 200 = configured, 503 = not configured
  } catch {
    return false;
  }
}

/**
 * Generate a mock embedding when OpenAI is not available
 * This is a very simplified hash-based approach
 */
function generateMockEmbedding(text: string): number[] {
  const normalizedText = text.trim().toLowerCase();
  
  // Use a simple hashing function to create a seed
  let hash = 0;
  for (let i = 0; i < normalizedText.length; i++) {
    hash = ((hash << 5) - hash) + normalizedText.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  
  // Use the hash as a seed for a pseudorandom generator
  const seededRandom = (seed: number) => {
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  };
  
  const random = seededRandom(hash);
  
  // Generate 1536 dimensions with seeded randomness
  return Array(1536).fill(0).map(() => (random() * 2 - 1) * 0.3);
}

/**
 * Find similar topics in the database using vector similarity search
 */
export async function findSimilarTopics(
  label: string,
  userId: string,
  similarityThreshold: number = 0.7,
  maxResults: number = 5
): Promise<{ id: string; label: string; similarity: number; related_labels: string[] }[] | null> {
  console.log(`[Embedding] Starting similarity search for: "${label}" (userId: ${userId})`);
  try {
    // Generate embedding for the label
    console.log(`[Embedding] Generating embedding for label: "${label}"`);
    const embedding = await generateEmbedding(label);
    
    if (!embedding) {
      console.warn('[Embedding] Could not generate embedding for topic search');
      return null;
    }
    console.log(`[Embedding] Successfully generated embedding with ${embedding.length} dimensions`);
    
    // Check if we're using real embeddings or fallback
    const usingRealEmbeddings = await isEmbeddingsAvailable();
    
    if (!usingRealEmbeddings) {
      console.log('[Embedding] OpenAI API not configured, using text-based similarity fallback');
      return findSimilarTopicsTextBased(label, userId, similarityThreshold, maxResults);
    }
    
    // Call the Supabase function for vector similarity search
    console.log(`[Embedding] Calling Supabase RPC function 'find_similar_topics' with threshold ${similarityThreshold}`);
    const supabase = createClient();
    
    const { data, error } = await supabase.rpc('find_similar_topics', {
      search_embedding: embedding,
      similarity_threshold: similarityThreshold,
      max_results: maxResults,
      user_id_param: userId
    });
    
    if (error) {
      console.error('[Embedding] Error finding similar topics:', error);
      console.log('[Embedding] Falling back to text-based similarity search');
      return findSimilarTopicsTextBased(label, userId, similarityThreshold, maxResults);
    }
    
    console.log(`[Embedding] Vector search found ${data?.length || 0} similar topics`);
    if (data && data.length > 0) {
      data.forEach((item: { id: string; label: string; similarity: number }, i: number) => {
        console.log(`[Embedding] Result ${i+1}: "${item.label}" (id: ${item.id}) with similarity ${item.similarity.toFixed(3)}`);
      });
    }
    
    return data;
  } catch (error) {
    console.error('[Embedding] Error in similar topics search:', error);
    console.log('[Embedding] Falling back to text-based similarity search due to error');
    return findSimilarTopicsTextBased(label, userId, similarityThreshold, maxResults);
  }
}

/**
 * Fallback method using text-based similarity when vector search is not available
 */
async function findSimilarTopicsTextBased(
  label: string,
  userId: string,
  similarityThreshold: number = 0.7,
  maxResults: number = 5
): Promise<{ id: string; label: string; similarity: number; related_labels: string[] }[] | null> {
  console.log(`[Embedding] Using text-based similarity for: "${label}" (userId: ${userId})`);
  try {
    const supabase = createClient();
    
    const { data: userTopics, error } = await supabase
      .from('topics')
      .select('id, label, related_labels')
      .eq('user_id', userId);
      
    if (error) {
      console.error('[Embedding] Error fetching user topics:', error);
      return null;
    }
    
    console.log(`[Embedding] Retrieved ${userTopics?.length || 0} topics for text-based comparison`);
    
    if (!userTopics || userTopics.length === 0) {
      console.log('[Embedding] No existing topics found for text similarity');
      return [];
    }
    
    // Simple text similarity with semantic enhancement
    const similarTopics = userTopics.map(topic => {
      let similarity = 0;
      const topicLabel = topic.label.toLowerCase().trim();
      const searchLabel = label.toLowerCase().trim();
      
      // Exact match
      if (topicLabel === searchLabel) {
        similarity = 1.0;
      } 
      // Contains relationship
      else if (topicLabel.includes(searchLabel) || searchLabel.includes(topicLabel)) {
        similarity = 0.85;
      }
      // Common prefix for compound terms
      else if (topicLabel.includes(' ') && searchLabel.includes(' ')) {
        const topicWords = topicLabel.split(/\s+/);
        const searchWords = searchLabel.split(/\s+/);
        
        if (topicWords[0] === searchWords[0]) {
          const topicSet = new Set<string>(topicWords);
          const searchSet = new Set<string>(searchWords);
          const intersection = new Set<string>(Array.from(topicSet).filter(x => searchSet.has(x)));
          const union = new Set<string>([...Array.from(topicSet), ...Array.from(searchSet)]);
          
          similarity = 0.7 + (intersection.size / union.size) * 0.2;
        }
      }
      // Word overlap comparison
      else {
        const topicWords = new Set<string>(topicLabel.split(/\s+/));
        const searchWords = new Set<string>(searchLabel.split(/\s+/));
        
        if (topicWords.size > 0 && searchWords.size > 0) {
          const intersection = new Set<string>(Array.from(topicWords).filter(x => searchWords.has(x)));
          const union = new Set<string>([...Array.from(topicWords), ...Array.from(searchWords)]);
          
          if (intersection.size > 0) {
            similarity = 0.6 + ((intersection.size / union.size) * 0.3);
          }
        }
      }
      
      // Check related labels
      if (similarity < similarityThreshold && topic.related_labels && Array.isArray(topic.related_labels)) {
        for (const relLabel of topic.related_labels) {
          const relatedSim = calculateSimilarity(relLabel.toLowerCase(), searchLabel);
          if (relatedSim > similarity) {
            similarity = relatedSim;
            break;
          }
        }
      }
      
      return {
        id: topic.id,
        label: topic.label,
        similarity,
        related_labels: topic.related_labels || []
      };
    })
    .filter(topic => topic.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
    
    console.log(`[Embedding] Text-based similarity found ${similarTopics.length} topics above threshold`);
    
    return similarTopics;
  } catch (error) {
    console.error('[Embedding] Error in text-based topic search:', error);
    return null;
  }
}

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();
  
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;
  
  if (a.includes(' ') && b.includes(' ')) {
    const aWords = a.split(/\s+/);
    const bWords = b.split(/\s+/);
    
    if (aWords[0] === bWords[0]) {
      const aSet = new Set<string>(aWords);
      const bSet = new Set<string>(bWords);
      const intersection = new Set<string>(Array.from(aSet).filter(x => bSet.has(x)));
      const union = new Set<string>([...Array.from(aSet), ...Array.from(bSet)]);
      
      return 0.7 + (intersection.size / union.size) * 0.2;
    }
  }
  
  const aWords = new Set<string>(a.split(/\s+/));
  const bWords = new Set<string>(b.split(/\s+/));
  
  if (aWords.size > 0 && bWords.size > 0) {
    const intersection = new Set<string>(Array.from(aWords).filter(x => bWords.has(x)));
    const union = new Set<string>([...Array.from(aWords), ...Array.from(bWords)]);
    
    if (intersection.size > 0) {
      return 0.6 + ((intersection.size / union.size) * 0.3);
    }
  }
  
  return 0.0;
}

/**
 * Store embedding for a topic in the database
 */
export async function storeTopicEmbedding(topicId: string, label: string): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(label);
    
    if (!embedding) {
      console.warn('Could not generate embedding for topic storage');
      return false;
    }
    
    const usingRealEmbeddings = await isEmbeddingsAvailable();
    
    if (!usingRealEmbeddings) {
      console.warn('Skipping embedding storage as OpenAI API key is not configured');
      return true;
    }
    
    const supabase = createClient();
    const { error } = await supabase.rpc('update_topic_with_embedding', {
      topic_id: topicId,
      embedding_vector: embedding
    });
    
    if (error) {
      console.error('Error storing topic embedding:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in storing topic embedding:', error);
    return false;
  }
}

/**
 * Store embedding for an item
 */
export async function storeItemEmbedding(itemId: string, name: string): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(name);
    
    if (!embedding) {
      console.warn('Could not generate embedding for item storage');
      return false;
    }
    
    const usingRealEmbeddings = await isEmbeddingsAvailable();
    
    if (!usingRealEmbeddings) {
      console.warn('Skipping embedding storage as OpenAI API key is not configured');
      return true;
    }
    
    const supabase = createClient();
    const { error } = await supabase
      .from('items')
      .update({ embedding })
      .eq('id', itemId);
    
    if (error) {
      console.error('Error storing item embedding:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in storing item embedding:', error);
    return false;
  }
}
