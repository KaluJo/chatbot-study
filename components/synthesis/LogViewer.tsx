'use client';

import React, { useEffect, useMemo, useRef, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface LogEntry {
  message: string;
  timestamp: Date;
  type: 'info' | 'error' | 'warning' | 'success';
}

interface LogViewerProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  className?: string; // Allow custom class for sizing
}

const LogViewer = React.memo(({ logs, onClearLogs, className }: LogViewerProps) => {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  
  // Auto-scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      startTransition(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });
    }
  }, [logs.length]); // Only depend on logs.length
  
  // Show only the last 200 logs to prevent performance issues
  const visibleLogs = useMemo(() => {
    return logs.slice(-200);
  }, [logs]);

  return (
    <div className={`border rounded-lg flex flex-col ${className || 'h-[60vh]'}`}>
      <div className="px-3 py-2 border-b bg-muted flex items-center justify-between">
        <h3 className="text-sm font-medium">Process Logs ({visibleLogs.length})</h3>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              if (logsEndRef.current) {
                logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="h-7 px-2"
          >
            Scroll to Bottom
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearLogs}
            className="h-7 px-2"
          >
            Clear
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-2 pb-6">
        <div className="space-y-1 font-mono text-xs">
          {visibleLogs.map((log, i) => (
            <div 
              key={`${i}-${log.timestamp.getTime()}`}
              className={`py-1 px-2 rounded ${
                log.type === 'error' ? 'text-red-500 bg-red-50 dark:bg-red-950 dark:bg-opacity-50' :
                log.type === 'warning' ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:bg-opacity-50' :
                log.type === 'success' ? 'text-green-600 bg-green-50 dark:bg-green-950 dark:bg-opacity-50' :
                'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="opacity-50 mr-1">[{log.timestamp.toLocaleTimeString()}]</span>
              {log.message}
            </div>
          ))}
          <div ref={logsEndRef} className="h-4" />
        </div>
      </ScrollArea>
    </div>
  );
});

LogViewer.displayName = 'LogViewer';

export default LogViewer; 