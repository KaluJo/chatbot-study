export const GEMINI_FLASH = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GEMINI_PRO = process.env.GEMINI_MODEL_PRO || "gemini-2.5-pro";

// Qwen models - added to resolve the import error
// Available models usually include: qwen-turbo, qwen-plus, qwen-max
export const QWEN_MODEL = process.env.QWEN_MODEL || "qwen-plus";
export const QWEN_MODEL_PRO = process.env.QWEN_MODEL_PRO || "qwen-max";

// Claude models - use env vars with sensible defaults  
// Available: claude-sonnet-4-20250514, claude-3-5-sonnet-20241022,
//            claude-3-opus-20240229, claude-3-haiku-20240307
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// OpenAI models
// Available: text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";