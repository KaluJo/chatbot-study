'use client'

import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink } from '@/components/visualization/types';

export interface GraphRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface GraphProps {
  data: GraphData;
  isFullscreen: boolean;
  onNodeClick: (event: MouseEvent, node: GraphNode) => void;
  highlightedItemUUID?: string | null;
}

const Graph = forwardRef<GraphRef, GraphProps>(({ data, isFullscreen, onNodeClick, highlightedItemUUID }, ref) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const isInitializedRef = useRef(false);
  const initFrameRef = useRef<number | null>(null);

  const stableOnNodeClick = useCallback((event: MouseEvent, node: GraphNode) => {
    event.stopPropagation();
    event.preventDefault();
    onNodeClick(event, node);
  }, [onNodeClick]);

  const preparedData = useMemo(() => {
    console.log('[Graph.tsx] Using pre-transformed data:', data.nodes?.length, 'nodes', data.links?.length, 'links');
    
    const nodes = data.nodes || [];
    const links = data.links || [];
    
    // Pre-build lookup maps for O(1) access in tick handler
    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach(n => nodeMap.set(n.id, n));
    
    return {
      nodes,
      links,
      nodeMap
    };
  }, [data]);

  const positionContextNodes = useCallback((nodesToPosition: GraphNode[], width: number, height: number) => {
    const contextNodes = nodesToPosition.filter(n => n.type === 'context');
    const radius = Math.min(width, height) * 0.4;
    const angleStep = contextNodes.length > 0 ? (2 * Math.PI) / contextNodes.length : 0;
    contextNodes.forEach((node, i) => {
      if (node.type === 'context') {
      const angle = i * angleStep;
      node.fx = width / 2 + radius * Math.cos(angle);
      node.fy = height / 2 + radius * Math.sin(angle);
      }
    });
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
        if (!svgRef.current || !zoomRef.current) return;
        d3.select(svgRef.current).transition().duration(450).call(zoomRef.current.scaleBy, 1.5);
    },
    zoomOut: () => {
        if (!svgRef.current || !zoomRef.current) return;
        d3.select(svgRef.current).transition().duration(450).call(zoomRef.current.scaleBy, 0.75);
    },
    resetZoom: () => {
        if (!svgRef.current || !zoomRef.current) return;
        d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
    },
  }), []);

  useEffect(() => {
    if (!svgRef.current || !preparedData.nodes || !preparedData.links) return;

    // Cancel any pending initialization
    if (initFrameRef.current) {
      cancelAnimationFrame(initFrameRef.current);
    }

    // Defer D3 initialization to next frame to avoid blocking UI
    initFrameRef.current = requestAnimationFrame(() => {
      if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = svg.node()?.getBoundingClientRect().width || 960;
    const height = svg.node()?.getBoundingClientRect().height || 700;

    let g = svg.select<SVGGElement>('.zoom-group');
    if (g.empty()) {
        g = svg.append('g').attr('class', 'zoom-group');
    }

    if (!zoomRef.current || isFullscreen !== (svgRef.current.dataset.fullscreen === 'true')) {
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on('zoom', (event) => {
                g.attr('transform', event.transform.toString());
            });
        zoomRef.current = zoom;
        svg.call(zoomRef.current); 
        if (svgRef.current.dataset.fullscreen !== String(isFullscreen)){
            svg.call(zoomRef.current.transform, d3.zoomIdentity);
        }
        svgRef.current.dataset.fullscreen = String(isFullscreen);
        svg.on('dblclick.zoom', null);
    }
    isInitializedRef.current = true;

    const link = g.selectAll<SVGLineElement, GraphLink>('.link')
      .data(preparedData.links, (d: GraphLink) => {
        // Handle both string IDs and GraphNode objects
        const source = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id;
        const target = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id;
        return `${source}-${target}`;
      });

    link.exit().remove();

    const linkEnter = link.enter().append('line').attr('class', 'link');
    const linkUpdate = linkEnter.merge(link);

    const node = g.selectAll<SVGGElement, GraphNode>('.node-group')
      .data(preparedData.nodes, (d: GraphNode) => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append('g')
        .attr('class', (d: GraphNode) => `node-group node-${d.type}`)
        .attr('id', (d: GraphNode) => d.id)
        .call(d3.drag<SVGGElement, GraphNode>()
            .on('start', (event, d: GraphNode) => {
                if (!event.active && simulationRef.current) {
                    simulationRef.current.alphaTarget(0.3).restart();
                }
                d.fx = d.x ?? null;
                d.fy = d.y ?? null;
            })
            .on('drag', (event, d: GraphNode) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d: GraphNode) => {
                if (!event.active && simulationRef.current) {
                    simulationRef.current.alphaTarget(0);
                }
                if (d.type !== 'context') { 
                    d.fx = null;
                    d.fy = null;
                }
            })
        );

    nodeEnter.each(function(dNodeEnter) {
        const group = d3.select(this);
        if (dNodeEnter.type === 'context') {
            group.append('circle').attr('class', 'shape');
            group.append('text').attr('class', 'label');
        } else if (dNodeEnter.type === 'topic') {
            group.append('rect').attr('class', 'shape topic-rect');
            group.append('text').attr('class', 'label topic-label');
        } else if (dNodeEnter.type === 'valueItem') {
            group.append('rect').attr('class', 'shape valueItem-rect');
            group.append('text').attr('class', 'label valueItem-label');
        }
    });

    const nodeUpdate = nodeEnter.merge(node);

    // Pre-compute highlighted topic IDs for O(1) lookup
    const highlightedTopicIds = new Set<string>();
    if (highlightedItemUUID) {
      preparedData.links.forEach(l => {
        const source = typeof l.source === 'string' ? preparedData.nodeMap.get(l.source) : (l.source as GraphNode);
        const target = typeof l.target === 'string' ? preparedData.nodeMap.get(l.target) : (l.target as GraphNode);
        
        if (source && target) {
          if (source.type === 'topic' && target.type === 'valueItem' && target.canonicalItemUUID === highlightedItemUUID) {
            highlightedTopicIds.add(source.id);
          } else if (target.type === 'topic' && source.type === 'valueItem' && source.canonicalItemUUID === highlightedItemUUID) {
            highlightedTopicIds.add(target.id);
          }
        }
      });
    }

    nodeUpdate.select<SVGCircleElement | SVGRectElement>('.shape')
      .each(function(dNode: GraphNode) {
        const el = d3.select(this);
        let isHighlighted = false;
        if (highlightedItemUUID) {
          if (dNode.type === 'valueItem' && dNode.canonicalItemUUID === highlightedItemUUID) {
            isHighlighted = true;
          } else if (dNode.type === 'topic' && highlightedTopicIds.has(dNode.id)) {
            isHighlighted = true;
          }
        }

        if (dNode.type === 'context') {
            el.attr('r', dNode.radius as number)
              .attr('fill', dNode.color as string)
              .attr('stroke', isHighlighted ? '#ff8800' : '#999')
              .attr('stroke-width', isHighlighted ? 3 : 2)
              .attr('filter', isHighlighted ? 'drop-shadow(0px 2px 5px rgba(255, 136, 0, 0.5))' : 'drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.2))');
        } else if (dNode.type === 'topic') {
            const topicRectPadding = 6;
            const topicRectHeight = 22;
            el.attr('width', (dNode.label.length * 5.5) + topicRectPadding * 2)
              .attr('height', topicRectHeight)
              .attr('x', -((dNode.label.length * 5.5 / 2) + topicRectPadding))
              .attr('y', -topicRectHeight / 2)
              .attr('rx', topicRectHeight / 2).attr('ry', topicRectHeight / 2)
              .attr('fill', isHighlighted ? '#fff3e0' : dNode.color as string)
              .attr('stroke', isHighlighted ? '#ff8800' : (d3.color(dNode.color as string)?.darker(0.25).toString() || '#888'))
              .attr('stroke-width', isHighlighted ? 3 : 1.5)
              .attr('filter', isHighlighted ? 'drop-shadow(0px 0px 5px rgba(255, 136, 0, 0.7))' : 'none');
        } else if (dNode.type === 'valueItem') {
            const itemEstimateCharWidth = 4;
            const itemPadding = 2;
            const itemMinHeight = 10;
            const itemMinWidth = 10;
            el.attr('width', Math.max(itemMinWidth, (dNode.label.length * itemEstimateCharWidth + itemPadding * 2)))
              .attr('height', itemMinHeight)
              .attr('x', -Math.max(itemMinWidth, (dNode.label.length * itemEstimateCharWidth + itemPadding * 2)) / 2)
              .attr('y', -itemMinHeight / 2)
              .attr('rx', 2).attr('ry', 2)
              .attr('fill', isHighlighted ? '#fff3e0' : dNode.color as string)
              .attr('stroke', isHighlighted ? '#ff8800' : (d3.color(dNode.color as string)?.darker(0.5).toString() || '#777'))
              .attr('stroke-width', isHighlighted ? 3 : 1)
              .attr('opacity', isHighlighted ? 1 : 0.9)
              .attr('transform', isHighlighted ? 'scale(1.2)' : 'scale(1)')
              .attr('filter', isHighlighted ? 'drop-shadow(0px 0px 5px rgba(255, 136, 0, 0.7))' : 'none');
        }
    });

    nodeUpdate.select<SVGTextElement>('.label')
      .text((d: GraphNode) => d.label)
      .each(function(dNode: GraphNode){
        const el = d3.select(this);
        el.attr('text-anchor', 'middle');
        if(dNode.type === 'context'){
            el.attr('dy', '.35em').attr('font-size', '14px').attr('font-weight', 'bold').attr('fill', '#333');
        } else if (dNode.type === 'topic'){
            el.attr('dy', '0.35em').attr('font-size', '10px')
              .attr('fill', (dNode.score && Math.abs(dNode.score || 0) >= 4) ? 'white' : '#333')
              .attr('font-weight', 'medium')
              .style('pointer-events', 'none');
        } else if (dNode.type === 'valueItem') {
            el.attr('dy', '0.25em').attr('font-size', '8px')
              .attr('fill', '#333')
              .attr('font-weight', 'normal')
              .style('pointer-events', 'none');
        }
    });

    nodeUpdate.on('click', (event: MouseEvent, d: GraphNode) => {
        if (d.type === 'topic' || d.type === 'valueItem') { 
            stableOnNodeClick(event, d);
        }
    })
    .style('cursor', (d: GraphNode) => (d.type === 'topic' || d.type === 'valueItem') ? 'pointer' : 'default');
        
    if (!simulationRef.current) {
        simulationRef.current = d3.forceSimulation<GraphNode>()
            .alphaMin(0.01) // Increased for faster settling (was 0.001)
            .force("charge", d3.forceManyBody().strength(-500)) // Moderate repulsion
            .force("center", d3.forceCenter(width / 2, height / 2).strength(0.015))
            .force("x", d3.forceX(width / 2).strength((d) => {
                // Type assertion to GraphNode
                const node = d as GraphNode;
                if (node.type === 'context') return 0.03; 
                return 0.0; // Remove X centering force for child nodes completely
            }))
            .force("y", d3.forceY(height / 2).strength((d) => {
                // Type assertion to GraphNode
                const node = d as GraphNode;
                if (node.type === 'context') return 0.03; 
                return 0.0; // Remove Y centering force for child nodes completely
            }));
    }
    simulationRef.current.nodes(preparedData.nodes);

    let linkForce = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink> | undefined;
    if (!linkForce) {
        linkForce = d3.forceLink<GraphNode, GraphLink>(preparedData.links).id((d: GraphNode) => d.id);
        simulationRef.current.force("link", linkForce);
    } else {
        linkForce.links(preparedData.links);
    }
    linkForce
        .distance((link: GraphLink) => { 
            const linkType = (link as any).type;
            if (linkType === 'topic-item') return 100; // Shorter distance for topic-item
            if (linkType === 'context-topic') return 100; // Slightly shorter for context-topic
            return 100; // Default distance
         })
        .strength((link: GraphLink) => { 
            const linkType = (link as any).type;
            if (linkType === 'topic-item') return 1.0; // Much stronger topic-item connection
            if (linkType === 'context-topic') return 1.0; // Much stronger context-topic connection
            return 0.5;
        });

    const collisionForce = simulationRef.current.force("collision") as d3.ForceCollide<GraphNode> | undefined;
    if(collisionForce){
        collisionForce
            .radius((d: GraphNode) => (d.radius || 8) + (d.type === 'context' ? 20 : (d.type === 'topic' ? 11 : 8))) 
            .strength(0.9) // Strong collision
            .iterations(2);
    } else {
        simulationRef.current.force("collision", d3.forceCollide<GraphNode>()
            .radius((d: GraphNode) => (d.radius || 8) + (d.type === 'context' ? 20 : (d.type === 'topic' ? 11 : 8)))
            .strength(0.9)
            .iterations(2)
        );
    }

    const baseGuidingForceStrength = 0.15; // Increased from 0.15 to 0.25
    const minAlphaForGuiding = 0.003;    // Lower to extend guidance further in simulation

    simulationRef.current.on('tick', () => {
        const currentAlpha = simulationRef.current!.alpha();
        const effectiveGuidingMultiplier = baseGuidingForceStrength * Math.max(currentAlpha, minAlphaForGuiding);

        // Use pre-built nodeMap for O(1) lookups instead of O(n) array searches
        const { nodeMap } = preparedData;

        const topicsByContext = new Map<string, GraphNode[]>();
        preparedData.nodes.forEach(node => {
            if (node.type === 'topic' && node.contextId) {
                const contextGraphNodeId = `context-${node.contextId}`;
                if (!topicsByContext.has(contextGraphNodeId)) {
                    topicsByContext.set(contextGraphNodeId, []);
                }
                topicsByContext.get(contextGraphNodeId)!.push(node);
            }
        });

        topicsByContext.forEach((topicList, contextGraphNodeId) => {
            const parentContextNode = nodeMap.get(contextGraphNodeId);
            if (parentContextNode && typeof parentContextNode.x === 'number' && typeof parentContextNode.y === 'number') {
                const numTopics = topicList.length;
                const angleStep = (2 * Math.PI) / Math.max(numTopics, 1);
                const topicOrbitRadius = (parentContextNode.radius || 40) + 28 + (Math.max(0, numTopics - 1) * 3.5);

                topicList.forEach((topicNode, index) => {
                    const angle = index * angleStep;
                    const targetX = parentContextNode.x! + Math.cos(angle) * topicOrbitRadius;
                    const targetY = parentContextNode.y! + Math.sin(angle) * topicOrbitRadius;
                    // Adjust velocity towards target
                    topicNode.vx = (topicNode.vx || 0) + (targetX - (topicNode.x || 0)) * effectiveGuidingMultiplier;
                    topicNode.vy = (topicNode.vy || 0) + (targetY - (topicNode.y || 0)) * effectiveGuidingMultiplier;
                });
            }
        });
        
        // Pre-calculate item counts per topic for O(1) lookup
        const itemCountByTopic = new Map<string, number>();
        preparedData.nodes.forEach(node => {
            if (node.type === 'valueItem' && node.topicId) {
                itemCountByTopic.set(node.topicId, (itemCountByTopic.get(node.topicId) || 0) + 1);
            }
        });

        preparedData.nodes.forEach(node => {
            if (node.type === 'valueItem' && node.topicId) {
                const parentTopicNode = nodeMap.get(node.topicId);
                if (parentTopicNode && typeof parentTopicNode.x === 'number' && typeof parentTopicNode.y === 'number') {
                    const initialAngle = (node as any).initialAngle as number | undefined;
                    const parentRadius = parentTopicNode.radius || 15;
                    const itemCount = itemCountByTopic.get(node.topicId) || 0;
                    const itemOrbitRadius = parentRadius + 18 + (Math.max(0, itemCount - 1) * 2.5);

                    if (initialAngle !== undefined) {
                        const targetX = parentTopicNode.x! + Math.cos(initialAngle) * itemOrbitRadius;
                        const targetY = parentTopicNode.y! + Math.sin(initialAngle) * itemOrbitRadius;
                        // Adjust velocity towards target
                        node.vx = (node.vx || 0) + (targetX - (node.x || 0)) * effectiveGuidingMultiplier;
                        node.vy = (node.vy || 0) + (targetY - (node.y || 0)) * effectiveGuidingMultiplier;
                    }
                }
            }
        });
        
        linkUpdate
            .attr('x1', (d: GraphLink) => {
                const source = d.source;
                return typeof source === 'string' ? 
                    (nodeMap.get(source)?.x || 0) : 
                    (source as GraphNode).x || 0;
            })
            .attr('y1', (d: GraphLink) => {
                const source = d.source;
                return typeof source === 'string' ? 
                    (nodeMap.get(source)?.y || 0) : 
                    (source as GraphNode).y || 0;
            })
            .attr('x2', (d: GraphLink) => {
                const target = d.target;
                return typeof target === 'string' ? 
                    (nodeMap.get(target)?.x || 0) : 
                    (target as GraphNode).x || 0;
            })
            .attr('y2', (d: GraphLink) => {
                const target = d.target;
                return typeof target === 'string' ? 
                    (nodeMap.get(target)?.y || 0) : 
                    (target as GraphNode).y || 0;
            })
            .attr('stroke', (d: GraphLink) => ((d as any).type === 'topic-item' ? '#a8d0e0' : '#b0b0b0')) 
            .attr('stroke-opacity', (d: GraphLink) => ((d as any).type === 'topic-item' ? 0.8 : 0.6))
            .attr('stroke-width', (d: GraphLink) => ((d as any).type === 'topic-item' ? 1.8 : 1.3));
        
        nodeUpdate
            .attr('transform', (d: GraphNode) => (typeof d.x === 'number' && typeof d.y === 'number') ? `translate(${d.x},${d.y})` : null );
    });

    if (!preparedData.nodes.some(n => n.type === 'context' && (n.fx !== undefined && n.fx !== null))) {
        positionContextNodes(preparedData.nodes, width, height);
    }
    
    // Only restart simulation with full alpha when data actually changes
    // Use a lower alpha for other changes (like fullscreen toggle)
    const currentAlpha = simulationRef.current.alpha();
    if (currentAlpha < 0.3) {
      simulationRef.current.alpha(0.5).restart();
    } else {
      simulationRef.current.restart();
    }
    }); // End of requestAnimationFrame callback

    return () => {
      // Cancel pending frame and stop simulation on cleanup
      if (initFrameRef.current) {
        cancelAnimationFrame(initFrameRef.current);
      }
      simulationRef.current?.stop();
    };
  }, [isFullscreen, preparedData, positionContextNodes, stableOnNodeClick, highlightedItemUUID]);

  return (
    <svg 
      ref={svgRef} 
      width="100%" 
      height="100%" 
      className="border border-gray-200 w-full h-full"
    />
  );
});

Graph.displayName = 'Graph';
export { Graph };
export type { GraphProps }; 