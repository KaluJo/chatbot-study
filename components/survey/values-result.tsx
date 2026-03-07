'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import * as d3 from 'd3'
import { Button } from '@/components/ui/button'

interface ResultProps {
  results: Array<{
    value: string
    score: number
  }>
}

// View types for visualization
type ViewType = 'points' | 'radar' | 'bars'

// Map of value codes to full names and their positions in the circular model
const VALUE_DATA = {
  UN: { 
    name: 'Universalism', 
    color: '#3B82F6', // blue
    angle: 70, 
    quadrant: 'Self-Transcendence',
    description: 'Understanding, appreciation, tolerance for all people and nature'
  },
  BE: { 
    name: 'Benevolence', 
    color: '#10B981', // green
    angle: 30, 
    quadrant: 'Self-Transcendence',
    description: 'Preserving and enhancing welfare of close others'
  },
  TR: { 
    name: 'Tradition', 
    color: '#6366F1', // indigo
    angle: 350, 
    quadrant: 'Conservation',
    description: 'Respect and commitment to cultural/religious customs and ideas'
  },
  CO: { 
    name: 'Conformity', 
    color: '#8B5CF6', // violet
    angle: 350, 
    quadrant: 'Conservation',
    description: 'Restraint of actions likely to violate social norms'
  },
  SE: { 
    name: 'Security', 
    color: '#A855F7', // purple
    angle: 310, 
    quadrant: 'Conservation',
    description: 'Safety, harmony, stability of society and relationships'
  },
  PO: { 
    name: 'Power', 
    color: '#EC4899', // pink
    angle: 270, 
    quadrant: 'Self-Enhancement',
    description: 'Social status, prestige, control over people and resources'
  },
  AC: { 
    name: 'Achievement', 
    color: '#EF4444', // red
    angle: 230, 
    quadrant: 'Self-Enhancement',
    description: 'Personal success through demonstrating competence'
  },
  HE: { 
    name: 'Hedonism', 
    color: '#F59E0B', // amber
    angle: 190, 
    quadrant: 'Openness to Change/Self-Enhancement',
    description: 'Pleasure and sensuous gratification for oneself'
  },
  ST: { 
    name: 'Stimulation', 
    color: '#F97316', // orange
    angle: 150, 
    quadrant: 'Openness to Change',
    description: 'Excitement, novelty, and challenge in life'
  },
  SD: { 
    name: 'Self-Direction', 
    color: '#84CC16', // lime
    angle: 110, 
    quadrant: 'Openness to Change',
    description: 'Independent thought and action'
  },
}

// Grouping values by their quadrants for better comparison
const QUADRANTS = {
  'Self-Transcendence': ['UN', 'BE'],
  'Conservation': ['TR', 'CO', 'SE'],
  'Self-Enhancement': ['PO', 'AC'],
  'Openness to Change': ['SD', 'ST'],
  'Mixed': ['HE'] // Hedonism spans Self-Enhancement and Openness to Change
}

export const ValuesResult = ({ results }: ResultProps) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewType, setViewType] = useState<ViewType>('radar')
  
  // Process results for better comparison
  const processedResults = results.map(result => {
    // PVQ-RR uses a scale from 6 (very much like me) to 1 (not like me at all)
    // So 6 already means higher importance - no inversion needed
    // Normalize to 0-10 scale for better understanding
    const normalizedScore = (result.score / 6) * 10 // Scale to 0-10
    
    return {
      ...result,
      originalScore: result.score,
      normalizedScore
    }
  })
  
  // Calculate quadrant averages for comparison
  const quadrantAverages = Object.entries(QUADRANTS).reduce((acc, [quadrant, values]) => {
    const quadrantScores = processedResults
      .filter(r => values.includes(r.value))
      .map(r => r.normalizedScore)
    
    const average = quadrantScores.length > 0 
      ? quadrantScores.reduce((sum, score) => sum + score, 0) / quadrantScores.length 
      : 0
    
    acc[quadrant] = average
    return acc
  }, {} as Record<string, number>)
  
  useEffect(() => {
    if (!svgRef.current) return
    
    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove()
    
    // Setup
    const width = 600
    const height = 600
    const margin = 60
    const radius = Math.min(width, height) / 2 - margin
    
    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`)
    
    // Draw background elements
    drawQuadrants(svg, radius)
    drawAxes(svg, radius)
    
    // Draw the selected visualization type
    switch (viewType) {
      case 'radar':
        drawRadarChart(svg, radius, processedResults)
        break
      case 'bars':
        drawBarChart(svg, radius, processedResults, width)
        break
      case 'points':
      default:
        drawPointsChart(svg, radius, processedResults)
        break
    }
    
  }, [results, viewType, processedResults])
  
  const drawQuadrants = (svg: d3.Selection<SVGGElement, unknown, null, undefined>, radius: number) => {
    const quadrants = [
      { name: 'Self-Transcendence', startAngle: 0, endAngle: Math.PI/2, color: 'rgba(16, 185, 129, 0.1)' },
      { name: 'Conservation', startAngle: Math.PI/2, endAngle: Math.PI, color: 'rgba(99, 102, 241, 0.1)' },
      { name: 'Self-Enhancement', startAngle: Math.PI, endAngle: 3*Math.PI/2, color: 'rgba(236, 72, 153, 0.1)' },
      { name: 'Openness to Change', startAngle: 3*Math.PI/2, endAngle: 2*Math.PI, color: 'rgba(249, 115, 22, 0.1)' }
    ]
    
    // Create concentric circles for scale reference
    const scaleCircles = [0.25, 0.5, 0.75, 1.0]
    
    // Draw reference circles
    svg.selectAll(".scale-circle")
      .data(scaleCircles)
      .join("circle")
      .attr("class", "scale-circle")
      .attr("r", d => radius * d)
      .attr("fill", "none")
      .attr("stroke", "#ddd")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2")
    
    // Add scale labels
    svg.selectAll(".scale-label")
      .data(scaleCircles)
      .join("text")
      .attr("class", "scale-label")
      .attr("x", 5)
      .attr("y", d => -radius * d)
      .attr("text-anchor", "start")
      .attr("font-size", "10px")
      .attr("fill", "#999")
      .text(d => (d * 10).toFixed(0))
    
    // Draw circle border
    svg.append("circle")
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1)
    
    // Create quadrant arcs
    const arcGenerator = d3.arc<any>()
      .innerRadius(0)
      .outerRadius(radius)
      .startAngle(d => d.startAngle)
      .endAngle(d => d.endAngle)
    
    // Draw quadrants
    svg.selectAll(".quadrant")
      .data(quadrants)
      .join("path")
      .attr("class", "quadrant")
      .attr("d", arcGenerator)
      .attr("fill", d => d.color)
    
    // Add quadrant labels
    svg.selectAll(".quadrant-label")
      .data(quadrants)
      .join("text")
      .attr("class", "quadrant-label")
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#555")
      .attr("transform", d => {
        const angle = (d.startAngle + d.endAngle) / 2
        const x = radius * 0.7 * Math.cos(angle - Math.PI/2)
        const y = radius * 0.7 * Math.sin(angle - Math.PI/2)
        return `translate(${x}, ${y})`
      })
      .text(d => d.name)
  }
  
  const drawAxes = (svg: d3.Selection<SVGGElement, unknown, null, undefined>, radius: number) => {
    // Draw X axis
    svg.append("line")
      .attr("x1", -radius)
      .attr("y1", 0)
      .attr("x2", radius)
      .attr("y2", 0)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1)
    
    // Draw Y axis
    svg.append("line")
      .attr("x1", 0)
      .attr("y1", -radius)
      .attr("x2", 0)
      .attr("y2", radius)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1)
    
    // Add axis labels
    svg.append("text")
      .attr("x", -radius * 0.7)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Conservation")
    
    svg.append("text")
      .attr("x", radius * 0.7)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Openness to Change")
    
    svg.append("text")
      .attr("x", -20)
      .attr("y", radius * 0.7)
      .attr("text-anchor", "end")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Self-Enhancement")
    
    svg.append("text")
      .attr("x", 20)
      .attr("y", -radius * 0.7)
      .attr("text-anchor", "start")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text("Self-Transcendence")
  }
  
  const drawPointsChart = (
    svg: d3.Selection<SVGGElement, unknown, null, undefined>, 
    radius: number, 
    results: typeof processedResults
  ) => {
    // Create a data structure for values with their positions
    const valuePoints = results.map(result => {
      const valueData = VALUE_DATA[result.value as keyof typeof VALUE_DATA]
      if (!valueData) return null
      
      // Calculate position
      const angleInRadians = (valueData.angle * Math.PI) / 180
      const distance = radius * (result.normalizedScore / 10)
      const x = distance * Math.cos(angleInRadians - Math.PI/2)
      const y = distance * Math.sin(angleInRadians - Math.PI/2)
      
      return {
        value: result.value,
        score: result.score,
        normalizedScore: result.normalizedScore,
        x,
        y,
        ...valueData
      }
    }).filter(d => d !== null) as any[]
    
    // Draw value points
    svg.selectAll(".value-point")
      .data(valuePoints)
      .join("circle")
      .attr("class", "value-point")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 8)
      .attr("fill", d => d.color)
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .append("title")
      .text(d => `${d.name}: ${d.normalizedScore.toFixed(1)}/10`)
    
    // Add value labels
    svg.selectAll(".value-label")
      .data(valuePoints)
      .join("text")
      .attr("class", "value-label")
      .attr("x", d => {
        const distance = Math.sqrt(d.x * d.x + d.y * d.y) + 20
        const angle = Math.atan2(d.y, d.x)
        return distance * Math.cos(angle)
      })
      .attr("y", d => {
        const distance = Math.sqrt(d.x * d.x + d.y * d.y) + 20
        const angle = Math.atan2(d.y, d.x)
        return distance * Math.sin(angle)
      })
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text(d => d.name)
    
    // Create lines connecting center to value points
    svg.selectAll(".value-line")
      .data(valuePoints)
      .join("line")
      .attr("class", "value-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", d => d.x)
      .attr("y2", d => d.y)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.5)
      .attr("stroke-dasharray", "3,3")
  }
  
  const drawRadarChart = (
    svg: d3.Selection<SVGGElement, unknown, null, undefined>, 
    radius: number, 
    results: typeof processedResults
  ) => {
    // Create value points with positions
    const valuePoints = results.map(result => {
      const valueData = VALUE_DATA[result.value as keyof typeof VALUE_DATA]
      if (!valueData) return null
      
      // Calculate position
      const angleInRadians = (valueData.angle * Math.PI) / 180 // valueData.angle is in degrees
      const angleOffset = -Math.PI/2 // Offset to start at the top
      const calculatedAngleRad = angleInRadians + angleOffset // This is the angle we need for trig and sorting
      
      const distance = radius * (result.normalizedScore / 10)
      const x = distance * Math.cos(calculatedAngleRad)
      const y = distance * Math.sin(calculatedAngleRad)
      
      // Exclude original angle from valueData to avoid overwrite if it causes issues
      const { angle: _originalAngleInDegrees, ...restOfValueData } = valueData;

      return {
        value: result.value,
        score: result.score,
        normalizedScore: result.normalizedScore,
        x,
        y,
        angleRad: calculatedAngleRad, // Use a distinct name for the calculated radian angle
        ...restOfValueData // Spread the rest of valueData, which no longer contains 'angle'
      }
    }).filter(d => d !== null) as any[]
    
    // Sort points by angle for proper polygon drawing
    valuePoints.sort((a, b) => a.angleRad - b.angleRad) // Sort by calculated radian angle
    
    // Create a closed path for filled area
    const line = d3.lineRadial<any>()
      .angle(d => d.angleRad) // Use calculated radian angle
      .radius(d => d.normalizedScore * radius / 10)
      .curve(d3.curveCardinalClosed)
    
    // Convert data for d3.lineRadial
    const radialData = valuePoints.map(d => ({
      angleRad: d.angleRad, // Use calculated radian angle
      normalizedScore: d.normalizedScore
    }))
    
    // Draw radar area
    svg.append("path")
      .datum(radialData)
      .attr("class", "radar-area")
      .attr("d", line as any)
      .attr("fill", "rgba(59, 130, 246, 0.3)")
      .attr("stroke", "rgba(59, 130, 246, 0.8)")
      .attr("stroke-width", 2)
    
    // Draw value points
    svg.selectAll(".value-point")
      .data(valuePoints)
      .join("circle")
      .attr("class", "value-point")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 6)
      .attr("fill", d => d.color)
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .append("title")
      .text(d => `${d.name}: ${d.normalizedScore.toFixed(1)}/10`)
    
    // Add value lines from center
    valuePoints.forEach(point => {
      svg.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", radius * Math.cos(point.angleRad)) // Use calculated radian angle
        .attr("y2", radius * Math.sin(point.angleRad)) // Use calculated radian angle
        .attr("stroke", "#ddd")
        .attr("stroke-width", 1)
    })
    
    // Add value labels
    svg.selectAll(".value-label")
      .data(valuePoints)
      .join("text")
      .attr("class", "value-label")
      .attr("x", d => {
        const labelRadius = radius + 20
        return labelRadius * Math.cos(d.angleRad) // Use calculated radian angle
      })
      .attr("y", d => {
        const labelRadius = radius + 20
        return labelRadius * Math.sin(d.angleRad) // Use calculated radian angle
      })
      .attr("text-anchor", d => {
        // Change text anchor based on position in circle
        const angleDegrees = d.angleRad * 180 / Math.PI // Use calculated radian angle
        if (angleDegrees > -30 && angleDegrees < 30) return "middle"
        if (angleDegrees >= 30 && angleDegrees <= 150) return "start"
        if (angleDegrees > 150 && angleDegrees < 210) return "middle"
        return "end"
      })
      .attr("dominant-baseline", d => {
        const angleDegrees = d.angleRad * 180 / Math.PI // Use calculated radian angle
        if (angleDegrees > 60 && angleDegrees < 120) return "hanging"
        if (angleDegrees > 240 && angleDegrees < 300) return "auto"
        return "middle"
      })
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text(d => `${d.name} (${d.normalizedScore.toFixed(1)})`)
  }
  
  const drawBarChart = (
    svg: d3.Selection<SVGGElement, unknown, null, undefined>, 
    radius: number, 
    results: typeof processedResults,
    width: number
  ) => {
    // Group values by quadrant
    const quadrantGroups = Object.entries(QUADRANTS).map(([quadrant, values]) => {
      const quadrantValues = results.filter(r => values.includes(r.value))
      return {
        quadrant,
        values: quadrantValues,
        average: quadrantAverages[quadrant]
      }
    })
    
    // Calculate bar width and spacing
    const barWidth = 30
    const quadrantSpacing = 60
    const totalWidth = width - 100
    
    // Draw bars
    let xPosition = -totalWidth / 2 + 50
    
    quadrantGroups.forEach(group => {
      // Draw quadrant label
      svg.append("text")
        .attr("x", xPosition + (group.values.length * barWidth) / 2)
        .attr("y", radius - 10)
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .text(group.quadrant)
      
      // Draw average line
      svg.append("line")
        .attr("x1", xPosition - 10)
        .attr("y1", -radius * (group.average / 10))
        .attr("x2", xPosition + (group.values.length * barWidth) + 10)
        .attr("y2", -radius * (group.average / 10))
        .attr("stroke", "#888")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5,5")
      
      // Draw bars for each value
      group.values.forEach((valueResult, i) => {
        const valueData = VALUE_DATA[valueResult.value as keyof typeof VALUE_DATA]
        if (!valueData) return
        
        const barHeight = radius * (valueResult.normalizedScore / 10)
        
        // Draw bar
        svg.append("rect")
          .attr("x", xPosition + (i * barWidth))
          .attr("y", -barHeight)
          .attr("width", barWidth - 5)
          .attr("height", barHeight)
          .attr("fill", valueData.color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .append("title")
          .text(`${valueData.name}: ${valueResult.normalizedScore.toFixed(1)}/10`)
        
        // Add value label
        svg.append("text")
          .attr("x", xPosition + (i * barWidth) + (barWidth - 5) / 2)
          .attr("y", -barHeight - 10)
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .text(valueResult.value)
      })
      
      xPosition += (group.values.length * barWidth) + quadrantSpacing
    })
  }
  
  return (
    <Card className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Your Values Profile</h2>
      <p className="text-gray-600 mb-4">
        Below is a visualization of your values based on your responses to the Portrait Values Questionnaire.
        The chart shows how you prioritize the ten basic human values in Schwartz's theory.
      </p>
      
      <div className="flex gap-2 mb-6">
        <Button 
          variant={viewType === 'radar' ? 'default' : 'outline'} 
          onClick={() => setViewType('radar')}
        >
          Radar View
        </Button>
        <Button 
          variant={viewType === 'points' ? 'default' : 'outline'} 
          onClick={() => setViewType('points')}
        >
          Points View
        </Button>
        <Button 
          variant={viewType === 'bars' ? 'default' : 'outline'} 
          onClick={() => setViewType('bars')}
        >
          Bar Chart View
        </Button>
      </div>
      
      <div className="flex justify-center my-8">
        <svg 
          ref={svgRef}
          className="border rounded"
          viewBox="0 0 600 600"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      
      <div className="mt-8">
        <h3 className="text-lg font-bold mb-3">Values by Higher-Order Categories</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(QUADRANTS).map(([quadrant, values]) => {
            const quadrantValues = values.map(code => {
              const result = processedResults.find(r => r.value === code)
              return {
                code,
                ...VALUE_DATA[code as keyof typeof VALUE_DATA],
                score: result?.normalizedScore ?? 0
              }
            }).sort((a, b) => b.score - a.score) // Sort by score descending
            
            const averageScore = quadrantAverages[quadrant]
            
            return (
              <div key={quadrant} className="p-4 border rounded-lg">
                <h4 className="font-bold text-md mb-2">{quadrant} (Avg: {averageScore.toFixed(1)})</h4>
                <div className="space-y-2">
                  {quadrantValues.map(value => (
                    <div key={value.code} className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2 flex-shrink-0" 
                        style={{ backgroundColor: value.color }}
                      />
                      <div className="flex-grow">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{value.name}</span>
                          <span className="text-sm">{value.score.toFixed(1)}/10</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="h-2 rounded-full" 
                            style={{ 
                              width: `${value.score * 10}%`,
                              backgroundColor: value.color
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mt-8">
        {Object.entries(VALUE_DATA).map(([code, data]) => {
          const result = processedResults.find(r => r.value === code)
          const score = result ? result.normalizedScore.toFixed(1) : "N/A"
          
          return (
            <div key={code} className="p-3 border rounded flex items-start">
              <div 
                className="w-4 h-4 rounded-full mt-1 mr-2 flex-shrink-0" 
                style={{ backgroundColor: data.color }}
              />
              <div>
                <h3 className="font-bold">{data.name} ({code}): {score}/10</h3>
                <p className="text-sm text-gray-600">{data.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
} 