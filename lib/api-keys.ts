/**
 * API Key Management Utility
 * 
 * Stores user-provided API keys in localStorage for use with
 * features that require their own API keys (when not granted permission).
 */

const STORAGE_KEY = 'value-graph-api-keys';

export interface UserApiKeys {
  geminiApiKey?: string;
  claudeApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Get all stored API keys
 */
export function getStoredApiKeys(): UserApiKeys {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading API keys from localStorage:', error);
    return {};
  }
}

/**
 * Save API keys to localStorage
 */
export function saveApiKeys(keys: UserApiKeys): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Only store non-empty keys
    const filtered: UserApiKeys = {};
    if (keys.geminiApiKey?.trim()) filtered.geminiApiKey = keys.geminiApiKey.trim();
    if (keys.claudeApiKey?.trim()) filtered.claudeApiKey = keys.claudeApiKey.trim();
    if (keys.openaiApiKey?.trim()) filtered.openaiApiKey = keys.openaiApiKey.trim();
    
    if (Object.keys(filtered).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (error) {
    console.error('Error saving API keys to localStorage:', error);
  }
}

/**
 * Clear all stored API keys
 */
export function clearApiKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if a specific API key is available
 */
export function hasApiKey(keyType: keyof UserApiKeys): boolean {
  const keys = getStoredApiKeys();
  return !!keys[keyType]?.trim();
}

/**
 * Get a specific API key
 */
export function getApiKey(keyType: keyof UserApiKeys): string | undefined {
  const keys = getStoredApiKeys();
  return keys[keyType];
}

/**
 * Check if user can use a feature that requires API keys
 * Returns true if user has permission OR has provided their own key
 */
export function canUseFeature(
  hasPermission: boolean, 
  requiredKeyType: keyof UserApiKeys
): boolean {
  return hasPermission || hasApiKey(requiredKeyType);
}
