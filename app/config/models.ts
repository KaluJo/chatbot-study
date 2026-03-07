/**
 * Centralized model configuration
 * All AI model names should be imported from here
 * 
 * Override via environment variables:
 * - GEMINI_MODEL (fast model for bulk operations)
 * - GEMINI_MODEL_PRO (high-quality model for complex tasks)
 * - CLAUDE_MODEL (primary chat model)
 * - OPENAI_EMBEDDING_MODEL (embedding model)
 */

// Gemini models - use env vars with sensible defaults
// Model codes from https://ai.google.dev/gemini-api/docs/models
//
// Current defaults (what this app actually uses):
//   - GEMINI_FLASH: gemini-2.5-flash (fast model for bulk operations)
//   - GEMINI_PRO: gemini-2.5-pro (high-quality model for complex tasks)
//
// Other available models you can set via env vars:
//   - gemini-2.5-flash-lite (fastest, most cost-efficient)
//   - gemini-2.0-flash (deprecated, shutdown March 2026)
//   - gemini-3-flash-preview, gemini-3-pro-preview (preview/experimental)
export const GEMINI_FLASH = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GEMINI_PRO = process.env.GEMINI_MODEL_PRO || "gemini-2.5-pro";

// Claude models - use env vars with sensible defaults  
// Available: claude-sonnet-4-20250514, claude-3-5-sonnet-20241022,
//            claude-3-opus-20240229, claude-3-haiku-20240307
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// OpenAI models
// Available: text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
