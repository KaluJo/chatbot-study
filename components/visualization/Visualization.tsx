'use client'

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Graph, GraphRef } from './Graph';
import { Controls } from './Controls';
import { Legend } from './Legend';
import { DetailModal } from './DetailModal';
import { GraphNode, Conversation } from './types';
import { useVisualization } from '../../contexts/VisualizationContext';

const Visualization: React.FC = () => {
  const { 
    graphData, 
    loading, 
    error, 
    refreshData, 
    conversations,
    loadingConversations
  } = useVisualization();
  
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphRef>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // State for modal
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Add state for highlighted item UUID to trigger re-render or pass to Graph
  const [highlightedItemUUID, setHighlightedItemUUID] = useState<string | null>(null);

  // Add state for tracking refresh operation
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handle node click - Memoize this handler
  const handleNodeClick = useCallback((event: MouseEvent, node: GraphNode) => {
    event.stopPropagation(); // Prevent click from bubbling to graph container
    
    // Clear previous highlight on any new node click first, then set if it's an item
    setHighlightedItemUUID(null); 

    if (node.type === 'topic') { 
      if (node.conversationUUIDs && node.conversationUUIDs.length > 0) {
        setSelectedNode(node);
        setIsModalOpen(true);
      } else {
        setSelectedNode(node); // Select node even if no convos
        setIsModalOpen(false);
        console.log('Selected topic node has no conversation UUIDs:', node);
      }
    } else if (node.type === 'valueItem') {
      console.log('Clicked valueItem:', node);
      if (node.canonicalItemUUID) {
        setHighlightedItemUUID(node.canonicalItemUUID); // Set new highlight if it's an item
      }

      console.log('Item node clicked:', node);
      console.log('Item conversationUUIDs:', node.conversationUUIDs);

      if (node.conversationUUIDs && node.conversationUUIDs.length > 0) {
        setSelectedNode(node); 
        setIsModalOpen(true);  
        console.log('Opening modal for item.');
      } else {
        setSelectedNode(node); 
        setIsModalOpen(false); 
        console.log('Value item has no conversations to show in modal', node);
      }
    } else { // Context nodes or other types
      setSelectedNode(null);
      setIsModalOpen(false);
    }
  }, []);

  // Add this handler for the graph container
  const handleGraphContainerClick = useCallback(() => {
    setHighlightedItemUUID(null);
    setSelectedNode(null);
    setIsModalOpen(false);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any).webkitRequestFullscreen) { // Safari
        (containerRef.current as any).webkitRequestFullscreen();
      } else if ((containerRef.current as any).msRequestFullscreen) { // IE11
        (containerRef.current as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) { // Safari
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) { // IE11
        (document as any).msExitFullscreen();
      }
    }
  };

  // Listen for fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreenNow = !!document.fullscreenElement;
      setIsFullscreen(isFullscreenNow);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Create a title for the visualization based on data (currently unused in UI)
  const _visualizationTitle = useMemo(() => {
    if (!graphData || !graphData.nodes) return "Topic-Context Graph";
    
    const contextCount = graphData.contexts.length;
    const nodeCount = graphData.nodes.filter(node => node.type === 'topic').length;
    const itemCount = graphData.nodes.filter(node => node.type === 'valueItem').length;
    
    return `Topic-Context Graph (${contextCount} contexts, ${nodeCount} topics, ${itemCount} items)`;
  }, [graphData]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
          </div>
          <p className="mt-2 text-gray-600">Loading visualization data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md p-4 bg-red-50 rounded-lg">
          <h2 className="text-lg font-semibold text-red-700">Error Loading Data</h2>
          <p className="mt-2 text-red-600">{error}</p>
          <button 
            onClick={() => refreshData()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md p-4 bg-yellow-50 rounded-lg">
          <h2 className="text-lg font-semibold text-yellow-700">No Data Available</h2>
          <p className="mt-2 text-gray-600">
            There is no visualization data available yet. Try generating some value nodes first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div 
        ref={containerRef}
        className="overflow-hidden relative bg-white flex-1 w-full h-full" 
        onClick={handleGraphContainerClick}
      >
        {loadingConversations && (
          <div className="absolute top-2 right-2 z-20 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
            Loading conversations...
          </div>
        )}
        
        <Graph 
          ref={graphRef}
          data={graphData}
          isFullscreen={isFullscreen}
          onNodeClick={handleNodeClick}
          highlightedItemUUID={highlightedItemUUID}
        />
        
        <Controls 
          onZoomIn={() => graphRef.current?.zoomIn()}
          onZoomOut={() => graphRef.current?.zoomOut()}
          onToggleFullscreen={toggleFullscreen}
          onRefresh={handleRefresh}
          isFullscreen={isFullscreen}
          isRefreshing={isRefreshing}
        />

        {/* Modal is rendered here, inside the fullscreen container */}
        {(() => {
          const conversationsToShow = selectedNode 
            ? (selectedNode.conversationUUIDs || [])
                .map(uuid => conversations.get(uuid))
                .filter((conv): conv is Conversation => conv !== undefined)
            : [];
          console.log('Rendering DetailModal. isOpen:', isModalOpen, 'selectedNode:', selectedNode, 'conversationsToShow:', conversationsToShow);
          return (
            <DetailModal 
              node={selectedNode}
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              conversations={conversationsToShow} 
              containerElement={containerRef.current}
            />
          );
        })()}
      </div>
      
      {!isFullscreen && <Legend />}
    </div>
  );
};

export { Visualization }; 