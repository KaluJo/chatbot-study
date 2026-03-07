'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { VALUE_DATA, QUADRANTS, ProcessedValueResult, calculateQuadrantAverageCenteredScores } from '../value-utils'

interface BarVisualizationProps {
  results: ProcessedValueResult[]
  width?: number
  height?: number
}

export const BarVisualization = ({ 
  results, 
  width = 900, // Increase width to accommodate more values
  height = 500 
}: BarVisualizationProps) => {
  const svgRef = useRef<SVGSVGElement>(null)
  
  useEffect(() => {
    if (!svgRef.current) return
    
    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove()
    
    // Calculate quadrant averages using centered scores
    const quadrantAverages = calculateQuadrantAverageCenteredScores(results)
    
    // Setup dimensions
    const margin = { top: 40, right: 30, bottom: 80, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom
    
    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`)
    
    // Map 19 value codes to positions for display
    const valueOrder = Object.keys(VALUE_DATA);
    
    // Create scales
    const xScale = d3.scaleBand()
      .domain(valueOrder)
      .range([0, innerWidth])
      .padding(0.2)
    
    const yScale = d3.scaleLinear()
      .domain([-3.5, 3.5]) // Domain for centered scores (approx -3 to +3, giving some padding)
      .range([innerHeight, 0])
    
    // Create axes
    const xAxis = d3.axisBottom(xScale)
    const yAxis = d3.axisLeft(yScale)
    
    // Add x-axis
    svg.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .attr("font-size", "8px") // Smaller font for 19 values
      .attr("font-weight", "bold")
      .attr("transform", "rotate(-45)")
      .attr("text-anchor", "end")
      .attr("dx", "-0.8em")
      .attr("dy", "0.15em")
    
    // Add y-axis
    svg.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
    
    // Add y-axis label
    svg.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -40)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("Centered Importance Score (vs. Your Average)")
    
    // Add bars for each value
    const bars = svg.selectAll(".bar")
      .data(results)
      .join("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.value) || 0)
      .attr("y", d => d.centeredScore < 0 ? yScale(0) : yScale(d.centeredScore))
      .attr("width", xScale.bandwidth())
      .attr("height", d => Math.abs(yScale(d.centeredScore) - yScale(0)))
      .attr("fill", d => VALUE_DATA[d.value as keyof typeof VALUE_DATA]?.color || "#ccc")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
    
    // Add value labels on bars
    svg.selectAll(".bar-label")
      .data(results)
      .join("text")
      .attr("class", "bar-label")
      .attr("x", d => (xScale(d.value) || 0) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.centeredScore) + (d.centeredScore < 0 ? 15 : -5))
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("font-weight", "bold")
      .attr("fill", "#333")
      .text(d => d.centeredScore.toFixed(1))
    
    // Add quadrant sections
    // First, determine where each quadrant starts and ends on the x-axis
    const quadrantBounds = Object.entries(QUADRANTS).reduce((acc, [quadrant, values]) => {
      const valuePositions = values
        .map(value => xScale(value))
        .filter((pos): pos is number => pos !== undefined)
        .sort((a, b) => a - b)
      
      if (valuePositions.length > 0) {
        acc[quadrant] = {
          start: valuePositions[0],
          end: valuePositions[valuePositions.length - 1] + (xScale.bandwidth() || 0)
        }
      }
      
      return acc
    }, {} as Record<string, { start: number; end: number }>)
    
    // Add background for quadrants
    Object.entries(quadrantBounds).forEach(([quadrant, bounds], index) => {
      const quadrantColor = getQuadrantColor(quadrant)
      
      svg.append("rect")
        .attr("x", bounds.start)
        .attr("y", 0)
        .attr("width", bounds.end - bounds.start)
        .attr("height", innerHeight)
        .attr("fill", quadrantColor)
        .attr("opacity", 0.05)
      
      // Add quadrant names
      svg.append("text")
        .attr("x", bounds.start + (bounds.end - bounds.start) / 2)
        .attr("y", innerHeight + 40)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text(quadrant)
    })
    
    // Add tooltips with full value names
    bars.append("title")
      .text(d => {
        const valueData = VALUE_DATA[d.value as keyof typeof VALUE_DATA]
        return `${valueData?.name}: Centered Score ${d.centeredScore.toFixed(1)} (Raw Inverted: ${d.rawValueInverted.toFixed(1)})`
      })
    
    // Add a legend for interpretation
    svg.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", -15)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text("PVQ-RR 19 Value Types - Bar Chart View")
    
  }, [results, width, height])
  
  // Helper to get quadrant background color based on value colors
  const getQuadrantColor = (quadrant: string): string => {
    switch (quadrant) {
      case 'Self-Transcendence': return 'rgba(16, 185, 129, 0.8)' // Green
      case 'Conservation': return 'rgba(99, 102, 241, 0.8)' // Indigo
      case 'Self-Enhancement': return 'rgba(236, 72, 153, 0.8)' // Pink
      case 'Openness to Change': return 'rgba(249, 115, 22, 0.8)' // Orange
      default: return 'rgba(209, 213, 219, 0.8)' // Gray
    }
  }
  
  // Helper to get darker version of a color for average lines
  const getDarkerColor = (color: string): string => {
    // Simple conversion to remove opacity and make darker
    return color.replace('rgba', 'rgb').replace(/,\s*0\.\d+\)/, ')')
  }
  
  return (
    <div className="flex justify-center my-4">
      <svg 
        ref={svgRef}
        className="border rounded"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  )
} 