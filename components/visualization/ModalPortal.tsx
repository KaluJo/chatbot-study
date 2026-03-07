'use client'

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Conversation } from './types';

// Define the structure of the node data needed by the portal
interface PortalNodeData {
  type: 'context' | 'topic' | 'valueItem';
  topicId?: string; // Display label for topic/item
  contextId?: string;
  contextName?: string;
  value?: number; // Score or occurrence count
  reasoning?: string; // LLM reasoning for the score
  dbId?: string; // Database ID for reference
  uuid?: string; // UUID for lookups
  additionalInfo?: string; // For item-specific details like parent topic/occurrence
}

interface ModalPortalProps {
  nodeData: PortalNodeData | null;
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  containerElement?: Element | null;
}

export const ModalPortal: React.FC<ModalPortalProps> = ({ 
  nodeData,
  isOpen, 
  onClose,
  conversations,
  containerElement
}) => {
  // Log props at the very beginning of ModalPortal
  console.log('[ModalPortal] Rendering. isOpen:', isOpen, 'nodeData:', nodeData, 'numConversations:', conversations.length, 'containerElement:', !!containerElement);

  const [isMounted, setIsMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Mount the portal only on the client side
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Prevent click events from propagating to visualization
  const handleClickInside = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle outside clicks
  const handleClickOutside = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isMounted || !isOpen || !nodeData) return null;

  // Create portal content
  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center z-[9999] bg-black bg-opacity-30"
      onClick={handleClickOutside}
    >
      <div 
        ref={modalRef}
        onClick={handleClickInside}
        className="bg-white rounded-lg overflow-auto max-h-[80vh] max-w-[90vw] w-[500px]"
      >
        <div className="sticky top-0 bg-white z-10 border-b border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">{nodeData.topicId || 'Details'}</h2>
            <button 
              className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="mt-1 text-sm text-gray-600">
            <div className="flex justify-between items-center mb-1">
              <div>
                Context: <span className="font-medium">{nodeData.contextName || nodeData.contextId || 'N/A'}</span>
              </div>
              <div>
                {nodeData.type === 'topic' ? 'Score' : 'Occurrences'}: <span 
                  className={`font-bold ${nodeData.value && nodeData.value > 0 ? 'text-green-600' : (nodeData.value && nodeData.value < 0 ? 'text-red-600' : 'text-gray-600')}`}
                >
                  {nodeData.value !== undefined ? nodeData.value : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {nodeData.additionalInfo && (
            <p className="text-xs text-gray-500 mt-1">{nodeData.additionalInfo}</p>
          )}
          
          {/* Add reasoning display with scrollable area */}
          {nodeData.reasoning && (
            <div className="mt-3 p-3 bg-blue-50 rounded-md">
              <h3 className="text-sm font-medium text-blue-700 mb-1">AI Reasoning:</h3>
              <div className="max-h-[150px] overflow-y-auto">
              <p className="text-sm text-blue-800">{nodeData.reasoning}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4">
          <h3 className="font-medium mb-3 text-gray-700">Related Conversations ({conversations.length})</h3>
          
          {conversations.length > 0 ? (
            conversations.map((conv, idx) => (
              <div key={idx} className="bg-gray-50 p-3 rounded-lg mb-3">
                <p className="font-medium text-gray-800 text-sm">Q: {conv.llm_message}</p>
                <p className="text-gray-600 mt-1 text-sm italic">A: {conv.human_message}</p>
                
                {/* Show conversation reasoning if available - make scrollable */}
                {conv.reasoning && (
                  <div className="mt-2 p-2 bg-gray-100 rounded border-l-2 border-blue-400">
                    <div className="max-h-[80px] overflow-y-auto">
                    <p className="text-xs text-gray-700">{conv.reasoning}</p>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-center mt-2">
                  {/* Display conversation score if available */}
                  {conv.score !== undefined && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-200">
                      Score: <span className={`font-medium ${conv.score > 0 ? 'text-green-600' : (conv.score < 0 ? 'text-red-600' : 'text-gray-600')}`}> 
                        {conv.score}
                      </span>
                    </span>
                  )}
                  
                  {/* Display timestamp if available */}
                  {conv.timestamp && (
                    <span className="text-xs text-gray-500">
                      {new Date(conv.timestamp).toLocaleDateString()} {new Date(conv.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 text-sm font-medium mb-1">No related conversations found</p>
              <p className="text-gray-400 text-xs px-8">This topic or item exists in the database but could not be linked to specific conversations.</p>
              <p className="text-gray-400 text-xs mt-2">UUID: {nodeData.uuid}</p>
            </div>
          )}
        </div>
        
        {/* Add a small metadata footer with IDs (useful for debugging) */}
        <div className="text-[10px] text-gray-400 p-2 border-t border-gray-100 text-center">
          ID: {nodeData.dbId || 'N/A'} • UUID: {nodeData.uuid || 'N/A'}
        </div>
      </div>
    </div>
  );

  // Determine the portal target
  const portalTarget = containerElement || (typeof document !== 'undefined' ? document.body : null);

  // Only portal if the target exists
  if (!portalTarget) {
    return null;
  }

  // Create a React portal to render modal outside of the main component tree
  return createPortal(modalContent, portalTarget);
}; 