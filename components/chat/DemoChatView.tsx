'use client';

import React, { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDemoData, DemoChatlogEntry } from '@/contexts/DemoDataContext';
import { DEMO_SESSION_IDS } from '@/lib/demo';
import { useScrollDirection } from '@/hooks/useScrollDirection';

interface DemoMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

// Sessions where the human sent the first message (Human→LLM order per row)
const HUMAN_FIRST_SESSIONS = new Set([
  'a0857b0f-d375-4785-8410-f0441289a47d', // Chat 3
]);

function buildMessages(entries: DemoChatlogEntry[], sessionId: string): DemoMessage[] {
  const humanFirst = HUMAN_FIRST_SESSIONS.has(sessionId);
  const msgs: DemoMessage[] = [];
  entries.forEach((entry) => {
    const ai   = { id: `${entry.id}-ai`,   text: entry.llm_message,   sender: 'ai'   as const, timestamp: entry.timestamp };
    const human = { id: `${entry.id}-user`, text: entry.human_message, sender: 'user' as const, timestamp: entry.timestamp };
    if (humanFirst) {
      if (entry.human_message) msgs.push(human);
      if (entry.llm_message)   msgs.push(ai);
    } else {
      if (entry.llm_message)   msgs.push(ai);
      if (entry.human_message) msgs.push(human);
    }
  });
  return msgs;
}

function formatSessionDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
}

const SESSION_LABELS = ['Chat 1', 'Chat 2', 'Chat 3', 'Chat 4', 'Chat 5'] as const;

export default function DemoChatView() {
  const demoCtx = useDemoData();
  const getSessionMessages = demoCtx?.getSessionMessages ?? (() => []);
  const [activeIdx, setActiveIdx] = useState(0);
  const pillVisible = useScrollDirection();
  const isFirstMount = useRef(true);

  const sessions = DEMO_SESSION_IDS.map((id, idx) => {
    const entries = getSessionMessages(id);
    const firstTimestamp = entries[0]?.timestamp ?? '';
    return {
      label: SESSION_LABELS[idx],
      date: firstTimestamp ? formatSessionDate(firstTimestamp) : '',
      messages: buildMessages(entries, id),
    };
  });

  const activeSession = sessions[activeIdx];

  // Scroll to top of page when switching sessions (skip on initial mount)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeIdx]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Sticky pill switcher — fades out on scroll down, back in on scroll up */}
      <div className={`sticky top-[63px] z-40 py-2 transition-opacity duration-300 ${pillVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex justify-center">
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 9999, border: '1px solid #e5e7eb', backgroundColor: 'white' }}>
            {SESSION_LABELS.map((label, idx) => (
              <button
                key={label}
                onClick={() => setActiveIdx(idx)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                  activeIdx === idx
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pb-4 pt-4">

        {/* Session header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Example {activeSession.label}
            </p>
            <p className="text-xs text-gray-400/70 mt-0.5">{activeSession.date}</p>
          </div>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="space-y-4 sm:space-y-6 mb-4">
          {activeSession.messages.map((msg, msgIdx) => (
            <div
              key={msg.id}
              className={`relative flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
                    {msgIdx < 2 && (
                <span className={`absolute -top-5 text-xs font-medium text-gray-400 ${msg.sender === 'user' ? 'right-1' : 'left-1'}`}>
                  {msg.sender === 'user' ? 'Human' : 'LLM'}
                </span>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[75%] py-3 px-3 sm:px-4 rounded-xl ${
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-white text-gray-800 mr-auto border border-gray-200'
                }`}
              >
                <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                <p className="text-xs text-right opacity-60 mt-1.5">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer — disabled in demo mode */}
      <div className="sticky bottom-0 z-40 bg-gray-50 border-t border-gray-200 px-3 sm:px-4 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <Input
            type="text"
            value=""
            onChange={() => {}}
            placeholder="Demo mode — messaging is disabled"
            disabled
            className="flex-grow text-base py-6 px-4 h-14 cursor-not-allowed"
          />
          <Button disabled className="h-14 px-6 text-base">
            Send
          </Button>
        </div>
      </div>

    </div>
  );
}
