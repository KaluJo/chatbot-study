'use client'

import React from 'react';
import { VisualizationProvider } from '@/contexts/VisualizationContext';
import { ChatlogProvider } from '@/contexts/ChatlogContext';
import { Visualization } from '@/components/visualization/Visualization';
import { ContextDefinition } from '@/components/visualization/types';

interface VisualizationWrapperProps {
  userId: string;
  initialContexts?: ContextDefinition[];
}

export function VisualizationWrapper({ userId, initialContexts }: VisualizationWrapperProps) {
  return (
    <div className="w-full h-full">
      <ChatlogProvider userId={userId}>
        <VisualizationProvider userId={userId} initialContexts={initialContexts}>
          <Visualization />
        </VisualizationProvider>
      </ChatlogProvider>
    </div>
  );
} 