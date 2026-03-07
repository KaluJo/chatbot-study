'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { VALUE_DATA, ProcessedValueResult } from '../value-utils'

export interface OverlayDataset {
  id: string; // e.g., 'manual', 'llm-individual', 'llm-batch'
  label: string; // e.g., "Manual Survey", "LLM Individual Prediction"
  data: ProcessedValueResult[];
  color: string; // Hex color for this dataset
  isVisible: boolean;
}

// New interface to track value conflicts across datasets
interface ValueConflictInfo {
  valueCode: string;
  valueName: string;
  datasets: {
    id: string;
    label: string;
    score: number;
    isPositive: boolean;
  }[];
  hasConflict: boolean;
}

interface CircularVisualizationProps {
  datasets: OverlayDataset[];
  width?: number;
  height?: number;
  hideLabels?: boolean; // Hide value labels and text
  hideExplanation?: boolean; // Hide explanation text and additional info
  showExplanation?: boolean; // Show the bottom explanation text (defaults to false)
  compact?: boolean; // Compact mode for modals - hides value names and quadrant arcs for bigger chart
  // mapCenteredScoreToDisplay and MAX_DISPLAY_SCORE could be passed or defined internally
}

const DEFAULT_COLORS = [
  'rgba(70, 130, 180, 0.7)', // Original blue-ish
  'rgba(255, 99, 132, 0.7)', // Red-ish
  'rgba(75, 192, 192, 0.7)', // Green-ish
  'rgba(255, 205, 86, 0.7)', // Yellow-ish
];

// Colors for conflict highlighting
const CONFLICT_COLOR = 'rgba(147, 51, 234, 0.85)'; // Bright purple for conflicts (instead of orange)
const CONFLICT_STROKE = 'rgba(126, 34, 206, 1)'; // Darker purple for stroke

// Positive and negative fill colors
const POSITIVE_FILL = 'rgba(42, 157, 143, 0.75)'; // Green with opacity
const NEGATIVE_FILL = 'rgba(156, 163, 175, 0.75)'; // Gray with opacity - less important values

// Helper function to get intensity adjective based on score magnitude
const getIntensityAdjective = (score: number): string => {
  const absScore = Math.abs(score);
  if (absScore < 0.75) return "slightly";
  if (absScore < 1.5) return "";
  return "strongly";
};

// Helper function to get contextual explanation for a value based on its score
const getValueExplanation = (valueCode: string, score: number, isPositive: boolean): string => {
  const intensity = getIntensityAdjective(score);
  const intensityText = intensity ? `${intensity} ` : '';

  const valueExplanations: Record<string, { positive: string; negative: string }> = {
    'UNN': {
      positive: `You ${intensityText}prioritize protecting the environment and living in harmony with nature. Environmental sustainability and conservation are central to your values.`,
      negative: `Environmental concerns are ${intensityText}less central to your value system. You may prioritize other values over environmental protection.`
    },
    'UNC': {
      positive: `You ${intensityText}value understanding, tolerance, and care for all people, including those different from yourself. Equality and justice for everyone are important to you.`,
      negative: `Universal concern for all humanity is ${intensityText}less emphasized in your value system. You may focus more on closer relationships or other priorities.`
    },
    'UNT': {
      positive: `You ${intensityText}believe in accepting and appreciating diverse perspectives, ideas, and ways of life. Tolerance and open-mindedness are key values for you.`,
      negative: `Tolerance for different viewpoints and lifestyles is ${intensityText}less prioritized. You may prefer more familiar or traditional approaches.`
    },
    'BEC': {
      positive: `You ${intensityText}value caring for and helping those close to you. Being supportive and reliable for family and friends is very important to you.`,
      negative: `Caring for close relationships is ${intensityText}less emphasized compared to other values. You may prioritize independence or other goals.`
    },
    'BED': {
      positive: `You ${intensityText}value loyalty, reliability, and being someone others can count on. Being dependable and trustworthy in relationships matters greatly to you.`,
      negative: `Being dependable to others is ${intensityText}less central to your value system. You may prioritize personal freedom or other values.`
    },
    'SDT': {
      positive: `You ${intensityText}value independent thinking and forming your own opinions. Intellectual autonomy and freedom of thought are important to you.`,
      negative: `Independent thinking is ${intensityText}less prioritized. You may be more comfortable following established ideas or social consensus.`
    },
    'SDA': {
      positive: `You ${intensityText}value choosing your own actions and being in control of your life decisions. Personal autonomy and freedom of choice are central to you.`,
      negative: `Personal autonomy is ${intensityText}less emphasized. You may be more comfortable with structure, guidance, or following established paths.`
    },
    'ST': {
      positive: `You ${intensityText}enjoy seeking out new experiences, excitement, and adventure. Variety and stimulation in life are important to you.`,
      negative: `Seeking new experiences and excitement is ${intensityText}less important to you. You may prefer stability, routine, or familiar experiences.`
    },
    'HE': {
      positive: `You ${intensityText}value pleasure, enjoyment, and having fun in life. Personal happiness and life satisfaction are important priorities for you.`,
      negative: `Personal pleasure and enjoyment are ${intensityText}less central to your values. You may prioritize duty, achievement, or other goals over personal happiness.`
    },
    'AC': {
      positive: `You ${intensityText}value personal success, achievement, and demonstrating competence. Accomplishing goals and gaining recognition matter to you.`,
      negative: `Personal achievement and success are ${intensityText}less emphasized in your value system. You may prioritize relationships, service, or other values.`
    },
    'POD': {
      positive: `You ${intensityText}value having control and authority over people. Leadership roles and the ability to direct others' actions are important to you.`,
      negative: `Having power over people is ${intensityText}less appealing to you. You may prefer collaborative approaches or focus on other forms of influence.`
    },
    'POR': {
      positive: `You ${intensityText}value having control over material and social resources. Access to wealth, property, and valuable connections matters to you.`,
      negative: `Control over resources and material wealth are ${intensityText}less important to you. You may prioritize experiences, relationships, or non-material values.`
    },
    'FAC': {
      positive: `You ${intensityText}value maintaining social image, reputation, and avoiding public embarrassment. How others perceive you matters significantly.`,
      negative: `Social image and reputation are ${intensityText}less concerning to you. You may be more focused on authenticity or other priorities over public perception.`
    },
    'SEP': {
      positive: `You ${intensityText}value personal safety, security, and protection from threats. Feeling safe and secure in your immediate environment is important to you.`,
      negative: `Personal security is ${intensityText}less emphasized. You may be more comfortable with risk, uncertainty, or prioritize other values over personal safety.`
    },
    'SES': {
      positive: `You ${intensityText}value social order, stability, and the smooth functioning of society. You believe in the importance of rules and institutions for everyone's safety.`,
      negative: `Social stability and order are ${intensityText}less prioritized. You may be more open to change, disruption, or questioning established systems.`
    },
    'CO': {
      positive: `You ${intensityText}value following social expectations, meeting obligations, and being dutiful. Fulfilling your responsibilities to others is important.`,
      negative: `Conformity to social expectations is ${intensityText}less important to you. You may prioritize personal values or independence over social obligations.`
    },
    'COR': {
      positive: `You ${intensityText}value following rules, laws, and proper procedures. Order and adherence to established guidelines matter to you.`,
      negative: `Following rules and regulations is ${intensityText}less central to your values. You may prefer flexibility or questioning authority.`
    },
    'COI': {
      positive: `You ${intensityText}value politeness, good manners, and not disrupting social harmony. Maintaining interpersonal courtesy and avoiding conflict is important to you.`,
      negative: `Social courtesy and avoiding disruption are ${intensityText}less prioritized. You may value directness or authenticity over politeness.`
    },
    'TR': {
      positive: `You ${intensityText}value customs, traditions, and established ways of doing things. Respecting cultural heritage and maintaining traditional practices matters to you.`,
      negative: `Traditional customs and practices are ${intensityText}less important to you. You may prefer innovation, change, or creating new approaches.`
    },
    'TRC': {
      positive: `You ${intensityText}value cultural and religious customs, rituals, and practices. Maintaining traditional beliefs and observances is important to you.`,
      negative: `Religious and cultural traditions are ${intensityText}less central to your life. You may prefer secular or non-traditional approaches.`
    },
    'TRH': {
      positive: `You ${intensityText}value modesty, humility, and not seeking attention or recognition. Being humble and unpretentious matters to you.`,
      negative: `Humility and modesty are ${intensityText}less emphasized in your approach. You may be more comfortable with recognition or self-promotion.`
    },
    'HUM': {
      positive: `You ${intensityText}value recognizing your place in the larger scheme of things and showing humility. Understanding your limitations and not overestimating your importance matters to you.`,
      negative: `Recognizing your insignificance in the larger scheme of things is ${intensityText}less emphasized. You may be more focused on personal significance or achievements.`
    },
    // Legacy compatibility - keeping some older codes that might still be used
    'PO': {
      positive: `You ${intensityText}value having influence, control, and social status. Leadership and the ability to direct others or situations are important to you.`,
      negative: `Power and control over others are ${intensityText}less important to you. You may prefer collaboration, equality, or other forms of influence.`
    },
    'SE': {
      positive: `You ${intensityText}value personal safety, stability, and protection from threats. Security and predictability in life are important to you.`,
      negative: `Personal security is ${intensityText}less emphasized. You may be more comfortable with risk, uncertainty, or prioritize other values over safety.`
    }
  };

  const explanation = valueExplanations[valueCode];
  if (!explanation) {
    return isPositive 
      ? `This value is ${intensityText}more important to you than average.`
      : `This value is ${intensityText}less important to you than average.`;
  }

  return isPositive ? explanation.positive : explanation.negative;
};

// Helper function to generate consistent explanation HTML
const generateDetailsHTML = (
  point: { value: string; score: number; isPositive: boolean; hasConflict: boolean },
  datasets: OverlayDataset[],
  valueConflicts: Record<string, ValueConflictInfo>
): string => {
  // Conflict Case
  if (point.hasConflict && valueConflicts[point.value]) {
    const conflictInfo = valueConflicts[point.value];
    return `
      <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #eee;">
        <div style="font-weight: 600; color: ${CONFLICT_STROKE}; margin-bottom: 4px; font-size: 13px;">⚠️ Value Conflict</div>
        ${conflictInfo.datasets.map(d => {
          const sign = d.isPositive ? '+' : '';
          const explanation = getValueExplanation(point.value, d.score, d.isPositive);
          return `<div style="margin-top: 4px; padding: 6px; background: ${d.isPositive ? 'rgba(240, 253, 244, 0.8)' : 'rgba(254, 242, 242, 0.8)'}; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <div style="font-weight: 500; font-size: 12px; color: #555;">${d.label}</div>
                <span style="color: ${d.isPositive ? '#2a9d8f' : '#e76f51'}; font-weight: 600; font-size: 13px; font-family: monospace;">${sign}${d.score.toFixed(2)}</span>
            </div>
            <div style="font-size: 14px; color: #333; margin-top: 2px; line-height: 1.3;">${explanation}</div>
          </div>`;
        }).join('')}
      </div>
    `;
  }
  
  // Non-Conflict Case
  const explanation = getValueExplanation(point.value, point.score, point.isPositive);
  return `
    <div style="font-size: 14px; color: #333; line-height: 1.4; font-weight: 500; margin-top: 5px; padding-top: 5px; border-top: 1px solid #eee;">
      ${explanation}
    </div>
  `;
};

export const CircularVisualization = ({
  datasets,
  width = 700,
  height = 700,
  hideLabels = false,
  hideExplanation = false,
  showExplanation = false,
  compact = false
}: CircularVisualizationProps) => {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !datasets || datasets.length === 0) return

    d3.select(svgRef.current).selectAll("*").remove()

    // Use smaller margin in compact mode for bigger chart
    const margin = compact ? 50 : 80;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Create tooltip div for hover information with unique ID to prevent conflicts
    const tooltipId = `tooltip-circular-viz-${Math.random().toString(36).substr(2, 9)}`;
    
    // Remove any existing tooltips for this component first
    d3.selectAll(`.${tooltipId}`).remove();
    
    const tooltip = d3.select("body").append("div")
      .attr("class", `tooltip-circular-viz ${tooltipId}`)
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "rgba(255, 255, 255, 0.98)")
      .style("color", "#333")
      .style("padding", "8px 12px")
      .style("border-radius", "6px")
      .style("font-size", "13px")
      .style("font-weight", "500")
      .style("box-shadow", "0 4px 16px rgba(0, 0, 0, 0.15)")
      .style("border", "1px solid rgba(0, 0, 0, 0.1)")
      .style("pointer-events", "none")
      .style("z-index", "99999") // Very high z-index to appear above modals
      .style("max-width", "380px")
      .style("line-height", "1.4");

    // Centered scores typically range from approx -3 to +3.
    // Map this to a [0, 6] equivalent range for display distance.
    const mapCenteredScoreToDisplay = (centeredScore: number) => centeredScore + 3; // Maps [-3, 3] to [0, 6]
    const MAX_DISPLAY_SCORE = 6;

    // Create a group for shapes (circles, arcs) - will be rendered first (bottom layer)
    const shapesGroup = svg.append("g").attr("class", "shapes-layer");
    
    // Create a group for all text elements - will be rendered last (top layer)
    const textGroup = svg.append("g").attr("class", "text-layer");
    
    // Create a dedicated group for the axis lines that will be rendered above shapes but below text
    // This ensures they appear on top of the gray guide lines
    const axisLinesGroup = svg.append("g").attr("class", "axis-lines-layer");

    // Identify conflicts between datasets
    const valueConflicts = identifyConflicts(datasets.filter(d => d.isVisible));

    // Add background regions for positive and negative areas (into shapes group)
    // drawBackgroundRegions(shapesGroup, radius);

    // Draw quadrant arcs before axis labels (into shapes group)
    if (!hideLabels && !compact) {
      drawQuadrantArcs(shapesGroup, textGroup, radius);
    }

    // Draw circles for scale reference (circles to shapes group, text to text group)
    drawReferenceCircles(shapesGroup, textGroup, radius);

    // Draw axis labels (Value Names like Universalism, Benevolence etc.) only once
    // Use the first available dataset to get value points for labels, assuming all datasets have same values
    const firstValidDatasetForLabels = datasets.find(ds => ds.data && ds.data.length > 0);
    if (firstValidDatasetForLabels && !hideLabels) {
      drawAxisValueLabels(shapesGroup, textGroup, axisLinesGroup, radius, firstValidDatasetForLabels.data, mapCenteredScoreToDisplay, valueConflicts, tooltip, datasets.filter(d => d.isVisible), compact);
    }

    datasets.forEach((dataset, index) => {
      if (dataset.isVisible && dataset.data && dataset.data.length > 0) {
        drawValueConnectionsAndPoints(
          shapesGroup, // shapes go to shapes group
          textGroup,   // any text goes to text group
          radius,
          dataset.data,
          mapCenteredScoreToDisplay,
          MAX_DISPLAY_SCORE,
          dataset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length], // Use provided color or fallback
          dataset.label, // Pass label for tooltips
          tooltip, // Pass tooltip element
          valueConflicts // Pass conflicts data to highlight
        );
      }
    });

    // Clean up the tooltip when the component unmounts
    return () => {
      d3.select(`.${tooltipId}`).remove();
    };

  }, [datasets, width, height, hideLabels, hideExplanation, showExplanation]);

  // Helper function to identify conflicts between datasets
  const identifyConflicts = (visibleDatasets: OverlayDataset[]): Record<string, ValueConflictInfo> => {
    // Skip conflict detection if fewer than 2 visible datasets
    if (visibleDatasets.length < 2) return {};
    
    const conflictMap: Record<string, ValueConflictInfo> = {};
    
    // First, collect all value codes across all datasets
    const allValueCodes = new Set<string>();
    visibleDatasets.forEach(dataset => {
      dataset.data.forEach(item => {
        allValueCodes.add(item.value);
      });
    });
    
    // For each value code, check for conflicts across datasets
    allValueCodes.forEach(valueCode => {
      const conflictInfo: ValueConflictInfo = {
        valueCode,
        valueName: VALUE_DATA[valueCode as keyof typeof VALUE_DATA]?.name || valueCode,
        datasets: [],
        hasConflict: false
      };
      
      // Collect data for this value code from all datasets
      visibleDatasets.forEach(dataset => {
        const valueData = dataset.data.find(item => item.value === valueCode);
        
        if (valueData) {
          conflictInfo.datasets.push({
            id: dataset.id,
            label: dataset.label,
            score: valueData.centeredScore,
            isPositive: valueData.centeredScore > 0
          });
        }
      });
      
      // Check if there's a conflict (some positive, some negative)
      if (conflictInfo.datasets.length >= 2) {
        const hasPositive = conflictInfo.datasets.some(d => d.isPositive);
        const hasNegative = conflictInfo.datasets.some(d => !d.isPositive);
        
        if (hasPositive && hasNegative) {
          conflictInfo.hasConflict = true;
        }
      }
      
      conflictMap[valueCode] = conflictInfo;
    });
    
    return conflictMap;
  };

  // Draw concentric circles for scale reference
  const drawReferenceCircles = (
    shapesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    radius: number,
  ) => {
    const scaleCircles = [0.25, 0.5, 0.75, 1];

    // Draw reference circles (to shapes group)
    // shapesGroup.selectAll(".scale-circle")
    //   .data(scaleCircles)
    //   .join("circle")
    //   .attr("class", "scale-circle")
    //   .attr("r", d => radius * d)
    //   .attr("fill", "none")
    //   .attr("stroke", "#ddd")
    //   .attr("stroke-width", 1)
    //   .attr("stroke-dasharray", "2,2");

    // Add a more prominent circle at the zero point (centered score = 0, display score = 3)
    shapesGroup.append("circle")
      .attr("class", "zero-reference-circle")
      .attr("r", radius * 0.5) // Zero is at the midpoint (3 in display scale of 0-6)
      .attr("fill", "none")
      .attr("stroke", "#85858587")
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "3,2");

    // Add "Zero Line" label with more prominence (to text group)
    // textGroup.append("text")
    //   .attr("x", 0)
    //   .attr("y", -radius * 0.475)
    //   .attr("dy", -8)
    //   .attr("text-anchor", "middle")
    //   .attr("font-size", "10px")
    //   .attr("font-weight", "400")
    //   .attr("fill", "#99999999")
    //   .text("Neutral Point")
    //   .style("z-index", "100");

    // // Add positive region label (to text group)
    // textGroup.append("text")
    //   .attr("x", 0)
    //   .attr("y", -radius * 0.75)
    //   .attr("text-anchor", "middle")
    //   .attr("font-size", "10px")
    //   .attr("fill", "#2a9d8f")
    //   .attr("font-weight", "400")
    //   .text("+ More Important")

    // // Add negative region label (to text group)
    // textGroup.append("text")
    //   .attr("x", 0)
    //   .attr("y", -radius * 0.25)
    //   .attr("text-anchor", "middle")
    //   .attr("font-size", "10px")
    //   .attr("fill", "#e76f51")
    //   .attr("font-weight", "400")
    //   .text("− Less Important");

    // Draw radial guide lines (to shapes group)
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    // angles.forEach(angle => {
    //   const radian = (angle * Math.PI) / 180;
    //   shapesGroup.append("line")
    //     .attr("x1", 0)
    //     .attr("y1", 0)
    //     .attr("x2", radius * Math.cos(radian))
    //     .attr("y2", radius * Math.sin(radian))
    //     .attr("stroke", "#eee")
    //     .attr("stroke-width", 1);
    // });
  };

  // New function to draw the quadrant arcs
  const drawQuadrantArcs = (
    shapesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    radius: number,
  ) => {
    // Define quadrants with their angle ranges and properties
    // Adjusted to match the actual positions of values in value-utils.ts
    const quadrants = [
      {
        name: 'Self-Transcendence',
        startAngle: 160,
        endAngle: 260,
        color: '#fff', // Blue with transparency (matching Universalism colors)
        description: 'Concern for the welfare of others and nature'
      },
      {
        name: 'Openness to Change',
        startAngle: 260,
        endAngle: 360,
        color: '#fff', // Blue with transparency (matching Universalism colors)
        description: 'Independent thought, action, and seeking new experiences'
      },
      {
        name: 'Self-Enhancement',
        startAngle: 360,
        endAngle: 60,
        color: '#fff', // Blue with transparency (matching Universalism colors)
        description: 'Personal success and dominance over others'
      },
      {
        name: 'Conservation',
        startAngle: 60,
        endAngle: 160,
        color: '#fff', // Blue with transparency (matching Universalism colors)
        description: 'Order, self-restriction, and preservation of traditions'
      }
    ];

    // Calculate the outer radius for the arcs
    const outerRadius = radius + 60;

    // Create arc generator
    const arcGenerator = d3.arc<any>()
      .innerRadius(radius + 60) // Keep arcs slightly outside the main chart
      .outerRadius(outerRadius - 60) // Extend outer radius for arc labels
      .cornerRadius(0);

    // Add each quadrant arc
    quadrants.forEach((quadrant, i) => {
      // Convert angles to radians for the arc generator
      let startRad = ((quadrant.startAngle + 100) * Math.PI) / 180;
      let endRad = ((quadrant.endAngle + 100) * Math.PI) / 180;

      // Handle the special case when end angle is less than start angle (crosses 0°)
      if (quadrant.endAngle < quadrant.startAngle) {
        endRad += 2 * Math.PI;
      }

      // Create visual arc (to shapes group)
      shapesGroup.append("path")
        .attr("d", arcGenerator({
          startAngle: startRad,
          endAngle: endRad
        }))
        .attr("fill", quadrant.color)
        .attr("stroke", d3.color(quadrant.color)?.darker()?.toString() || "#000")
        .attr("stroke-width", 0.5);

      let textArcGenerator = d3.arc<any>()
        .innerRadius(radius + 10 + 59) 
        .outerRadius(radius + 10 + 59);

      const textPathId = `quadrant-label-path-${i}`;
      const currentStartOffset = "25%"; // Respecting user's previous adjustment
      let useSideRight = false;
      let rotate = 0;
      let textToDisplay = quadrant.name;

      if (quadrant.name === 'Self-Enhancement' || quadrant.name === 'Conservation') {
        useSideRight = true;
        rotate = 180
        textToDisplay = quadrant.name.split('').reverse().join('')

        textArcGenerator = d3.arc<any>()
        .innerRadius(radius + 10 + 61) 
        .outerRadius(radius + 10 + 61);

        if (quadrant.name === 'Self-Enhancement') {
          textToDisplay = 'tnemecnahnE-f\bleS'
        }
      }

      // Add invisible path for text (to shapes group)
      shapesGroup.append("path")
        .attr("id", textPathId)
        .attr("d", textArcGenerator({ startAngle: startRad, endAngle: endRad })) // Use original path direction
        .style("fill", "none")
        .style("stroke", "none"); 

      // Add the text (to text group)
      const textElement = textGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "400")
        .attr("fill", "#333333cc")
        .attr("rotate", rotate)
        .attr("display", "inline-block")
        .attr("pointer-events", "none")

      const tp = textElement.append("textPath")
        .attr("href", `#${textPathId}`)
        .attr("startOffset", currentStartOffset) // Use consistent offset
        .text(textToDisplay);

      if (useSideRight) {
        tp.attr("side", "right");
      }
    });
  };

  // Helper function to draw the axis labels (value names)
  const drawAxisValueLabels = (
    shapesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    axisLinesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    radius: number,
    sampleResults: ProcessedValueResult[], // Use any dataset for structure
    mapScoreToDisplay: (score: number) => number,
    valueConflicts: Record<string, ValueConflictInfo>, // Add conflict information
    tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>, // Tooltip element
    datasets: OverlayDataset[], // Pass datasets for conflict highlighting
    compact: boolean
  ) => {
    const valuePointsForLabels = sampleResults.map(result => {
      const valueDataConstant = VALUE_DATA[result.value as keyof typeof VALUE_DATA];
      if (!valueDataConstant) return null;
      const angleInRadians = (valueDataConstant.angle * Math.PI) / 180;

      // Determine if this value is typically positive or negative
      // This is a rough estimation based on the sample data
      const isPositive = result.centeredScore > 0;

      // Check if this value has a conflict
      const hasConflict = valueConflicts[result.value]?.hasConflict || false;

      return {
        angle: angleInRadians,
        name: valueDataConstant.name,
        value: result.value,
        isPositive,
        hasConflict
      };
    }).filter(d => d !== null) as Array<{ angle: number; name: string; value: string; isPositive: boolean; hasConflict: boolean }>;
    
    valuePointsForLabels.forEach(point => {
      // Larger label radius for 19 values (more spacing)
      let labelRadius = radius + 30;

      const posX = labelRadius * Math.cos(point.angle);
      const posY = labelRadius * Math.sin(point.angle);

      // Calculate end points for the radial axis line (going from center to beyond the outer circle)
      const lineEndX = (radius * 1) * Math.cos(point.angle);
      const lineEndY = (radius * 1) * Math.sin(point.angle);

      let textAnchor = "middle";
      let dominantBaseline = "middle";

      // Determine color based on positive/negative and conflict status
      let valueCodeColor;
      if (point.hasConflict) {
        valueCodeColor = CONFLICT_STROKE; // Use the conflict color for conflicting values
      } else {
        valueCodeColor = point.isPositive ? "#2a9d8f" : "#e76f51"; // Original colors for non-conflicting values
      }

      // Draw the radial axis line from center to beyond the circle edge
      // Now using the dedicated axisLinesGroup to ensure these appear on top of guide lines
      axisLinesGroup.append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", lineEndX)
        .attr("y2", lineEndY)
        .attr("stroke", valueCodeColor)
        .attr("stroke-width", 0.5) // Slightly thicker for better visibility
        .attr("stroke-opacity", 0.75) // Better opacity for visibility while not overwhelming
        .attr("stroke-dasharray", point.hasConflict ? "2,2" : "2,2"); // Dashed lines for conflicts

      // Value code with prefix indicating typical positive/negative for this value and tooltip functionality
      const valueCodeText = textGroup.append("text")
        .attr("x", posX)
        .attr("y", posY - 5)
        .attr("text-anchor", textAnchor)
        .attr("dominant-baseline", dominantBaseline)
        .attr("font-size", "11px")
        .attr("font-weight", "500")
        .attr("fill", valueCodeColor) // Use the determined color
        .style("cursor", "pointer") // Add pointer cursor to indicate it's interactive
        .text(point.value)
        .on("mouseover", function(event) {
          // Collect score data from all visible datasets for this value
          const scoresHTML = datasets.map(dataset => {
            const valueData = dataset.data.find(item => item.value === point.value);
            if (valueData) {
              const scoreText = valueData.centeredScore > 0 ? `+${valueData.centeredScore.toFixed(2)}` : valueData.centeredScore.toFixed(2);
              const color = valueData.centeredScore > 0 ? '#2a9d8f' : '#e76f51';
              return `<div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-top: 2px;">
                <span style="color: #555;">${dataset.label}</span>
                <span style="color: ${color}; font-weight: 600; font-family: monospace;">${scoreText}</span>
              </div>`;
            }
            return '';
          }).filter(html => html).join('');
          
          // Show tooltip with value information
          tooltip.html(`
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #333;">${point.name} (${point.value})</div>
            <div style="border-top: 1px solid #eee; padding-top: 4px;">
              ${scoresHTML}
            </div>
          `)
            .style("visibility", "visible")
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
          
          // Highlight the label
          d3.select(this)
            .style("font-weight", "700")
            .style("filter", "drop-shadow(0 0 2px rgba(0,0,0,0.3))");
        })
        .on("mousemove", function(event) {
          // Move tooltip with the mouse
          tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
          // Hide tooltip
          tooltip.style("visibility", "hidden");
          
          // Restore original label appearance
          d3.select(this)
            .style("font-weight", "500")
            .style("filter", "none");
        });

      // Split the value name on the dash and create multiple tspan elements
      // This properly handles multiline text in SVG
      const valueNameParts = point.name.includes('Self-Direction')
        ? ['Self-Direction', point.name.split('-')[1] || '']
        : point.name.split('-');

      // Starting position for the label text (value name)
      // Shift it down from the value code
      const baseY = posY + 0; // Add space between value code and name

      // Only draw value names when not in compact mode
      if (!compact) {
        const nameText = textGroup.append("text")
          .attr("x", posX)
          .attr("y", baseY)
          .attr("text-anchor", textAnchor)
          .attr("dominant-baseline", "hanging") // Align to top for consistent spacing
          .attr("font-size", "8px")
          .attr("fill", point.hasConflict ? CONFLICT_STROKE : "#666") // Change the name color for conflicts too
          .style("font-weight", point.hasConflict ? "600" : "normal") // Make conflict labels bolder
          .style("cursor", "pointer") // Add pointer cursor to indicate it's interactive
          .on("mouseover", function(event) {
            // Use the same tooltip functionality as the value code
            const scoresHTML = datasets.map(dataset => {
              const valueData = dataset.data.find(item => item.value === point.value);
              if (valueData) {
                const scoreText = valueData.centeredScore > 0 ? `+${valueData.centeredScore.toFixed(2)}` : valueData.centeredScore.toFixed(2);
                const color = valueData.centeredScore > 0 ? '#2a9d8f' : '#e76f51';
                return `<div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-top: 2px;">
                  <span style="color: #555;">${dataset.label}</span>
                  <span style="color: ${color}; font-weight: 600; font-family: monospace;">${scoreText}</span>
                </div>`;
              }
              return '';
            }).filter(html => html).join('');
            
            tooltip.html(`
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #333;">${point.name} (${point.value})</div>
              <div style="border-top: 1px solid #eee; padding-top: 4px;">
                ${scoresHTML}
              </div>
            `)
              .style("visibility", "visible")
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px");
            
            d3.select(this)
              .style("font-weight", "600")
              .style("filter", "drop-shadow(0 0 2px rgba(0,0,0,0.3))");
          })
          .on("mousemove", function(event) {
            tooltip
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px");
          })
          .on("mouseout", function() {
            tooltip.style("visibility", "hidden");
            d3.select(this)
              .style("font-weight", point.hasConflict ? "600" : "normal")
              .style("filter", "none");
          });

        // Add the actual text content for the value name
        if (valueNameParts.length === 1) {
          // Single line name
          nameText.text(point.name);
        } else {
          // Multi-line name (typically has a dash)
          valueNameParts.forEach((part, i) => {
            nameText.append("tspan")
              .attr("x", posX)
              .attr("dy", i === 0 ? 0 : "1em") // First line at position, others offset by 1em
              .text(part.trim());
          });
        }
      }

    });
  };

  const drawValueConnectionsAndPoints = (
    shapesGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    textGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    radius: number,
    results: ProcessedValueResult[],
    mapScoreToDisplay: (score: number) => number,
    maxDisplayScore: number,
    datasetColor: string,
    datasetLabel: string, // For tooltip context
    tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>, // Tooltip element
    valueConflicts: Record<string, ValueConflictInfo> = {} // Conflict information
  ) => {
    const valuePoints = results.map(result => {
      const valueDataConstant = VALUE_DATA[result.value as keyof typeof VALUE_DATA]
      if (!valueDataConstant) return null

      const angleInRadians = (valueDataConstant.angle * Math.PI) / 180
      const displayScore = mapScoreToDisplay(result.centeredScore);
      
      // Clamp extreme values to prevent visual artifacts
      const clampedDisplayScore = Math.max(0.1, Math.min(maxDisplayScore * 1.2, displayScore));
      const distance = radius * (clampedDisplayScore / maxDisplayScore)

      const x = distance * Math.cos(angleInRadians)
      const y = distance * Math.sin(angleInRadians)

      // Determine if this value is positive or negative
      const isPositive = result.centeredScore > 0;
      
      // Check if this value has a conflict across datasets
      const hasConflict = valueConflicts[result.value]?.hasConflict || false;

      return {
        value: result.value,
        name: valueDataConstant.name,
        score: result.centeredScore,
        rawValueInverted: result.rawValueInverted,
        displayScore: clampedDisplayScore,
        x,
        y,
        angle: angleInRadians,
        inherentColor: valueDataConstant.color,
        description: valueDataConstant.description,
        isPositive,
        hasConflict
      }
    }).filter(d => d !== null) as any[];

    valuePoints.sort((a, b) => {
      const valueDataA = VALUE_DATA[a.value as keyof typeof VALUE_DATA];
      const valueDataB = VALUE_DATA[b.value as keyof typeof VALUE_DATA];
      if (!valueDataA || !valueDataB) return 0;
      return valueDataA.angle - valueDataB.angle;
    });

    // Generate dataset ID for class names
    const datasetId = datasetLabel.toLowerCase().replace(/\s+/g, '-');

    // Function to calculate opacity based on score intensity
    const calculateOpacity = (score: number) => {
      // Scale from 0.3 to 0.8 based on score intensity
      const baseOpacity = 0.3;
      const maxOpacityBoost = 0.5;
      const scaledBoost = Math.min(Math.abs(score) / 3, 1) * maxOpacityBoost;
      return baseOpacity + scaledBoost;
    };

    // Sort all points by their angle to determine adjacent values
    const sortedPoints = [...valuePoints].sort((a, b) => a.angle - b.angle);
    
    // Create individual pizza slices for each value  
    valuePoints.forEach((point) => {
      // Find this point's position in the sorted list to get its neighbors
      const currentIndex = sortedPoints.findIndex(p => p.value === point.value);
      const prevPoint = sortedPoints[(currentIndex - 1 + sortedPoints.length) % sortedPoints.length];
      const nextPoint = sortedPoints[(currentIndex + 1) % sortedPoints.length];
      
      // Calculate midpoint to previous value
      let midpointToPrev;
      const prevAngle = prevPoint.angle + Math.PI/2;
      const currentAngle = point.angle + Math.PI/2;
      const nextAngle = nextPoint.angle + Math.PI/2;
      
      // Handle wraparound when calculating midpoint to previous
      if (Math.abs(prevAngle - currentAngle) > Math.PI) {
        // Wraparound case
        if (prevAngle > currentAngle) {
          midpointToPrev = (prevAngle + currentAngle + 2 * Math.PI) / 2;
          if (midpointToPrev >= 2 * Math.PI) midpointToPrev -= 2 * Math.PI;
        } else {
          midpointToPrev = (prevAngle + currentAngle - 2 * Math.PI) / 2;
          if (midpointToPrev < 0) midpointToPrev += 2 * Math.PI;
        }
      } else {
        midpointToPrev = (prevAngle + currentAngle) / 2;
      }
      
      // Calculate midpoint to next value
      let midpointToNext;
      if (Math.abs(currentAngle - nextAngle) > Math.PI) {
        // Wraparound case
        if (currentAngle > nextAngle) {
          midpointToNext = (currentAngle + nextAngle + 2 * Math.PI) / 2;
          if (midpointToNext >= 2 * Math.PI) midpointToNext -= 2 * Math.PI;
        } else {
          midpointToNext = (currentAngle + nextAngle - 2 * Math.PI) / 2;
          if (midpointToNext < 0) midpointToNext += 2 * Math.PI;
        }
      } else {
        midpointToNext = (currentAngle + nextAngle) / 2;
      }
      
      // Set arc boundaries
      let arcStartAngle = midpointToPrev;
      let arcEndAngle = midpointToNext;
      
      // Handle the case where the arc crosses the 0° boundary
      if (arcEndAngle < arcStartAngle) {
        arcEndAngle += 2 * Math.PI;
      }
      
      // Calculate the radius based on the score magnitude
      const arcRadius = radius * (point.displayScore / maxDisplayScore);
      
      // Calculate intensity-based opacity
      const opacity = calculateOpacity(point.score);
      
      // Determine fill color based on whether value is positive/negative
      const fillColor = point.hasConflict ? 
        d3.rgb(CONFLICT_COLOR).copy({ opacity })?.toString() :
        (point.isPositive ? 
          d3.rgb(POSITIVE_FILL).copy({ opacity })?.toString() : 
          d3.rgb(NEGATIVE_FILL).copy({ opacity })?.toString());

             // Create the arc data object
       const arcData = {
         startAngle: arcStartAngle,
         endAngle: arcEndAngle,
         innerRadius: 0,
         outerRadius: arcRadius
       };

       // Create the arc generator
       const arcGenerator = d3.arc();

       // Draw the pizza slice arc
       const arcElement = shapesGroup.append("path")
         .attr("d", arcGenerator(arcData))
         .attr("fill", fillColor)
        .attr("stroke", point.hasConflict ? CONFLICT_STROKE : "#ffffff")
        .attr("stroke-width", 0.5)
        .attr("class", `value-arc-${datasetId}`)
        .attr("data-value", point.value)
        .style("cursor", "pointer")
        .on("mouseover", function(event) {
          // Format the score with a + sign for positive values
          const scoreText = point.isPositive ? `+${point.score.toFixed(2)}` : point.score.toFixed(2);
          const color = point.isPositive ? '#2a9d8f' : '#e76f51';
          
          // Generate educational explanation for this specific value and score
          const detailsHTML = generateDetailsHTML(point, datasets, valueConflicts);
          
          // Format tooltip HTML with enhanced educational content
          tooltip.html(`
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div style="font-weight: 600; font-size: 14px; color: #333;">${point.name} (${point.value})</div>
              <span style="color: ${color}; font-weight: bold; font-size: 14px; margin-left: 8px; font-family: monospace;">${scoreText}</span>
            </div>
            ${detailsHTML}
          `)
            .style("visibility", "visible")
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
          
          // Highlight the current arc
          d3.select(this)
            .style("filter", "drop-shadow(0 0 4px rgba(0,0,0,0.3))")
            .attr("stroke-width", 1);
        })
        .on("mousemove", function(event) {
          // Move tooltip with the mouse
          tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
          // Hide tooltip
          tooltip.style("visibility", "hidden");
          
          // Restore original arc appearance
          d3.select(this)
            .style("filter", "none")
            .attr("stroke-width", 0.5);
        });

             // Draw a small indicator circle at the end of each arc to show the exact score position
       // Use the same angle system as the point (already converted)
       const indicatorX = arcRadius * Math.cos(point.angle);
       const indicatorY = arcRadius * Math.sin(point.angle);
      
      shapesGroup.append("circle")
        .attr("class", `value-point-circle-${datasetId}${point.hasConflict ? ' conflict' : ''}`)
        .attr("cx", indicatorX)
        .attr("cy", indicatorY)
        .attr("r", 2.5)
        .attr("fill", point.hasConflict ? CONFLICT_STROKE : (point.isPositive ? "#2a9d8f" : "#9ca3af"))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", function(event) {
          // Same tooltip as the arc
          const scoreText = point.isPositive ? `+${point.score.toFixed(2)}` : point.score.toFixed(2);
          const color = point.isPositive ? '#2a9d8f' : '#e76f51';
          const detailsHTML = generateDetailsHTML(point, datasets, valueConflicts);
          
          tooltip.html(`
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div style="font-weight: 600; font-size: 14px; color: #333;">${point.name} (${point.value})</div>
              <span style="color: ${color}; font-weight: bold; font-size: 14px; margin-left: 8px; font-family: monospace;">${scoreText}</span>
            </div>
            ${detailsHTML}
          `)
            .style("visibility", "visible")
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
          
          d3.select(this)
            .attr("r", 4)
            .style("filter", "drop-shadow(0 0 2px rgba(0,0,0,0.3))");
        })
        .on("mousemove", function(event) {
          tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
          tooltip.style("visibility", "hidden");
          d3.select(this)
            .attr("r", 2.5)
            .style("filter", "none");
        });
    });
  }

  return (
    <div className="flex flex-col items-center my-4">
      <svg
        ref={svgRef}
        className="border rounded bg-white"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      {showExplanation && (
        <div className="mt-3 text-xs text-gray-600 text-center max-w-md px-2">
          <div className="flex flex-wrap justify-center items-center my-2 gap-2 sm:gap-4">
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-[#2a9d8f] rounded-full mr-1"></span>
              <span className="text-[#2a9d8f] font-semibold">Positive values</span>
              <span className="ml-1 hidden sm:inline">(more important)</span>
            </div>
            <div className="flex items-center">
              <span className="inline-block w-3 h-3 bg-[#9ca3af] rounded-full mr-1"></span>
              <span className="text-[#9ca3af] font-semibold">Negative values</span>
              <span className="ml-1 hidden sm:inline">(less important)</span>
            </div>
            {datasets.length >= 2 && (
              <div className="flex items-center">
                <span className="inline-block w-3 h-3 bg-[rgba(147,51,234,0.85)] rounded-full mr-1"></span>
                <span className="text-[rgba(126,34,206,1)] font-semibold">Conflict</span>
                <span className="ml-1 hidden sm:inline">(pos/neg mismatch)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 