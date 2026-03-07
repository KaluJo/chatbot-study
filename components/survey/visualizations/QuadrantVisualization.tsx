'use client'

import { VALUE_DATA, QUADRANTS, ProcessedValueResult, calculateQuadrantAverageCenteredScores } from '../value-utils'

interface QuadrantVisualizationProps {
  results: ProcessedValueResult[]
}

export const QuadrantVisualization = ({ results }: QuadrantVisualizationProps) => {
  // Results are already processed and contain centeredScore and rawValueInverted
  
  // Calculate quadrant averages using centered scores
  const quadrantAverageCenteredScores = calculateQuadrantAverageCenteredScores(results)
  
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold">Values by Higher-Order Categories (PVQ-RR)</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(QUADRANTS).map(([quadrant, values]) => {
          const quadrantValues = values.map(code => {
            const result = results.find(r => r.value === code) // Use results directly
            return {
              code,
              ...VALUE_DATA[code as keyof typeof VALUE_DATA],
              centeredScore: result?.centeredScore ?? 0,
              rawValueInverted: result?.rawValueInverted ?? 0,
            }
          }).sort((a, b) => b.centeredScore - a.centeredScore) // Sort by centeredScore descending
          
          const averageCenteredScore = quadrantAverageCenteredScores[quadrant]
          const maxRawInvertedScore = 6 // For progress bar based on 1-6 raw inverted scale
          
          return (
            <div key={quadrant} className="p-4 border rounded-lg">
              <h4 className="font-bold text-md mb-2 flex justify-between">
                <span>{quadrant}</span>
                <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                  Avg (Centered): {averageCenteredScore.toFixed(1)}
                </span>
              </h4>
              <div className="space-y-3">
                {quadrantValues.map(value => (
                  <div key={value.code} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <div 
                          className="w-3 h-3 rounded-full mr-1 flex-shrink-0" 
                          style={{ backgroundColor: value.color }}
                        />
                        <span className="font-medium text-sm">{value.name}</span>
                        <span className="text-xs text-gray-500">({value.code})</span>
                      </div>
                      <span className="text-xs font-bold whitespace-nowrap">
                        {value.centeredScore.toFixed(1)} (Cent.) / {value.rawValueInverted.toFixed(1)} (Raw)
                      </span>
                    </div>
                    <div className="relative pt-1">
                      <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-200">
                        <div 
                          style={{ 
                            width: `${(value.rawValueInverted / maxRawInvertedScore) * 100}%`,
                            backgroundColor: value.color
                          }} 
                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{value.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="mt-8 p-4 border rounded-lg">
        <h3 className="text-lg font-bold mb-4">Understanding the PVQ-RR Scale & Centered Scores</h3>
        <p className="text-sm text-gray-600 mb-3">
          The Portrait Values Questionnaire - Revised (PVQ-RR) uses a 6-point scale:
        </p>
        <ul className="text-sm space-y-1 list-disc pl-5">
          <li>6 = Very much like me (highest importance)</li>
          <li>5 = Like me</li>
          <li>4 = Somewhat like me</li>
          <li>3 = A little like me</li>
          <li>2 = Not like me</li>
          <li>1 = Not like me at all (lowest importance)</li>
        </ul>
        <p className="text-sm text-gray-600 mt-3">
          The scale is already oriented correctly (<strong>Raw Score</strong>) with 6 = highest importance and 1 = lowest importance. 
          The progress bars above reflect this 1-6 raw importance.
        </p>
        <p className="text-sm text-gray-600 mt-3">
          To account for individual differences in using the response scale, we then calculate <strong>Centered Scores</strong>. 
          Each value's centered score is its raw inverted importance minus your average importance rating across all 57 questions (MRAT). 
          A positive centered score means that value is more important to you than your personal average; a negative score means it's less important. 
        </p>
        <p className="text-sm text-gray-600 mt-3">
          <strong>Note on Humility and Face:</strong> According to the PVQ-RR scoring guide, Humility and Face are on the borders between higher-order value categories. 
          Their placement may vary between samples, and they are often treated separately in analyses.
        </p>
      </div>
    </div>
  )
} 