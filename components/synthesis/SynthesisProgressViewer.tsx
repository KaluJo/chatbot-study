'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, XCircle, FileText, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import LogViewer, { LogEntry } from './LogViewer';
import { Topic, ValueNode, Item, ReasoningResult, ItemProcessingResult } from '@/app/synthesis/services/types';

// Progress tracking interface for value graph synthesis
export interface SynthesisProgressData {
  stage: 'idle' | 'processing' | 'complete' | 'error';
  topics?: {
    narrowed: string[];
    created: Topic[];
    updated: Topic[];
    discarded: string[];
  };
  reasoning?: ReasoningResult[];
  nodes?: {
    created: ValueNode[];
    updated: ValueNode[];
  };
  items?: {
    created: Item[];
    updated: Item[];
    extracted: ItemProcessingResult[];
  };
  error?: string;
  // Batch processing information
  batchProgress?: {
    current: number;
    total: number;
    completedWindows: string[];
    failedWindows: { id: string; error: string }[];
    isBatchOperation: boolean;
    operationType: 'analysis' | 'synthesis';
  };
  // Super batch processing information (all sessions)
  superBatchProgress?: {
    currentSession: number;
    totalSessions: number;
    currentSessionId: string;
    currentOperation: 'starting' | 'loading_windows' | 'analyzing' | 'synthesizing' | 'completed';
    completedSessions: string[];
    failedSessions: { id: string; error: string }[];
    sessionProgress: {
      analyzing: number;
      synthesizing: number;
      totalWindows: number;
    };
  };
}

interface SynthesisProgressViewerProps {
  progressData: SynthesisProgressData;
  logs: LogEntry[];
  showProgressModal: boolean;
  setShowProgressModal: (show: boolean) => void;
  onClearLogs: () => void;
}

// Helper for consistent card styling
const InfoCard: React.FC<{ title: string; count: number; badgeClass?: string; icon?: React.ElementType }> = ({ title, count, badgeClass = 'bg-gray-600', icon: Icon }) => (
  <Card className="">
    <CardHeader className="p-3">
      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
        {Icon && <Icon className="h-4 w-4 mr-2" />} 
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="p-3 pt-0">
      <p className={`text-2xl font-bold ${count > 0 ? 'text-primary' : ''}`}>{count}</p>
    </CardContent>
  </Card>
);

const SynthesisProgressViewer = React.memo(({ 
  progressData,
  logs,
  showProgressModal,
  setShowProgressModal,
  onClearLogs
}: SynthesisProgressViewerProps) => {

  // Prevent closing on overlay click by managing the open state internally for this specific interaction.
  // However, shadcn/ui's Dialog will still call onOpenChange(false) for Escape key.
  // The most straightforward way is to rely on the user to use the 'X' button.
  // If absolutely no overlay click close is desired, one might need to use a custom event handler on DialogOverlay if accessible or manage open state more granularly.
  // For now, we ensure the 'X' button is clear.

  // Display batch operation title if it's a batch operation
  const isBatchOperation = progressData.batchProgress?.isBatchOperation;
  const isSuperBatchOperation = progressData.superBatchProgress;
  const batchProgressDisplay = progressData.batchProgress?.current && progressData.batchProgress?.total ? 
    `${progressData.batchProgress.current}/${progressData.batchProgress.total}` : '';
  const superBatchProgressDisplay = progressData.superBatchProgress?.currentSession && progressData.superBatchProgress?.totalSessions ? 
    `${progressData.superBatchProgress.currentSession}/${progressData.superBatchProgress.totalSessions}` : '';
  const operationType = progressData.batchProgress?.operationType === 'analysis' ? 'Analysis' : 'Synthesis';

  return (
    <Dialog open={showProgressModal} onOpenChange={(isOpen) => {
      // This allows closing via Escape key or explicit close button, 
      // but direct overlay click is implicitly handled by Radix (usually closes).
      // To strictly prevent overlay click close, more complex handling of Radix primitives would be needed.
      // For now, assume default behavior is acceptable if X is clear.
      if (!isOpen) {
        setShowProgressModal(false); // Allow closing if Radix determines it (e.g. Escape)
      }
    }}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col p-0 sm:p-6">
        <DialogHeader className="p-4 sm:p-0 border-b sm:border-b-0">
          <DialogTitle className="text-lg sm:text-xl">
            {progressData.stage === 'processing' && (isSuperBatchOperation ? 
              `Super Batch Processing All Sessions ${superBatchProgressDisplay}` : 
              isBatchOperation ? 
                `Batch ${operationType} in Progress ${batchProgressDisplay}` : 
                "Synthesizing Value Graph...")}
            {progressData.stage === 'complete' && (isSuperBatchOperation ? 
              `Super Batch Processing Complete` : 
              isBatchOperation ? 
                `Batch ${operationType} Complete` : 
                "Synthesis Complete")}
            {progressData.stage === 'error' && (isSuperBatchOperation ? 
              `Super Batch Processing Error` : 
              isBatchOperation ? 
                `Batch ${operationType} Error` : 
                "Synthesis Error")}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {progressData.stage === 'processing' && (isSuperBatchOperation ? 
              `Processing ${progressData.superBatchProgress?.totalSessions} sessions - currently on session ${progressData.superBatchProgress?.currentSession}. ${progressData.superBatchProgress?.currentOperation} in progress.` : 
              isBatchOperation ? 
                `Processing ${progressData.batchProgress?.total} windows - currently on window ${progressData.batchProgress?.current}.` : 
                "Processing chat window data into value graph entities.")}
            {progressData.stage === 'complete' && (isSuperBatchOperation ? 
              `Successfully processed ${progressData.superBatchProgress?.completedSessions.length} sessions, ${progressData.superBatchProgress?.failedSessions.length || 0} failed.` : 
              isBatchOperation ? 
                `Successfully processed ${progressData.batchProgress?.completedWindows.length} windows, ${progressData.batchProgress?.failedWindows.length || 0} failed.` : 
                "Successfully processed window into value graph entities.")}
            {progressData.stage === 'error' && "An error occurred during synthesis. See logs for details."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 flex-grow overflow-hidden p-4 sm:p-0">
          {/* Results Panel */} 
          <ScrollArea className="md:h-[calc(80vh-120px)] h-[50vh] pr-2 sm:pr-3">
            <div className="space-y-4">
              {/* Super Batch Progress Display */}
              {isSuperBatchOperation && progressData.superBatchProgress && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base font-semibold">
                      Super Batch Progress - All Sessions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                      <div 
                        className="bg-primary h-2.5 rounded-full" 
                        style={{ 
                          width: `${progressData.superBatchProgress.totalSessions ? 
                          (progressData.superBatchProgress.currentSession / progressData.superBatchProgress.totalSessions) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                    
                    <p className="text-sm">
                      <span className="font-medium">{progressData.superBatchProgress.currentSession}</span> of {progressData.superBatchProgress.totalSessions} sessions
                    </p>
                    
                    {progressData.superBatchProgress.currentSessionId && (
                      <p className="text-xs text-muted-foreground">
                        Current: {progressData.superBatchProgress.currentSessionId.substring(0, 8)}... | 
                        {progressData.superBatchProgress.currentOperation === 'starting' && (
                          <>🚀 Starting session...</>
                        )}
                        {progressData.superBatchProgress.currentOperation === 'loading_windows' && (
                          <>📄 Loading windows...</>
                        )}
                        {progressData.superBatchProgress.currentOperation === 'analyzing' && (
                          <>🔍 Analyzing: {progressData.superBatchProgress.sessionProgress.analyzing}/{progressData.superBatchProgress.sessionProgress.totalWindows}</>
                        )}
                        {progressData.superBatchProgress.currentOperation === 'synthesizing' && (
                          <>⚙️ Synthesizing: {progressData.superBatchProgress.sessionProgress.synthesizing}/{progressData.superBatchProgress.sessionProgress.totalWindows}</>
                        )}
                        {progressData.superBatchProgress.currentOperation === 'completed' && (
                          <>✅ Session completed</>
                        )}
                      </p>
                    )}
                    
                    {/* Show completed and failed sessions */}
                    {progressData.superBatchProgress.completedSessions.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Completed Sessions:</h4>
                        <div className="text-xs text-muted-foreground pl-2 flex gap-1 flex-wrap">
                          {progressData.superBatchProgress.completedSessions.map((sessionId, idx) => (
                            <Badge key={sessionId} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {sessionId.substring(0, 8)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {progressData.superBatchProgress.failedSessions && progressData.superBatchProgress.failedSessions.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Failed Sessions:</h4>
                        <div className="text-xs text-muted-foreground pl-2">
                          {progressData.superBatchProgress.failedSessions.map((failure, idx) => (
                            <div key={failure.id} className="flex items-center gap-1 mb-1">
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                {failure.id.substring(0, 8)}
                              </Badge>
                              <span className="truncate">{failure.error}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Batch Progress Display */}
              {isBatchOperation && progressData.batchProgress && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base font-semibold">
                      Batch {operationType} Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
                      <div 
                        className="bg-primary h-2.5 rounded-full" 
                        style={{ 
                          width: `${progressData.batchProgress.total ? 
                          (progressData.batchProgress.current / progressData.batchProgress.total) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                    
                    <p className="text-sm">
                      <span className="font-medium">{progressData.batchProgress.current}</span> of {progressData.batchProgress.total} windows processing
                    </p>
                    
                    {/* Show completed and failed windows */}
                    {progressData.batchProgress.completedWindows.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Completed Windows:</h4>
                        <div className="text-xs text-muted-foreground pl-2 flex gap-1 flex-wrap">
                          {progressData.batchProgress.completedWindows.map((windowId, idx) => (
                            <Badge key={windowId} variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              {windowId.substring(0, 8)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {progressData.batchProgress.failedWindows && progressData.batchProgress.failedWindows.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Failed Windows:</h4>
                        <div className="text-xs text-muted-foreground pl-2">
                          {progressData.batchProgress.failedWindows.map((failure, idx) => (
                            <div key={failure.id} className="flex items-center gap-1 mb-1">
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                {failure.id.substring(0, 8)}
                              </Badge>
                              <span className="truncate">{failure.error}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {progressData.stage === 'processing' && !logs.some(l => l.message.includes('Starting value graph synthesis')) && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-primary mb-3 sm:mb-4" />
                  <p className="text-sm sm:text-base text-muted-foreground">
                    {isBatchOperation ? `Preparing for batch ${operationType.toLowerCase()}...` : 'Preparing for synthesis...'}
                  </p>
                </div>
              )}
              
              {progressData.stage === 'error' && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-destructive mb-3 sm:mb-4" />
                  <p className="text-base sm:text-lg text-destructive font-semibold mb-2">
                    {progressData.error?.includes('Cannot generate value graph:') 
                      ? 'Graph Generation Not Possible' 
                      : 'Error Occurred During Synthesis'}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                    {progressData.error || 'Unknown error. Check logs for more details.'}
                  </p>
                  {/* Suggestions can be kept or simplified further */}
                </div>
              )}
              
              {progressData.stage === 'complete' && progressData.topics && progressData.reasoning && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-base font-semibold flex items-center"><ListChecks className="h-5 w-5 mr-2 text-primary"/>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 pb-4">
                      <InfoCard title="Topics Created" count={progressData.topics.created.length} icon={FileText} />
                      <InfoCard title="Topics Updated" count={progressData.topics.updated.length} icon={FileText} />
                      <InfoCard title="Reasoning Pairs" count={progressData.reasoning.length} icon={FileText} />
                      <InfoCard title="Nodes Created" count={progressData.nodes?.created.length || 0} icon={FileText} />
                      <InfoCard title="Nodes Updated" count={progressData.nodes?.updated.length || 0} icon={FileText} />
                      <InfoCard title="Items Created/Updated" count={(progressData.items?.created.length || 0) + (progressData.items?.updated.length || 0)} icon={FileText} />
                    </CardContent>
                  </Card>

                  {/* Detailed Sections (can be collapsed by default if too long) */}
                  {/* Topics Section (simplified) */}
                  {(progressData.topics.created.length > 0 || progressData.topics.updated.length > 0 || progressData.topics.discarded.length > 0) && (
                    <Card>
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-base font-semibold">Topic Processing</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2 text-xs">
                        {progressData.topics.created.length > 0 && <p>New: {progressData.topics.created.map(t => t.label).join(', ')}</p>}
                        {progressData.topics.updated.length > 0 && <p>Merged/Updated: {progressData.topics.updated.map(t => t.label).join(', ')}</p>}
                        {progressData.topics.discarded.length > 0 && <p className="text-destructive">Discarded: {progressData.topics.discarded.join(', ')}</p>}
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Reasoning Section (summary) */}
                  {progressData.reasoning.length > 0 && (
                    <Card>
                       <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-base font-semibold">Key Topic-Context Insights</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2 text-xs max-h-40 overflow-y-auto">
                        {progressData.reasoning.slice(0, 5).map((result, idx) => (
                          <div key={idx} className="border-b pb-1 mb-1">
                            <p className="font-medium">{result.topic} → {result.context}: <span className={result.sentiment_score > 0 ? 'text-green-600' : result.sentiment_score < 0 ? 'text-red-600' : ''}>{result.sentiment} ({result.sentiment_score})</span></p>
                            <p className="text-muted-foreground truncate">{result.reasoning}</p>
                          </div>
                        ))}
                        {progressData.reasoning.length > 5 && <p className="text-center text-muted-foreground text-xs">...and {progressData.reasoning.length - 5} more.</p>}
                      </CardContent>
                    </Card>
                  )}

                  {/* Items Section (summary) */}
                  {progressData.items && progressData.items.extracted.length > 0 && (
                     <Card>
                       <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-base font-semibold">Extracted Items</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-1 text-xs max-h-40 overflow-y-auto">
                        {progressData.items.extracted.slice(0,10).map((item, idx) => (
                            <p key={item.item_id || idx} className="truncate">{item.name} (Conf: {(item.confidence * 100).toFixed(0)}%)</p>
                        ))}
                        {progressData.items.extracted.length > 10 && <p className="text-center text-muted-foreground text-xs">...and {progressData.items.extracted.length - 10} more.</p>}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
          
          <LogViewer logs={logs} onClearLogs={onClearLogs} className="md:h-[calc(80vh-120px)] h-[calc(40vh - 60px)]" />
        </div>
      </DialogContent>
    </Dialog>
  );
});

SynthesisProgressViewer.displayName = 'SynthesisProgressViewer';
export default SynthesisProgressViewer; 