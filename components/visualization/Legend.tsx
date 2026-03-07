'use client'

import React from 'react';

const Legend: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 p-0 bg-white rounded-lg">
      {/* Sentiment Score Legend with Linear Gradient */}
      <div className="flex items-center gap-2">
        <div className="pt-2.5 flex items-center gap-1">
          {/* Gradient Bar */}
          <div className="relative">
            <div 
              className="w-32 h-4 rounded-full border border-gray-300"
              style={{
                background: 'linear-gradient(to right, #b91c1c 0%, #ef4444 20%, #fca5a5 40%, #d1d5db 50%, #86efac 60%, #22c55e 80%, #15803d 100%)'
              }}
            />
            {/* Scale markers */}
            <div className="flex justify-between w-32 mt-0.1 text-gray-600" style={{ fontSize: '7pt' }}>
              <span>-7</span>
              <span>0</span>
              <span>+7</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300"></div>
      
      {/* Node Types Legend */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 bg-gray-200 rounded-full border border-gray-400"></span>
          <span className="text-xs font-medium">Context</span>
        </div>
        <div className="flex items-center gap-1">
          <span 
            className="inline-block w-4 h-4 rounded border border-gray-300"
            style={{
              background: 'linear-gradient(to right, #ef4444, #22c55e)'
            }}
          ></span>
          <span className="text-xs font-medium">Topic</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 bg-blue-50 rounded border border-blue-200"></span>
          <span className="text-xs font-medium">Value Item</span>
        </div>
      </div>
    </div>
  );
};

export { Legend }; 