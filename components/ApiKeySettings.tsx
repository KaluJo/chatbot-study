'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Key, Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react';
import { getStoredApiKeys, saveApiKeys, clearApiKeys, UserApiKeys } from '@/lib/api-keys';

interface ApiKeySettingsProps {
  trigger?: React.ReactNode;
  showGemini?: boolean;
  showClaude?: boolean;
  showOpenAI?: boolean;
  onKeysChanged?: () => void;
}

export function ApiKeySettings({
  trigger,
  showGemini = true,
  showClaude = true,
  showOpenAI = false,
  onKeysChanged,
}: ApiKeySettingsProps) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<UserApiKeys>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  // Load stored keys when dialog opens
  useEffect(() => {
    if (open) {
      setKeys(getStoredApiKeys());
      setSaved(false);
    }
  }, [open]);

  const handleSave = () => {
    saveApiKeys(keys);
    setSaved(true);
    onKeysChanged?.();
    setTimeout(() => {
      setOpen(false);
      setSaved(false);
    }, 1000);
  };

  const handleClear = () => {
    clearApiKeys();
    setKeys({});
    onKeysChanged?.();
  };

  const toggleShowKey = (keyType: string) => {
    setShowKeys(prev => ({ ...prev, [keyType]: !prev[keyType] }));
  };

  const hasAnyKeys = Object.values(keys).some(k => k?.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-gray-100 pb-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">Your API Keys</DialogTitle>
          <DialogDescription className="text-gray-500">
            Provide your own API keys to use advanced features. We recommend adding both keys for the full experience.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {showClaude && (
            <div className="space-y-2 p-3 rounded-lg border border-gray-200 bg-white">
              <Label htmlFor="claude-key" className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Claude API Key</span>
                <a 
                  href="https://console.anthropic.com/settings/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              <div className="relative">
                <Input
                  id="claude-key"
                  type={showKeys.claude ? 'text' : 'password'}
                  placeholder="sk-ant-..."
                  value={keys.claudeApiKey || ''}
                  onChange={(e) => setKeys({ ...keys, claudeApiKey: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey('claude')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showKeys.claude ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Powers the chat conversations with Day
              </p>
              {keys.claudeApiKey?.trim() && (
                <span className="inline-flex items-center text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  ✓ Added
                </span>
              )}
            </div>
          )}

          {showGemini && (
            <div className="space-y-2 p-3 rounded-lg border border-gray-200 bg-white">
              <Label htmlFor="gemini-key" className="flex items-center justify-between">
                <span className="font-medium text-gray-900">Gemini API Key</span>
                <a 
                  href="https://aistudio.google.com/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              <div className="relative">
                <Input
                  id="gemini-key"
                  type={showKeys.gemini ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={keys.geminiApiKey || ''}
                  onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey('gemini')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showKeys.gemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Powers survey generation, value predictions, and persona experiments
              </p>
              {keys.geminiApiKey?.trim() && (
                <span className="inline-flex items-center text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  ✓ Added
                </span>
              )}
            </div>
          )}

          {showOpenAI && (
            <div className="space-y-2 p-3 rounded-lg border border-gray-200 bg-white">
              <Label htmlFor="openai-key" className="flex items-center justify-between">
                <span className="font-medium text-gray-900">OpenAI API Key</span>
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  Get key <ExternalLink className="h-3 w-3" />
                </a>
              </Label>
              <div className="relative">
                <Input
                  id="openai-key"
                  type={showKeys.openai ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={keys.openaiApiKey || ''}
                  onChange={(e) => setKeys({ ...keys, openaiApiKey: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey('openai')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {keys.openaiApiKey?.trim() && (
                <span className="inline-flex items-center text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  ✓ Added
                </span>
              )}
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
            <strong className="text-gray-900">Privacy:</strong> Keys are stored only in your browser and sent directly to AI providers, never to our servers.
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 border-t border-gray-100 pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!hasAnyKeys}
            className="text-pink-600 hover:text-pink-700 hover:bg-pink-50 w-full sm:w-auto"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1 sm:flex-initial">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saved} className="bg-gray-900 hover:bg-gray-800 flex-1 sm:flex-initial">
              {saved ? '✓ Saved!' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
