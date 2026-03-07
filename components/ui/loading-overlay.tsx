'use client';

import React from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  progress?: number;
  subMessage?: string;
}

/**
 * A loading overlay with blur effect and spinner.
 * Use this when waiting for long-running operations like AI generation.
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  isLoading, 
  message = 'Loading...',
  progress,
  subMessage
}) => {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      {/* Backdrop with blur */}
      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border border-gray-200 max-w-sm mx-4">
        {/* Spinner */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-gray-200 rounded-full" />
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 rounded-full border-t-transparent animate-spin" />
        </div>
        
        {/* Message */}
        <div className="text-center">
          <p className="text-lg font-medium text-gray-800">{message}</p>
          {subMessage && (
            <p className="text-sm text-gray-500 mt-1">{subMessage}</p>
          )}
        </div>
        
        {/* Progress bar (optional) */}
        {progress !== undefined && (
          <div className="w-full">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center mt-1">
              {Math.round(progress)}% complete
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;
