'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CircularVisualization, OverlayDataset } from './visualizations/CircularVisualization'
import { BarVisualization } from './visualizations/BarVisualization'
import { QuadrantVisualization } from './visualizations/QuadrantVisualization'
import { processValueResults, ValueResult, ProcessedValueResult } from './value-utils'

interface ValueVisualizationProps {
  results: ProcessedValueResult[]
  datasetLabel?: string;
  datasetColor?: string;
}

export const ValueVisualization = ({ 
  results, 
  datasetLabel = "Current Data", 
  datasetColor = 'rgba(70, 130, 180, 0.7)'
}: ValueVisualizationProps) => {
  const [activeTab, setActiveTab] = useState<'circular' | 'bar' | 'quadrant'>('circular')
  
  const circularOverlayDatasets: OverlayDataset[] = [
    {
      id: 'single-dataset',
      label: datasetLabel,
      data: results,
      color: datasetColor,
      isVisible: true
    }
  ];
  
  return (
    <Card className="p-4 md:p-6 max-w-5xl mx-auto min-h-[500px]">
      {/* <div className="mb-4">
        <h2 className="text-xl md:text-2xl font-bold mb-2">Detailed Values Profile</h2>
      </div> */}
      
      <Tabs defaultValue={activeTab} onValueChange={(value: string) => setActiveTab(value as 'circular' | 'bar' | 'quadrant')} className="w-full">
        {/* <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="circular">Circular View</TabsTrigger>
          <TabsTrigger value="bar">Bar Chart</TabsTrigger>
          <TabsTrigger value="quadrant">By Category</TabsTrigger>
        </TabsList> */}
        
        <TabsContent value="circular">
          <div className="mb-3 text-xs md:text-sm text-gray-600">
            {/* <p>
              This circular visualization shows the selected value profile. 
              The farther a value extends from the center, the more important it is (relative to the person's average response).
            </p> */}
            {/* <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <h4 className="font-semibold mb-1 text-gray-800">Reading the Visualization:</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>The <strong>prominent circle</strong> marks the <strong>zero reference line</strong></li>
                <li>Values outside this line (<span className="text-[#2a9d8f] font-semibold">positive scores</span>) are <em>more important</em> than your average</li>
                <li>Values inside this line (<span className="text-[#e76f51] font-semibold">negative scores</span>) are <em>less important</em> than your average</li>
                <li>The radial guide lines help track values back to their labels</li>
              </ul>
            </div> */}
          </div>
          <CircularVisualization datasets={circularOverlayDatasets} />
        </TabsContent>
        
        <TabsContent value="bar">
          <div className="mb-3 text-xs md:text-sm text-gray-600">
            <p>
              The bar chart displays value importance, grouped by higher-order categories. 
              Taller bars (or bars further from zero) indicate greater relative importance.
            </p>
          </div>
          <BarVisualization results={results} />
        </TabsContent>
        
        <TabsContent value="quadrant">
          <div className="mb-3 text-xs md:text-sm text-gray-600">
            <p>
              This view organizes values by Schwartz's higher-order categories, highlighting broad motivational goals.
            </p>
          </div>
          <QuadrantVisualization results={results} />
        </TabsContent>
      </Tabs>
    </Card>
  )
} 