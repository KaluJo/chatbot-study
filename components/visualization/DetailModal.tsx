'use client'

import React, { useRef, useEffect, useCallback, memo } from 'react';
import { GraphNode, Conversation } from './types';
import { ModalPortal } from './ModalPortal';

interface DetailModalProps {
  node: GraphNode | null;
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  containerElement?: Element | null;
}

// Define the modal as a memoized component to prevent unnecessary re-renders
const DetailModal: React.FC<DetailModalProps> = memo(({ 
  node, 
  isOpen, 
  onClose,
  conversations,
  containerElement
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Log props received by DetailModal
  console.log('[DetailModal] Received Props:', { 
    node, 
    isOpen, 
    numConversations: conversations.length,
    hasReasoning: node?.reasoning ? true : false
  });

  // Prevent click events from propagating to visualization
  const handleModalClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  // Close modal when clicking outside
  const handleOutsideClick = useCallback((event: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key to close modal
  const handleEscKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Add/remove event listeners when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Use a small timeout to ensure React's rendering is complete
      // before attaching events to avoid immediate triggers
      const timerId = setTimeout(() => {
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscKey);
      }, 10);

      return () => {
        clearTimeout(timerId);
        document.removeEventListener('mousedown', handleOutsideClick);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
    
    return undefined;
  }, [isOpen, handleOutsideClick, handleEscKey]);

  if (!isOpen || !node) { 
    console.log('[DetailModal] Bailing: isOpen or node is falsy.', {isOpen, nodeExists: !!node});
    return null;
  }

  let portalNodeData: any = {}; 
  if (node.type === 'topic') {
    portalNodeData = {
      type: node.type,
      topicId: node.label,
      contextId: node.contextId,
      contextName: node.contextName,
      value: node.score,
      reasoning: node.reasoning,
      dbId: node.dbId,
      uuid: node.uuid
    };
    console.log('[DetailModal] Prepared portalNodeData for TOPIC:', portalNodeData);
  } else if (node.type === 'valueItem') {
    portalNodeData = {
      type: node.type,
      topicId: node.label || "Item Label Missing", // Item's name, ensure fallback
      contextId: node.contextId,
      contextName: node.contextName,
      value: node.occurrenceCount,
      dbId: node.dbId,
      uuid: node.uuid,
      additionalInfo: `Item: ${node.label || "Unknown Item"} - Occurrences: ${node.occurrenceCount || 0}`
    };
    console.log('[DetailModal] Prepared portalNodeData for VALUE_ITEM:', portalNodeData);
  } else {
    console.log('[DetailModal] Bailing: node.type is not topic or valueItem. Type:', node.type);
    return null; 
  }

  if (Object.keys(portalNodeData).length === 0 && (node.type === 'topic' || node.type === 'valueItem')) {
      console.error("[DetailModal] portalNodeData is unexpectedly empty for a valid node type:", { nodeType: node.type, portalNodeData });
      return null;
  }

  // Use ModalPortal to render the content
  return (
    <ModalPortal
      nodeData={portalNodeData}
      conversations={conversations}
      isOpen={isOpen}
      onClose={onClose}
      containerElement={containerElement}
    />
  );
});

DetailModal.displayName = 'DetailModal';

export { DetailModal }; 