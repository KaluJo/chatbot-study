'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Visualization } from '@/components/visualization/Visualization';
import { VisualizationProvider } from '@/contexts/VisualizationContext';

interface ValuesGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export function ValuesGraphModal({ isOpen, onClose, userId }: ValuesGraphModalProps) {
  // Defer mounting heavy visualization content until modal is visible
  const [shouldRenderContent, setShouldRenderContent] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Use requestAnimationFrame to let the modal render first before mounting heavy content
      const frame = requestAnimationFrame(() => {
        // Add small delay to ensure modal is painted
        const timeout = setTimeout(() => {
          setShouldRenderContent(true);
        }, 100);
        return () => clearTimeout(timeout);
      });
      return () => {
        cancelAnimationFrame(frame);
        document.body.style.overflow = '';
      };
    } else {
      // Unmount content when modal closes to free resources
      setShouldRenderContent(false);
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  // Don't render anything if modal is closed or not mounted on client
  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcg-title"
    >
      <h2 id="tcg-title" className="sr-only">Your Topic-Context Graph</h2>
      
      <div className="flex-1 overflow-hidden min-h-0 p-2">
        {shouldRenderContent ? (
          <VisualizationProvider userId={userId}>
            <Visualization />
          </VisualizationProvider>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-600 border-r-transparent" />
              <p className="mt-2 text-gray-600">Loading your Topic-Context Graph...</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex justify-center p-2 border-t bg-gray-50 flex-shrink-0">
        <Button onClick={onClose} variant="outline" className="w-full max-w-md h-10">
          Close
        </Button>
      </div>
    </div>
  );

  // Use portal to render at document body level
  return createPortal(modalContent, document.body);
} 